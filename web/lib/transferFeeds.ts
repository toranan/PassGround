// 웹 홈·최신뉴스·일정 페이지가 함께 쓰는 서버 조회 함수.
import { parseNewsContent, type NewsAttachment } from "@/lib/newsResources";
import { getSupabaseServer } from "@/lib/supabaseServer";

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  createdAt: string | null;
  linkUrl: string | null;
  attachments: NewsAttachment[];
};

export type ScheduleItem = {
  id: string;
  university: string | null;
  title: string;
  category: string;
  startsAt: string;
  endsAt: string | null;
  linkUrl: string | null;
};

export type CommunityPostItem = {
  id: string;
  boardSlug: string;
  boardName: string;
  title: string;
};

const COMMUNITY_BOARDS: Record<string, string> = {
  free: "자유게시판",
  qa: "합격전략",
  "study-qa": "학습질문",
  "admit-review": "합격수기",
};

function compactSummary(value: string, max = 110): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max).trim()}…`;
}

async function transferBoards(slugs: string[]) {
  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from("boards")
    .select("id,slug,exams!inner(slug)")
    .eq("exams.slug", "transfer")
    .in("slug", slugs);
  return (data ?? []) as Array<{ id: string; slug: string }>;
}

export async function loadLatestNews(limit = 30): Promise<NewsItem[]> {
  const [board] = await transferBoards(["news"]);
  if (!board) return [];
  const { data } = await getSupabaseServer()
    .from("posts")
    .select("id,title,content,created_at")
    .eq("board_id", board.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as Array<{ id: string; title: string; content: string | null; created_at: string | null }>).map((post) => {
    const parsed = parseNewsContent(post.content || "");
    return {
      id: post.id,
      title: post.title,
      summary: compactSummary(parsed.body || post.content || ""),
      createdAt: post.created_at,
      linkUrl: parsed.linkUrl,
      attachments: parsed.attachments,
    };
  });
}

// 지난 일정은 숨긴다. 종료시각이 지났거나, 종료시각이 없으면 한국시간 기준 당일이 지나면 제외한다.
export async function loadUpcomingSchedules(limit = 200): Promise<ScheduleItem[]> {
  const now = new Date();
  const kstToday = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayStartIso = new Date(`${kstToday}T00:00:00+09:00`).toISOString();
  const { data } = await getSupabaseServer()
    .from("exam_schedules")
    .select("id,university,title,category,starts_at,ends_at,link_url")
    .eq("exam_slug", "transfer")
    .eq("is_official", true)
    .or(`ends_at.gte.${now.toISOString()},and(ends_at.is.null,starts_at.gte.${todayStartIso})`)
    .order("starts_at", { ascending: true })
    .limit(limit);

  return ((data ?? []) as Array<{
    id: string;
    university: string | null;
    title: string;
    category: string;
    starts_at: string;
    ends_at: string | null;
    link_url: string | null;
  }>).map((row) => ({
    id: row.id,
    university: row.university,
    title: row.title,
    category: row.category,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    linkUrl: row.link_url,
  }));
}

export async function loadRecentCommunityPosts(limit = 8): Promise<CommunityPostItem[]> {
  const boards = await transferBoards(Object.keys(COMMUNITY_BOARDS));
  if (!boards.length) return [];
  const slugById = new Map(boards.map((board) => [board.id, board.slug]));
  const { data } = await getSupabaseServer()
    .from("posts")
    .select("id,title,board_id")
    .in("board_id", boards.map((board) => board.id))
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as Array<{ id: string; title: string; board_id: string }>).map((post) => {
    const boardSlug = slugById.get(post.board_id) ?? "free";
    return { id: post.id, boardSlug, boardName: COMMUNITY_BOARDS[boardSlug] ?? "커뮤니티", title: post.title };
  });
}

const KST_DATE = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short" });
const KST_DAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });

export function formatKstDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : KST_DATE.format(date);
}

export function formatNewsDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" }).format(date);
}

export function ddayLabel(value: string, now = new Date()): string {
  const target = Date.parse(`${KST_DAY_KEY.format(new Date(value))}T00:00:00Z`);
  const today = Date.parse(`${KST_DAY_KEY.format(now)}T00:00:00Z`);
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0) return "D-day";
  return diff > 0 ? `D-${diff}` : "진행 중";
}

export function monthKey(value: string): string {
  const [year, month] = KST_DAY_KEY.format(new Date(value)).split("-");
  return `${year}년 ${Number(month)}월`;
}
