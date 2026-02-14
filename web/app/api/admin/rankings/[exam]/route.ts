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
    .select("id,subject,instructor_name,rank,confidence,source_type,is_seed")
    .eq("exam_slug", exam)
    .order("subject", { ascending: true })
    .order("instructor_name", { ascending: true });

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

  const sortableRows = (rankingRows ?? []).map((row: RankingRow) => ({
    ...row,
    realVoteCount: voteCountMap.get(row.instructor_name) ?? 0,
    initialVotes: Math.max(0, row.confidence ?? 0),
    voteCount: 0,
  }));

  sortableRows.forEach((row) => {
    row.voteCount = row.realVoteCount + row.initialVotes;
  });

  sortableRows.sort((a, b) => {
    if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
    if (a.rank !== b.rank) return a.rank - b.rank;
    const bySubject = a.subject.localeCompare(b.subject);
    if (bySubject !== 0) return bySubject;
    return a.instructor_name.localeCompare(b.instructor_name);
  });

  const totalVotes = sortableRows.reduce((sum, row) => sum + row.voteCount, 0);

  const rankings = sortableRows.map((row, index) => {
    const votePercent = totalVotes > 0 ? Number(((row.voteCount / totalVotes) * 100).toFixed(1)) : 0;
    return {
      id: row.id,
      subject: row.subject,
      instructorName: row.instructor_name,
      rank: index + 1,
      initialRank: row.rank,
      initialVotes: row.initialVotes,
      realVoteCount: row.realVoteCount,
      sourceType: row.source_type ?? "manual",
      isSeed: row.is_seed,
      voteCount: row.voteCount,
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
  const initialRankRaw = Number(body.initialRank);
  const initialVotesRaw = Number(body.initialVotes);

  if (!subject || !instructorName) {
    return NextResponse.json({ error: "subject, instructorName이 필요합니다." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: existingRow, error: existingRowError } = await admin
    .from("instructor_rankings")
    .select("rank,confidence")
    .eq("exam_slug", exam)
    .eq("subject", subject)
    .eq("instructor_name", instructorName)
    .limit(1)
    .maybeSingle<{ rank: number; confidence: number | null }>();

  if (existingRowError) {
    return NextResponse.json({ error: existingRowError.message }, { status: 400 });
  }

  const { data: maxRankRow, error: maxRankError } = await admin
    .from("instructor_rankings")
    .select("rank")
    .eq("exam_slug", exam)
    .order("rank", { ascending: false })
    .limit(1)
    .maybeSingle<{ rank: number }>();

  if (maxRankError) {
    return NextResponse.json({ error: maxRankError.message }, { status: 400 });
  }

  const nextRank = Math.max(1, (maxRankRow?.rank ?? 0) + 1);
  const initialRank = Number.isFinite(initialRankRaw)
    ? Math.max(1, Math.round(initialRankRaw))
    : Math.max(1, existingRow?.rank ?? nextRank);
  const initialVotes = Number.isFinite(initialVotesRaw)
    ? Math.max(0, Math.round(initialVotesRaw))
    : Math.max(0, existingRow?.confidence ?? 0);
  const { error } = await admin
    .from("instructor_rankings")
    .upsert(
      {
        exam_slug: exam,
        subject,
        instructor_name: instructorName,
        rank: initialRank,
        trend: "-",
        confidence: initialVotes,
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
