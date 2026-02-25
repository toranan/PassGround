import { NextResponse } from "next/server";
import { COMMUNITY_BOARD_GROUPS } from "@/lib/data";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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
  if (!Number.isFinite(numeric)) return 50;
  return Math.min(120, Math.max(1, Math.round(numeric)));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const exam = (searchParams.get("exam") ?? "").trim();
  const board = (searchParams.get("board") ?? "").trim();
  const limit = parseLimit(searchParams.get("limit"));

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

  let postsData:
    | {
      id: string;
      title: string;
      content?: string | null;
      author_name: string | null;
      created_at: string | null;
      view_count?: number | null;
    }[]
    | null = null;

  const { data: modernPosts, error: modernError } = await supabase
    .from("posts")
    .select("id,title,content,author_name,created_at,view_count")
    .eq("board_id", boardRow.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  postsData = modernPosts;

  if ((!postsData || postsData.length === 0) && modernError?.message?.includes("view_count")) {
    const { data: legacyPosts } = await supabase
      .from("posts")
      .select("id,title,content,author_name,created_at")
      .eq("board_id", boardRow.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    postsData = (legacyPosts ?? []).map((post) => ({
      ...post,
      view_count: 0,
    }));
  }

  if (!postsData || postsData.length === 0) {
    return NextResponse.json({
      ok: true,
      writable: !(exam === "cpa" && !ENABLE_CPA_WRITE),
      exam: { slug: examInfo.examSlug, name: examInfo.examName },
      board: { slug: boardInfo.slug, name: boardRow.name ?? boardInfo.name, description: boardInfo.description },
      posts: [],
      source: "db-empty",
    });
  }

  const postIds = postsData.map((post) => post.id);
  const [{ data: commentRows }, { data: likeRows }] = await Promise.all([
    supabase.from("comments").select("post_id").in("post_id", postIds),
    admin.from("post_likes").select("post_id").in("post_id", postIds),
  ]);

  const commentCountMap = new Map<string, number>();
  const likeCountMap = new Map<string, number>();

  (commentRows ?? []).forEach((row: { post_id: string }) => {
    commentCountMap.set(row.post_id, (commentCountMap.get(row.post_id) ?? 0) + 1);
  });
  (likeRows ?? []).forEach((row: { post_id: string }) => {
    likeCountMap.set(row.post_id, (likeCountMap.get(row.post_id) ?? 0) + 1);
  });

  const posts = postsData.map((post) => ({
    id: post.id,
    title: post.title,
    content: post.content?.substring(0, 100) || "",
    authorName: (post.author_name ?? "익명").trim() || "익명",
    commentCount: commentCountMap.get(post.id) ?? 0,
    likeCount: likeCountMap.get(post.id) ?? 0,
    viewCount: post.view_count ?? 0,
    timeLabel: formatRelativeTime(post.created_at),
    createdAt: post.created_at,
    isSample: false,
  }));

  return NextResponse.json({
    ok: true,
    writable: !(exam === "cpa" && !ENABLE_CPA_WRITE),
    exam: { slug: examInfo.examSlug, name: examInfo.examName },
    board: { slug: boardInfo.slug, name: boardRow.name ?? boardInfo.name, description: boardInfo.description },
    posts,
    source: "db",
  });
}
