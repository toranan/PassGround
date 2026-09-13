/** 명확한 인사만 처리한다. 인사 뒤의 실제 질문은 가로채지 않는다. */
export function smalltalkReply(question: string): string | null {
  const text = question.toLowerCase().replace(/[\s!?？！.,~～]/g, "");
  if (/^(ㅎㅇ|하이|하이요|안녕|안녕하세요|안뇽|hello|hi|반가워|반갑습니다)+(ㅋㅋ|ㅎㅎ)*$/.test(text)) {
    return "안녕! 합곰이야. 편입 정보든 공부 고민이든 편하게 물어봐.";
  }
  if (/^(고마워|고마워요|감사합니다|감사|ㄱㅅ|땡큐|thanks|thankyou)+(ㅋㅋ|ㅎㅎ)*$/.test(text)) {
    return "도움이 됐다니 다행이야! 또 궁금한 게 있으면 편하게 물어봐.";
  }
  if (/^(잘자|잘자요|굿나잇|goodnight)$/.test(text)) return "잘 자! 푹 쉬고 다음에 또 이야기하자.";
  return null;
}

type RoutingHistoryMessage = { role: "user" | "assistant"; text: string };

const ADMISSION_FACT_PATTERN = /모집\s*(요강|인원)|기본\s*계획|전형\s*(방법|요소|일정|계획)|지원\s*자격|제출\s*서류|원서\s*접수|접수\s*(기간|마감)|시험\s*(과목|일정|시간)|반영\s*비율|선발\s*(인원|배수)|(?:몇\s*명|얼마나)\s*(?:뽑|선발|모집)|티오|수학만\s*보|영어만\s*보/;
const ADMISSION_CHANGE_PATTERN = /바뀐|바뀌|바꿔|변경|달라진|달라졌|차이/;
const UNIVERSITY_PATTERN = /[가-힣]{2,12}대학교|[가-힣]{1,8}대/;

/** 상담 표현이 함께 있어도 먼저 확인해야 할 공식 전형 정보와 문맥상 후속 질문. */
export function asksAdmissionFacts(
  question: string,
  historyMessages: RoutingHistoryMessage[] = []
): boolean {
  if (ADMISSION_FACT_PATTERN.test(question)) return true;
  if (ADMISSION_CHANGE_PATTERN.test(question) && (UNIVERSITY_PATTERN.test(question) || /편입|입시|학과|전형/.test(question))) {
    return true;
  }

  const historyHasAdmissionContext = historyMessages.slice(-8).some((message) =>
    ADMISSION_FACT_PATTERN.test(message.text)
    || (UNIVERSITY_PATTERN.test(message.text) && /편입|입시|전형|학과/.test(message.text))
  );
  if (!historyHasAdmissionContext || /공부|학습|멘탈|불안|합격\s*가능/.test(question)) return false;
  return ADMISSION_CHANGE_PATTERN.test(question)
    || /^(그럼|그러면|그건|그거|이건|이번|올해|작년|전년|어떻게|뭐가|뭔데)/.test(question.trim());
}
