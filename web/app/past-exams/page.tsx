import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { groupPastExamsBySchool, loadPastExams, pastExamSchoolPath } from "@/lib/pastExams";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "편입 기출문제 모음 (대학별 다운로드)",
  description: "건국대·중앙대·한양대·경희대 등 대학별 편입학 필기시험 기출문제와 정답을 학교·학년도·과목별로 모아 바로 내려받습니다.",
  alternates: { canonical: "/past-exams" },
};

type PastExamsPageProps = { searchParams: Promise<{ q?: string }> };

export default async function PastExamsPage({ searchParams }: PastExamsPageProps) {
  const { q = "" } = await searchParams;
  const query = q.trim().replace(/\s+/g, "");
  const schools = groupPastExamsBySchool(await loadPastExams()).filter(
    (entry) => !query || entry.school.replace(/\s+/g, "").includes(query)
  );

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar />
      <main className="container mx-auto max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold">편입 기출문제</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          각 대학 입학처가 공개한 편입 필기시험 기출문제를 학교·학년도·과목별로 모았어요.
        </p>

        <form action="/past-exams" className="mt-6 flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="학교 이름으로 찾기"
            className="h-10 min-w-0 flex-1 rounded-xl border bg-white px-3 text-sm outline-none focus:border-primary"
          />
          <button className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">검색</button>
        </form>

        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {schools.map((entry) => (
            <li key={entry.school}>
              <Link
                href={pastExamSchoolPath(entry.school)}
                className="flex items-center justify-between gap-3 rounded-2xl border bg-white px-5 py-4 shadow-sm transition-colors hover:border-primary"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{entry.school}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    {entry.years.at(-1)?.year}~{entry.years[0]?.year}학년도
                    {entry.answerCount ? (
                      <span className="rounded-full bg-[#ecfdf5] px-2 py-0.5 font-semibold text-[#047857]">정답 있음</span>
                    ) : null}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
        {!schools.length ? (
          <p className="mt-6 rounded-2xl border bg-white py-12 text-center text-sm text-muted-foreground">
            {query ? "해당 학교의 기출문제가 아직 없어요." : "기출문제를 준비 중이에요."}
          </p>
        ) : null}
      </main>
    </div>
  );
}
