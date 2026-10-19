import type { Metadata } from "next";
import { Download } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { groupPastExamsBySchool, loadPastExams, pastExamDownloadUrl, type PastExamFile } from "@/lib/pastExams";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "편입 기출문제",
  description: "대학별 편입학 필기시험 기출문제와 정답을 학교·연도·과목별로 모아 바로 내려받습니다.",
};

type PastExamsPageProps = { searchParams: Promise<{ q?: string }> };

function FileButton({ file, label, tone }: { file: PastExamFile | null; label: string; tone: "question" | "answer" }) {
  if (!file) {
    return (
      <span className="inline-flex min-w-[4.5rem] justify-center rounded-lg border border-dashed px-2 py-1.5 text-xs text-gray-300">
        {label}
      </span>
    );
  }
  const style = tone === "question"
    ? "border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
    : "border-[#047857]/30 text-[#047857] hover:bg-[#047857] hover:text-white";
  return (
    <a
      href={pastExamDownloadUrl(file)}
      className={`inline-flex min-w-[4.5rem] items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${style}`}
    >
      <Download className="h-3 w-3" />
      {label}
    </a>
  );
}

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
        <h1 className="text-2xl font-bold">기출문제</h1>
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

        <div className="mt-6 space-y-3">
          {schools.map((entry) => (
            <details key={entry.school} className="rounded-2xl border bg-white shadow-sm" open={Boolean(query)}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                <span className="font-semibold">{entry.school}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {entry.years.at(-1)?.year}~{entry.years[0]?.year}학년도
                  {entry.answerCount ? (
                    <span className="rounded-full bg-[#ecfdf5] px-2 py-0.5 font-semibold text-[#047857]">정답 있음</span>
                  ) : null}
                </span>
              </summary>
              <div className="border-t px-5 pb-2">
                {entry.years.map(({ year, rows }) => (
                  <section key={year} className="border-b py-3 last:border-b-0">
                    <h3 className="mb-2 text-sm font-bold text-gray-500">{year}학년도</h3>
                    <ul className="space-y-1.5">
                      {rows.map((row) => (
                        <li key={row.subject} className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-sm">{row.subject}</span>
                          <span className="flex shrink-0 gap-1.5">
                            {row.combined ? (
                              <FileButton file={row.combined} label={row.combined.ext === ".zip" ? "문제+정답 zip" : "문제+정답"} tone="question" />
                            ) : (
                              <>
                                <FileButton file={row.question} label={row.question?.ext === ".zip" ? "문제 zip" : "문제"} tone="question" />
                                <FileButton file={row.answer} label="정답" tone="answer" />
                              </>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </details>
          ))}
          {!schools.length ? (
            <p className="rounded-2xl border bg-white py-12 text-center text-sm text-muted-foreground">
              {query ? "해당 학교의 기출문제가 아직 없어요." : "기출문제를 준비 중이에요."}
            </p>
          ) : null}
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          정답 칸이 비어 있으면 학교가 정답을 공개하지 않은 경우예요. 정답이 올라오면 같은 줄에 바로 추가돼요.
        </p>
      </main>
    </div>
  );
}
