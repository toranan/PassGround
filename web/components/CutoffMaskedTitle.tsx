"use client";

import { useSyncExternalStore } from "react";

type CutoffMaskedTitleProps = {
  title: string;
  shouldMaskForGuest: boolean;
};

function isLoggedInClient(): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem("user");
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { id?: string; username?: string; nickname?: string };
    return Boolean(parsed?.id || parsed?.username || parsed?.nickname);
  } catch {
    return false;
  }
}

function maskNumericTokens(text: string): string {
  return text.replace(/[0-9]+(?:\.[0-9]+)?/g, "??");
}

export function CutoffMaskedTitle({ title, shouldMaskForGuest }: CutoffMaskedTitleProps) {
  const isMember = useSyncExternalStore(
    () => () => {},
    () => isLoggedInClient(),
    () => false
  );

  if (!shouldMaskForGuest) {
    return <>{title}</>;
  }

  return <>{isMember ? title : maskNumericTokens(title)}</>;
}
