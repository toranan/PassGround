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

function collectSubtreeIDs(rows: Array<{ id: string; parent_id: string | null }>, rootID: string): string[] {
  const childrenMap = new Map<string, string[]>();
  rows.forEach((row) => {
    if (!row.parent_id) return;
    const list = childrenMap.get(row.parent_id) ?? [];
    list.push(row.id);
    childrenMap.set(row.parent_id, list);
  });

  const visited = new Set<string>();
  const queue: string[] = [rootID];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const children = childrenMap.get(current) ?? [];
    children.forEach((childID) => queue.push(childID));
  }

  return [...visited];
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const commentId = typeof body.commentId === "string" ? body.commentId.trim() : "";
  const requestUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  const bodyAccessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";

  if (!commentId || !isValidUUID(commentId)) {
    return NextResponse.json({ error: "삭제할 댓글 id가 필요합니다." }, { status: 400 });
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

  const { data: commentRow, error: commentError } = await admin
    .from("comments")
    .select("id,post_id,author_id,author_name")
    .eq("id", commentId)
    .maybeSingle<{
      id: string;
      post_id: string | null;
      author_id: string | null;
      author_name: string | null;
    }>();

  if (commentError || !commentRow?.id || !commentRow.post_id) {
    return NextResponse.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 });
  }

  let isOwner = commentRow.author_id === authed.id;
  if (!isOwner && !commentRow.author_id && commentRow.author_name) {
    const resolvedAuthorID = await resolveProfileIdByDisplayName(admin, commentRow.author_name);
    isOwner = resolvedAuthorID === authed.id;
  }

  if (!isOwner && !allowAdmin) {
    return NextResponse.json({ error: "본인 댓글만 삭제할 수 있습니다." }, { status: 403 });
  }

  const { data: commentRows, error: treeError } = await admin
    .from("comments")
    .select("id,parent_id")
    .eq("post_id", commentRow.post_id);

  if (treeError) {
    return NextResponse.json({ error: treeError.message }, { status: 400 });
  }

  const idsToDelete = collectSubtreeIDs(
    (commentRows as Array<{ id: string; parent_id: string | null }> | null | undefined) ?? [],
    commentId
  );

  if (idsToDelete.length === 0) {
    return NextResponse.json({ error: "삭제할 댓글을 찾을 수 없습니다." }, { status: 404 });
  }

  const { error: notificationError } = await admin
    .from("notifications")
    .delete()
    .in("comment_id", idsToDelete);
  if (notificationError && !isMissingRelation(notificationError, "notifications")) {
    return NextResponse.json({ error: notificationError.message }, { status: 400 });
  }

  const { error: adoptionError } = await admin
    .from("answer_adoptions")
    .delete()
    .in("comment_id", idsToDelete);
  if (adoptionError && !isMissingRelation(adoptionError, "answer_adoptions")) {
    return NextResponse.json({ error: adoptionError.message }, { status: 400 });
  }

  const { error: deleteError } = await admin
    .from("comments")
    .delete()
    .in("id", idsToDelete);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, deletedCount: idsToDelete.length });
}
