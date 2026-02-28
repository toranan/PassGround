import { NextResponse } from "next/server";
import { COMMUNITY_BOARD_GROUPS } from "@/lib/data";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { stripNewsResources } from "@/lib/newsResources";

type PostRow = {
  id: string;
  title: string;
  content?: string | null;
  author_name: string | null;
  created_at: string | null;
  view_count?: number | null;
};

type CursorPayload = {
  createdAt: string;
  id: string;
};

type PostStatsRow = {
  post_id: string;
  comment_count: number | null;
  like_count: number | null;
};

let postStatsAvailable: boolean | null = null;

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

function parseLimit(value: string | null): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 20;
  return Math.min(60, Math.max(1, Math.round(numeric)));
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(raw: string | null): CursorPayload | null {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<CursorPayload>;
    if (!parsed.createdAt || !parsed.id) return null;
    if (Number.isNaN(new Date(parsed.createdAt).getTime())) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
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

function withCache(response: NextResponse) {
  response.headers.set("Cache-Control", "public, s-maxage=8, stale-while-revalidate=24");
  return response;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const exam = (searchParams.get("exam") ?? "").trim();
  const board = (searchParams.get("board") ?? "").trim();
  const limit = parseLimit(searchParams.get("limit"));
  const cursor = decodeCursor(searchParams.get("cursor"));

  if (!exam || !board) {
    return NextResponse.json({ error: "exam, board 파라미터가 필요합니다." }, { status: 400 });
  }

  if (!ENABLE_CPA && exam === "cpa") {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }

  const examInfo = COMMUNITY_BOARD_GROUPS.find((group) => group.examSlug === exam);
  if (!examInfo) {
    return NextResponse.json({ error: "지원하지 않는 시험 카테고리입니다." }, { status: 400 });
  }

  const boardInfo = examInfo.boards.find((item) => item.slug === board);
  if (!boardInfo) {
    return NextResponse.json({ error: "지원하지 않는 게시판입니다." }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  const admin = getSupabaseAdmin();
  const { data: boardRow } = await supabase
    .from("boards")
    .select("id,name,exams!inner(slug)")
    .eq("slug", board)
    .eq("exams.slug", exam)
    .maybeSingle<{ id: string; name: string }>();

  if (!boardRow?.id) {
    return NextResponse.json({ error: "게시판 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  let postsData: PostRow[] | null = null;

  let modernQuery = supabase
    .from("posts")
    .select("id,title,content,author_name,created_at,view_count")
    .eq("board_id", boardRow.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    modernQuery = modernQuery.or(
      `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`
    );
  }

  const { data: modernPosts, error: modernError } = await modernQuery;
  postsData = modernPosts;

  if ((!postsData || postsData.length === 0) && modernError?.message?.includes("view_count")) {
    let legacyQuery = supabase
      .from("posts")
      .select("id,title,content,author_name,created_at")
      .eq("board_id", boardRow.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      legacyQuery = legacyQuery.or(
        `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`
      );
    }

    const { data: legacyPosts } = await legacyQuery;

    postsData = (legacyPosts ?? []).map((post) => ({
      ...post,
      view_count: 0,
    }));
  }

  if (!postsData || postsData.length === 0) {
    return withCache(
      NextResponse.json({
        ok: true,
        writable: !(exam === "cpa" && !ENABLE_CPA_WRITE),
        exam: { slug: examInfo.examSlug, name: examInfo.examName },
        board: { slug: boardInfo.slug, name: boardRow.name ?? boardInfo.name, description: boardInfo.description },
        posts: [],
        hasMore: false,
        nextCursor: null,
        source: "db-empty",
      })
    );
  }

  const hasMore = postsData.length > limit;
  const pageRows = hasMore ? postsData.slice(0, limit) : postsData;
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

  const posts = pageRows.map((post) => ({
    id: post.id,
    title: post.title,
    content: (board === "news" ? stripNewsResources(post.content ?? "") : (post.content ?? "")).substring(0, 100),
    authorName: (post.author_name ?? "익명").trim() || "익명",
    commentCount: commentCountMap.get(post.id) ?? 0,
    likeCount: likeCountMap.get(post.id) ?? 0,
    viewCount: post.view_count ?? 0,
    timeLabel: formatRelativeTime(post.created_at),
    createdAt: post.created_at,
    isSample: false,
  }));

  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last?.created_at
      ? encodeCursor({ createdAt: last.created_at, id: last.id })
      : null;

  return withCache(
    NextResponse.json({
      ok: true,
      writable: !(exam === "cpa" && !ENABLE_CPA_WRITE),
      exam: { slug: examInfo.examSlug, name: examInfo.examName },
      board: { slug: boardInfo.slug, name: boardRow.name ?? boardInfo.name, description: boardInfo.description },
      posts,
      hasMore,
      nextCursor,
      source: "db",
    })
  );
}
