import { NextResponse } from "next/server";
import { REWARD_RULES } from "@/lib/data";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const postId = typeof body.postId === "string" ? body.postId.trim() : "";
    const commentId = typeof body.commentId === "string" ? body.commentId.trim() : "";
    const adopterName = typeof body.adopterName === "string" ? body.adopterName.trim() : "";

    if (!isValidUUID(postId) || !isValidUUID(commentId)) {
      return NextResponse.json({ error: "유효하지 않은 요청입니다." }, { status: 400 });
    }

    if (!adopterName) {
      return NextResponse.json({ error: "로그인 정보가 필요합니다." }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    const { data: postData, error: postError } = await admin
      .from("posts")
      .select("id,author_name,board_id")
      .eq("id", postId)
      .maybeSingle<{ id: string; author_name: string | null; board_id: string | null }>();

    if (postError || !postData?.id || !postData.board_id) {
      return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
    }

    const { data: boardData } = await admin
      .from("boards")
      .select("exams!inner(slug)")
      .eq("id", postData.board_id)
      .maybeSingle<{ exams: { slug: string } | { slug: string }[] | null }>();

    const examInfo = boardData?.exams;
    const examSlug = Array.isArray(examInfo) ? examInfo[0]?.slug : examInfo?.slug;

    if (examSlug === "cpa" && !ENABLE_CPA) {
      return NextResponse.json({ error: "현재 CPA 서비스는 비활성화 상태입니다." }, { status: 403 });
    }

    if (examSlug === "cpa" && !ENABLE_CPA_WRITE) {
      return NextResponse.json(
        { error: "현재 CPA는 읽기 전용입니다. 답변 채택은 편입 커뮤니티에서 가능합니다." },
        { status: 403 }
      );
    }

    if ((postData.author_name || "").trim() !== adopterName) {
      return NextResponse.json({ error: "게시글 작성자만 채택할 수 있습니다." }, { status: 403 });
    }

    const { data: existingAdoption } = await admin
      .from("answer_adoptions")
      .select("id")
      .eq("post_id", postId)
      .maybeSingle<{ id: string }>();

    if (existingAdoption?.id) {
      return NextResponse.json({ error: "이미 채택된 답변이 있습니다." }, { status: 409 });
    }

    const { data: commentData, error: commentError } = await admin
      .from("comments")
      .select("id,post_id,author_name")
      .eq("id", commentId)
      .maybeSingle<{ id: string; post_id: string; author_name: string | null }>();

    if (commentError || !commentData?.id || commentData.post_id !== postId) {
      return NextResponse.json({ error: "댓글 정보를 확인할 수 없습니다." }, { status: 400 });
    }

    const selectedAuthorName = (commentData.author_name || "익명").trim() || "익명";

    const adoptedPointRule = REWARD_RULES.find((rule) => rule.id === "reward-adopted");
    const bonusPointRule = REWARD_RULES.find((rule) => rule.id === "reward-verified-bonus");
    const basePoints = adoptedPointRule?.points ?? 80;
    const verifiedBonus = bonusPointRule?.points ?? 20;

    let profileId: string | null = null;
    let isVerified = false;

    const { data: profileData } = await admin
      .from("profiles")
      .select("id,verification_level,points")
      .eq("display_name", selectedAuthorName)
      .limit(1)
      .maybeSingle<{ id: string; verification_level: string | null; points: number | null }>();

    if (profileData?.id) {
      profileId = profileData.id;
      isVerified = !!profileData.verification_level && profileData.verification_level !== "none";
    }

    const awarded = basePoints + (isVerified ? verifiedBonus : 0);

    const { error: adoptionInsertError } = await admin.from("answer_adoptions").insert({
      post_id: postId,
      comment_id: commentId,
      adopter_name: adopterName,
      selected_author_name: selectedAuthorName,
      points_awarded: awarded,
    });

    if (adoptionInsertError) {
      return NextResponse.json({ error: adoptionInsertError.message }, { status: 400 });
    }

    const { error: ledgerError } = await admin.from("point_ledger").insert({
      profile_id: profileId,
      receiver_name: selectedAuthorName,
      source: isVerified ? "채택 답변(인증 가산 포함)" : "채택 답변",
      amount: awarded,
      meta: {
        post_id: postId,
        comment_id: commentId,
      },
    });

    if (ledgerError) {
      return NextResponse.json({ error: ledgerError.message }, { status: 400 });
    }

    if (profileId) {
      const { error: updateError } = await admin.rpc("increment_profile_points", {
        target_profile_id: profileId,
        points_delta: awarded,
      });

      if (updateError) {
        const { data: currentProfile } = await admin
          .from("profiles")
          .select("points")
          .eq("id", profileId)
          .maybeSingle<{ points: number | null }>();

        await admin
          .from("profiles")
          .update({ points: (currentProfile?.points ?? 0) + awarded })
          .eq("id", profileId);
      }
    }

    return NextResponse.json({
      ok: true,
      awarded,
      selectedAuthorName,
      adoptedCommentId: commentId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "서버 오류" },
      { status: 500 }
    );
  }
}
