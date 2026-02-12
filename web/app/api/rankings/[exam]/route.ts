import { NextResponse } from "next/server";
import { INSTRUCTOR_RANKING_SEED } from "@/lib/data";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getSupabaseServer } from "@/lib/supabaseServer";

type ParamsLike = { exam?: string };

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
    .limit(10);

  if (error || !data?.length) {
    const fallback = INSTRUCTOR_RANKING_SEED.filter((row) => row.examSlug === exam);
    return NextResponse.json({ ok: true, source: "seed", rankings: fallback });
  }

  return NextResponse.json({ ok: true, source: "db", rankings: data });
}
