import { NextResponse } from "next/server";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getBearerToken, getUserByAccessToken, isAdminUser } from "@/lib/authServer";

const INPUT_BASIS_TYPES = ["wrong", "score"] as const;

type InputBasisType = (typeof INPUT_BASIS_TYPES)[number];
type StoredCutoffMeta = {
  waitlistCutoff: number | null;
  initialCutoff: number | null;
  memo: string;
};

function resolveExam(value: string): "transfer" | "cpa" | null {
  if (value === "transfer" || value === "cpa") return value;
  return null;
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function parseInputBasis(value: unknown): InputBasisType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim() as InputBasisType;
  if (!INPUT_BASIS_TYPES.includes(normalized)) return null;
  return normalized;
}

function parseStoredMeta(raw: string | null): StoredCutoffMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredCutoffMeta>;
    const waitlistRaw = parsed.waitlistCutoff;
    const initialRaw = parsed.initialCutoff;
    const waitlistCutoff =
      waitlistRaw === null || waitlistRaw === undefined ? null : Number(waitlistRaw);
    const initialCutoff =
      initialRaw === null || initialRaw === undefined ? null : Number(initialRaw);
    if (waitlistCutoff !== null && !Number.isFinite(waitlistCutoff)) return null;
    if (initialCutoff !== null && !Number.isFinite(initialCutoff)) return null;
    return {
      waitlistCutoff,
      initialCutoff,
      memo: typeof parsed.memo === "string" ? parsed.memo : "",
    };
  } catch {
    return null;
  }
}

function formatScoreBand(
  basis: InputBasisType,
  waitlistCutoff: number | null,
  initialCutoff: number | null
): string {
  const unit = basis === "score" ? "점" : "개";
  if (waitlistCutoff !== null && initialCutoff !== null) {
    return `추합권 ${waitlistCutoff}${unit} / 최초합권 ${initialCutoff}${unit}`;
  }
  if (waitlistCutoff !== null) {
    return `추합권 ${waitlistCutoff}${unit}`;
  }
  if (initialCutoff !== null) {
    return `최초합권 ${initialCutoff}${unit}`;
  }
  return "-";
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
      ...(function () {
        const basis = parseInputBasis(row.source) ?? "wrong";
        const parsedMeta = parseStoredMeta(row.note);
        if (parsedMeta) {
          return {
            waitlistCutoff: parsedMeta.waitlistCutoff,
            initialCutoff: parsedMeta.initialCutoff,
            memo: parsedMeta.memo,
            inputBasis: basis,
          };
        }

        const numbers = row.score_band.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
        return {
          waitlistCutoff: Number.isFinite(numbers[0]) ? numbers[0] : 0,
          initialCutoff: Number.isFinite(numbers[1]) ? numbers[1] : 0,
          memo: row.note ?? "",
          inputBasis: basis,
        };
      })(),
      id: row.id,
      examSlug: row.exam_slug,
      university: row.university,
      major: row.major,
      year: row.year,
      displayBand: row.score_band,
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
  const inputBasis = parseInputBasis(body.inputBasis) ?? "wrong";
  const waitlistCutoffRaw = Number(body.waitlistCutoff);
  const initialCutoffRaw = Number(body.initialCutoff);
  const memo = normalizeText(body.memo, 160);
  const year = Number.isFinite(yearRaw) ? Math.round(yearRaw) : NaN;
  const waitlistCutoff = Number.isFinite(waitlistCutoffRaw) ? waitlistCutoffRaw : null;
  const initialCutoff = Number.isFinite(initialCutoffRaw) ? initialCutoffRaw : null;

  if (!university || !major || !Number.isFinite(year)) {
    return NextResponse.json(
      { error: "university, major, year는 필수입니다." },
      { status: 400 }
    );
  }

  if (waitlistCutoff === null && initialCutoff === null) {
    return NextResponse.json(
      { error: "추합권 컷 또는 최초합권 컷 중 하나는 입력해 주세요." },
      { status: 400 }
    );
  }

  if (
    inputBasis === "score" &&
    waitlistCutoff !== null &&
    initialCutoff !== null &&
    initialCutoff < waitlistCutoff
  ) {
    return NextResponse.json(
      { error: "점수 기준에서는 최초합권 컷이 추합권 컷보다 크거나 같아야 합니다." },
      { status: 400 }
    );
  }
  if (
    inputBasis === "wrong" &&
    waitlistCutoff !== null &&
    initialCutoff !== null &&
    initialCutoff > waitlistCutoff
  ) {
    return NextResponse.json(
      { error: "틀린개수 기준에서는 최초합권 컷이 추합권 컷보다 작거나 같아야 합니다." },
      { status: 400 }
    );
  }

  const safeWaitlist =
    waitlistCutoff === null ? null : Number(waitlistCutoff.toFixed(2));
  const safeInitial =
    initialCutoff === null ? null : Number(initialCutoff.toFixed(2));
  const storedMeta: StoredCutoffMeta = {
    waitlistCutoff: safeWaitlist,
    initialCutoff: safeInitial,
    memo,
  };

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("cutoff_scores")
    .upsert(
      {
        exam_slug: exam,
        university,
        major,
        year,
        score_band: formatScoreBand(inputBasis, safeWaitlist, safeInitial),
        note: JSON.stringify(storedMeta),
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
