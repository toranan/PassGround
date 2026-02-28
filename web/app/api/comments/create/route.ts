import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";
import { getBearerToken, getUserByAccessToken } from "@/lib/authServer";

// UUID 형식 검증
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function trimBody(value: string, maxLength = 120): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
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

async function createCommentNotifications(params: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  postId: string;
  parentId: string | null;
  commentId: string;
  actorUserId: string | null;
  actorName: string;
  content: string;
}) {
  const { admin, postId, parentId, commentId, actorUserId, actorName, content } = params;

  const { data: postRow } = await admin
    .from("posts")
    .select("id,title,author_id,author_name,board_id")
    .eq("id", postId)
    .maybeSingle<{
      id: string;
      title: string | null;
      author_id: string | null;
      author_name: string | null;
      board_id: string | null;
    }>();

  if (!postRow?.id) return;

  const { data: boardRow } = await admin
    .from("boards")
    .select("slug,exams!inner(slug)")
    .eq("id", postRow.board_id ?? "")
    .maybeSingle<{ slug: string | null; exams: { slug: string } | { slug: string }[] | null }>();

  let parentCommentAuthorId: string | null = null;
  let parentCommentAuthorName: string | null = null;
  if (parentId) {
    const { data: parentRow } = await admin
      .from("comments")
      .select("author_id,author_name")
      .eq("id", parentId)
      .maybeSingle<{ author_id: string | null; author_name: string | null }>();
    parentCommentAuthorId = parentRow?.author_id ?? null;
    parentCommentAuthorName = parentRow?.author_name ?? null;
  }

  const postOwnerId = postRow.author_id ?? (postRow.author_name ? await resolveProfileIdByDisplayName(admin, postRow.author_name) : null);
  const replyOwnerId =
    parentCommentAuthorId ?? (parentCommentAuthorName ? await resolveProfileIdByDisplayName(admin, parentCommentAuthorName) : null);

  const recipientIDs = Array.from(
    new Set([postOwnerId, replyOwnerId].filter((value): value is string => Boolean(value)))
  ).filter((value) => value !== actorUserId);

  if (recipientIDs.length === 0) return;

  const examInfo = boardRow?.exams;
  const examSlug = Array.isArray(examInfo) ? examInfo[0]?.slug ?? null : examInfo?.slug ?? null;
  const boardSlug = boardRow?.slug ?? null;
  const snippet = trimBody(content, 90);
  const rows = recipientIDs.map((recipientID) => {
    const isReplyTarget = parentId !== null && recipientID === replyOwnerId;
    return {
      recipient_id: recipientID,
      actor_id: actorUserId,
      actor_name: actorName,
      type: isReplyTarget ? "reply_comment" : "new_comment",
      title: isReplyTarget ? "내 댓글에 답글이 달렸어" : "내 글에 새 댓글이 달렸어",
      body: snippet ? `${actorName}: ${snippet}` : `${actorName}님이 댓글을 남겼어`,
      post_id: postId,
      comment_id: commentId,
      exam_slug: examSlug,
      board_slug: boardSlug,
      is_read: false,
    };
  });

  const { error } = await admin.from("notifications").insert(rows);
  if (error) {
    const code = error.code ?? "";
    const message = (error.message ?? "").toLowerCase();
    const missingRelation = code === "42P01" || message.includes('relation "notifications" does not exist');
    if (!missingRelation) {
      console.warn("createCommentNotifications failed:", error.message);
    }
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const postId = typeof body.postId === "string" ? body.postId.trim() : "";
  const rawAuthorName = typeof body.authorName === "string" ? body.authorName.trim() : "";
  const authorName = rawAuthorName && rawAuthorName.length >= 2 ? rawAuthorName : "익명";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const requestUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  const bodyAccessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";

  const parentId = typeof body.parentId === "string" && body.parentId.trim() ? body.parentId.trim() : null;

  if (!postId) {
    return NextResponse.json({ error: "게시글 정보가 없습니다." }, { status: 400 });
  }

  // UUID 형식 검증 (목록 조회 전용 게시글은 쓰기 불가)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(postId)) {
    return NextResponse.json({ error: "기본 목록 게시글에는 댓글을 작성할 수 없습니다." }, { status: 400 });
  }
  if (parentId && !isValidUUID(parentId)) {
    return NextResponse.json({ error: "유효하지 않은 답글 대상입니다." }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "댓글 내용을 입력해 주세요." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const headerToken = getBearerToken(request);
  const accessToken = headerToken || bodyAccessToken;

  let actorUserId: string | null = null;
  if (accessToken && requestUserId && isValidUUID(requestUserId)) {
    const authed = await getUserByAccessToken(accessToken);
    if (!authed?.id) {
      return NextResponse.json({ error: "인증이 만료되었습니다. 다시 로그인해 주세요." }, { status: 401 });
    }
    if (authed.id !== requestUserId) {
      return NextResponse.json({ error: "본인 계정만 사용할 수 있습니다." }, { status: 403 });
    }
    actorUserId = authed.id;
  }

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
      { error: "현재 CPA는 읽기 전용입니다. 댓글 작성은 편입 커뮤니티에서 가능합니다." },
      { status: 403 }
    );
  }

  const { data: inserted, error: insertError } = await admin
    .from("comments")
    .insert({
      post_id: postId,
      parent_id: parentId,
      author_id: actorUserId,
      author_name: authorName,
      content,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  if (inserted?.id) {
    await createCommentNotifications({
      admin,
      postId,
      parentId,
      commentId: inserted.id,
      actorUserId,
      actorName: authorName,
      content,
    });
  }

  return NextResponse.json({ ok: true, commentId: inserted?.id ?? null });
}
