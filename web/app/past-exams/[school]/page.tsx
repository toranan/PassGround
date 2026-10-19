import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Sparkles } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { PastExamYears } from "@/components/PastExamList";
import { NewsRows, ScheduleRows } from "@/components/TransferFeedLists";
import { groupPastExamsBySchool, loadPastExams, schoolAliases } from "@/lib/pastExams";
import { loadLatestNews, loadUpcomingSchedules } from "@/lib/transferFeeds";

export const revalidate = 300;

type SchoolPageProps = { params: Promise<{ school: string }> };

async function loadSchool(raw: string) {
  const school = decodeURIComponent(raw);
  const entry = groupPastExamsBySchool(await loadPastExams()).find((item) => item.school === school);
  return entry ?? null;
}

export async function generateMetadata({ params }: SchoolPageProps): Promise<Metadata> {
  const entry = await loadSchool((await params).school);
  if (!entry) return {};
  const range = `${entry.years.at(-1)?.year}~${entry.years[0]?.year}`;
  const short = schoolAliases(entry.school).at(-1);
  const title = `${entry.school} 편입 기출문제 (${range}학년도) 다운로드`;
  const description = `${short} 편입 필기시험 기출문제 ${range}학년도${entry.answerCount ? "와 정답" : ""}을 과목별로 바로 내려받고, 2027학년도 ${short} 편입 일정과 최신 소식도 함께 확인하세요.`;
  return {
    title,
    description,
    alternates: { canonical: `/past-exams/${encodeURIComponent(entry.school)}` },
    openGraph: { title, description, type: "website" },
  };
}

export default async function PastExamSchoolPage({ params }: SchoolPageProps) {
  const entry = await loadSchool((await params).school);
  if (!entry) notFound();

  const aliases = schoolAliases(entry.school);
  const matches = (text: string | null) => aliases.some((alias) => (text ?? "").replace(/\s+/g, "").includes(alias));
  const [schedules, news] = await Promise.all([loadUpcomingSchedules(), loadLatestNews(60)]);
  const schoolSchedules = schedules.filter((item) => matches(item.university) || matches(item.title)).slice(0, 6);
  const schoolNews = news.filter((item) => matches(item.title)).slice(0, 5);
  const short = aliases.at(-1) ?? entry.school;
  const aiQuestion = `${short} 2027 편입 전형이랑 필기 과목 알려줘`;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar />
      <main className="container mx-auto max-w-3xl flex-1 px-4 py-8">
        <Link href="/past-exams" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
          <ChevronLeft className="h-4 w-4" />
          기출문제 전체
        </Link>
        <h1 className="mt-3 text-2xl font-bold">{entry.school} 편입 기출문제</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {entry.school} 입학처가 공개한 편입 필기시험 기출문제예요.
          {entry.answerCount ? " 정답도 함께 받을 수 있어요." : " 정답은 학교가 공개하지 않았어요."}
        </p>

        <section className="mt-6 rounded-2xl border bg-white px-5 py-2 shadow-sm">
          <PastExamYears entry={entry} />
        </section>

        <Link
          href={`/transfer/ai?q=${encodeURIComponent(aiQuestion)}`}
          className="mt-6 flex items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-4 text-primary-foreground hover:bg-primary/90"
        >
          <span>
            <span className="block font-semibold">{short} 편입, AI에게 물어보기</span>
            <span className="text-xs opacity-80">2027 전형·필기 과목·공인영어 반영을 바로 알려드려요</span>
          </span>
          <Sparkles className="h-5 w-5 shrink-0" />
        </Link>

        <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold">{short} 2027 편입 일정</h2>
          <ScheduleRows schedules={schoolSchedules} />
        </section>

        {schoolNews.length ? (
          <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">{short} 최신뉴스</h2>
            <NewsRows news={schoolNews} />
          </section>
        ) : null}
      </main>
    </div>
  );
}
