import { NextResponse } from "next/server";
import { getBearerToken, getUserByAccessToken, isAdminUser } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type ReviewStatus = "pending" | "approved" | "rejected";

type VerificationRequestRow = {
  id: string;
  profile_id: string | null;
  requester_name: string;
  exam_slug: string;
  verification_type: string;
  evidence_url: string;
  memo: string | null;
  status: ReviewStatus;
  reviewed_at: string | null;
  created_at: string;
};

function parseMemo(memo: string | null): { userMemo: string | null; verifiedUniversity: string | null } {
  if (!memo) return { userMemo: null, verifiedUniversity: null };
  try {
    const parsed = JSON.parse(memo) as { userMemo?: unknown; verifiedUniversity?: unknown };
    const userMemo = typeof parsed.userMemo === "string" ? parsed.userMemo.trim() : "";
    const verifiedUniversity = typeof parsed.verifiedUniversity === "string" ? parsed.verifiedUniversity.trim() : "";
    return {
      userMemo: userMemo || null,
      verifiedUniversity: verifiedUniversity || null,
    };
  } catch {
    return { userMemo: memo, verifiedUniversity: null };
  }
}

function buildApprovedMemo(existingMemo: string | null, verifiedUniversity: string): string {
  const parsed = parseMemo(existingMemo);
  return JSON.stringify({
    userMemo: parsed.userMemo,
    verifiedUniversity,
  });
}

function resolveVerificationLevel(verificationType: string): string {
  if (verificationType === "transfer_passer") return "transfer_passer";
  if (verificationType === "cpa_first_passer") return "cpa_first_passer";
  if (verificationType === "cpa_accountant") return "cpa_accountant";
  return "transfer_passer";
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

function normalizeStatus(value: unknown): ReviewStatus | "all" | null {
  if (value === "pending" || value === "approved" || value === "rejected" || value === "all") {
    return value;
  }
  return null;
}

export async function GET(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const status = normalizeStatus((searchParams.get("status") ?? "all").trim()) ?? "all";
  const limitRaw = Number(searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitRaw) ? Math.max(20, Math.min(300, Math.floor(limitRaw))) : 100;

  const admin = getSupabaseAdmin();
  let query = admin
    .from("verification_requests")
    .select("id,profile_id,requester_name,exam_slug,verification_type,evidence_url,memo,status,reviewed_at,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data as VerificationRequestRow[] | null) ?? [];
  const items = rows.map((row) => {
    const parsed = parseMemo(row.memo);
    return {
      id: row.id,
      profileId: row.profile_id,
      requesterName: row.requester_name,
      examSlug: row.exam_slug,
      verificationType: row.verification_type,
      evidenceUrl: row.evidence_url,
      userMemo: parsed.userMemo,
      verifiedUniversity: parsed.verifiedUniversity,
      status: row.status,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
    };
  });

  return NextResponse.json({
    ok: true,
    items,
  });
}

export async function PATCH(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const bodyRaw = await request.json().catch(() => ({}));
  const body: Record<string, unknown> = typeof bodyRaw === "object" && bodyRaw !== null ? bodyRaw : {};
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const status = normalizeStatus(body.status);
  const verifiedUniversity = typeof body.verifiedUniversity === "string" ? body.verifiedUniversity.trim() : "";

  if (!id) {
    return NextResponse.json({ error: "요청 id가 필요합니다." }, { status: 400 });
  }
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "status는 approved/rejected만 가능합니다." }, { status: 400 });
  }
  if (status === "approved" && verifiedUniversity.length < 2) {
    return NextResponse.json({ error: "승인 시 합격 대학명을 입력해 주세요." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: current, error: currentError } = await admin
    .from("verification_requests")
    .select("id,profile_id,verification_type,memo,status")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      profile_id: string | null;
      verification_type: string;
      memo: string | null;
      status: ReviewStatus;
    }>();

  if (currentError || !current?.id) {
    return NextResponse.json({ error: currentError?.message ?? "검수 대상을 찾을 수 없습니다." }, { status: 404 });
  }

  const nextMemo = status === "approved" ? buildApprovedMemo(current.memo, verifiedUniversity) : current.memo;

  const { error: updateError } = await admin
    .from("verification_requests")
    .update({
      status,
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
      memo: nextMemo,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  if (status === "approved" && current.profile_id) {
    const verificationLevel = resolveVerificationLevel(current.verification_type);
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        verification_level: verificationLevel,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.profile_id);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }
  }

  const { data: refreshed, error: refreshedError } = await admin
    .from("verification_requests")
    .select("id,profile_id,requester_name,exam_slug,verification_type,evidence_url,memo,status,reviewed_at,created_at")
    .order("created_at", { ascending: false })
    .limit(120);

  if (refreshedError) {
    return NextResponse.json({ error: refreshedError.message }, { status: 400 });
  }

  const items = ((refreshed as VerificationRequestRow[] | null) ?? []).map((row) => {
    const parsed = parseMemo(row.memo);
    return {
      id: row.id,
      profileId: row.profile_id,
      requesterName: row.requester_name,
      examSlug: row.exam_slug,
      verificationType: row.verification_type,
      evidenceUrl: row.evidence_url,
      userMemo: parsed.userMemo,
      verifiedUniversity: parsed.verifiedUniversity,
      status: row.status,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
    };
  });

  return NextResponse.json({ ok: true, items });
}
