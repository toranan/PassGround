import { NextResponse } from "next/server";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getBearerToken, getUserByAccessToken } from "@/lib/authServer";

let postStatsAvailable: boolean | null = null;
const LIKE_REWARD_POINTS = 10;
const LIKE_REWARD_SOURCE = "좋아요 보상";
const LIKE_REWARD_EVENT = "reward-post-like";

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

async function resolveProfileIdByDisplayName(
  admin: ReturnType<typeof getSupabaseAdmin>,
  displayName: string | null
): Promise<string | null> {
  const normalized = (displayName ?? "").trim();
  if (!normalized || normalized === "익명") return null;
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("display_name", normalized)
    .limit(2);
  if (!data || data.length !== 1) return null;
  const candidate = data[0] as { id?: string };
  return typeof candidate.id === "string" ? candidate.id : null;
}

async function awardLikeReward(params: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  postId: string;
  likerUserId: string;
  postAuthorId: string | null;
  postAuthorName: string;
}) {
  const { admin, postId, likerUserId, postAuthorId, postAuthorName } = params;

  let receiverProfileId = postAuthorId;
  if (!receiverProfileId) {
    receiverProfileId = await resolveProfileIdByDisplayName(admin, postAuthorName);
  }
  if (!receiverProfileId) return;
  if (receiverProfileId === likerUserId) return;

  const rewardMeta = {
    event: LIKE_REWARD_EVENT,
    postId,
    likedBy: likerUserId,
  };

  const { data: existingReward, error: lookupError } = await admin
    .from("point_ledger")
    .select("id")
    .eq("profile_id", receiverProfileId)
    .eq("source", LIKE_REWARD_SOURCE)
    .contains("meta", rewardMeta)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (!lookupError && existingReward?.id) {
    return;
  }

  const { error: ledgerError } = await admin.from("point_ledger").insert({
    profile_id: receiverProfileId,
    receiver_name: postAuthorName || "익명",
    source: LIKE_REWARD_SOURCE,
    amount: LIKE_REWARD_POINTS,
    meta: rewardMeta,
  });

  if (ledgerError) {
    return;
  }

  const { error: updateError } = await admin.rpc("increment_profile_points", {
    target_profile_id: receiverProfileId,
    points_delta: LIKE_REWARD_POINTS,
  });

  if (updateError) {
    const { data: currentProfile } = await admin
      .from("profiles")
      .select("points")
      .eq("id", receiverProfileId)
      .maybeSingle<{ points: number | null }>();

    await admin
      .from("profiles")
      .update({ points: (currentProfile?.points ?? 0) + LIKE_REWARD_POINTS })
      .eq("id", receiverProfileId);
  }
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
  const requestedUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  const desiredLiked = typeof body.desiredLiked === "boolean" ? body.desiredLiked : null;

  if (!isValidUUID(postId)) {
    return NextResponse.json({ error: "게시글 정보가 올바르지 않습니다." }, { status: 400 });
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "로그인 후 이용할 수 있습니다." }, { status: 401 });
  }
  const authed = await getUserByAccessToken(accessToken);
  if (!authed?.id) {
    return NextResponse.json({ error: "인증이 만료되었습니다. 다시 로그인해 주세요." }, { status: 401 });
  }
  if (requestedUserId && isValidUUID(requestedUserId) && requestedUserId !== authed.id) {
    return NextResponse.json({ error: "본인 계정만 사용할 수 있습니다." }, { status: 403 });
  }
  const userId = authed.id;

  const admin = getSupabaseAdmin();

  const { data: postData, error: postError } = await admin
    .from("posts")
    .select("id,board_id,author_id,author_name")
    .eq("id", postId)
    .maybeSingle<{ id: string; board_id: string | null; author_id: string | null; author_name: string | null }>();

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
      if (!error) {
        await awardLikeReward({
          admin,
          postId,
          likerUserId: userId,
          postAuthorId: postData.author_id ?? null,
          postAuthorName: (postData.author_name ?? "익명").trim() || "익명",
        });
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

  await awardLikeReward({
    admin,
    postId,
    likerUserId: userId,
    postAuthorId: postData.author_id ?? null,
    postAuthorName: (postData.author_name ?? "익명").trim() || "익명",
  });

  const likeCount = await getLikeCount(admin, postId);
  return NextResponse.json({ ok: true, liked: true, likeCount: likeCount || 1 });
}
