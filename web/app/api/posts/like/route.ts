import { NextResponse } from "next/server";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

let postStatsAvailable: boolean | null = null;

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isDuplicateLikeConflict(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return (error.message ?? "").toLowerCase().includes("duplicate key value");
}

function isMissingRelation(error: { code?: string | null; message?: string | null } | null, relation: string): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes(`relation "${relation.toLowerCase()}" does not exist`);
}

async function getLikeCount(admin: ReturnType<typeof getSupabaseAdmin>, postId: string): Promise<number> {
  if (postStatsAvailable !== false) {
    const { data: statsRow, error: statsError } = await admin
      .from("post_stats")
      .select("like_count")
      .eq("post_id", postId)
      .maybeSingle<{ like_count: number | null }>();

    if (!statsError && statsRow) {
      postStatsAvailable = true;
      return Math.max(0, statsRow.like_count ?? 0);
    }

    if (isMissingRelation(statsError, "post_stats")) {
      postStatsAvailable = false;
    }
  }

  const { count } = await admin
    .from("post_likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", postId);
  return count ?? 0;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const postId = typeof body.postId === "string" ? body.postId.trim() : "";
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const desiredLiked = typeof body.desiredLiked === "boolean" ? body.desiredLiked : null;

  if (!isValidUUID(postId)) {
    return NextResponse.json({ error: "게시글 정보가 올바르지 않습니다." }, { status: 400 });
  }

  if (!isValidUUID(userId)) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  const { data: postData, error: postError } = await admin
    .from("posts")
    .select("id,board_id")
    .eq("id", postId)
    .maybeSingle<{ id: string; board_id: string | null }>();

  if (postError || !postData?.id || !postData.board_id) {
    return NextResponse.json({ error: "게시글 정보를 확인할 수 없습니다." }, { status: 404 });
  }

  const { data: boardData } = await admin
    .from("boards")
    .select("exams!inner(slug)")
    .eq("id", postData.board_id)
    .maybeSingle<{ exams: { slug: string } | { slug: string }[] | null }>();

  const examInfo = boardData?.exams;
  const examSlug = Array.isArray(examInfo) ? examInfo[0]?.slug : examInfo?.slug;

  if (examSlug === "cpa" && !ENABLE_CPA) {
    return NextResponse.json({ error: "현재 CPA 서비스는 비활성화 상태입니다." }, { status: 403 });
  }

  if (examSlug === "cpa" && !ENABLE_CPA_WRITE) {
    return NextResponse.json(
      { error: "현재 CPA는 읽기 전용입니다. 좋아요 기능은 편입에서 이용해 주세요." },
      { status: 403 }
    );
  }

  // Idempotent mode: apply explicit target state if provided.
  if (desiredLiked !== null) {
    if (desiredLiked) {
      const { error } = await admin.from("post_likes").insert({
        post_id: postId,
        user_id: userId,
      });

      if (error && !isDuplicateLikeConflict(error)) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      const likeCount = await getLikeCount(admin, postId);
      return NextResponse.json({ ok: true, liked: true, likeCount: likeCount || 1 });
    }

    const { error } = await admin
      .from("post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, liked: false, likeCount: await getLikeCount(admin, postId) });
  }

  // Backward-compatible toggle mode.
  const { data: existing } = await admin
    .from("post_likes")
    .select("post_id,user_id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, liked: false, likeCount: await getLikeCount(admin, postId) });
  }

  const { error } = await admin.from("post_likes").insert({
    post_id: postId,
    user_id: userId,
  });

  if (error) {
    if (isDuplicateLikeConflict(error)) {
      // Concurrent like requests can race on UNIQUE/PK; treat as already-liked success.
      const likeCount = await getLikeCount(admin, postId);
      return NextResponse.json({ ok: true, liked: true, likeCount: likeCount || 1 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const likeCount = await getLikeCount(admin, postId);
  return NextResponse.json({ ok: true, liked: true, likeCount: likeCount || 1 });
}
