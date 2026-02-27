import { NextResponse } from "next/server";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getBearerToken, getUserByAccessToken, isAdminUser } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Exam = "transfer" | "cpa";

type ChatLogRow = {
  question: string;
  created_at: string;
};

type UnansweredQuestionItem = {
  question: string;
  normalizedQuestion: string;
  count: number;
  lastSeenAt: string;
};

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

export async function GET(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const exam = resolveExam(searchParams.get("exam")?.trim() || "transfer");
  const examError = validateExam(exam);
  if (examError) return examError;

  const scanLimitRaw = Number(searchParams.get("scanLimit") || "500");
  const scanLimit = Number.isFinite(scanLimitRaw) ? Math.min(5000, Math.max(100, Math.floor(scanLimitRaw))) : 500;
  const topKRaw = Number(searchParams.get("topK") || "50");
  const topK = Number.isFinite(topKRaw) ? Math.min(200, Math.max(10, Math.floor(topKRaw))) : 50;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("ai_chat_logs")
    .select("question,created_at")
    .eq("exam_slug", exam)
    .eq("route", "fallback")
    .order("created_at", { ascending: false })
    .limit(scanLimit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data as ChatLogRow[] | null) ?? [];
  const byQuestion = new Map<string, UnansweredQuestionItem>();

  for (const row of rows) {
    const question = normalizeText(row.question, 1000);
    if (!question) continue;
    const normalized = normalizeQuestion(question);
    if (!normalized) continue;

    const existing = byQuestion.get(normalized);
    if (!existing) {
      byQuestion.set(normalized, {
        question,
        normalizedQuestion: normalized,
        count: 1,
        lastSeenAt: row.created_at,
      });
      continue;
    }
    existing.count += 1;
    if (new Date(row.created_at).getTime() > new Date(existing.lastSeenAt).getTime()) {
      existing.lastSeenAt = row.created_at;
      existing.question = question;
    }
  }

  const items = [...byQuestion.values()]
    .sort((a, b) => b.count - a.count || new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .slice(0, topK);

  return NextResponse.json({
    ok: true,
    exam,
    scanLimit,
    topK,
    totalFallbackLogs: rows.length,
    uniqueQuestionCount: byQuestion.size,
    items,
  });
}
