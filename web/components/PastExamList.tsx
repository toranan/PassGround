import { Download } from "lucide-react";
import { pastExamDownloadUrl, type PastExamFile, type PastExamSchool } from "@/lib/pastExams";

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

// 학년도마다 과목 한 줄에 [문제] [정답] 버튼을 둔다. 정답이 없으면 빈 칸으로 보여준다.
export function PastExamYears({ entry }: { entry: PastExamSchool }) {
  return (
    <div>
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
  );
}
