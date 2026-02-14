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
    .select("id,exam_slug,subject,instructor_name,rank,confidence")
    .eq("exam_slug", exam)
    .order("subject", { ascending: true })
    .order("instructor_name", { ascending: true })
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

  const sortableRows = (data ?? []).map((row: RankingRow) => ({
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
      examSlug: row.exam_slug,
      subject: row.subject,
      instructorName: row.instructor_name,
      rank: index + 1,
      voteCount: row.voteCount,
      votePercent,
    };
  });

  return NextResponse.json({ ok: true, source: "db", totalVotes, rankings });
}
