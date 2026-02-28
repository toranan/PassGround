import { NextResponse } from "next/server";
import { getBearerToken, getUserByAccessToken } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);
    const authed = await getUserByAccessToken(token);
    if (!authed?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body: Record<string, unknown> = await request.json().catch(() => ({}));
    const rawIds: unknown[] = Array.isArray(body.ids) ? body.ids : [];
    const requestedIds = rawIds
      .filter((value: unknown): value is string => typeof value === "string")
      .map((value: string) => value.trim());
    const ids = Array.from(new Set(requestedIds.filter((value) => isValidUUID(value))));
    const readAll = body.readAll === true || ids.length === 0;

    const admin = getSupabaseAdmin();

    if (readAll) {
      await admin
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("recipient_id", authed.id)
        .eq("is_read", false);
    } else {
      await admin
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("recipient_id", authed.id)
        .in("id", ids)
        .eq("is_read", false);
    }

    const { count } = await admin
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", authed.id)
      .eq("is_read", false);

    return NextResponse.json({
      ok: true,
      unreadCount: count ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서버 오류" },
      { status: 500 }
    );
  }
}
