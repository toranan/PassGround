"use client";

import type { SVGProps } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type SocialProvider = "kakao" | "naver" | "google";

type SocialAuthButtonsProps = {
  redirectTo?: string;
  className?: string;
};

function KakaoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 4.2C7.03 4.2 3 7.32 3 11.18c0 2.56 1.77 4.8 4.41 6.01l-.87 3.32a.45.45 0 0 0 .67.5l3.95-2.63c.28.03.56.05.84.05 4.97 0 9-3.12 9-6.98S16.97 4.2 12 4.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function NaverIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6 5.25v13.5h4.5v-6.68l4.72 6.68H19V5.25h-4.5v6.68L9.78 5.25H6Z"
        fill="currentColor"
      />
    </svg>
  );
}

function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M21.58 12.22c0-.7-.06-1.2-.19-1.73H12v3.23h5.51c-.11.8-.7 2.01-2 2.82l-.02.11 2.64 2.01.18.02c1.64-1.48 2.58-3.66 2.58-6.46Z"
        fill="#4285F4"
      />
      <path
        d="M12 21.9c2.7 0 4.96-.87 6.62-2.36l-3.15-2.4c-.84.57-1.97.98-3.47.98-2.64 0-4.87-1.72-5.66-4.1l-.11.01-2.75 2.08-.04.1C5.09 19.46 8.29 21.9 12 21.9Z"
        fill="#34A853"
      />
      <path
        d="M6.34 14.02a5.74 5.74 0 0 1-.33-1.9c0-.66.12-1.3.31-1.9l-.01-.13-2.79-2.12-.09.04A9.72 9.72 0 0 0 2.4 12.1c0 1.45.35 2.83.97 4.05l2.97-2.13Z"
        fill="#FBBC05"
      />
      <path
        d="M12 6.06c1.89 0 3.16.8 3.88 1.46l2.84-2.72C16.95 3.18 14.7 2.3 12 2.3c-3.71 0-6.91 2.44-8.57 5.95l2.89 2.21C7.13 7.78 9.36 6.06 12 6.06Z"
        fill="#EA4335"
      />
    </svg>
  );
}

const PROVIDERS: {
  id: SocialProvider;
  label: string;
  shortLabel: string;
  icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
  brandClass: string;
}[] = [
  {
    id: "kakao",
    label: "카카오로 시작하기",
    shortLabel: "카카오",
    icon: KakaoIcon,
    brandClass: "bg-[#FEE500] text-black hover:bg-[#f9de00] border-[#FEE500]",
  },
  {
    id: "naver",
    label: "네이버로 시작하기",
    shortLabel: "네이버",
    icon: NaverIcon,
    brandClass: "bg-[#03C75A] text-white hover:bg-[#02b552] border-[#03C75A]",
  },
  {
    id: "google",
    label: "구글로 시작하기",
    shortLabel: "구글",
    icon: GoogleIcon,
    brandClass: "bg-white text-gray-800 hover:bg-gray-50 border-gray-300",
  },
];

function normalizeNextPath(value?: string): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

export function SocialAuthButtons({ redirectTo = "/", className }: SocialAuthButtonsProps) {
  const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(null);

  const handleStart = (provider: SocialProvider) => {
    setPendingProvider(provider);
    const nextPath = normalizeNextPath(redirectTo);
    const url = `/api/auth/oauth/start?provider=${provider}&next=${encodeURIComponent(nextPath)}`;
    window.location.assign(url);
  };

  return (
    <div className={className}>
      <div className="grid grid-cols-3 gap-4">
        {PROVIDERS.map((provider) => {
          const Icon = provider.icon;
          return (
            <div key={provider.id} className="flex flex-col items-center gap-2">
            <Button
              type="button"
              aria-label={provider.label}
              variant="outline"
              className={`h-14 w-14 rounded-full border p-0 ${provider.brandClass}`}
              onClick={() => handleStart(provider.id)}
              disabled={pendingProvider !== null}
            >
              {pendingProvider === provider.id ? (
                <span className="text-sm font-semibold">...</span>
              ) : (
                <Icon className="h-6 w-6" />
              )}
            </Button>
            <span className="text-xs font-medium text-gray-600">{provider.shortLabel}</span>
          </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground text-center">
        소셜 계정으로 1초 시작
      </p>
    </div>
  );
}
