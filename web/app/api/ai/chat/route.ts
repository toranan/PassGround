import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createEmbedding,
  createEmbeddings,
  EmbeddingsDisabledError,
  generateGroundedAnswer,
  generateGroundedAnswerStream,
  generateText,
  getAiProviderName,
  getChatModelName,
  getEmbeddingModelName,
  streamText,
} from "@/lib/aiRag";
import {
  buildChatCacheKey,
  cleanupExpiredChatCache,
  getKnowledgeRevision,
  readChatCache,
  shouldUseChatCache,
  upsertChatCache,
} from "@/lib/aiChatCache";
import { recordAiChatObservation } from "@/lib/aiObservability";
import { inferKnowledgeTags } from "@/lib/knowledgeTags";
import {
  inferDeterministicCoachingReason,
  selectCoachingAdviceRows,
  type CoachingAdviceSourceRow,
} from "@/lib/coachingKnowledge";
import {
  isCutoffEvidenceKnowledgeItem,
  type CutoffEvidenceKnowledgeItem,
} from "@/lib/cutoffEvidence";
import { getBearerToken, getUserByAccessToken } from "@/lib/authServer";
import { tryAnswerTransferCatalogQuestion } from "@/lib/transferAdmissionCatalog";
import { EVIDENCE_ANSWER_POLICY, formatEvidenceContext, type EvidenceInput } from "@/lib/knowledgeEvidence";
import { COUNSELING_ANSWER_POLICY, COUNSELING_FALLBACK } from "@/lib/counselingPolicy";
import { asksAdmissionFacts, smalltalkReply } from "@/lib/chatRoutingPolicy";
import {
  buildMockExamCoachingPrompts,
  isMockExamCounselingQuestion,
  MOCK_EXAM_COACHING_FALLBACK,
  type MockExamReference,
} from "@/lib/mockExamCoaching";

type Exam = "transfer" | "cpa";
type IntentRoute = "fact" | "emotion" | "mixed";
type FinalRoute = "grounded" | "fallback" | "emotion" | "mixed";
type CacheStatus = "hit" | "miss" | "bypass" | "error";

type MatchedChunkRow = {
  id: string;
  knowledge_item_id: string;
  chunk_text: string;
  similarity: number;
};

type CoachingAdviceRow = CoachingAdviceSourceRow;

type CoachingAdviceSnippet = {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  score: number;
};

type ResponseContext = {
  id: string;
  knowledgeItemId: string;
  similarity: number;
  preview: string;
};

type ChatHistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

type ChatSuccessPayload = {
  ok: true;
  exam: Exam;
  intent: IntentRoute;
  route: FinalRoute;
  answer: string;
  needsQuestionSubmission: boolean;
  adviceKnowledgeItemIds?: string[];
  contexts: ResponseContext[];
  cache: CacheStatus;
  traceId: string;
  metrics: {
    totalMs: number;
    cacheMs: number;
    embeddingMs: number;
    retrievalMs: number;
    generationMs: number;
  };
};

type StreamCallbacks = {
  onMeta: (data: Record<string, unknown>) => void;
  onDelta: (delta: string) => void;
};

class ChatHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const FACT_FALLBACK_ANSWER = [
  "현재 저장된 정보에서는 이 질문에 답할 근거를 찾지 못했어.",
  "없는 내용을 임의로 덧붙이지 않을게.",
].join("\n");

const EMOTION_KEYWORDS = [
  "불안",
  "걱정",
  "멘탈",
  "스트레스",
  "힘들",
  "지쳐",
  "무기력",
  "우울",
  "눈물",
  "포기",
  "자신감",
  "두려",
  "망쳤",
  "망했",
  "압박",
  "번아웃",
  "패닉",
  "자책",
  "괴롭",
];

const FACT_KEYWORDS = [
  "전형",
  "모집요강",
  "지원",
  "학점",
  "커트라인",
  "영어",
  "수학",
  "시험",
  "일정",
  "학사",
  "서류",
  "면접",
  "자소서",
  "합격",
  "불합격",
  "경쟁률",
  "toefl",
  "toeic",
  "편입영어",
  "편입수학",
  "출제",
  "문항",
  "가산점",
  "대학",
  "학과",
  "시간관리",
  "루틴",
  "계획",
  "복습",
  "학습",
  "공부",
];

const GENERAL_CHAT_KEYWORDS = [
  "안녕",
  "하이",
  "hello",
  "hi",
  "반가",
  "잘지내",
  "요즘 어때",
  "고마워",
  "감사",
  "힘내",
  "ㅋㅋ",
  "ㅎㅎ",
  "대화",
  "잡담",
];

const CUTOFF_CHAT_KEYWORDS = [
  "커트라인",
  "컷",
  "합격점",
  "합격권",
  "추합",
  "불합격",
  "영수합",
  "점이면",
  "점수",
];

const UNIVERSITY_ALIASES: Array<{ alias: string; name: string }> = [
  { alias: "성균관대", name: "성균관대학교" },
  { alias: "성대", name: "성균관대학교" },
  { alias: "연세대", name: "연세대학교" },
  { alias: "연대", name: "연세대학교" },
  { alias: "고려대", name: "고려대학교" },
  { alias: "고대", name: "고려대학교" },
  { alias: "중앙대", name: "중앙대학교" },
  { alias: "중대", name: "중앙대학교" },
  { alias: "한양대", name: "한양대학교" },
  { alias: "경희대", name: "경희대학교" },
  { alias: "한국외대", name: "한국외국어대학교" },
  { alias: "외대", name: "한국외국어대학교" },
  { alias: "시립대", name: "서울시립대학교" },
  { alias: "건국대", name: "건국대학교" },
  { alias: "동국대", name: "동국대학교" },
  { alias: "홍익대", name: "홍익대학교" },
  { alias: "국민대", name: "국민대학교" },
  { alias: "숭실대", name: "숭실대학교" },
  { alias: "아주대", name: "아주대학교" },
  { alias: "인하대", name: "인하대학교" },
];

type CutoffChatParams = {
  year: number | null;
  university: string;
  major: string;
  score: string;
};

type CutoffFlowState = {
  active: boolean;
  slots: CutoffChatParams;
};

type CutoffHistoryContext = {
  active: boolean;
  slots: CutoffChatParams;
};

type MessageRouteDecision =
  | "cutoff_start"
  | "cutoff_continue"
  | "fact_or_emotion"
  | "smalltalk";

type CutoffFlowParams = {
  question: string;
  routeDecision: MessageRouteDecision;
  historyContext: CutoffHistoryContext;
};

type MessageRouteAiResult = {
  route: MessageRouteDecision;
  confidence: number | null;
};

type CoachingFallbackAiResult = {
  shouldCoaching: boolean;
  reason: "general_chat" | "study_coaching" | "profile_followup" | "none";
  confidence: number | null;
};

function createEmptyCutoffParams(): CutoffChatParams {
  return {
    year: null,
    university: "",
    major: "",
    score: "",
  };
}

function createInactiveCutoffFlow(): CutoffFlowState {
  return {
    active: false,
    slots: createEmptyCutoffParams(),
  };
}

function createDefaultMessageRouteAiResult(): MessageRouteAiResult {
  return {
    route: "fact_or_emotion",
    confidence: null,
  };
}

function createDefaultMessageRouteDecision(): MessageRouteDecision {
  return "fact_or_emotion";
}

function createCutoffFlowState(params: CutoffFlowParams): CutoffFlowState {
  const { question, routeDecision, historyContext } = params;
  if (routeDecision !== "cutoff_start" && routeDecision !== "cutoff_continue") {
    return createInactiveCutoffFlow();
  }

  return {
    active: true,
    slots: mergeCutoffChatParams(historyContext.slots, extractCutoffChatParams(question)),
  };
}

function parseMessageRouteDecisionLabel(value: string): MessageRouteDecision | null {
  const normalized = value.toLowerCase().trim();
  if (
    normalized !== "cutoff_start" &&
    normalized !== "cutoff_continue" &&
    normalized !== "fact_or_emotion" &&
    normalized !== "smalltalk"
  ) {
    return null;
  }
  return normalized;
}

function parseMessageRouteAiResult(raw: string): MessageRouteAiResult | null {
  const direct = raw.trim();
  const jsonCandidate = direct.startsWith("{") ? direct : (direct.match(/\{[\s\S]*\}/)?.[0] ?? "");
  if (!jsonCandidate) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as Record<string, unknown>;
  const routeRaw = normalizeText(row.route, 40);
  const route = parseMessageRouteDecisionLabel(routeRaw);
  if (!route) return null;
  const confidenceRaw =
    typeof row.confidence === "number"
      ? row.confidence
      : typeof row.confidence === "string"
      ? Number(row.confidence)
      : NaN;
  const confidence =
    Number.isFinite(confidenceRaw) && confidenceRaw >= 0 && confidenceRaw <= 1 ? confidenceRaw : null;

  return { route, confidence };
}

function classifyMessageRouteHeuristic(question: string, historyContext: CutoffHistoryContext): MessageRouteDecision {
  const currentIsCutoff = isCutoffQuestion(question);
  const currentIsContinuation = isCutoffContinuationQuestion(question);
  const likelyCutoffStart = isLikelyCutoffStartQuestion(question);
  const hasSlotSignal = hasCutoffSlotSignal(question);

  if (currentIsCutoff) return historyContext.active ? "cutoff_continue" : "cutoff_start";
  if (likelyCutoffStart) return historyContext.active ? "cutoff_continue" : "cutoff_start";
  if (historyContext.active && hasSlotSignal) return "cutoff_continue";
  if (historyContext.active && currentIsContinuation) return "cutoff_continue";
  if (isGeneralConversationQuestion(question)) return "smalltalk";
  return createDefaultMessageRouteDecision();
}

function deriveCutoffHistoryContext(historyMessages: ChatHistoryMessage[]): CutoffHistoryContext {
  const userHistory = historyMessages.filter((message) => message.role === "user").map((message) => message.text);
  let slots = createEmptyCutoffParams();
  let sawCutoffContext = false;
  let turnsSinceCutoff = Number.POSITIVE_INFINITY;

  for (const text of userHistory) {
    const looksCutoff =
      isCutoffQuestion(text) ||
      (sawCutoffContext && (isCutoffContinuationQuestion(text) || hasCutoffSlotSignal(text)));
    if (looksCutoff) {
      sawCutoffContext = true;
      turnsSinceCutoff = 0;
      slots = mergeCutoffChatParams(slots, extractCutoffChatParams(text));
      continue;
    }
    if (sawCutoffContext) turnsSinceCutoff += 1;
  }

  return {
    active: sawCutoffContext && turnsSinceCutoff <= 4,
    slots,
  };
}

async function resolveMessageRouteWithAI(params: {
  question: string;
  historyMessages: ChatHistoryMessage[];
  historyContext: CutoffHistoryContext;
}): Promise<MessageRouteDecision> {
  const { question, historyMessages, historyContext } = params;
  const heuristic = classifyMessageRouteHeuristic(question, historyContext);
  const currentIsCutoff = isCutoffQuestion(question);
  const currentIsContinuation = isCutoffContinuationQuestion(question);
  const likelyCutoffStart = isLikelyCutoffStartQuestion(question);
  const hasSlotSignal = hasCutoffSlotSignal(question);

  const historyText = historyMessages
    .slice(-8)
    .map((item, index) => `${index + 1}. ${item.role === "user" ? "사용자" : "합곰"}: ${item.text}`)
    .join("\n");
  const slotSummaryParts: string[] = [];
  if (historyContext.slots.year) slotSummaryParts.push(`학년도 ${historyContext.slots.year}`);
  if (historyContext.slots.university) slotSummaryParts.push(`학교 ${historyContext.slots.university}`);
  if (historyContext.slots.major) slotSummaryParts.push(`학과 ${historyContext.slots.major}`);
  if (historyContext.slots.score) slotSummaryParts.push(`점수 ${historyContext.slots.score}`);
  const slotSummary = slotSummaryParts.length ? slotSummaryParts.join(", ") : "없음";

  try {
    const raw = await generateText({
      systemPrompt: [
        "너는 메시지 라우터다.",
        "현재 사용자 메시지를 아래 route 중 하나로만 분류한다.",
        "- cutoff_start: 커트라인/합격점 분석을 새로 시작",
        "- cutoff_continue: 직전 커트라인 흐름을 이어서 슬롯 보완/질문",
        "- fact_or_emotion: 새로운 사실질문/감정질문",
        "- smalltalk: 인사/가벼운 잡담",
        "원칙: 기존 커트라인 흐름과 무관한 새 질문이면 반드시 fact_or_emotion 또는 smalltalk를 선택한다.",
        "원칙: 현재 메시지가 학년도/학교명/학과명/점수 같은 슬롯만 보강하면 cutoff_continue를 우선한다.",
        "원칙: 점수·학점·대학명이 언급되더라도, 특정 대학의 합격선(컷) 판정을 요구하는 게 아니라 전반적인 방향성·전략·상담을 묻는 질문이면 fact_or_emotion을 선택한다.",
        "출력은 JSON만 허용. 코드블록 금지.",
        'JSON 스키마: {"route":"cutoff_start|cutoff_continue|fact_or_emotion|smalltalk","confidence":0.0}',
      ].join("\n"),
      userPrompt: [
        "최근 대화:",
        historyText || "없음",
        `현재 컷 수집 상태 활성화: ${historyContext.active ? "yes" : "no"}`,
        `현재 컷 슬롯 요약: ${slotSummary}`,
        "",
        `현재 사용자 메시지: ${question}`,
      ].join("\n"),
      temperature: 0,
      maxOutputTokens: 120,
      disableThinking: true,
    });

    const ai = parseMessageRouteAiResult(raw) ?? createDefaultMessageRouteAiResult();
    if (ai.confidence !== null && ai.confidence < 0.55) {
      return heuristic;
    }

    if (ai.route === "cutoff_continue" && !historyContext.active) {
      return currentIsCutoff || likelyCutoffStart ? "cutoff_start" : "fact_or_emotion";
    }
    if (ai.route === "cutoff_start" && historyContext.active && currentIsContinuation && !currentIsCutoff) {
      return "cutoff_continue";
    }
    if (historyContext.active && hasSlotSignal && (ai.route === "fact_or_emotion" || ai.route === "smalltalk")) {
      return "cutoff_continue";
    }
    return ai.route;
  } catch {
    return heuristic;
  }
}

function resolveExam(value: string): Exam | null {
  if (value === "transfer" || value === "cpa") return value;
  return null;
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function validateExam(exam: Exam | null) {
  if (!exam) {
    return NextResponse.json({ error: "지원하지 않는 시험 카테고리입니다." }, { status: 400 });
  }
  if (exam === "cpa" && !ENABLE_CPA) {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }
  return null;
}

function countKeywordHits(text: string, keywords: string[]): number {
  return keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? 1 : 0), 0);
}

function isGeneralConversationQuestion(question: string): boolean {
  const text = question.toLowerCase().trim();
  if (!text) return false;

  const factHits = countKeywordHits(text, FACT_KEYWORDS);
  const generalHits = countKeywordHits(text, GENERAL_CHAT_KEYWORDS);

  if (generalHits >= 1 && factHits === 0) return true;
  if (smalltalkReply(question)) return true;
  return false;
}

function parseCoachingFallbackAiResult(raw: string): CoachingFallbackAiResult | null {
  const direct = raw.trim();
  const jsonCandidate = direct.startsWith("{") ? direct : (direct.match(/\{[\s\S]*\}/)?.[0] ?? "");
  if (!jsonCandidate) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const row = parsed as Record<string, unknown>;
  const shouldCoaching = row.shouldCoaching === true;
  const reasonRaw = normalizeText(row.reason, 40).toLowerCase();
  const reason: CoachingFallbackAiResult["reason"] =
    reasonRaw === "general_chat" ||
    reasonRaw === "study_coaching" ||
    reasonRaw === "profile_followup" ||
    reasonRaw === "none"
      ? reasonRaw
      : "none";
  const confidenceRaw =
    typeof row.confidence === "number"
      ? row.confidence
      : typeof row.confidence === "string"
      ? Number(row.confidence)
      : NaN;
  const confidence =
    Number.isFinite(confidenceRaw) && confidenceRaw >= 0 && confidenceRaw <= 1 ? confidenceRaw : null;

  return {
    shouldCoaching,
    reason,
    confidence,
  };
}

function normalizeIntentLabel(raw: string): IntentRoute | null {
  const value = raw.toLowerCase();
  if (value.includes("mixed") || value.includes("혼합") || value.includes("둘")) return "mixed";
  if (value.includes("emotion") || value.includes("감성") || value.includes("정서") || value.includes("위로")) {
    return "emotion";
  }
  if (value.includes("fact") || value.includes("정보") || value.includes("근거")) return "fact";
  return null;
}

function classifyIntentHeuristics(question: string): IntentRoute | null {
  const text = question.toLowerCase();
  const emotionHits = countKeywordHits(text, EMOTION_KEYWORDS);
  const factHits = countKeywordHits(text, FACT_KEYWORDS);

  if (emotionHits >= 2 && factHits === 0) return "emotion";
  if (factHits >= 2 && emotionHits === 0) return "fact";
  if (emotionHits >= 1 && factHits >= 1) return "mixed";
  if (emotionHits >= 1 && text.length <= 80) return "emotion";
  if (factHits >= 1 && text.includes("?")) return "fact";
  return null;
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "")
    .trim();
}

function mentionsKnownUniversity(value: string): boolean {
  const normalized = normalizeToken(value);
  return UNIVERSITY_ALIASES.some((item) => normalized.includes(normalizeToken(item.alias)));
}

function normalizeCutoffInput(question: string): string {
  return question
    .replace(/힉고/gi, "학과")
    .replace(/학고/gi, "학과")
    .replace(/힉과/gi, "학과")
    .replace(/학콰/gi, "학과")
    .replace(/학가/gi, "학과")
    .replace(/소프트\s+웨어/gi, "소프트웨어");
}

function isCutoffQuestion(question: string): boolean {
  const normalized = normalizeToken(normalizeCutoffInput(question));
  if (!normalized) return false;
  const keywordHits = CUTOFF_CHAT_KEYWORDS.reduce(
    (count, keyword) => count + (normalized.includes(normalizeToken(keyword)) ? 1 : 0),
    0
  );
  if (keywordHits >= 1) return true;
  return /(\d+(?:\.\d+)?)\s*점/.test(question) && (normalized.includes("합격") || normalized.includes("컷"));
}

function parseYearFromQuestion(question: string): number | null {
  const match = normalizeCutoffInput(question).match(/\b(20\d{2})\s*(?:학년도|년도|년)?/);
  if (!match?.[1]) return null;
  const year = Number(match[1]);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return null;
  return Math.round(year);
}

function parseScoreFromQuestion(question: string): string {
  const normalized = normalizeCutoffInput(question).replace(/,/g, "");
  const pointMatch = normalized.match(/(\d+(?:\.\d+)?)\s*점/);
  if (pointMatch?.[1]) return pointMatch[1];

  const sumMatch = normalized.match(/(?:영수합|총점|합산)\s*(\d+(?:\.\d+)?)/);
  if (sumMatch?.[1]) return sumMatch[1];

  const followupScoreMatch = normalized.match(/(?:^|[^0-9])(1?\d{2}(?:\.\d+)?)\s*(?:이면|면|어때|가능|될까|인가)/);
  if (followupScoreMatch?.[1]) return followupScoreMatch[1];

  return "";
}

function parseUniversityFromQuestion(question: string): string {
  const normalizedQuestion = normalizeCutoffInput(question);
  const normalized = normalizeToken(normalizedQuestion);
  const foundAlias = UNIVERSITY_ALIASES.find((row) => normalized.includes(normalizeToken(row.alias)));
  if (foundAlias) return foundAlias.name;

  const universityMatch = normalizedQuestion.match(/([가-힣A-Za-z0-9]+(?:대학교|대학|대))/);
  return universityMatch?.[1]?.trim() ?? "";
}

function parseMajorFromQuestion(question: string): string {
  const majorMatch = normalizeCutoffInput(question).match(/([가-힣A-Za-z0-9]+(?:학과|학부|전공))/);
  return majorMatch?.[1]?.trim() ?? "";
}

function extractCutoffChatParams(question: string): CutoffChatParams {
  return {
    year: parseYearFromQuestion(question),
    university: parseUniversityFromQuestion(question),
    major: parseMajorFromQuestion(question),
    score: parseScoreFromQuestion(question),
  };
}

function mergeCutoffChatParams(base: CutoffChatParams, incoming: CutoffChatParams): CutoffChatParams {
  return {
    year: incoming.year ?? base.year,
    university: incoming.university || base.university,
    major: incoming.major || base.major,
    score: incoming.score || base.score,
  };
}

function hasCutoffSlotSignal(question: string): boolean {
  const slots = extractCutoffChatParams(question);
  return Boolean(slots.year || slots.university || slots.major || slots.score);
}

function isCutoffContinuationQuestion(question: string): boolean {
  const normalized = normalizeToken(question);
  if (!normalized) return false;

  const followupMarkers = [
    "그럼",
    "그러면",
    "이면",
    "면",
    "어때",
    "가능",
    "될까",
    "맞아",
    "이점수",
    "이정도",
    "추합권",
    "합격권",
    "불합격",
  ];

  const hasMarker = followupMarkers.some((marker) => normalized.includes(normalizeToken(marker)));
  if (hasMarker && question.length <= 40) return true;

  const score = parseScoreFromQuestion(question);
  if (score && question.length <= 32) return true;
  return false;
}

function isLikelyCutoffStartQuestion(question: string): boolean {
  const hasScore = Boolean(parseScoreFromQuestion(question));
  const hasYear = Boolean(parseYearFromQuestion(question));
  const hasUniversity = Boolean(parseUniversityFromQuestion(question));
  const hasMajor = Boolean(parseMajorFromQuestion(question));
  return hasScore && (hasUniversity || hasMajor || hasYear);
}

function buildCutoffSlotPrompt(slots: CutoffChatParams): string {
  const known: string[] = [];
  if (slots.year) known.push(`학년도 ${slots.year}`);
  if (slots.university) known.push(`학교 ${slots.university}`);
  if (slots.major) known.push(`학과 ${slots.major}`);
  if (slots.score) known.push(`점수 ${slots.score}`);
  const summary = known.length ? `지금까지 확인된 값은 ${known.join(", ")}야.` : "";

  const missingLabels: string[] = [];
  if (!slots.year) missingLabels.push("학년도");
  if (!slots.university) missingLabels.push("학교명");
  if (!slots.major) missingLabels.push("학과명");
  if (!slots.score) missingLabels.push("점수");

  if (!missingLabels.length) return "컷 분석 정보를 확인하고 있어.";

  const exampleParts: string[] = [];
  if (!slots.year) exampleParts.push("2027학년도");
  if (!slots.university) exampleParts.push("성균관대학교");
  if (!slots.major) exampleParts.push("소프트웨어학과");
  if (!slots.score) exampleParts.push("영수합 150점");

  const requestLine =
    missingLabels.length === 1
      ? `분석하려면 ${missingLabels[0]}만 알려주면 돼.`
      : `분석하려면 ${missingLabels.join(", ")} 정보가 더 필요해.`;

  return [
    summary,
    requestLine,
    "아래 형식으로 한 번에 보내줘:",
    exampleParts.join(" "),
  ]
    .filter(Boolean)
    .join("\n");
}

function splitForStream(text: string, chunkSize = 80): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

function compactText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const sliced = normalized.slice(0, maxLength);
  const punctuationIndex = Math.max(sliced.lastIndexOf("."), sliced.lastIndexOf("!"), sliced.lastIndexOf("?"));
  if (punctuationIndex >= Math.floor(maxLength * 0.55)) {
    return sliced.slice(0, punctuationIndex + 1).trim();
  }

  const spaceIndex = sliced.lastIndexOf(" ");
  if (spaceIndex >= Math.floor(maxLength * 0.7)) {
    return sliced.slice(0, spaceIndex).trim();
  }

  return sliced.trim();
}

function normalizeHistoryMessages(value: unknown, maxItems = 8): ChatHistoryMessage[] {
  if (!Array.isArray(value)) return [];

  const normalized: ChatHistoryMessage[] = [];
  const tail = value.slice(-Math.max(0, maxItems));
  for (const item of tail) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const role = normalizeText(row.role, 20).toLowerCase();
    if (role !== "user" && role !== "assistant") continue;
    const text = normalizeText(row.text ?? row.content, 500);
    if (!text) continue;
    normalized.push({ role, text });
  }
  return normalized;
}

function buildConversationHistoryText(historyMessages: ChatHistoryMessage[]): string {
  if (!historyMessages.length) return "";
  return historyMessages
    .map((item, index) => `${index + 1}. ${item.role === "user" ? "사용자" : "합곰"}: ${item.text}`)
    .join("\n");
}

function buildQuestionWithHistory(question: string, historyMessages: ChatHistoryMessage[]): string {
  if (!historyMessages.length) return question;
  const historyText = buildConversationHistoryText(historyMessages);
  return [`이전 대화 맥락:\n${historyText}`, `현재 질문:\n${question}`].join("\n\n");
}

async function loadCoachingAdviceSnippets(params: {
  admin: SupabaseClient;
  exam: Exam;
  question: string;
  limit?: number;
}): Promise<CoachingAdviceSnippet[]> {
  const limit = params.limit ?? 3;
  const queryTags = inferKnowledgeTags(params.question, 4);

  const { data, error } = await params.admin
    .from("ai_knowledge_items")
    .select("id,question,answer,tags,approved_at,updated_at")
    .eq("exam_slug", params.exam)
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) return [];

  const rows = (data as CoachingAdviceRow[] | null) ?? [];
  if (!rows.length) return [];

  const selected = selectCoachingAdviceRows({
    rows,
    question: params.question,
    queryTags,
    limit,
  });

  return selected.map(({ row, score }) => ({
    id: row.id,
    question: compactText(row.question || "", 140),
    answer: compactText(row.answer || "", 520),
    tags: Array.isArray(row.tags) ? row.tags.filter(Boolean) : [],
    score,
  }));
}

function buildAdviceReferenceText(adviceSnippets: CoachingAdviceSnippet[]): string {
  if (!adviceSnippets.length) return "없음";
  return adviceSnippets
    .map((item, index) => {
      const tags = item.tags.length ? item.tags.join(", ") : "일반코칭";
      return `${index + 1}. [${tags}] ${formatEvidenceContext(item, item.answer)}`;
    })
    .join("\n");
}

function parseSubQuestions(raw: string): string[] {
  const direct = raw
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const jsonCandidate = direct.startsWith("{") ? direct : (direct.match(/\{[\s\S]*\}/)?.[0] ?? "");
  if (!jsonCandidate) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const list = (parsed as Record<string, unknown>).subQuestions;
  if (!Array.isArray(list)) return [];

  return list
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.replace(/\s+/g, " ").trim())
    .filter((entry) => entry.length >= 5 && entry.length <= 200)
    .slice(0, 4);
}

// 복합 질문은 벡터 하나로 뭉개지면 어떤 지식과도 유사도가 낮아진다.
// 주제별 하위 질문으로 쪼개 각각 검색하고 근거를 합치면 회수율이 올라간다.
async function decomposeQuestionForRetrieval(question: string): Promise<string[]> {
  if (question.length < 80) return [];
  try {
    const raw = await generateText({
      systemPrompt: [
        "너는 지식 검색용 질문 분해기다.",
        "사용자 질문이 여러 주제를 담고 있으면, 벡터 검색에 쓸 독립적인 하위 질문 2~4개로 분해한다.",
        "규칙:",
        "- 각 하위 질문은 한 가지 주제만 담은 완결된 한 문장으로 쓴다. 최대 4개.",
        "- 여러 대학·학과가 나열돼 있으면 대학별로 반복하지 말고 하나의 하위 질문으로 묶는다.",
        "- 검색에 불필요한 개인 서사(현재 다니는 학교, 상황 묘사)는 빼고 핵심 주제만 남긴다.",
        "- 질문이 단일 주제면 빈 배열을 반환한다.",
        "출력은 JSON만 허용. 코드블록 금지.",
        'JSON 스키마: {"subQuestions":["..."]}',
        "",
        "예시 입력: 학점 3.5인데 한양대 건국대 기계공학과 편입하려면 뭐부터 해야 해? 수학은 자신 없어",
        '예시 출력: {"subQuestions":["한양대 건국대 기계공학과 편입 전형은 어떻게 되나요?","편입할 때 학점 3.5면 충분한가요?","수학이 약한데 자연계 편입 준비는 어떻게 시작해야 하나요?"]}',
      ].join("\n"),
      userPrompt: `사용자 질문: ${question}`,
      temperature: 0,
      maxOutputTokens: 300,
      disableThinking: true,
    });
    return parseSubQuestions(raw);
  } catch {
    return [];
  }
}

async function classifyIntent(question: string): Promise<IntentRoute> {
  try {
    const classifier = await generateText({
      systemPrompt:
        "너는 사용자 질문의 의도를 분류한다. 반드시 fact, emotion, mixed 중 하나의 단어만 출력해라.",
      userPrompt: [
        `질문: ${question}`,
        "",
        "분류 기준:",
        "- fact: 입시/학습 정보, 기준, 절차, 일정 등 사실 중심",
        "- emotion: 불안/위로/동기부여 등 감정 지원 중심",
        "- mixed: 사실 정보와 감정 지원이 동시에 필요한 경우",
      ].join("\n"),
      temperature: 0,
      maxOutputTokens: 8,
      disableThinking: true,
    });
    const intent = normalizeIntentLabel(classifier);
    if (intent) return intent;
    return classifyIntentHeuristics(question) ?? "fact";
  } catch {
    return classifyIntentHeuristics(question) ?? "fact";
  }
}

async function resolveCoachingFallbackWithAI(params: {
  question: string;
  historyMessages: ChatHistoryMessage[];
  intent: IntentRoute;
  hasEnoughContext: boolean;
  isGeneralChat: boolean;
}): Promise<{ shouldFallback: boolean; reason: CoachingFallbackAiResult["reason"] }> {
  const { question, historyMessages, intent, hasEnoughContext, isGeneralChat } = params;
  if (asksAdmissionFacts(question, historyMessages)) return { shouldFallback: false, reason: "none" };
  if (intent !== "fact" || hasEnoughContext) {
    return { shouldFallback: false, reason: "none" };
  }

  const deterministicReason = inferDeterministicCoachingReason(question, historyMessages);
  const heuristicReason: CoachingFallbackAiResult["reason"] = isGeneralChat
    ? "general_chat"
    : deterministicReason;
  const heuristicFallback = heuristicReason !== "none";
  if (heuristicFallback) return { shouldFallback: true, reason: heuristicReason };
  const historyText = buildConversationHistoryText(historyMessages);

  try {
    const raw = await generateText({
      systemPrompt: [
        "너는 코칭 fallback 분기 판정기다.",
        "현재 질문이 사실 근거 부족 상태일 때, 정보부족 안내 대신 코칭 답변으로 전환할지 판단한다.",
        "판정 기준:",
        "- general_chat: 인사/가벼운 잡담/짧은 안부",
        "- study_coaching: 공부법, 전략, 루틴, 멘탈 관리처럼 코칭이 유효한 질문",
        "- profile_followup: 직전 코칭 대화에서 사용자가 짧게 본인 상태(등급/베이스/점수 등)만 답한 후속 입력",
        "- none: 위에 해당하지 않음",
        "출력은 JSON만 허용. 코드블록 금지.",
        'JSON 스키마: {"shouldCoaching":true,"reason":"general_chat|study_coaching|profile_followup|none","confidence":0.0}',
      ].join("\n"),
      userPrompt: [
        `현재 intent: ${intent}`,
        `RAG 근거 충분 여부: ${hasEnoughContext ? "yes" : "no"}`,
        `일반대화 휴리스틱 신호: ${isGeneralChat ? "yes" : "no"}`,
        historyText ? `최근 대화:\n${historyText}` : "최근 대화: 없음",
        "",
        `현재 사용자 메시지: ${question}`,
      ].join("\n"),
      temperature: 0,
      maxOutputTokens: 120,
      disableThinking: true,
    });

    const ai = parseCoachingFallbackAiResult(raw);
    if (!ai || (ai.confidence !== null && ai.confidence < 0.55)) {
      return {
        shouldFallback: heuristicFallback,
        reason: heuristicReason,
      };
    }

    if (!ai.shouldCoaching) {
      return {
        shouldFallback: heuristicFallback,
        reason: heuristicReason,
      };
    }

    return {
      shouldFallback: true,
      reason: ai.reason === "none" ? "study_coaching" : ai.reason,
    };
  } catch {
    return {
      shouldFallback: heuristicFallback,
      reason: heuristicReason,
    };
  }
}

function buildEmotionPrompts(
  question: string,
  adviceSnippets: CoachingAdviceSnippet[],
  historyMessages: ChatHistoryMessage[] = []
) {
  const adviceReference = buildAdviceReferenceText(adviceSnippets);
  const historyText = buildConversationHistoryText(historyMessages);

  return {
    systemPrompt: [
      "너는 편입 수험생 전담 코치 '합곰'이다.",
      "말투는 친구처럼 친근하고 다정하게 유지하고, 반드시 반말만 사용한다. 존댓말은 금지한다.",
      "답변은 4~6문장으로 짧게 유지한다.",
      EVIDENCE_ANSWER_POLICY,
      COUNSELING_ANSWER_POLICY,
      "사용자 입력이 인사/잡담(예: 안녕, 하이, 반가워) 성격이면 첫 문장을 '안녕! 나는 너의 편입 고민을 들어줄 합곰이야.'로 시작한다.",
      "구체적인 정보는 제공된 레퍼런스로만 설명하고, 그 밖의 상담은 기본 상담 원칙 범위 안에서 제공한다.",
      "과장이나 근거 없는 단정은 금지한다.",
    ].join("\n"),
    userPrompt: [
      historyText ? `이전 대화 맥락:\n${historyText}` : "",
      `학생 말: ${question}`,
      "",
      `조언 레퍼런스:\n${adviceReference}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

async function generateEmotionAnswer(
  question: string,
  adviceSnippets: CoachingAdviceSnippet[] = [],
  historyMessages: ChatHistoryMessage[] = []
): Promise<string> {
  const greeting = smalltalkReply(question);
  if (greeting) return greeting;
  const prompts = buildEmotionPrompts(question, adviceSnippets, historyMessages);
  try {
    return (await generateText({ ...prompts, temperature: 0.5 })).trim() || COUNSELING_FALLBACK;
  } catch {
    return COUNSELING_FALLBACK;
  }
}

async function generateEmotionAnswerStream(
  question: string,
  adviceSnippets: CoachingAdviceSnippet[] = [],
  historyMessages: ChatHistoryMessage[] = [],
  onDelta: (delta: string) => void
): Promise<string> {
  if (!adviceSnippets.length || smalltalkReply(question)) {
    const answer = await generateEmotionAnswer(question, adviceSnippets, historyMessages);
    onDelta(answer);
    return answer;
  }
  const prompts = buildEmotionPrompts(question, adviceSnippets, historyMessages);
  return streamText({
    ...prompts,
    temperature: 0.5,
    onDelta,
  });
}

function composeMixedAnswer(factAnswer: string, emotionAnswer: string): string {
  return [`정보 답변:\n${factAnswer}`, `코칭:\n${emotionAnswer}`].join("\n\n");
}

function toSseEvent(event: string, data: unknown): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function isStreamRequested(body: Record<string, unknown>, request: Request): boolean {
  if (body.stream === true) return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/event-stream");
}

async function runChatWorkflow(params: {
  body: Record<string, unknown>;
  exam: Exam;
  question: string;
  traceId: string;
  startedAt: number;
  stream?: StreamCallbacks;
}): Promise<ChatSuccessPayload> {
  const { body, exam, question, traceId, startedAt, stream } = params;

  const provider = getAiProviderName();
  const chatModel = getChatModelName();
  const embeddingModel = getEmbeddingModelName();

  let cacheMs = 0;
  let embeddingMs = 0;
  let retrievalMs = 0;
  let generationMs = 0;

  const admin = getSupabaseAdmin();
  const minSimilarity =
    typeof body.minSimilarity === "number" ? Math.max(0, Math.min(1, body.minSimilarity)) : 0.5;
  const matchCount = typeof body.matchCount === "number" ? Math.max(1, Math.min(12, Math.floor(body.matchCount))) : 6;
  const historyMessages = normalizeHistoryMessages(body.messages);
  const directSmalltalk = smalltalkReply(question);
  const admissionFacts = asksAdmissionFacts(question, historyMessages);
  const coachingReason = admissionFacts ? "none" : inferDeterministicCoachingReason(question, historyMessages);
  const isMockExamCounseling = exam === "transfer" && isMockExamCounselingQuestion(question, historyMessages);
  const cutoffHistoryContext = deriveCutoffHistoryContext(historyMessages);
  const messageRoute = directSmalltalk ? "smalltalk" : isMockExamCounseling || admissionFacts || coachingReason !== "none" ? "fact_or_emotion" : await resolveMessageRouteWithAI({
    question,
    historyMessages,
    historyContext: cutoffHistoryContext,
  });
  // 모집인원·전형 등 공식 정보 질문은 이전 점수 상담 맥락이 남아 있어도
  // 커트라인 슬롯 수집으로 되돌아가지 않고 모집요강 검색을 우선한다.
  const cutoffFlow = admissionFacts
    ? createInactiveCutoffFlow()
    : createCutoffFlowState({
        question,
        routeDecision: messageRoute,
        historyContext: cutoffHistoryContext,
      });
  const isGeneralChat = messageRoute === "smalltalk" || isGeneralConversationQuestion(question);
  const intent = isMockExamCounseling ? "mixed" : directSmalltalk ? "emotion" : admissionFacts || cutoffFlow.active ? "fact" : coachingReason !== "none" ? "emotion" : await classifyIntent(question);
  const useCache =
    shouldUseChatCache(body.disableCache) && intent === "fact" && !isGeneralChat && historyMessages.length === 0;
  let cacheStatus: CacheStatus = useCache ? "miss" : "bypass";
  let advicePromise: Promise<CoachingAdviceSnippet[]> | null = null;

  const getAdviceSnippets = async (): Promise<CoachingAdviceSnippet[]> => {
    if (!advicePromise) {
      advicePromise = loadCoachingAdviceSnippets({
        admin,
        exam,
        question,
      }).catch(() => []);
    }
    return advicePromise;
  };

  const recordObservation = async (obs: {
    route: FinalRoute;
    status: "ok" | "error";
    matchedContextCount: number;
    hasEnoughContext: boolean;
    answerLength: number;
    errorMessage?: string;
  }) => {
    try {
      await recordAiChatObservation(admin, {
        traceId,
        exam,
        route: obs.route,
        cacheStatus,
        status: obs.status,
        questionLength: question.length,
        answerLength: obs.answerLength,
        matchedContextCount: obs.matchedContextCount,
        minSimilarity,
        matchCount,
        hasEnoughContext: obs.hasEnoughContext,
        provider,
        chatModel,
        embeddingModel,
        totalMs: Date.now() - startedAt,
        cacheMs,
        embeddingMs,
        retrievalMs,
        generationMs,
        errorMessage: obs.errorMessage,
      });
    } catch {
      // Fail-open: observability insert errors should not block chat answers.
    }
  };

  if (isMockExamCounseling) {
    const retrievalStarted = Date.now();
    let references: MockExamReference[] = [];
    try {
      const { data, error } = await admin.from("ai_knowledge_items")
        .select("id,question,answer")
        .eq("exam_slug", exam)
        .eq("status", "approved")
        .contains("tags", ["mock-exam-average", "reference-only"])
        .order("question")
        .limit(100);
      if (!error) references = (data ?? []) as MockExamReference[];
    } catch {
      // 평균 자료를 읽지 못해도 모의고사 상담 방침으로 답한다.
    }
    retrievalMs = Date.now() - retrievalStarted;
    const generationStarted = Date.now();
    let answer = MOCK_EXAM_COACHING_FALLBACK;
    try {
      answer = (await generateText({
        ...buildMockExamCoachingPrompts(question, references, historyMessages),
        temperature: 0.3,
        maxOutputTokens: 650,
        disableThinking: true,
      })).trim() || MOCK_EXAM_COACHING_FALLBACK;
    } catch {
      // 생성 API 장애 시에도 빈 근거 거절문 대신 기본 상담을 제공한다.
    }
    generationMs = Date.now() - generationStarted;
    stream?.onMeta({ intent, route: "mixed", cache: "bypass", mode: "mock_exam_coaching" });
    if (stream) for (const chunk of splitForStream(answer)) stream.onDelta(chunk);
    const adviceKnowledgeItemIds = references.map((row) => row.id);
    try {
      await admin.from("ai_chat_logs").insert({
        exam_slug: exam, question, answer, route: "mixed",
        top_chunk_ids: [], top_knowledge_item_ids: adviceKnowledgeItemIds,
      });
    } catch {
      // 상담 응답은 로그 저장 실패와 독립적이다.
    }
    await recordObservation({
      route: "mixed", status: "ok", matchedContextCount: references.length,
      hasEnoughContext: references.length > 0, answerLength: answer.length,
    });
    return {
      ok: true, exam, intent, route: "mixed", answer, needsQuestionSubmission: false,
      adviceKnowledgeItemIds, contexts: [], cache: "bypass", traceId,
      metrics: { totalMs: Date.now() - startedAt, cacheMs, embeddingMs, retrievalMs, generationMs },
    };
  }

  if (cutoffFlow.active) {
    const cutoff = cutoffFlow.slots;
    const missing: string[] = [];
    if (!cutoff.year) missing.push("학년도");
    if (!cutoff.university) missing.push("학교명");
    if (!cutoff.major) missing.push("학과명");
    if (!cutoff.score) missing.push("점수");

    if (missing.length > 0) {
      const answer = buildCutoffSlotPrompt(cutoff);

      stream?.onMeta({ intent, route: "fallback", cache: cacheStatus, mode: "cutoff_input" });
      if (stream) {
        for (const chunk of splitForStream(answer)) {
          stream.onDelta(chunk);
        }
      }

      await recordObservation({
        route: "fallback",
        status: "ok",
        matchedContextCount: 0,
        hasEnoughContext: false,
        answerLength: answer.length,
      });

      return {
        ok: true,
        exam,
        intent,
        route: "fallback",
        answer,
        needsQuestionSubmission: false,
        contexts: [],
        cache: cacheStatus,
        traceId,
        metrics: {
          totalMs: Date.now() - startedAt,
          cacheMs,
          embeddingMs,
          retrievalMs,
          generationMs,
        },
      };
    }

    const retrievalPrompt = [
      `${cutoff.year}학년도`,
      cutoff.university,
      cutoff.major,
      `사용자 점수: ${cutoff.score}`,
      "편입 커트라인",
      "최초합",
      "추합",
      "경쟁률",
    ].join(" ");

    const embeddingStarted = Date.now();
    let queryEmbedding: number[] = [];
    try {
      queryEmbedding = await createEmbedding(retrievalPrompt);
    } catch (err) {
      if (!(err instanceof EmbeddingsDisabledError)) throw err;
    }
    embeddingMs = Date.now() - embeddingStarted;

    const retrievalStarted = Date.now();
    const { data: matched, error: matchError } = queryEmbedding.length
      ? await admin.rpc("match_ai_knowledge_chunks", {
          query_embedding: queryEmbedding,
          query_exam: exam,
          match_count: 12,
          min_similarity: 0.45,
        })
      : { data: [] as MatchedChunkRow[], error: null };
    retrievalMs = Date.now() - retrievalStarted;

    if (matchError) {
      await recordObservation({
        route: "fallback",
        status: "error",
        matchedContextCount: 0,
        hasEnoughContext: false,
        answerLength: 0,
        errorMessage: matchError.message,
      });
      throw new ChatHttpError(400, matchError.message);
    }

    const yearToken = String(cutoff.year);
    const uniToken = normalizeToken(cutoff.university);
    const majorToken = normalizeToken(cutoff.major);
    const tokenMatchedRows = ((matched as MatchedChunkRow[] | null) ?? []).filter((row) => {
      const normalizedChunk = normalizeToken(row.chunk_text);
      return normalizedChunk.includes(yearToken) && normalizedChunk.includes(uniToken) && normalizedChunk.includes(majorToken);
    });

    const candidateKnowledgeIds = [...new Set(tokenMatchedRows.map((row) => row.knowledge_item_id))];
    const { data: cutoffKnowledge, error: cutoffKnowledgeError } = candidateKnowledgeIds.length
      ? await admin
          .from("ai_knowledge_items")
          .select("id,tags,question,answer,raw_input")
          .in("id", candidateKnowledgeIds)
          .eq("exam_slug", exam)
          .eq("status", "approved")
      : { data: [] as CutoffEvidenceKnowledgeItem[], error: null };
    if (cutoffKnowledgeError) {
      throw new ChatHttpError(400, cutoffKnowledgeError.message);
    }
    const allowedKnowledgeIds = new Set(
      ((cutoffKnowledge as CutoffEvidenceKnowledgeItem[] | null) ?? [])
        .filter(isCutoffEvidenceKnowledgeItem)
        .map((item) => item.id)
    );
    const matchedRows = tokenMatchedRows.filter((row) => allowedKnowledgeIds.has(row.knowledge_item_id));

    const responseContexts = matchedRows.map((ctx) => ({
      id: ctx.id,
      knowledgeItemId: ctx.knowledge_item_id,
      similarity: Number(ctx.similarity.toFixed(4)),
      preview: ctx.chunk_text.slice(0, 180),
    }));
    const topChunkIds = matchedRows.map((ctx) => ctx.id);
    const topKnowledgeIds = [...new Set(matchedRows.map((ctx) => ctx.knowledge_item_id))];
    const hasEnoughContext = matchedRows.length > 0;

    const route: FinalRoute = hasEnoughContext ? "grounded" : "fallback";
    let answer = "";

    if (!hasEnoughContext) {
      answer = [
        `${cutoff.year}학년도 ${cutoff.university} ${cutoff.major}는 학교가 공개한 공식 커트라인 자료가 현재 확인되지 않아, 합격자·지원자 제보 점수를 바탕으로 추정해야 해.`,
        `그런데 현재 내가 가진 데이터베이스에는 이 학과의 신뢰할 만한 제보 점수 정보가 없어 ${cutoff.score}의 합격 가능성을 판단해줄 수 없어. 미안해.`,
      ].join("\n");
    } else {
      const generationStarted = Date.now();
      answer = await generateText({
        systemPrompt: [
          "너는 편입 커트라인 분석 도우미다.",
          "감성 위로나 동기부여 문장은 금지한다.",
          "반드시 제공된 근거 안에서만 판단한다.",
          "근거가 애매하면 단정하지 말고 보수적으로 안내한다.",
          "문체는 친절한 반말로, 과장 없이 명확하게 쓴다.",
        ].join("\n"),
        userPrompt: [
          `질문: ${question}`,
          `분석 기준: ${cutoff.year}학년도 ${cutoff.university} ${cutoff.major}, 입력 점수 ${cutoff.score}`,
          "",
          "근거:",
          matchedRows
            .slice(0, 6)
            .map((ctx, index) => `근거 ${index + 1} (유사도 ${ctx.similarity.toFixed(3)}): ${ctx.chunk_text}`)
            .join("\n\n"),
          "",
          "출력 규칙:",
          "- 첫 문장에 반드시 학년도/학교/학과를 명시",
          "- 합격권/추합권/불합격권 중 하나로 분류",
          "- 이유 2~3줄 + 다음 액션 1줄",
        ].join("\n"),
        temperature: 0,
        maxOutputTokens: 420,
        disableThinking: true,
      });
      generationMs = Date.now() - generationStarted;
    }

    stream?.onMeta({ intent, route, cache: cacheStatus, mode: "cutoff" });
    if (stream) {
      for (const chunk of splitForStream(answer)) {
        stream.onDelta(chunk);
      }
    }

    try {
      await admin.from("ai_chat_logs").insert({
        exam_slug: exam,
        question,
        answer,
        route,
        top_chunk_ids: topChunkIds,
        top_knowledge_item_ids: topKnowledgeIds,
      });
    } catch {
      // Fail-open: logging errors should not block chat answers.
    }

    await recordObservation({
      route,
      status: "ok",
      matchedContextCount: matchedRows.length,
      hasEnoughContext,
      answerLength: answer.length,
    });

    return {
      ok: true,
      exam,
      intent,
      route,
      answer,
      needsQuestionSubmission: false,
      contexts: responseContexts,
      cache: cacheStatus,
      traceId,
      metrics: {
        totalMs: Date.now() - startedAt,
        cacheMs,
        embeddingMs,
        retrievalMs,
        generationMs,
      },
    };
  }

  // 공부법과 학생 프로필 후속 답변은 모집요강 검색보다 먼저 코칭으로 보낸다.
  // "학사·인문" 같은 프로필 단어 때문에 특정 대학 자료가 끼어드는 것을 막는다.
  const preRetrievalCoaching = await resolveCoachingFallbackWithAI({
    question,
    historyMessages,
    intent,
    hasEnoughContext: false,
    isGeneralChat,
  });

  if (intent === "emotion" || preRetrievalCoaching.shouldFallback) {
    const adviceSnippets = directSmalltalk ? [] : await getAdviceSnippets();
    const adviceKnowledgeItemIds = adviceSnippets.map((item) => item.id);
    stream?.onMeta({
      intent,
      route: "emotion",
      cache: cacheStatus,
      reason: intent === "emotion" ? "emotion" : preRetrievalCoaching.reason,
      adviceCount: adviceSnippets.length,
      adviceKnowledgeItemIds,
    });

    const generationStarted = Date.now();
    let answer = "";
    if (stream) {
      answer = await generateEmotionAnswerStream(question, adviceSnippets, historyMessages, (delta) => {
        if (!delta) return;
        stream.onDelta(delta);
      });
    } else {
      answer = await generateEmotionAnswer(question, adviceSnippets, historyMessages);
    }
    generationMs = Date.now() - generationStarted;

    try {
      await admin.from("ai_chat_logs").insert({
        exam_slug: exam,
        question,
        answer,
        route: "emotion",
        top_chunk_ids: [],
        top_knowledge_item_ids: adviceKnowledgeItemIds,
      });
    } catch {
      // Fail-open: logging errors should not block chat answers.
    }

    await recordObservation({
      route: "emotion",
      status: "ok",
      matchedContextCount: adviceSnippets.length,
      hasEnoughContext: adviceSnippets.length > 0,
      answerLength: answer.length,
    });

    return {
      ok: true,
      exam,
      intent,
      route: "emotion",
      answer,
      needsQuestionSubmission: false,
      adviceKnowledgeItemIds,
      contexts: [],
      cache: cacheStatus,
      traceId,
      metrics: {
        totalMs: Date.now() - startedAt,
        cacheMs,
        embeddingMs,
        retrievalMs,
        generationMs,
      },
    };
  }

  // "수학만 보는 학교 나열"처럼 여러 대학을 교차 집계하는 질문은
  // 벡터 top-k로는 전체 목록성을 보장할 수 없다. 검증 manifest에서 적재한
  // 구조화 전형 규칙을 먼저 조회하고, 테이블이 없는 배포는 기존 RAG로 fail-open한다.
  if (exam === "transfer" && intent === "fact") {
    const structuredStarted = Date.now();
    const catalogAnswer = await tryAnswerTransferCatalogQuestion({ admin, question, historyMessages });
    retrievalMs += Date.now() - structuredStarted;

    if (catalogAnswer) {
      const route: FinalRoute = catalogAnswer.grounded ? "grounded" : "fallback";
      stream?.onMeta({
        intent,
        route,
        cache: cacheStatus,
        mode: "transfer_catalog",
        admissionYear: catalogAnswer.admissionYear,
        coverageCount: catalogAnswer.coverageCount,
        matchedRuleCount: catalogAnswer.matchedRuleCount,
      });
      if (stream) {
        for (const chunk of splitForStream(catalogAnswer.answer)) {
          stream.onDelta(chunk);
        }
      }

      try {
        await admin.from("ai_chat_logs").insert({
          exam_slug: exam,
          question,
          answer: catalogAnswer.answer,
          route,
          top_chunk_ids: [],
          top_knowledge_item_ids: [],
        });
      } catch {
        // Fail-open: logging errors should not block catalog answers.
      }

      await recordObservation({
        route,
        status: "ok",
        matchedContextCount: catalogAnswer.matchedRuleCount,
        hasEnoughContext: catalogAnswer.grounded,
        answerLength: catalogAnswer.answer.length,
      });

      return {
        ok: true,
        exam,
        intent,
        route,
        answer: catalogAnswer.answer,
        needsQuestionSubmission: false,
        contexts: [],
        cache: cacheStatus,
        traceId,
        metrics: {
          totalMs: Date.now() - startedAt,
          cacheMs,
          embeddingMs,
          retrievalMs,
          generationMs,
        },
      };
    }
  }

  const cacheMeta = buildChatCacheKey({
    exam,
    question,
    minSimilarity,
    matchCount,
  });
  let revision = "";

  if (useCache) {
    const cacheStarted = Date.now();
    try {
      revision = await getKnowledgeRevision(admin, exam);
      const cached = await readChatCache(admin, {
        cacheKey: cacheMeta.cacheKey,
        exam,
        revision,
      });
      cacheMs = Date.now() - cacheStarted;

      if (cached) {
        cacheStatus = "hit";

        const cachedContextIds = cached.contexts.map((ctx) => ctx.id);
        const cachedKnowledgeIds = [...new Set(cached.contexts.map((ctx) => ctx.knowledgeItemId))];

        try {
          await admin.from("ai_chat_logs").insert({
            exam_slug: exam,
            question,
            answer: cached.answer,
            route: cached.route,
            top_chunk_ids: cachedContextIds,
            top_knowledge_item_ids: cachedKnowledgeIds,
          });
        } catch {
          // Fail-open: logging errors should not block chat answers.
        }

        await recordObservation({
          route: cached.route,
          status: "ok",
          matchedContextCount: cached.contexts.length,
          hasEnoughContext: cached.contexts.length > 0,
          answerLength: cached.answer.length,
        });

        if (stream) {
          stream.onMeta({ intent, route: cached.route, cache: cacheStatus });
          for (const chunk of splitForStream(cached.answer)) {
            stream.onDelta(chunk);
          }
        }

        return {
          ok: true,
          exam,
          intent,
          route: cached.route,
          answer: cached.answer,
          needsQuestionSubmission: false,
          contexts: cached.contexts,
          cache: cacheStatus,
          traceId,
          metrics: {
            totalMs: Date.now() - startedAt,
            cacheMs,
            embeddingMs,
            retrievalMs,
            generationMs,
          },
        };
      }
    } catch {
      cacheMs = Date.now() - cacheStarted;
      cacheStatus = "error";
    }
  }

  const embeddingStarted = Date.now();
  const subQuestions = await decomposeQuestionForRetrieval(question);
  let queryEmbedding: number[] = [];
  let subQueryEmbeddings: number[][] = [];
  try {
    const vectors = await createEmbeddings([question, ...subQuestions]);
    queryEmbedding = vectors[0] ?? [];
    subQueryEmbeddings = vectors.slice(1);
  } catch (err) {
    if (!(err instanceof EmbeddingsDisabledError)) throw err;
  }
  embeddingMs = Date.now() - embeddingStarted;

  const retrievalStarted = Date.now();
  let matched: MatchedChunkRow[] = [];
  let matchErrorMessage = "";
  if (queryEmbedding.length) {
    // 하위 질문은 주제가 좁혀진 만큼 문턱을 살짝 낮춰 회수율을 확보한다.
    const subMinSimilarity = Math.min(minSimilarity, 0.45);
    const retrievalQueries = [
      { embedding: queryEmbedding, minSimilarity },
      ...subQueryEmbeddings.map((embedding) => ({ embedding, minSimilarity: subMinSimilarity })),
    ];
    const results = await Promise.all(
      retrievalQueries.map((retrievalQuery) =>
        admin.rpc("match_ai_knowledge_chunks", {
          query_embedding: retrievalQuery.embedding,
          query_exam: exam,
          match_count: matchCount,
          min_similarity: retrievalQuery.minSimilarity,
        })
      )
    );
    matchErrorMessage = results[0]?.error?.message ?? "";

    const mergedById = new Map<string, MatchedChunkRow>();
    for (const result of results) {
      for (const row of (result.data as MatchedChunkRow[] | null) ?? []) {
        const existing = mergedById.get(row.id);
        if (!existing || row.similarity > existing.similarity) {
          mergedById.set(row.id, row);
        }
      }
    }
    const ranked = [...mergedById.values()].sort((a, b) => b.similarity - a.similarity);
    // 학교를 말하지 않은 질문에는 특정 대학 청크를 근거로 주입하지 않는다.
    // 여러 학교 목록/비교는 앞선 구조화 카탈로그가 담당하므로 여기서는 누락이 더 안전하다.
    matched = (mentionsKnownUniversity(question)
      ? ranked
      : ranked.filter((row) => !mentionsKnownUniversity(row.chunk_text)))
      .slice(0, matchCount);
  }
  retrievalMs = Date.now() - retrievalStarted;

  if (matchErrorMessage) {
    await recordObservation({
      route: intent === "mixed" ? "mixed" : "fallback",
      status: "error",
      matchedContextCount: 0,
      hasEnoughContext: false,
      answerLength: 0,
      errorMessage: matchErrorMessage,
    });
    throw new ChatHttpError(400, matchErrorMessage);
  }

  const evidenceById = new Map<string, EvidenceInput>();
  if (matched.length) {
    const evidenceStarted = Date.now();
    try {
      const { data, error } = await admin.from("ai_knowledge_items")
        .select("id,tags,question,answer")
        .eq("exam_slug", exam)
        .eq("status", "approved")
        .in("id", [...new Set(matched.map((row) => row.knowledge_item_id))]);
      if (!error) for (const row of data ?? []) evidenceById.set(row.id, row);
    } catch {
      // 분류 메타데이터를 읽지 못한 근거는 미확인 자료로 제한해서 전달한다.
    }
    retrievalMs += Date.now() - evidenceStarted;
  }
  const contexts = matched.map((row) => ({
    id: row.id,
    knowledgeItemId: row.knowledge_item_id,
    chunkText: formatEvidenceContext(evidenceById.get(row.knowledge_item_id) ?? {}, row.chunk_text),
    similarity: row.similarity,
  }));
  const hasEnoughContext = contexts.length > 0;

  const responseContexts = contexts.map((ctx) => ({
    id: ctx.id,
    knowledgeItemId: ctx.knowledgeItemId,
    similarity: Number(ctx.similarity.toFixed(4)),
    preview: ctx.chunkText.slice(0, 180),
  }));
  const topChunkIds = contexts.map((ctx) => ctx.id);
  const topKnowledgeIds = [...new Set(contexts.map((ctx) => ctx.knowledgeItemId))];
  const coachingFallback = await resolveCoachingFallbackWithAI({
    question,
    historyMessages,
    intent,
    hasEnoughContext,
    isGeneralChat,
  });
  const useGeneralCoachingFallback = coachingFallback.shouldFallback;
  const questionWithHistory = buildQuestionWithHistory(question, historyMessages);

  const generationStarted = Date.now();
  let route: FinalRoute = hasEnoughContext ? "grounded" : "fallback";
  let answer = "";
  let adviceSnippets: CoachingAdviceSnippet[] = [];

  if (intent === "mixed") {
    adviceSnippets = await getAdviceSnippets();
    route = "mixed";
    stream?.onMeta({
      intent,
      route,
      cache: cacheStatus,
      adviceCount: adviceSnippets.length,
      adviceKnowledgeItemIds: adviceSnippets.map((item) => item.id),
    });

    let factAnswer = "";
      if (stream) {
        stream.onDelta("정보 답변:\n");
        if (hasEnoughContext) {
          factAnswer = await generateGroundedAnswerStream({
            question: questionWithHistory,
            contexts: contexts.map((ctx) => ({ chunkText: ctx.chunkText, similarity: ctx.similarity })),
            onDelta: (delta) => {
              if (!delta) return;
              stream.onDelta(delta);
            },
        });
      } else {
        factAnswer = FACT_FALLBACK_ANSWER;
        stream.onDelta(factAnswer);
      }

      stream.onDelta("\n\n코칭:\n");
      const emotionAnswer = await generateEmotionAnswerStream(question, adviceSnippets, historyMessages, (delta) => {
        if (!delta) return;
        stream.onDelta(delta);
      });
      answer = composeMixedAnswer(factAnswer, emotionAnswer);
    } else {
      factAnswer = hasEnoughContext
        ? await generateGroundedAnswer({
            question: questionWithHistory,
            contexts: contexts.map((ctx) => ({ chunkText: ctx.chunkText, similarity: ctx.similarity })),
          })
        : FACT_FALLBACK_ANSWER;

      const emotionAnswer = await generateEmotionAnswer(question, adviceSnippets, historyMessages);
      answer = composeMixedAnswer(factAnswer, emotionAnswer);
    }
  } else {
    if (useGeneralCoachingFallback) {
      adviceSnippets = await getAdviceSnippets();
      route = "emotion";
      stream?.onMeta({
        intent,
        route,
        cache: cacheStatus,
        reason: coachingFallback.reason,
        adviceCount: adviceSnippets.length,
        adviceKnowledgeItemIds: adviceSnippets.map((item) => item.id),
      });

      if (stream) {
        answer = await generateEmotionAnswerStream(question, adviceSnippets, historyMessages, (delta) => {
          if (!delta) return;
          stream.onDelta(delta);
        });
      } else {
        answer = await generateEmotionAnswer(question, adviceSnippets, historyMessages);
      }
    } else {
      route = hasEnoughContext ? "grounded" : "fallback";
      stream?.onMeta({ intent, route, cache: cacheStatus });

      if (stream) {
        if (hasEnoughContext) {
          answer = await generateGroundedAnswerStream({
            question: questionWithHistory,
            contexts: contexts.map((ctx) => ({ chunkText: ctx.chunkText, similarity: ctx.similarity })),
            onDelta: (delta) => {
              if (!delta) return;
              stream.onDelta(delta);
            },
          });
        } else {
          answer = FACT_FALLBACK_ANSWER;
          for (const chunk of splitForStream(answer)) {
            stream.onDelta(chunk);
          }
        }
      } else {
        answer = hasEnoughContext
          ? await generateGroundedAnswer({
              question: questionWithHistory,
              contexts: contexts.map((ctx) => ({ chunkText: ctx.chunkText, similarity: ctx.similarity })),
            })
          : FACT_FALLBACK_ANSWER;
      }
    }
  }

  generationMs = Date.now() - generationStarted;
  const adviceKnowledgeItemIds = adviceSnippets.map((item) => item.id);
  const loggedKnowledgeItemIds = [...new Set([...topKnowledgeIds, ...adviceKnowledgeItemIds])];

  try {
    await admin.from("ai_chat_logs").insert({
      exam_slug: exam,
      question,
      answer,
      route,
      top_chunk_ids: topChunkIds,
      top_knowledge_item_ids: loggedKnowledgeItemIds,
    });
  } catch {
    // Fail-open: logging errors should not block chat answers.
  }

  if (useCache && (route === "grounded" || route === "fallback")) {
    try {
      const resolvedRevision = revision || (await getKnowledgeRevision(admin, exam));
      await upsertChatCache(admin, {
        cacheKey: cacheMeta.cacheKey,
        exam,
        questionNorm: cacheMeta.questionNorm,
        revision: resolvedRevision,
        payload: {
          route,
          answer,
          contexts: responseContexts,
        },
      });
      if (Math.random() < 0.03) {
        await cleanupExpiredChatCache(admin);
      }
    } catch {
      // Fail-open: cache write/cleanup errors should not block chat answers.
    }
  }

  await recordObservation({
    route,
    status: "ok",
    matchedContextCount: contexts.length + adviceSnippets.length,
    hasEnoughContext: hasEnoughContext || adviceSnippets.length > 0,
    answerLength: answer.length,
  });

  return {
    ok: true,
    exam,
    intent,
    route,
    answer,
    needsQuestionSubmission: false,
    adviceKnowledgeItemIds,
    contexts: responseContexts,
    cache: cacheStatus,
    traceId,
    metrics: {
      totalMs: Date.now() - startedAt,
      cacheMs,
      embeddingMs,
      retrievalMs,
      generationMs,
    },
  };
}

export async function POST(request: Request) {
  const traceId = request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  const accessToken = getBearerToken(request);
  if (!accessToken || !(await getUserByAccessToken(accessToken))) {
    return NextResponse.json(
      {
        error: "AI 상담은 로그인 후 이용할 수 있습니다.",
        traceId,
      },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const exam = resolveExam(normalizeText(body.exam, 20) || "transfer");
  const examError = validateExam(exam);
  if (examError) return examError;

  const question = normalizeText(body.question, 1000);
  if (!question) {
    return NextResponse.json({ error: "질문(question)은 필수입니다.", traceId }, { status: 400 });
  }

  const startedAt = Date.now();
  const streamRequested = isStreamRequested(body, request);

  if (streamRequested) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(toSseEvent("ready", { traceId }));

        void (async () => {
          try {
            const payload = await runChatWorkflow({
              body,
              exam: exam as Exam,
              question,
              traceId,
              startedAt,
              stream: {
                onMeta: (data) => controller.enqueue(toSseEvent("meta", data)),
                onDelta: (delta) => controller.enqueue(toSseEvent("delta", { text: delta })),
              },
            });
            controller.enqueue(toSseEvent("done", payload));
          } catch (error) {
            const message = error instanceof Error ? error.message : "AI 응답 생성에 실패했습니다.";
            const status = error instanceof ChatHttpError ? error.status : 400;
            controller.enqueue(toSseEvent("error", { error: message, status, traceId }));
          } finally {
            controller.close();
          }
        })();
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  try {
    const payload = await runChatWorkflow({
      body,
      exam: exam as Exam,
      question,
      traceId,
      startedAt,
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof ChatHttpError) {
      return NextResponse.json({ error: error.message, traceId }, { status: error.status });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "AI 응답 생성에 실패했습니다.",
        traceId,
      },
      { status: 400 }
    );
  }
}
