"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RankingItem = {
  id: string;
  subject: string;
  instructorName: string;
  rank: number;
  voteCount: number;
  votePercent: number;
};

type RankingResponse = {
  ok: boolean;
  totalVotes: number;
  rankings: RankingItem[];
  error?: string;
};

export function TransferInstructorRankingPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [totalVotes, setTotalVotes] = useState(0);
  const [rankings, setRankings] = useState<RankingItem[]>([]);

  const grouped = useMemo(() => {
    const map = new Map<string, RankingItem[]>();
    rankings.forEach((item) => {
      const list = map.get(item.subject) ?? [];
      list.push(item);
      map.set(item.subject, list);
    });
    return Array.from(map.entries());
  }, [rankings]);

  const reload = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/rankings/transfer", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as RankingResponse | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "강사 랭킹을 불러오지 못했습니다.");
      }

      setTotalVotes(payload.totalVotes ?? 0);
      setRankings(payload.rankings ?? []);
    } catch (caught) {
      setRankings([]);
      setTotalVotes(0);
      setError(caught instanceof Error ? caught.message : "강사 랭킹을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">편입 강사 랭킹</CardTitle>
        <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
          새로고침
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">총 득표수: {totalVotes.toLocaleString()}표</p>

        {loading ? <p className="text-sm text-muted-foreground">강사 랭킹을 불러오는 중입니다.</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {!loading && !error && rankings.length === 0 ? (
          <p className="text-sm text-muted-foreground">등록된 랭킹 데이터가 아직 없습니다.</p>
        ) : null}

        {!loading && !error && rankings.length > 0 ? (
          <div className="space-y-4">
            {grouped.map(([subject, items]) => (
              <div key={subject} className="space-y-2">
                <p className="text-sm font-semibold">{subject}</p>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="rounded-lg border border-border px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {item.rank}위 · {item.instructorName}
                        </p>
                        <p className="text-xs text-muted-foreground">{item.votePercent}%</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">득표 {item.voteCount.toLocaleString()}표</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
