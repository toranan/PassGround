import { NextResponse } from "next/server";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getBearerToken, getUserByAccessToken } from "@/lib/authServer";

type ParamsLike = { exam?: string };

function resolveExam(value: string): "transfer" | "cpa" | null {
  if (value === "transfer" || value === "cpa") return value;
  return null;
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

async function getVoteStatus(exam: string, userId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("instructor_votes")
    .select("instructor_name,created_at")
    .eq("exam_slug", exam)
    .eq("voter_name", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ instructor_name: string; created_at: string }>();

  if (error) {
    return { error: error.message };
  }

  return {
    hasVoted: Boolean(data?.instructor_name),
    instructorName: data?.instructor_name ?? null,
    votedAt: data?.created_at ?? null,
  };
}

export async function GET(
  request: Request,
  context: { params: ParamsLike | Promise<ParamsLike> }
) {
  const resolved = await Promise.resolve(context.params);
  const exam = resolveExam(typeof resolved.exam === "string" ? resolved.exam : "");

  if (!exam) {
    return NextResponse.json({ error: "지원하지 않는 시험 카테고리입니다." }, { status: 400 });
  }
  if (exam === "cpa" && !ENABLE_CPA) {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }

  const accessToken = getBearerToken(request);
  const user = await getUserByAccessToken(accessToken);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const status = await getVoteStatus(exam, user.id);
  if ("error" in status) {
    return NextResponse.json({ error: status.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...status });
}

export async function POST(
  request: Request,
  context: { params: ParamsLike | Promise<ParamsLike> }
) {
  const resolved = await Promise.resolve(context.params);
  const exam = resolveExam(typeof resolved.exam === "string" ? resolved.exam : "");

  if (!exam) {
    return NextResponse.json({ error: "지원하지 않는 시험 카테고리입니다." }, { status: 400 });
  }
  if (exam === "cpa" && !ENABLE_CPA) {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }

  const accessToken = getBearerToken(request);
  const user = await getUserByAccessToken(accessToken);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const instructorName = normalizeText(body.instructorName, 40);
  const subject = normalizeText(body.subject, 40);

  if (!instructorName) {
    return NextResponse.json({ error: "강사명을 선택해 주세요." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const status = await getVoteStatus(exam, user.id);
  if ("error" in status) {
    return NextResponse.json({ error: status.error }, { status: 400 });
  }

  if (status.hasVoted) {
    if (status.instructorName === instructorName) {
      return NextResponse.json({
        ok: true,
        alreadyVoted: true,
        instructorName: status.instructorName,
        votedAt: status.votedAt,
      });
    }

    return NextResponse.json(
      {
        error: `이미 투표를 완료했습니다. (${status.instructorName})`,
        instructorName: status.instructorName,
        votedAt: status.votedAt,
      },
      { status: 409 }
    );
  }

  const { data: rankingRow, error: rankingError } = await admin
    .from("instructor_rankings")
    .select("instructor_name")
    .eq("exam_slug", exam)
    .eq("instructor_name", instructorName)
    .limit(1)
    .maybeSingle<{ instructor_name: string }>();

  if (rankingError) {
    return NextResponse.json({ error: rankingError.message }, { status: 400 });
  }

  if (!rankingRow?.instructor_name) {
    if (!subject) {
      return NextResponse.json(
        { error: "기타 투표는 과목과 강사명을 함께 입력해 주세요." },
        { status: 400 }
      );
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
    const { error: upsertError } = await admin
      .from("instructor_rankings")
      .upsert(
        {
          exam_slug: exam,
          subject,
          instructor_name: instructorName,
          rank: nextRank,
          trend: "-",
          confidence: 0,
          source_type: "user",
          is_seed: false,
        },
        { onConflict: "exam_slug,subject,instructor_name" }
      );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 400 });
    }
  }

  const { error: insertError } = await admin.from("instructor_votes").insert({
    exam_slug: exam,
    instructor_name: instructorName,
    voter_name: user.id,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    alreadyVoted: false,
    instructorName,
  });
}
