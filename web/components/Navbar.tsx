"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";
import { RouteDropdown } from "@/components/RouteDropdown";
import { Button } from "@/components/ui/button";
import { emitAuthChange, getUserSnapshot, subscribeAuthChange } from "@/lib/authClient";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { GraduationCap, LogOut } from "lucide-react";

interface User {
  id: string;
  email: string;
  username: string;
  nickname?: string;
}

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useSyncExternalStore(
    subscribeAuthChange,
    () => getUserSnapshot() as User | null,
    () => null
  );

  const serviceValue = useMemo(() => {
    if (
      pathname.startsWith("/cpa") ||
      pathname.startsWith("/community/cpa") ||
      pathname.startsWith("/c/cpa")
    ) {
      return "cpa";
    }
    return "transfer";
  }, [pathname]);

  const serviceOptions = useMemo(() => {
    const options = [
      { key: "transfer", label: "편입", href: "/transfer" },
    ];
    if (ENABLE_CPA) {
      options.push({ key: "cpa", label: "CPA", href: "/cpa" });
    }
    return options;
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    emitAuthChange();
    router.push("/");
  };

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center space-x-2 flex-shrink-0">
          <GraduationCap className="h-8 w-8 text-primary" />
          <span className="font-bold text-xl tracking-tight">합격판</span>
        </Link>

        <div className="hidden lg:flex items-center space-x-5 text-sm font-medium">
          <Link href="/community" className="transition-colors hover:text-primary">
            커뮤니티
          </Link>
          <Link href="/mypage" className="transition-colors hover:text-primary">
            마이페이지
          </Link>
          <Link href="/verification" className="transition-colors hover:text-primary">
            인증
          </Link>
        </div>

        <div className="flex items-center space-x-4">
          <div className="hidden md:flex items-center">
            <RouteDropdown
              value={serviceValue}
              options={serviceOptions}
              ariaLabel="서비스 선택"
            />
          </div>
          {user ? (
            <>
              <span className="text-sm font-medium text-primary">
                {user.nickname || user.username}님
              </span>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-1" />
                로그아웃
              </Button>
            </>
          ) : (
            <Button size="sm" asChild>
              <Link href="/signup">회원가입</Link>
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
