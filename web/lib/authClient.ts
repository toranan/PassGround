"use client";

const AUTH_CHANGE_EVENT = "auth-change";

type StoredUser = {
  id?: string;
  username?: string;
  nickname?: string;
  email?: string;
} | null;

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
  return parseStoredUser(window.localStorage.getItem("user"));
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
