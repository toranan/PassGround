import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const username = typeof body.username === "string" ? body.username.trim() : "";
        const password = typeof body.password === "string" ? body.password : "";

        if (!username || !password) {
            return NextResponse.json({ error: "아이디와 비밀번호를 입력해 주세요." }, { status: 400 });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
        }

        // Create admin client to look up email by username
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceKey) {
            return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
        }

        const admin = createClient(supabaseUrl, serviceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
                detectSessionInUrl: false,
            },
        });

        // Look up email by username from profiles table
        const { data: profileData, error: profileError } = await admin
            .from("profiles")
            .select("id, display_name")
            .eq("username", username)
            .limit(1)
            .single();

        if (profileError || !profileData) {
            console.log("[Login] Username not found:", username);
            return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
        }

        console.log("[Login] Profile data:", profileData);

        // Get user email from auth.users using listUsers
        const { data: usersData, error: usersError } = await admin.auth.admin.listUsers();

        if (usersError) {
            console.log("[Login] listUsers error:", usersError);
            return NextResponse.json({ error: "서버 오류" }, { status: 500 });
        }

        const user = usersData?.users?.find((u) => u.id === profileData.id);

        if (!user || !user.email) {
            return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
        }

        // Now sign in with email and password using anon client
        const anonClient = createClient(supabaseUrl, supabaseAnonKey);
        const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
            email: user.email,
            password,
        });

        if (signInError || !signInData.session) {
            console.log("[Login] signInWithPassword error:", signInError);
            return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
        }

        // Return session tokens
        return NextResponse.json({
            ok: true,
            user: {
                id: signInData.user.id,
                email: signInData.user.email,
                username: username,
                nickname: profileData.display_name || username,
            },
            session: {
                access_token: signInData.session.access_token,
                refresh_token: signInData.session.refresh_token,
                expires_at: signInData.session.expires_at,
            },
        });
    } catch (error) {
        console.error("[Login] Server error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "서버 오류" },
            { status: 500 }
        );
    }
}
