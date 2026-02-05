import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

// UUID 형식 검증
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const postId = typeof body.postId === "string" ? body.postId.trim() : "";
  const authorName = typeof body.authorName === "string" ? body.authorName.trim() : "";
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
  if (!authorName || authorName.length < 2) {
    return NextResponse.json({ error: "닉네임은 2자 이상이어야 합니다." }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "댓글 내용을 입력해 주세요." }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  const { error: insertError } = await supabase.from("comments").insert({
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
