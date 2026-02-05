"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleLogin = async () => {
    setMessage("");
    if (!username.trim() || !password) {
      setMessage("아이디와 비밀번호를 입력해 주세요.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data?.error ?? "로그인에 실패했습니다.");
        return;
      }

      // Store session in localStorage
      if (data.session) {
        localStorage.setItem("access_token", data.session.access_token);
        localStorage.setItem("refresh_token", data.session.refresh_token);
        localStorage.setItem("user", JSON.stringify(data.user));
      }

      setMessage("로그인 성공!");
      router.push("/");
    } catch {
      setMessage("로그인 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.08),transparent_60%)]">
          <div className="container mx-auto px-4 py-8">
            <div className="max-w-md mx-auto">
              <Card className="border-none shadow-lg">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl">로그인</CardTitle>
                  <CardDescription>아이디와 비밀번호로 로그인하세요.</CardDescription>
                </CardHeader>
                <div className="px-6 pb-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">아이디</label>
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="아이디"
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">비밀번호</label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="비밀번호"
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    />
                  </div>
                  {message && (
                    <div className={`text-xs ${message.includes("성공") ? "text-emerald-700" : "text-red-500"}`}>
                      {message}
                    </div>
                  )}
                  <Button
                    className="w-full h-11 bg-emerald-700 hover:bg-emerald-800"
                    onClick={handleLogin}
                    disabled={isLoading}
                  >
                    {isLoading ? "로그인 중..." : "로그인"}
                  </Button>
                  <div className="text-xs text-muted-foreground text-center">
                    계정이 없나요?{" "}
                    <Link href="/signup" className="text-emerald-700 hover:underline">
                      회원가입
                    </Link>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
