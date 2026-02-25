import { NextResponse } from "next/server";
import { CUTOFF_SEED_DATA } from "@/lib/data";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getSupabaseServer } from "@/lib/supabaseServer";

type CutoffRow = {
  id: string;
  exam_slug: string | null;
  university: string;
  major: string;
  year: number;
  score_band: string;
  note: string | null;
  source: string | null;
};

function withCache(response: NextResponse) {
  response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
  return response;
}

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
    return withCache(NextResponse.json({ ok: true, source: "seed", cutoffs: fallback }));
  }

  const cutoffs = (data as CutoffRow[]).map((d) => ({
    id: d.id,
    examSlug: d.exam_slug,
    university: d.university,
    major: d.major,
    year: d.year,
    scoreBand: d.score_band,
    note: d.note,
    source: d.source,
  }));

  return withCache(NextResponse.json({ ok: true, source: "db", cutoffs }));
}
