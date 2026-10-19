import { NextResponse } from "next/server";
import { getBearerToken, getUserByAccessToken } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 글이나 댓글의 작성자를 차단한다. 익명 글도 작성자 id는 서버만 알고 있어 그대로 차단된다.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const targetType = body.targetType === "comment" ? "comment" : body.targetType === "post" ? "post" : "";
  const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";
  if (!targetType || !UUID_PATTERN.test(targetId)) {
    return NextResponse.json({ error: "차단할 대상을 확인할 수 없어요." }, { status: 400 });
  }

  const user = await getUserByAccessToken(getBearerToken(request));
  if (!user) {
    return NextResponse.json({ error: "로그인 후 차단할 수 있어요." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: target } = await admin
    .from(targetType === "post" ? "posts" : "comments")
    .select("author_id")
    .eq("id", targetId)
    .maybeSingle<{ author_id: string | null }>();
  const blockedId = target?.author_id ?? null;
  if (!blockedId) {
    return NextResponse.json({ error: "차단할 수 없는 작성자예요." }, { status: 400 });
  }
  if (blockedId === user.id) {
    return NextResponse.json({ error: "내 글은 차단할 수 없어요." }, { status: 400 });
  }

  const { error } = await admin
    .from("user_blocks")
    .upsert({ blocker_id: user.id, blocked_id: blockedId }, { onConflict: "blocker_id,blocked_id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// 차단한 사람을 모두 해제한다.
export async function DELETE(request: Request) {
  const user = await getUserByAccessToken(getBearerToken(request));
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  const { error } = await getSupabaseAdmin().from("user_blocks").delete().eq("blocker_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
