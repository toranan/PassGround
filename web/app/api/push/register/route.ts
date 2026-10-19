import { NextResponse } from "next/server";
import { getBearerToken, getUserByAccessToken } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// 앱이 알림 허용 후 받은 기기 토큰을 등록하거나, 최신뉴스 알림 설정을 바꾼다. 로그인은 선택이다.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!/^[0-9a-f]{64,200}$/i.test(token)) {
    return NextResponse.json({ error: "기기 토큰이 올바르지 않습니다." }, { status: 400 });
  }
  const environment = body.environment === "sandbox" ? "sandbox" : "production";
  const newsEnabled = body.newsEnabled !== false;

  const accessToken = getBearerToken(request);
  const user = accessToken ? await getUserByAccessToken(accessToken) : null;

  // 토큰이 만료돼 사용자를 못 찾으면 기존에 연결된 계정은 그대로 둔다.
  const { error } = await getSupabaseAdmin().from("push_devices").upsert(
    {
      token,
      environment,
      news_enabled: newsEnabled,
      ...(user ? { user_id: user.id } : {}),
      platform: "ios",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
