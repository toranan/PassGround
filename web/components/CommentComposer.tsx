"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";

type CommentComposerProps = {
  postId: string;
  parentId?: string | null;
  onCancel?: () => void;
  onSuccess?: () => void;
};

export function CommentComposer({ postId, parentId = null, onCancel, onSuccess }: CommentComposerProps) {
  const router = useRouter();
  const [authorName, setAuthorName] = useState("익명");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isFocused, setIsFocused] = useState(!!parentId); // Auto-focus if replying

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        if (user.nickname) {
          setAuthorName(user.nickname);
          setIsLoggedIn(true);
        } else if (user.username) {
          setAuthorName(user.username);
          setIsLoggedIn(true);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const handleSubmit = async () => {
    setMessage("");
    const nameValue = isLoggedIn ? authorName.trim() : "익명";
    const contentValue = content.trim();

    if (!contentValue) {
      setMessage("댓글 내용을 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/comments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          parentId,
          authorName: nameValue,
          content: contentValue,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error ?? "댓글 작성에 실패했습니다.");
        return;
      }
      setContent("");
      setIsFocused(false);
      router.refresh();
      if (onSuccess) onSuccess();
    } catch {
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
        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
          <User className="h-4 w-4 text-emerald-600" />
        </div>
        <span className="text-sm font-medium text-gray-700">{isLoggedIn ? authorName : "익명"}</span>
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
              <span className={message.includes("실패") || message.includes("오류") ? "text-red-500" : "text-emerald-600"}>
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
              onClick={handleSubmit}
              disabled={isSubmitting || !content.trim()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isSubmitting ? "등록 중..." : parentId ? "답글 등록" : "댓글 등록"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
