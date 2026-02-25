"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cutoffTrackLabel, type CutoffTrackType } from "@/lib/cutoffTrack";
import { getIsMemberSnapshot, subscribeAuthChange } from "@/lib/authClient";

type CutoffRow = {
  id: string;
  university: string;
  major: string;
  track: CutoffTrackType;
  year: number;
  scoreBand: string;
  note: string;
  inputBasis: "wrong" | "score" | "both";
  waitlistCutoff: number | null;
  initialCutoff: number | null;
};

type ResultType = "최초합" | "추합" | "불합격" | "정보없음";
type InputType = "score" | "wrong";

type PredictorResult = {
  resultType: ResultType;
  reason: string;
  strategy: "상향 지원 가능" | "적정 지원 권장" | "하향/재조정 권장" | "데이터 등록 필요";
  inputType: InputType;
  inputValue: number;
  waitlistCutoff: number | null;
  initialCutoff: number | null;
  note: string;
  university: string;
  major: string;
  track: CutoffTrackType;
  year: number;
};

type TransferPredictorProps = {
  rows: CutoffRow[];
};

const RESULT_STYLE: Record<ResultType, string> = {
  최초합: "border-border bg-accent text-primary",
  추합: "border-amber-200 bg-amber-50 text-amber-700",
  불합격: "border-rose-200 bg-rose-50 text-rose-700",
  정보없음: "border-gray-200 bg-gray-50 text-gray-700",
};

const RESULT_EMOJI: Record<ResultType, string> = {
  최초합: "🏆",
  추합: "🎯",
  불합격: "🛟",
  정보없음: "ℹ️",
};

export function TransferPredictor({ rows }: TransferPredictorProps) {
  const availableRows = rows.filter((row) => row.university && row.year && row.scoreBand);
  const trackOptions: CutoffTrackType[] = ["general", "academic"];
  const [track, setTrack] = useState<CutoffTrackType>("general");
  const [university, setUniversity] = useState("");
  const [year, setYear] = useState<string>("");
  const [major, setMajor] = useState<string>("");

  const rowsByTrack = useMemo(
    () => availableRows.filter((row) => row.track === track),
    [availableRows, track]
  );

  const universities = useMemo(
    () => Array.from(new Set(rowsByTrack.map((row) => row.university))),
    [rowsByTrack]
  );
  const [inputType, setInputType] = useState<InputType>("wrong");
  const [wrongCount, setWrongCount] = useState("");
  const [score, setScore] = useState("");
  const [error, setError] = useState("");

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PredictorResult | null>(null);

  const [reelResult, setReelResult] = useState<string>("-");
  const [reelStrategy, setReelStrategy] = useState<string>("-");
  const [reelEffect, setReelEffect] = useState<string>("대기 중");
  const isMember = useSyncExternalStore(
    subscribeAuthChange,
    getIsMemberSnapshot,
    () => false
  );

  const selectedUniversity = universities.includes(university) ? university : (universities[0] ?? "");

  const yearOptions = useMemo(() => {
    return Array.from(
      new Set(
        rowsByTrack
          .filter((row) => row.university === selectedUniversity)
          .map((row) => row.year)
      )
    ).sort((a, b) => b - a);
  }, [rowsByTrack, selectedUniversity]);

  const selectedYear = yearOptions.some((item) => item.toString() === year)
    ? year
    : (yearOptions[0]?.toString() ?? "");

  const majorOptions = useMemo(() => {
    const targetYear = Number(selectedYear);
    return Array.from(
      new Set(
        rowsByTrack
          .filter((row) => row.university === selectedUniversity && row.year === targetYear)
          .map((row) => row.major)
      )
    );
  }, [rowsByTrack, selectedUniversity, selectedYear]);

  const selectedMajor = majorOptions.includes(major) ? major : (majorOptions[0] ?? "");

  const selectedRow = useMemo(() => {
    const targetYear = Number(selectedYear);
    return rowsByTrack.find(
      (row) =>
        row.university === selectedUniversity &&
        row.year === targetYear &&
        row.major === selectedMajor
    );
  }, [rowsByTrack, selectedUniversity, selectedYear, selectedMajor]);

  const resetReels = () => {
    setReelResult("-");
    setReelStrategy("-");
    setReelEffect("대기 중");
  };

  const handleRun = async () => {
    if (!isMember) {
      setError("합격 커트라인 추정은 회원가입 후 이용할 수 있습니다.");
      return;
    }

    setError("");
    setResult(null);

    const inputRaw = inputType === "wrong" ? wrongCount : score;
    const inputValue = Number(inputRaw);
    if (Number.isNaN(inputValue) || inputValue < 0) {
      setError(inputType === "wrong" ? "틀린 개수는 0 이상의 숫자로 입력해 주세요." : "점수는 0 이상의 숫자로 입력해 주세요.");
      return;
    }

    resetReels();
    setRunning(true);
    setReelEffect("판정 중...");
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (!selectedRow) {
      const fallbackResult: PredictorResult = {
        resultType: "정보없음",
        strategy: "데이터 등록 필요",
        inputType,
        inputValue,
        waitlistCutoff: null,
        initialCutoff: null,
        reason: "선택한 전형(일반/학사)의 학교/년도/전공은 아직 등록된 정보가 없습니다.",
        note: "",
        university: selectedUniversity || "-",
        major: selectedMajor || "-",
        track,
        year: Number(selectedYear) || 0,
      };
      setReelResult(fallbackResult.resultType);
      setReelStrategy(fallbackResult.strategy);
      setReelEffect("판정 완료!");
      setResult(fallbackResult);
      setRunning(false);
      return;
    }

    const basisMatched =
      selectedRow.inputBasis === "both" || selectedRow.inputBasis === inputType;

    if (!basisMatched) {
      const mismatchResult: PredictorResult = {
        resultType: "정보없음",
        strategy: "데이터 등록 필요",
        inputType,
        inputValue,
        waitlistCutoff: selectedRow.waitlistCutoff,
        initialCutoff: selectedRow.initialCutoff,
        reason:
          selectedRow.inputBasis === "wrong"
            ? "해당 전공은 틀린개수 기준 데이터만 등록되어 있습니다."
            : "해당 전공은 점수 기준 데이터만 등록되어 있습니다.",
        note: selectedRow.note || "",
        university: selectedRow.university,
        major: selectedRow.major,
        track: selectedRow.track,
        year: selectedRow.year,
      };
      setReelResult(mismatchResult.resultType);
      setReelStrategy(mismatchResult.strategy);
      setReelEffect("판정 완료!");
      setResult(mismatchResult);
      setRunning(false);
      return;
    }

    if (selectedRow.waitlistCutoff === null || selectedRow.initialCutoff === null) {
      const missingCutoffResult: PredictorResult = {
        resultType: "정보없음",
        strategy: "데이터 등록 필요",
        inputType,
        inputValue,
        waitlistCutoff: null,
        initialCutoff: null,
        reason: "해당 전공의 기준 컷(추합권/최초합권)이 아직 등록되지 않았습니다.",
        note: selectedRow.note || "",
        university: selectedRow.university,
        major: selectedRow.major,
        track: selectedRow.track,
        year: selectedRow.year,
      };
      setReelResult(missingCutoffResult.resultType);
      setReelStrategy(missingCutoffResult.strategy);
      setReelEffect("판정 완료!");
      setResult(missingCutoffResult);
      setRunning(false);
      return;
    }

    const waitlistCutoff = selectedRow.waitlistCutoff;
    const initialCutoff = selectedRow.initialCutoff;
    const resultType =
      inputType === "score"
        ? inputValue >= initialCutoff
          ? "최초합"
          : inputValue >= waitlistCutoff
            ? "추합"
            : "불합격"
        : inputValue <= initialCutoff
          ? "최초합"
          : inputValue <= waitlistCutoff
            ? "추합"
            : "불합격";

    const strategy =
      resultType === "최초합"
        ? "상향 지원 가능"
        : resultType === "추합"
          ? "적정 지원 권장"
          : resultType === "불합격"
            ? "하향/재조정 권장"
            : "데이터 등록 필요";

    const predicted: PredictorResult = {
      resultType,
      strategy,
      inputType,
      inputValue,
      waitlistCutoff,
      initialCutoff,
      reason:
        resultType === "최초합"
          ? "입력값이 최초합권 컷을 만족합니다."
          : resultType === "추합"
            ? "입력값이 추합권 컷 범위입니다."
            : resultType === "불합격"
              ? "입력값이 추합권 컷에 미달합니다."
              : "선택한 항목은 등록된 정보가 없습니다.",
      note: selectedRow.note || "",
      university: selectedRow.university,
      major: selectedRow.major,
      track: selectedRow.track,
      year: selectedRow.year,
    };

    setReelResult(predicted.resultType);
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

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select
            value={track}
            onChange={(e) => {
              setTrack(e.target.value as CutoffTrackType);
              setResult(null);
              setError("");
              resetReels();
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            disabled={!isMember}
          >
            {trackOptions.map((item) => (
              <option key={item} value={item}>
                {cutoffTrackLabel(item)}
              </option>
            ))}
          </select>

          <select
            value={selectedUniversity}
            onChange={(e) => {
              const nextUniversity = e.target.value;
              const rowsBySchool = rowsByTrack.filter((row) => row.university === nextUniversity);
              const nextYear = rowsBySchool[0]?.year?.toString() ?? "";
              const nextMajor =
                rowsBySchool.find((row) => row.year.toString() === nextYear)?.major ?? "";
              setUniversity(nextUniversity);
              setYear(nextYear);
              setMajor(nextMajor);
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
            value={selectedYear}
            onChange={(e) => {
              const nextYear = e.target.value;
              const nextMajor =
                rowsByTrack.find(
                  (row) => row.university === selectedUniversity && row.year.toString() === nextYear
                )?.major ?? "";
              setYear(nextYear);
              setMajor(nextMajor);
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

          <select
            value={selectedMajor}
            onChange={(e) => {
              setMajor(e.target.value);
              setResult(null);
              setError("");
              resetReels();
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            disabled={!isMember}
          >
            {majorOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <div className="rounded-md border border-input bg-background p-1 flex gap-1">
            <button
              type="button"
              className={`flex-1 rounded-sm px-2 py-1 text-xs ${inputType === "wrong" ? "bg-primary text-primary-foreground" : "text-foreground"}`}
              onClick={() => {
                setInputType("wrong");
                setResult(null);
                setError("");
                resetReels();
              }}
              disabled={!isMember}
            >
              틀린 개수
            </button>
            <button
              type="button"
              className={`flex-1 rounded-sm px-2 py-1 text-xs ${inputType === "score" ? "bg-primary text-primary-foreground" : "text-foreground"}`}
              onClick={() => {
                setInputType("score");
                setResult(null);
                setError("");
                resetReels();
              }}
              disabled={!isMember}
            >
              점수
            </button>
          </div>

          <Input
            value={inputType === "wrong" ? wrongCount : score}
            onChange={(e) => {
              if (inputType === "wrong") {
                setWrongCount(e.target.value);
              } else {
                setScore(e.target.value);
              }
              setResult(null);
              setError("");
              resetReels();
            }}
            placeholder={inputType === "wrong" ? "틀린 개수" : "점수"}
            inputMode={inputType === "wrong" ? "numeric" : "decimal"}
            disabled={!isMember}
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border bg-gray-50 p-2">
              <p className="text-[11px] text-gray-500">결과</p>
              <p className={`text-sm font-bold mt-1 ${running ? "animate-pulse" : ""}`}>{reelResult}</p>
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
          <p className="text-xs text-muted-foreground">일반/학사, 학교/년도/전공 선택 후 점수 또는 틀린 개수 중 하나를 입력해 결과를 확인합니다.</p>
          <Button
            onClick={handleRun}
            disabled={running || !isMember}
            className="bg-primary hover:bg-primary/90 min-w-36"
          >
            {!isMember ? "회원가입 후 이용" : running ? "확인 중..." : "결과 보기"}
          </Button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {result && (
          <div className={`rounded-xl border px-4 py-4 ${RESULT_STYLE[result.resultType]}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-semibold">
                {result.university} · {result.major} · {cutoffTrackLabel(result.track)} · {result.year}년 기준
              </p>
              <span className="text-lg font-extrabold tracking-tight flex items-center gap-1">
                <span>{RESULT_EMOJI[result.resultType]}</span>
                <span>{result.resultType}</span>
              </span>
            </div>

            <p className="text-sm mt-2">{result.reason}</p>

            <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <div className="rounded-md bg-white/70 px-2 py-2">
                <p className="opacity-70">
                  입력한 {result.inputType === "wrong" ? "틀린 개수" : "점수"}
                </p>
                <p className="font-semibold mt-1">
                  {result.inputType === "wrong" ? `${result.inputValue}개` : result.inputValue}
                </p>
              </div>
              <div className="rounded-md bg-white/70 px-2 py-2">
                <p className="opacity-70">판정 결과</p>
                <p className="font-semibold mt-1">{result.resultType}</p>
              </div>
              <div className="rounded-md bg-white/70 px-2 py-2">
                <p className="opacity-70">권장 전략</p>
                <p className="font-semibold mt-1">{result.strategy}</p>
              </div>
            </div>

            {result.waitlistCutoff !== null && result.initialCutoff !== null ? (
              <p className="text-xs mt-3 opacity-90">
                기준 컷: 추합권 {result.waitlistCutoff}
                {result.inputType === "wrong" ? "개" : "점"} · 최초합권 {result.initialCutoff}
                {result.inputType === "wrong" ? "개" : "점"}
              </p>
            ) : null}
            {result.note ? <p className="text-xs mt-3 opacity-90">비고: {result.note}</p> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
