import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

function pickFirst(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeNextPath(value: string): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

function normalizeAppRedirect(value: string): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "hapgyeokpan:") return null;
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return null;
  }
}

function buildDeepLink(base: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export default async function MobileAuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolved = await searchParams;
  const next = normalizeNextPath(pickFirst(resolved.next));
  const appRedirect = normalizeAppRedirect(pickFirst(resolved.app_redirect));

  if (!appRedirect) {
    redirect(`/signup?error=invalid_mobile_redirect&next=${encodeURIComponent(next)}`);
  }

  const code = pickFirst(resolved.code);
  const errorDescription =
    pickFirst(resolved.error_description) || pickFirst(resolved.error) || "oauth_failed";

  const params = new URLSearchParams();
  params.set("next", next);

  if (code) {
    params.set("code", code);
  } else {
    params.set("error", errorDescription);
  }

  redirect(buildDeepLink(appRedirect, params));
}
