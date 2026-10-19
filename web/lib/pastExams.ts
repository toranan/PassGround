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

// 같은 학교·학년도·과목의 문제와 정답·해설을 한 줄로 묶는다. 정답은 나중에 올라와도 같은 줄에 붙는다.
export type PastExamAnswer = { label: string; file: PastExamFile };
export type PastExamRow = { subject: string; question: PastExamFile | null; combined: PastExamFile | null; answers: PastExamAnswer[] };
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

// 앱에서 PDF를 바로 열 때는 download 없이 연다.
export function pastExamViewUrl(file: PastExamFile): string {
  return `${storagePublicBase()}/${file.path}`;
}

// download 파라미터로 받을 때 한글 파일 이름이 그대로 저장되게 한다.
export function pastExamDownloadUrl(file: PastExamFile): string {
  return `${storagePublicBase()}/${file.path}?download=${encodeURIComponent(file.filename)}`;
}

// "정답" → 정답, "정답(영어)" → 영어 정답, "해설" → 해설. 정답이 해설보다 앞에 온다.
function answerLabel(kind: string): string {
  const match = kind.match(/^(정답|해설)(?:\(([^)]+)\))?$/);
  if (!match) return kind;
  return match[2] ? `${match[2]} ${match[1]}` : match[1];
}

function answerOrder(kind: string): number {
  if (kind === "정답") return 0;
  if (kind.startsWith("정답")) return 1;
  return 2;
}

function toRows(files: PastExamFile[]): PastExamRow[] {
  const rows = new Map<string, PastExamRow>();
  for (const file of files) {
    const row = rows.get(file.subject) ?? { subject: file.subject, question: null, combined: null, answers: [] };
    if (file.kind === "문제") row.question = file;
    else if (file.kind === "문제및정답") row.combined = file;
    else row.answers.push({ label: answerLabel(file.kind), file });
    rows.set(file.subject, row);
  }
  // "영어_정답" 하나가 "영어A형"·"영어B형" 문제에 공통으로 쓰이는 경우 그 줄들에 붙인다.
  for (const [subject, row] of rows) {
    if (row.question || row.combined || !row.answers.length) continue;
    const forms = [...rows.values()].filter((other) => other !== row && other.question && !other.answers.length && other.subject.startsWith(subject));
    if (!forms.length) continue;
    for (const form of forms) form.answers = [...row.answers];
    rows.delete(subject);
  }
  for (const row of rows.values()) row.answers.sort((x, y) => answerOrder(x.file.kind) - answerOrder(y.file.kind));
  // 필기 과목을 먼저, 실기는 뒤에 둔다.
  return [...rows.values()].sort((a, b) =>
    Number(a.subject.startsWith("실기")) - Number(b.subject.startsWith("실기")) || a.subject.localeCompare(b.subject, "ko"));
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
        answerCount: all.filter((file) => file.kind !== "문제" && !file.kind.startsWith("해설")).length,
        years: [...years.entries()].sort((a, b) => b[0] - a[0]).map(([year, list]) => ({ year, rows: toRows(list) })),
      };
    })
    .sort((a, b) => a.school.localeCompare(b.school, "ko"));
}

export function pastExamSchoolPath(school: string): string {
  return `/past-exams/${encodeURIComponent(school)}`;
}

// "건국대학교" → "건국대". 뉴스·일정 제목에서 학교를 찾을 때 줄임말도 함께 본다.
export function schoolAliases(school: string): string[] {
  const short = school.replace(/대학교$/, "대").replace(/여자대$/, "여대");
  return [...new Set([school, short])];
}
