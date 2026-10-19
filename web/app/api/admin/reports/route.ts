import { NextResponse } from "next/server";
import { getBearerToken, getUserByAccessToken, isAdminUser } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type ReportRow = {
  id: string;
  target_type: "post" | "comment";
  target_id: string;
  post_id: string | null;
  reported_user_id: string | null;
  reason: string;
  created_at: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ensureAdmin(request: Request) {
  const user = await getUserByAccessToken(getBearerToken(request));
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!(await isAdminUser(user.id, user.email))) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }
  return null;
}

// 처리 대기 중인 신고를 대상(글·댓글)별로 묶어서 보여준다.
export async function GET(request: Request) {
  const denied = await ensureAdmin(request);
  if (denied) return denied;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("content_reports")
    .select("id,target_type,target_id,post_id,reported_user_id,reason,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as ReportRow[];
  const groups = new Map<string, { rows: ReportRow[] }>();
  for (const row of rows) {
    const key = `${row.target_type}:${row.target_id}`;
    groups.set(key, { rows: [...(groups.get(key)?.rows ?? []), row] });
  }

  const postIds = rows.filter((row) => row.target_type === "post").map((row) => row.target_id);
  const commentIds = rows.filter((row) => row.target_type === "comment").map((row) => row.target_id);
  const userIds = Array.from(new Set(rows.map((row) => row.reported_user_id).filter((id): id is string => Boolean(id))));
  const [posts, comments, profiles] = await Promise.all([
    postIds.length
      ? admin.from("posts").select("id,title,content,author_name,is_hidden").in("id", postIds)
      : Promise.resolve({ data: [] }),
    commentIds.length
      ? admin.from("comments").select("id,content,author_name,is_hidden").in("id", commentIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? admin.from("profiles").select("id,display_name,banned_at").in("id", userIds)
      : Promise.resolve({ data: [] }),
  ]);
  type Content = { id: string; title?: string; content: string | null; author_name: string | null; is_hidden: boolean };
  const contentById = new Map<string, Content>(
    [...((posts.data ?? []) as Content[]), ...((comments.data ?? []) as Content[])].map((item) => [item.id, item])
  );
  const profileById = new Map(
    ((profiles.data ?? []) as { id: string; display_name: string | null; banned_at: string | null }[]).map((item) => [item.id, item])
  );

  const items = Array.from(groups.values()).map(({ rows: groupRows }) => {
    const first = groupRows[0];
    const content = contentById.get(first.target_id);
    const profile = first.reported_user_id ? profileById.get(first.reported_user_id) : undefined;
    return {
      targetType: first.target_type,
      targetId: first.target_id,
      postId: first.post_id,
      reportCount: groupRows.length,
      reasons: Array.from(new Set(groupRows.map((row) => row.reason))),
      latestAt: first.created_at,
      title: content?.title ?? null,
      content: content?.content ?? "(이미 삭제된 내용)",
      authorName: content?.author_name ?? null,
      authorAccountName: profile?.display_name ?? null,
      reportedUserId: first.reported_user_id,
      isHidden: content?.is_hidden ?? true,
      isBanned: Boolean(profile?.banned_at),
    };
  });

  return NextResponse.json({ ok: true, items });
}

// action: remove(글 숨김) · ban(숨김 + 작성자 이용정지) · dismiss(문제없음, 자동 숨김 해제)
export async function POST(request: Request) {
  const denied = await ensureAdmin(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const targetType = body.targetType === "comment" ? "comment" : body.targetType === "post" ? "post" : "";
  const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";
  const action = body.action;
  if (!targetType || !UUID_PATTERN.test(targetId) || !["remove", "ban", "dismiss"].includes(String(action))) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const table = targetType === "post" ? "posts" : "comments";
  const now = new Date().toISOString();

  if (action === "dismiss") {
    await admin.from(table).update({ is_hidden: false }).eq("id", targetId);
  } else {
    await admin.from(table).update({ is_hidden: true }).eq("id", targetId);
  }

  if (action === "ban") {
    const { data: target } = await admin.from(table).select("author_id").eq("id", targetId).maybeSingle<{ author_id: string | null }>();
    if (target?.author_id) {
      await admin.from("profiles").update({ banned_at: now }).eq("id", target.author_id);
    }
  }

  const { error } = await admin
    .from("content_reports")
    .update({ status: action === "dismiss" ? "dismissed" : "resolved", resolved_at: now })
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
