import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
    const admin = getSupabaseAdmin();
    const { data: exams } = await admin.from("exams").select("id, slug, name");
    const { data: boards } = await admin.from("boards").select("id, slug, exam_id, name");

    return NextResponse.json({ exams, boards });
}
