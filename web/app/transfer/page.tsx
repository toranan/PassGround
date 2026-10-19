import Link from "next/link";
import { ArrowRight, MessageCircle, Sparkles } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { NewsRows, ScheduleRows } from "@/components/TransferFeedLists";
import { loadLatestNews, loadRecentCommunityPosts, loadUpcomingSchedules } from "@/lib/transferFeeds";

export const dynamic = "force-dynamic";

function SectionCard({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        <Link href={href} className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary">
          전체보기 <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {children}
    </section>
  );
}

export default async function TransferPage() {
  const [news, schedules, posts] = await Promise.all([
    loadLatestNews(6),
    loadUpcomingSchedules(6),
    loadRecentCommunityPosts(8),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.13),transparent_58%)] bg-white">
          <div className="container mx-auto px-4 py-10 md:py-14">
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">
              편입 준비, <span className="text-primary">합격판</span> 하나로
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
              대학별 모집요강·일정을 한곳에서 보고, 궁금한 건 AI에게 바로 물어보세요.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                href="/transfer/ai"
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Sparkles className="h-4 w-4" />
                AI에게 물어보기
              </Link>
              <Link
                href="/c/transfer/free"
                className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold hover:border-primary"
              >
                <MessageCircle className="h-4 w-4" />
                커뮤니티 둘러보기
              </Link>
            </div>
          </div>
        </section>

        <div className="container mx-auto grid grid-cols-[minmax(0,1fr)] gap-6 px-4 py-8 lg:grid-cols-2">
          <SectionCard title="다가오는 일정" href="/schedule">
            <ScheduleRows schedules={schedules} />
          </SectionCard>

          <SectionCard title="최신뉴스" href="/news">
            <NewsRows news={news} />
          </SectionCard>

          <div className="lg:col-span-2">
            <SectionCard title="커뮤니티" href="/c/transfer/free">
              {posts.length ? (
                <ul className="grid grid-cols-1 gap-x-8 divide-y md:grid-cols-2 md:divide-y-0">
                  {posts.map((post) => (
                    <li key={post.id} className="py-2.5">
                      <Link href={`/c/transfer/${post.boardSlug}/${post.id}`} className="flex items-center gap-2 hover:text-primary">
                        <span className="shrink-0 text-xs font-semibold text-primary">{post.boardName}</span>
                        <span className="truncate text-sm">{post.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">아직 게시글이 없어요. 첫 글을 남겨보세요!</p>
              )}
            </SectionCard>
          </div>
        </div>
      </main>
    </div>
  );
}
