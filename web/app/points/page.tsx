"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type User = {
  id?: string;
  username?: string;
  nickname?: string;
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

function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;

  const stored = localStorage.getItem("user");
  if (!stored) return null;

  try {
    return JSON.parse(stored) as User;
  } catch {
    return null;
  }
}

export default function PointsPage() {
  const [user] = useState<User | null>(() => getStoredUser());
  const [data, setData] = useState<PointResponse | null>(null);
  const [error, setError] = useState("");

  const identity = useMemo(() => {
    if (!user) return "";
    return user.nickname || user.username || "";
  }, [user]);

  useEffect(() => {
    if (!identity) return;

    const query = new URLSearchParams();
    query.set("nickname", identity);
    if (user?.id) {
      query.set("userId", user.id);
    }

    fetch(`/api/points/me?${query.toString()}`)
      .then(async (res) => {
        const payload = (await res.json().catch(() => null)) as PointResponse | { error?: string } | null;
        if (!res.ok || !payload || !("ok" in payload)) {
          setError((payload && "error" in payload && payload.error) || "포인트 조회에 실패했습니다.");
          return;
        }

        setData(payload);
        setError("");
      })
      .catch(() => {
        setError("포인트 조회 중 오류가 발생했습니다.");
      });
  }, [identity, user?.id]);

  const emptyStateMessage = !user
    ? "포인트 조회를 위해 로그인해 주세요."
    : !identity
      ? "닉네임 정보가 없어 조회할 수 없습니다."
      : error || "포인트 데이터를 불러오는 중입니다.";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.10),transparent_60%)]">
          <div className="container mx-auto px-4 py-8 md:py-10">
            <h1 className="font-display text-3xl font-bold">포인트 센터</h1>
            <p className="text-sm text-muted-foreground mt-2">
              채택/인증 가산/운영 선정으로 적립된 포인트를 확인하세요.
            </p>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4 space-y-6">
            {data ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-none shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-sm">보유 포인트</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-emerald-700">{data.points.toLocaleString()}P</p>
                    </CardContent>
                  </Card>

                  <Card className="border-none shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-sm">회원</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl font-semibold">{data.ownerName || identity}</p>
                    </CardContent>
                  </Card>

                  <Card className="border-none shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-sm">인증 상태</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl font-semibold">{data.verificationLevel}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-lg">포인트 내역</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {data.ledger.length ? (
                      <div className="divide-y">
                        {data.ledger.map((item) => (
                          <div key={item.id} className="py-3 flex items-center justify-between gap-4">
                            <div>
                              <p className="text-sm font-medium">{item.source}</p>
                              <p className="text-xs text-gray-500">{formatDate(item.created_at)}</p>
                            </div>
                            <p className={`text-sm font-semibold ${item.amount >= 0 ? "text-emerald-700" : "text-red-600"}`}>
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
            ) : (
              <Card className="border-none shadow-lg">
                <CardContent className="py-8 space-y-4">
                  <p className="text-sm text-gray-600">{emptyStateMessage}</p>
                  {!user && (
                    <Button asChild>
                      <Link href="/signup">회원가입</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
