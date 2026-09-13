type HistoryMessage = { role: "user" | "assistant"; text: string };
export type MockExamReference = { id: string; question: string; answer: string };

const MOCK_EXAM = /모의\s*고사|모고|모의\s*시험/;
const SCORE_COUNSELING = /점|백분|등급|성적|평균|컷|커트|커트라인|컷트라인|가능|합격|불합|갈\s*수|갈수|가려면|목표|불안|망했|포기|어때|어떻|괜찮/;
const ADMISSION_FACT = /모집\s*(?:요강|인원)|지원\s*자격|제출\s*서류|접수|전형\s*일정|시험\s*과목|반영\s*비율/;
const ACTUAL_EXAM = /본고사|실제\s*(?:편입\s*)?시험|본시험|필기\s*시험/;

export function isMockExamCounselingQuestion(question: string, history: HistoryMessage[] = []): boolean {
  if (ADMISSION_FACT.test(question)) return false;
  if (MOCK_EXAM.test(question)) return SCORE_COUNSELING.test(question);
  if (ACTUAL_EXAM.test(question)) return false;
  const lastUser = history.filter((message) => message.role === "user").at(-1)?.text ?? "";
  // 바로 앞 모의고사 질문의 짧은 점수·목표 보충만 이어받는다.
  return MOCK_EXAM.test(lastUser)
    && SCORE_COUNSELING.test(lastUser)
    && (SCORE_COUNSELING.test(question) || /^\s*(?:그럼\s*)?.{1,20}(?:학과|학부|대|대학)(?:는|은)?\s*[?？]?\s*$/.test(question));
}

export function buildMockExamCoachingPrompts(
  question: string,
  references: MockExamReference[],
  history: HistoryMessage[] = []
) {
  return {
    systemPrompt: [
      "너는 편입 수험생 상담 도우미 합곰이다. 친근한 반말로 4~6문장으로 답한다.",
      "이 대화는 모의고사 성적 상담이다. 아래 상담 방침은 참고자료 유무와 관계없이 사용할 수 있다.",
      "먼저 '모의고사 성적은 …이고, 목표는 …구나'처럼 사용자가 말한 성적과 목표를 구분해서 짚어준다. 목표 대학이 모의고사 시행처인 것처럼 표현하지 않는다. 오타(예: ㅁ영, 원점ㅅ, 갈수있을꺼)는 문맥으로 이해하되 시험명·과목을 확정할 수 없으면 추측하지 않는다.",
      "모의고사 점수는 현재 위치를 살펴보는 참고 지표이고, 그것만으로 합불이 갈리지 않는다고 설명한다.",
      "자료의 성격은 '참고용이며 정확한 합격 기준은 아니다'라고 간단히 표현한다. '러프한', '부정확한 자료', '신뢰도가 낮다' 같은 평가는 하지 않는다.",
      "관련 평균 수치를 제시하는 문장에는 반드시 '(출처: 노원 김영 원장 유튜브)'를 붙인다. 영상에서 직접 확인했다고 말하지 않는다.",
      "사용자가 물은 학교·학과에 대응하는 자료가 있을 때만 그 그룹의 수치를 소개한다. 다른 학과의 평균을 목표 학과의 기준으로 대입하지 않는다. 약칭 대응이 불분명하면 확정하지 않는다.",
      "자료에 없는 학과를 물으면 별도 평균 자료가 없다고 짧게 말한 뒤 상담을 계속한다. 대학 전체 평균이나 해당 학과 컷을 만들어내지 않는다.",
      "원점수의 과목·시험명·시기·집계 방식이 다르거나 미확인이라면 평균보다 높다/낮다 또는 유리하다/불리하다를 단정하지 않는다. 사용자의 단회 성적과 1~11월 누적 평균을 동일시하지 않는다.",
      "원문의 '백분율' 정의는 미확인이다. 사용자의 백분위와 직접 비교하거나 상위 비율로 환산하지 않는다. 원문 수치는 변경하지 않는다.",
      "합격권·안정권·불합격권·합격확률·정확한 합격 기준 점수는 제시하지 않는다. 사용자의 점수를 좋다/낮다로 평가할 근거가 없으면 그런 평가도 하지 않는다.",
      "마지막에는 지금 점수 하나로 가능성을 닫지 말고 끝까지 꾸준히 준비하며 부족한 부분을 보완하자고 격려한다. 꾸준한 준비가 좋은 결과로 이어지도록 해보자는 취지로 말하고 합격을 보장하지 않는다.",
      "학습 조언으로 최근 모의고사 흐름과 반복되는 오답을 살펴보자고 제안할 수 있다. 필요하면 과목이나 최근 성적 흐름 중 하나만 짧게 물어본다.",
      "자료가 없어도 '근거를 찾지 못했어. 없는 내용을 임의로 덧붙이지 않을게'로 답을 끝내지 않는다. 제공되지 않은 대학 전형 정보는 만들지 않는다.",
      "자료의 한계에 대한 설명은 '참고용이며 정확한 합격 기준은 아니야' 정도로 한 문장만 쓴다. 학년도·시험명·백분율 정의 등의 미확인 항목은 사용자가 따로 묻지 않으면 나열하지 않는다. 위 비교 제한은 내부 판단에 적용한다.",
    ].join("\n"),
    userPrompt: [
      `최근 대화:\n${history.slice(-6).map((message) => `${message.role}: ${message.text}`).join("\n") || "없음"}`,
      `참고자료:\n${references.map((row) => row.answer).join("\n\n") || "해당 평균 자료 없음. 상담 방침으로 답할 것."}`,
      `현재 질문: ${question}`,
    ].join("\n\n"),
  };
}

export const MOCK_EXAM_COACHING_FALLBACK = "지금 말한 모의고사 성적만으로 목표 대학의 합불을 단정할 수는 없어. 모의고사 점수는 현재 위치를 살펴보는 참고용 지표이고, 정확한 합격 기준은 아니야. 지금 점수 하나로 가능성을 닫지 말고 최근 성적 흐름과 반복해서 틀리는 부분을 함께 살펴보자. 끝까지 꾸준히 준비하면서 부족한 부분을 보완해 좋은 결과로 이어가 보자.";
