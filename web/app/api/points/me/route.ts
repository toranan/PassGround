import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  points: number | null;
  verification_level: string | null;
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const nickname = searchParams.get("nickname")?.trim() ?? "";
    const userId = searchParams.get("userId")?.trim() ?? "";

    if (!nickname && !userId) {
      return NextResponse.json({ error: "nickname 또는 userId가 필요합니다." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    let profile: ProfileRow | null = null;

    if (userId && isValidUUID(userId)) {
      const { data } = await admin
        .from("profiles")
        .select("id,username,display_name,points,verification_level")
        .eq("id", userId)
        .maybeSingle<ProfileRow>();
      profile = data;
    }

    if (!profile && nickname) {
      const { data } = await admin
        .from("profiles")
        .select("id,username,display_name,points,verification_level")
        .eq("display_name", nickname)
        .limit(1)
        .maybeSingle<ProfileRow>();
      profile = data;
    }

    if (!profile && nickname) {
      const { data } = await admin
        .from("profiles")
        .select("id,username,display_name,points,verification_level")
        .eq("username", nickname)
        .limit(1)
        .maybeSingle<ProfileRow>();
      profile = data;
    }

    const ownerName = profile?.display_name || profile?.username || nickname;
    const ledgerRows: LedgerRow[] = [];

    if (profile?.id) {
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

    if (ownerName) {
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

    const mergedLedger = Array.from(new Map(ledgerRows.map((row) => [row.id, row])).values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 30);

    const computedPoint = mergedLedger.reduce((acc, row) => acc + row.amount, 0);
    const points = profile?.points ?? computedPoint;

    return NextResponse.json({
      ok: true,
      ownerName,
      points,
      verificationLevel: mapVerificationLevel(profile?.verification_level ?? null),
      ledger: mergedLedger,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서버 오류" },
      { status: 500 }
    );
  }
}
