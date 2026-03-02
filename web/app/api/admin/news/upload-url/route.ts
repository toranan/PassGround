import { NextResponse } from "next/server";
import { getBearerToken, getUserByAccessToken, isAdminUser } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function ensureAdmin(request: Request) {
  const token = getBearerToken(request);
  const user = await getUserByAccessToken(token);
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }),
    };
  }

  const allowed = await isAdminUser(user.id, user.email);
  if (!allowed) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

async function ensureAttachmentsBucket(admin: ReturnType<typeof getSupabaseAdmin>): Promise<string | null> {
  const { data: bucket, error: bucketError } = await admin.storage.getBucket("attachments");

  if (bucketError) {
    const message = bucketError.message || "";
    const isNotFound = /not found|does not exist/i.test(message);
    if (!isNotFound) {
      return message || "attachments 버킷 조회에 실패했습니다.";
    }

    const { error: createError } = await admin.storage.createBucket("attachments", { public: true });
    if (createError && !/already exists/i.test(createError.message || "")) {
      return createError.message || "attachments 버킷 생성에 실패했습니다.";
    }
    return null;
  }

  if (bucket && bucket.public === false) {
    const { error: updateError } = await admin.storage.updateBucket("attachments", { public: true });
    if (updateError) {
      return updateError.message || "attachments 버킷 공개 설정에 실패했습니다.";
    }
  }

  return null;
}

function normalizeFilename(name: unknown): string {
  if (typeof name !== "string") return "";
  return name.trim().replace(/[\r\n]+/g, "").slice(0, 200);
}

function normalizeMimeType(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().slice(0, 200);
}

function normalizeSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  return Math.floor(value);
}

export async function POST(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const filename = normalizeFilename((body as { filename?: unknown }).filename);
  const mimeType = normalizeMimeType((body as { mimeType?: unknown }).mimeType);
  const size = normalizeSize((body as { size?: unknown }).size);

  if (!filename) {
    return NextResponse.json({ error: "파일 이름이 필요합니다." }, { status: 400 });
  }

  const maxSize = 15 * 1024 * 1024;
  if (size <= 0 || size > maxSize) {
    return NextResponse.json({ error: "파일 크기는 15MB 이하여야 합니다." }, { status: 400 });
  }

  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const allowedTypes = new Set([
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
  ]);
  const isHwp = ext === "hwp";
  if (!allowedTypes.has(mimeType) && !isHwp) {
    return NextResponse.json({ error: "지원하지 않는 파일 형식입니다." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const bucketError = await ensureAttachmentsBucket(admin);
  if (bucketError) {
    return NextResponse.json({ error: `스토리지 버킷 설정 오류: ${bucketError}` }, { status: 500 });
  }

  const safeExt = ext || "bin";
  const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExt}`;
  const path = `posts/${storedName}`;

  const { data, error } = await admin.storage.from("attachments").createSignedUploadUrl(path, {
    upsert: false,
  });
  if (error || !data?.token) {
    return NextResponse.json({ error: error?.message || "업로드 URL 발급에 실패했습니다." }, { status: 400 });
  }

  const { data: publicUrlData } = admin.storage.from("attachments").getPublicUrl(path);

  return NextResponse.json({
    ok: true,
    bucket: "attachments",
    path,
    token: data.token,
    publicUrl: publicUrlData.publicUrl,
    filename,
    mimeType,
  });
}
