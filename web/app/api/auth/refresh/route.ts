import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type ProfileRow = {
  username: string | null;
  display_name: string | null;
};

function sanitizeUsername(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (normalized.length >= 3) return normalized.slice(0, 24);
  return "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const refreshToken =
      typeof body.refreshToken === "string" ? body.refreshToken.trim() : "";

    if (!refreshToken) {
      return NextResponse.json({ error: "리프레시 토큰이 없습니다." }, { status: 400 });
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

    const { data, error } = await anon.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session || !data.user) {
      return NextResponse.json({ error: "세션 갱신에 실패했습니다." }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("username,display_name")
      .eq("id", data.user.id)
      .maybeSingle<ProfileRow>();

    const fallbackUsername =
      sanitizeUsername(data.user.email?.split("@")[0] ?? "") ||
      `user_${data.user.id.replace(/-/g, "").slice(0, 8)}`;
    const username = profile?.username?.trim() || fallbackUsername;
    const nickname = profile?.display_name?.trim() || username;

    return NextResponse.json({
      ok: true,
      user: {
        id: data.user.id,
        email: data.user.email ?? "",
        username,
        nickname,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서버 오류" },
      { status: 500 }
    );
  }
}
