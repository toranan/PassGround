import { NextResponse } from "next/server";
import { groupPastExamsBySchool, loadPastExams, pastExamDownloadUrl, pastExamViewUrl, type PastExamFile } from "@/lib/pastExams";

// 앱 기출문제 탭용. 웹과 같은 묶음(학교 → 학년도 → 과목별 문제·정답)에 내려받기 주소를 붙여 준다.
function toFile(file: PastExamFile | null) {
  return file ? { url: pastExamViewUrl(file), downloadUrl: pastExamDownloadUrl(file), filename: file.filename, ext: file.ext } : null;
}

export async function GET() {
  const schools = groupPastExamsBySchool(await loadPastExams()).map((entry) => ({
    school: entry.school,
    count: entry.count,
    answerCount: entry.answerCount,
    years: entry.years.map(({ year, rows }) => ({
      year,
      rows: rows.map((row) => ({
        subject: row.subject,
        question: toFile(row.question),
        combined: toFile(row.combined),
        answers: row.answers.map((answer) => ({ label: answer.label, file: toFile(answer.file) })),
        // 예전 앱 버전 호환: 첫 번째 정답
        answer: toFile(row.answers.find((answer) => answer.file.kind.startsWith("정답"))?.file ?? null),
      })),
    })),
  }));
  const response = NextResponse.json({ schools });
  response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  return response;
}
