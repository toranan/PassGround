const AUTO_TAG_RULES: Array<{ tag: string; keywords: string[] }> = [
  { tag: "감정지원", keywords: ["불안", "걱정", "멘탈", "스트레스", "우울", "두려", "자책", "힘들"] },
  { tag: "동기부여", keywords: ["포기", "의지", "동기", "동기부여", "버텨", "해낼", "끝까지"] },
  { tag: "멘탈관리", keywords: ["마인드", "마음가짐", "흔들", "패닉", "압박", "번아웃", "회복"] },
  { tag: "학습전략", keywords: ["공부법", "학습", "복습", "오답", "개념", "문제풀이", "전략"] },
  { tag: "시간관리", keywords: ["시간", "루틴", "계획", "주간", "일정", "페이스", "생활패턴"] },
  { tag: "모의고사", keywords: ["모의고사", "모고", "실모", "점수", "등급"] },
  { tag: "성적관리", keywords: ["성적", "커트", "하락", "상승", "슬럼프", "정체"] },
  { tag: "시험전략", keywords: ["시험", "실전", "당일", "시간배분", "컨디션", "전형"] },
];

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function inferKnowledgeTags(input: string, limit = 6): string[] {
  const text = normalizeForMatch(input);
  if (!text) return [];

  const scored = AUTO_TAG_RULES.map((rule) => {
    const score = rule.keywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0);
    return { tag: rule.tag, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
    .map((item) => item.tag);

  if (!scored.length) {
    return ["일반코칭"];
  }
  return scored.slice(0, Math.max(1, limit));
}

export function mergeKnowledgeTags(primary: string[], inferred: string[], limit = 15): string[] {
  const dedup = new Set<string>();
  for (const entry of primary) {
    if (!entry) continue;
    dedup.add(entry);
  }
  for (const entry of inferred) {
    if (!entry) continue;
    dedup.add(entry);
  }
  return [...dedup].slice(0, Math.max(1, limit));
}
