import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
    const body = await request.json().catch(() => ({}));
    const postId = typeof body.postId === "string" ? body.postId.trim() : "";
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";

    if (!postId) {
        return NextResponse.json({ error: "게시글 정보가 없습니다." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Check if already liked
    const { data: existing } = await admin
        .from("post_likes")
        .select("id")
        .eq("post_id", postId)
        .eq("user_id", userId || "anonymous")
        .maybeSingle();

    if (existing) {
        // Unlike - delete the like
        await admin.from("post_likes").delete().eq("id", existing.id);
        return NextResponse.json({ ok: true, liked: false });
    } else {
        // Like - insert new like
        const { error } = await admin.from("post_likes").insert({
            post_id: postId,
            user_id: userId || null,
        });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({ ok: true, liked: true });
    }
}
