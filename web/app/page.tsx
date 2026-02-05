import { Navbar } from "@/components/Navbar";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, ExternalLink } from "lucide-react";
import { DDayWidget } from "@/components/DDayWidget";
import { getSupabaseServer } from "@/lib/supabaseServer";
import Link from "next/link";
import { EXAM_CATEGORIES } from "@/lib/data";

// Helper to format relative time (duplicated to avoid external dependency issues)
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

type FeedPost = {
  id: string;
  title: string;
  created_at: string;
  comment_count: number;
};

type FeedGroup = {
  id: string;
  examName: string;
  examSlug: string;
  posts: FeedPost[];
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = getSupabaseServer();
  const targetExams = [
    { name: "CPA (회계사)", slug: "cpa" },
    { name: "9급 공무원", slug: "civil-9" },
    { name: "노무사", slug: "labor" },
    { name: "변리사", slug: "patent" },
    { name: "7급 공무원", slug: "civil-7" },
    { name: "세무사", slug: "cta" },
  ];

  // Fetch feeds in parallel
  const feeds: FeedGroup[] = await Promise.all(
    targetExams.map(async (exam) => {
      // Find 'free' board for this exam
      const { data: boards } = await supabase
        .from("boards")
        .select("id")
        .eq("slug", "free")
        .eq("exam_id", (
          await supabase.from("exams").select("id").eq("slug", exam.slug).maybeSingle()
        ).data?.id || "")
        .maybeSingle();

      if (!boards) return { id: exam.slug, examName: exam.name, examSlug: exam.slug, posts: [] };

      // Fetch latest 3 posts
      const { data: posts } = await supabase
        .from("posts")
        .select("id, title, created_at, comments(count)")
        .eq("board_id", boards.id)
        .order("created_at", { ascending: false })
        .limit(3);

      const formattedPosts = (posts || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        created_at: p.created_at,
        comment_count: p.comments?.[0]?.count || 0,
      }));

      return {
        id: exam.slug,
        examName: exam.name,
        examSlug: exam.slug,
        posts: formattedPosts,
      };
    })
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* D-Day Strip */}
      <section className="border-b bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.08),transparent_60%)]">
        <div className="container mx-auto px-4 py-7">
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-display text-2xl md:text-3xl font-bold">D-Day</h1>
            <span className="text-xs text-muted-foreground">주요 시험 일정</span>
          </div>
          <DDayWidget />
        </div>
      </section>

      {/* Free Board Preview */}
      <section className="py-10 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {feeds.map((feed) => (
              <Card key={feed.id} className="border-none shadow-lg">
                <CardHeader className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {feed.examName} 자유게시판
                    </CardTitle>
                    <Link
                      href={`/c/${feed.examSlug}/free`}
                      className="text-xs text-muted-foreground hover:text-emerald-600 flex items-center gap-1"
                    >
                      더보기 <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  <div className="space-y-3">
                    {feed.posts.length > 0 ? (
                      feed.posts.map((post) => (
                        <Link
                          key={post.id}
                          href={`/c/${feed.examSlug}/free/${post.id}`}
                          className="flex items-center justify-between gap-3 group"
                        >
                          <div className="text-sm font-medium line-clamp-1 group-hover:text-emerald-600 transition-colors">
                            {post.title}
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-2">
                            <span className="flex items-center gap-1">
                              <MessageCircle className="h-3 w-3" />
                              {post.comment_count}
                            </span>
                            {formatRelativeTime(post.created_at)}
                          </div>
                        </Link>
                      ))
                    ) : (
                      <div className="text-sm text-gray-400 py-2">게시글이 없습니다.</div>
                    )}
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
