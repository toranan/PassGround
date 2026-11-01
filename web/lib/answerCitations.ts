// 답변에 실제로 쓰인 근거를 골라 원본 PDF 페이지와 하이라이트할 단어로 돌려준다.
// 답변에 [근거 N] 같은 표시를 넣지 않고, 답과 근거 원문에 함께 나오는 숫자·단어로 맞춘다.
// 이미 배포된 앱은 답변 글자만 그리므로 표시가 없어야 화면이 깨지지 않는다.
export type CitationSource = {
  text: string;
  university: string;
  documentTitle: string;
  sha256: string | null;
  pages: number[];
};

export type AnswerCitation = {
  university: string;
  documentTitle: string;
  sha256: string;
  page: number;
  highlights: string[];
};

// 날짜(월·일)는 대부분의 근거에 나와서 어떤 근거를 썼는지 가려주지 못하므로 쓰지 않는다.
const NUMBER_TOKEN = /\d+(?:\.\d+)?\s*(?:%|점|문항|분|배수|명|학점|시간)/g;
const WORD_TOKEN = /[가-힣A-Za-z]{3,}/g;
// 거의 모든 근거에 나와서 어떤 근거를 썼는지 가려주지 못하는 단어.
const COMMON_WORDS = new Set([
  "편입학", "모집요강", "기본계획", "대학교", "학년도", "모집단위", "일반편입", "학사편입", "전형방법", "반영비율",
  "지원자격", "확인해야", "있으며", "있다", "없다", "한다", "된다", "예정이다", "공개되지", "않았다",
  "정확한", "캠퍼스", "공개된", "해당", "경우", "이상", "페이지", "홈페이지", "일반편입학", "학사편입학", "서류심사",
]);
const TRAILING_PARTICLE = /(에서|으로|에게|은|는|이|가|을|를|의|에|도)$/;

function compact(text: string): string {
  return text.replace(/\s+/g, "");
}

// 답변에서 학교가 처음 나온 위치. 나오지 않으면 -1.
function schoolPosition(answer: string, university: string): number {
  const name = university.split(" ")[0];
  // 숙명여자대학교 → 숙명여자·숙명여대, 경북대학교 → 경북·경북대
  const forms = [name, name.replace(/대학교$/, ""), name.replace(/여자대학교$/, "여대"), name.replace(/대학교$/, "대")].filter((form) => form.length >= 2);
  const positions = forms.map((form) => answer.indexOf(form)).filter((index) => index >= 0);
  return positions.length ? Math.min(...positions) : -1;
}

function matchedTokens(answer: string, source: string, university: string): { numbers: string[]; words: string[] } {
  const answerCompact = compact(answer);
  // "70%" 안의 "0%"처럼 앞자리 숫자에 붙은 일치는 같은 숫자가 아니다.
  const appearsAsNumber = (token: string) => new RegExp(`(?<![\\d.])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(answerCompact);
  const numbers = [...new Set((source.match(NUMBER_TOKEN) ?? []).map(compact))].filter(appearsAsNumber);
  const words = [...new Set((source.match(WORD_TOKEN) ?? []).map((word) => word.replace(TRAILING_PARTICLE, "")))]
    .filter((word) => word.length >= 3 && !COMMON_WORDS.has(word) && !university.includes(word) && answer.includes(word));
  return { numbers, words };
}

export function selectAnswerCitations(answer: string, sources: CitationSource[], limit = 4, perDocument = 2): AnswerCitation[] {
  const best = new Map<string, Omit<AnswerCitation, "highlights"> & { numbers: string[]; words: string[]; score: number }>();
  for (const source of sources) {
    if (!source.sha256 || !source.pages.length || schoolPosition(answer, source.university) < 0) continue;
    const { numbers, words } = matchedTokens(answer, source.text, source.university);
    // 숫자 하나만 겹치는 건 우연일 수 있어서, 숫자 둘 이상이거나 숫자와 단어가 함께 겹칠 때만 쓴다.
    // 학과 목록처럼 숫자 없는 답은 그 문서의 단어(학과명 등)가 셋 이상 겹쳐야 쓴다.
    const score = numbers.length * 2 + words.length;
    if (numbers.length === 0 ? words.length < 3 : score < 3) continue;
    const page = source.pages[0];
    const key = `${source.sha256}:${page}`;
    const current = best.get(key);
    best.set(key, {
      university: source.university,
      documentTitle: source.documentTitle,
      sha256: source.sha256,
      page,
      numbers: [...new Set([...(current?.numbers ?? []), ...numbers])],
      words: [...new Set([...(current?.words ?? []), ...words])],
      score: Math.max(current?.score ?? 0, score) + (current ? 1 : 0),
    });
  }
  // 문서마다 가장 잘 맞는 페이지를 먼저 채우고, 남는 자리에 같은 문서의 다음 페이지를 넣는다.
  const perDocumentCount = new Map<string, number>();
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .map((citation) => {
      const rank = perDocumentCount.get(citation.sha256) ?? 0;
      perDocumentCount.set(citation.sha256, rank + 1);
      return { ...citation, rank };
    })
    .filter((citation) => citation.rank < perDocument)
    .sort((a, b) => a.rank - b.rank || b.score - a.score)
    .slice(0, limit)
    // 화면에는 답변에 학교가 나온 순서대로 보여준다.
    .sort((a, b) => schoolPosition(answer, a.university) - schoolPosition(answer, b.university) || a.rank - b.rank)
    // 하이라이트는 답에 쓰인 숫자를 먼저 담고, 단어는 몇 개만 덧붙인다.
    .map(({ university, documentTitle, sha256, page, numbers, words }) => ({
      university,
      documentTitle,
      sha256,
      page,
      highlights: [...numbers.slice(0, 8), ...words.slice(0, numbers.length ? 3 : 8)],
    }));
}
