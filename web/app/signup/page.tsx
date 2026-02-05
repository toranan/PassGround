"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [message, setMessage] = useState("");
  const isEmailValid = useMemo(() => email.trim().includes("@"), [email]);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "ok" | "taken">("idle");
  const [nicknameStatus, setNicknameStatus] = useState<"idle" | "checking" | "ok" | "taken">("idle");
  const [emailStatus, setEmailStatus] = useState<"idle" | "checking" | "ok" | "taken">("idle");

  const isFormValid = useMemo(() => {
    return (
      username.trim().length >= 3 &&
      nickname.trim().length >= 2 &&
      email.includes("@") &&
      password.length >= 6 &&
      password === passwordConfirm &&
      agreeTerms &&
      agreePrivacy
    );
  }, [username, nickname, email, password, passwordConfirm, agreeTerms, agreePrivacy]);

  const checkAvailability = async (
    payload: { username?: string; nickname?: string; email?: string }
  ) => {
    try {
      const res = await fetch("/api/auth/check-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          available: null,
          status: res.status,
          error: text || "응답 실패",
        };
      }
      let data: { available?: boolean; error?: string; stage?: string } | null = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!data || typeof data.available !== "boolean") {
        return {
          available: null,
          status: res.status,
          error: data?.error ?? "응답 파싱 실패",
        };
      }
      return { available: Boolean(data.available), status: 200, error: null };
    } catch (error) {
      return {
        available: null,
        status: 0,
        error: error instanceof Error ? error.message : "네트워크 오류",
      };
    }
  };

  useEffect(() => {
    const value = username.trim();
    if (value.length < 3) {
      setUsernameStatus("idle");
      return;
    }
    const timeout = setTimeout(async () => {
      setUsernameStatus("checking");
      try {
        const res = await fetch("/api/auth/check-availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: value }),
        });
        if (!res.ok) {
          setUsernameStatus("idle");
          return;
        }
        const data = await res.json();
        setUsernameStatus(data?.available ? "ok" : "taken");
      } catch {
        setUsernameStatus("idle");
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [username]);

  useEffect(() => {
    const value = nickname.trim();
    if (value.length < 2) {
      setNicknameStatus("idle");
      return;
    }
    const timeout = setTimeout(async () => {
      setNicknameStatus("checking");
      try {
        const res = await fetch("/api/auth/check-availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname: value }),
        });
        if (!res.ok) {
          setNicknameStatus("idle");
          return;
        }
        const data = await res.json();
        setNicknameStatus(data?.available ? "ok" : "taken");
      } catch {
        setNicknameStatus("idle");
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [nickname]);

  useEffect(() => {
    const value = email.trim();
    if (!value.includes("@")) {
      setEmailStatus("idle");
      return;
    }
    const timeout = setTimeout(async () => {
      setEmailStatus("checking");
      try {
        const res = await fetch("/api/auth/check-availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: value }),
        });
        if (!res.ok) {
          setEmailStatus("idle");
          return;
        }
        const data = await res.json();
        setEmailStatus(data?.available ? "ok" : "taken");
      } catch {
        setEmailStatus("idle");
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [email]);

  const handleSignup = async () => {
    setMessage("");
    if (!isFormValid) {
      setMessage("필수 정보를 모두 입력해 주세요.");
      return;
    }
    setIsSigningUp(true);
    try {
      setUsernameStatus("checking");
      setNicknameStatus("checking");
      setEmailStatus("checking");

      const [usernameRes, nicknameRes, emailRes] = await Promise.all([
        checkAvailability({ username }),
        checkAvailability({ nickname }),
        checkAvailability({ email }),
      ]);

      if (
        usernameRes.available === null ||
        nicknameRes.available === null ||
        emailRes.available === null
      ) {
        const parts = [
          usernameRes.available === null
            ? `아이디(${usernameRes.status}, ${usernameRes.error})`
            : null,
          nicknameRes.available === null
            ? `닉네임(${nicknameRes.status}, ${nicknameRes.error})`
            : null,
          emailRes.available === null
            ? `이메일(${emailRes.status}, ${emailRes.error})`
            : null,
        ].filter(Boolean);
        setMessage(
          `중복 확인 실패: ${parts.join(" / ")}`
        );
        console.error("check-availability errors", {
          usernameRes,
          nicknameRes,
          emailRes,
        });
        return;
      }

      setUsernameStatus(usernameRes.available ? "ok" : "taken");
      setNicknameStatus(nicknameRes.available ? "ok" : "taken");
      setEmailStatus(emailRes.available ? "ok" : "taken");

      if (!usernameRes.available || !nicknameRes.available || !emailRes.available) {
        setMessage("중복된 항목이 있습니다. 입력 정보를 확인해 주세요.");
        return;
      }

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          nickname,
          email,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error ?? "회원가입에 실패했습니다.");
        return;
      }
      setMessage("회원가입이 완료되었습니다. 로그인해 주세요.");
      router.push("/login");
    } catch {
      setMessage("회원가입 중 오류가 발생했습니다.");
    } finally {
      setIsSigningUp(false);
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
                  <CardTitle className="text-xl">회원가입</CardTitle>
                  <CardDescription>필수 정보만 빠르게 입력하세요.</CardDescription>
                </CardHeader>
                <div className="px-6 pb-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">아이디</label>
                    <div className="flex items-center gap-2">
                      <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="아이디" />
                      <StatusBadge status={usernameStatus} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">닉네임</label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder="닉네임"
                      />
                    </div>
                    <StatusLine
                      status={nicknameStatus}
                      checkingText="닉네임 확인중"
                      okText="사용 가능한 닉네임입니다."
                      takenText="이미 사용 중인 닉네임입니다."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">이메일 주소</label>
                    <div className="flex gap-2">
                      <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="이메일 주소" />
                    </div>
                    {!isEmailValid && email.length > 0 ? (
                      <div className="text-[11px] text-red-500">이메일을 올바르게 입력해 주세요.</div>
                    ) : null}
                    <StatusLine
                      status={emailStatus}
                      checkingText="이메일 확인중"
                      okText="사용 가능한 이메일입니다."
                      takenText="이미 사용 중인 이메일입니다."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">비밀번호</label>
                    <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="비밀번호" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">비밀번호 확인</label>
                    <Input value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} type="password" placeholder="비밀번호 확인" />
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={agreeTerms}
                        onChange={(e) => setAgreeTerms(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        <Link href="/terms" className="text-emerald-700 hover:underline">이용약관</Link>에 동의합니다. (필수)
                      </span>
                    </label>
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={agreePrivacy}
                        onChange={(e) => setAgreePrivacy(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        <Link href="/privacy" className="text-emerald-700 hover:underline">개인정보 처리방침</Link>에 동의합니다. (필수)
                      </span>
                    </label>
                  </div>
                  {message ? (
                    <div className="text-xs text-muted-foreground">{message}</div>
                  ) : null}
                  <Button
                    className="w-full h-11 bg-emerald-700 hover:bg-emerald-800"
                    onClick={handleSignup}
                    disabled={isSigningUp}
                  >
                    회원가입
                  </Button>
                  <div className="text-xs text-muted-foreground text-center">
                    이미 계정이 있나요?{" "}
                    <Link href="/login" className="text-emerald-700 hover:underline">
                      로그인
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

function StatusBadge({ status }: { status: "idle" | "checking" | "ok" | "taken" }) {
  if (status === "idle") return null;
  if (status === "checking") {
    return <span className="text-[11px] text-muted-foreground whitespace-nowrap">확인중</span>;
  }
  if (status === "ok") {
    return <span className="text-[11px] text-emerald-700 whitespace-nowrap">사용가능</span>;
  }
  return <span className="text-[11px] text-red-500 whitespace-nowrap">이미 사용중</span>;
}

function StatusLine({
  status,
  checkingText,
  okText,
  takenText,
}: {
  status: "idle" | "checking" | "ok" | "taken";
  checkingText: string;
  okText: string;
  takenText: string;
}) {
  if (status === "idle") return null;
  if (status === "checking") {
    return <div className="text-[11px] text-muted-foreground">{checkingText}</div>;
  }
  if (status === "ok") {
    return <div className="text-[11px] text-emerald-700">{okText}</div>;
  }
  return <div className="text-[11px] text-red-500">{takenText}</div>;
}
