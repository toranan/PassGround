import { NextResponse } from "next/server";
import { getBearerToken, getUserByAccessToken } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type NotificationRow = {
  id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  post_id: string | null;
  comment_id: string | null;
  exam_slug: string | null;
  board_slug: string | null;
  actor_name: string | null;
  is_read: boolean | null;
  created_at: string | null;
};

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function formatRelativeTime(value: string | null): string {
  if (!value) return "방금 전";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "방금 전";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString("ko-KR");
}

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedUserId = (searchParams.get("userId") ?? "").trim();
    const requestedLimit = Number(searchParams.get("limit") ?? "30");
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
      : 30;

    const token = getBearerToken(request);
    const authed = await getUserByAccessToken(token);
    if (!authed?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    if (requestedUserId && (!isValidUUID(requestedUserId) || requestedUserId !== authed.id)) {
      return NextResponse.json({ error: "본인 알림만 조회할 수 있습니다." }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("notifications")
      .select("id,type,title,body,post_id,comment_id,exam_slug,board_slug,actor_name,is_read,created_at")
      .eq("recipient_id", authed.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      const message = (error.message ?? "").toLowerCase();
      if (error.code === "42P01" || message.includes('relation "notifications" does not exist')) {
        return noStore(
          NextResponse.json({
            ok: true,
            unreadCount: 0,
            items: [],
            source: "notifications_table_missing",
          })
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { count } = await admin
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", authed.id)
      .eq("is_read", false);

    const rows = (data ?? []) as NotificationRow[];
    const items = rows.map((row) => ({
      id: row.id,
      type: row.type ?? "new_comment",
      title: row.title ?? "새 알림",
      body: row.body ?? "",
      postId: row.post_id,
      commentId: row.comment_id,
      examSlug: row.exam_slug,
      boardSlug: row.board_slug,
      actorName: row.actor_name ?? null,
      isRead: Boolean(row.is_read),
      createdAt: row.created_at,
      timeLabel: formatRelativeTime(row.created_at),
    }));

    return noStore(
      NextResponse.json({
        ok: true,
        unreadCount: count ?? 0,
        items,
      })
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서버 오류" },
      { status: 500 }
    );
  }
}

