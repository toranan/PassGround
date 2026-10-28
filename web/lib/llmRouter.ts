// 정규식 라우팅 대신 LLM이 질문을 요청 단위로 나누고, 요청마다 필요한 자료를 원문으로 모은 뒤 한 번에 답한다.
// /api/ai/chat 기본 경로다. AI_CHAT_ROUTER=legacy 이면 기존 규칙 라우팅을 쓴다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStructuredJson, generateText, streamText } from "@/lib/aiRag";
import { buildCoachingTopicGuides } from "@/lib/coachingTopics";
import { buildMockExamCoachingPrompts, type MockExamReference } from "@/lib/mockExamCoaching";
import { collectSchoolEvidence, collectTransferFieldEvidence, tryAnswerTransferCatalogQuestion } from "@/lib/transferAdmissionCatalog";

type HistoryMessage = { role: "user" | "assistant"; text: string };

export type RoutedRequest = {
  kind: "admission_lookup" | "field_search" | "counseling";
  query: string;
  universities: string[];
  fieldLabel: string | null;
  fieldKeywords: string[];
};

export type RouterPlan = {
  smalltalk: boolean;
  requests: RoutedRequest[];
  coachingTopics: Array<"start_timing" | "gpa" | "cutoff" | "applicant_profile" | "mock_exam">;
  applicant: { englishScore: string | null; gpa: string | null; other: string | null };
};

const ROUTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["smalltalk", "requests", "coachingTopics", "applicant"],
  properties: {
    smalltalk: { type: "boolean" },
    requests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "query", "universities", "fieldLabel", "fieldKeywords"],
        properties: {
          kind: { type: "string", enum: ["admission_lookup", "field_search", "counseling"] },
          query: { type: "string" },
          universities: { type: "array", items: { type: "string" } },
          fieldLabel: { type: ["string", "null"] },
          fieldKeywords: { type: "array", items: { type: "string" } },
        },
      },
    },
    coachingTopics: { type: "array", items: { type: "string", enum: ["start_timing", "gpa", "cutoff", "applicant_profile", "mock_exam"] } },
    applicant: {
      type: "object",
      additionalProperties: false,
      required: ["englishScore", "gpa", "other"],
      properties: {
        englishScore: { type: ["string", "null"] },
        gpa: { type: ["string", "null"] },
        other: { type: ["string", "null"] },
      },
    },
  },
} as const;

const APPLICANT_PROFILE_GUIDE = [
  "아래는 지원자가 자기 조건(공인영어 점수, 학점, 백분율 등)을 말하며 갈 수 있는 곳을 물을 때의 상담 방침이다.",
  "- 먼저 조건별로 강점과 약점을 짚는다. 예: 학점이 높으면 전적대 성적 반영 비중이 큰 곳에서 유리하다. 공인영어 점수가 낮으면 영어 최저 기준이 있는 학교는 지원 자체가 어렵다.",
  "- 조회 결과에 영어 최저 기준이 있으면 지원자 점수와 비교해 지원이 어려운 곳을 분명히 말한다. 기준이 결과에 없으면 비교하지 않는다.",
  "- 약점을 보완하는 방법(예: 공인영어 점수를 올리면 선택지가 넓어진다)을 한두 문장으로 제안한다.",
  "- 그다음 조회 결과에 있는 학교별 전형을 정리한다. 합격 가능성·확률·합격선은 말하지 않는다.",
].join("\n");

export async function planWithRouter(question: string, history: HistoryMessage[] = []): Promise<RouterPlan> {
  const recent = history.slice(-4).map((message) => `${message.role === "user" ? "사용자" : "합곰"}: ${message.text}`).join("\n");
  return generateStructuredJson<RouterPlan>({
    schemaName: "chat_router_plan",
    schema: ROUTER_SCHEMA as unknown as Record<string, unknown>,
    disableThinking: true,
    maxOutputTokens: 700,
    systemPrompt: [
      "너는 편입 상담 앱의 질문 분배기다. 답을 쓰지 말고 처리 계획만 JSON으로 반환한다.",
      "질문 하나에 여러 요청이 섞여 있으면 requests를 여러 개로 나눈다. 각 query는 앞 대화 없이도 이해되도록 학교·학과·조건을 채운 한 문장으로 쓴다.",
      "kind 기준: 특정 학교(들)의 모집요강 사실(시험과목·반영비율·지원자격·일정·모집인원·공인영어 기준·자료 보유 여부)이나 '수학만 보는 학교'처럼 조건으로 학교를 찾는 질문은 admission_lookup.",
      "universities에는 질문(또는 최근 대화)에 나온 대학 이름만 넣는다. 성대·시립대 같은 줄임말은 정식 이름(성균관대학교, 서울시립대학교)으로 바꾼다. 없으면 빈 배열.",
      "학교 이름 없이 학과·계열(약대, 체대, 간호, 물리치료 등)의 편입 정보나 그 계열을 뽑는 학교를 찾으면 field_search. fieldLabel은 '체육 계열'처럼 짧게, fieldKeywords에는 모집단위 이름에 들어갈 단어를 넣는다(예: 체대 → 체육, 스포츠 / 약대 → 약학, 제약 / 물리치료 → 물리치료).",
      "공부법·멘탈·시작 시기·학점·커트라인·합격 가능성·진로 고민은 counseling.",
      "모집요강 단어가 조금이라도 필요하면 조회 요청을 빼지 않는다. 애매하면 조회 요청과 counseling을 함께 넣는다.",
      "coachingTopics: 시작 시기·몇 년도 지원 → start_timing, 학점·전적대 성적 → gpa, 커트라인·합격 점수·합격 가능성 → cutoff, 지원자가 자기 점수·학점 등 조건을 말하며 갈 수 있는 곳을 찾으면 applicant_profile, 모의고사 점수·성적 상담 → mock_exam.",
      "applicant에는 질문에 나온 지원자 조건만 원문 그대로 적고 없으면 null.",
      "인사·감사만 있는 메시지는 smalltalk=true, requests는 빈 배열.",
    ].join("\n"),
    userPrompt: recent ? `최근 대화:\n${recent}\n\n질문: ${question}` : `질문: ${question}`,
  });
}

export type RoutedResult = { request: RoutedRequest; answer: string | null; grounded: boolean };

async function runRequest(admin: SupabaseClient, request: RoutedRequest, history: HistoryMessage[]): Promise<RoutedResult> {
  if (request.kind === "counseling") return { request, answer: null, grounded: false };
  if (request.kind === "field_search" && request.fieldKeywords.length) {
    // 계열 찾기는 중간 요약 없이 학교별 원문을 그대로 넘긴다.
    const evidence = await collectTransferFieldEvidence({ admin, keywords: request.fieldKeywords });
    if (!evidence?.schools.length) {
      return { request, answer: evidence ? `${evidence.year}학년도 확보 ${evidence.coverageCount}개교 자료에서 '${request.fieldKeywords.join("·")}' 관련 모집단위를 찾지 못함` : null, grounded: false };
    }
    const body = evidence.schools
      .map(({ school, texts }) => `<${school}>\n${texts.map((text) => `- ${text}`).join("\n")}`)
      .join("\n\n");
    return {
      request,
      answer: `${evidence.year}학년도 확보 ${evidence.coverageCount}개교 자료 중 '${request.fieldKeywords.join("·")}'가 언급된 학교의 원문이다. 언급만 되고 모집하지 않는 학교도 섞여 있다. ${evidence.basisNote}\n\n${body}`,
      grounded: true,
    };
  }
  if (request.universities.length) {
    // 학교를 콕 집은 질문은 검색 없이 그 학교 자료 전체를 원문으로 넘긴다.
    const evidence = await collectSchoolEvidence({ admin, universities: request.universities });
    if (evidence) {
      const found = evidence.schools
        .map(({ school, basisNote, texts }) => `<${school} · ${basisNote}>\n${texts.map((text) => `- ${text}`).join("\n")}`)
        .join("\n\n");
      const missing = evidence.missing.length
        ? `\n\n자료를 아직 확보하지 못한 학교: ${evidence.missing.join(", ")} (현재 확보 ${evidence.coverageCount}개교)`
        : "";
      return { request, answer: `${found}${missing}`.trim(), grounded: evidence.schools.length > 0 };
    }
  }
  // 학교 없이 조건으로 여러 학교를 찾는 질문은 기존 구조화 조회를 쓴다.
  const result = await tryAnswerTransferCatalogQuestion({ admin, question: request.query, historyMessages: history });
  return { request, answer: result?.answer ?? null, grounded: Boolean(result?.grounded) };
}

async function loadMockExamReferences(admin: SupabaseClient): Promise<MockExamReference[]> {
  try {
    const { data, error } = await admin.from("ai_knowledge_items")
      .select("id,question,answer")
      .eq("exam_slug", "transfer")
      .eq("status", "approved")
      .contains("tags", ["mock-exam-average", "reference-only"])
      .order("question")
      .limit(100);
    return error ? [] : ((data ?? []) as MockExamReference[]);
  } catch {
    return [];
  }
}

export type RouterAnswer = {
  plan: RouterPlan;
  results: RoutedResult[];
  answer: string;
  evidenceText: string;
  mockExamReferenceIds: string[];
};

export async function answerWithRouter(params: {
  admin: SupabaseClient;
  question: string;
  history?: HistoryMessage[];
  /** 운영자가 승인한 조언 지식(태그 매칭). 있으면 상담 방침과 함께 넣는다. */
  adviceText?: string;
  onDelta?: (delta: string) => void;
}): Promise<RouterAnswer> {
  const history = params.history ?? [];
  const plan = await planWithRouter(params.question, history);
  const [results, mockReferences] = await Promise.all([
    Promise.all(plan.requests.map((request) => runRequest(params.admin, request, history))),
    plan.coachingTopics.includes("mock_exam") ? loadMockExamReferences(params.admin) : Promise.resolve([]),
  ]);

  const lookups = results.filter((result) => result.request.kind !== "counseling");
  const evidenceText = lookups
    .map((result, index) => `[조회 ${index + 1}] ${result.request.query}\n${result.answer ?? "(이 요청에 맞는 자료를 찾지 못함)"}`)
    .join("\n\n");
  const topicGuides = buildCoachingTopicGuides(plan.coachingTopics.filter((topic) => topic !== "applicant_profile" && topic !== "mock_exam"));
  const mockExam = plan.coachingTopics.includes("mock_exam")
    ? buildMockExamCoachingPrompts(params.question, mockReferences, history)
    : null;
  const guides = [
    plan.coachingTopics.includes("applicant_profile") ? APPLICANT_PROFILE_GUIDE : "",
    topicGuides,
    mockExam ? `아래는 모의고사 성적 상담 방침이다.\n${mockExam.systemPrompt}\n\n모의고사 평균 참고자료:\n${mockReferences.map((row) => row.answer).join("\n\n") || "해당 평균 자료 없음"}` : "",
    params.adviceText ? `아래는 운영자가 승인한 상담 조언이다. 질문과 관련 있을 때만 참고한다.\n${params.adviceText}` : "",
  ].filter(Boolean).join("\n\n");
  const applicant = Object.entries(plan.applicant).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(", ");
  const recent = history.slice(-6).map((message) => `${message.role === "user" ? "사용자" : "합곰"}: ${message.text}`).join("\n");

  const prompts = {
    maxOutputTokens: 8000,
    systemPrompt: [
      "너는 편입 준비생을 돕는 상담 도우미 '합곰'이다. 친근한 반말로 답한다.",
      "질문에 들어 있는 요청을 하나도 빠뜨리지 말고 한 흐름의 답으로 이어서 쓴다. 질문에 필요한 내용만 쓰고, 묻지 않은 공부 팁이나 긴 덧붙임은 하지 않는다.",
      "앱 화면은 마크다운을 렌더링하지 않는다. #, **, 표, 파이프(|) 기호를 쓰지 않는다. 학교·항목은 줄을 바꾸고 '- '로 시작하는 목록으로 쓴다.",
      "모집요강 사실(학교·모집단위·시험과목·반영비율·공인영어 기준·일정·모집인원)은 [조회 결과]에 있는 것만 말한다. 결과에 없는 학교·숫자를 만들지 않는다.",
      "조회 결과가 없거나 일부만 있으면 없는 부분만 '아직 확보한 자료에 없다'고 짧게 말하고, 나머지는 있는 자료와 일반적인 조언으로 최대한 답한다. '근거가 없어 답할 수 없다'로 끝내지 않는다.",
      "학교 이름이 조회 결과에 나왔다고 그 학과를 모집한다고 말하지 않는다. 원문에 '모집하지 않는다', '미모집', '선발하지 않음', '제외'가 있으면 모집하지 않는 곳으로 따로 말하거나 빼고, 모집 여부가 원문에 분명하지 않으면 '자료에서 확인되지 않음'이라고 쓴다.",
      "공인영어 최저 기준은 원문에 '이상', '최저', '지원자격', '기준'처럼 지원 조건으로 적힌 점수만 말한다. 환산표·배점표에 나온 점수 구간을 최저 기준으로 쓰지 않는다.",
      "합격 가능 여부, 합격 확률, 커트라인 숫자는 말하지 않는다.",
      "[조회 결과], 근거, 원문 같은 내부 자료 이름은 답에 쓰지 않는다. 사용자에게는 '지금 확보한 자료' 정도로만 말한다.",
      "공부법·멘탈 같은 일반 조언은 모집요강 숫자를 쓰지 않는 선에서 자유롭게 해도 된다.",
      "조회 결과가 기본계획 기준이면 최종 모집요강에서 바뀔 수 있다고 한 번만 말한다.",
      guides ? `\n[운영자 상담 방침]\n${guides}` : "",
    ].join("\n"),
    userPrompt: [
      recent ? `최근 대화:\n${recent}\n` : "",
      `질문: ${params.question}`,
      applicant ? `지원자 조건: ${applicant}` : "",
      `\n[조회 결과]\n${evidenceText || "(조회 없음)"}`,
    ].filter(Boolean).join("\n"),
  };
  const answer = params.onDelta
    ? await streamText({ ...prompts, onDelta: params.onDelta })
    : await generateText(prompts);
  return { plan, results, answer: answer.trim(), evidenceText, mockExamReferenceIds: mockReferences.map((row) => row.id) };
}

// 답에 나온 숫자 중 질문이나 조회 결과에 없는 것을 찾는다. 할루시네이션 점검용.
export function unverifiedNumbers(answer: string, sources: string): string[] {
  const normalize = (text: string) => text.replace(/,/g, "");
  const haystack = normalize(sources);
  const numbers = normalize(answer).match(/\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(numbers)].filter((value) => !haystack.includes(value));
}
