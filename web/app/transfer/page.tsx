import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseNewsContent, type NewsAttachment } from "@/lib/newsResources";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type NewsRow = {
  id: string;
  title: string;
  summary: string;
  boardSlug: string;
  createdAt: string | null;
  linkUrl: string | null;
  attachments: NewsAttachment[];
};

type ScheduleRow = {
  id: string;
  university: string | null;
  title: string;
  category: string;
  startsAt: string;
  linkUrl: string | null;
};

type FeedBundle = {
  latestNews: NewsRow[];
};

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "방금";
  if (dateString.includes("분") || dateString.includes("시간") || dateString.includes("일")) {
    return dateString;
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "방금";

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분`;
  if (diffHour < 24) return `${diffHour}시간`;
  if (diffDay < 7) return `${diffDay}일`;
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

function formatScheduleDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
}

function toTimestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 0;
  return parsed.getTime();
}

function compactSummary(value: string, max = 96): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trim()}...`;
}

async function loadFeeds(): Promise<FeedBundle> {
  const supabase = getSupabaseServer();

  const { data: examData } = await supabase.from("exams").select("id").eq("slug", "transfer").maybeSingle();
  if (!examData?.id) {
    return {
      latestNews: [],
    };
  }

  const { data: boardRows } = await supabase
    .from("boards")
    .select("id,slug,name")
    .eq("exam_id", examData.id)
    .eq("slug", "news")
    .limit(1);

  if (!boardRows?.length) {
    return {
      latestNews: [],
    };
  }

  const board = boardRows[0] as { id: string; slug: string };
  const { data: postsData } = await supabase
    .from("posts")
    .select("id,title,content,created_at")
    .eq("board_id", board.id)
    .order("created_at", { ascending: false })
    .limit(24);

  if (!postsData?.length) {
    return {
      latestNews: [],
    };
  }

  const latestNews = postsData.map((post: {
    id: string;
    title: string;
    content: string | null;
    created_at: string | null;
  }) => {
    const parsed = parseNewsContent(post.content || "");

    return {
      id: post.id,
      title: post.title,
      summary: compactSummary(parsed.body || post.content || ""),
      boardSlug: board.slug,
      createdAt: post.created_at,
      linkUrl: parsed.linkUrl,
      attachments: parsed.attachments,
    } satisfies NewsRow;
  });

  return {
    latestNews,
  };
}

async function loadSchedules(): Promise<ScheduleRow[]> {
  const supabase = getSupabaseServer();

  const primary = await supabase
    .from("exam_schedules")
    .select("id,university,title,category,starts_at,link_url,is_official")
    .eq("exam_slug", "transfer")
    .eq("is_official", true)
    .order("starts_at", { ascending: true })
    .limit(120);

  let rows = primary.data as
    | Array<{
      id: string;
      university: string | null;
      title: string;
      category: string;
      starts_at: string;
      link_url: string | null;
    }>
    | null;

  if (primary.error && primary.error.message?.toLowerCase().includes("university")) {
    const fallback = await supabase
      .from("exam_schedules")
      .select("id,title,category,starts_at,link_url,is_official")
      .eq("exam_slug", "transfer")
      .eq("is_official", true)
      .order("starts_at", { ascending: true })
      .limit(120);

    rows = ((fallback.data as Array<{
      id: string;
      title: string;
      category: string;
      starts_at: string;
      link_url: string | null;
    }> | null) ?? []).map((item) => ({
      ...item,
      university: null,
    }));
  }

  if (!rows?.length) return [];

  const now = Date.now();
  const upcoming = rows
    .map((item) => ({
      id: item.id,
      university: item.university,
      title: item.title,
      category: item.category,
      startsAt: item.starts_at,
      linkUrl: item.link_url,
      startsAtTs: toTimestamp(item.starts_at),
    }))
    .filter((item) => item.startsAtTs >= now - 86400000)
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      university: item.university,
      title: item.title,
      category: item.category,
      startsAt: item.startsAt,
      linkUrl: item.linkUrl,
    }));

  if (upcoming.length > 0) return upcoming;

  return rows.slice(0, 6).map((item) => ({
    id: item.id,
    university: item.university,
    title: item.title,
    category: item.category,
    startsAt: item.starts_at,
    linkUrl: item.link_url,
  }));
}

export default async function TransferPage() {
  const [feedRows, schedules] = await Promise.all([loadFeeds(), loadSchedules()]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="border-b bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.13),transparent_58%)]">
          <div className="container mx-auto px-4 py-10">
            <h1 className="font-display text-3xl md:text-4xl font-bold text-primary">합격판 편입 공지</h1>
            <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
              편입 일정, 대학별 공지, 운영팀이 정리한 주요 안내만 빠르게 확인하세요.
            </p>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4 space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
              <Card className="border border-border shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-xl">최신 공지</CardTitle>
                  <Link href="/c/transfer/news" className="text-xs text-muted-foreground hover:text-primary">
                    전체보기
                  </Link>
                </CardHeader>
                <CardContent className="divide-y divide-border">
                  {feedRows.latestNews.map((row) => (
                    <article key={row.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <Link href={`/c/transfer/${row.boardSlug}/${row.id}`} className="min-w-0 hover:text-primary transition-colors">
                          <p className="text-sm font-semibold line-clamp-1">{row.title}</p>
                          {row.summary ? (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{row.summary}</p>
                          ) : null}
                        </Link>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(row.createdAt)}</span>
                      </div>
                      {(row.linkUrl || row.attachments.length > 0) ? (
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {row.linkUrl ? (
                            <Link href={row.linkUrl} target="_blank" className="text-primary hover:underline">
                              원문
                            </Link>
                          ) : null}
                          {row.attachments.slice(0, 2).map((attachment, index) => (
                            <Link
                              key={`${attachment.url}-${index}`}
                              href={attachment.url}
                              target="_blank"
                              className="text-primary hover:underline"
                            >
                              첨부 {index + 1}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                  {!feedRows.latestNews.length && (
                    <p className="text-sm text-muted-foreground">등록된 공지가 아직 없어.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">주요 일정</CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border">
                  {schedules.map((schedule) => (
                    <div key={schedule.id} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-sm font-medium line-clamp-2">{schedule.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatScheduleDate(schedule.startsAt)} · {schedule.category}
                        {schedule.university ? ` · ${schedule.university}` : ""}
                      </p>
                      {schedule.linkUrl ? (
                        <Link href={schedule.linkUrl} target="_blank" className="mt-1 block text-xs text-primary hover:underline">
                          원문
                        </Link>
                      ) : null}
                    </div>
                  ))}
                  {!schedules.length && <p className="text-sm text-muted-foreground">등록된 일정이 아직 없어.</p>}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
