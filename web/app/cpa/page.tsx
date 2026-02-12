import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BOARD_POST_GROUPS, DAILY_BRIEFING_SEED, INSTRUCTOR_RANKING_SEED } from "@/lib/data";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type RankingRow = {
  id: string;
  subject: string;
  instructorName: string;
  rank: number;
  trend: string;
  confidence: number;
};

type BriefingRow = {
  id: string;
  title: string;
  summary: string;
  sourceLabel: string;
  publishedAt: string;
};

type QaRow = {
  id: string;
  title: string;
  commentCount: number;
  createdAt: string | null;
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

async function loadRankings(): Promise<RankingRow[]> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("instructor_rankings")
    .select("id,subject,instructor_name,rank,trend,confidence")
    .eq("exam_slug", "cpa")
    .order("rank", { ascending: true })
    .limit(10);

  if (error || !data?.length) {
    return INSTRUCTOR_RANKING_SEED
      .filter((row) => row.examSlug === "cpa")
      .map((row) => ({
        id: row.id,
        subject: row.subject,
        instructorName: row.instructorName,
        rank: row.rank,
        trend: row.trend,
        confidence: row.confidence,
      }));
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

async function loadBriefings(): Promise<BriefingRow[]> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("daily_briefings")
    .select("id,title,summary,source_label,published_at")
    .eq("exam_slug", "cpa")
    .order("published_at", { ascending: false })
    .limit(5);

  if (error || !data?.length) {
    return DAILY_BRIEFING_SEED
      .filter((row) => row.examSlug === "cpa")
      .map((row) => ({
        id: row.id,
        title: row.title,
        summary: row.summary,
        sourceLabel: row.sourceLabel,
        publishedAt: row.publishedAt,
      }));
  }

  return data.map((row: { id: string; title: string; summary: string; source_label: string; published_at: string }) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    sourceLabel: row.source_label,
    publishedAt: row.published_at,
  }));
}

async function loadQaRows(): Promise<QaRow[]> {
  const supabase = getSupabaseServer();

  const { data: examData } = await supabase
    .from("exams")
    .select("id")
    .eq("slug", "cpa")
    .maybeSingle();

  if (!examData?.id) {
    const fallbackPosts = BOARD_POST_GROUPS.find((group) => group.examSlug === "cpa" && group.boardSlug === "qa")?.posts ?? [];
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
    .eq("slug", "qa")
    .maybeSingle();

  if (!boardData?.id) {
    const fallbackPosts = BOARD_POST_GROUPS.find((group) => group.examSlug === "cpa" && group.boardSlug === "qa")?.posts ?? [];
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

export default async function CpaPage() {
  if (!ENABLE_CPA) {
    notFound();
  }

  const [rankingRows, briefingRows, qaRows] = await Promise.all([
    loadRankings(),
    loadBriefings(),
    loadQaRows(),
  ]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.10),transparent_58%)]">
          <div className="container mx-auto px-4 py-10">
            <h1 className="font-display text-3xl md:text-4xl font-bold">CPA 서비스</h1>
            <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
              {ENABLE_CPA_WRITE
                ? "검증된 답변과 전문 수험 정보를 중심으로 CPA 학습 효율을 높입니다."
                : "현재는 둘러보기(읽기 전용)로 운영 중이며, 쓰기 기능은 추후 오픈됩니다."}
            </p>
            <div className="flex gap-2 mt-5">
              <Button asChild className="bg-primary hover:bg-primary/90">
                <Link href="/community/cpa">CPA 커뮤니티</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/c/cpa/qa">전문 Q&A</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4 grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">AI 선호 강사 순위표 (CPA)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {rankingRows.map((row) => (
                  <div key={row.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                    <div>
                      <p className="text-xs text-gray-500">{row.subject}</p>
                      <p className="text-sm font-semibold">{row.rank}위 {row.instructorName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">변동 {row.trend}</p>
                      <p className="text-xs text-primary">신뢰도 {row.confidence}%</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border-none shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">CPA 전문 Q&A</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {qaRows.map((row) => (
                    <Link key={row.id} href={`/c/cpa/qa/${row.id}`} className="block rounded-lg border border-border p-3 hover:bg-accent transition-colors">
                      <p className="text-sm font-medium line-clamp-2">{row.title}</p>
                      <p className="text-xs text-gray-500 mt-2">댓글 {row.commentCount} · {formatRelativeTime(row.createdAt)}</p>
                    </Link>
                  ))}
                  {!qaRows.length && <p className="text-sm text-gray-500">아직 등록된 Q&A가 없습니다.</p>}
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">AI 오늘의 CPA 정보</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {briefingRows.map((row) => (
                    <div key={row.id} className="rounded-lg border border-gray-100 p-3">
                      <p className="text-sm font-semibold">{row.title}</p>
                      <p className="text-xs text-gray-600 mt-1">{row.summary}</p>
                      <p className="text-[11px] text-primary mt-2">{row.sourceLabel} · {row.publishedAt}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">인증/포인트</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {ENABLE_CPA_WRITE
                      ? "1차 합격/현직 회계사 인증으로 답변 신뢰도를 높입니다."
                      : "CPA 인증/포인트 적립 기능은 준비 중이며 현재는 열람만 가능합니다."}
                  </p>
                  <div className="flex gap-2">
                    {ENABLE_CPA_WRITE && (
                      <Button asChild size="sm" className="bg-primary hover:bg-primary/90">
                        <Link href="/verification">인증 신청</Link>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="outline">
                      <Link href="/mypage">포인트 확인</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
