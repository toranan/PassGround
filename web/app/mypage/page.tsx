"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { emitAuthChange, getUserSnapshot, subscribeAuthChange } from "@/lib/authClient";

type User = {
  id?: string;
  username?: string;
  nickname?: string;
  email?: string;
};

type LedgerItem = {
  id: string;
  source: string;
  amount: number;
  created_at: string;
  meta: Record<string, unknown> | null;
};

type PointResponse = {
  ok: boolean;
  ownerName: string;
  points: number;
  verificationLevel: string;
  ledger: LedgerItem[];
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR");
}

export default function MyPage() {
  const user = useSyncExternalStore(
    subscribeAuthChange,
    () => getUserSnapshot() as User | null,
    () => null
  );

  const [nicknameInput, setNicknameInput] = useState("");
  const [nicknameMessage, setNicknameMessage] = useState("");
  const [nicknameError, setNicknameError] = useState(false);
  const [isSavingNickname, setIsSavingNickname] = useState(false);

  const [pointsData, setPointsData] = useState<PointResponse | null>(null);
  const [pointsError, setPointsError] = useState("");

  const identity = useMemo(() => {
    if (!user) return "";
    return user.nickname || user.username || "";
  }, [user]);

  useEffect(() => {
    setNicknameInput(identity);
  }, [identity]);

  const loadPoints = useCallback(async () => {
    if (!user) {
      setPointsData(null);
      setPointsError("");
      return;
    }

    const query = new URLSearchParams();
    if (user.id) query.set("userId", user.id);
    if (identity) query.set("nickname", identity);

    try {
      const res = await fetch(`/api/points/me?${query.toString()}`);
      const payload = (await res.json().catch(() => null)) as PointResponse | { error?: string } | null;
      if (!res.ok || !payload || !("ok" in payload)) {
        setPointsError((payload && "error" in payload && payload.error) || "포인트 조회에 실패했습니다.");
        setPointsData(null);
        return;
      }

      setPointsData(payload);
      setPointsError("");
    } catch {
      setPointsError("포인트 조회 중 오류가 발생했습니다.");
      setPointsData(null);
    }
  }, [identity, user]);

  useEffect(() => {
    void loadPoints();
  }, [loadPoints]);

  const handleSaveNickname = async () => {
    if (!user?.id) {
      setNicknameError(true);
      setNicknameMessage("로그인 후 닉네임을 설정할 수 있습니다.");
      return;
    }

    const nickname = nicknameInput.trim();
    if (nickname.length < 2) {
      setNicknameError(true);
      setNicknameMessage("닉네임은 2자 이상이어야 합니다.");
      return;
    }

    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      setNicknameError(true);
      setNicknameMessage("로그인이 만료되었습니다. 다시 로그인해 주세요.");
      return;
    }

    setIsSavingNickname(true);
    setNicknameMessage("");

    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          userId: user.id,
          nickname,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok: true; user: { id: string; username: string; nickname: string } }
        | { error?: string }
        | null;

      if (!res.ok || !data || !("ok" in data)) {
        setNicknameError(true);
        setNicknameMessage((data && "error" in data && data.error) || "닉네임 저장에 실패했습니다.");
        return;
      }

      const nextUser: User = {
        ...user,
        id: data.user.id,
        username: data.user.username || user.username,
        nickname: data.user.nickname,
      };
      localStorage.setItem("user", JSON.stringify(nextUser));
      emitAuthChange();

      setNicknameError(false);
      setNicknameMessage("닉네임이 저장되었습니다.");
      await loadPoints();
    } catch {
      setNicknameError(true);
      setNicknameMessage("닉네임 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSavingNickname(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.08),transparent_60%)]">
          <div className="container mx-auto px-4 py-8 md:py-10">
            <h1 className="font-display text-3xl font-bold">마이페이지</h1>
            <p className="text-sm text-muted-foreground mt-2">
              닉네임을 설정하고, 포인트 적립 내역을 확인할 수 있습니다.
            </p>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4 space-y-6">
            {!user ? (
              <Card className="border-none shadow-lg">
                <CardContent className="py-8 space-y-4">
                  <p className="text-sm text-gray-600">마이페이지 이용을 위해 로그인해 주세요.</p>
                  <Button asChild>
                    <Link href="/signup">회원가입</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-lg">닉네임 설정</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        value={nicknameInput}
                        onChange={(e) => setNicknameInput(e.target.value)}
                        placeholder="닉네임 입력"
                        maxLength={20}
                      />
                      <Button
                        type="button"
                        onClick={handleSaveNickname}
                        disabled={isSavingNickname}
                        className="bg-primary hover:bg-primary/90"
                      >
                        {isSavingNickname ? "저장 중..." : "닉네임 저장"}
                      </Button>
                    </div>
                    <p className={`text-sm ${nicknameError ? "text-red-600" : "text-primary"}`}>
                      {nicknameMessage || "한글/영문/숫자/_/공백, 2~20자"}
                    </p>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-none shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-sm">보유 포인트</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-primary">
                        {pointsData ? `${pointsData.points.toLocaleString()}P` : "-"}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-none shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-sm">회원</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl font-semibold">{identity || "-"}</p>
                    </CardContent>
                  </Card>

                  <Card className="border-none shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-sm">인증 상태</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl font-semibold">{pointsData?.verificationLevel ?? "-"}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-lg">포인트 내역</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {pointsError ? (
                      <p className="text-sm text-red-600">{pointsError}</p>
                    ) : pointsData?.ledger?.length ? (
                      <div className="divide-y">
                        {pointsData.ledger.map((item) => (
                          <div key={item.id} className="py-3 flex items-center justify-between gap-4">
                            <div>
                              <p className="text-sm font-medium">{item.source}</p>
                              <p className="text-xs text-gray-500">{formatDate(item.created_at)}</p>
                            </div>
                            <p className={`text-sm font-semibold ${item.amount >= 0 ? "text-primary" : "text-red-600"}`}>
                              {item.amount >= 0 ? "+" : ""}
                              {item.amount}P
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">아직 적립 내역이 없습니다.</p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
