"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [showConsultationModal, setShowConsultationModal] = useState(false);
  const [consultationPhone, setConsultationPhone] = useState("");
  const [consultationPending, setConsultationPending] = useState(false);
  const [consultationError, setConsultationError] = useState("");
  const [consultationSuccess, setConsultationSuccess] = useState("");
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

  const handleOpenConsultationModal = () => {
    setConsultationPhone("");
    setConsultationError("");
    setConsultationSuccess("");
    setShowConsultationModal(true);
  };

  const handleSubmitConsultation = async () => {
    if (consultationPending) return;

    const phoneNumber = consultationPhone.trim();
    if (!phoneNumber) {
      setConsultationError("전화번호를 입력해 주세요.");
      return;
    }

    try {
      setConsultationPending(true);
      setConsultationError("");
      setConsultationSuccess("");

      const token = localStorage.getItem("access_token") ?? "";
      const response = await fetch("/api/consultation/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          phoneNumber,
          sourcePath: typeof window !== "undefined" ? window.location.pathname : "/",
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "상담 신청 접수에 실패했습니다.");
      }

      setConsultationPhone("");
      setConsultationSuccess(payload.message || "상담 신청이 접수되었습니다.");
    } catch (caught) {
      setConsultationError(
        caught instanceof Error ? caught.message : "상담 신청 중 오류가 발생했습니다."
      );
    } finally {
      setConsultationPending(false);
    }
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
    <>
      <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9 px-3 text-xs sm:text-sm"
              onClick={handleOpenConsultationModal}
            >
              상담 신청하기
            </Button>
            <Link href="/" className="flex min-w-0 items-center space-x-2">
              <GraduationCap className="h-8 w-8 flex-shrink-0 text-primary" />
              <span className="truncate font-bold text-xl tracking-tight">합격판</span>
            </Link>
          </div>

          <div className="hidden items-center space-x-5 text-sm font-medium lg:flex">
            <Link href="/transfer/ai" className="transition-colors hover:text-primary">
              AI 상담
            </Link>
            <Link href="/community" className="transition-colors hover:text-primary">
              커뮤니티
            </Link>
            <Link href="/transfer/data-center" className="transition-colors hover:text-primary">
              커트라인
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
                <span className="hidden text-sm font-medium text-primary sm:inline">
                  {user.nickname || user.username}님
                </span>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="mr-1 h-4 w-4" />
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

      {showConsultationModal ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4"
          onClick={() => setShowConsultationModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-base font-semibold">상담 신청하기</p>
            <p className="mt-2 text-sm text-muted-foreground">
              전화번호를 남겨주시면 확인 후 연락드리겠습니다.
            </p>

            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSubmitConsultation();
              }}
            >
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="전화번호를 입력하세요"
                value={consultationPhone}
                onChange={(event) => setConsultationPhone(event.target.value)}
                disabled={consultationPending}
              />
              {consultationError ? (
                <p className="text-sm text-red-600">{consultationError}</p>
              ) : null}
              {consultationSuccess ? (
                <p className="text-sm text-primary">{consultationSuccess}</p>
              ) : null}
              <div className="mt-4 flex gap-2">
                <Button
                  type="submit"
                  className="bg-primary hover:bg-primary/90"
                  disabled={consultationPending}
                >
                  {consultationPending ? "접수 중..." : "신청 보내기"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowConsultationModal(false)}
                  disabled={consultationPending}
                >
                  닫기
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
