import { NextResponse } from "next/server";
import { ENABLE_EMAIL_AUTH } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  if (!ENABLE_EMAIL_AUTH) {
    return NextResponse.json({ error: "소셜 회원가입으로 이용해 주세요." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || username.length < 3) {
    return NextResponse.json({ error: "아이디는 3자 이상이어야 합니다." }, { status: 400 });
  }
  if (!nickname || nickname.length < 2) {
    return NextResponse.json({ error: "닉네임은 2자 이상이어야 합니다." }, { status: 400 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "이메일 주소가 올바르지 않습니다." }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "비밀번호는 6자 이상이어야 합니다." }, { status: 400 });
  }
  try {
    const admin = getSupabaseAdmin();
    const { data: userData, error: userError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        nickname,
      },
    });

    if (userError || !userData.user) {
      return NextResponse.json({ error: userError?.message ?? "계정 생성 실패" }, { status: 400 });
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      id: userData.user.id,
      username,
      display_name: nickname,
      points: 0,
      verification_level: "none",
    });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서버 오류" },
      { status: 500 }
    );
  }
}
