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
