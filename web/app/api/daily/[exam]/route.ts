import { NextResponse } from "next/server";
import { DAILY_BRIEFING_SEED } from "@/lib/data";
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
    .from("daily_briefings")
    .select("id,exam_slug,title,summary,source_label,published_at")
    .eq("exam_slug", exam)
    .order("published_at", { ascending: false })
    .limit(10);

  if (error || !data?.length) {
    const fallback = DAILY_BRIEFING_SEED.filter((row) => row.examSlug === exam);
    return NextResponse.json({ ok: true, source: "seed", briefings: fallback });
  }

  return NextResponse.json({ ok: true, source: "db", briefings: data });
}
