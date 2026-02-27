import { NextResponse } from "next/server";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getBearerToken, getUserByAccessToken } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Exam = "transfer" | "cpa";

function resolveExam(value: string): Exam | null {
  if (value === "transfer" || value === "cpa") return value;
  return null;
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function normalizeQuestion(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500);
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
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const exam = resolveExam(normalizeText(body.exam, 20) || "transfer");
  const examError = validateExam(exam);
  if (examError) return examError;

  const question = normalizeText(body.question, 1000);
  if (!question) {
    return NextResponse.json({ error: "질문(question)은 필수입니다." }, { status: 400 });
  }

  const accessToken = getBearerToken(request);
  const user = await getUserByAccessToken(accessToken);
  if (!user?.id) {
    return NextResponse.json({ error: "질문 접수는 로그인 후 이용할 수 있습니다." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const traceId = normalizeText(body.traceId, 120);
  const meta = {
    source: "ask_button",
    normalizedQuestion: normalizeQuestion(question),
    userId: user.id,
    userEmail: user.email || "",
    traceId: traceId || null,
  };

  const { error } = await admin.from("ai_chat_logs").insert({
    exam_slug: exam,
    question,
    answer: JSON.stringify(meta),
    route: "ask_button",
    top_chunk_ids: [],
    top_knowledge_item_ids: [],
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    message: "질문 접수 완료! 등록된 이메일로 답변 준비해둘게.",
  });
}
