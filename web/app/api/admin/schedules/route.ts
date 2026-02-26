import { NextResponse } from "next/server";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getBearerToken, getUserByAccessToken, isAdminUser } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Exam = "transfer" | "cpa";

type ScheduleRow = {
  id: string;
  exam_slug: string;
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

function resolveExam(value: string): Exam | null {
  if (value === "transfer" || value === "cpa") return value;
  return null;
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeOptionalUrl(value: unknown): string | null {
  const raw = normalizeText(value, 300);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseDateTime(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function ensureAdmin(request: Request) {
  const token = getBearerToken(request);
  const user = await getUserByAccessToken(token);
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }),
    };
  }

  const allowed = await isAdminUser(user.id, user.email);
  if (!allowed) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    };
  }

  return { ok: true as const, user };
}

async function loadSchedules(exam: Exam) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("exam_schedules")
    .select("id,exam_slug,title,category,starts_at,ends_at,location,organizer,link_url,is_official,note")
    .eq("exam_slug", exam)
    .order("starts_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return { error: error.message };
  }

  return {
    schedules: (data ?? []).map((row: ScheduleRow) => ({
      id: row.id,
      examSlug: row.exam_slug,
      title: row.title,
      category: row.category,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      location: row.location,
      organizer: row.organizer,
      linkUrl: row.link_url,
      isOfficial: row.is_official ?? true,
      note: row.note,
    })),
  };
}

function validateExam(exam: Exam | null) {
  if (!exam) {
    return NextResponse.json({ error: "지원하지 않는 시험 카테고리입니다." }, { status: 400 });
  }
  if (exam === "cpa" && !ENABLE_CPA) {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }
  return null;
}

export async function GET(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const exam = resolveExam(searchParams.get("exam")?.trim() || "transfer");
  const examError = validateExam(exam);
  if (examError) return examError;

  const result = await loadSchedules(exam as Exam);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const exam = resolveExam(normalizeText(body.exam, 20) || "transfer");
  const examError = validateExam(exam);
  if (examError) return examError;

  const id = normalizeText(body.id, 80);
  const title = normalizeText(body.title, 80);
  const category = normalizeText(body.category, 30) || "일정";
  const startsAt = parseDateTime(body.startsAt);
  const endsAt = parseDateTime(body.endsAt);
  const location = normalizeText(body.location, 120) || null;
  const organizer = normalizeText(body.organizer, 120) || null;
  const linkUrl = normalizeOptionalUrl(body.linkUrl);
  const note = normalizeText(body.note, 300) || null;
  const isOfficial = body.isOfficial !== false;

  if (!title || !startsAt) {
    return NextResponse.json({ error: "title, startsAt은 필수입니다." }, { status: 400 });
  }
  if (body.linkUrl && !linkUrl) {
    return NextResponse.json({ error: "linkUrl 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    return NextResponse.json({ error: "종료일은 시작일보다 이후여야 합니다." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (id) {
    const { error } = await admin
      .from("exam_schedules")
      .update({
        title,
        category,
        starts_at: startsAt,
        ends_at: endsAt,
        location,
        organizer,
        link_url: linkUrl,
        is_official: isOfficial,
        note,
      })
      .eq("id", id)
      .eq("exam_slug", exam);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } else {
    const { error } = await admin.from("exam_schedules").insert({
      exam_slug: exam,
      title,
      category,
      starts_at: startsAt,
      ends_at: endsAt,
      location,
      organizer,
      link_url: linkUrl,
      is_official: isOfficial,
      note,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  const result = await loadSchedules(exam as Exam);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...result });
}

export async function DELETE(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const exam = resolveExam(normalizeText(body.exam, 20) || "transfer");
  const id = normalizeText(body.id, 80);

  const examError = validateExam(exam);
  if (examError) return examError;

  if (!id) {
    return NextResponse.json({ error: "삭제할 id가 필요합니다." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("exam_schedules").delete().eq("id", id).eq("exam_slug", exam);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const result = await loadSchedules(exam as Exam);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...result });
}
