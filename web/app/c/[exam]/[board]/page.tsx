import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { CutoffMaskedTitle } from "@/components/CutoffMaskedTitle";
import { Button } from "@/components/ui/button";
import { BOARD_POST_GROUPS, COMMUNITY_BOARD_GROUPS } from "@/lib/data";
import { ENABLE_CPA, ENABLE_CPA_WRITE } from "@/lib/featureFlags";
import { MessageCircle, Heart, Eye, ChevronLeft, PenSquare } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabaseServer";

type BoardPageProps = {
  params: Promise<{
    exam: string;
    board: string;
  }>;
};

function formatRelativeTime(timeStr: string): string {
  if (timeStr.includes("분") || timeStr.includes("시간") || timeStr.includes("일")) {
    return timeStr;
  }
  const date = new Date(timeStr);
  if (isNaN(date.getTime())) return timeStr;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "방금";
  if (diffMinutes < 60) return `${diffMinutes}분`;
  if (diffHours < 24) return `${diffHours}시간`;
  if (diffDays < 7) return `${diffDays}일`;
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

function deterministicLikeCount(seed: string, base: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 97;
  }
  return (hash % 15) + Math.floor(base / 3);
}

export default async function BoardPage({ params }: BoardPageProps) {
  const { exam, board } = await params;

  if (!ENABLE_CPA && exam === "cpa") {
    notFound();
  }
  const isReadOnlyExam = exam === "cpa" && !ENABLE_CPA_WRITE;

  const examInfo = COMMUNITY_BOARD_GROUPS.find((group) => group.examSlug === exam);
  const examName = examInfo?.examName ?? exam;
  const boardNameFromList =
    examInfo?.boards.find((b) => b.slug === board)?.name ?? "게시판";

  const supabase = getSupabaseServer();
  const { data: boardData } = await supabase
    .from("boards")
    .select("id,name,exams!inner(slug)")
    .eq("slug", board)
    .eq("exams.slug", exam)
    .maybeSingle();

  const boardId = boardData?.id ?? null;
  const boardName = boardData?.name ?? boardNameFromList;

  // Fetch posts with real comment count and like count
  let dbPosts: { id: string; title: string; author: string; comments: number; likes: number; views: number; timeLabel: string }[] = [];

  if (boardId) {
    let postsData:
      | {
          id: string;
          title: string;
          author_name: string | null;
          created_at: string | null;
          view_count?: number | null;
        }[]
      | null = null;

    const { data: modernPosts, error: modernError } = await supabase
      .from("posts")
      .select("id, title, author_name, created_at, view_count")
      .eq("board_id", boardId)
      .order("created_at", { ascending: false });
    postsData = modernPosts;

    if ((!postsData || postsData.length === 0) && modernError?.message?.includes("view_count")) {
      const { data: legacyPosts } = await supabase
        .from("posts")
        .select("id, title, author_name, created_at")
        .eq("board_id", boardId)
        .order("created_at", { ascending: false });

      postsData = (legacyPosts ?? []).map((post) => ({
        ...post,
        view_count: 0,
      }));
    }

    if (postsData && postsData.length > 0) {
      // Get comment counts for all posts
      const postIds = postsData.map(p => p.id);
      const { data: commentCounts } = await supabase
        .from("comments")
        .select("post_id")
        .in("post_id", postIds);

      // Get like counts for all posts
      const { data: likeCounts } = await supabase
        .from("post_likes")
        .select("post_id")
        .in("post_id", postIds);

      // Count comments and likes per post
      const commentCountMap = new Map<string, number>();
      const likeCountMap = new Map<string, number>();

      commentCounts?.forEach(c => {
        commentCountMap.set(c.post_id, (commentCountMap.get(c.post_id) || 0) + 1);
      });

      likeCounts?.forEach(l => {
        likeCountMap.set(l.post_id, (likeCountMap.get(l.post_id) || 0) + 1);
      });

      dbPosts = postsData.map((post) => ({
        id: post.id,
        title: post.title,
        author: post.author_name ?? "익명",
        comments: commentCountMap.get(post.id) || 0,
        likes: likeCountMap.get(post.id) || 0,
        views: post.view_count || 0,
        timeLabel: post.created_at ? formatRelativeTime(post.created_at) : "",
      }));
    }
  }

  const fallbackGroup = BOARD_POST_GROUPS.find(
    (group) => group.examSlug === exam && group.boardSlug === board
  );
  const fallbackPosts = (fallbackGroup?.posts ?? []).map((post) => ({
    id: post.id,
    title: post.title,
    author: post.author,
    comments: post.comments,
    likes: deterministicLikeCount(post.id, post.comments),
    views: post.views,
    timeLabel: post.time,
  }));

  const posts = dbPosts.length ? dbPosts : fallbackPosts;
  const shouldMaskCutoffTitles = exam === "transfer" && board === "cutoff";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Header */}
        <header className="bg-white border-b sticky top-16 z-40">
          <div className="container mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href={`/community/${exam}`}
                className="flex items-center gap-1 text-gray-600 hover:text-gray-900"
              >
                <ChevronLeft className="h-5 w-5" />
              </Link>
              <h1 className="font-semibold text-gray-900">{boardName}</h1>
              <span className="text-sm text-gray-500">{examName}</span>
            </div>
            {!isReadOnlyExam ? (
              <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1">
                <Link href={`/c/${exam}/${board}/write`}>
                  <PenSquare className="h-4 w-4" />
                  글쓰기
                </Link>
              </Button>
            ) : (
              <span className="text-xs text-gray-500">읽기 전용</span>
            )}
          </div>
        </header>

        {/* Post List */}
        <section className="bg-white">
          {posts.length ? (
            <div className="divide-y">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  href={`/c/${exam}/${board}/${post.id}`}
                  className="block hover:bg-gray-50 transition-colors"
                >
                  <div className="container mx-auto px-4 py-4">
                    <h2 className="font-medium text-gray-900 mb-2 line-clamp-2">
                      <CutoffMaskedTitle
                        title={post.title}
                        shouldMaskForGuest={shouldMaskCutoffTitles}
                      />
                    </h2>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{post.author}</span>
                      <span>{post.timeLabel}</span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {post.views}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart className="h-3 w-3" />
                        {post.likes}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" />
                        {post.comments}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="container mx-auto px-4 py-16 text-center text-gray-500">
              아직 게시글이 없습니다. 첫 글을 작성해보세요!
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
