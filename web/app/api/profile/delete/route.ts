import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isMissingRelation(error: { code?: string | null; message?: string | null } | null, relation: string): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes(`relation "${relation.toLowerCase()}" does not exist`);
}

function isMissingColumn(error: { code?: string | null; message?: string | null } | null, column: string): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return (error.message ?? "").toLowerCase().includes(`column "${column.toLowerCase()}"`);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";

    if (!accessToken) {
      return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });
    }
    if (!userId || !isValidUUID(userId)) {
      return NextResponse.json({ error: "유효하지 않은 사용자 정보입니다." }, { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
    }

    const anon = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    const { data: authData, error: authError } = await anon.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "인증이 만료되었습니다. 다시 로그인해 주세요." }, { status: 401 });
    }
    if (authData.user.id !== userId) {
      return NextResponse.json({ error: "본인 계정만 삭제할 수 있습니다." }, { status: 403 });
    }

    const admin = getSupabaseAdmin();

    const { data: profileData } = await admin
      .from("profiles")
      .select("display_name,username")
      .eq("id", userId)
      .maybeSingle<{ display_name: string | null; username: string | null }>();

    const voteOwnerCandidates = Array.from(
      new Set(
        [
          userId,
          profileData?.display_name?.trim() ?? "",
          profileData?.username?.trim() ?? "",
        ].filter((value) => value.length > 0)
      )
    );

    for (const voteOwner of voteOwnerCandidates) {
      const { error } = await admin.from("instructor_votes").delete().eq("voter_name", voteOwner);
      if (error && !isMissingRelation(error, "instructor_votes")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    const { error: ledgerError } = await admin.from("point_ledger").delete().eq("profile_id", userId);
    if (ledgerError && !isMissingRelation(ledgerError, "point_ledger")) {
      return NextResponse.json({ error: ledgerError.message }, { status: 400 });
    }

    const { error: verificationError } = await admin
      .from("verification_requests")
      .delete()
      .eq("profile_id", userId);
    if (verificationError && !isMissingRelation(verificationError, "verification_requests")) {
      return NextResponse.json({ error: verificationError.message }, { status: 400 });
    }

    const { error: notificationRecipientError } = await admin
      .from("notifications")
      .delete()
      .eq("recipient_id", userId);
    if (notificationRecipientError && !isMissingRelation(notificationRecipientError, "notifications")) {
      return NextResponse.json({ error: notificationRecipientError.message }, { status: 400 });
    }

    const { error: notificationActorError } = await admin.from("notifications").delete().eq("actor_id", userId);
    if (
      notificationActorError &&
      !isMissingRelation(notificationActorError, "notifications") &&
      !isMissingColumn(notificationActorError, "actor_id")
    ) {
      return NextResponse.json({ error: notificationActorError.message }, { status: 400 });
    }

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      return NextResponse.json({ error: deleteAuthError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서버 오류" },
      { status: 500 }
    );
  }
}
