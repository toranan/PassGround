"use client";

import { useSyncExternalStore } from "react";
import { getIsMemberSnapshot, subscribeAuthChange } from "@/lib/authClient";

type CutoffMaskedTitleProps = {
  title: string;
  shouldMaskForGuest: boolean;
};

function maskNumericTokens(text: string): string {
  return text.replace(/[0-9]+(?:\.[0-9]+)?/g, "??");
}

export function CutoffMaskedTitle({ title, shouldMaskForGuest }: CutoffMaskedTitleProps) {
  const isMember = useSyncExternalStore(
    subscribeAuthChange,
    getIsMemberSnapshot,
    () => false
  );

  if (!shouldMaskForGuest) {
    return <>{title}</>;
  }

  return <>{isMember ? title : maskNumericTokens(title)}</>;
}
