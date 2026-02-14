"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { emitAuthChange, getUserSnapshot, subscribeAuthChange } from "@/lib/authClient";

type RankingItem = {
  id: string;
  subject: string;
  instructorName: string;
  rank: number;
  trend: string;
  confidence: number;
  voteCount: number;
  votePercent: number;
};

type RankingResponse = {
  ok: boolean;
  totalVotes: number;
  rankings: RankingItem[];
  error?: string;
};

type VoteStatusResponse = {
  ok: boolean;
  hasVoted: boolean;
  instructorName: string | null;
  votedAt: string | null;
  error?: string;
};

type User = {
  id?: string;
  username?: string;
  nickname?: string;
  email?: string;
} | null;

function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("access_token") ?? "";
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR");
}

export default function TransferInstructorRankingPage() {
  const user = useSyncExternalStore(
    subscribeAuthChange,
    () => getUserSnapshot() as User,
    () => null
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [selectedInstructor, setSelectedInstructor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [voteStatus, setVoteStatus] = useState<{
    hasVoted: boolean;
    instructorName: string | null;
    votedAt: string | null;
  }>({
    hasVoted: false,
    instructorName: null,
    votedAt: null,
  });

  const groupedBySubject = useMemo(() => {
    const map = new Map<string, RankingItem[]>();
    rankings.forEach((item) => {
      const list = map.get(item.subject) ?? [];
      list.push(item);
      map.set(item.subject, list);
    });
    return Array.from(map.entries());
  }, [rankings]);

  const reloadRankings = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/rankings/transfer", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as RankingResponse | null;
      if (!res.ok || !payload?.ok) {
        setError(payload?.error ?? "강사 순위를 불러오지 못했습니다.");
        setRankings([]);
        setTotalVotes(0);
        return;
      }
      setRankings(payload.rankings ?? []);
      setTotalVotes(payload.totalVotes ?? 0);
      setSelectedInstructor((prev) => prev || payload.rankings?.[0]?.instructorName || "");
    } catch {
      setError("강사 순위를 불러오지 못했습니다.");
      setRankings([]);
      setTotalVotes(0);
    } finally {
      setLoading(false);
    }
  };

  const reloadVoteStatus = async () => {
    const token = getAccessToken();
    if (!token || !user?.id) {
      setVoteStatus({ hasVoted: false, instructorName: null, votedAt: null });
      return;
    }

    try {
      const res = await fetch("/api/rankings/transfer/vote", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const payload = (await res.json().catch(() => null)) as VoteStatusResponse | null;
      if (!res.ok || !payload?.ok) {
        if (res.status === 401) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          localStorage.removeItem("user");
          emitAuthChange();
        }
        setVoteStatus({ hasVoted: false, instructorName: null, votedAt: null });
        return;
      }

      setVoteStatus({
        hasVoted: payload.hasVoted,
        instructorName: payload.instructorName,
        votedAt: payload.votedAt,
      });
    } catch {
      setVoteStatus({ hasVoted: false, instructorName: null, votedAt: null });
    }
  };

  useEffect(() => {
    void reloadRankings();
  }, []);

  useEffect(() => {
    void reloadVoteStatus();
  }, [user?.id]);

  const handleVote = async () => {
    if (!user?.id) {
      setNotice("투표하려면 회원가입/로그인이 필요합니다.");
      return;
    }
    if (!selectedInstructor) {
      setNotice("투표할 강사를 선택해 주세요.");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setNotice("로그인 세션이 없습니다. 다시 로그인해 주세요.");
      return;
    }

    setSubmitting(true);
    setNotice("");

    try {
      const res = await fetch("/api/rankings/transfer/vote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          instructorName: selectedInstructor,
        }),
      });

      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; alreadyVoted?: boolean; error?: string; instructorName?: string }
        | null;

      if (!res.ok || !payload?.ok) {
        setNotice(payload?.error ?? "투표에 실패했습니다.");
        return;
      }

      setNotice(
        payload.alreadyVoted
          ? `이미 ${payload.instructorName}에 투표되어 있습니다.`
          : `${selectedInstructor} 투표가 완료되었습니다.`
      );
      await Promise.all([reloadRankings(), reloadVoteStatus()]);
    } catch {
      setNotice("투표 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.10),transparent_58%)]">
          <div className="container mx-auto px-4 py-10">
            <h1 className="font-display text-3xl font-bold">편입 인기 강사 순위</h1>
            <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
              계정당 1회, 현재 수강 중인 강사에게 투표할 수 있습니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/transfer">편입 홈으로</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/admin">관리자 페이지</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4 grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">투표판</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                  총 투표수: <span className="font-bold text-primary">{totalVotes.toLocaleString()}</span>
                </div>
                {!user?.id && (
                  <p className="text-sm text-amber-700">투표하려면 로그인 후 이용해 주세요.</p>
                )}
                {voteStatus.hasVoted && (
                  <p className="text-sm text-primary">
                    이미 투표 완료: <span className="font-semibold">{voteStatus.instructorName}</span> ({formatDate(voteStatus.votedAt)})
                  </p>
                )}
                <div className="space-y-2">
                  {rankings.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-3 cursor-pointer hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="instructor-vote"
                          value={item.instructorName}
                          checked={selectedInstructor === item.instructorName}
                          onChange={() => setSelectedInstructor(item.instructorName)}
                          disabled={voteStatus.hasVoted}
                        />
                        <div>
                          <p className="text-xs text-gray-500">{item.subject}</p>
                          <p className="text-sm font-semibold">{item.rank}위 {item.instructorName}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">{item.voteCount}표</p>
                        <p className="text-xs text-primary">{item.votePercent}%</p>
                      </div>
                    </label>
                  ))}
                </div>

                {!loading && rankings.length === 0 && (
                  <p className="text-sm text-muted-foreground">아직 등록된 강사가 없습니다. 관리자 페이지에서 초기값을 등록해 주세요.</p>
                )}

                <Button
                  onClick={handleVote}
                  disabled={submitting || voteStatus.hasVoted || !rankings.length}
                  className="bg-primary hover:bg-primary/90"
                >
                  {voteStatus.hasVoted ? "이미 투표 완료" : submitting ? "투표 중..." : "1회 투표하기"}
                </Button>
                {notice && <p className="text-sm text-primary">{notice}</p>}
                {error && <p className="text-sm text-red-600">{error}</p>}
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">과목별 득표 비율</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {groupedBySubject.map(([subject, items]) => (
                  <div key={subject} className="space-y-2">
                    <p className="text-sm font-semibold">{subject}</p>
                    {items.map((item) => (
                      <div key={`${subject}-${item.id}`} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span>{item.instructorName}</span>
                          <span>{item.votePercent}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, item.votePercent))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {!loading && !groupedBySubject.length && (
                  <p className="text-sm text-muted-foreground">표시할 순위 데이터가 없습니다.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
