import { NextResponse } from "next/server";
import { CUTOFF_SEED_DATA } from "@/lib/data";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getSupabaseServer } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const exam = searchParams.get("exam")?.trim() || "transfer";
  if (!ENABLE_CPA && exam === "cpa") {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("cutoff_scores")
    .select("id,exam_slug,university,major,year,score_band,note,source")
    .eq("exam_slug", exam)
    .order("year", { ascending: false })
    .limit(30);

  if (error || !data?.length) {
    const fallback = CUTOFF_SEED_DATA.filter((row) => row.examSlug === exam);
    return NextResponse.json({ ok: true, source: "seed", cutoffs: fallback });
  }

  const cutoffs = data.map((d: any) => ({
    id: d.id,
    examSlug: d.exam_slug,
    university: d.university,
    major: d.major,
    year: d.year,
    scoreBand: d.score_band,
    note: d.note,
    source: d.source,
  }));

  return NextResponse.json({ ok: true, source: "db", cutoffs });
}
