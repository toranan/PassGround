import { NextResponse } from "next/server";
import { getBearerToken, getUserByAccessToken } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}

function formatPhoneNumber(digits: string): string {
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    if (digits.startsWith("02")) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 9 && digits.startsWith("02")) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  return digits;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const rawPhoneNumber = normalizeText(body.phoneNumber, 40);
  const phoneDigits = normalizePhoneDigits(rawPhoneNumber);

  if (phoneDigits.length < 9 || phoneDigits.length > 11) {
    return NextResponse.json({ error: "전화번호 형식을 확인해 주세요." }, { status: 400 });
  }

  const sourcePath = normalizeText(body.sourcePath, 120) || "/";
  const accessToken = getBearerToken(request);
  const user = accessToken ? await getUserByAccessToken(accessToken) : null;
  const admin = getSupabaseAdmin();

  const meta = {
    source: "consultation_request",
    phoneNumber: formatPhoneNumber(phoneDigits),
    phoneDigits,
    sourcePath,
    userId: user?.id ?? "",
    userEmail: user?.email ?? "",
  };

  const { error } = await admin.from("ai_chat_logs").insert({
    exam_slug: "transfer",
    question: "전화 상담 신청",
    answer: JSON.stringify(meta),
    route: "consultation_request",
    top_chunk_ids: [],
    top_knowledge_item_ids: [],
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    message: "상담 신청이 접수되었습니다. 입력하신 번호로 연락드릴게요.",
  });
}
