"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getIsMemberSnapshot, subscribeAuthChange } from "@/lib/authClient";

type CutoffRow = {
  id: string;
  university: string;
  major: string;
  year: number;
  scoreBand: string;
  note: string;
};

type Tier = "합격권" | "예비순위권" | "탈락권";

type PredictorResult = {
  tier: Tier;
  reason: string;
  cutoffLow: number;
  cutoffHigh: number;
  adjustedScore: number;
  wrongPenalty: number;
  margin: number;
  sampleCount: number;
  strategy: "안정 지원" | "적정 지원" | "상향 재검토";
};

type TransferPredictorProps = {
  rows: CutoffRow[];
};

const TIER_STYLE: Record<Tier, string> = {
  합격권: "border-border bg-accent text-primary",
  예비순위권: "border-amber-200 bg-amber-50 text-amber-700",
  탈락권: "border-rose-200 bg-rose-50 text-rose-700",
};

const TIER_EMOJI: Record<Tier, string> = {
  합격권: "🏆",
  예비순위권: "🎯",
  탈락권: "🛟",
};

const REEL_TIERS = ["합격권", "예비순위권", "탈락권"] as const;
const REEL_STRATEGIES = ["안정 지원", "적정 지원", "상향 재검토"] as const;
const REEL_EFFECTS = ["두구두구...", "연산 중...", "판정 대기..."] as const;

function parseScoreBand(scoreBand: string): { low: number; high: number } | null {
  const cleaned = scoreBand.replace(/\s/g, "");
  const match = cleaned.match(/([0-9]+(?:\.[0-9]+)?)~([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return null;

  const low = Number(match[1]);
  const high = Number(match[2]);
  if (Number.isNaN(low) || Number.isNaN(high)) return null;

  return { low, high };
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function evaluate(
  score: number,
  wrongCount: number,
  cutoffLow: number,
  cutoffHigh: number,
  sampleCount: number
): PredictorResult {
  const wrongPenalty = Number((wrongCount * 0.15).toFixed(2));
  const adjustedScore = Number((score - wrongPenalty).toFixed(2));
  const margin = Number((adjustedScore - cutoffLow).toFixed(2));

  if (margin >= 0.8) {
    return {
      tier: "합격권",
      reason: "유효 점수가 최근 커트라인 하단보다 충분히 높습니다.",
      cutoffLow,
      cutoffHigh,
      adjustedScore,
      wrongPenalty,
      margin,
      sampleCount,
      strategy: "안정 지원",
    };
  }

  if (margin >= -0.8) {
    return {
      tier: "예비순위권",
      reason: "커트라인 근접 구간입니다. 경쟁률 변수를 함께 보세요.",
      cutoffLow,
      cutoffHigh,
      adjustedScore,
      wrongPenalty,
      margin,
      sampleCount,
      strategy: "적정 지원",
    };
  }

  return {
    tier: "탈락권",
    reason: "최근 커트라인 대비 격차가 있어 지원 전략 재조정이 필요합니다.",
    cutoffLow,
    cutoffHigh,
    adjustedScore,
    wrongPenalty,
    margin,
    sampleCount,
    strategy: "상향 재검토",
  };
}

export function TransferPredictor({ rows }: TransferPredictorProps) {
  const availableRows = rows.filter((row) => row.university && row.year && row.scoreBand);

  const universities = useMemo(
    () => Array.from(new Set(availableRows.map((row) => row.university))),
    [availableRows]
  );

  const [university, setUniversity] = useState(universities[0] ?? "");
  const [year, setYear] = useState<string>(
    availableRows.find((row) => row.university === (universities[0] ?? ""))?.year?.toString() ?? ""
  );
  const [score, setScore] = useState("");
  const [wrongCount, setWrongCount] = useState("");
  const [error, setError] = useState("");

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PredictorResult | null>(null);

  const [reelTier, setReelTier] = useState<string>("-");
  const [reelStrategy, setReelStrategy] = useState<string>("-");
  const [reelEffect, setReelEffect] = useState<string>("시작 대기");

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMember = useSyncExternalStore(
    subscribeAuthChange,
    getIsMemberSnapshot,
    () => false
  );

  const yearOptions = useMemo(() => {
    return Array.from(
      new Set(
        availableRows
          .filter((row) => row.university === university)
          .map((row) => row.year)
      )
    ).sort((a, b) => b - a);
  }, [availableRows, university]);

  const schoolYearRows = useMemo(() => {
    const targetYear = Number(year);
    return availableRows.filter(
      (row) => row.university === university && row.year === targetYear
    );
  }, [availableRows, university, year]);

  const cutoffStats = useMemo(() => {
    const parsed = schoolYearRows
      .map((row) => parseScoreBand(row.scoreBand))
      .filter((band): band is { low: number; high: number } => Boolean(band));

    if (!parsed.length) return null;

    const lowAvg = Number(average(parsed.map((band) => band.low)).toFixed(2));
    const highAvg = Number(average(parsed.map((band) => band.high)).toFixed(2));

    return {
      lowAvg,
      highAvg,
      sampleCount: parsed.length,
    };
  }, [schoolYearRows]);

  const resetReels = () => {
    setReelTier("-");
    setReelStrategy("-");
    setReelEffect("시작 대기");
  };

  const startReelAnimation = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    intervalRef.current = setInterval(() => {
      const tier = REEL_TIERS[Math.floor(Math.random() * REEL_TIERS.length)];
      const strategy = REEL_STRATEGIES[Math.floor(Math.random() * REEL_STRATEGIES.length)];
      const effect = REEL_EFFECTS[Math.floor(Math.random() * REEL_EFFECTS.length)];

      setReelTier(tier);
      setReelStrategy(strategy);
      setReelEffect(effect);
    }, 90);
  };

  const stopReelAnimation = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const handleRun = async () => {
    if (!isMember) {
      setError("합격 커트라인 추정은 회원가입 후 이용할 수 있습니다.");
      return;
    }

    setError("");
    setResult(null);

    const numericScore = Number(score);
    const numericWrong = Number(wrongCount);

    if (Number.isNaN(numericScore)) {
      setError("점수를 숫자로 입력해 주세요.");
      return;
    }

    if (Number.isNaN(numericWrong) || numericWrong < 0) {
      setError("틀린 개수는 0 이상의 숫자로 입력해 주세요.");
      return;
    }

    if (!cutoffStats) {
      setError("해당 학교/년도의 커트라인 데이터가 부족합니다.");
      return;
    }

    setRunning(true);
    resetReels();
    startReelAnimation();

    await sleep(1600);

    const predicted = evaluate(
      numericScore,
      numericWrong,
      cutoffStats.lowAvg,
      cutoffStats.highAvg,
      cutoffStats.sampleCount
    );

    stopReelAnimation();
    setReelTier(predicted.tier);
    setReelStrategy(predicted.strategy);
    setReelEffect("판정 완료!");
    setResult(predicted);
    setRunning(false);
  };

  return (
    <Card className="border-none shadow-lg overflow-hidden bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.12),transparent_56%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,255,255,1))]">
      <CardHeader>
        <CardTitle className="text-lg">편입 합격커트라인 알아보기 · 시뮬레이터</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {!isMember && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
            학교별 커트라인 추정과 돌려보기는 회원가입 후 이용 가능합니다.
            <div className="mt-2 flex gap-2">
              <Button asChild size="sm" className="bg-primary hover:bg-primary/90">
                <Link href="/signup">회원가입</Link>
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={university}
            onChange={(e) => {
              setUniversity(e.target.value);
              const rowsBySchool = availableRows.filter((row) => row.university === e.target.value);
              setYear(rowsBySchool[0]?.year?.toString() ?? "");
              setResult(null);
              setError("");
              resetReels();
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            disabled={!isMember}
          >
            {universities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <select
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setResult(null);
              setError("");
              resetReels();
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            disabled={!isMember}
          >
            {yearOptions.map((item) => (
              <option key={item} value={item}>
                {item}년
              </option>
            ))}
          </select>

          <Input
            value={wrongCount}
            onChange={(e) => {
              setWrongCount(e.target.value);
              setResult(null);
              setError("");
              resetReels();
            }}
            placeholder="틀린 개수"
            inputMode="numeric"
            disabled={!isMember}
          />

          <Input
            value={score}
            onChange={(e) => {
              setScore(e.target.value);
              setResult(null);
              setError("");
              resetReels();
            }}
            placeholder="점수 (예: 89.3)"
            inputMode="decimal"
            disabled={!isMember}
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border bg-gray-50 p-2">
              <p className="text-[11px] text-gray-500">티어</p>
              <p className={`text-sm font-bold mt-1 ${running ? "animate-pulse" : ""}`}>{reelTier}</p>
            </div>
            <div className="rounded-lg border bg-gray-50 p-2">
              <p className="text-[11px] text-gray-500">전략</p>
              <p className={`text-sm font-bold mt-1 ${running ? "animate-pulse" : ""}`}>{reelStrategy}</p>
            </div>
            <div className="rounded-lg border bg-gray-50 p-2">
              <p className="text-[11px] text-gray-500">상태</p>
              <p className={`text-sm font-bold mt-1 ${running ? "animate-pulse" : ""}`}>{reelEffect}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">학교/년도 컷 평균 + 틀린 개수 보정으로 유쾌하게 돌려보는 빠른 판정입니다.</p>
          <Button
            onClick={handleRun}
            disabled={running || !isMember}
            className="bg-primary hover:bg-primary/90 min-w-36"
          >
            {!isMember ? "회원가입 후 이용" : running ? "돌리는 중..." : "돌려보기 🎰"}
          </Button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {result && (
          <div className={`rounded-xl border px-4 py-4 ${TIER_STYLE[result.tier]}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-semibold">{university} · {year}년 기준</p>
              <span className="text-lg font-extrabold tracking-tight flex items-center gap-1">
                <span>{TIER_EMOJI[result.tier]}</span>
                <span>{result.tier}</span>
              </span>
            </div>

            <p className="text-sm mt-2">{result.reason}</p>

            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="rounded-md bg-white/70 px-2 py-2">
                <p className="opacity-70">기준 컷(평균)</p>
                <p className="font-semibold mt-1">{result.cutoffLow} ~ {result.cutoffHigh}</p>
              </div>
              <div className="rounded-md bg-white/70 px-2 py-2">
                <p className="opacity-70">유효 점수</p>
                <p className="font-semibold mt-1">{result.adjustedScore}</p>
              </div>
              <div className="rounded-md bg-white/70 px-2 py-2">
                <p className="opacity-70">틀린 개수 페널티</p>
                <p className="font-semibold mt-1">-{result.wrongPenalty}</p>
              </div>
              <div className="rounded-md bg-white/70 px-2 py-2">
                <p className="opacity-70">권장 전략</p>
                <p className="font-semibold mt-1">{result.strategy}</p>
              </div>
            </div>

            <p className="text-xs mt-3 opacity-90">
              컷 하단 대비 {result.margin >= 0 ? "+" : ""}{result.margin} · 분석 샘플 {result.sampleCount}개
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
