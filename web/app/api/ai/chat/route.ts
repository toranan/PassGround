import { NextResponse } from "next/server";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createEmbedding,
  generateGroundedAnswer,
  generateText,
  getAiProviderName,
  getChatModelName,
  getEmbeddingModelName,
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

type Exam = "transfer" | "cpa";
type IntentRoute = "fact" | "emotion" | "mixed";
type FinalRoute = "grounded" | "fallback" | "emotion" | "mixed";

type MatchedChunkRow = {
  id: string;
  knowledge_item_id: string;
  chunk_text: string;
  similarity: number;
};

const FACT_FALLBACK_ANSWER =
  "현재 저장된 지식에서 직접 근거를 찾기 어려워요. 지금은 일반적인 학습/멘탈 관점에서 보면, 너무 결과 한 번에 흔들리지 말고 주간 단위로 보완 계획을 잡는 게 좋아요.";

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

async function generateEmotionAnswer(question: string): Promise<string> {
  return generateText({
    systemPrompt: [
      "너는 편입 수험생 전담 코치다.",
      "말투는 따뜻하지만 단호하게 유지하고, 과장이나 근거 없는 단정은 금지한다.",
      "답변은 4~6문장으로 짧게, 마지막에는 오늘 바로 할 수 있는 1~2개 행동을 제시한다.",
    ].join("\n"),
    userPrompt: `학생 말: ${question}`,
    temperature: 0.5,
  });
}

function composeMixedAnswer(factAnswer: string, emotionAnswer: string): string {
  return [`정보 답변:\n${factAnswer}`, `코칭:\n${emotionAnswer}`].join("\n\n");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const exam = resolveExam(normalizeText(body.exam, 20) || "transfer");
  const examError = validateExam(exam);
  if (examError) return examError;
  const resolvedExam = exam as Exam;

  const traceId = request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  const startedAt = Date.now();

  const question = normalizeText(body.question, 1000);
  if (!question) {
    return NextResponse.json({ error: "질문(question)은 필수입니다.", traceId }, { status: 400 });
  }

  const provider = getAiProviderName();
  const chatModel = getChatModelName();
  const embeddingModel = getEmbeddingModelName();

  let cacheMs = 0;
  let embeddingMs = 0;
  let retrievalMs = 0;
  let generationMs = 0;

  try {
    const admin = getSupabaseAdmin();
    const minSimilarity =
      typeof body.minSimilarity === "number" ? Math.max(0, Math.min(1, body.minSimilarity)) : 0.7;
    const matchCount =
      typeof body.matchCount === "number" ? Math.max(1, Math.min(12, Math.floor(body.matchCount))) : 6;
    const intent = await classifyIntent(question);
    const useCache = shouldUseChatCache(body.disableCache) && intent === "fact";
    let cacheStatus: "hit" | "miss" | "bypass" | "error" = useCache ? "miss" : "bypass";

    const recordObservation = async (params: {
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
          exam: resolvedExam,
          route: params.route,
          cacheStatus,
          status: params.status,
          questionLength: question.length,
          answerLength: params.answerLength,
          matchedContextCount: params.matchedContextCount,
          minSimilarity,
          matchCount,
          hasEnoughContext: params.hasEnoughContext,
          provider,
          chatModel,
          embeddingModel,
          totalMs: Date.now() - startedAt,
          cacheMs,
          embeddingMs,
          retrievalMs,
          generationMs,
          errorMessage: params.errorMessage,
        });
      } catch {
        // Fail-open: observability insert errors should not block chat answers.
      }
    };

    if (intent === "emotion") {
      const generationStarted = Date.now();
      const answer = await generateEmotionAnswer(question);
      generationMs = Date.now() - generationStarted;

      try {
        await admin.from("ai_chat_logs").insert({
          exam_slug: resolvedExam,
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

      const totalMs = Date.now() - startedAt;
      return NextResponse.json({
        ok: true,
        exam: resolvedExam,
        intent,
        route: "emotion",
        answer,
        contexts: [],
        cache: cacheStatus,
        traceId,
        metrics: {
          totalMs,
          cacheMs,
          embeddingMs,
          retrievalMs,
          generationMs,
        },
      });
    }

    const cacheMeta = buildChatCacheKey({
      exam: resolvedExam,
      question,
      minSimilarity,
      matchCount,
    });
    let revision = "";

    if (useCache) {
      const cacheStarted = Date.now();
      try {
        revision = await getKnowledgeRevision(admin, resolvedExam);
        const cached = await readChatCache(admin, {
          cacheKey: cacheMeta.cacheKey,
          exam: resolvedExam,
          revision,
        });
        cacheMs = Date.now() - cacheStarted;

        if (cached) {
          cacheStatus = "hit";
          const cachedContextIds = cached.contexts.map((ctx) => ctx.id);
          const cachedKnowledgeIds = [...new Set(cached.contexts.map((ctx) => ctx.knowledgeItemId))];

          try {
            await admin.from("ai_chat_logs").insert({
              exam_slug: resolvedExam,
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

          const totalMs = Date.now() - startedAt;
          return NextResponse.json({
            ok: true,
            exam: resolvedExam,
            intent,
            route: cached.route,
            answer: cached.answer,
            contexts: cached.contexts,
            cache: cacheStatus,
            traceId,
            metrics: {
              totalMs,
              cacheMs,
              embeddingMs,
              retrievalMs,
              generationMs,
            },
          });
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
      query_exam: resolvedExam,
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
      return NextResponse.json({ error: matchError.message, traceId }, { status: 400 });
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

    const generationStarted = Date.now();
    const factAnswer = hasEnoughContext
      ? await generateGroundedAnswer({
          question,
          contexts: contexts.map((ctx) => ({ chunkText: ctx.chunkText, similarity: ctx.similarity })),
        })
      : FACT_FALLBACK_ANSWER;

    let route: FinalRoute = hasEnoughContext ? "grounded" : "fallback";
    let answer = factAnswer;

    if (intent === "mixed") {
      const emotionAnswer = await generateEmotionAnswer(question);
      answer = composeMixedAnswer(factAnswer, emotionAnswer);
      route = "mixed";
    }
    generationMs = Date.now() - generationStarted;

    try {
      await admin.from("ai_chat_logs").insert({
        exam_slug: resolvedExam,
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
        const resolvedRevision = revision || (await getKnowledgeRevision(admin, resolvedExam));
        await upsertChatCache(admin, {
          cacheKey: cacheMeta.cacheKey,
          exam: resolvedExam,
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

    const totalMs = Date.now() - startedAt;
    return NextResponse.json({
      ok: true,
      exam: resolvedExam,
      intent,
      route,
      answer,
      contexts: responseContexts,
      cache: cacheStatus,
      traceId,
      metrics: {
        totalMs,
        cacheMs,
        embeddingMs,
        retrievalMs,
        generationMs,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "AI 응답 생성에 실패했습니다.",
        traceId,
      },
      { status: 400 }
    );
  }
}
