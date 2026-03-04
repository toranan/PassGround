import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { CommentComposer } from "@/components/CommentComposer";
import { CommentList } from "@/components/CommentList";
import { LikeButton } from "@/components/LikeButton";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
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
  author_id?: string | null;
  content: string;
  created_at: string;
  parent_id: string | null;
  verification_level?: string | null;
};

type RichToken = {
  kind: "text" | "link";
  value: string;
  href?: string;
};

type PostResource = {
  label: string;
  href: string;
  kind: "link" | "file";
};

const LINK_TOKEN_REGEX = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/gi;
const RESOURCE_MARKDOWN_LINE_REGEX = /^(?:[🔗📎]\s*)?\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*$/i;
const RESOURCE_URL_LINE_REGEX = /^(?:[🔗📎]\s*)?(https?:\/\/\S+)\s*$/i;
const FILE_EXTENSIONS = new Set([
  "pdf", "zip", "hwp", "hwpx", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "jpg", "jpeg", "png", "gif", "webp", "heic", "txt", "csv",
]);

function trimUrlSuffix(url: string): { clean: string; suffix: string } {
  let clean = url;
  let suffix = "";
  while (/[),.!?]$/.test(clean)) {
    suffix = clean.slice(-1) + suffix;
    clean = clean.slice(0, -1);
  }
  return { clean, suffix };
}

function parseRichLine(line: string): RichToken[] {
  const tokens: RichToken[] = [];
  let lastIndex = 0;
  for (const match of line.matchAll(LINK_TOKEN_REGEX)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ kind: "text", value: line.slice(lastIndex, index) });
    }

    const markdownLabel = match[1];
    const markdownHref = match[2];
    const rawUrl = match[3];

    if (markdownLabel && markdownHref) {
      tokens.push({ kind: "link", value: markdownLabel, href: markdownHref });
    } else if (rawUrl) {
      const { clean, suffix } = trimUrlSuffix(rawUrl);
      tokens.push({ kind: "link", value: clean, href: clean });
      if (suffix) {
        tokens.push({ kind: "text", value: suffix });
      }
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < line.length) {
    tokens.push({ kind: "text", value: line.slice(lastIndex) });
  }
  return tokens;
}

function isLikelyFileResource(line: string, label: string, href: string): boolean {
  if (line.includes("📎")) return true;
  try {
    const url = new URL(href);
    const ext = url.pathname.split(".").pop()?.toLowerCase() ?? "";
    if (FILE_EXTENSIONS.has(ext)) return true;
    if (url.pathname.toLowerCase().includes("/attachments/")) return true;
  } catch {
    return false;
  }
  const labelExt = label.split(".").pop()?.toLowerCase() ?? "";
  return FILE_EXTENSIONS.has(labelExt);
}

function parsePostBodyAndResources(content: string): {
  bodyLines: string[];
  links: PostResource[];
  files: PostResource[];
} {
  const bodyLines: string[] = [];
  const links: PostResource[] = [];
  const files: PostResource[] = [];
  const seen = new Set<string>();

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      bodyLines.push(line);
      continue;
    }

    const markdownMatch = trimmed.match(RESOURCE_MARKDOWN_LINE_REGEX);
    if (markdownMatch) {
      const label = markdownMatch[1]?.trim() || "링크 열기";
      const href = markdownMatch[2]?.trim();
      if (href) {
        const kind: PostResource["kind"] = isLikelyFileResource(trimmed, label, href) ? "file" : "link";
        const dedupKey = `${kind}#${href}`;
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey);
          (kind === "file" ? files : links).push({ label, href, kind });
        }
        continue;
      }
    }

    const rawUrlMatch = trimmed.match(RESOURCE_URL_LINE_REGEX);
    if (rawUrlMatch?.[1]) {
      const href = rawUrlMatch[1].trim();
      const fallbackLabel = href.split("/").pop() || "링크 열기";
      const kind: PostResource["kind"] = isLikelyFileResource(trimmed, fallbackLabel, href) ? "file" : "link";
      const dedupKey = `${kind}#${href}`;
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        (kind === "file" ? files : links).push({
          label: fallbackLabel,
          href,
          kind,
        });
      }
      continue;
    }

    bodyLines.push(line);
  }

  return { bodyLines, links, files };
}

function renderPostContent(lines: string[]) {
  return lines.map((line, lineIndex) => {
    const tokens = parseRichLine(line);
    return (
      <p key={`line-${lineIndex}`} className="whitespace-pre-wrap">
        {tokens.map((token, tokenIndex) => {
          if (token.kind === "link" && token.href) {
            return (
              <a
                key={`token-${lineIndex}-${tokenIndex}`}
                href={token.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 break-all"
              >
                {token.value}
              </a>
            );
          }
          return <span key={`token-${lineIndex}-${tokenIndex}`}>{token.value}</span>;
        })}
      </p>
    );
  });
}

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

function verificationLabel(level: string | null | undefined): string | null {
  if (!level || level === "none") return null;
  switch (level) {
    case "transfer_passer":
      return "편입 합격";
    case "cpa_first_passer":
      return "CPA 1차 합격";
    case "cpa_accountant":
      return "회계사 인증";
    default:
      return level;
  }
}

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function generateMetadata({ params }: PostDetailPageProps): Promise<Metadata> {
  const { exam, board, postId } = await params;
  if (!isValidUUID(postId)) return {};

  const supabase = getSupabaseServer();

  const { data: boardData } = await supabase
    .from("boards")
    .select("id,name,exams!inner(slug)")
    .eq("slug", board)
    .eq("exams.slug", exam)
    .maybeSingle();

  if (!boardData?.id) return {};

  const { data: postData } = await supabase
    .from("posts")
    .select("title,content")
    .eq("id", postId)
    .eq("board_id", boardData.id)
    .maybeSingle();

  if (!postData) return {};

  const rawText = postData.content ? postData.content.replace(/\s+/g, " ").trim() : "";
  const description = rawText.length > 150 ? `${rawText.slice(0, 150)}...` : rawText;
  const examSuffix = exam === "transfer" ? "편입 " : "";
  const title = `${postData.title} | ${examSuffix}${boardData.name} - 합격판`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
    },
  };
}

export default async function PostDetailPage({ params }: PostDetailPageProps) {
  const { exam, board, postId } = await params;

  if (!ENABLE_CPA && exam === "cpa") {
    notFound();
  }
  if (exam === "transfer" && board === "cutoff") {
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
      author_id?: string | null;
      created_at: string | null;
      view_count?: number;
    }
    | null = null;
  let commentsData: CommentRow[] = [];
  const boardName =
    exam === "transfer" && board === "qa"
      ? "합격전략"
      : exam === "transfer" && board === "study-qa"
        ? "학습질문"
        : (boardData?.name ?? "게시판");
  let likeCount = 0;
  let adoptedCommentId: string | null = null;
  let postVerificationLevel = "none";
  const isSamplePost = false;

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
      .select("id,title,content,author_name,author_id,created_at,view_count")
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
          author_id: null,
          view_count: 0,
        }
        : null;
    }

    if (postData?.id) {
      const { data: comments } = await supabase
        .from("comments")
        .select("id,author_name,author_id,content,created_at,parent_id")
        .eq("post_id", postData.id)
        .order("created_at", { ascending: true });

      const rawComments = comments ?? [];
      const authorNames = Array.from(new Set(
        [postData.author_name, ...rawComments.map((comment) => comment.author_name)]
          .map((name) => (typeof name === "string" ? name.trim() : ""))
          .filter((value): value is string => value.length > 0)
      ));
      const authorProfileIds = Array.from(
        new Set(
          [postData.author_id, ...rawComments.map((comment) => comment.author_id)]
            .map((authorId) => (typeof authorId === "string" ? authorId.trim() : ""))
            .filter((value): value is string => isValidUUID(value))
        )
      );

      const verificationMap = new Map<string, string>();
      const verificationByProfileId = new Map<string, string>();
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
      if (authorProfileIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id,verification_level")
          .in("id", authorProfileIds);

        (profileRows ?? []).forEach((profile: { id: string; verification_level: string | null }) => {
          verificationByProfileId.set(profile.id, profile.verification_level ?? "none");
        });

        const { data: approvedRows } = await admin
          .from("verification_requests")
          .select("profile_id,memo,reviewed_at,created_at")
          .in("profile_id", authorProfileIds)
          .eq("status", "approved")
          .order("reviewed_at", { ascending: false })
          .order("created_at", { ascending: false });

        (approvedRows as { profile_id: string | null; memo: string | null }[] | null | undefined)?.forEach((row) => {
          const profileId = row.profile_id?.trim() ?? "";
          if (!profileId || !verificationByProfileId.has(profileId)) return;
          const parsed = (() => {
            if (!row.memo) return null;
            try {
              const memoObject = JSON.parse(row.memo) as { verifiedUniversity?: unknown };
              const university = typeof memoObject.verifiedUniversity === "string" ? memoObject.verifiedUniversity.trim() : "";
              return university || null;
            } catch {
              return null;
            }
          })();
          if (!parsed) return;
          verificationByProfileId.set(profileId, `${parsed} 합격자`);
        });
      }

      commentsData = rawComments.map((comment) => ({
        id: comment.id,
        author_name: comment.author_name,
        author_id: comment.author_id ?? null,
        content: comment.content,
        created_at: comment.created_at,
        parent_id: comment.parent_id,
        verification_level:
          (typeof comment.author_id === "string" ? verificationByProfileId.get(comment.author_id) : undefined) ??
          verificationMap.get(comment.author_name) ??
          "none",
      }));

      const postAuthorId = typeof postData.author_id === "string" ? postData.author_id.trim() : "";
      const postAuthorName = (postData.author_name ?? "").trim();
      postVerificationLevel =
        (postAuthorId ? verificationByProfileId.get(postAuthorId) : undefined) ??
        (postAuthorName ? verificationMap.get(postAuthorName) : undefined) ??
        "none";

      const { count } = await admin
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
    notFound();
  }

  const comments = commentsData;
  const viewCount = postData.view_count ?? 0;
  const parsedContent = parsePostBodyAndResources(postData.content);
  const postVerificationBadge = verificationLabel(postVerificationLevel);
  const examSuffix = exam === "transfer" ? "편입 " : "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: postData.title,
    articleSection: `${examSuffix}${boardName}`,
    author: {
      "@type": "Person",
      name: postData.author_name ?? "익명",
    },
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/CommentAction",
      userInteractionCount: comments.length,
    },
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* SEO JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
                <div className="font-medium text-gray-900 flex items-center gap-2 flex-wrap">
                  <span>{postData.author_name ?? "익명"}</span>
                  {postVerificationBadge && (
                    <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {postVerificationBadge}
                    </span>
                  )}
                </div>
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

            <div className="text-base leading-7 text-gray-800 space-y-1">
              {renderPostContent(parsedContent.bodyLines)}
            </div>

            {(parsedContent.links.length > 0 || parsedContent.files.length > 0) && (
              <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
                {parsedContent.links.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">관련 링크</p>
                    <div className="space-y-2">
                      {parsedContent.links.map((item) => (
                        <a
                          key={`link-${item.href}`}
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-primary underline underline-offset-2 break-all"
                        >
                          {item.label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {parsedContent.files.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">첨부 파일</p>
                    <div className="space-y-2">
                      {parsedContent.files.map((item) => (
                        <a
                          key={`file-${item.href}`}
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-primary underline underline-offset-2 break-all"
                        >
                          {item.label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
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
                  : "목록에 없는 게시글에는 댓글을 작성할 수 없습니다."}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
