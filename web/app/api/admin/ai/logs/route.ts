import { NextResponse } from "next/server";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getBearerToken, getUserByAccessToken, isAdminUser } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Exam = "transfer" | "cpa";

type ChatLogRow = {
  id: string;
  question: string;
  answer: string;
  created_at: string;
};

function resolveExam(value: string): Exam | null {
  if (value === "transfer" || value === "cpa") return value;
  return null;
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

  const limitRaw = Number(searchParams.get("limit") || "100");
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(20, Math.floor(limitRaw))) : 100;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("ai_chat_logs")
    .select("id,question,answer,created_at")
    .eq("exam_slug", exam)
    .in("route", ["grounded", "fallback", "emotion", "mixed"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const items = ((data as ChatLogRow[] | null) ?? []).map((row) => ({
    id: row.id,
    question: row.question ?? "",
    answer: row.answer ?? "",
    createdAt: row.created_at,
  }));

  return NextResponse.json({
    ok: true,
    exam,
    totalCount: items.length,
    items,
  });
}
