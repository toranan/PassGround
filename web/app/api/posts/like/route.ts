import { NextResponse } from "next/server";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const postId = typeof body.postId === "string" ? body.postId.trim() : "";
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";

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

    return NextResponse.json({ ok: true, liked: false });
  }

  const { error } = await admin.from("post_likes").insert({
    post_id: postId,
    user_id: userId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, liked: true });
}
