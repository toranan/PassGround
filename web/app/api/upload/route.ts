import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const usageRaw = formData.get("usage");
    const usage = typeof usageRaw === "string" ? usageRaw.trim() : "post";

    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    }

    const isVerification = usage === "verification";
    const allowedTypes = isVerification
      ? ["image/jpeg", "image/png", "image/gif", "image/webp"]
      : [
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-powerpoint",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "application/zip",
          "application/x-zip-compressed",
          "text/plain",
        ];
    const ext = file.name.split(".").pop()?.toLowerCase();
    const isPostHwp = !isVerification && ext === "hwp";
    if (!allowedTypes.includes(file.type) && !isPostHwp) {
      return NextResponse.json({ error: "지원하지 않는 파일 형식입니다." }, { status: 400 });
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "파일 크기는 5MB 이하여야 합니다." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const timestamp = Date.now();
    const fileExt = file.name.split(".").pop() || "jpg";
    const filename = `${timestamp}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const folder = isVerification ? "verification" : "posts";
    const filepath = `${folder}/${filename}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await admin.storage.from("attachments").upload(filepath, buffer, {
      contentType: file.type,
      upsert: false,
    });

    if (uploadError) {
      console.error("[Upload] Error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const { data: urlData } = admin.storage.from("attachments").getPublicUrl(filepath);

    return NextResponse.json({
      ok: true,
      url: urlData.publicUrl,
      filename: file.name,
      usage: isVerification ? "verification" : "post",
    });
  } catch (error) {
    console.error("[Upload] Server error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "업로드 실패" },
      { status: 500 }
    );
  }
}
