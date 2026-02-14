import { NextResponse } from "next/server";
import {
  getBearerToken,
  getConfiguredAdminEmails,
  getUserByAccessToken,
  isAdminUser,
} from "@/lib/authServer";

export async function GET(request: Request) {
  const accessToken = getBearerToken(request);
  const user = await getUserByAccessToken(accessToken);

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const adminEmails = getConfiguredAdminEmails();
  const isAdmin = await isAdminUser(user.id, user.email);
  const canBootstrap = adminEmails.includes(user.email.toLowerCase());

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
    },
    isAdmin,
    canBootstrap,
    adminEmailConfigured: adminEmails.length > 0,
  });
}
