import Link from "next/link";
import { ExternalLink, Paperclip } from "lucide-react";
import { ddayLabel, formatKstDate, formatNewsDate, type NewsItem, type ScheduleItem } from "@/lib/transferFeeds";

const CATEGORY_STYLES: Record<string, string> = {
  원서접수: "bg-[#eff6ff] text-[#1d4ed8]",
  편입학고사: "bg-primary/10 text-primary",
  합격발표: "bg-[#ecfdf5] text-[#047857]",
};

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${CATEGORY_STYLES[category] ?? "bg-gray-100 text-gray-600"}`}>
      {category === "편입학고사" ? "시험" : category}
    </span>
  );
}

export function ScheduleRows({ schedules }: { schedules: ScheduleItem[] }) {
  if (!schedules.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">다가오는 일정이 아직 없어요.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {schedules.map((schedule) => {
        const range = schedule.endsAt && formatKstDate(schedule.endsAt) !== formatKstDate(schedule.startsAt)
          ? `${formatKstDate(schedule.startsAt)} ~ ${formatKstDate(schedule.endsAt)}`
          : formatKstDate(schedule.startsAt);
        return (
          <li key={schedule.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className="w-14 shrink-0 text-center text-sm font-bold text-primary">{ddayLabel(schedule.startsAt)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <CategoryBadge category={schedule.category} />
                <p className="truncate text-sm font-medium">{schedule.title.replace(/^\d{4}학년도\s*/, "")}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{range}</p>
            </div>
            {schedule.linkUrl ? (
              <Link href={schedule.linkUrl} target="_blank" className="shrink-0 text-muted-foreground hover:text-primary" aria-label="원문 보기">
                <ExternalLink className="h-4 w-4" />
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function NewsRows({ news }: { news: NewsItem[] }) {
  if (!news.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">등록된 뉴스가 아직 없어요.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {news.map((item) => (
        <li key={item.id} className="py-3 first:pt-0 last:pb-0">
          <Link href={`/c/transfer/news/${item.id}`} className="group block">
            <div className="flex items-start justify-between gap-3">
              <p className="line-clamp-2 text-sm font-semibold group-hover:text-primary">{item.title}</p>
              <span className="shrink-0 text-xs text-muted-foreground">{formatNewsDate(item.createdAt)}</span>
            </div>
            {item.summary ? <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.summary}</p> : null}
            {item.attachments.length ? (
              <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary">
                <Paperclip className="h-3 w-3" />
                첨부 {item.attachments.length}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
