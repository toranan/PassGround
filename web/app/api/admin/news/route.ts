import { NextResponse } from "next/server";
import { COMMUNITY_BOARD_GROUPS } from "@/lib/data";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getBearerToken, getUserByAccessToken, isAdminUser } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Exam = "transfer" | "cpa";

type NewsRow = {
  id: string;
  title: string;
  content: string;
  created_at: string;
};

function resolveExam(value: string): Exam | null {
  if (value === "transfer" || value === "cpa") return value;
  return null;
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeOptionalUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractFirstLink(content: string): string | null {
  const markdownMatch = content.match(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/i);
  if (markdownMatch?.[1]) return markdownMatch[1];
  const rawMatch = content.match(/https?:\/\/[^\s)]+/i);
  if (rawMatch?.[0]) return rawMatch[0];
  return null;
}

function validateExam(exam: Exam | null) {
  if (!exam) {
    return NextResponse.json({ error: "지원하지 않는 시험 카테고리입니다." }, { status: 400 });
  }
  if (exam === "cpa" && !ENABLE_CPA) {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }
  return null;
}

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

  return { ok: true as const, user };
}

async function ensureNewsBoard(exam: Exam): Promise<{ boardId: string } | { error: string }> {
  const admin = getSupabaseAdmin();
  const examMeta = COMMUNITY_BOARD_GROUPS.find((group) => group.examSlug === exam);
  const boardMeta = examMeta?.boards.find((board) => board.slug === "news");

  const { data: examData, error: examError } = await admin
    .from("exams")
    .upsert(
      {
        name: examMeta?.examName ?? exam,
        slug: exam,
        description: examMeta?.description ?? null,
      },
      { onConflict: "slug" }
    )
    .select("id")
    .single<{ id: string }>();

  if (examError || !examData?.id) {
    return { error: examError?.message ?? "시험 정보를 생성하지 못했습니다." };
  }

  const { data: boardData, error: boardError } = await admin
    .from("boards")
    .upsert(
      {
        exam_id: examData.id,
        name: boardMeta?.name ?? "최신뉴스",
        slug: "news",
        description: boardMeta?.description ?? "운영팀이 업로드하는 최신 공지/입시 뉴스",
      },
      { onConflict: "exam_id,slug" }
    )
    .select("id")
    .single<{ id: string }>();

  if (boardError || !boardData?.id) {
    return { error: boardError?.message ?? "뉴스 게시판 정보를 생성하지 못했습니다." };
  }

  return { boardId: boardData.id };
}

async function loadNews(boardId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("posts")
    .select("id,title,content,created_at")
    .eq("board_id", boardId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(120);

  if (error) {
    return { error: error.message };
  }

  return {
    news: (data as NewsRow[] | null | undefined)?.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      linkUrl: extractFirstLink(item.content),
      createdAt: item.created_at,
    })) ?? [],
  };
}

export async function GET(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const exam = resolveExam(searchParams.get("exam")?.trim() || "transfer");
  const examError = validateExam(exam);
  if (examError) return examError;

  const board = await ensureNewsBoard(exam as Exam);
  if ("error" in board) {
    return NextResponse.json({ error: board.error }, { status: 400 });
  }

  const result = await loadNews(board.boardId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const exam = resolveExam(normalizeText(body.exam, 20) || "transfer");
  const examError = validateExam(exam);
  if (examError) return examError;

  const title = normalizeText(body.title, 120);
  const rawContent = normalizeText(body.content, 6000);
  const linkUrl = normalizeOptionalUrl(body.linkUrl);
  const authorName = normalizeText(body.authorName, 40) || "합격판 운영팀";

  if (!title) {
    return NextResponse.json({ error: "뉴스 제목은 필수입니다." }, { status: 400 });
  }
  if (typeof body.linkUrl === "string" && body.linkUrl.trim() && !linkUrl) {
    return NextResponse.json({ error: "linkUrl 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const linkMarkdown = linkUrl ? `🔗 [관련 링크](${linkUrl})` : "";
  const contentHasSameLink = Boolean(linkUrl && rawContent.includes(linkUrl));
  const content = linkMarkdown && !contentHasSameLink
    ? rawContent
      ? `${rawContent}\n\n${linkMarkdown}`
      : linkMarkdown
    : rawContent;

  if (!content) {
    return NextResponse.json({ error: "뉴스 내용 또는 링크는 필수입니다." }, { status: 400 });
  }

  const board = await ensureNewsBoard(exam as Exam);
  if ("error" in board) {
    return NextResponse.json({ error: board.error }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  let { error: insertError } = await admin.from("posts").insert({
    board_id: board.boardId,
    author_name: authorName,
    title,
    content,
    post_type: "general",
    view_count: 0,
  });

  if (insertError?.message?.includes("post_type") || insertError?.message?.includes("view_count")) {
    const retry = await admin.from("posts").insert({
      board_id: board.boardId,
      author_name: authorName,
      title,
      content,
    });
    insertError = retry.error;
  }

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  const result = await loadNews(board.boardId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...result });
}

export async function DELETE(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const exam = resolveExam(normalizeText(body.exam, 20) || "transfer");
  const examError = validateExam(exam);
  if (examError) return examError;

  const id = normalizeText(body.id, 80);
  if (!id) {
    return NextResponse.json({ error: "삭제할 뉴스 id가 필요합니다." }, { status: 400 });
  }

  const board = await ensureNewsBoard(exam as Exam);
  if ("error" in board) {
    return NextResponse.json({ error: board.error }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("posts").delete().eq("id", id).eq("board_id", board.boardId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const result = await loadNews(board.boardId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...result });
}
