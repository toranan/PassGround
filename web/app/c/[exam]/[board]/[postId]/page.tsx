import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { CommentComposer } from "@/components/CommentComposer";
import { CommentList } from "@/components/CommentList";
import { LikeButton } from "@/components/LikeButton";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { BOARD_POST_GROUPS } from "@/lib/data";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";
import { ChevronLeft, Eye, MessageCircle, Share2, Bookmark, User } from "lucide-react";

type PostDetailPageProps = {
  params: Promise<{
    exam: string;
    board: string;
    postId: string;
  }>;
};

type CommentRow = {
  id: string;
  author_name: string;
  content: string;
  created_at: string;
  parent_id: string | null;
  verification_level?: string | null;
};

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString("ko-KR");
}

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export default async function PostDetailPage({ params }: PostDetailPageProps) {
  const { exam, board, postId } = await params;

  if (!ENABLE_CPA && exam === "cpa") {
    notFound();
  }
  const isReadOnlyExam = exam === "cpa" && !ENABLE_CPA_WRITE;

  const supabase = getSupabaseServer();

  const { data: boardData } = await supabase
    .from("boards")
    .select("id,name,exams!inner(slug)")
    .eq("slug", board)
    .eq("exams.slug", exam)
    .maybeSingle();

  let postData:
    | {
      id: string;
      title: string;
      content: string;
      author_name: string | null;
      created_at: string | null;
      view_count?: number;
    }
    | null = null;
  let commentsData: CommentRow[] = [];
  let boardName = boardData?.name ?? "게시판";
  let likeCount = 0;
  let adoptedCommentId: string | null = null;
  let isSamplePost = false;

  if (boardData?.id && isValidUUID(postId)) {
    const admin = getSupabaseAdmin();
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
      // view_count column may not exist yet in legacy schema
    }

    const { data, error: postSelectError } = await supabase
      .from("posts")
      .select("id,title,content,author_name,created_at,view_count")
      .eq("id", postId)
      .eq("board_id", boardData.id)
      .maybeSingle();
    postData = data;

    if (!postData && postSelectError?.message?.includes("view_count")) {
      const { data: legacyData } = await supabase
        .from("posts")
        .select("id,title,content,author_name,created_at")
        .eq("id", postId)
        .eq("board_id", boardData.id)
        .maybeSingle();

      postData = legacyData
        ? {
          ...legacyData,
          view_count: 0,
        }
        : null;
    }

    if (postData?.id) {
      const { data: comments } = await supabase
        .from("comments")
        .select("id,author_name,content,created_at,parent_id")
        .eq("post_id", postData.id)
        .order("created_at", { ascending: true });

      const rawComments = comments ?? [];
      const authorNames = Array.from(
        new Set(rawComments.map((comment) => comment.author_name).filter(Boolean))
      );

      const verificationMap = new Map<string, string>();
      if (authorNames.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("display_name,verification_level")
          .in("display_name", authorNames);

        (profiles ?? []).forEach((profile: { display_name: string | null; verification_level: string | null }) => {
          if (profile.display_name) {
            verificationMap.set(profile.display_name, profile.verification_level ?? "none");
          }
        });
      }

      commentsData = rawComments.map((comment) => ({
        id: comment.id,
        author_name: comment.author_name,
        content: comment.content,
        created_at: comment.created_at,
        parent_id: comment.parent_id,
        verification_level: verificationMap.get(comment.author_name) ?? "none",
      }));

      const { count } = await supabase
        .from("post_likes")
        .select("*", { count: "exact", head: true })
        .eq("post_id", postData.id);
      likeCount = count ?? 0;

      const { data: adoptionData } = await supabase
        .from("answer_adoptions")
        .select("comment_id")
        .eq("post_id", postData.id)
        .maybeSingle<{ comment_id: string }>();

      adoptedCommentId = adoptionData?.comment_id ?? null;
    }
  }

  if (!postData) {
    const fallbackGroup = BOARD_POST_GROUPS.find(
      (group) => group.examSlug === exam && group.boardSlug === board
    );
    const fallbackPost = fallbackGroup?.posts.find((p) => p.id === postId);

    if (fallbackPost) {
      postData = {
        id: fallbackPost.id,
        title: fallbackPost.title,
        content: `이 게시글은 샘플 데이터입니다.\n\n${fallbackPost.title}에 대한 자세한 내용을 여기에서 확인하세요.\n\n실제 서비스에서는 회원들이 작성한 다양한 정보와 경험담을 공유할 수 있습니다.`,
        author_name: fallbackPost.author,
        created_at: new Date(Date.now() - fallbackPost.views * 1000 * 10).toISOString(),
        view_count: fallbackPost.views,
      };
      boardName = fallbackGroup?.boardName ?? "게시판";
      likeCount = Math.floor(Math.random() * 15);
      isSamplePost = true;
    }
  }

  if (!postData) {
    notFound();
  }

  const comments = commentsData;
  const viewCount = postData.view_count ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1">
        <header className="bg-white border-b sticky top-16 z-40">
          <div className="container mx-auto px-4 h-14 flex items-center gap-3">
            <Link
              href={`/c/${exam}/${board}`}
              className="flex items-center gap-1 text-gray-600 hover:text-gray-900"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="text-sm font-medium">{boardName}</span>
            </Link>
          </div>
        </header>

        <article className="bg-white border-b">
          <div className="container mx-auto px-4 py-6">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 leading-tight mb-4">{postData.title}</h1>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-gray-900">{postData.author_name ?? "익명"}</div>
                <div className="text-sm text-gray-500 flex items-center gap-2">
                  <span>{formatRelativeTime(postData.created_at)}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    {viewCount}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-base leading-7 text-gray-800 whitespace-pre-wrap">{postData.content}</div>
          </div>
        </article>

        <div className="bg-white border-b">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center gap-6">
              <LikeButton postId={postData.id} initialCount={likeCount} isSample={isSamplePost || isReadOnlyExam} />
              <button className="flex items-center gap-2 text-gray-600">
                <MessageCircle className="h-5 w-5" />
                <span className="text-sm font-medium">{comments.length}</span>
              </button>
              <div className="flex-1" />
              <button className="text-gray-500 hover:text-gray-700 transition-colors">
                <Share2 className="h-5 w-5" />
              </button>
              <button className="text-gray-500 hover:text-gray-700 transition-colors">
                <Bookmark className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <section className="bg-white mt-2">
          <div className="container mx-auto px-4 py-4">
            <h2 className="font-semibold text-gray-900 mb-3">댓글 {comments.length}개</h2>

            {adoptedCommentId && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                채택된 답변이 있습니다. 채택 답변자에게 포인트가 지급되었습니다.
              </div>
            )}

            <CommentList
              postId={postData.id}
              comments={comments}
              postAuthorName={postData.author_name ?? ""}
              adoptedCommentId={adoptedCommentId}
              isSamplePost={isSamplePost}
              disableInteractions={isReadOnlyExam}
            />

            {!isSamplePost && !isReadOnlyExam && (
              <div className="mt-8 pt-6 border-t border-gray-100">
                <CommentComposer postId={postData.id} />
              </div>
            )}
            {(isSamplePost || isReadOnlyExam) && (
              <div className="mt-6 pt-4 border-t border-gray-100 text-center text-sm text-gray-500">
                {isReadOnlyExam
                  ? "현재 CPA 게시판은 구경용(읽기 전용)으로 운영 중입니다."
                  : "샘플 게시글에는 댓글을 작성할 수 없습니다."}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
