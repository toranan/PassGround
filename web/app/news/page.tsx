import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { NewsRows } from "@/components/TransferFeedLists";
import { loadLatestNews } from "@/lib/transferFeeds";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "최신뉴스",
  description: "대학별 편입 모집요강·기본계획·입학처 공지를 모아 봅니다.",
};

export default async function NewsPage() {
  const news = await loadLatestNews(60);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar />
      <main className="container mx-auto max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold">최신뉴스</h1>
        <p className="mt-1 text-sm text-muted-foreground">대학별 모집요강·기본계획·입학처 공지를 모았어요.</p>
        <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
          <NewsRows news={news} />
        </section>
      </main>
    </div>
  );
}
