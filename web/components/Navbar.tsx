"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GraduationCap, LogOut } from "lucide-react";

interface User {
  id: string;
  email: string;
  username: string;
  nickname?: string;
}

export function Navbar() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        setUser(null);
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    setUser(null);
    router.push("/login");
  };

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <GraduationCap className="h-8 w-8 text-primary" />
          <span className="font-bold text-xl tracking-tight">합격판</span>
        </Link>

        <div className="hidden md:flex items-center space-x-6 text-sm font-medium">
          <Link href="#" className="transition-colors hover:text-primary">
            시험 일정
          </Link>
          <Link href="/timer" className="transition-colors hover:text-primary">
            타이머
          </Link>
          <Link href="/community" className="transition-colors hover:text-primary">
            커뮤니티
          </Link>
        </div>

        <div className="flex items-center space-x-4">
          {mounted && user ? (
            <>
              <span className="text-sm font-medium text-emerald-700">
                {user.nickname || user.username}님
              </span>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-1" />
                로그아웃
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">로그인</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">회원가입</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
