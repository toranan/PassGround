import { NextResponse } from "next/server";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getBearerToken, getUserByAccessToken, isAdminUser } from "@/lib/authServer";

const CUTOFF_RESULT_TYPES = ["불합격", "추합", "최초합"] as const;
const INPUT_BASIS_TYPES = ["wrong", "score"] as const;

type CutoffResultType = (typeof CUTOFF_RESULT_TYPES)[number];
type InputBasisType = (typeof INPUT_BASIS_TYPES)[number];

function resolveExam(value: string): "transfer" | "cpa" | null {
  if (value === "transfer" || value === "cpa") return value;
  return null;
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function parseResultType(value: unknown): CutoffResultType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim() as CutoffResultType;
  if (!CUTOFF_RESULT_TYPES.includes(normalized)) return null;
  return normalized;
}

function parseInputBasis(value: unknown): InputBasisType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim() as InputBasisType;
  if (!INPUT_BASIS_TYPES.includes(normalized)) return null;
  return normalized;
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

  return { ok: true as const, user };
}

async function loadCutoffs(exam: "transfer" | "cpa") {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("cutoff_scores")
    .select("id,exam_slug,university,major,year,score_band,note,source")
    .eq("exam_slug", exam)
    .order("year", { ascending: false })
    .order("university", { ascending: true })
    .order("major", { ascending: true });

  if (error) {
    return { error: error.message };
  }

  return {
    cutoffs: (data ?? []).map((row: {
      id: string;
      exam_slug: string;
      university: string;
      major: string;
      year: number;
      score_band: string;
      note: string | null;
      source: string | null;
    }) => ({
      id: row.id,
      examSlug: row.exam_slug,
      university: row.university,
      major: row.major,
      year: row.year,
      resultType: row.score_band,
      note: row.note ?? "",
      inputBasis: parseInputBasis(row.source) ?? "wrong",
    })),
  };
}

export async function GET(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const exam = resolveExam(searchParams.get("exam")?.trim() || "transfer");

  if (!exam) {
    return NextResponse.json({ error: "지원하지 않는 시험 카테고리입니다." }, { status: 400 });
  }
  if (exam === "cpa" && !ENABLE_CPA) {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }

  const result = await loadCutoffs(exam);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const exam = resolveExam(normalizeText(body.exam, 20) || "transfer");

  if (!exam) {
    return NextResponse.json({ error: "지원하지 않는 시험 카테고리입니다." }, { status: 400 });
  }
  if (exam === "cpa" && !ENABLE_CPA) {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }

  const university = normalizeText(body.university, 40);
  const major = normalizeText(body.major, 40);
  const yearRaw = Number(body.year);
  const resultType = parseResultType(body.resultType);
  const inputBasis = parseInputBasis(body.inputBasis) ?? "wrong";
  const note = normalizeText(body.note, 120);
  const year = Number.isFinite(yearRaw) ? Math.round(yearRaw) : NaN;

  if (!university || !major || !Number.isFinite(year) || !resultType) {
    return NextResponse.json(
      { error: "university, major, year, resultType이 필요합니다." },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("cutoff_scores")
    .upsert(
      {
        exam_slug: exam,
        university,
        major,
        year,
        score_band: resultType,
        note: note || null,
        source: inputBasis,
      },
      { onConflict: "exam_slug,university,major,year" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const result = await loadCutoffs(exam);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...result });
}

export async function DELETE(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const id = normalizeText(body.id, 80);
  const exam = resolveExam(normalizeText(body.exam, 20) || "transfer");

  if (!id) {
    return NextResponse.json({ error: "삭제할 id가 필요합니다." }, { status: 400 });
  }
  if (!exam) {
    return NextResponse.json({ error: "지원하지 않는 시험 카테고리입니다." }, { status: 400 });
  }
  if (exam === "cpa" && !ENABLE_CPA) {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("cutoff_scores").delete().eq("id", id).eq("exam_slug", exam);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const result = await loadCutoffs(exam);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...result });
}
