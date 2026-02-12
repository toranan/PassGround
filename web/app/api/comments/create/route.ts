import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";

// UUID 형식 검증
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const postId = typeof body.postId === "string" ? body.postId.trim() : "";
  const rawAuthorName = typeof body.authorName === "string" ? body.authorName.trim() : "";
  const authorName = rawAuthorName && rawAuthorName.length >= 2 ? rawAuthorName : "익명";
  const content = typeof body.content === "string" ? body.content.trim() : "";

  const parentId = typeof body.parentId === "string" && body.parentId.trim() ? body.parentId.trim() : null;

  if (!postId) {
    return NextResponse.json({ error: "게시글 정보가 없습니다." }, { status: 400 });
  }

  // UUID 형식 검증 (샘플 게시글은 UUID 형식이 아님)
  if (!isValidUUID(postId)) {
    return NextResponse.json({ error: "샘플 게시글에는 댓글을 작성할 수 없습니다." }, { status: 400 });
  }
  if (parentId && !isValidUUID(parentId)) {
    return NextResponse.json({ error: "유효하지 않은 답글 대상입니다." }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "댓글 내용을 입력해 주세요." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: postData, error: postError } = await admin
    .from("posts")
    .select("id,board_id")
    .eq("id", postId)
    .maybeSingle<{ id: string; board_id: string | null }>();

  if (postError || !postData?.id || !postData.board_id) {
    return NextResponse.json({ error: "게시글 정보를 확인할 수 없습니다." }, { status: 404 });
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
      { error: "현재 CPA는 읽기 전용입니다. 댓글 작성은 편입 커뮤니티에서 가능합니다." },
      { status: 403 }
    );
  }

  const { error: insertError } = await admin.from("comments").insert({
    post_id: postId,
    parent_id: parentId,
    author_name: authorName,
    content,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
