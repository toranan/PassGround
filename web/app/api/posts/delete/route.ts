import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getBearerToken, getUserByAccessToken, isAdminUser } from "@/lib/authServer";

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function isMissingRelation(error: { code?: string | null; message?: string | null } | null, relation: string): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes(`relation "${relation.toLowerCase()}" does not exist`);
}

async function resolveProfileIdByDisplayName(admin: ReturnType<typeof getSupabaseAdmin>, displayName: string): Promise<string | null> {
  const normalized = displayName.trim();
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

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const postId = typeof body.postId === "string" ? body.postId.trim() : "";
  const requestUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  const bodyAccessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";

  if (!postId || !isValidUUID(postId)) {
    return NextResponse.json({ error: "삭제할 게시글 id가 필요합니다." }, { status: 400 });
  }
  if (!requestUserId || !isValidUUID(requestUserId)) {
    return NextResponse.json({ error: "유효한 사용자 정보가 필요합니다." }, { status: 400 });
  }

  const accessToken = getBearerToken(request) || bodyAccessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const authed = await getUserByAccessToken(accessToken);
  if (!authed?.id) {
    return NextResponse.json({ error: "인증이 만료되었습니다. 다시 로그인해 주세요." }, { status: 401 });
  }
  if (authed.id !== requestUserId) {
    return NextResponse.json({ error: "본인 계정만 사용할 수 있습니다." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const allowAdmin = await isAdminUser(authed.id, authed.email);

  const { data: postRow, error: postError } = await admin
    .from("posts")
    .select("id,author_id,author_name")
    .eq("id", postId)
    .maybeSingle<{
      id: string;
      author_id: string | null;
      author_name: string | null;
    }>();

  if (postError || !postRow?.id) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }

  let isOwner = postRow.author_id === authed.id;
  if (!isOwner && !postRow.author_id && postRow.author_name) {
    const resolvedAuthorID = await resolveProfileIdByDisplayName(admin, postRow.author_name);
    isOwner = resolvedAuthorID === authed.id;
  }

  if (!isOwner && !allowAdmin) {
    return NextResponse.json({ error: "본인 글만 삭제할 수 있습니다." }, { status: 403 });
  }

  const { error: notificationError } = await admin
    .from("notifications")
    .delete()
    .eq("post_id", postId);
  if (notificationError && !isMissingRelation(notificationError, "notifications")) {
    return NextResponse.json({ error: notificationError.message }, { status: 400 });
  }

  const { error: adoptionError } = await admin
    .from("answer_adoptions")
    .delete()
    .eq("post_id", postId);
  if (adoptionError && !isMissingRelation(adoptionError, "answer_adoptions")) {
    return NextResponse.json({ error: adoptionError.message }, { status: 400 });
  }

  const { error: commentError } = await admin
    .from("comments")
    .delete()
    .eq("post_id", postId);
  if (commentError) {
    return NextResponse.json({ error: commentError.message }, { status: 400 });
  }

  const { error: likeError } = await admin
    .from("post_likes")
    .delete()
    .eq("post_id", postId);
  if (likeError) {
    return NextResponse.json({ error: likeError.message }, { status: 400 });
  }

  const { error: statsError } = await admin
    .from("post_stats")
    .delete()
    .eq("post_id", postId);
  if (statsError && !isMissingRelation(statsError, "post_stats")) {
    return NextResponse.json({ error: statsError.message }, { status: 400 });
  }

  const { error: deleteError } = await admin
    .from("posts")
    .delete()
    .eq("id", postId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
