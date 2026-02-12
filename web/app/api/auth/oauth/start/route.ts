import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ENABLE_SOCIAL_AUTH } from "@/lib/featureFlags";
import { getSiteUrl } from "@/lib/siteUrl";

type SocialProvider = "kakao" | "naver" | "google";
type SupportedOAuthProvider = Exclude<SocialProvider, "naver">;

function parseProvider(value: string | null): SocialProvider | null {
  if (value === "kakao" || value === "naver" || value === "google") {
    return value;
  }
  return null;
}

function normalizeNextPath(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appOrigin = getSiteUrl();

  if (!ENABLE_SOCIAL_AUTH) {
    return NextResponse.redirect(new URL("/signup?error=social_disabled", appOrigin));
  }

  const provider = parseProvider(url.searchParams.get("provider"));
  const nextPath = normalizeNextPath(url.searchParams.get("next"));

  if (!provider) {
    return NextResponse.redirect(new URL("/signup?error=invalid_provider", appOrigin));
  }

  if (provider === "naver") {
    return NextResponse.redirect(new URL("/signup?error=provider_not_enabled", appOrigin));
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL("/signup?error=server_config", appOrigin));
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const callbackUrl = new URL("/auth/callback", appOrigin);
  callbackUrl.searchParams.set("next", nextPath);

  const oauthProvider: SupportedOAuthProvider = provider;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: oauthProvider,
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(new URL("/signup?error=oauth_start_failed", appOrigin));
  }

  return NextResponse.redirect(data.url);
}
