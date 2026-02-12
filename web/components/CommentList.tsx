"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { User, Heart, BadgeCheck } from "lucide-react";
import { CommentComposer } from "@/components/CommentComposer";

type Comment = {
  id: string;
  author_name: string;
  content: string;
  created_at: string;
  parent_id: string | null;
  verification_level?: string | null;
};

type CommentNode = Comment & {
  children: CommentNode[];
};

type CommentListProps = {
  postId: string;
  comments: Comment[];
  postAuthorName: string;
  adoptedCommentId?: string | null;
  isSamplePost?: boolean;
  disableInteractions?: boolean;
};

type StoredUser = {
  username?: string;
  nickname?: string;
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

function verificationLabel(level: string | null | undefined): string | null {
  switch (level) {
    case "transfer_passer":
      return "편입 합격";
    case "cpa_first_passer":
      return "CPA 1차 합격";
    case "cpa_accountant":
      return "회계사 인증";
    default:
      return null;
  }
}

export function CommentList({
  postId,
  comments,
  postAuthorName,
  adoptedCommentId = null,
  isSamplePost = false,
  disableInteractions = false,
}: CommentListProps) {
  const router = useRouter();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState("");
  const [adoptingCommentId, setAdoptingCommentId] = useState<string | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(adoptedCommentId);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) return;

    try {
      const user = JSON.parse(stored) as StoredUser;
      const display = user.nickname || user.username || "";
      setCurrentUserName(display);
    } catch {
      setCurrentUserName("");
    }
  }, []);

  useEffect(() => {
    setSelectedCommentId(adoptedCommentId);
  }, [adoptedCommentId]);

  const canAdopt = useMemo(() => {
    if (isSamplePost) return false;
    if (disableInteractions) return false;
    if (!currentUserName) return false;
    if (selectedCommentId) return false;
    return currentUserName.trim() === postAuthorName.trim();
  }, [currentUserName, disableInteractions, isSamplePost, postAuthorName, selectedCommentId]);

  const treeRoots = useMemo(() => {
    const commentMap = new Map<string, CommentNode>();
    comments.forEach((comment) => {
      commentMap.set(comment.id, { ...comment, children: [] });
    });

    const roots: CommentNode[] = [];
    comments.forEach((comment) => {
      const node = commentMap.get(comment.id);
      if (!node) return;

      if (comment.parent_id && commentMap.has(comment.parent_id)) {
        commentMap.get(comment.parent_id)?.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }, [comments]);

  const handleAdopt = async (commentId: string) => {
    if (!canAdopt || adoptingCommentId) return;

    setMessage("");
    setAdoptingCommentId(commentId);

    try {
      const res = await fetch("/api/comments/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          commentId,
          adopterName: currentUserName,
        }),
      });

      const payload = await res.json().catch(() => null) as
        | { ok?: boolean; adoptedCommentId?: string; awarded?: number; error?: string }
        | null;

      if (!res.ok || !payload?.ok) {
        setMessage(payload?.error || "채택 처리에 실패했습니다.");
        return;
      }

      const adoptedId = payload.adoptedCommentId || commentId;
      setSelectedCommentId(adoptedId);
      setMessage(`답변 채택 완료 (+${payload.awarded ?? 0}P 지급)`);
      router.refresh();
    } catch {
      setMessage("채택 처리 중 오류가 발생했습니다.");
    } finally {
      setAdoptingCommentId(null);
    }
  };

  const renderComment = (comment: CommentNode, depth = 0) => {
    const verifiedBadge = verificationLabel(comment.verification_level);
    const isSelected = selectedCommentId === comment.id;
    const canAdoptThis = canAdopt && !isSelected && currentUserName !== (comment.author_name || "").trim();

    return (
      <div
        key={comment.id}
        className={`flex flex-col ${depth > 0 ? "ml-8 mt-3 border-l-2 border-gray-100 pl-3" : "mt-4"}`}
      >
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
            <User className="h-4 w-4 text-gray-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-medium text-sm text-gray-900">{comment.author_name ?? "익명"}</span>
              {verifiedBadge && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-primary">
                  <BadgeCheck className="h-3 w-3" />
                  {verifiedBadge}
                </span>
              )}
              {isSelected && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  채택된 답변
                </span>
              )}
              <span className="text-xs text-gray-500">{formatRelativeTime(comment.created_at)}</span>
            </div>
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{comment.content}</p>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <Heart className="h-3.5 w-3.5" />
                좋아요
              </button>
              {!isSamplePost && !disableInteractions && (
                <button
                  onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                  className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                >
                  답글
                </button>
              )}
              {canAdoptThis && (
                <button
                  onClick={() => handleAdopt(comment.id)}
                  disabled={adoptingCommentId === comment.id}
                  className="text-xs font-semibold text-primary hover:text-primary/90 disabled:opacity-50"
                >
                  {adoptingCommentId === comment.id ? "채택 중..." : "채택"}
                </button>
              )}
            </div>
          </div>
        </div>

        {replyingTo === comment.id && !disableInteractions && (
          <div className="mt-3">
            <CommentComposer
              postId={postId}
              parentId={comment.id}
              onCancel={() => setReplyingTo(null)}
              onSuccess={() => setReplyingTo(null)}
            />
          </div>
        )}

        {comment.children.length > 0 && (
          <div className="space-y-3">
            {comment.children.map((child) => renderComment(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (comments.length === 0) {
    return <div className="text-center py-8 text-gray-500">아직 댓글이 없습니다. 첫 댓글을 남겨보세요!</div>;
  }

  return (
    <div className="space-y-2">
      {message && (
        <p className={`text-sm ${message.includes("실패") || message.includes("오류") ? "text-red-600" : "text-primary"}`}>
          {message}
        </p>
      )}
      <div className="space-y-4">{treeRoots.map((root) => renderComment(root))}</div>
    </div>
  );
}
