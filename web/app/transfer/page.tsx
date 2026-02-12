import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { CutoffTable } from "@/components/CutoffTable";
import { TransferPredictor } from "@/components/TransferPredictor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BOARD_POST_GROUPS, CUTOFF_SEED_DATA, DAILY_BRIEFING_SEED } from "@/lib/data";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type CutoffRow = {
  id: string;
  university: string;
  major: string;
  year: number;
  scoreBand: string;
  note: string;
};

type BriefingRow = {
  id: string;
  title: string;
  summary: string;
  sourceLabel: string;
  publishedAt: string;
  boardSlug: "qa" | "study-qa" | "cutoff" | "free";
  boardName: string;
};

type QaRow = {
  id: string;
  title: string;
  commentCount: number;
  createdAt: string | null;
};

type PopularRow = {
  id: string;
  title: string;
  boardSlug: string;
  boardName: string;
  commentCount: number;
  likeCount: number;
  viewCount: number;
};

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "-";
  if (dateString.includes("분") || dateString.includes("시간") || dateString.includes("일")) {
    return dateString;
  }
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString("ko-KR");
}

function resolveTransferBriefingBoard(sourceLabel: string, title: string): { slug: "qa" | "study-qa" | "cutoff" | "free"; name: string } {
  const combined = `${sourceLabel} ${title}`;
  if (combined.includes("입학처") || combined.includes("요강") || combined.includes("커트")) {
    return { slug: "cutoff", name: "커트라인 제보" };
  }
  if (combined.includes("학원") || combined.includes("모의고사") || combined.includes("학습")) {
    return { slug: "study-qa", name: "학습 Q&A" };
  }
  return { slug: "qa", name: "전략 Q&A" };
}

async function loadCutoffs(): Promise<CutoffRow[]> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("cutoff_scores")
    .select("id,university,major,year,score_band,note")
    .eq("exam_slug", "transfer")
    .order("year", { ascending: false })
    .limit(10);

  if (error || !data?.length) {
    return CUTOFF_SEED_DATA
      .filter((row) => row.examSlug === "transfer")
      .map((row) => ({
        id: row.id,
        university: row.university,
        major: row.major,
        year: row.year,
        scoreBand: row.scoreBand,
        note: row.note,
      }));
  }

  return data.map((row: { id: string; university: string; major: string; year: number; score_band: string; note: string | null }) => ({
    id: row.id,
    university: row.university,
    major: row.major,
    year: row.year,
    scoreBand: row.score_band,
    note: row.note ?? "-",
  }));
}

async function loadBriefings(): Promise<BriefingRow[]> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("daily_briefings")
    .select("id,title,summary,source_label,published_at")
    .eq("exam_slug", "transfer")
    .order("published_at", { ascending: false })
    .limit(5);

  if (error || !data?.length) {
    return DAILY_BRIEFING_SEED
      .filter((row) => row.examSlug === "transfer")
      .map((row) => {
        const board = resolveTransferBriefingBoard(row.sourceLabel, row.title);
        return {
          id: row.id,
          title: row.title,
          summary: row.summary,
          sourceLabel: row.sourceLabel,
          publishedAt: row.publishedAt,
          boardSlug: board.slug,
          boardName: board.name,
        };
      });
  }

  return data.map((row: { id: string; title: string; summary: string; source_label: string; published_at: string }) => {
    const board = resolveTransferBriefingBoard(row.source_label, row.title);
    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      sourceLabel: row.source_label,
      publishedAt: row.published_at,
      boardSlug: board.slug,
      boardName: board.name,
    };
  });
}

async function loadBoardRows(boardSlug: "qa" | "study-qa"): Promise<QaRow[]> {
  const supabase = getSupabaseServer();

  const { data: examData } = await supabase
    .from("exams")
    .select("id")
    .eq("slug", "transfer")
    .maybeSingle();

  if (!examData?.id) {
    const fallbackPosts = BOARD_POST_GROUPS.find(
      (group) => group.examSlug === "transfer" && group.boardSlug === boardSlug
    )?.posts ?? [];
    return fallbackPosts.map((post) => ({
      id: post.id,
      title: post.title,
      commentCount: post.comments,
      createdAt: post.time,
    }));
  }

  const { data: boardData } = await supabase
    .from("boards")
    .select("id")
    .eq("exam_id", examData.id)
    .eq("slug", boardSlug)
    .maybeSingle();

  if (!boardData?.id) {
    const fallbackPosts = BOARD_POST_GROUPS.find(
      (group) => group.examSlug === "transfer" && group.boardSlug === boardSlug
    )?.posts ?? [];
    return fallbackPosts.map((post) => ({
      id: post.id,
      title: post.title,
      commentCount: post.comments,
      createdAt: post.time,
    }));
  }

  const { data: posts } = await supabase
    .from("posts")
    .select("id,title,created_at,comments(count)")
    .eq("board_id", boardData.id)
    .order("created_at", { ascending: false })
    .limit(6);

  if (!posts?.length) {
    return [];
  }

  return posts.map((post: { id: string; title: string; created_at: string | null; comments?: { count: number }[] }) => ({
    id: post.id,
    title: post.title,
    commentCount: post.comments?.[0]?.count ?? 0,
    createdAt: post.created_at,
  }));
}

async function loadQaRows(): Promise<QaRow[]> {
  return loadBoardRows("qa");
}

async function loadStudyQaRows(): Promise<QaRow[]> {
  return loadBoardRows("study-qa");
}

async function loadPopularRows(): Promise<PopularRow[]> {
  const supabase = getSupabaseServer();

  const { data: examData } = await supabase
    .from("exams")
    .select("id")
    .eq("slug", "transfer")
    .maybeSingle();

  if (!examData?.id) {
    return BOARD_POST_GROUPS
      .filter((group) => group.examSlug === "transfer")
      .flatMap((group) =>
        group.posts.map((post) => ({
          id: post.id,
          title: post.title,
          boardSlug: group.boardSlug,
          boardName: group.boardName,
          commentCount: post.comments,
          likeCount: Math.max(0, Math.floor(post.comments / 2)),
          viewCount: post.views,
        }))
      )
      .sort((a, b) => b.commentCount + b.likeCount - (a.commentCount + a.likeCount))
      .slice(0, 5);
  }

  const { data: boardRows } = await supabase
    .from("boards")
    .select("id,slug,name")
    .eq("exam_id", examData.id);

  if (!boardRows?.length) {
    return [];
  }

  const boardIdToMeta = new Map<string, { slug: string; name: string }>();
  boardRows.forEach((row: { id: string; slug: string; name: string }) => {
    boardIdToMeta.set(row.id, { slug: row.slug, name: row.name });
  });

  const boardIds = boardRows.map((row: { id: string }) => row.id);
  const { data: postsData } = await supabase
    .from("posts")
    .select("id,title,board_id,view_count,created_at")
    .in("board_id", boardIds)
    .order("created_at", { ascending: false })
    .limit(120);

  if (!postsData?.length) {
    return [];
  }

  const postIds = postsData.map((post: { id: string }) => post.id);
  const [{ data: commentRows }, { data: likeRows }] = await Promise.all([
    supabase.from("comments").select("post_id").in("post_id", postIds),
    supabase.from("post_likes").select("post_id").in("post_id", postIds),
  ]);

  const commentCountMap = new Map<string, number>();
  const likeCountMap = new Map<string, number>();

  (commentRows ?? []).forEach((row: { post_id: string }) => {
    commentCountMap.set(row.post_id, (commentCountMap.get(row.post_id) ?? 0) + 1);
  });
  (likeRows ?? []).forEach((row: { post_id: string }) => {
    likeCountMap.set(row.post_id, (likeCountMap.get(row.post_id) ?? 0) + 1);
  });

  return postsData
    .map((post: { id: string; title: string; board_id: string; view_count: number | null }) => {
      const boardMeta = boardIdToMeta.get(post.board_id);
      const commentCount = commentCountMap.get(post.id) ?? 0;
      const likeCount = likeCountMap.get(post.id) ?? 0;
      const viewCount = post.view_count ?? 0;
      const score = likeCount * 3 + commentCount * 2 + Math.min(10, Math.floor(viewCount / 20));

      return {
        id: post.id,
        title: post.title,
        boardSlug: boardMeta?.slug ?? "qa",
        boardName: boardMeta?.name ?? "게시판",
        commentCount,
        likeCount,
        viewCount,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      title: row.title,
      boardSlug: row.boardSlug,
      boardName: row.boardName,
      commentCount: row.commentCount,
      likeCount: row.likeCount,
      viewCount: row.viewCount,
    }));
}

export default async function TransferPage() {
  const [cutoffRows, briefingRows, qaRows, studyQaRows, popularRows] = await Promise.all([
    loadCutoffs(),
    loadBriefings(),
    loadQaRows(),
    loadStudyQaRows(),
    loadPopularRows(),
  ]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_56%)]">
          <div className="container mx-auto px-4 py-10">
            <h1 className="font-display text-3xl md:text-4xl font-bold">편입 서비스</h1>
            <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
              합격 가능성 예측, 전략 Q&A, 학습 Q&A를 중심으로 편입 수험 정보를 빠르게 확인합니다.
            </p>
            <div className="flex flex-wrap gap-2 mt-5">
              <Button asChild className="bg-emerald-700 hover:bg-emerald-800">
                <Link href="/community/transfer">편입 커뮤니티</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/c/transfer/qa">전략 Q&A</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/c/transfer/study-qa">학습 Q&A</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4 grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
            <div className="space-y-4">
              <TransferPredictor rows={cutoffRows} />
              <CutoffTable rows={cutoffRows} />
            </div>

            <div className="space-y-4">
              <Card className="border-none shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">
                    <Link href="/c/transfer/cutoff" className="hover:text-emerald-700 transition-colors">
                      AI 오늘의 편입 정보
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {briefingRows.map((row) => (
                    <div key={row.id} className="rounded-lg border border-gray-100 p-3">
                      <p className="text-sm font-semibold">{row.title}</p>
                      <p className="text-xs text-gray-600 mt-1">{row.summary}</p>
                      <p className="text-[11px] text-emerald-700 mt-2">
                        {row.sourceLabel} · {row.publishedAt} · {row.boardName}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">
                    <Link href="/c/transfer/qa" className="hover:text-emerald-700 transition-colors">
                      편입 전략 Q&A
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {qaRows.map((row) => (
                    <Link
                      key={row.id}
                      href={`/c/transfer/qa/${row.id}`}
                      className="block rounded-lg border border-gray-100 p-3 hover:bg-emerald-50/40 transition-colors"
                    >
                      <p className="text-sm font-medium line-clamp-2 hover:text-emerald-700">
                        {row.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-2">댓글 {row.commentCount} · {formatRelativeTime(row.createdAt)}</p>
                    </Link>
                  ))}
                  {!qaRows.length && <p className="text-sm text-gray-500">아직 등록된 Q&A가 없습니다.</p>}
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">
                    <Link href="/c/transfer/study-qa" className="hover:text-emerald-700 transition-colors">
                      편입 학습 Q&A
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {studyQaRows.map((row) => (
                    <Link
                      key={row.id}
                      href={`/c/transfer/study-qa/${row.id}`}
                      className="block rounded-lg border border-gray-100 p-3 hover:bg-emerald-50/40 transition-colors"
                    >
                      <p className="text-sm font-medium line-clamp-2 hover:text-emerald-700">
                        {row.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-2">댓글 {row.commentCount} · {formatRelativeTime(row.createdAt)}</p>
                    </Link>
                  ))}
                  {!studyQaRows.length && <p className="text-sm text-gray-500">아직 등록된 학습 Q&A가 없습니다.</p>}
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">
                    <Link href="/c/transfer/free" className="hover:text-emerald-700 transition-colors">
                      오늘의 인기글
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {popularRows.map((row) => (
                    <Link
                      key={row.id}
                      href={`/c/transfer/${row.boardSlug}/${row.id}`}
                      className="block rounded-lg border border-gray-100 p-3 hover:bg-emerald-50/40 transition-colors"
                    >
                      <p className="text-sm font-medium line-clamp-2 hover:text-emerald-700">
                        {row.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        {row.boardName} · 댓글 {row.commentCount} · 좋아요 {row.likeCount} · 조회 {row.viewCount}
                      </p>
                    </Link>
                  ))}
                  {!popularRows.length && <p className="text-sm text-gray-500">아직 집계된 인기글이 없습니다.</p>}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
