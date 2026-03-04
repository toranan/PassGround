"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AnalyzeResponse = {
  ok: boolean;
  found: boolean;
  status: "pass" | "waitlist" | "fail" | "unknown";
  label: string;
  summary: string;
  detail: string;
  targetGuide: string;
  basis: string[];
  traceId: string;
  message?: string;
};

const STATUS_CLASS: Record<AnalyzeResponse["status"], string> = {
  pass: "border-emerald-200 bg-emerald-50 text-emerald-800",
  waitlist: "border-amber-200 bg-amber-50 text-amber-800",
  fail: "border-rose-200 bg-rose-50 text-rose-800",
  unknown: "border-slate-200 bg-slate-50 text-slate-700",
};

export function TransferCutoffAnalyzerPanel() {
  const [year, setYear] = useState("2026");
  const [university, setUniversity] = useState("");
  const [major, setMajor] = useState("");
  const [score, setScore] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;

    const payload = {
      exam: "transfer",
      year: year.trim(),
      university: university.trim(),
      major: major.trim(),
      score: score.trim(),
    };

    if (!payload.year || !payload.university || !payload.major || !payload.score) {
      setError("학년도/학교명/학과명/점수를 모두 입력해 주세요.");
      return;
    }

    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/mobile/cutoff/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as
        | AnalyzeResponse
        | { error?: string }
        | null;

      if (!response.ok || !data || !("ok" in data)) {
        throw new Error((data && "error" in data && data.error) || "커트라인 분석에 실패했습니다.");
      }

      setResult(data);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "커트라인 분석 중 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">AI 커트라인 분석</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            value={year}
            onChange={(event) => setYear(event.target.value)}
            placeholder="학년도 (예: 2026)"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
          />
          <input
            value={university}
            onChange={(event) => setUniversity(event.target.value)}
            placeholder="학교명"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
          />
          <input
            value={major}
            onChange={(event) => setMajor(event.target.value)}
            placeholder="학과명"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
          />
          <input
            value={score}
            onChange={(event) => setScore(event.target.value)}
            placeholder="점수 또는 틀린 개수"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
          />

          <div className="md:col-span-4 flex items-center gap-2">
            <Button type="submit" disabled={pending} className="bg-primary hover:bg-primary/90">
              {pending ? "분석 중..." : "분석하기"}
            </Button>
            <p className="text-xs text-muted-foreground">입력 정보가 부족하면 정보없음으로 안내됩니다.</p>
          </div>
        </form>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {result ? (
          <div className={`rounded-xl border px-4 py-4 ${STATUS_CLASS[result.status]}`}>
            <p className="text-sm font-semibold">판정: {result.label}</p>
            <p className="mt-2 text-sm">{result.summary}</p>
            <p className="mt-2 text-sm opacity-90 whitespace-pre-wrap">{result.detail}</p>
            <p className="mt-2 text-xs opacity-90">가이드: {result.targetGuide}</p>
            {result.basis.length ? (
              <div className="mt-3 space-y-1">
                {result.basis.map((basis, index) => (
                  <p key={`${basis}-${index}`} className="text-xs opacity-80">• {basis}</p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
