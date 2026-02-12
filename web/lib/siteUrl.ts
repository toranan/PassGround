const DEFAULT_SITE_URL = "https://hapgyeokpan.kr";

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const base = raw && raw.length > 0 ? raw : DEFAULT_SITE_URL;
  const normalized =
    base.startsWith("http://") || base.startsWith("https://") ? base : `https://${base}`;

  try {
    return new URL(normalized).origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function getSiteUrlObject(): URL {
  return new URL(getSiteUrl());
}
