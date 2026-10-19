import { NextResponse } from "next/server";
import { after } from "next/server";
import { getBearerToken, getUserByAccessToken } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { AUTO_HIDE_REPORT_COUNT, REPORT_REASONS } from "@/lib/moderation";
import { sendPushToDevices } from "@/lib/apns";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 신고가 들어오면 관리자에게 앱 알림함 + 푸시로 알린다(24시간 안에 처리하기 위해).
async function notifyAdmins(params: { reporterId: string; targetType: string; reason: string; snippet: string; postId: string | null }) {
  const admin = getSupabaseAdmin();
  const { data: roles } = await admin.from("user_roles").select("user_id").in("role", ["admin", "moderator"]);
  const adminIds = Array.from(new Set(((roles ?? []) as { user_id: string }[]).map((row) => row.user_id)));
  if (!adminIds.length) return;

  const title = `새 신고 접수 (${params.targetType === "post" ? "게시글" : "댓글"} · ${params.reason})`;
  await admin.from("notifications").insert(
    adminIds.map((recipientId) => ({
      recipient_id: recipientId,
      actor_id: params.reporterId,
      actor_name: "신고",
      type: "report",
      title,
      body: params.snippet,
      post_id: params.postId,
      is_read: false,
    }))
  );

  const { data: devices } = await admin.from("push_devices").select("token,environment").in("user_id", adminIds);
  if (devices?.length) {
    await sendPushToDevices(devices as { token: string; environment: "sandbox" | "production" }[], {
      title: "합격판 신고 접수",
      body: `${title}\n${params.snippet}`,
    });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const targetType = body.targetType === "comment" ? "comment" : body.targetType === "post" ? "post" : "";
  const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";
  const reason = REPORT_REASONS.find((item) => item === body.reason) ?? "기타";
  if (!targetType || !UUID_PATTERN.test(targetId)) {
    return NextResponse.json({ error: "신고할 대상을 확인할 수 없어요." }, { status: 400 });
  }

  const user = await getUserByAccessToken(getBearerToken(request));
  if (!user) {
    return NextResponse.json({ error: "로그인 후 신고할 수 있어요." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const table = targetType === "post" ? "posts" : "comments";
  const { data: target } = await admin
    .from(table)
    .select(targetType === "post" ? "id,author_id,title,content" : "id,author_id,post_id,content")
    .eq("id", targetId)
    .maybeSingle<{ id: string; author_id: string | null; post_id?: string; title?: string; content: string | null }>();
  if (!target) {
    return NextResponse.json({ error: "이미 삭제된 글이에요." }, { status: 404 });
  }
  const postId = targetType === "post" ? target.id : target.post_id ?? null;

  const { error: insertError } = await admin.from("content_reports").insert({
    target_type: targetType,
    target_id: targetId,
    post_id: postId,
    reporter_id: user.id,
    reported_user_id: target.author_id,
    reason,
  });
  const alreadyReported = insertError?.code === "23505";
  if (insertError && !alreadyReported) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  if (!alreadyReported) {
    const { count } = await admin
      .from("content_reports")
      .select("id", { count: "exact", head: true })
      .eq("target_type", targetType)
      .eq("target_id", targetId);
    if ((count ?? 0) >= AUTO_HIDE_REPORT_COUNT) {
      await admin.from(table).update({ is_hidden: true }).eq("id", targetId);
    }

    const snippet = `${target.title ? `${target.title} · ` : ""}${target.content ?? ""}`.replace(/\s+/g, " ").slice(0, 80);
    after(() => notifyAdmins({ reporterId: user.id, targetType, reason, snippet, postId }).catch(() => undefined));
  }

  return NextResponse.json({ ok: true });
}
