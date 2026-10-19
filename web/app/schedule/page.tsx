import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { ScheduleRows } from "@/components/TransferFeedLists";
import { loadUpcomingSchedules, monthKey, type ScheduleItem } from "@/lib/transferFeeds";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "편입 일정",
  description: "대학별 편입 원서접수·필기시험·합격발표 일정을 한눈에 봅니다.",
};

const FILTERS = [
  { key: "all", label: "전체" },
  { key: "원서접수", label: "원서접수" },
  { key: "편입학고사", label: "시험" },
  { key: "합격발표", label: "합격발표" },
];

type SchedulePageProps = { searchParams: Promise<{ category?: string; q?: string }> };

export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  const { category = "all", q = "" } = await searchParams;
  const query = q.trim().replace(/\s+/g, "");
  const schedules = (await loadUpcomingSchedules()).filter((schedule) =>
    (category === "all" || schedule.category === category) &&
    (!query || `${schedule.university ?? ""}${schedule.title}`.replace(/\s+/g, "").includes(query))
  );

  const months = new Map<string, ScheduleItem[]>();
  for (const schedule of schedules) {
    const key = monthKey(schedule.startsAt);
    months.set(key, [...(months.get(key) ?? []), schedule]);
  }

  const hrefFor = (nextCategory: string) => {
    const params = new URLSearchParams();
    if (nextCategory !== "all") params.set("category", nextCategory);
    if (q) params.set("q", q);
    const search = params.toString();
    return search ? `/schedule?${search}` : "/schedule";
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar />
      <main className="container mx-auto max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold">편입 일정</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          입학처가 날짜를 밝힌 일정만 모았어요. (예정)은 기본계획 기준이라 최종 모집요강에서 바뀔 수 있어요.
        </p>

        <form action="/schedule" className="mt-6 flex gap-2">
          {category !== "all" ? <input type="hidden" name="category" value={category} /> : null}
          <input
            name="q"
            defaultValue={q}
            placeholder="학교 이름으로 찾기"
            className="h-10 flex-1 rounded-xl border bg-white px-3 text-sm outline-none focus:border-primary"
          />
          <button className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">검색</button>
        </form>

        <div className="mt-3 flex gap-2 overflow-x-auto">
          {FILTERS.map((filter) => (
            <Link
              key={filter.key}
              href={hrefFor(filter.key)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${category === filter.key ? "border-primary bg-primary text-primary-foreground" : "bg-white text-gray-600 hover:border-primary"}`}
            >
              {filter.label}
            </Link>
          ))}
        </div>

        <div className="mt-6 space-y-6">
          {[...months.entries()].map(([month, rows]) => (
            <section key={month} className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-bold text-gray-500">{month}</h2>
              <ScheduleRows schedules={rows} />
            </section>
          ))}
          {!months.size ? (
            <p className="rounded-2xl border bg-white py-12 text-center text-sm text-muted-foreground">
              {query || category !== "all" ? "조건에 맞는 일정이 없어요." : "다가오는 일정이 아직 없어요."}
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
