import { NextResponse } from "next/server";
import { BOARD_POST_GROUPS, COMMUNITY_BOARD_GROUPS } from "@/lib/data";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";
import { getSupabaseServer } from "@/lib/supabaseServer";

type ParamsLike = { exam?: string };

type PreviewPost = {
  id: string;
  title: string;
  created_at: string | null;
  author_name: string | null;
  board_id: string;
};

function resolveExam(value: string): "transfer" | "cpa" | null {
  if (value === "transfer" || value === "cpa") return value;
  return null;
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

export async function GET(
  _request: Request,
  context: { params: ParamsLike | Promise<ParamsLike> }
) {
  const resolved = await Promise.resolve(context.params);
  const exam = resolveExam(typeof resolved.exam === "string" ? resolved.exam : "");

  if (!exam) {
    return NextResponse.json({ error: "지원하지 않는 시험 카테고리입니다." }, { status: 400 });
  }
  if (!ENABLE_CPA && exam === "cpa") {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }

  const group = COMMUNITY_BOARD_GROUPS.find((item) => item.examSlug === exam);
  if (!group) {
    return NextResponse.json({ error: "게시판 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  const boardSlugs = group.boards.map((board) => board.slug);
  const fallbackPreview = new Map(
    BOARD_POST_GROUPS.filter((item) => item.examSlug === exam).map((item) => [
      item.boardSlug,
      item.posts.slice(0, 3).map((post) => ({
        id: post.id,
        title: post.title,
        authorName: post.author,
        timeLabel: post.time,
      })),
    ])
  );

  const previewsByBoard = new Map<string, Array<{ id: string; title: string; authorName: string; timeLabel: string }>>();

  try {
    const supabase = getSupabaseServer();
    const { data: boardRows } = await supabase
      .from("boards")
      .select("id,slug,exams!inner(slug)")
      .eq("exams.slug", exam)
      .in("slug", boardSlugs);

    const boardSlugById = new Map<string, string>();
    (boardRows ?? []).forEach((row: { id: string; slug: string }) => {
      boardSlugById.set(row.id, row.slug);
    });

    const boardIds = Array.from(boardSlugById.keys());
    if (boardIds.length > 0) {
      const { data: postRows } = await supabase
        .from("posts")
        .select("id,title,created_at,author_name,board_id")
        .in("board_id", boardIds)
        .order("created_at", { ascending: false })
        .limit(280);

      (postRows ?? []).forEach((post: PreviewPost) => {
        const boardSlug = boardSlugById.get(post.board_id);
        if (!boardSlug) return;

        const current = previewsByBoard.get(boardSlug) ?? [];
        if (current.length >= 3) return;

        current.push({
          id: post.id,
          title: post.title,
          authorName: (post.author_name ?? "익명").trim() || "익명",
          timeLabel: formatRelativeTime(post.created_at),
        });
        previewsByBoard.set(boardSlug, current);
      });
    }
  } catch {
    // Use fallback preview.
  }

  const boards = group.boards.map((board) => {
    const preview = previewsByBoard.get(board.slug) ?? fallbackPreview.get(board.slug) ?? [];
    return {
      id: board.id,
      slug: board.slug,
      name: board.name,
      description: board.description,
      preview,
    };
  });

  return NextResponse.json({
    ok: true,
    exam: {
      slug: group.examSlug,
      name: group.examName,
      description: group.description,
    },
    writable: !(exam === "cpa" && !ENABLE_CPA_WRITE),
    boards,
  });
}
