"use client";

import { useState } from "react";
import { User, MessageCircle, Heart } from "lucide-react";
import { CommentComposer } from "@/components/CommentComposer";

type Comment = {
    id: string;
    author_name: string;
    content: string;
    created_at: string;
    parent_id: string | null;
};

type CommentListProps = {
    postId: string;
    comments: Comment[];
    isSamplePost?: boolean;
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

export function CommentList({ postId, comments, isSamplePost = false }: CommentListProps) {
    const [replyingTo, setReplyingTo] = useState<string | null>(null);

    // Build comment tree
    const commentMap = new Map<string, Comment & { children: any[] }>();
    comments.forEach(c => {
        commentMap.set(c.id, { ...c, children: [] });
    });

    const rootComments: any[] = [];
    comments.forEach(c => {
        if (c.parent_id && commentMap.has(c.parent_id)) {
            commentMap.get(c.parent_id)!.children.push(commentMap.get(c.id));
        } else {
            // If parent not found (deleted?) or is root
            if (!c.parent_id) {
                rootComments.push(commentMap.get(c.id));
            } else {
                // Orphan comment - treat as root or hide? Treat as root for now to avoid data loss
                rootComments.push(commentMap.get(c.id));
            }
        }
    });

    // Sort by date logic could go here if needed, but assuming input is sorted by time

    const renderComment = (comment: any, depth: number = 0) => {
        return (
            <div key={comment.id} className={`flex flex-col ${depth > 0 ? "ml-8 mt-3 border-l-2 border-gray-100 pl-3" : "mt-4"}`}>
                <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <User className="h-4 w-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm text-gray-900">
                                {comment.author_name ?? "익명"}
                            </span>
                            <span className="text-xs text-gray-500">
                                {formatRelativeTime(comment.created_at)}
                            </span>
                        </div>
                        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                            {comment.content}
                        </p>
                        <div className="flex items-center gap-4 mt-2">
                            <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                                <Heart className="h-3.5 w-3.5" />
                                좋아요
                            </button>
                            {!isSamplePost && (
                                <button
                                    onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                                    className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                                >
                                    답글
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Reply Composer */}
                {replyingTo === comment.id && (
                    <div className="mt-3">
                        <CommentComposer
                            postId={postId}
                            parentId={comment.id}
                            onCancel={() => setReplyingTo(null)}
                            onSuccess={() => setReplyingTo(null)}
                        />
                    </div>
                )}

                {/* Children */}
                {comment.children && comment.children.length > 0 && (
                    <div className="space-y-3">
                        {comment.children.map((child: any) => renderComment(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    if (comments.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500">
                아직 댓글이 없습니다. 첫 댓글을 남겨보세요!
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {rootComments.map((root) => renderComment(root))}
        </div>
    );
}
