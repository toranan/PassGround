"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { emitAuthChange, getUserSnapshot, subscribeAuthChange } from "@/lib/authClient";
import { GraduationCap, LogOut } from "lucide-react";

interface User {
  id: string;
  email: string;
  username: string;
  nickname?: string;
}

type AdminMeResponse = {
  ok: boolean;
  isAdmin: boolean;
};

export function Navbar() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const user = useSyncExternalStore(
    subscribeAuthChange,
    () => getUserSnapshot() as User | null,
    () => null
  );

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    emitAuthChange();
    router.push("/");
  };

  useEffect(() => {
    let cancelled = false;
    const userId = user?.id ?? "";
    const token = localStorage.getItem("access_token") ?? "";

    const checkAdmin = async () => {
      if (!userId || !token) {
        if (!cancelled) {
          setIsAdmin(false);
        }
        return;
      }

      try {
        const res = await fetch("/api/admin/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });
        const payload = (await res.json().catch(() => null)) as AdminMeResponse | null;
        if (cancelled) return;
        setIsAdmin(Boolean(res.ok && payload?.ok && payload?.isAdmin));
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
        }
      }
    };

    void checkAdmin();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
          <Link href="/transfer/data-center" className="transition-colors hover:text-primary">
            데이터센터
          </Link>
          <Link href="/transfer/ai" className="transition-colors hover:text-primary">
            AI 도우미
          </Link>
          <Link href="/mypage" className="transition-colors hover:text-primary">
            마이페이지
          </Link>
          <Link href="/verification" className="transition-colors hover:text-primary">
            인증
          </Link>
        </div>

        <div className="flex items-center space-x-4">
          {user ? (
            <>
              {isAdmin ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/admin">관리자페이지</Link>
                </Button>
              ) : null}
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
              <Link href="/signup">로그인</Link>
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
