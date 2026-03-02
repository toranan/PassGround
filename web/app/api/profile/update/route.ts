import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  target_university?: string | null;
};

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function validateNickname(value: string): string | null {
  const nickname = value.trim();
  if (nickname.length < 2) return "닉네임은 2자 이상이어야 합니다.";
  if (nickname.length > 20) return "닉네임은 20자 이하여야 합니다.";
  const isValid = /^[a-zA-Z0-9가-힣_ ]+$/.test(nickname);
  if (!isValid) return "닉네임은 한글/영문/숫자/_/공백만 사용할 수 있습니다.";
  return null;
}

function normalizeTargetUniversity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 40);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const hasNicknameField = typeof body.nickname === "string";
    const nickname = hasNicknameField ? body.nickname.trim() : "";
    const hasTargetField = Object.prototype.hasOwnProperty.call(body, "targetUniversity");
    const targetUniversity = normalizeTargetUniversity(body.targetUniversity);

    if (!accessToken) {
      return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });
    }
    if (!userId || !isValidUUID(userId)) {
      return NextResponse.json({ error: "유효하지 않은 사용자 정보입니다." }, { status: 400 });
    }

    if (!hasNicknameField && !hasTargetField) {
      return NextResponse.json({ error: "수정할 항목이 없습니다." }, { status: 400 });
    }

    if (hasNicknameField) {
      const nicknameError = validateNickname(nickname);
      if (nicknameError) {
        return NextResponse.json({ error: nicknameError }, { status: 400 });
      }
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
      return NextResponse.json({ error: "본인 계정만 수정할 수 있습니다." }, { status: 403 });
    }

    const admin = getSupabaseAdmin();

    if (hasNicknameField) {
      const { data: duplicate } = await admin
        .from("profiles")
        .select("id")
        .eq("display_name", nickname)
        .neq("id", userId)
        .limit(1)
        .maybeSingle<{ id: string }>();

      if (duplicate?.id) {
        return NextResponse.json({ error: "이미 사용 중인 닉네임입니다." }, { status: 409 });
      }
    }

    const updatePayload: Record<string, string | null> = {};
    if (hasNicknameField) {
      updatePayload.display_name = nickname;
    }
    if (hasTargetField) {
      updatePayload.target_university = targetUniversity;
    }

    const { error: updateError } = await admin.from("profiles").update(updatePayload).eq("id", userId);

    if (updateError) {
      if (
        hasTargetField &&
        updateError.message?.toLowerCase().includes("target_university")
      ) {
        return NextResponse.json(
          { error: "DB 컬럼이 아직 없어 목표대학 저장이 불가합니다. SQL 마이그레이션을 먼저 적용해 주세요." },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const primaryProfileResult = await admin
      .from("profiles")
      .select("id,username,display_name,target_university")
      .eq("id", userId)
      .maybeSingle<ProfileRow>();

    let profile = primaryProfileResult.data;
    if (primaryProfileResult.error?.message?.toLowerCase().includes("target_university")) {
      const { data: fallbackProfile } = await admin
        .from("profiles")
        .select("id,username,display_name")
        .eq("id", userId)
        .maybeSingle<ProfileRow>();
      profile = fallbackProfile ? { ...fallbackProfile, target_university: null } : null;
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: userId,
        username: profile?.username ?? "",
        nickname: profile?.display_name ?? (hasNicknameField ? nickname : ""),
        targetUniversity: profile?.target_university ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서버 오류" },
      { status: 500 }
    );
  }
}
