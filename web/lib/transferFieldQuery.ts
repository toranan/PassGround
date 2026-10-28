// "체대 편입 정보 다 줘"처럼 학교 없이 계열을 물으면 보유한 모든 학교에서 그 계열 전형을 찾는다.

export type TransferField = { key: string; label: string; terms: RegExp };

const FIELDS: Array<TransferField & { pattern: RegExp }> = [
  {
    key: "medical",
    label: "의치한약수 계열",
    pattern: /의치한약수|의치한|의치약|메디컬/,
    terms: /(?<!수)의학과|의예|의과대학|치의|치과|한의|(?<!계)약학|제약|수의/,
  },
  { key: "dentistry", label: "치의학 계열", pattern: /치대|치의|치과/, terms: /치의|치과/ },
  { key: "korean-medicine", label: "한의학 계열", pattern: /한의/, terms: /한의/ },
  { key: "pe", label: "체육 계열", pattern: /체대|체육|스포츠/, terms: /체육|스포츠|운동건강/ },
  { key: "nursing", label: "간호 계열", pattern: /간호/, terms: /간호/ },
  { key: "pharmacy", label: "약학 계열", pattern: /약대|약학/, terms: /(?<!계)약학|제약/ },
  { key: "veterinary", label: "수의 계열", pattern: /수의/, terms: /수의/ },
  { key: "medicine", label: "의학 계열", pattern: /의대|(?<!수)의학과|의예/, terms: /(?<!수)의학과|의예|의과대학/ },
  { key: "art", label: "미술·디자인 계열", pattern: /미대|미술|디자인/, terms: /미술|디자인|조형/ },
  { key: "music", label: "음악 계열", pattern: /음대|음악/, terms: /음악/ },
  { key: "dance", label: "무용 계열", pattern: /무용/, terms: /무용/ },
];

// 대학 이름처럼 보이지만 계열을 뜻하는 줄임말.
const FIELD_ABBREVIATIONS = new Set(["체대", "의대", "치대", "한의대", "약대", "간호대", "수의대", "미대", "음대", "공대", "사대", "사범대", "법대", "예체대"]);

// 계열 이름이 있어도 공부·멘탈·합격 가능성 상담이면 전형 정보 질문으로 보지 않는다.
const COUNSELING = /공부|멘탈|불안|힘들|지치|무섭|걱정|가능(?:성|해|할|한)|갈\s*수|붙을|합격/;

export function isFieldAbbreviation(word: string): boolean {
  return FIELD_ABBREVIATIONS.has(word.replace(/\s+/g, ""));
}

export function detectTransferField(question: string): TransferField | null {
  const field = FIELDS.find((candidate) => candidate.pattern.test(question));
  return field ? { key: field.key, label: field.label, terms: field.terms } : null;
}

// "약대편입", "간호 편입 어때"처럼 정보를 달라는 단어가 없어도 계열과 편입을 함께 말하면
// 전형 정보 질문으로 보고 가진 자료에서 최대한 답한다.
export function asksFieldInfo(question: string): boolean {
  if (COUNSELING.test(question)) return false;
  const compact = question.replace(/[\s?？!.~]/g, "");
  return Boolean(detectTransferField(question)) && (/편입/.test(question) || compact.length <= 8);
}

// "모든 모집단위(… 체육교육과 … 제외)"처럼 제외 목록에만 나오는 학과는 해당 계열 전형이 아니다.
export function scopeMatchesField(scopeValue: string | null, field: TransferField): boolean {
  const withoutExclusions = (scopeValue ?? "").replace(/\([^)]*제외[^)]*\)/g, "");
  return field.terms.test(withoutExclusions);
}

// "수학 반영", "수학 보는"처럼 필기 과목 조건을 함께 물으면 그 과목을 보는 전형만 남긴다.
export function detectWrittenSubject(question: string): string | null {
  const match = question.match(/(수학|영어|화학|생물|물리|논술)\s*(?:만\s*)?(?:반영|보는|봐|시험|필기|과목|치는)/);
  return match?.[1] ?? null;
}

export function writtenSubjectsInclude(subjects: string[] | null, subject: string): boolean {
  return (subjects ?? []).some((value) => value.replace(/\s+/g, "").includes(subject));
}
