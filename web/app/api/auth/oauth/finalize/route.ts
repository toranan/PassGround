import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
};

function sanitizeUsername(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (normalized.length >= 3) return normalized.slice(0, 24);
  return "";
}

async function findAvailableUsername(baseValue: string, userId: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const base = sanitizeUsername(baseValue) || `user_${userId.slice(0, 8)}`;

  for (let index = 0; index < 50; index += 1) {
    const candidate = index === 0 ? base : `${base.slice(0, 20)}_${index}`;
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .eq("username", candidate)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (error) {
      continue;
    }
    if (!data || data.id === userId) {
      return candidate;
    }
  }

  return `user_${userId.replace(/-/g, "").slice(0, 12)}`;
}

function buildDisplayName(
  metadata: Record<string, unknown>,
  email: string | undefined,
  fallbackUsername: string
): string {
  const fromMeta = [
    metadata.nickname,
    metadata.name,
    metadata.full_name,
    metadata.user_name,
  ].find((value) => typeof value === "string" && value.trim().length > 0);

  if (typeof fromMeta === "string") return fromMeta.trim().slice(0, 30);
  if (email) return email.split("@")[0].slice(0, 30);
  return fallbackUsername.slice(0, 30);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const accessToken =
      typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    const refreshToken =
      typeof body.refreshToken === "string" ? body.refreshToken.trim() : "";
    const expiresAt =
      typeof body.expiresAt === "number"
        ? body.expiresAt
        : typeof body.expiresAt === "string"
          ? Number(body.expiresAt)
          : null;

    if (!accessToken) {
      return NextResponse.json({ error: "토큰이 없습니다." }, { status: 400 });
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

    const { data: userData, error: userError } = await anon.auth.getUser(accessToken);
    const user = userData.user;

    if (userError || !user) {
      return NextResponse.json({ error: "소셜 인증 사용자 확인 실패" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id,username,display_name")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const provider =
      typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : "social";

    const usernameSeed =
      (typeof metadata.preferred_username === "string" && metadata.preferred_username) ||
      (user.email ? user.email.split("@")[0] : "") ||
      `${provider}_${user.id.slice(0, 8)}`;

    const finalUsername =
      existingProfile?.username && existingProfile.username.length >= 3
        ? existingProfile.username
        : await findAvailableUsername(usernameSeed, user.id);

    const finalDisplayName =
      existingProfile?.display_name && existingProfile.display_name.trim().length >= 2
        ? existingProfile.display_name
        : buildDisplayName(metadata, user.email, finalUsername);

    const { error: profileError } = await admin.from("profiles").upsert({
      id: user.id,
      username: finalUsername,
      display_name: finalDisplayName,
    });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email ?? "",
        username: finalUsername,
        nickname: finalDisplayName,
      },
      session: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: Number.isFinite(expiresAt) ? Number(expiresAt) : null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서버 오류" },
      { status: 500 }
    );
  }
}
