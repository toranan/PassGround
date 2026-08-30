export type CoachingReason = "general_chat" | "study_coaching" | "profile_followup" | "none";

export type CoachingHistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

export type CoachingAdviceSourceRow = {
  id: string;
  question: string;
  answer: string;
  tags: string[] | null;
  approved_at: string | null;
  updated_at: string;
};

export type ScoredCoachingAdviceRow = {
  row: CoachingAdviceSourceRow;
  score: number;
};

const STUDY_COACHING_PATTERNS = [
  /순공/,
  /공부\s*시간/,
  /몇\s*시간/,
  /공부법/,
  /공부\s*방법/,
  /어떻게\s*(?:공부|준비)/,
  /뭐부터\s*(?:공부|준비|해야)/,
  /우선\s*순위/,
  /학습\s*계획/,
  /루틴/,
  /현실적으로.*(?:가능|해야|공부)/,
];

const STUDY_PROFILE_PATTERNS = [
  /(?:노|쌩)베(?:이스)?/,
  /베이스(?:가|는|도)?\s*(?:있|없|거의)/,
  /개념(?:은|이|도)?\s*(?:끝|완료|봤|들었)/,
  /(?:단어|문법|독해|논리|수학)(?:는|은|이|가|도)?\s*(?:절반|반|완료|부족|약|강|끝)/,
  /\d+\s*(?:등급|점|회독)/,
  /진도(?:는|가|도)?/,
  /절반\s*정도/,
];

const ADMISSION_FACT_PATTERNS = [
  /모집\s*요강/,
  /지원\s*자격/,
  /모집\s*인원/,
  /반영\s*비율/,
  /시험\s*과목/,
  /전형\s*일정/,
  /원서\s*접수/,
  /제출\s*서류/,
  /전형료/,
  /학업\s*계획서/,
  /공인\s*영어/,
  /(?:토익|toefl|teps).*최저/i,
];

const COACHING_TAGS = new Set([
  "감정지원",
  "동기부여",
  "멘탈관리",
  "학습전략",
  "시간관리",
  "모의고사",
  "성적관리",
  "시험전략",
  "공부비중",
  "준비기간",
  "일반코칭",
  "FAQ",
]);

const FACT_ONLY_TAGS = new Set(["verified", "전형정보"]);

const SEARCH_STOP_WORDS = new Set([
  "그리고",
  "그래서",
  "우리",
  "기준",
  "현실적으로",
  "정도",
  "갈려면",
  "가려면",
  "해야",
  "어떻게",
  "있어",
]);

const STUDY_TOPIC_TOKENS = new Set(["단어", "어휘", "독해", "문법", "논리", "수학", "오답", "복습"]);

const KOREAN_SUFFIXES = [
  "으로부터",
  "이라고",
  "이라서",
  "이어서",
  "에서는",
  "으로는",
  "까지는",
  "부터는",
  "이고",
  "인데",
  "이며",
  "에서",
  "으로",
  "에게",
  "한테",
  "처럼",
  "보다",
  "까지",
  "부터",
  "라도",
  "하고",
  "이랑",
  "랑",
  "과",
  "와",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "도",
  "만",
  "의",
  "에",
  "로",
  "야",
];

function normalizedText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function countPatternHits(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function stripKoreanSuffix(token: string): string {
  for (const suffix of KOREAN_SUFFIXES) {
    if (token.length >= suffix.length + 2 && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

export function tokenizeCoachingQuery(text: string): string[] {
  const normalized = normalizedText(text);
  const tokens = normalized
    .replace(/[^a-z0-9가-힣\s]/g, " ")
    .split(/\s+/)
    .map((token) => stripKoreanSuffix(token.trim()))
    .filter((token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token));
  if (/순공|공부\s*시간|몇\s*시간|몇시간/.test(normalized)) tokens.push("시간");
  return [...new Set(tokens)].slice(0, 32);
}

export function inferDeterministicCoachingReason(
  question: string,
  historyMessages: CoachingHistoryMessage[] = []
): CoachingReason {
  const text = normalizedText(question);
  if (!text) return "none";

  const coachingHits = countPatternHits(text, STUDY_COACHING_PATTERNS);
  const profileHits = countPatternHits(text, STUDY_PROFILE_PATTERNS);
  const admissionFactHits = countPatternHits(text, ADMISSION_FACT_PATTERNS);

  if (coachingHits > 0) return "study_coaching";
  if (profileHits >= 2) return "profile_followup";

  const recentHistory = historyMessages
    .slice(-4)
    .map((message) => normalizedText(message.text))
    .join(" ");
  const historyWasCoaching = countPatternHits(recentHistory, STUDY_COACHING_PATTERNS) > 0;
  if (profileHits > 0 && historyWasCoaching) return "profile_followup";

  if (admissionFactHits > 0) return "none";
  return "none";
}

function isFactOnlyKnowledge(row: CoachingAdviceSourceRow): boolean {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  if (tags.some((tag) => FACT_ONLY_TAGS.has(tag) || tag.startsWith("source:") || tag.startsWith("section:"))) {
    return true;
  }

  const question = normalizedText(row.question || "");
  const answer = normalizedText(row.answer || "");
  if (/\[출처:|\[검증문서:/.test(answer)) return true;
  if (/모집\s*요강|전형\s*일정|원서\s*접수/.test(question)) return true;
  if (/원서\s*접수.*필기\s*고사.*합격자\s*발표/.test(answer)) return true;
  return false;
}

function hasAudienceConflict(question: string, row: CoachingAdviceSourceRow): boolean {
  const query = normalizedText(question);
  const source = normalizedText(`${row.question} ${row.answer}`);
  const asksHumanities = /인문|문과/.test(query);
  const asksNatural = /자연|이과/.test(query);
  const sourceHumanities = /인문|문과/.test(source);
  const sourceNatural = /자연계|이과|편입\s*수학|수학\s*베이스/.test(source);

  if (asksHumanities && sourceNatural && !sourceHumanities) return true;
  if (asksNatural && sourceHumanities && !sourceNatural) return true;
  return false;
}

function coachingTagCount(tags: string[]): number {
  return tags.reduce((count, tag) => count + (COACHING_TAGS.has(tag) ? 1 : 0), 0);
}

export function selectCoachingAdviceRows(params: {
  rows: CoachingAdviceSourceRow[];
  question: string;
  queryTags: string[];
  limit?: number;
}): ScoredCoachingAdviceRow[] {
  const queryTokens = tokenizeCoachingQuery(params.question);
  const queryTags = [...new Set(params.queryTags.filter(Boolean))];
  const limit = Math.max(1, params.limit ?? 3);

  return params.rows
    .filter((row) => !isFactOnlyKnowledge(row))
    .filter((row) => !hasAudienceConflict(params.question, row))
    .map((row) => {
      const tags = Array.isArray(row.tags) ? row.tags.filter(Boolean) : [];
      if (coachingTagCount(tags) === 0) return { row, score: 0 };

      const questionText = normalizedText(row.question || "");
      const answerText = normalizedText(row.answer || "");
      const tagOverlap = queryTags.reduce((count, tag) => count + (tags.includes(tag) ? 1 : 0), 0);
      const questionHits = queryTokens.reduce(
        (count, token) => count + (questionText.includes(token) ? 1 : 0),
        0
      );
      const answerHits = queryTokens.reduce(
        (count, token) => count + (!questionText.includes(token) && answerText.includes(token) ? 1 : 0),
        0
      );
      const topicHits = queryTokens.reduce(
        (count, token) => count + (STUDY_TOPIC_TOKENS.has(token) && answerText.includes(token) ? 1 : 0),
        0
      );
      if (questionHits === 0 && topicHits === 0) return { row, score: 0 };
      return {
        row,
        score: tagOverlap * 3 + questionHits * 2 + answerHits + topicHits * 3,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftDate = Date.parse(left.row.approved_at || left.row.updated_at || "");
      const rightDate = Date.parse(right.row.approved_at || right.row.updated_at || "");
      return rightDate - leftDate;
    })
    .slice(0, limit);
}
