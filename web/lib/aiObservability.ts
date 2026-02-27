import type { SupabaseClient } from "@supabase/supabase-js";

type Exam = "transfer" | "cpa";

type ChatObservation = {
  traceId: string;
  exam: Exam;
  route: "grounded" | "fallback" | "emotion" | "mixed";
  cacheStatus: "hit" | "miss" | "bypass" | "error";
  status: "ok" | "error";
  questionLength: number;
  answerLength: number;
  matchedContextCount: number;
  minSimilarity: number;
  matchCount: number;
  hasEnoughContext: boolean;
  provider: string;
  chatModel: string;
  embeddingModel: string;
  totalMs: number;
  cacheMs: number;
  embeddingMs: number;
  retrievalMs: number;
  generationMs: number;
  errorMessage?: string | null;
};

export async function recordAiChatObservation(admin: SupabaseClient, observation: ChatObservation) {
  const { error } = await admin.from("ai_chat_observations").insert({
    trace_id: observation.traceId,
    exam_slug: observation.exam,
    route: observation.route,
    cache_status: observation.cacheStatus,
    status: observation.status,
    question_length: observation.questionLength,
    answer_length: observation.answerLength,
    matched_context_count: observation.matchedContextCount,
    min_similarity: observation.minSimilarity,
    match_count: observation.matchCount,
    has_enough_context: observation.hasEnoughContext,
    provider: observation.provider,
    chat_model: observation.chatModel,
    embedding_model: observation.embeddingModel,
    total_ms: observation.totalMs,
    cache_ms: observation.cacheMs,
    embedding_ms: observation.embeddingMs,
    retrieval_ms: observation.retrievalMs,
    generation_ms: observation.generationMs,
    error_message: observation.errorMessage ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
}
