import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { NewsRows } from "@/components/TransferFeedLists";
import { loadNewsPage } from "@/lib/transferFeeds";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "최신뉴스",
  description: "대학별 편입 모집요강·기본계획·입학처 공지를 모아 봅니다.",
};

const PAGE_SIZE = 30;

type NewsPageProps = { searchParams: Promise<{ page?: string }> };

export default async function NewsPage({ searchParams }: NewsPageProps) {
  const requested = Number.parseInt((await searchParams).page ?? "1", 10);
  const page = Number.isFinite(requested) && requested > 1 ? requested : 1;
  const { items: news, hasMore } = await loadNewsPage(page, PAGE_SIZE);
  const pageHref = (target: number) => (target <= 1 ? "/news" : `/news?page=${target}`);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar />
      <main className="container mx-auto max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold">최신뉴스</h1>
        <p className="mt-1 text-sm text-muted-foreground">대학별 모집요강·기본계획·입학처 공지를 모았어요.</p>
        <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
          <NewsRows news={news} />
        </section>
        {page > 1 || hasMore ? (
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label="최신뉴스 페이지">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary">
                <ChevronLeft className="h-4 w-4" />
                최근 글
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted-foreground">{page}페이지</span>
            {hasMore ? (
              <Link href={pageHref(page + 1)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary">
                이전 글
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </main>
    </div>
  );
}
