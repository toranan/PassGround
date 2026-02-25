import { NextResponse } from "next/server";
import { BOARD_POST_GROUPS, COMMUNITY_BOARD_GROUPS } from "@/lib/data";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServer } from "@/lib/supabaseServer";

type ParamsLike = { postId?: string };

type CommentRow = {
  id: string;
  author_name: string;
  content: string;
  created_at: string;
  parent_id: string | null;
};

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function formatRelativeTime(value: string | null): string {
  if (!value) return "방금 전";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "방금 전";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString("ko-KR");
}

function verificationLabel(level: string | null | undefined): string {
  switch (level) {
    case "transfer_passer":
      return "편입 합격";
    case "cpa_first_passer":
      return "CPA 1차 합격";
    case "cpa_accountant":
      return "현직 회계사";
    default:
      return "none";
  }
}

export async function GET(
  request: Request,
  context: { params: ParamsLike | Promise<ParamsLike> }
) {
  const resolved = await Promise.resolve(context.params);
  const postId = typeof resolved.postId === "string" ? resolved.postId : "";
  const { searchParams } = new URL(request.url);
  const exam = (searchParams.get("exam") ?? "").trim();
  const board = (searchParams.get("board") ?? "").trim();

  if (!exam || !board) {
    return NextResponse.json({ error: "exam, board 파라미터가 필요합니다." }, { status: 400 });
  }
  if (!postId) {
    return NextResponse.json({ error: "postId 파라미터가 필요합니다." }, { status: 400 });
  }

  if (!ENABLE_CPA && exam === "cpa") {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }

  const examInfo = COMMUNITY_BOARD_GROUPS.find((group) => group.examSlug === exam);
  const boardInfo = examInfo?.boards.find((item) => item.slug === board);
  if (!examInfo || !boardInfo) {
    return NextResponse.json({ error: "지원하지 않는 게시글 경로입니다." }, { status: 404 });
  }

  if (!isValidUUID(postId)) {
    const fallbackGroup = BOARD_POST_GROUPS.find(
      (group) => group.examSlug === exam && group.boardSlug === board
    );
    const fallbackPost = fallbackGroup?.posts.find((item) => item.id === postId);

    if (!fallbackPost) {
      return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      writable: !(exam === "cpa" && !ENABLE_CPA_WRITE),
      isSamplePost: true,
      board: { slug: boardInfo.slug, name: boardInfo.name },
      post: {
        id: fallbackPost.id,
        title: fallbackPost.title,
        content: `합격판 회원분들 안녕하세요.

이번에 ${fallbackPost.title} 관련해서 진짜 궁금한 점이 있어서 글 남깁니다.
주변에 물어봐도 다 말이 다르고, 인터넷에는 광고밖에 없어서 너무 답답하네요 ㅠㅠ

혹시 경험해 보신 선배님들이나 비슷한 고민 하셨던 분들 계실까요?
작은 팁이라도 좋으니 댓글 남겨주시면 정말 감사하겠습니다!

(다들 요즘 컨디션 관리 잘 하고 계시죠? 끝까지 파이팅합시다🔥)`,
        authorName: fallbackPost.author,
        createdAt: null,
        timeLabel: fallbackPost.time,
        viewCount: fallbackPost.views,
        likeCount: Math.max(0, Math.floor(fallbackPost.comments / 2)),
      },
      adoptedCommentId: null,
      comments: [],
    });
  }

  const supabase = getSupabaseServer();
  const admin = getSupabaseAdmin();

  const { data: boardData } = await supabase
    .from("boards")
    .select("id,name,exams!inner(slug)")
    .eq("slug", board)
    .eq("exams.slug", exam)
    .maybeSingle<{ id: string; name: string }>();

  if (!boardData?.id) {
    return NextResponse.json({ error: "게시판 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const { data: viewData } = await admin
      .from("posts")
      .select("view_count")
      .eq("id", postId)
      .maybeSingle<{ view_count: number | null }>();

    await admin
      .from("posts")
      .update({ view_count: (viewData?.view_count ?? 0) + 1 })
      .eq("id", postId);
  } catch {
    // Legacy schema may not include view_count.
  }

  let postData:
    | {
      id: string;
      title: string;
      content: string;
      author_name: string | null;
      created_at: string | null;
      view_count?: number | null;
    }
    | null = null;

  const { data: modernPost, error: modernPostError } = await supabase
    .from("posts")
    .select("id,title,content,author_name,created_at,view_count")
    .eq("id", postId)
    .eq("board_id", boardData.id)
    .maybeSingle();
  postData = modernPost;

  if (!postData && modernPostError?.message?.includes("view_count")) {
    const { data: legacyPost } = await supabase
      .from("posts")
      .select("id,title,content,author_name,created_at")
      .eq("id", postId)
      .eq("board_id", boardData.id)
      .maybeSingle();
    postData = legacyPost
      ? {
        ...legacyPost,
        view_count: 0,
      }
      : null;
  }

  if (!postData) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: commentsData } = await supabase
    .from("comments")
    .select("id,author_name,content,created_at,parent_id")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  const authorNames = Array.from(
    new Set((commentsData ?? []).map((comment) => comment.author_name).filter(Boolean))
  );

  const verificationMap = new Map<string, string>();
  if (authorNames.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("display_name,verification_level")
      .in("display_name", authorNames);

    (profiles ?? []).forEach((profile: { display_name: string | null; verification_level: string | null }) => {
      if (profile.display_name) {
        verificationMap.set(profile.display_name, verificationLabel(profile.verification_level));
      }
    });
  }

  const { count: likeCount } = await supabase
    .from("post_likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", postId);

  const { data: adoptionData } = await supabase
    .from("answer_adoptions")
    .select("comment_id")
    .eq("post_id", postId)
    .maybeSingle<{ comment_id: string }>();

  const comments = (commentsData ?? []).map((comment: CommentRow) => ({
    id: comment.id,
    authorName: comment.author_name,
    content: comment.content,
    createdAt: comment.created_at,
    timeLabel: formatRelativeTime(comment.created_at),
    parentId: comment.parent_id,
    verificationLevel: verificationMap.get(comment.author_name) ?? "none",
  }));

  return NextResponse.json({
    ok: true,
    writable: !(exam === "cpa" && !ENABLE_CPA_WRITE),
    isSamplePost: false,
    board: { slug: boardInfo.slug, name: boardData.name ?? boardInfo.name },
    post: {
      id: postData.id,
      title: postData.title,
      content: postData.content,
      authorName: postData.author_name ?? "익명",
      createdAt: postData.created_at,
      timeLabel: formatRelativeTime(postData.created_at),
      viewCount: postData.view_count ?? 0,
      likeCount: likeCount ?? 0,
    },
    adoptedCommentId: adoptionData?.comment_id ?? null,
    comments,
  });
}
