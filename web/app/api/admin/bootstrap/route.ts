import { NextResponse } from "next/server";
import {
  getBearerToken,
  getConfiguredAdminEmails,
  getUserByAccessToken,
  isAdminUser,
} from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function sanitizeUsername(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (normalized.length >= 3) return normalized.slice(0, 24);
  return "";
}

export async function POST(request: Request) {
  const accessToken = getBearerToken(request);
  const user = await getUserByAccessToken(accessToken);

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const alreadyAdmin = await isAdminUser(user.id, user.email);
  if (alreadyAdmin) {
    return NextResponse.json({ ok: true, isAdmin: true, upgraded: false });
  }

  const allowedEmails = getConfiguredAdminEmails();
  if (!allowedEmails.includes(user.email.toLowerCase())) {
    return NextResponse.json(
      { error: "관리자 승격 권한이 없습니다. ADMIN_EMAILS 설정을 확인해 주세요." },
      { status: 403 }
    );
  }

  const admin = getSupabaseAdmin();
  const usernameSeed = sanitizeUsername(user.email.split("@")[0]) || `user_${user.id.slice(0, 8)}`;

  await admin.from("profiles").upsert({
    id: user.id,
    username: usernameSeed,
    display_name: user.email.split("@")[0].slice(0, 30),
  });

  const { error } = await admin.from("user_roles").upsert(
    { user_id: user.id, role: "admin" },
    { onConflict: "user_id,role" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, isAdmin: true, upgraded: true });
}
