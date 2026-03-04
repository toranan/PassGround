import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { TransferHomeBanner } from "@/components/TransferHomeBanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseNewsContent, type NewsAttachment } from "@/lib/newsResources";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type FeedRow = {
  id: string;
  title: string;
  content: string;
  boardSlug: string;
  boardName: string;
  commentCount: number;
  likeCount: number;
  viewCount: number;
  createdAt: string | null;
  createdAtTs: number;
  hotScore: number;
};

type NewsRow = {
  id: string;
  title: string;
  summary: string;
  boardSlug: string;
  commentCount: number;
  likeCount: number;
  viewCount: number;
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
  realtimePosts: FeedRow[];
  latestPosts: FeedRow[];
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

function computeHotScore(post: {
  likeCount: number;
  commentCount: number;
  viewCount: number;
  createdAtTs: number;
}): number {
  const now = Date.now();
  const ageMs = Math.max(0, now - post.createdAtTs);
  const ageHours = ageMs / 3600000;
  const recencyBonus = ageHours <= 6 ? 6 : ageHours <= 24 ? 3 : ageHours <= 48 ? 1 : 0;
  return post.likeCount * 3 + post.commentCount * 2 + Math.min(8, Math.floor(post.viewCount / 25)) + recencyBonus;
}

function compactSummary(value: string, max = 120): string {
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
      realtimePosts: [],
      latestPosts: [],
    };
  }

  const { data: boardRows } = await supabase
    .from("boards")
    .select("id,slug,name")
    .eq("exam_id", examData.id)
    .in("slug", ["news", "free", "qa", "study-qa", "admit-review"]);

  if (!boardRows?.length) {
    return {
      latestNews: [],
      realtimePosts: [],
      latestPosts: [],
    };
  }

  const boardMetaById = new Map<string, { slug: string; name: string }>();
  boardRows.forEach((row: { id: string; slug: string; name: string }) => {
    boardMetaById.set(row.id, { slug: row.slug, name: row.name });
  });

  const boardIds = boardRows.map((row: { id: string }) => row.id);
  const { data: postsData } = await supabase
    .from("posts")
    .select("id,title,content,board_id,created_at,view_count")
    .in("board_id", boardIds)
    .order("created_at", { ascending: false })
    .limit(260);

  if (!postsData?.length) {
    return {
      latestNews: [],
      realtimePosts: [],
      latestPosts: [],
    };
  }

  const postIds = postsData.map((post: { id: string }) => post.id);
  const [{ data: commentRows }, { data: likeRows }] = await Promise.all([
    supabase.from("comments").select("post_id").in("post_id", postIds),
    supabase.from("post_likes").select("post_id").in("post_id", postIds),
  ]);

  const commentCountMap = new Map<string, number>();
  const likeCountMap = new Map<string, number>();

  (commentRows ?? []).forEach((row: { post_id: string }) => {
    commentCountMap.set(row.post_id, (commentCountMap.get(row.post_id) ?? 0) + 1);
  });
  (likeRows ?? []).forEach((row: { post_id: string }) => {
    likeCountMap.set(row.post_id, (likeCountMap.get(row.post_id) ?? 0) + 1);
  });

  const mapped = postsData.map((post: {
    id: string;
    title: string;
    content: string | null;
    board_id: string;
    created_at: string | null;
    view_count: number | null;
  }) => {
    const boardMeta = boardMetaById.get(post.board_id);
    const createdAtTs = toTimestamp(post.created_at);
    const likeCount = likeCountMap.get(post.id) ?? 0;
    const commentCount = commentCountMap.get(post.id) ?? 0;
    const viewCount = post.view_count ?? 0;

    return {
      id: post.id,
      title: post.title,
      content: post.content ?? "",
      boardSlug: boardMeta?.slug ?? "qa",
      boardName: boardMeta?.name ?? "게시판",
      commentCount,
      likeCount,
      viewCount,
      createdAt: post.created_at,
      createdAtTs,
      hotScore: computeHotScore({
        likeCount,
        commentCount,
        viewCount,
        createdAtTs,
      }),
    } satisfies FeedRow;
  });

  const latestNews = mapped
    .filter((item) => item.boardSlug === "news")
    .slice(0, 6)
    .map((item) => {
      const parsed = parseNewsContent(item.content || "");
      return {
        id: item.id,
        title: item.title,
        summary: compactSummary(parsed.body || item.content || ""),
        boardSlug: item.boardSlug,
        commentCount: item.commentCount,
        likeCount: item.likeCount,
        viewCount: item.viewCount,
        createdAt: item.createdAt,
        linkUrl: parsed.linkUrl,
        attachments: parsed.attachments,
      } satisfies NewsRow;
    });

  const communityPosts = mapped.filter((item) => item.boardSlug !== "news");

  const latestPosts = [...communityPosts]
    .sort((left, right) => right.createdAtTs - left.createdAtTs)
    .slice(0, 6);

  const realtimePosts = [...communityPosts]
    .sort((left, right) => {
      if (right.hotScore !== left.hotScore) return right.hotScore - left.hotScore;
      return right.createdAtTs - left.createdAtTs;
    })
    .slice(0, 6);

  return {
    latestNews,
    realtimePosts,
    latestPosts,
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
            <h1 className="font-display text-3xl md:text-4xl font-bold text-primary">편입을 준비하는 학생들을 위한 커뮤니티</h1>
            <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
              최신뉴스, 주요 일정, 실시간 인기글과 최신글을 한눈에 확인해.
            </p>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4 space-y-6">
            <TransferHomeBanner />
            <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-6">
            <div className="space-y-4">
              <Card className="border border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">🔥 실시간 인기글</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {feedRows.realtimePosts.map((row) => (
                    <Link
                      key={row.id}
                      href={`/c/transfer/${row.boardSlug}/${row.id}`}
                      className="block rounded-lg border border-border p-3 hover:bg-accent transition-colors"
                    >
                      <p className="text-sm font-medium line-clamp-2">{row.title}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {row.boardName} · {formatRelativeTime(row.createdAt)} · 댓글 {row.commentCount} · 좋아요 {row.likeCount} · 조회 {row.viewCount}
                      </p>
                    </Link>
                  ))}
                  {!feedRows.realtimePosts.length && (
                    <p className="text-sm text-muted-foreground">실시간 인기글이 아직 없어.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">🕒 최신글</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {feedRows.latestPosts.map((row) => (
                    <Link
                      key={row.id}
                      href={`/c/transfer/${row.boardSlug}/${row.id}`}
                      className="block rounded-lg border border-border p-3 hover:bg-accent transition-colors"
                    >
                      <p className="text-sm font-medium line-clamp-2">{row.title}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {row.boardName} · {formatRelativeTime(row.createdAt)} · 댓글 {row.commentCount} · 좋아요 {row.likeCount}
                      </p>
                    </Link>
                  ))}
                  {!feedRows.latestPosts.length && (
                    <p className="text-sm text-muted-foreground">최신글이 아직 없어.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="border border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">📰 최신뉴스</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {feedRows.latestNews.map((row) => (
                    <div key={row.id} className="rounded-lg border border-border p-3 space-y-2">
                      <Link href={`/c/transfer/${row.boardSlug}/${row.id}`} className="block hover:text-primary transition-colors">
                        <p className="text-sm font-semibold line-clamp-2">{row.title}</p>
                      </Link>
                      {row.summary ? <p className="text-xs text-muted-foreground line-clamp-2">{row.summary}</p> : null}
                      <p className="text-[11px] text-muted-foreground">
                        {formatRelativeTime(row.createdAt)} · 댓글 {row.commentCount} · 조회 {row.viewCount}
                      </p>

                      {row.linkUrl ? (
                        <Link href={row.linkUrl} target="_blank" className="block text-xs text-primary hover:underline">
                          관련 링크 열기
                        </Link>
                      ) : null}

                      {row.attachments.length > 0 ? (
                        <div className="space-y-1">
                          {row.attachments.slice(0, 2).map((attachment, index) => (
                            <Link
                              key={`${attachment.url}-${index}`}
                              href={attachment.url}
                              target="_blank"
                              className="block text-xs text-primary hover:underline"
                            >
                              📎 {attachment.filename}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {!feedRows.latestNews.length && (
                    <p className="text-sm text-muted-foreground">최신뉴스가 아직 없어.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">📅 주요 일정</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {schedules.map((schedule) => (
                    <div key={schedule.id} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-medium">{schedule.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatScheduleDate(schedule.startsAt)} · {schedule.category}
                        {schedule.university ? ` · ${schedule.university}` : ""}
                      </p>
                      {schedule.linkUrl ? (
                        <Link href={schedule.linkUrl} target="_blank" className="mt-1 block text-xs text-primary hover:underline">
                          일정 링크 열기
                        </Link>
                      ) : null}
                    </div>
                  ))}
                  {!schedules.length && <p className="text-sm text-muted-foreground">등록된 일정이 아직 없어.</p>}
                </CardContent>
              </Card>

              <Card className="border border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">인증/질문 접수</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>합격 인증을 하면 게시글/댓글에 대학 합격자 배지가 노출돼.</p>
                  <p>AI가 정보 부족으로 답하면 질문하기로 접수해서 운영팀이 반영해.</p>
                  <div className="pt-1 flex flex-wrap gap-2">
                    <Button asChild size="sm" className="bg-primary hover:bg-primary/90">
                      <Link href="/verification">인증 신청</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/mypage">마이페이지</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          </div>
        </section>
      </main>
    </div>
  );
}
