"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";

type CommentComposerProps = {
  postId: string;
  parentId?: string | null;
  onCancel?: () => void;
  onSuccess?: () => void;
};

export const OPTIMISTIC_COMMENT_EVENT = "hapgyeokpan:comment-optimistic";
export const OPTIMISTIC_COMMENT_FAILED_EVENT = "hapgyeokpan:comment-failed";

export function CommentComposer({ postId, parentId = null, onCancel, onSuccess }: CommentComposerProps) {
  const router = useRouter();
  const pendingIdRef = useRef("");
  const contentValueRef = useRef("");
  const [authorName, setAuthorName] = useState("익명");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [isFocused, setIsFocused] = useState(!!parentId); // Auto-focus if replying

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const token = localStorage.getItem("access_token") ?? "";
    setIsLoggedIn(Boolean(token));
    if (token) {
      setAccessToken(token);
    }
    if (stored) {
      try {
        const user = JSON.parse(stored);
        if (typeof user.id === "string" && user.id) {
          setUserId(user.id);
        }
        if (user.nickname) {
          setAuthorName(user.nickname);
        } else if (user.username) {
          setAuthorName(user.username);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const handleSubmit = async () => {
    const rollback = () => {
      window.dispatchEvent(new CustomEvent(OPTIMISTIC_COMMENT_FAILED_EVENT, { detail: { postId, commentId: pendingIdRef.current } }));
      setContent(contentValueRef.current);
      setIsFocused(true);
    };
    setMessage("");
    if (!isLoggedIn || !userId || !accessToken) {
      setMessage("로그인 후 댓글을 작성할 수 있어요.");
      return;
    }
    const nameValue = isLoggedIn && !isAnonymous ? authorName.trim() : "익명";
    const contentValue = content.trim();
    contentValueRef.current = contentValue;

    if (!contentValue) {
      setMessage("댓글 내용을 입력해 주세요.");
      return;
    }

    // 서버 응답을 기다리지 않고 댓글을 먼저 목록에 붙인다(CommentList가 이벤트를 받는다). 실패하면 되돌린다.
    const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingIdRef.current = pendingId;
    window.dispatchEvent(new CustomEvent(OPTIMISTIC_COMMENT_EVENT, {
      detail: {
        postId,
        comment: { id: pendingId, author_name: nameValue, content: contentValue, created_at: new Date().toISOString(), parent_id: parentId },
      },
    }));
    setContent("");
    setIsFocused(false);
    if (onSuccess) onSuccess();

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/comments/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          postId,
          parentId,
          authorName: nameValue,
          content: contentValue,
          userId,
          accessToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        rollback();
        setMessage(data?.error ?? "댓글 작성에 실패했습니다.");
        return;
      }
      router.refresh();
    } catch {
      rollback();
      setMessage("댓글 작성 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setContent("");
    setIsFocused(false);
    setMessage("");
    if (onCancel) onCancel();
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${parentId ? "ml-8 mt-2" : ""}`}>
      {/* Author info */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-medium text-gray-700">{isLoggedIn && !isAnonymous ? authorName : "익명"}</span>
        {isLoggedIn ? (
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            익명
          </label>
        ) : null}
      </div>

      {/* Textarea */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onFocus={() => setIsFocused(true)}
        placeholder={parentId ? "답글을 입력하세요..." : "댓글을 입력하세요..."}
        rows={isFocused || content || parentId ? 3 : 1}
        className="w-full px-4 py-3 text-sm text-gray-800 resize-none outline-none placeholder:text-gray-400 transition-all"
        autoFocus={!!parentId}
      />

      {/* Footer */}
      {(isFocused || content || message || parentId) && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
          <div className="text-xs">
            {message && (
              <span className={message.includes("실패") || message.includes("오류") ? "text-red-500" : "text-primary"}>
                {message}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="text-gray-500 hover:text-gray-700"
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!isLoggedIn) {
                  setMessage("로그인 후 댓글을 작성할 수 있어요.");
                  router.push(`/signup?next=${encodeURIComponent(window.location.pathname)}`);
                  return;
                }
                void handleSubmit();
              }}
              disabled={isSubmitting || !content.trim()}
              className="bg-primary hover:bg-primary/90"
            >
              {isSubmitting ? "등록 중..." : !isLoggedIn ? "로그인" : parentId ? "답글 등록" : "댓글 등록"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
