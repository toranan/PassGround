/** 기존 tags 저장 형식을 답변에 사용할 수 있는 근거 유형으로 변환하는 경계 계층. */
export type EvidenceKind =
  | "official_admission"
  | "exam_score_report"
  | "mock_exam_reference"
  | "experience_report"
  | "coaching_guidance"
  | "unclassified";

export type EvidenceInput = {
  tags?: string[] | null;
  question?: string | null;
  answer?: string | null;
  raw_input?: string | null;
};

const COACHING_TAGS = new Set([
  "감정지원", "동기부여", "멘탈관리", "학습전략", "시간관리", "성적관리",
  "시험전략", "공부비중", "준비기간", "일반코칭", "FAQ",
]);

export function classifyKnowledgeEvidence(item: EvidenceInput): EvidenceKind {
  const tags = new Set(item.tags ?? []);
  // 제한된 자료가 approved/verified 태그만으로 공식 자료로 승격되지 않게 우선한다.
  if (tags.has("mock-exam-average")) return "mock_exam_reference";
  if (tags.has("experience-report") || tags.has("개인후기")) return "experience_report";
  if (tags.has("coaching-guidance")) return "coaching_guidance";
  if (tags.has("reference-only")) return "unclassified";
  if (tags.has("verified") && tags.has("전형정보")) return "official_admission";
  if (tags.has("exam-score-report") || tags.has("합격제보") || tags.has("점수제보")) return "exam_score_report";

  // 기존 요강/조언 행과 호환하되, 출처가 있다는 이유로 공식 사실로 판정하지 않는다.
  const text = `${item.question ?? ""}\n${item.answer ?? ""}`;
  const hasDocumentMarker = [...tags].some((tag) => tag.startsWith("source:") || tag.startsWith("section:"))
    || /\[출처:|\[검증문서:/.test(text);
  if (!hasDocumentMarker && !/모집\s*요강|전형\s*일정|원서\s*접수/.test(text)
    && [...tags].some((tag) => COACHING_TAGS.has(tag))) return "coaching_guidance";
  return "unclassified";
}

export const EVIDENCE_POLICIES: Record<EvidenceKind, { label: string; usage: string; coaching: boolean }> = {
  official_admission: {
    label: "공식 전형 자료",
    usage: "명시된 학교·학년도·전형 범위에서 전형 사실을 설명한다. 실제 합격선이나 합격확률의 증거로 확대하지 않는다.",
    coaching: false,
  },
  exam_score_report: {
    label: "본고사 성적·결과 제보",
    usage: "같은 시험·학교·학년도·학과인지 확인한 뒤 개별 성적과 결과 사례로 인용한다. 한 건을 최소 합격점이나 합격확률로 바꾸지 않는다.",
    coaching: false,
  },
  mock_exam_reference: {
    label: "모의고사 참고자료",
    usage: "원문 학과 그룹과 누적 평균으로만 소개한다. 참고용이며 정확한 합격 기준은 아니다. 본고사 컷·합격확률로 환산하지 않는다.",
    coaching: true,
  },
  experience_report: {
    label: "개인 경험·후기",
    usage: "개인의 경험으로 출처와 상황을 밝혀 소개한다. 누구나 재현할 결과나 공식 전형 사실로 일반화하지 않는다.",
    coaching: true,
  },
  coaching_guidance: {
    label: "상담 조언",
    usage: "사용자 상황에 맞는 선택지와 다음 행동을 제안한다. 학교별 사실·점수 기준·합격 보장의 근거로 사용하지 않는다.",
    coaching: true,
  },
  unclassified: {
    label: "유형 미확인 자료",
    usage: "적힌 내용의 제한적 참고만 허용한다. 공식 사실·정확한 합격 기준·일반적인 성공 법칙으로 단정하지 않는다.",
    coaching: false,
  },
};

export function formatEvidenceContext(item: EvidenceInput, text: string): string {
  const kind = classifyKnowledgeEvidence(item);
  const policy = EVIDENCE_POLICIES[kind];
  return `[근거 유형: ${kind} / ${policy.label}]\n[사용 범위: ${policy.usage}]\n${text}`;
}

// 정보의 승인 상태는 검색 노출 권한이며, 정보 자체가 공식 사실이라는 뜻은 아니다.
export const EVIDENCE_ANSWER_POLICY = [
  "검색 유사도와 검색된 자료 수는 사실의 확실성이나 질문의 답변 가능성을 뜻하지 않는다.",
  "각 근거의 유형·사용 범위·학교·학년도·학과가 이번 질문에 맞는지 먼저 판단한다.",
  "직접 답할 근거가 있는 부분은 출처에 맞게 설명하고, 없는 부분만 짧게 한계를 밝힌다. 일부 자료가 없다는 이유로 답할 수 있는 부분까지 거절하지 않는다.",
  "공식 사실, 참고 통계, 개인 경험, 상담 제안을 문장 안에서 구분한다. 개인 경험이나 통계에 대한 소개를 보편적인 처방으로 바꾸지 않는다.",
].join("\n");
