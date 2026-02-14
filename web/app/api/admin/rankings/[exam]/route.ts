import { NextResponse } from "next/server";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getBearerToken, getUserByAccessToken, isAdminUser } from "@/lib/authServer";

type ParamsLike = { exam?: string };

type RankingRow = {
  id: string;
  subject: string;
  instructor_name: string;
  rank: number;
  trend: string | null;
  confidence: number | null;
  source_type: string | null;
  is_seed: boolean;
};

type VoteRow = {
  instructor_name: string;
};

function resolveExam(value: string): "transfer" | "cpa" | null {
  if (value === "transfer" || value === "cpa") return value;
  return null;
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

async function ensureAdmin(request: Request) {
  const token = getBearerToken(request);
  const user = await getUserByAccessToken(token);
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  }

  const allowed = await isAdminUser(user.id, user.email);
  if (!allowed) {
    return { ok: false as const, response: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }) };
  }

  return { ok: true as const, user };
}

async function loadRankingStats(exam: "transfer" | "cpa") {
  const admin = getSupabaseAdmin();
  const { data: rankingRows, error: rankingError } = await admin
    .from("instructor_rankings")
    .select("id,subject,instructor_name,rank,trend,confidence,source_type,is_seed")
    .eq("exam_slug", exam)
    .order("rank", { ascending: true })
    .order("subject", { ascending: true });

  if (rankingError) {
    return { error: rankingError.message };
  }

  const { data: voteRows, error: voteError } = await admin
    .from("instructor_votes")
    .select("instructor_name")
    .eq("exam_slug", exam);

  if (voteError) {
    return { error: voteError.message };
  }

  const voteCountMap = new Map<string, number>();
  (voteRows ?? []).forEach((row: VoteRow) => {
    voteCountMap.set(row.instructor_name, (voteCountMap.get(row.instructor_name) ?? 0) + 1);
  });

  const totalVotes = Array.from(voteCountMap.values()).reduce((sum, count) => sum + count, 0);

  const rankings = (rankingRows ?? []).map((row: RankingRow) => {
    const voteCount = voteCountMap.get(row.instructor_name) ?? 0;
    const votePercent = totalVotes > 0 ? Number(((voteCount / totalVotes) * 100).toFixed(1)) : 0;
    return {
      id: row.id,
      subject: row.subject,
      instructorName: row.instructor_name,
      rank: row.rank,
      trend: row.trend ?? "-",
      confidence: row.confidence ?? 0,
      sourceType: row.source_type ?? "manual",
      isSeed: row.is_seed,
      voteCount,
      votePercent,
    };
  });

  return { rankings, totalVotes };
}

export async function GET(
  request: Request,
  context: { params: ParamsLike | Promise<ParamsLike> }
) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const resolved = await Promise.resolve(context.params);
  const exam = resolveExam(typeof resolved.exam === "string" ? resolved.exam : "");
  if (!exam) {
    return NextResponse.json({ error: "지원하지 않는 시험 카테고리입니다." }, { status: 400 });
  }
  if (exam === "cpa" && !ENABLE_CPA) {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }

  const result = await loadRankingStats(exam);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...result });
}

export async function POST(
  request: Request,
  context: { params: ParamsLike | Promise<ParamsLike> }
) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const resolved = await Promise.resolve(context.params);
  const exam = resolveExam(typeof resolved.exam === "string" ? resolved.exam : "");
  if (!exam) {
    return NextResponse.json({ error: "지원하지 않는 시험 카테고리입니다." }, { status: 400 });
  }
  if (exam === "cpa" && !ENABLE_CPA) {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const subject = normalizeText(body.subject, 40);
  const instructorName = normalizeText(body.instructorName, 40);
  const rank = Number(body.rank);
  const trend = normalizeText(body.trend, 20) || "-";
  const confidenceRaw = Number(body.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.min(100, Math.max(0, Math.round(confidenceRaw)))
    : 0;

  if (!subject || !instructorName || !Number.isFinite(rank)) {
    return NextResponse.json({ error: "subject, instructorName, rank가 필요합니다." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("instructor_rankings")
    .upsert(
      {
        exam_slug: exam,
        subject,
        instructor_name: instructorName,
        rank: Math.max(1, Math.round(rank)),
        trend,
        confidence,
        source_type: "admin",
        is_seed: false,
      },
      { onConflict: "exam_slug,subject,instructor_name" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const result = await loadRankingStats(exam);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...result });
}

export async function DELETE(
  request: Request,
  context: { params: ParamsLike | Promise<ParamsLike> }
) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const resolved = await Promise.resolve(context.params);
  const exam = resolveExam(typeof resolved.exam === "string" ? resolved.exam : "");
  if (!exam) {
    return NextResponse.json({ error: "지원하지 않는 시험 카테고리입니다." }, { status: 400 });
  }
  if (exam === "cpa" && !ENABLE_CPA) {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const id = normalizeText(body.id, 80);
  if (!id) {
    return NextResponse.json({ error: "삭제할 id가 필요합니다." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: row, error: rowError } = await admin
    .from("instructor_rankings")
    .select("instructor_name")
    .eq("id", id)
    .eq("exam_slug", exam)
    .maybeSingle<{ instructor_name: string }>();

  if (rowError) {
    return NextResponse.json({ error: rowError.message }, { status: 400 });
  }

  const { error: deleteError } = await admin
    .from("instructor_rankings")
    .delete()
    .eq("id", id)
    .eq("exam_slug", exam);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  if (row?.instructor_name) {
    await admin
      .from("instructor_votes")
      .delete()
      .eq("exam_slug", exam)
      .eq("instructor_name", row.instructor_name);
  }

  const result = await loadRankingStats(exam);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...result });
}
