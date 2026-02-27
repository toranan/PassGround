import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type Exam = "transfer" | "cpa";

export type CachedContext = {
  id: string;
  knowledgeItemId: string;
  similarity: number;
  preview: string;
};

export type CachedPayload = {
  route: "grounded" | "fallback";
  answer: string;
  contexts: CachedContext[];
};

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days
const CACHE_VERSION = "v1";

function normalizeQuestionForCache(question: string): string {
  return question.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 600);
}

export function shouldUseChatCache(disableCache: unknown): boolean {
  return disableCache !== true;
}

export function buildChatCacheKey(params: {
  exam: Exam;
  question: string;
  minSimilarity: number;
  matchCount: number;
}): { cacheKey: string; questionNorm: string } {
  const questionNorm = normalizeQuestionForCache(params.question);
  const raw = [
    CACHE_VERSION,
    params.exam,
    questionNorm,
    String(params.minSimilarity),
    String(params.matchCount),
  ].join("|");
  const cacheKey = createHash("sha256").update(raw).digest("hex");
  return { cacheKey, questionNorm };
}

export async function getKnowledgeRevision(admin: SupabaseClient, exam: Exam): Promise<string> {
  const [countResult, maxUpdatedResult] = await Promise.all([
    admin
      .from("ai_knowledge_items")
      .select("*", { count: "exact", head: true })
      .eq("exam_slug", exam)
      .eq("status", "approved"),
    admin
      .from("ai_knowledge_items")
      .select("updated_at")
      .eq("exam_slug", exam)
      .eq("status", "approved")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (countResult.error) {
    throw new Error(countResult.error.message);
  }
  if (maxUpdatedResult.error) {
    throw new Error(maxUpdatedResult.error.message);
  }

  const count = countResult.count ?? 0;
  const latestUpdatedAt = maxUpdatedResult.data?.updated_at ?? "none";
  return `${count}:${latestUpdatedAt}`;
}

export async function readChatCache(
  admin: SupabaseClient,
  params: { cacheKey: string; exam: Exam; revision: string }
): Promise<CachedPayload | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("ai_chat_cache")
    .select("route,answer,contexts")
    .eq("cache_key", params.cacheKey)
    .eq("exam_slug", params.exam)
    .eq("revision", params.revision)
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;

  const route = data.route === "grounded" ? "grounded" : "fallback";
  const contexts = Array.isArray(data.contexts) ? (data.contexts as CachedContext[]) : [];
  return {
    route,
    answer: String(data.answer ?? ""),
    contexts,
  };
}

export async function upsertChatCache(
  admin: SupabaseClient,
  params: {
    cacheKey: string;
    exam: Exam;
    questionNorm: string;
    revision: string;
    payload: CachedPayload;
  }
): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_SECONDS * 1000).toISOString();
  const { error } = await admin.from("ai_chat_cache").upsert(
    {
      cache_key: params.cacheKey,
      exam_slug: params.exam,
      question_norm: params.questionNorm,
      revision: params.revision,
      route: params.payload.route,
      answer: params.payload.answer,
      contexts: params.payload.contexts,
      expires_at: expiresAt,
    },
    { onConflict: "cache_key" }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function cleanupExpiredChatCache(admin: SupabaseClient): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await admin.from("ai_chat_cache").delete().lt("expires_at", nowIso);
  if (error) {
    throw new Error(error.message);
  }
}
