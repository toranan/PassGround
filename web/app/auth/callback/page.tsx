"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function parseHashParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

function normalizeNextPath(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("소셜 로그인 처리 중입니다...");
  const [isError, setIsError] = useState(false);

  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get("next")),
    [searchParams]
  );

  useEffect(() => {
    const run = async () => {
      const hashParams = parseHashParams();
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const expiresAt = hashParams.get("expires_at");
      const errorDescription = hashParams.get("error_description");

      if (errorDescription) {
        setIsError(true);
        setMessage(decodeURIComponent(errorDescription));
        return;
      }

      if (!accessToken) {
        setIsError(true);
        setMessage("소셜 로그인 토큰을 확인할 수 없습니다. 다시 시도해 주세요.");
        return;
      }

      try {
        const res = await fetch("/api/auth/oauth/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken,
            refreshToken,
            expiresAt,
          }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.ok || !data?.user) {
          setIsError(true);
          setMessage(data?.error ?? "소셜 로그인 처리에 실패했습니다.");
          return;
        }

        if (data.session?.access_token) {
          localStorage.setItem("access_token", data.session.access_token);
        }
        if (data.session?.refresh_token) {
          localStorage.setItem("refresh_token", data.session.refresh_token);
        }
        localStorage.setItem("user", JSON.stringify(data.user));

        setMessage("로그인 성공! 이동 중입니다...");
        router.replace(nextPath);
      } catch {
        setIsError(true);
        setMessage("소셜 로그인 처리 중 오류가 발생했습니다.");
      }
    };

    run();
  }, [router, nextPath]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.08),transparent_60%)]">
          <div className="container mx-auto px-4 py-12">
            <div className="max-w-md mx-auto">
              <Card className="border-none shadow-lg">
                <CardHeader>
                  <CardTitle className="text-xl">소셜 로그인</CardTitle>
                  <CardDescription>인증 상태를 확인하고 있습니다.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className={`text-sm ${isError ? "text-red-600" : "text-emerald-700"}`}>
                    {message}
                  </p>
                  {isError && (
                    <div className="text-xs text-muted-foreground">
                      <Link href="/signup" className="text-emerald-700 hover:underline">
                        회원가입 페이지로 돌아가기
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
