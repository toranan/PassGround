import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const requesterName = typeof body.requesterName === "string" ? body.requesterName.trim() : "";
    const examSlug = typeof body.examSlug === "string" ? body.examSlug.trim() : "";
    const verificationType = typeof body.verificationType === "string" ? body.verificationType.trim() : "";
    const evidenceUrl = typeof body.evidenceUrl === "string" ? body.evidenceUrl.trim() : "";
    const memo = typeof body.memo === "string" ? body.memo.trim() : "";
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";

    if (!requesterName || requesterName.length < 2) {
      return NextResponse.json({ error: "요청자 이름을 확인해 주세요." }, { status: 400 });
    }

    if (examSlug !== "transfer" && examSlug !== "cpa") {
      return NextResponse.json({ error: "시험 구분이 올바르지 않습니다." }, { status: 400 });
    }
    if (!ENABLE_CPA && examSlug === "cpa") {
      return NextResponse.json({ error: "현재 CPA 인증은 비활성화 상태입니다." }, { status: 403 });
    }
    if (examSlug === "cpa" && !ENABLE_CPA_WRITE) {
      return NextResponse.json(
        { error: "현재 CPA는 읽기 전용입니다. 인증 신청은 추후 오픈 예정입니다." },
        { status: 403 }
      );
    }

    if (!verificationType) {
      return NextResponse.json({ error: "인증 유형을 선택해 주세요." }, { status: 400 });
    }

    if (!evidenceUrl) {
      return NextResponse.json({ error: "합격증 이미지를 업로드해 주세요." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    const { error } = await admin.from("verification_requests").insert({
      profile_id: userId && isValidUUID(userId) ? userId : null,
      requester_name: requesterName,
      exam_slug: examSlug,
      verification_type: verificationType,
      evidence_url: evidenceUrl,
      memo: memo || null,
      status: "pending",
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서버 오류" },
      { status: 500 }
    );
  }
}
