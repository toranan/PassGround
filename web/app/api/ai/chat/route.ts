import { NextResponse } from "next/server";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { createEmbedding, generateGroundedAnswer } from "@/lib/aiRag";

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

  const question = normalizeText(body.question, 1000);
  if (!question) {
    return NextResponse.json({ error: "질문(question)은 필수입니다." }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdmin();
    const queryEmbedding = await createEmbedding(question);
    const minSimilarity =
      typeof body.minSimilarity === "number" ? Math.max(0, Math.min(1, body.minSimilarity)) : 0.7;
    const matchCount =
      typeof body.matchCount === "number" ? Math.max(1, Math.min(12, Math.floor(body.matchCount))) : 6;

    const { data: matched, error: matchError } = await admin.rpc("match_ai_knowledge_chunks", {
      query_embedding: queryEmbedding,
      query_exam: exam,
      match_count: matchCount,
      min_similarity: minSimilarity,
    });

    if (matchError) {
      return NextResponse.json({ error: matchError.message }, { status: 400 });
    }

    const contexts = ((matched as MatchedChunkRow[] | null) ?? []).map((row) => ({
      id: row.id,
      knowledgeItemId: row.knowledge_item_id,
      chunkText: row.chunk_text,
      similarity: row.similarity,
    }));

    const hasEnoughContext = contexts.length > 0;
    const answer = hasEnoughContext
      ? await generateGroundedAnswer({
          question,
          contexts: contexts.map((ctx) => ({ chunkText: ctx.chunkText, similarity: ctx.similarity })),
        })
      : "현재 저장된 지식에서 직접 근거를 찾기 어려워요. 지금은 일반적인 학습/멘탈 관점에서 보면, 너무 결과 한 번에 흔들리지 말고 주간 단위로 보완 계획을 잡는 게 좋아요.";

    const topChunkIds = contexts.map((ctx) => ctx.id);
    const topKnowledgeIds = [...new Set(contexts.map((ctx) => ctx.knowledgeItemId))];

    await admin.from("ai_chat_logs").insert({
      exam_slug: exam,
      question,
      answer,
      route: hasEnoughContext ? "grounded" : "fallback",
      top_chunk_ids: topChunkIds,
      top_knowledge_item_ids: topKnowledgeIds,
    });

    return NextResponse.json({
      ok: true,
      exam,
      route: hasEnoughContext ? "grounded" : "fallback",
      answer,
      contexts: contexts.map((ctx) => ({
        id: ctx.id,
        knowledgeItemId: ctx.knowledgeItemId,
        similarity: Number(ctx.similarity.toFixed(4)),
        preview: ctx.chunkText.slice(0, 180),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI 응답 생성에 실패했습니다." },
      { status: 400 }
    );
  }
}
