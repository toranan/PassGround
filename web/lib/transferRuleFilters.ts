// 전형규칙의 계열(tracks)과 공인영어 활용(englishTest) 필터. manifest의 selectionRules[].metadata에서 온다.
export type TrackCategory = "natural" | "humanities" | "unspecified";
export type EnglishTestMode = "any" | "weighted" | "eligibility" | "unspecified";

export type RuleFilterRow = {
  category: string | null;
  metadata: Record<string, unknown> | null;
};

export type EnglishTestInfo = {
  role?: string;
  stage?: string | null;
  weight?: number | null;
  toeicMin?: number | null;
  tests?: string[];
  toeicAccepted?: boolean;
  bonusPointsMax?: number;
  minimumVariesByMajor?: boolean;
};

export function ruleTracks(row: RuleFilterRow): string[] {
  const tracks = row.metadata?.tracks;
  if (Array.isArray(tracks)) return tracks.filter((track): track is string => typeof track === "string");
  return row.category ? [row.category] : [];
}

export function trackMatches(row: RuleFilterRow, category: TrackCategory): boolean {
  if (category === "unspecified") return true;
  return ruleTracks(row).includes(category === "natural" ? "자연" : "인문");
}

export function ruleEnglishTest(row: RuleFilterRow): EnglishTestInfo | null {
  const value = row.metadata?.englishTest;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as EnglishTestInfo) : null;
}

export function asksToeic(question: string): boolean {
  return /토익|toeic/i.test(question);
}

export function englishTestMatches(row: RuleFilterRow, mode: EnglishTestMode, toeicOnly = false): boolean {
  if (mode === "unspecified") return true;
  const info = ruleEnglishTest(row);
  if (toeicOnly && info?.toeicAccepted === false) return false;
  const role = info?.role;
  if (role === "undisclosed") return true;
  if (mode === "weighted") return role === "weighted" || role === "weighted_and_eligibility";
  if (mode === "eligibility") return role === "eligibility" || role === "weighted_and_eligibility";
  return role === "weighted" || role === "eligibility" || role === "weighted_and_eligibility";
}

// "전적대", "타대"처럼 학교 이름이 아닌데 "~대"로 끝나는 말. 학교명으로 잡으면 "자료 없음"으로 빠진다.
const NON_SCHOOL_WORDS = new Set(["전적대", "전적대학", "타대", "본교대", "우리대", "명문대", "지방대", "인서울대", "상위대", "하위대", "목표대"]);

export function isNonSchoolWord(word: string): boolean {
  return NON_SCHOOL_WORDS.has(word.replace(/\s+/g, ""));
}

// "필기 100%", "수학 100%", "전적대 성적 안 보는"처럼 필기만으로 뽑는 전형을 묻는 질문
export function asksWrittenOnly(question: string): boolean {
  const compact = question.replace(/\s+/g, "");
  return /(필기|수학|영어|시험)(만)?100(%|퍼|프로)/.test(compact)
    || /(전적대|학점|전적대성적|내신)(성적|학점)?(을|은|는)?(안|미)(보|반영)/.test(compact)
    || /(전적대|학점)(성적)?(반영)?(없|안들어|0%)/.test(compact);
}

// 최종 반영비율에서 필기가 100%인 전형만 남긴다(서류·면접·전적대 성적 반영이 없다).
export function writtenOnlyMatches(row: { final_written_weight: number | null }): boolean {
  return Number(row.final_written_weight ?? 0) >= 100;
}

// "왜 이 어플에 강원대는 없어?", "강원대 자료 있어?"처럼 학교 자료가 서비스에 있는지 묻는 질문
export function asksSchoolCoverage(question: string): boolean {
  const compact = question.replace(/\s+/g, "");
  return /(어플|앱|여기|합격판|서비스|달력|캘린더|일정탭)(에|엔|에는|에선|에서는)?.*(없|있|안나|안보)/.test(compact)
    || /(정보|자료|요강|기본계획)(가|이|는|은|도)?(없|있어\?|있나|있냐|있어요\?|안나|안보)/.test(compact)
    || /왜.*(없어|없나|없냐|없죠|없어요|안나와|안보여)/.test(compact);
}
