"use client";

import { useState, useEffect } from "react";
import { Heart } from "lucide-react";

type LikeButtonProps = {
    postId: string;
    initialCount: number;
    isSample?: boolean;
};

export function LikeButton({ postId, initialCount, isSample = false }: LikeButtonProps) {
    const [liked, setLiked] = useState(false);
    const [count, setCount] = useState(initialCount);
    const [isLoading, setIsLoading] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [message, setMessage] = useState("");

    useEffect(() => {
        const stored = localStorage.getItem("user");
        if (stored) {
            try {
                const user = JSON.parse(stored);
                if (user.id) {
                    setUserId(user.id);
                }
            } catch {
                // ignore
            }
        }
    }, []);

    const handleLike = async () => {
        if (isSample) return;
        if (isLoading) return;
        if (!userId) {
            setMessage("로그인 후 이용 가능합니다.");
            return;
        }

        setIsLoading(true);
        setMessage("");
        try {
            const res = await fetch("/api/posts/like", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ postId, userId }),
            });

            const data = await res.json();
            if (res.ok) {
                setLiked(data.liked);
                setCount((prev) => (data.liked ? prev + 1 : prev - 1));
            } else {
                setMessage(data?.error ?? "좋아요 처리에 실패했습니다.");
            }
        } catch {
            setMessage("좋아요 처리 중 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col">
            <button
                onClick={handleLike}
                disabled={isSample || isLoading}
                className={`flex items-center gap-2 transition-colors ${liked ? "text-rose-500" : "text-gray-600 hover:text-rose-500"
                    } ${isSample ? "cursor-not-allowed opacity-50" : ""}`}
            >
                <Heart className={`h-5 w-5 ${liked ? "fill-current" : ""}`} />
                <span className="text-sm font-medium">{count}</span>
            </button>
            {message && <span className="text-xs text-red-600 mt-1">{message}</span>}
        </div>
    );
}
