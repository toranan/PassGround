import { NextResponse } from "next/server";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getSupabaseServer } from "@/lib/supabaseServer";

type Exam = "transfer" | "cpa";

type ScheduleRow = {
  id: string;
  exam_slug: string;
  university: string | null;
  title: string;
  category: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  organizer: string | null;
  link_url: string | null;
  is_official: boolean | null;
  note: string | null;
};

const SCHEDULE_FALLBACK: ScheduleRow[] = [
  {
    id: "seed-transfer-1",
    exam_slug: "transfer",
    university: null,
    title: "편입 원서접수 시작",
    category: "원서접수",
    starts_at: "2026-11-30T00:00:00+09:00",
    ends_at: "2026-12-03T23:59:59+09:00",
    location: "각 대학 입학처",
    organizer: "대학별 입학처",
    link_url: null,
    is_official: true,
    note: "대학별 접수 일정이 다를 수 있어 입학처 공지를 함께 확인하세요.",
  },
  {
    id: "seed-transfer-2",
    exam_slug: "transfer",
    university: null,
    title: "편입 필기시험 기간",
    category: "시험",
    starts_at: "2026-12-20T09:00:00+09:00",
    ends_at: "2027-01-12T18:00:00+09:00",
    location: "대학별 고사장",
    organizer: "대학별 입학처",
    link_url: null,
    is_official: true,
    note: "학교별 고사일/시간이 다르므로 지원 대학 일정표를 꼭 확인하세요.",
  },
  {
    id: "seed-transfer-3",
    exam_slug: "transfer",
    university: null,
    title: "편입 최종합격 발표",
    category: "발표",
    starts_at: "2027-02-15T10:00:00+09:00",
    ends_at: "2027-02-28T18:00:00+09:00",
    location: "대학 입학처 홈페이지",
    organizer: "대학별 입학처",
    link_url: null,
    is_official: true,
    note: "등록 마감일이 빠르므로 합격 확인 후 바로 등록 일정을 체크하세요.",
  },
];

function isMissingColumn(error: { message?: string | null } | null, column: string): boolean {
  if (!error) return false;
  return (error.message ?? "").toLowerCase().includes(column.toLowerCase());
}

function parseExam(value: string | null): Exam | null {
  if (value === "transfer" || value === "cpa") return value;
  return null;
}

function withCache(response: NextResponse) {
  response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return response;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const exam = parseExam(searchParams.get("exam")?.trim() ?? "transfer");
  if (!exam) {
    return NextResponse.json({ error: "exam 파라미터가 필요합니다." }, { status: 400 });
  }
  if (!ENABLE_CPA && exam === "cpa") {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }

  const supabase = getSupabaseServer();
  const primary = await supabase
    .from("exam_schedules")
    .select("id,exam_slug,university,title,category,starts_at,ends_at,location,organizer,link_url,is_official,note")
    .eq("exam_slug", exam)
    .eq("is_official", true)
    .order("starts_at", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200);

  let rows = primary.data as ScheduleRow[] | null;
  let queryError = primary.error;
  if (primary.error && isMissingColumn(primary.error, "university")) {
    const fallback = await supabase
      .from("exam_schedules")
      .select("id,exam_slug,title,category,starts_at,ends_at,location,organizer,link_url,is_official,note")
      .eq("exam_slug", exam)
      .eq("is_official", true)
      .order("starts_at", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(200);
    queryError = fallback.error;
    rows = ((fallback.data as Omit<ScheduleRow, "university">[] | null) ?? []).map((row) => ({
      ...row,
      university: null,
    }));
  }

  if (queryError || !rows?.length) {
    const fallback = SCHEDULE_FALLBACK.filter((item) => item.exam_slug === exam);
    return withCache(
      NextResponse.json({
        ok: true,
        source: "seed",
        schedules: fallback,
      })
    );
  }

  const mappedRows = (rows as ScheduleRow[]).map((item) => ({
    ...item,
    is_official: item.is_official ?? true,
    university: item.university ?? null,
  }));

  return withCache(
    NextResponse.json({
      ok: true,
      source: "db",
      schedules: mappedRows,
    })
  );
}
