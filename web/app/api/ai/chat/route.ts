import { NextResponse } from "next/server";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createEmbedding,
  generateGroundedAnswer,
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

type MatchedChunkRow = {
  id: string;
  knowledge_item_id: string;
  chunk_text: string;
  similarity: number;
};

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
    const useCache = shouldUseChatCache(body.disableCache);
    let cacheStatus: "hit" | "miss" | "bypass" | "error" = useCache ? "miss" : "bypass";

    const recordObservation = async (params: {
      route: "grounded" | "fallback";
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
        route: "fallback",
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
    const generationStarted = Date.now();
    const answer = hasEnoughContext
      ? await generateGroundedAnswer({
          question,
          contexts: contexts.map((ctx) => ({ chunkText: ctx.chunkText, similarity: ctx.similarity })),
        })
      : "현재 저장된 지식에서 직접 근거를 찾기 어려워요. 지금은 일반적인 학습/멘탈 관점에서 보면, 너무 결과 한 번에 흔들리지 말고 주간 단위로 보완 계획을 잡는 게 좋아요.";
    generationMs = Date.now() - generationStarted;

    const topChunkIds = contexts.map((ctx) => ctx.id);
    const topKnowledgeIds = [...new Set(contexts.map((ctx) => ctx.knowledgeItemId))];
    const responseContexts = contexts.map((ctx) => ({
      id: ctx.id,
      knowledgeItemId: ctx.knowledgeItemId,
      similarity: Number(ctx.similarity.toFixed(4)),
      preview: ctx.chunkText.slice(0, 180),
    }));

    try {
      await admin.from("ai_chat_logs").insert({
        exam_slug: resolvedExam,
        question,
        answer,
        route: hasEnoughContext ? "grounded" : "fallback",
        top_chunk_ids: topChunkIds,
        top_knowledge_item_ids: topKnowledgeIds,
      });
    } catch {
      // Fail-open: logging errors should not block chat answers.
    }

    if (useCache) {
      try {
        const resolvedRevision = revision || (await getKnowledgeRevision(admin, resolvedExam));
        await upsertChatCache(admin, {
          cacheKey: cacheMeta.cacheKey,
          exam: resolvedExam,
          questionNorm: cacheMeta.questionNorm,
          revision: resolvedRevision,
          payload: {
            route: hasEnoughContext ? "grounded" : "fallback",
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
      route: hasEnoughContext ? "grounded" : "fallback",
      status: "ok",
      matchedContextCount: contexts.length,
      hasEnoughContext,
      answerLength: answer.length,
    });

    const totalMs = Date.now() - startedAt;
    return NextResponse.json({
      ok: true,
      exam: resolvedExam,
      route: hasEnoughContext ? "grounded" : "fallback",
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
