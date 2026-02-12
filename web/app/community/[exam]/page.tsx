import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { CutoffMaskedTitle } from "@/components/CutoffMaskedTitle";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BOARD_POST_GROUPS, COMMUNITY_BOARD_GROUPS } from "@/lib/data";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { BadgeCheck, ChevronRight, Coins } from "lucide-react";

type CommunityExamPageProps = {
  params: Promise<{
    exam: string;
  }>;
};

type PreviewPost = {
  id: string;
  title: string;
  timeLabel: string;
};

function formatRelativeTime(timeStr: string): string {
  const date = new Date(timeStr);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "방금";
  if (diffMinutes < 60) return `${diffMinutes}분`;
  if (diffHours < 24) return `${diffHours}시간`;
  if (diffDays < 7) return `${diffDays}일`;
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

export default async function CommunityExamPage({ params }: CommunityExamPageProps) {
  const { exam } = await params;

  if (!ENABLE_CPA && exam === "cpa") {
    notFound();
  }
  const isReadOnlyExam = exam === "cpa" && !ENABLE_CPA_WRITE;

  const group = COMMUNITY_BOARD_GROUPS.find((item) => item.examSlug === exam);

  if (!group) {
    notFound();
  }

  const latestPostsByBoard = new Map<string, PreviewPost[]>();
  const boardSlugs = group.boards.map((board) => board.slug);

  const fallbackPostsByBoard = new Map(
    BOARD_POST_GROUPS.filter((item) => item.examSlug === group.examSlug).map((item) => [
      item.boardSlug,
      item.posts.slice(0, 3).map((post) => ({
        id: post.id,
        title: post.title,
        timeLabel: post.time,
      })),
    ])
  );

  try {
    const supabase = getSupabaseServer();
    const { data: boardRows } = await supabase
      .from("boards")
      .select("id,slug,exams!inner(slug)")
      .eq("exams.slug", group.examSlug)
      .in("slug", boardSlugs);

    const boardIdBySlug = new Map<string, string>();
    const boardSlugById = new Map<string, string>();

    (boardRows ?? []).forEach((boardRow) => {
      const row = boardRow as { id: string; slug: string };
      boardIdBySlug.set(row.slug, row.id);
      boardSlugById.set(row.id, row.slug);
    });

    const boardIds = Array.from(boardSlugById.keys());

    if (boardIds.length > 0) {
      const { data: postRows } = await supabase
        .from("posts")
        .select("id,title,created_at,board_id")
        .in("board_id", boardIds)
        .order("created_at", { ascending: false })
        .limit(240);

      (postRows ?? []).forEach((postRow) => {
        const post = postRow as { id: string; title: string; created_at: string | null; board_id: string };
        const boardSlug = boardSlugById.get(post.board_id);
        if (!boardSlug) return;

        const current = latestPostsByBoard.get(boardSlug) ?? [];
        if (current.length >= 3) return;

        current.push({
          id: post.id,
          title: post.title,
          timeLabel: post.created_at ? formatRelativeTime(post.created_at) : "방금",
        });
        latestPostsByBoard.set(boardSlug, current);
      });
    }
  } catch {
    // Fall back to local seed preview if DB read fails.
  }

  boardSlugs.forEach((slug) => {
    if ((latestPostsByBoard.get(slug) ?? []).length > 0) return;
    const fallback = fallbackPostsByBoard.get(slug);
    if (fallback && fallback.length > 0) {
      latestPostsByBoard.set(slug, fallback);
    }
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.10),transparent_60%)]">
          <div className="container mx-auto px-4 py-10">
            <h1 className="font-display text-3xl font-bold">{group.examName} 커뮤니티</h1>
            <p className="text-sm text-muted-foreground mt-2">{group.description}</p>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4 grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-fit">
              {group.boards.map((board) => {
                const previewPosts = latestPostsByBoard.get(board.slug) ?? [];
                const shouldMaskCutoffTitles = group.examSlug === "transfer" && board.slug === "cutoff";

                return (
                  <Link key={board.id} href={`/c/${group.examSlug}/${board.slug}`} className="block group">
                    <Card className="border-none shadow-lg transition-all group-hover:shadow-xl group-hover:-translate-y-0.5 cursor-pointer">
                      <CardHeader className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-lg">{board.name}</CardTitle>
                          {isReadOnlyExam && <span className="text-xs text-gray-500">읽기 전용</span>}
                        </div>

                        <CardDescription className="text-sm">{board.description}</CardDescription>

                        <div className="rounded-md bg-muted/55 px-3 py-2.5">
                          <p className="text-xs font-medium text-muted-foreground mb-2">게시글</p>
                          {previewPosts.length > 0 ? (
                            <ul className="space-y-1.5">
                              {previewPosts.map((post) => (
                                <li key={post.id} className="flex items-start justify-between gap-3 text-sm">
                                  <span className="line-clamp-1 text-foreground">
                                    <CutoffMaskedTitle
                                      title={post.title}
                                      shouldMaskForGuest={shouldMaskCutoffTitles}
                                    />
                                  </span>
                                  <span className="shrink-0 text-xs text-muted-foreground">{post.timeLabel}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-muted-foreground">아직 글이 없습니다.</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 text-sm font-medium text-primary">
                          바로 입장
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      </CardHeader>
                    </Card>
                  </Link>
                );
              })}
            </div>

            <aside className="space-y-4">
              <Card className="border-none shadow-lg">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4 text-primary" />
                    인증 신청
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {isReadOnlyExam
                      ? "CPA 인증 신청은 준비 중입니다."
                      : "인증 배지로 답변 신뢰도를 높이세요."}
                  </CardDescription>
                  {!isReadOnlyExam && (
                    <Button asChild size="sm" className="bg-primary hover:bg-primary/90 w-fit">
                      <Link href="/verification">인증하기</Link>
                    </Button>
                  )}
                </CardHeader>
              </Card>

              <Card className="border-none shadow-lg">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Coins className="h-4 w-4 text-amber-600" />
                    포인트
                  </CardTitle>
                  <CardDescription className="text-sm">
                    채택 답변 포인트를 확인하고 보상으로 교환하세요.
                  </CardDescription>
                  <Button asChild size="sm" variant="outline" className="w-fit">
                    <Link href="/mypage">내 포인트 보기</Link>
                  </Button>
                </CardHeader>
              </Card>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}
