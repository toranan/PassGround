import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";

    if (!accessToken) {
      return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });
    }
    if (!userId || !isValidUUID(userId)) {
      return NextResponse.json({ error: "유효하지 않은 사용자 정보입니다." }, { status: 400 });
    }

    const nicknameError = validateNickname(nickname);
    if (nicknameError) {
      return NextResponse.json({ error: nicknameError }, { status: 400 });
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

    const { error: updateError } = await admin
      .from("profiles")
      .update({ display_name: nickname })
      .eq("id", userId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("id,username,display_name")
      .eq("id", userId)
      .maybeSingle<ProfileRow>();

    return NextResponse.json({
      ok: true,
      user: {
        id: userId,
        username: profile?.username ?? "",
        nickname: profile?.display_name ?? nickname,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서버 오류" },
      { status: 500 }
    );
  }
}
