// "체대 편입 정보 다 줘"처럼 학교 없이 계열을 물으면 보유한 모든 학교에서 그 계열 전형을 찾는다.

export type TransferField = { key: string; label: string; terms: RegExp };

const FIELDS: Array<TransferField & { pattern: RegExp }> = [
  { key: "pe", label: "체육 계열", pattern: /체대|체육|스포츠/, terms: /체육|스포츠|운동건강/ },
  { key: "nursing", label: "간호 계열", pattern: /간호/, terms: /간호/ },
  { key: "pharmacy", label: "약학 계열", pattern: /약대|약학/, terms: /약학|제약/ },
  { key: "veterinary", label: "수의 계열", pattern: /수의/, terms: /수의/ },
  { key: "medicine", label: "의학 계열", pattern: /의대|(?<!수)의학과|의예/, terms: /(?<!수)의학과|의예|의과대학/ },
  { key: "art", label: "미술·디자인 계열", pattern: /미대|미술|디자인/, terms: /미술|디자인|조형/ },
  { key: "music", label: "음악 계열", pattern: /음대|음악/, terms: /음악/ },
  { key: "dance", label: "무용 계열", pattern: /무용/, terms: /무용/ },
];

// 대학 이름처럼 보이지만 계열을 뜻하는 줄임말.
const FIELD_ABBREVIATIONS = new Set(["체대", "의대", "약대", "간호대", "수의대", "미대", "음대", "공대", "사대", "사범대", "법대", "예체대"]);

const INFO_REQUEST = /정보|전형|모집|요강|어디|학교|뽑|알려|선발|과목|실기|일정|자격|반영|방법|비율/;

export function isFieldAbbreviation(word: string): boolean {
  return FIELD_ABBREVIATIONS.has(word.replace(/\s+/g, ""));
}

export function detectTransferField(question: string): TransferField | null {
  if (!INFO_REQUEST.test(question)) return null;
  const field = FIELDS.find((candidate) => candidate.pattern.test(question));
  return field ? { key: field.key, label: field.label, terms: field.terms } : null;
}

// "모든 모집단위(… 체육교육과 … 제외)"처럼 제외 목록에만 나오는 학과는 해당 계열 전형이 아니다.
export function scopeMatchesField(scopeValue: string | null, field: TransferField): boolean {
  const withoutExclusions = (scopeValue ?? "").replace(/\([^)]*제외[^)]*\)/g, "");
  return field.terms.test(withoutExclusions);
}
