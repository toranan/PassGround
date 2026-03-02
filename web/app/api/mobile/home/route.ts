import { NextResponse } from "next/server";
import { COMMUNITY_BOARD_GROUPS } from "@/lib/data";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { stripNewsResources } from "@/lib/newsResources";

type PostRow = {
  id: string;
  title: string;
  content?: string | null;
  author_name: string | null;
  author_id?: string | null;
  created_at: string | null;
  view_count?: number | null;
  board_id: string;
};

type BoardRow = {
  id: string;
  slug: string;
  name: string;
};

type PostStatsRow = {
  post_id: string;
  comment_count: number | null;
  like_count: number | null;
};

type HomeItem = {
  id: string;
  boardSlug: string;
  boardName: string;
  post: {
    id: string;
    title: string;
    content: string;
    authorName: string;
    verificationLevel: string;
    commentCount: number;
    likeCount: number;
    viewCount: number;
    timeLabel: string;
    createdAt: string | null;
    isSample: false;
  };
  hotScore: number;
  createdAtTs: number;
};

let postStatsAvailable: boolean | null = null;

function parseExam(value: string | null): "transfer" | "cpa" | null {
  if (value === "transfer" || value === "cpa") return value;
  return null;
}

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function formatRelativeTime(value: string | null): string {
  if (!value) return "방금";
  if (value.includes("분") || value.includes("시간") || value.includes("일")) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "방금";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "방금";
  if (diffMinutes < 60) return `${diffMinutes}분`;
  if (diffHours < 24) return `${diffHours}시간`;
  if (diffDays < 7) return `${diffDays}일`;
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
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

function aggregateCounts(rows: { post_id: string }[] | null | undefined): Map<string, number> {
  const map = new Map<string, number>();
  (rows ?? []).forEach((row) => {
    map.set(row.post_id, (map.get(row.post_id) ?? 0) + 1);
  });
  return map;
}

function withCache(response: NextResponse, bypassCache = false) {
  if (bypassCache) {
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  response.headers.set("Cache-Control", "public, s-maxage=10, stale-while-revalidate=40");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bypassCache = (url.searchParams.get("_cb") ?? "").trim().length > 0;
  const exam = parseExam(url.searchParams.get("exam")?.trim() ?? null);

  if (!exam) {
    return NextResponse.json({ error: "exam 파라미터가 필요합니다." }, { status: 400 });
  }
  if (!ENABLE_CPA && exam === "cpa") {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }

  const examInfo = COMMUNITY_BOARD_GROUPS.find((group) => group.examSlug === exam);
  if (!examInfo) {
    return NextResponse.json({ error: "지원하지 않는 시험 카테고리입니다." }, { status: 400 });
  }

  const newsBoardSlug = "news";
  const communityBoardSlugs = examInfo.boards
    .map((board) => board.slug)
    .filter((slug) => slug !== newsBoardSlug)
    .slice(0, 8);
  const allBoardSlugs = Array.from(new Set([...communityBoardSlugs, newsBoardSlug]));

  if (allBoardSlugs.length === 0) {
    return withCache(
      NextResponse.json({
        ok: true,
        exam: { slug: examInfo.examSlug, name: examInfo.examName, description: examInfo.description },
        realtimePosts: [],
        latestPosts: [],
        latestNewsPosts: [],
        source: "no-board",
      }),
      bypassCache
    );
  }

  const supabase = getSupabaseServer();
  const admin = getSupabaseAdmin();

  const { data: boardRows } = await supabase
    .from("boards")
    .select("id,slug,name,exams!inner(slug)")
    .eq("exams.slug", exam)
    .in("slug", allBoardSlugs);

  const boardMetaById = new Map<string, { slug: string; name: string }>();
  (boardRows as BoardRow[] | null | undefined)?.forEach((row) => {
    boardMetaById.set(row.id, { slug: row.slug, name: row.name });
  });

  const boardIds = Array.from(boardMetaById.keys());
  if (boardIds.length === 0) {
    return withCache(
      NextResponse.json({
        ok: true,
        exam: { slug: examInfo.examSlug, name: examInfo.examName, description: examInfo.description },
        realtimePosts: [],
        latestPosts: [],
        latestNewsPosts: [],
        source: "board-empty",
      }),
      bypassCache
    );
  }

  let postsData: PostRow[] | null = null;

  const { data: modernPosts, error: modernError } = await supabase
    .from("posts")
    .select("id,title,content,author_name,author_id,created_at,view_count,board_id")
    .in("board_id", boardIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(260);

  postsData = modernPosts as PostRow[] | null;

  if ((!postsData || postsData.length === 0) && modernError?.message?.includes("view_count")) {
    const { data: legacyPosts } = await supabase
      .from("posts")
      .select("id,title,content,author_name,created_at,board_id")
      .in("board_id", boardIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(260);

    postsData = (legacyPosts as PostRow[] | null | undefined)?.map((post) => ({
      ...post,
      author_id: null,
      view_count: 0,
    })) ?? null;
  }

  const pageRows = postsData ?? [];
  if (pageRows.length === 0) {
    return withCache(
      NextResponse.json({
        ok: true,
        exam: { slug: examInfo.examSlug, name: examInfo.examName, description: examInfo.description },
        realtimePosts: [],
        latestPosts: [],
        latestNewsPosts: [],
        source: "post-empty",
      }),
      bypassCache
    );
  }

  const postIds = pageRows.map((post) => post.id);
  const commentCountMap = new Map<string, number>();
  const likeCountMap = new Map<string, number>();

  let missingPostIds = [...postIds];
  if (postStatsAvailable !== false) {
    const { data: statsRows, error: statsError } = await admin
      .from("post_stats")
      .select("post_id,comment_count,like_count")
      .in("post_id", postIds);

    if (!statsError && statsRows) {
      postStatsAvailable = true;
      (statsRows as PostStatsRow[]).forEach((row) => {
        commentCountMap.set(row.post_id, Math.max(0, row.comment_count ?? 0));
        likeCountMap.set(row.post_id, Math.max(0, row.like_count ?? 0));
      });
      missingPostIds = postIds.filter((postId) => !commentCountMap.has(postId) || !likeCountMap.has(postId));
    } else if (isMissingRelation(statsError, "post_stats")) {
      postStatsAvailable = false;
    }
  }

  if (missingPostIds.length > 0) {
    const [{ data: commentRows }, { data: likeRows }] = await Promise.all([
      supabase.from("comments").select("post_id").in("post_id", missingPostIds),
      admin.from("post_likes").select("post_id").in("post_id", missingPostIds),
    ]);

    const fallbackCommentMap = aggregateCounts(commentRows as { post_id: string }[] | null | undefined);
    const fallbackLikeMap = aggregateCounts(likeRows as { post_id: string }[] | null | undefined);

    missingPostIds.forEach((postId) => {
      commentCountMap.set(postId, fallbackCommentMap.get(postId) ?? 0);
      likeCountMap.set(postId, fallbackLikeMap.get(postId) ?? 0);
    });
  }

  const postAuthorProfileIds = Array.from(
    new Set(
      pageRows
        .map((post) => (typeof post.author_id === "string" ? post.author_id.trim() : ""))
        .filter((value): value is string => isValidUUID(value))
    )
  );

  const verificationByProfileId = new Map<string, string>();
  if (postAuthorProfileIds.length > 0) {
    const { data: profilesById } = await supabase
      .from("profiles")
      .select("id,verification_level")
      .in("id", postAuthorProfileIds);

    (profilesById ?? []).forEach((profile: { id: string; verification_level: string | null }) => {
      verificationByProfileId.set(profile.id, defaultVerificationBadge(profile.verification_level));
    });

    const { data: approvedRows } = await admin
      .from("verification_requests")
      .select("profile_id,memo,reviewed_at,created_at")
      .in("profile_id", postAuthorProfileIds)
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

  const items: HomeItem[] = pageRows
    .map((post) => {
      const boardMeta = boardMetaById.get(post.board_id);
      if (!boardMeta) return null;

      const commentCount = commentCountMap.get(post.id) ?? 0;
      const likeCount = likeCountMap.get(post.id) ?? 0;
      const viewCount = post.view_count ?? 0;
      const createdAtTs = post.created_at ? new Date(post.created_at).getTime() : 0;
      const hotScore = likeCount * 3 + commentCount * 2 + Math.min(10, Math.floor(viewCount / 20));

      return {
        id: `${boardMeta.slug}-${post.id}`,
        boardSlug: boardMeta.slug,
        boardName: boardMeta.name,
        post: {
          id: post.id,
          title: post.title,
          content: (() => {
            const raw = post.content ?? "";
            const normalized = boardMeta.slug === newsBoardSlug ? stripNewsResources(raw) : raw;
            return normalized.substring(0, 100);
          })(),
          authorName: (post.author_name ?? "익명").trim() || "익명",
          verificationLevel:
            (typeof post.author_id === "string" ? verificationByProfileId.get(post.author_id) : undefined) ?? "none",
          commentCount,
          likeCount,
          viewCount,
          timeLabel: formatRelativeTime(post.created_at),
          createdAt: post.created_at,
          isSample: false,
        },
        hotScore,
        createdAtTs: Number.isFinite(createdAtTs) ? createdAtTs : 0,
      };
    })
    .filter((item): item is HomeItem => item !== null);

  const communityItems = items.filter((item) => item.boardSlug !== newsBoardSlug);
  const newsItems = items.filter((item) => item.boardSlug === newsBoardSlug);

  const realtimePosts = [...communityItems]
    .sort((a, b) => {
      if (a.hotScore !== b.hotScore) return b.hotScore - a.hotScore;
      return b.createdAtTs - a.createdAtTs;
    })
    .slice(0, 20)
    .map(({ id, boardSlug, boardName, post }) => ({ id, boardSlug, boardName, post }));

  const latestPosts = [...communityItems]
    .sort((a, b) => b.createdAtTs - a.createdAtTs)
    .slice(0, 20)
    .map(({ id, boardSlug, boardName, post }) => ({ id, boardSlug, boardName, post }));

  const latestNewsPosts = [...newsItems]
    .sort((a, b) => b.createdAtTs - a.createdAtTs)
    .slice(0, 20)
    .map(({ id, boardSlug, boardName, post }) => ({ id, boardSlug, boardName, post }));

  return withCache(
    NextResponse.json({
      ok: true,
      exam: { slug: examInfo.examSlug, name: examInfo.examName, description: examInfo.description },
      realtimePosts,
      latestPosts,
      latestNewsPosts,
      source: "db",
    }),
    bypassCache
  );
}
