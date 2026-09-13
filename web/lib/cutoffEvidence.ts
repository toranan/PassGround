export type CutoffEvidenceKnowledgeItem = {
  id: string;
  tags: string[] | null;
  question: string | null;
  answer: string | null;
  raw_input: string | null;
};

const STRONG_CUTOFF_TERMS = [
  "커트라인",
  "합격선",
  "합격점",
  "최초합",
  "추합",
  "합격제보",
  "컷정보",
  "컷제보",
  "점수제보",
  "점수대",
  "cutoff",
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

function hasReportedScore(value: string): boolean {
  return /\d{1,3}(?:\.\d+)?\s*(?:점|%|개|문제)/u.test(value)
    || /\d{1,3}(?:\.\d+)?\s*(?:~|-)점?\s*\d{1,3}(?:\.\d+)?/u.test(value);
}

export function isCutoffEvidenceKnowledgeItem(item: CutoffEvidenceKnowledgeItem): boolean {
  const tags = (item.tags ?? [])
    .filter((tag): tag is string => typeof tag === "string")
    .map(normalize);
  // 모의고사 평균은 본고사 합격선의 근거가 아니다. 명시적 용도 제한을 우선한다.
  if (tags.some((tag) => tag === "referenceonly" || tag === "mockexamaverage")) return false;
  const normalizedTerms = STRONG_CUTOFF_TERMS.map(normalize);
  const hasCutoffTag = tags.some((tag) => normalizedTerms.some((term) => tag.includes(term)));

  const corpus = [item.question ?? "", item.answer ?? "", item.raw_input ?? ""].join(" ");
  const normalizedCorpus = normalize(corpus);
  const hasCutoffText = normalizedTerms.some((term) => normalizedCorpus.includes(term));

  // 일반 모집요강에도 '합격', '점수', '학과' 등이 등장한다.
  // 명시적인 컷 표시와 실제 점수가 모두 있는 검수 자료만 컷 근거로 인정한다.
  return (hasCutoffTag || hasCutoffText) && hasReportedScore(corpus);
}
