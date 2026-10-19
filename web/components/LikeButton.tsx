"use client";

import { useState, useRef } from "react";
import { Heart } from "lucide-react";

type LikeButtonProps = {
    postId: string;
    initialCount: number;
    isSample?: boolean;
};

export function LikeButton({ postId, initialCount, isSample = false }: LikeButtonProps) {
    const [liked, setLiked] = useState(false);
    const [count, setCount] = useState(initialCount);
    const [message, setMessage] = useState("");
    // 연달아 눌러도 화면은 바로 바뀌고, 마지막 요청의 응답만 반영한다.
    const requestSeq = useRef(0);

    // 로그인 정보는 누르는 순간 읽는다.
    const readAuth = () => {
        const accessToken = localStorage.getItem("access_token");
        let userId: string | null = null;
        try {
            const user = JSON.parse(localStorage.getItem("user") ?? "null") as { id?: string } | null;
            userId = typeof user?.id === "string" ? user.id : null;
        } catch {
            userId = null;
        }
        return { accessToken, userId };
    };

    const handleLike = async () => {
        if (isSample) return;
        const { accessToken, userId } = readAuth();
        if (!userId || !accessToken) {
            setMessage("로그인 후 이용 가능합니다.");
            return;
        }

        const previousLiked = liked;
        const previousCount = count;
        const optimisticLiked = !previousLiked;

        setLiked(optimisticLiked);
        setCount(Math.max(0, previousCount + (optimisticLiked ? 1 : -1)));
        setMessage("");
        const seq = ++requestSeq.current;
        try {
            const res = await fetch("/api/posts/like", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ postId, userId, desiredLiked: optimisticLiked }),
            });

            const data = await res.json();
            if (seq !== requestSeq.current) return;
            if (res.ok) {
                setLiked(data.liked);
                if (typeof data.likeCount === "number") {
                    setCount(Math.max(0, data.likeCount));
                } else {
                    setCount((prev) => Math.max(0, prev + (data.liked ? 1 : -1)));
                }
            } else {
                setLiked(previousLiked);
                setCount(previousCount);
                setMessage(data?.error ?? "좋아요 처리에 실패했습니다.");
            }
        } catch {
            if (seq !== requestSeq.current) return;
            setLiked(previousLiked);
            setCount(previousCount);
            setMessage("좋아요 처리 중 오류가 발생했습니다.");
        }
    };

    return (
        <div className="flex flex-col">
            <button
                onClick={handleLike}
                disabled={isSample}
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
