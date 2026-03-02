import { NextResponse } from "next/server";
import { COMMUNITY_BOARD_GROUPS } from "@/lib/data";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServer } from "@/lib/supabaseServer";

type ParamsLike = { postId?: string };

type CommentRow = {
  id: string;
  author_name: string | null;
  author_id?: string | null;
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

function defaultVerificationBadge(level: string | null | undefined): string {
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

function parseVerifiedUniversityFromMemo(memo: string | null | undefined): string | null {
  if (!memo) return null;
  try {
    const parsed = JSON.parse(memo) as { verifiedUniversity?: unknown };
    if (typeof parsed.verifiedUniversity !== "string") return null;
    const value = parsed.verifiedUniversity.trim();
    return value || null;
  } catch {
    return null;
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
  let viewerDisplayName: string | null = null;
  if (requestedUserId && isValidUUID(requestedUserId)) {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", requestedUserId)
      .maybeSingle<{ display_name: string | null }>();
    viewerDisplayName = profileRow?.display_name?.trim() || null;
  }

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
      author_id?: string | null;
      created_at: string | null;
      view_count?: number | null;
    }
    | null = null;

  const { data: modernPost, error: modernPostError } = await supabase
    .from("posts")
    .select("id,title,content,author_name,author_id,created_at,view_count")
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
        author_id: null,
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
    .select("id,author_name,author_id,content,created_at,parent_id")
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
    new Set(
      (commentsData ?? [])
        .map((comment) => (typeof comment.author_name === "string" ? comment.author_name.trim() : ""))
        .filter((value): value is string => Boolean(value))
    )
  );
  const authorProfileIds = Array.from(
    new Set(
      (commentsData ?? [])
        .map((comment) => (typeof comment.author_id === "string" ? comment.author_id.trim() : ""))
        .filter((value): value is string => isValidUUID(value))
    )
  );
  if (postData.author_id && isValidUUID(postData.author_id)) {
    authorProfileIds.push(postData.author_id);
  }

  const verificationByProfileId = new Map<string, string>();
  const verificationByDisplayName = new Map<string, string>();

  const uniqueProfileIds = Array.from(new Set(authorProfileIds));
  if (uniqueProfileIds.length > 0) {
    const { data: profilesById } = await supabase
      .from("profiles")
      .select("id,display_name,verification_level")
      .in("id", uniqueProfileIds);

    (profilesById ?? []).forEach((profile: { id: string; display_name: string | null; verification_level: string | null }) => {
      const fallback = defaultVerificationBadge(profile.verification_level);
      verificationByProfileId.set(profile.id, fallback);
      if (profile.display_name) {
        verificationByDisplayName.set(profile.display_name, fallback);
      }
    });

    const { data: approvedRows } = await admin
      .from("verification_requests")
      .select("profile_id,memo,reviewed_at,created_at")
      .in("profile_id", uniqueProfileIds)
      .eq("status", "approved")
      .order("reviewed_at", { ascending: false })
      .order("created_at", { ascending: false });

    (approvedRows as { profile_id: string | null; memo: string | null }[] | null | undefined)?.forEach((row) => {
      const profileId = row.profile_id?.trim() ?? "";
      if (!profileId || !verificationByProfileId.has(profileId)) return;
      const current = verificationByProfileId.get(profileId) ?? "none";
      if (current !== "none" && current.endsWith("합격자")) return;
      const verifiedUniversity = parseVerifiedUniversityFromMemo(row.memo);
      if (!verifiedUniversity) return;
      verificationByProfileId.set(profileId, `${verifiedUniversity} 합격자`);
    });
  }

  if (authorNames.length > 0) {
    const unresolvedDisplayNames = authorNames.filter((name) => !verificationByDisplayName.has(name));
    if (unresolvedDisplayNames.length > 0) {
      const { data: profilesByName } = await supabase
        .from("profiles")
        .select("display_name,verification_level")
        .in("display_name", unresolvedDisplayNames);

      (profilesByName ?? []).forEach((profile: { display_name: string | null; verification_level: string | null }) => {
        if (!profile.display_name) return;
        verificationByDisplayName.set(profile.display_name, defaultVerificationBadge(profile.verification_level));
      });
    }
  }

  const comments = (commentsData ?? []).map((comment: CommentRow) => {
    const commentAuthorName = (comment.author_name ?? "").trim();
    const commentAuthorId = (comment.author_id ?? "").trim();
    const canDeleteByLegacyName = Boolean(
      !comment.author_id &&
      viewerDisplayName &&
      commentAuthorName &&
      commentAuthorName !== "익명" &&
      commentAuthorName === viewerDisplayName
    );

    return {
      id: comment.id,
      authorName: comment.author_name ?? "익명",
      authorId: comment.author_id ?? null,
      content: comment.content,
      createdAt: comment.created_at,
      timeLabel: formatRelativeTime(comment.created_at),
      parentId: comment.parent_id,
      verificationLevel:
        (commentAuthorId && verificationByProfileId.get(commentAuthorId)) ||
        (commentAuthorName ? verificationByDisplayName.get(commentAuthorName) : undefined) ||
        "none",
      canDelete: Boolean(
        (requestedUserId && comment.author_id && comment.author_id === requestedUserId) ||
          canDeleteByLegacyName
      ),
    };
  });

  const postAuthorName = (postData.author_name ?? "").trim();
  const canDeletePostByLegacyName = Boolean(
    !postData.author_id &&
    viewerDisplayName &&
    postAuthorName &&
    postAuthorName !== "익명" &&
    postAuthorName === viewerDisplayName
  );
  const viewerCanDelete = Boolean(
    (requestedUserId &&
      postData.author_id &&
      postData.author_id === requestedUserId) ||
    canDeletePostByLegacyName
  );

  return noStore(
    NextResponse.json({
      ok: true,
      writable: !(exam === "cpa" && !ENABLE_CPA_WRITE),
      isSamplePost: false,
      viewerLiked,
      viewerCanDelete,
      board: { slug: boardInfo.slug, name: boardData.name ?? boardInfo.name },
      post: {
        id: postData.id,
        title: postData.title,
        content: postData.content,
        authorName: postData.author_name ?? "익명",
        authorId: postData.author_id ?? null,
        verificationLevel:
          (postData.author_id ? verificationByProfileId.get(postData.author_id) : undefined) ||
          (postAuthorName ? verificationByDisplayName.get(postAuthorName) : undefined) ||
          "none",
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
