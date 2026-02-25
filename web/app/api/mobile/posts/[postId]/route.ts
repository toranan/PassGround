import { NextResponse } from "next/server";
import { COMMUNITY_BOARD_GROUPS } from "@/lib/data";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServer } from "@/lib/supabaseServer";

type ParamsLike = { postId?: string };

type CommentRow = {
  id: string;
  author_name: string;
  content: string;
  created_at: string;
  parent_id: string | null;
};

let postStatsAvailable: boolean | null = null;

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function formatRelativeTime(value: string | null): string {
  if (!value) return "방금 전";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "방금 전";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString("ko-KR");
}

function verificationLabel(level: string | null | undefined): string {
  switch (level) {
    case "transfer_passer":
      return "편입 합격";
    case "cpa_first_passer":
      return "CPA 1차 합격";
    case "cpa_accountant":
      return "현직 회계사";
    default:
      return "none";
  }
}

function isMissingRelation(error: { code?: string | null; message?: string | null } | null, relation: string): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes(`relation "${relation.toLowerCase()}" does not exist`);
}

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

async function resolveLikeCount(admin: ReturnType<typeof getSupabaseAdmin>, postId: string): Promise<number> {
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

async function isViewerLiked(
  admin: ReturnType<typeof getSupabaseAdmin>,
  postId: string,
  requestedUserId: string
): Promise<boolean> {
  if (!isValidUUID(requestedUserId)) return false;
  const { data: likedRow } = await admin
    .from("post_likes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", requestedUserId)
    .maybeSingle<{ post_id: string }>();
  return Boolean(likedRow);
}

function bumpViewCountBestEffort(admin: ReturnType<typeof getSupabaseAdmin>, postId: string) {
  void (async () => {
    try {
      const { data: viewData } = await admin
        .from("posts")
        .select("view_count")
        .eq("id", postId)
        .maybeSingle<{ view_count: number | null }>();

      await admin
        .from("posts")
        .update({ view_count: (viewData?.view_count ?? 0) + 1 })
        .eq("id", postId);
    } catch {
      // Legacy schema may not include view_count.
    }
  })();
}

export async function GET(
  request: Request,
  context: { params: ParamsLike | Promise<ParamsLike> }
) {
  const resolved = await Promise.resolve(context.params);
  const postId = typeof resolved.postId === "string" ? resolved.postId : "";
  const { searchParams } = new URL(request.url);
  const exam = (searchParams.get("exam") ?? "").trim();
  const board = (searchParams.get("board") ?? "").trim();
  const requestedUserId = (searchParams.get("userId") ?? "").trim();

  if (!exam || !board) {
    return NextResponse.json({ error: "exam, board 파라미터가 필요합니다." }, { status: 400 });
  }
  if (!postId) {
    return NextResponse.json({ error: "postId 파라미터가 필요합니다." }, { status: 400 });
  }

  if (!ENABLE_CPA && exam === "cpa") {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }

  const examInfo = COMMUNITY_BOARD_GROUPS.find((group) => group.examSlug === exam);
  const boardInfo = examInfo?.boards.find((item) => item.slug === board);
  if (!examInfo || !boardInfo) {
    return NextResponse.json({ error: "지원하지 않는 게시글 경로입니다." }, { status: 404 });
  }

  if (!isValidUUID(postId)) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }

  const supabase = getSupabaseServer();
  const admin = getSupabaseAdmin();

  const { data: boardData } = await supabase
    .from("boards")
    .select("id,name,exams!inner(slug)")
    .eq("slug", board)
    .eq("exams.slug", exam)
    .maybeSingle<{ id: string; name: string }>();

  if (!boardData?.id) {
    return NextResponse.json({ error: "게시판 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  let postData:
    | {
      id: string;
      title: string;
      content: string;
      author_name: string | null;
      created_at: string | null;
      view_count?: number | null;
    }
    | null = null;

  const { data: modernPost, error: modernPostError } = await supabase
    .from("posts")
    .select("id,title,content,author_name,created_at,view_count")
    .eq("id", postId)
    .eq("board_id", boardData.id)
    .maybeSingle();
  postData = modernPost;

  if (!postData && modernPostError?.message?.includes("view_count")) {
    const { data: legacyPost } = await supabase
      .from("posts")
      .select("id,title,content,author_name,created_at")
      .eq("id", postId)
      .eq("board_id", boardData.id)
      .maybeSingle();
    postData = legacyPost
      ? {
        ...legacyPost,
        view_count: 0,
      }
      : null;
  }

  if (!postData) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }

  bumpViewCountBestEffort(admin, postId);

  const commentsPromise = supabase
    .from("comments")
    .select("id,author_name,content,created_at,parent_id")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  const adoptionPromise = supabase
    .from("answer_adoptions")
    .select("comment_id")
    .eq("post_id", postId)
    .maybeSingle<{ comment_id: string }>();

  const [commentsResult, adoptionResult, likeCount, viewerLiked] = await Promise.all([
    commentsPromise,
    adoptionPromise,
    resolveLikeCount(admin, postId),
    isViewerLiked(admin, postId, requestedUserId),
  ]);

  const commentsData = commentsResult.data ?? [];
  const adoptionData = adoptionResult.data;

  const authorNames = Array.from(
    new Set((commentsData ?? []).map((comment) => comment.author_name).filter(Boolean))
  );

  const verificationMap = new Map<string, string>();
  if (authorNames.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("display_name,verification_level")
      .in("display_name", authorNames);

    (profiles ?? []).forEach((profile: { display_name: string | null; verification_level: string | null }) => {
      if (profile.display_name) {
        verificationMap.set(profile.display_name, verificationLabel(profile.verification_level));
      }
    });
  }

  const comments = (commentsData ?? []).map((comment: CommentRow) => ({
    id: comment.id,
    authorName: comment.author_name,
    content: comment.content,
    createdAt: comment.created_at,
    timeLabel: formatRelativeTime(comment.created_at),
    parentId: comment.parent_id,
    verificationLevel: verificationMap.get(comment.author_name) ?? "none",
  }));

  return noStore(
    NextResponse.json({
      ok: true,
      writable: !(exam === "cpa" && !ENABLE_CPA_WRITE),
      isSamplePost: false,
      viewerLiked,
      board: { slug: boardInfo.slug, name: boardData.name ?? boardInfo.name },
      post: {
        id: postData.id,
        title: postData.title,
        content: postData.content,
        authorName: postData.author_name ?? "익명",
        createdAt: postData.created_at,
        timeLabel: formatRelativeTime(postData.created_at),
        viewCount: postData.view_count ?? 0,
        likeCount,
      },
      adoptedCommentId: adoptionData?.comment_id ?? null,
      comments,
    })
  );
}
