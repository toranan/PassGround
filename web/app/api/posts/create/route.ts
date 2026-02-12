import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { COMMUNITY_BOARD_GROUPS } from "@/lib/data";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  let examSlug = typeof body.examSlug === "string" ? body.examSlug.trim() : "";
  let boardSlug = typeof body.boardSlug === "string" ? body.boardSlug.trim() : "";
  const rawAuthorName = typeof body.authorName === "string" ? body.authorName.trim() : "";
  const authorName = rawAuthorName && rawAuthorName.length >= 2 ? rawAuthorName : "익명";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!examSlug || !boardSlug) {
    const referer = request.headers.get("referer") ?? "";
    const match = referer.match(/\/c\/([^/]+)\/([^/]+)(?:\/|$)/);
    if (match) {
      examSlug = examSlug || decodeURIComponent(match[1]);
      boardSlug = boardSlug || decodeURIComponent(match[2]);
    }
  }

  if (!examSlug || !boardSlug) {
    return NextResponse.json({ error: "게시판 정보가 없습니다." }, { status: 400 });
  }
  if (!ENABLE_CPA && examSlug === "cpa") {
    return NextResponse.json({ error: "현재 CPA 서비스는 비활성화 상태입니다." }, { status: 403 });
  }
  if (examSlug === "cpa" && !ENABLE_CPA_WRITE) {
    return NextResponse.json(
      { error: "현재 CPA는 읽기 전용입니다. 게시글 작성은 편입에서 이용해 주세요." },
      { status: 403 }
    );
  }
  if (!title) {
    return NextResponse.json({ error: "제목을 입력해 주세요." }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const examMeta = COMMUNITY_BOARD_GROUPS.find((group) => group.examSlug === examSlug);
  const boardMeta = examMeta?.boards.find((board) => board.slug === boardSlug);
  const examName = examMeta?.examName ?? examSlug;
  const examDescription = examMeta?.description ?? null;
  const boardName =
    boardMeta?.name ?? (boardSlug === "free" ? "자유게시판" : boardSlug);
  const boardDescription = boardMeta?.description ?? null;

  const { data: examData, error: examError } = await admin
    .from("exams")
    .upsert(
      {
        name: examName,
        slug: examSlug,
        description: examDescription,
      },
      { onConflict: "slug" }
    )
    .select("id")
    .single();

  if (examError || !examData?.id) {
    return NextResponse.json({ error: examError?.message ?? "시험 정보 생성 실패" }, { status: 400 });
  }

  const { data: boardData, error: boardError } = await admin
    .from("boards")
    .upsert(
      {
        exam_id: examData.id,
        name: boardName,
        slug: boardSlug,
        description: boardDescription,
      },
      { onConflict: "exam_id,slug" }
    )
    .select("id")
    .single();

  if (boardError || !boardData?.id) {
    return NextResponse.json({ error: boardError?.message ?? "게시판 생성 실패" }, { status: 400 });
  }

  const postType =
    boardSlug === "qa" || boardSlug === "study-qa"
      ? "question"
      : boardSlug === "cutoff"
        ? "cutoff"
        : "general";

  let { error: insertError } = await admin.from("posts").insert({
    board_id: boardData.id,
    author_name: authorName,
    title,
    content,
    post_type: postType,
    view_count: 0,
  });

  // Backward compatibility for legacy schema without post_type/view_count
  if (insertError?.message?.includes("post_type") || insertError?.message?.includes("view_count")) {
    const retry = await admin.from("posts").insert({
      board_id: boardData.id,
      author_name: authorName,
      title,
      content,
    });
    insertError = retry.error;
  }

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
