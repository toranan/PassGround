"use client";

const AUTH_CHANGE_EVENT = "auth-change";

type StoredUser = {
  id?: string;
  username?: string;
  nickname?: string;
  email?: string;
} | null;

let cachedRawUser: string | null | undefined;
let cachedParsedUser: StoredUser = null;

function parseStoredUser(raw: string | null): StoredUser {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredUser;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getUserSnapshot(): StoredUser {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("user");
  if (raw === cachedRawUser) {
    return cachedParsedUser;
  }

  cachedRawUser = raw;
  cachedParsedUser = parseStoredUser(raw);
  return cachedParsedUser;
}

export function getIsMemberSnapshot(): boolean {
  const user = getUserSnapshot();
  return Boolean(user?.id || user?.username || user?.nickname);
}

export function subscribeAuthChange(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key === "user" || event.key === "access_token" || event.key === "refresh_token") {
      callback();
    }
  };
  const onAuthChange = () => callback();

  window.addEventListener("storage", onStorage);
  window.addEventListener(AUTH_CHANGE_EVENT, onAuthChange);
  window.addEventListener("focus", onAuthChange);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(AUTH_CHANGE_EVENT, onAuthChange);
    window.removeEventListener("focus", onAuthChange);
  };
}

export function emitAuthChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("access_token") ?? "";
}

export function getRefreshToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("refresh_token") ?? "";
}

function getTokenExpMs(token: string): number | null {
  try {
    if (typeof window === "undefined") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = window.atob(padded);
    const parsed = JSON.parse(decoded) as { exp?: unknown };
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) return null;
    return parsed.exp * 1000;
  } catch {
    return null;
  }
}

export function isTokenExpiredSoon(token: string, thresholdMs = 60_000): boolean {
  const expMs = getTokenExpMs(token);
  if (!expMs) return false;
  return Date.now() + thresholdMs >= expMs;
}

let refreshAccessTokenPromise: Promise<string> | null = null;

export async function refreshAccessTokenIfPossible(): Promise<string> {
  if (typeof window === "undefined") return "";
  if (refreshAccessTokenPromise) return refreshAccessTokenPromise;

  refreshAccessTokenPromise = refreshAccessToken();
  try {
    return await refreshAccessTokenPromise;
  } finally {
    refreshAccessTokenPromise = null;
  }
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return "";

  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const payload = (await res.json().catch(() => null)) as
    | {
        ok?: boolean;
        user?: { id?: string; email?: string; username?: string; nickname?: string };
        session?: { access_token?: string; refresh_token?: string };
      }
    | null;

  if (!res.ok || !payload?.ok || !payload.session?.access_token) {
    return "";
  }

  window.localStorage.setItem("access_token", payload.session.access_token);
  if (payload.session.refresh_token) {
    window.localStorage.setItem("refresh_token", payload.session.refresh_token);
  }
  if (payload.user) {
    window.localStorage.setItem("user", JSON.stringify(payload.user));
  }
  emitAuthChange();
  return payload.session.access_token;
}

export async function resolveUsableAccessToken(forceRefresh = false): Promise<string> {
  const token = getAccessToken();
  if (!forceRefresh && token && !isTokenExpiredSoon(token)) return token;
  const refreshed = await refreshAccessTokenIfPossible();
  return refreshed || token;
}
