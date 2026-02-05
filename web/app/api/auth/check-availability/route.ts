import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!username && !nickname && !email) {
      return NextResponse.json({ error: "값이 없습니다." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    if (username) {
      const { data, error } = await admin
        .from("profiles")
        .select("id")
        .eq("username", username)
        .limit(1);
      if (error) {
        return NextResponse.json({ error: error.message, stage: "username" }, { status: 400 });
      }
      return NextResponse.json({ available: data.length === 0 });
    }

    if (nickname) {
      const { data, error } = await admin
        .from("profiles")
        .select("id")
        .eq("display_name", nickname)
        .limit(1);
      if (error) {
        return NextResponse.json({ error: error.message, stage: "nickname" }, { status: 400 });
      }
      return NextResponse.json({ available: data.length === 0 });
    }

    if (email) {
      console.log(`[CheckAvailability] Checking email: ${email}`);

      // Use listUsers and filter client-side (no direct email lookup available)
      const { data, error } = await admin.auth.admin.listUsers();

      if (error) {
        console.log(`[CheckAvailability] listUsers error:`, error);
        return NextResponse.json({ error: error.message, stage: "email" }, { status: 400 });
      }

      const users = data?.users || [];
      const found = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      console.log(`[CheckAvailability] Email ${email} found: ${!!found}`);
      return NextResponse.json({ available: !found });
    }

    return NextResponse.json({ available: false });
  } catch (error) {
    console.error("[CheckAvailability] Server error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서버 오류", stage: "server" },
      { status: 500 }
    );
  }
}
