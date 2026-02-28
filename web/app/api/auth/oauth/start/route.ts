import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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

function parseMobileFlag(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function normalizeAppRedirect(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "hapgyeokpan:") {
      return null;
    }
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return null;
  }
}

function getAppOrigin(request: Request): string {
  try {
    return new URL(request.url).origin;
  } catch {
    return getSiteUrl();
  }
}

function redirectWithError(
  appOrigin: string,
  message: string,
  isMobile: boolean,
  mobileRedirect: string | null
) {
  if (isMobile && mobileRedirect) {
    return NextResponse.redirect(`${mobileRedirect}?error=${encodeURIComponent(message)}`);
  }
  return NextResponse.redirect(new URL(`/signup?error=${encodeURIComponent(message)}`, appOrigin));
}

function resolveOAuthScopes(provider: SupportedOAuthProvider): string | undefined {
  if (provider === "kakao") {
    const fromEnv = process.env.KAKAO_OAUTH_SCOPE?.trim();
    return fromEnv || "profile_nickname";
  }
  return undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appOrigin = getAppOrigin(request);
  const isMobile = parseMobileFlag(url.searchParams.get("mobile"));
  const mobileRedirect = normalizeAppRedirect(url.searchParams.get("app_redirect"));

  if (!ENABLE_SOCIAL_AUTH) {
    return redirectWithError(appOrigin, "social_disabled", isMobile, mobileRedirect);
  }

  const provider = parseProvider(url.searchParams.get("provider"));
  const nextPath = normalizeNextPath(url.searchParams.get("next"));

  if (!provider) {
    return redirectWithError(appOrigin, "invalid_provider", isMobile, mobileRedirect);
  }

  if (provider === "naver") {
    return redirectWithError(appOrigin, "provider_not_enabled", isMobile, mobileRedirect);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return redirectWithError(appOrigin, "server_config", isMobile, mobileRedirect);
  }

  const cookieStore = await cookies();
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: "pkce",
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      storage: {
        getItem: (key) => cookieStore.get(key)?.value ?? null,
        setItem: (key, value) => {
          cookieStore.set(key, value, { path: "/", maxAge: 60 * 10, sameSite: "lax", secure: true });
        },
        removeItem: (key) => {
          cookieStore.delete(key);
        },
      },
    },
  });

  const callbackPath = isMobile ? "/auth/mobile-callback" : "/auth/callback";
  const callbackUrl = new URL(callbackPath, appOrigin);
  callbackUrl.searchParams.set("next", nextPath);
  if (isMobile) {
    if (!mobileRedirect) {
      return redirectWithError(appOrigin, "invalid_mobile_redirect", isMobile, mobileRedirect);
    }
    callbackUrl.searchParams.set("app_redirect", mobileRedirect);
  }

  const oauthProvider: SupportedOAuthProvider = provider;
  const scopes = resolveOAuthScopes(oauthProvider);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: oauthProvider,
    options: {
      redirectTo: callbackUrl.toString(),
      ...(scopes ? { scopes } : {}),
    },
  });

  if (error || !data?.url) {
    const message = error?.message?.trim() || "oauth_start_failed";
    return redirectWithError(appOrigin, message, isMobile, mobileRedirect);
  }

  return NextResponse.redirect(data.url);
}
