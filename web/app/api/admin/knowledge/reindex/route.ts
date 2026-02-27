import { NextResponse } from "next/server";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getBearerToken, getUserByAccessToken, isAdminUser } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { buildKnowledgeChunks, createEmbeddings, estimateChunkTokens } from "@/lib/aiRag";

type Exam = "transfer" | "cpa";

type ApprovedKnowledgeRow = {
  id: string;
  question: string;
  answer: string;
  raw_input: string;
  tags: string[] | null;
};

function resolveExam(value: string): Exam | null {
  if (value === "transfer" || value === "cpa") return value;
  return null;
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
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

async function ensureAdmin(request: Request) {
  const token = getBearerToken(request);
  const user = await getUserByAccessToken(token);
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }),
    };
  }

  const allowed = await isAdminUser(user.id, user.email);
  if (!allowed) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

export async function POST(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const exam = resolveExam(normalizeText(body.exam, 20) || "transfer");
  const examError = validateExam(exam);
  if (examError) return examError;

  const admin = getSupabaseAdmin();
  const { data: rows, error: readError } = await admin
    .from("ai_knowledge_items")
    .select("id,question,answer,raw_input,tags")
    .eq("exam_slug", exam)
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .order("updated_at", { ascending: false });

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 400 });
  }

  const approvedItems = (rows as ApprovedKnowledgeRow[] | null) ?? [];

  const { error: clearError } = await admin.from("ai_knowledge_chunks").delete().eq("exam_slug", exam);
  if (clearError) {
    return NextResponse.json({ error: clearError.message }, { status: 400 });
  }

  if (!approvedItems.length) {
    return NextResponse.json({
      ok: true,
      exam,
      approvedCount: 0,
      chunkCount: 0,
      message: "승인된 지식이 없어 기존 인덱스를 비웠습니다.",
    });
  }

  try {
    const chunks = buildKnowledgeChunks(approvedItems);
    if (!chunks.length) {
      return NextResponse.json({
        ok: true,
        exam,
        approvedCount: approvedItems.length,
        chunkCount: 0,
        message: "청크 생성 결과가 비어 있습니다.",
      });
    }

    const chunkTexts = chunks.map((chunk) => chunk.chunkText);
    const vectors = await createEmbeddings(chunkTexts);
    const insertRows = chunks.map((chunk, index) => ({
      knowledge_item_id: chunk.knowledgeItemId,
      exam_slug: exam,
      chunk_index: chunk.chunkIndex,
      chunk_text: chunk.chunkText,
      embedding: vectors[index],
      token_estimate: estimateChunkTokens(chunk.chunkText),
    }));

    const { error: insertError } = await admin.from("ai_knowledge_chunks").insert(insertRows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      exam,
      approvedCount: approvedItems.length,
      chunkCount: insertRows.length,
      message: "RAG 인덱스 재생성이 완료되었습니다.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "RAG 재색인에 실패했습니다." },
      { status: 400 }
    );
  }
}
