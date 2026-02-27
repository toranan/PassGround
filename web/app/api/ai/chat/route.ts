import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createEmbedding,
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

type CoachingAdviceRow = {
  id: string;
  question: string;
  answer: string;
  tags: string[] | null;
  approved_at: string | null;
  updated_at: string;
};

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

type ChatSuccessPayload = {
  ok: true;
  exam: Exam;
  intent: IntentRoute;
  route: FinalRoute;
  answer: string;
  needsQuestionSubmission: boolean;
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
  "아직 내가 가지고 있지 않은 정보인 것 같아.",
  "섣부른 조언보다는 정확한 확인이 먼저라서,",
  "'질문하기' 버튼을 눌러주면 빠른 시일 내에 답변 준비해둘게.",
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
  if (factHits === 0 && text.length <= 24 && !text.includes("?")) return true;
  return false;
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

function tokenizeQuestion(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  return [...new Set(tokens)].slice(0, 24);
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

function scoreAdviceRow(params: {
  row: CoachingAdviceRow;
  queryTags: string[];
  queryTokens: string[];
}): number {
  const itemTags = Array.isArray(params.row.tags) ? params.row.tags : [];
  const normalizedItemTags = itemTags.map((tag) => tag.trim()).filter(Boolean);
  const tagOverlap = params.queryTags.reduce(
    (count, tag) => count + (normalizedItemTags.includes(tag) ? 1 : 0),
    0
  );

  const haystack = [params.row.question, params.row.answer, normalizedItemTags.join(" ")].join(" ").toLowerCase();
  const tokenHits = params.queryTokens.reduce((count, token) => count + (haystack.includes(token) ? 1 : 0), 0);

  return tagOverlap * 3 + tokenHits;
}

async function loadCoachingAdviceSnippets(params: {
  admin: SupabaseClient;
  exam: Exam;
  question: string;
  limit?: number;
}): Promise<CoachingAdviceSnippet[]> {
  const limit = params.limit ?? 3;
  const queryTags = inferKnowledgeTags(params.question, 4);
  const queryTokens = tokenizeQuestion(params.question);

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

  const scored = rows
    .map((row) => ({
      row,
      score: scoreAdviceRow({
        row,
        queryTags,
        queryTokens,
      }),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const left = Date.parse(a.row.approved_at || a.row.updated_at || "");
      const right = Date.parse(b.row.approved_at || b.row.updated_at || "");
      return right - left;
    });

  const meaningful = scored.filter((item) => item.score > 0);
  const selected = (meaningful.length ? meaningful : scored.slice(0, 1)).slice(0, Math.max(1, limit));

  return selected.map(({ row, score }) => ({
    id: row.id,
    question: compactText(row.question || "", 140),
    answer: compactText(row.answer || "", 520),
    tags: Array.isArray(row.tags) ? row.tags.filter(Boolean).slice(0, 4) : [],
    score,
  }));
}

function buildAdviceReferenceText(adviceSnippets: CoachingAdviceSnippet[]): string {
  if (!adviceSnippets.length) return "없음";
  return adviceSnippets
    .map((item, index) => {
      const tags = item.tags.length ? item.tags.join(", ") : "일반코칭";
      return `${index + 1}. [${tags}] ${item.answer}`;
    })
    .join("\n");
}

async function classifyIntent(question: string): Promise<IntentRoute> {
  const heuristic = classifyIntentHeuristics(question);
  if (heuristic) return heuristic;

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
    });
    return normalizeIntentLabel(classifier) ?? "fact";
  } catch {
    return "fact";
  }
}

function buildEmotionPrompts(question: string, adviceSnippets: CoachingAdviceSnippet[]) {
  const adviceReference = buildAdviceReferenceText(adviceSnippets);

  return {
    systemPrompt: [
      "너는 편입 수험생 전담 코치 '합곰'이다.",
      "말투는 친구처럼 친근하고 다정하게 유지하고, 반드시 반말만 사용한다. 존댓말은 금지한다.",
      "답변은 4~6문장으로 짧게 유지한다.",
      "사용자 입력이 인사/잡담(예: 안녕, 하이, 반가워) 성격이면 첫 문장을 '안녕! 나는 너의 편입 고민을 들어줄 합곰이야.'로 시작한다.",
      "제공된 조언 레퍼런스가 있으면 그 철학을 우선 반영하되, 학생 문맥에 맞게 자연스럽게 재작성한다.",
      "질문이 불명확하면 짧게 한 번 되물어 맥락을 확인한다.",
      "과장이나 근거 없는 단정은 금지한다.",
    ].join("\n"),
    userPrompt: [`학생 말: ${question}`, "", `조언 레퍼런스:\n${adviceReference}`].join("\n"),
  };
}

async function generateEmotionAnswer(
  question: string,
  adviceSnippets: CoachingAdviceSnippet[] = []
): Promise<string> {
  const prompts = buildEmotionPrompts(question, adviceSnippets);
  return generateText({
    ...prompts,
    temperature: 0.5,
  });
}

async function generateEmotionAnswerStream(
  question: string,
  adviceSnippets: CoachingAdviceSnippet[] = [],
  onDelta: (delta: string) => void
): Promise<string> {
  const prompts = buildEmotionPrompts(question, adviceSnippets);
  return streamText({
    ...prompts,
    temperature: 0.5,
    onDelta,
  });
}

function composeMixedAnswer(factAnswer: string, emotionAnswer: string): string {
  return [`정보 답변:\n${factAnswer}`, `코칭:\n${emotionAnswer}`].join("\n\n");
}

function splitForStream(text: string, chunkSize = 80): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
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
    typeof body.minSimilarity === "number" ? Math.max(0, Math.min(1, body.minSimilarity)) : 0.7;
  const matchCount = typeof body.matchCount === "number" ? Math.max(1, Math.min(12, Math.floor(body.matchCount))) : 6;
  const intent = await classifyIntent(question);
  const isGeneralChat = isGeneralConversationQuestion(question);
  const useCache = shouldUseChatCache(body.disableCache) && intent === "fact" && !isGeneralChat;
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

  if (intent === "emotion") {
    const adviceSnippets = await getAdviceSnippets();
    stream?.onMeta({ intent, route: "emotion", cache: cacheStatus, adviceCount: adviceSnippets.length });

    const generationStarted = Date.now();
    let answer = "";
    if (stream) {
      answer = await generateEmotionAnswerStream(question, adviceSnippets, (delta) => {
        if (!delta) return;
        stream.onDelta(delta);
      });
    } else {
      answer = await generateEmotionAnswer(question, adviceSnippets);
    }
    generationMs = Date.now() - generationStarted;

    try {
      await admin.from("ai_chat_logs").insert({
        exam_slug: exam,
        question,
        answer,
        route: "emotion",
        top_chunk_ids: [],
        top_knowledge_item_ids: [],
      });
    } catch {
      // Fail-open: logging errors should not block chat answers.
    }

    await recordObservation({
      route: "emotion",
      status: "ok",
      matchedContextCount: 0,
      hasEnoughContext: false,
      answerLength: answer.length,
    });

    return {
      ok: true,
      exam,
      intent,
      route: "emotion",
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
          needsQuestionSubmission: cached.route === "fallback",
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
  const queryEmbedding = await createEmbedding(question);
  embeddingMs = Date.now() - embeddingStarted;

  const retrievalStarted = Date.now();
  const { data: matched, error: matchError } = await admin.rpc("match_ai_knowledge_chunks", {
    query_embedding: queryEmbedding,
    query_exam: exam,
    match_count: matchCount,
    min_similarity: minSimilarity,
  });
  retrievalMs = Date.now() - retrievalStarted;

  if (matchError) {
    await recordObservation({
      route: intent === "mixed" ? "mixed" : "fallback",
      status: "error",
      matchedContextCount: 0,
      hasEnoughContext: false,
      answerLength: 0,
      errorMessage: matchError.message,
    });
    throw new ChatHttpError(400, matchError.message);
  }

  const contexts = ((matched as MatchedChunkRow[] | null) ?? []).map((row) => ({
    id: row.id,
    knowledgeItemId: row.knowledge_item_id,
    chunkText: row.chunk_text,
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
  const useGeneralCoachingFallback = intent === "fact" && !hasEnoughContext && isGeneralChat;

  const generationStarted = Date.now();
  let route: FinalRoute = hasEnoughContext ? "grounded" : "fallback";
  let answer = "";
  let adviceSnippets: CoachingAdviceSnippet[] = [];

  if (intent === "mixed") {
    adviceSnippets = await getAdviceSnippets();
    route = "mixed";
    stream?.onMeta({ intent, route, cache: cacheStatus, adviceCount: adviceSnippets.length });

    let factAnswer = "";
    if (stream) {
      stream.onDelta("정보 답변:\n");
      if (hasEnoughContext) {
        factAnswer = await generateGroundedAnswerStream({
          question,
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
      const emotionAnswer = await generateEmotionAnswerStream(question, adviceSnippets, (delta) => {
        if (!delta) return;
        stream.onDelta(delta);
      });
      answer = composeMixedAnswer(factAnswer, emotionAnswer);
    } else {
      factAnswer = hasEnoughContext
        ? await generateGroundedAnswer({
            question,
            contexts: contexts.map((ctx) => ({ chunkText: ctx.chunkText, similarity: ctx.similarity })),
          })
        : FACT_FALLBACK_ANSWER;

      const emotionAnswer = await generateEmotionAnswer(question, adviceSnippets);
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
        reason: "general_chat_fallback",
        adviceCount: adviceSnippets.length,
      });

      if (stream) {
        answer = await generateEmotionAnswerStream(question, adviceSnippets, (delta) => {
          if (!delta) return;
          stream.onDelta(delta);
        });
      } else {
        answer = await generateEmotionAnswer(question, adviceSnippets);
      }
    } else {
      route = hasEnoughContext ? "grounded" : "fallback";
      stream?.onMeta({ intent, route, cache: cacheStatus });

      if (stream) {
        if (hasEnoughContext) {
          answer = await generateGroundedAnswerStream({
            question,
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
              question,
              contexts: contexts.map((ctx) => ({ chunkText: ctx.chunkText, similarity: ctx.similarity })),
            })
          : FACT_FALLBACK_ANSWER;
      }
    }
  }

  generationMs = Date.now() - generationStarted;

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
    matchedContextCount: contexts.length,
    hasEnoughContext,
    answerLength: answer.length,
  });

  return {
    ok: true,
    exam,
    intent,
    route,
    answer,
    needsQuestionSubmission: route === "fallback",
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
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const exam = resolveExam(normalizeText(body.exam, 20) || "transfer");
  const examError = validateExam(exam);
  if (examError) return examError;

  const traceId = request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
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
