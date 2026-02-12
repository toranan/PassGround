import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ENABLE_SOCIAL_AUTH } from "@/lib/featureFlags";

type SocialProvider = "kakao" | "naver" | "google";

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

  if (!ENABLE_SOCIAL_AUTH) {
    return NextResponse.redirect(new URL("/signup?error=social_disabled", url.origin));
  }

  const provider = parseProvider(url.searchParams.get("provider"));
  const nextPath = normalizeNextPath(url.searchParams.get("next"));

  if (!provider) {
    return NextResponse.redirect(new URL("/signup?error=invalid_provider", url.origin));
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL("/signup?error=server_config", url.origin));
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const callbackUrl = new URL("/auth/callback", url.origin);
  callbackUrl.searchParams.set("next", nextPath);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(new URL("/signup?error=oauth_start_failed", url.origin));
  }

  return NextResponse.redirect(data.url);
}
