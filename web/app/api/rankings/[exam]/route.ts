import { NextResponse } from "next/server";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getSupabaseServer } from "@/lib/supabaseServer";

type ParamsLike = { exam?: string };

type RankingRow = {
  id: string;
  exam_slug: string;
  subject: string;
  instructor_name: string;
  rank: number;
  trend: string | null;
  confidence: number | null;
};

type VoteRow = {
  instructor_name: string;
};

export async function GET(
  _request: Request,
  context: { params: ParamsLike | Promise<ParamsLike> }
) {
  const resolved = await Promise.resolve(context.params);
  const exam = typeof resolved.exam === "string" ? resolved.exam : "";

  if (!exam) {
    return NextResponse.json({ error: "exam 파라미터가 필요합니다." }, { status: 400 });
  }
  if (!ENABLE_CPA && exam === "cpa") {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("instructor_rankings")
    .select("id,exam_slug,subject,instructor_name,rank,trend,confidence")
    .eq("exam_slug", exam)
    .order("rank", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: voteRows, error: voteError } = await supabase
    .from("instructor_votes")
    .select("instructor_name")
    .eq("exam_slug", exam);

  if (voteError) {
    return NextResponse.json({ error: voteError.message }, { status: 400 });
  }

  const voteCountMap = new Map<string, number>();
  (voteRows ?? []).forEach((row: VoteRow) => {
    voteCountMap.set(row.instructor_name, (voteCountMap.get(row.instructor_name) ?? 0) + 1);
  });

  const totalVotes = Array.from(voteCountMap.values()).reduce((sum, count) => sum + count, 0);
  const rankings = (data ?? []).map((row: RankingRow) => {
    const voteCount = voteCountMap.get(row.instructor_name) ?? 0;
    const votePercent = totalVotes > 0 ? Number(((voteCount / totalVotes) * 100).toFixed(1)) : 0;
    return {
      id: row.id,
      examSlug: row.exam_slug,
      subject: row.subject,
      instructorName: row.instructor_name,
      rank: row.rank,
      trend: row.trend ?? "-",
      confidence: row.confidence ?? 0,
      voteCount,
      votePercent,
    };
  });

  return NextResponse.json({ ok: true, source: "db", totalVotes, rankings });
}
