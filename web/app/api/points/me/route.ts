import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  points: number | null;
  verification_level: string | null;
  target_university?: string | null;
};

type LedgerRow = {
  id: string;
  receiver_name: string;
  source: string;
  amount: number;
  meta: Record<string, unknown> | null;
  created_at: string;
};

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function mapVerificationLevel(level: string | null): string {
  switch (level) {
    case "transfer_passer":
      return "편입 합격자";
    case "cpa_first_passer":
      return "CPA 1차 합격";
    case "cpa_accountant":
      return "현직 회계사";
    default:
      return "미인증";
  }
}

function parseVerifiedUniversityFromMemo(memo: string | null | undefined): string | null {
  if (!memo) return null;
  try {
    const parsed = JSON.parse(memo) as { verifiedUniversity?: unknown };
    if (typeof parsed.verifiedUniversity !== "string") return null;
    const value = parsed.verifiedUniversity.trim();
    return value || null;
  } catch {
    return null;
  }
}

async function resolveTransferPasserLabel(
  admin: ReturnType<typeof getSupabaseAdmin>,
  profileId: string
): Promise<string> {
  const fallback = "편입 합격자";
  const { data: latestApproved, error } = await admin
    .from("verification_requests")
    .select("memo")
    .eq("profile_id", profileId)
    .eq("verification_type", "transfer_passer")
    .eq("status", "approved")
    .order("reviewed_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ memo: string | null }>();

  if (error) {
    const code = (error as { code?: string | null }).code ?? "";
    const message = (error.message ?? "").toLowerCase();
    if (code === "42P01" || message.includes('relation "verification_requests" does not exist')) {
      return fallback;
    }
    return fallback;
  }

  const verifiedUniversity = parseVerifiedUniversityFromMemo(latestApproved?.memo);
  return verifiedUniversity ? `${verifiedUniversity} 합격자` : fallback;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const nickname = searchParams.get("nickname")?.trim() ?? "";
    const userId = searchParams.get("userId")?.trim() ?? "";
    const includeLedger = (searchParams.get("includeLedger") ?? "true").trim().toLowerCase() !== "false";

    if (!nickname && !userId) {
      return NextResponse.json({ error: "nickname 또는 userId가 필요합니다." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    let profile: ProfileRow | null = null;
    let targetUniversity: string | null = null;

    async function fetchProfileById(id: string) {
      const primary = await admin
        .from("profiles")
        .select("id,username,display_name,points,verification_level,target_university")
        .eq("id", id)
        .maybeSingle<ProfileRow>();

      if (!primary.error) return primary;
      if (!primary.error.message?.toLowerCase().includes("target_university")) return primary;

      const fallback = await admin
        .from("profiles")
        .select("id,username,display_name,points,verification_level")
        .eq("id", id)
        .maybeSingle<ProfileRow>();
      if (!fallback.error && fallback.data) {
        return {
          data: { ...fallback.data, target_university: null },
          error: null,
        };
      }
      return fallback;
    }

    async function fetchProfileByField(field: "display_name" | "username", value: string) {
      const primary = await admin
        .from("profiles")
        .select("id,username,display_name,points,verification_level,target_university")
        .eq(field, value)
        .limit(1)
        .maybeSingle<ProfileRow>();

      if (!primary.error) return primary;
      if (!primary.error.message?.toLowerCase().includes("target_university")) return primary;

      const fallback = await admin
        .from("profiles")
        .select("id,username,display_name,points,verification_level")
        .eq(field, value)
        .limit(1)
        .maybeSingle<ProfileRow>();
      if (!fallback.error && fallback.data) {
        return {
          data: { ...fallback.data, target_university: null },
          error: null,
        };
      }
      return fallback;
    }

    if (userId && isValidUUID(userId)) {
      const { data } = await fetchProfileById(userId);
      profile = data;
    }

    if (!profile && nickname) {
      const { data } = await fetchProfileByField("display_name", nickname);
      profile = data;
    }

    if (!profile && nickname) {
      const { data } = await fetchProfileByField("username", nickname);
      profile = data;
    }

    targetUniversity = profile?.target_university?.trim() || null;

    const ownerName = profile?.display_name || profile?.username || nickname;
    const ledgerRows: LedgerRow[] = [];

    if (includeLedger && profile?.id) {
      const { data } = await admin
        .from("point_ledger")
        .select("id,receiver_name,source,amount,meta,created_at")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (data) {
        ledgerRows.push(...(data as LedgerRow[]));
      }
    }

    if (includeLedger && ownerName) {
      const { data } = await admin
        .from("point_ledger")
        .select("id,receiver_name,source,amount,meta,created_at")
        .eq("receiver_name", ownerName)
        .order("created_at", { ascending: false })
        .limit(30);
      if (data) {
        ledgerRows.push(...(data as LedgerRow[]));
      }
    }

    const mergedLedger = includeLedger
      ? Array.from(new Map(ledgerRows.map((row) => [row.id, row])).values())
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 30)
      : [];

    const computedPoint = includeLedger
      ? mergedLedger.reduce((acc, row) => acc + row.amount, 0)
      : 0;
    const points = profile?.points ?? computedPoint;
    const verificationLevel = profile?.verification_level === "transfer_passer" && profile?.id
      ? await resolveTransferPasserLabel(admin, profile.id)
      : mapVerificationLevel(profile?.verification_level ?? null);

    return NextResponse.json({
      ok: true,
      ownerName,
      points,
      verificationLevel,
      targetUniversity,
      ledger: mergedLedger,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서버 오류" },
      { status: 500 }
    );
  }
}
