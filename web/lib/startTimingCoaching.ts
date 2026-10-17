// "이제 편입 시작하는데 될까?"처럼 준비 시작 시점을 묻는 상담에 질문 시점(한국시간)을 반영한다.
// 방침은 운영자 조언을 일반편입·인문/자연 기준으로 정리한 것이며, 목표 대학 수준에 따라 달라질 수 있다.

const START_TIMING_PATTERNS = [
  /(?:이제|지금|막|처음|뒤늦게|늦게|이제야|이제서야)\s*(?:편입\s*)?(?:공부\s*)?(?:시작|준비)/,
  /\d{1,2}\s*월\s*(?:부터|에|쯤|달)?\s*(?:편입\s*)?(?:공부\s*)?(?:시작|준비)/,
  /(?:시작|준비)(?:하는데|했는데|해도|하면|하려는데|할건데|할\s*건데).{0,15}(?:될까|되냐|되나|돼\?|가능|늦|안\s*늦|할\s*수\s*있)/,
  /(?:지금|이제|이\s*시기|이맘때).{0,10}(?:시작|준비).{0,10}(?:늦|가능|되)/,
];

export function isStartTimingQuestion(question: string): boolean {
  return START_TIMING_PATTERNS.some((pattern) => pattern.test(question));
}

export type StartSeason = "after_exam" | "early" | "summer" | "late";

export function kstNow(now = new Date()): { year: number; month: number; day: number } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1, day: kst.getUTCDate() };
}

// 대부분의 일반편입 필기는 12월~1월에 치른다.
export function startSeason(month: number): StartSeason {
  if (month <= 2) return "after_exam";
  if (month <= 6) return "early";
  if (month <= 8) return "summer";
  return "late";
}

const SEASON_GUIDE: Record<StartSeason, string> = {
  after_exam: "지금은 이번 시즌 시험이 막 끝나가거나 끝난 시기라, 다음 시험까지 1년 가까이 남은 가장 여유 있는 시작이다. 기초부터 차근차근 계획을 세우라고 안내한다.",
  early: "지금 시작하면 다음 시험(대개 12월~1월)까지 시간이 충분한 편이다. 꾸준함이 관건이라고 안내한다.",
  summer: "2학기·여름부터 시작하는 건 유리한 편은 아니지만, 정말 독하게 하면 좋은 학교에 가는 친구들도 많다. 결과는 본인이 얼마나 독하게 하느냐에 달렸다고 안내한다.",
  late: [
    "지금 시작은 시험(대개 12월~1월)까지 남은 기간이 짧아 냉정하게 빠른 편이 아니다.",
    "자연계: 수학 베이스가 없거나 내용을 숙지한 상태가 아니라면, 솔직히 이번 시험보다 다음 편입 시험을 준비하는 편이 낫다고 말해준다.",
    "인문계: 영어 베이스가 중요하다. 늦게 시작했어도 독해력이 좋다면 단어 위주로 집중해 결과를 기대해볼 수 있다. 단어와 독해 모두 베이스가 없다면 이 시기 시작은 어려운 부분이 있다고 말해준다.",
  ].join(" "),
};

export function buildStartTimingGuide(now = new Date()): string {
  const { year, month, day } = kstNow(now);
  return [
    `오늘은 ${year}년 ${month}월 ${day}일(한국시간)이다. 질문 시점을 기준으로 판단한다.`,
    "아래는 합격판 운영자의 시작 시기 상담 방침이다. 일반편입 기준이며 인문계와 자연계를 구분한다.",
    `- ${SEASON_GUIDE[startSeason(month)]}`,
    "- 목표 학교 수준에 따라 달라진다. 인서울 상위권을 목표로 한다면 늦은 시작은 더 어렵다는 점을 분명히 말한다.",
    "- 사용자가 계열(인문/자연)이나 베이스(단어·독해·수학 수준)를 말하지 않았다면, 두 계열을 한두 문장씩 나눠 말하고 마지막에 계열·현재 베이스·목표 학교를 한 가지 질문으로 묻는다.",
    "- 냉정하지만 다정하게 말하고, 불가능하다고 단정하거나 겁주지 않는다. 다음 시험을 권할 때도 지금부터 무엇을 하면 되는지 한 줄 덧붙인다.",
  ].join("\n");
}
