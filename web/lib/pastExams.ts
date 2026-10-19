// 기출문제 탭: upload-past-exams.mjs가 Storage(past-exams)에 올린 index.json을 읽는다.
export type PastExamFile = {
  year: number;
  school: string;
  subject: string;
  kind: string;
  ext: string;
  filename: string;
  size: number;
  path: string;
};

// 같은 학교·학년도·과목의 문제와 정답을 한 줄로 묶는다. 정답은 나중에 올라와도 같은 줄에 붙는다.
export type PastExamRow = { subject: string; question: PastExamFile | null; answer: PastExamFile | null; combined: PastExamFile | null };
export type PastExamSchool = { school: string; years: Array<{ year: number; rows: PastExamRow[] }>; count: number; answerCount: number };

const BUCKET = "past-exams";

function storagePublicBase(): string {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
  return `${url}/storage/v1/object/public/${BUCKET}`;
}

export async function loadPastExams(): Promise<PastExamFile[]> {
  try {
    const response = await fetch(`${storagePublicBase()}/index.json`, { next: { revalidate: 300 } });
    if (!response.ok) return [];
    const data = (await response.json()) as { items?: PastExamFile[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

// download 파라미터로 받을 때 한글 파일 이름이 그대로 저장되게 한다.
export function pastExamDownloadUrl(file: PastExamFile): string {
  return `${storagePublicBase()}/${file.path}?download=${encodeURIComponent(file.filename)}`;
}

function toRows(files: PastExamFile[]): PastExamRow[] {
  const rows = new Map<string, PastExamRow>();
  for (const file of files) {
    const row = rows.get(file.subject) ?? { subject: file.subject, question: null, answer: null, combined: null };
    if (file.kind === "정답") row.answer = file;
    else if (file.kind === "문제및정답") row.combined = file;
    else row.question = file;
    rows.set(file.subject, row);
  }
  return [...rows.values()].sort((a, b) => a.subject.localeCompare(b.subject, "ko"));
}

export function groupPastExamsBySchool(files: PastExamFile[]): PastExamSchool[] {
  const schools = new Map<string, Map<number, PastExamFile[]>>();
  for (const file of files) {
    const years = schools.get(file.school) ?? new Map<number, PastExamFile[]>();
    years.set(file.year, [...(years.get(file.year) ?? []), file]);
    schools.set(file.school, years);
  }
  return [...schools.entries()]
    .map(([school, years]) => {
      const all = [...years.values()].flat();
      return {
        school,
        count: all.length,
        answerCount: all.filter((file) => file.kind !== "문제").length,
        years: [...years.entries()].sort((a, b) => b[0] - a[0]).map(([year, list]) => ({ year, rows: toRows(list) })),
      };
    })
    .sort((a, b) => a.school.localeCompare(b.school, "ko"));
}
