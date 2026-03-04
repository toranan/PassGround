"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getUserSnapshot, subscribeAuthChange } from "@/lib/authClient";

type User = {
  id?: string;
  username?: string;
  nickname?: string;
};

type ScheduleItem = {
  id: string;
  university: string | null;
  category: string;
  starts_at: string;
};

type PointsResponse = {
  ok: boolean;
  targetUniversity?: string | null;
};

type BannerState = {
  targetLabel: string;
  ddayLabel: string;
  subtitle: string;
};

const DEFAULT_STATE: BannerState = {
  targetLabel: "목표대학 미설정",
  ddayLabel: "D-day",
  subtitle: "마이페이지에서 목표대학을 설정하면 일정 기준 D-day를 보여줘",
};

function normalizeKorean(value: string): string {
  return value.toLowerCase().replace(/대학교|대학/g, "").replace(/\s+/g, "").trim();
}

function matchesUniversity(scheduleUniversity: string | null, targetUniversity: string): boolean {
  if (!scheduleUniversity) return false;
  const scheduleKey = normalizeKorean(scheduleUniversity);
  const targetKey = normalizeKorean(targetUniversity);
  if (!scheduleKey || !targetKey) return false;
  return scheduleKey.includes(targetKey) || targetKey.includes(scheduleKey);
}

function defaultReferenceDate(now: Date): Date {
  const year = now.getMonth() === 0 && now.getDate() <= 10 ? now.getFullYear() : now.getFullYear() + 1;
  return new Date(year, 0, 10, 9, 0, 0, 0);
}

function parseDate(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date(0);
  return parsed;
}

function toDDayLabel(targetDate: Date, now: Date): string {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const diffMs = targetStart.getTime() - todayStart.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays === 0) return "D-day";
  if (diffDays > 0) return `D-${diffDays}`;
  return `D+${Math.abs(diffDays)}`;
}

function resolveBannerState(targetUniversity: string | null, schedules: ScheduleItem[]): BannerState {
  const now = new Date();
  const nextSchedules = schedules
    .map((item) => ({ ...item, date: parseDate(item.starts_at) }))
    .filter((item) => item.date.getTime() > 0)
    .sort((left, right) => left.date.getTime() - right.date.getTime());

  const trimmedTarget = targetUniversity?.trim() ?? "";
  const matchedSchedule = trimmedTarget
    ? nextSchedules.find((item) => matchesUniversity(item.university, trimmedTarget) && item.date >= now)
    : null;

  const targetDate = matchedSchedule?.date ?? defaultReferenceDate(now);
  const targetLabel = trimmedTarget ? `${trimmedTarget} 합격까지` : "목표대학 미설정";
  const subtitle = matchedSchedule
    ? `${matchedSchedule.category} 일정 기준`
    : trimmedTarget
    ? "일정 데이터 미등록: 기본 기준일(1월 10일) 사용"
    : "기본 기준일(1월 10일) 기준";

  return {
    targetLabel,
    ddayLabel: toDDayLabel(targetDate, now),
    subtitle,
  };
}

export function TransferHomeBanner() {
  const user = useSyncExternalStore(
    subscribeAuthChange,
    () => getUserSnapshot() as User | null,
    () => null
  );

  const [state, setState] = useState<BannerState>(DEFAULT_STATE);

  const identity = useMemo(() => {
    if (!user) return { id: "", name: "" };
    return {
      id: user.id ?? "",
      name: user.nickname || user.username || "",
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const schedulesRes = await fetch("/api/schedules?exam=transfer", { cache: "no-store" });
        const schedulesPayload = (await schedulesRes.json().catch(() => null)) as
          | { schedules?: ScheduleItem[] }
          | null;
        const schedules = Array.isArray(schedulesPayload?.schedules) ? schedulesPayload.schedules : [];

        let targetUniversity: string | null = null;
        if (identity.id || identity.name) {
          const query = new URLSearchParams();
          if (identity.id) query.set("userId", identity.id);
          if (identity.name) query.set("nickname", identity.name);
          query.set("includeLedger", "false");

          const pointsRes = await fetch(`/api/points/me?${query.toString()}`, { cache: "no-store" });
          const pointsPayload = (await pointsRes.json().catch(() => null)) as PointsResponse | null;
          if (pointsRes.ok && pointsPayload?.ok) {
            targetUniversity = pointsPayload.targetUniversity?.trim() || null;
          }
        }

        if (!cancelled) {
          setState(resolveBannerState(targetUniversity, schedules));
        }
      } catch {
        if (!cancelled) {
          setState(DEFAULT_STATE);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [identity.id, identity.name]);

  return (
    <section className="rounded-2xl bg-black px-5 py-5 text-white shadow-lg">
      <p className="text-sm text-white/80">{state.targetLabel}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight">{state.ddayLabel}</p>
      <p className="mt-1 text-xs text-white/60">{state.subtitle}</p>
    </section>
  );
}
