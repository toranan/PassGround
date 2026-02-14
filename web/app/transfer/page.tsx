import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { CutoffTable } from "@/components/CutoffTable";
import { TransferRankingTabs } from "@/components/TransferRankingTabs";
import { TransferPredictor } from "@/components/TransferPredictor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type RankingRow = {
  id: string;
  subject: string;
  instructorName: string;
  rank: number;
  trend: string;
  confidence: number;
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
    return [];
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
    return [];
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

  if (!examData?.id) return [];

  const { data: boardData } = await supabase
    .from("boards")
    .select("id")
    .eq("exam_id", examData.id)
    .eq("slug", boardSlug)
    .maybeSingle();

  if (!boardData?.id) return [];

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

  if (!examData?.id) return [];

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

async function loadRankings(): Promise<RankingRow[]> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("instructor_rankings")
    .select("id,subject,instructor_name,rank,trend,confidence")
    .eq("exam_slug", "transfer")
    .order("rank", { ascending: true })
    .limit(12);

  if (error || !data?.length) {
    return [];
  }

  return data.map((row: { id: string; subject: string; instructor_name: string; rank: number; trend: string | null; confidence: number | null }) => ({
    id: row.id,
    subject: row.subject,
    instructorName: row.instructor_name,
    rank: row.rank,
    trend: row.trend ?? "-",
    confidence: row.confidence ?? 0,
  }));
}

export default async function TransferPage() {
  const [cutoffRows, briefingRows, qaRows, studyQaRows, popularRows, rankingRows] = await Promise.all([
    loadCutoffs(),
    loadBriefings(),
    loadQaRows(),
    loadStudyQaRows(),
    loadPopularRows(),
    loadRankings(),
  ]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-secondary bg-[radial-gradient(circle_at_top,oklch(0.52_0.2_265_/_0.15),transparent_58%)]">
          <div className="container mx-auto px-4 py-10">
            <h1 className="font-display text-3xl md:text-4xl font-bold text-primary">편입 커뮤니티</h1>
            <p className="text-sm text-primary/80 mt-3 max-w-2xl">
              수험생들의 정보 불균형 해소를 위해 다양한 정보를 제공합니다. 질문을 남겨주시면 편입 합격생 출신 운영자가 한 분 한 분 상세히 답변드립니다.
            </p>
            <div className="flex flex-wrap gap-2 mt-5">
              <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Link href="/community/transfer">편입 커뮤니티</Link>
              </Button>
              <Button asChild variant="outline" className="border-border text-primary hover:bg-accent">
                <Link href="/c/transfer/qa">전략 Q&A</Link>
              </Button>
              <Button asChild variant="outline" className="border-border text-primary hover:bg-accent">
                <Link href="/c/transfer/study-qa">학습 Q&A</Link>
              </Button>
              <Button asChild variant="outline" className="border-border text-primary hover:bg-accent">
                <Link href="/transfer/instructor-ranking">인기 강사 순위</Link>
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
              <Card className="border border-border shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">
                    <Link href="/c/transfer/cutoff" className="hover:text-primary transition-colors">
                      AI 오늘의 편입 정보
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {briefingRows.map((row) => (
                    <div key={row.id} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-semibold">{row.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{row.summary}</p>
                      <p className="text-[11px] text-primary mt-2">
                        {row.sourceLabel} · {row.publishedAt} · {row.boardName}
                      </p>
                    </div>
                  ))}
                  {!briefingRows.length && (
                    <p className="text-sm text-muted-foreground">아직 등록된 편입 정보가 없습니다.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-border shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">
                    <Link href="/transfer/instructor-ranking" className="hover:text-primary transition-colors">
                      편입 인기 강사 순위
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TransferRankingTabs rows={rankingRows} />
                </CardContent>
              </Card>

              <Card className="border border-border shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">
                    <Link href="/c/transfer/qa" className="hover:text-primary transition-colors">
                      편입 전략 Q&A
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {qaRows.map((row) => (
                    <Link
                      key={row.id}
                      href={`/c/transfer/qa/${row.id}`}
                      className="block rounded-lg border border-border p-3 hover:bg-accent transition-colors"
                    >
                      <p className="text-sm font-medium line-clamp-2 hover:text-primary">
                        {row.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">댓글 {row.commentCount} · {formatRelativeTime(row.createdAt)}</p>
                    </Link>
                  ))}
                  {!qaRows.length && <p className="text-sm text-muted-foreground">아직 등록된 Q&A가 없습니다.</p>}
                </CardContent>
              </Card>

              <Card className="border border-border shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">
                    <Link href="/c/transfer/study-qa" className="hover:text-primary transition-colors">
                      편입 학습 Q&A
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {studyQaRows.map((row) => (
                    <Link
                      key={row.id}
                      href={`/c/transfer/study-qa/${row.id}`}
                      className="block rounded-lg border border-border p-3 hover:bg-accent transition-colors"
                    >
                      <p className="text-sm font-medium line-clamp-2 hover:text-primary">
                        {row.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">댓글 {row.commentCount} · {formatRelativeTime(row.createdAt)}</p>
                    </Link>
                  ))}
                  {!studyQaRows.length && <p className="text-sm text-muted-foreground">아직 등록된 학습 Q&A가 없습니다.</p>}
                </CardContent>
              </Card>

              <Card className="border border-border shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">
                    <Link href="/c/transfer/free" className="hover:text-primary transition-colors">
                      오늘의 인기글
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {popularRows.map((row) => (
                    <Link
                      key={row.id}
                      href={`/c/transfer/${row.boardSlug}/${row.id}`}
                      className="block rounded-lg border border-border p-3 hover:bg-accent transition-colors"
                    >
                      <p className="text-sm font-medium line-clamp-2 hover:text-primary">
                        {row.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {row.boardName} · 댓글 {row.commentCount} · 좋아요 {row.likeCount} · 조회 {row.viewCount}
                      </p>
                    </Link>
                  ))}
                  {!popularRows.length && <p className="text-sm text-muted-foreground">아직 집계된 인기글이 없습니다.</p>}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
