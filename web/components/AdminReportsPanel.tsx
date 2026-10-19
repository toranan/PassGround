"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ReportItem = {
  targetType: "post" | "comment";
  targetId: string;
  postId: string | null;
  reportCount: number;
  reasons: string[];
  latestAt: string;
  title: string | null;
  content: string;
  authorName: string | null;
  authorAccountName: string | null;
  reportedUserId: string | null;
  isHidden: boolean;
  isBanned: boolean;
};

type ReportAction = "remove" | "ban" | "dismiss";

const ACTION_CONFIRM: Record<ReportAction, string> = {
  remove: "이 내용을 삭제(숨김)할까요?",
  ban: "이 내용을 삭제하고 작성자를 이용 정지할까요? 정지된 사용자는 글과 댓글을 쓸 수 없어요.",
  dismiss: "문제없음으로 처리할까요? 자동으로 숨겨졌다면 다시 보이게 돼요.",
};

function elapsedLabel(value: string): string {
  const hours = Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000);
  if (hours < 1) return "1시간 이내";
  return `${hours}시간 전`;
}

// 신고 검토: 애플 정책상 신고는 24시간 안에 처리(삭제·작성자 정지)해야 한다.
export function AdminReportsPanel({ getToken }: { getToken: () => Promise<string> }) {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reports", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; items?: ReportItem[]; error?: string } | null;
      if (!res.ok || !payload?.ok) {
        setMessage(payload?.error ?? "신고 목록을 불러오지 못했습니다.");
        return;
      }
      setItems(payload.items ?? []);
      setMessage("");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (item: ReportItem, action: ReportAction) => {
    if (!window.confirm(ACTION_CONFIRM[action])) return;
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/admin/reports", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: item.targetType, targetId: item.targetId, action }),
    });
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setMessage(payload?.error ?? "처리하지 못했습니다.");
      return;
    }
    setItems((prev) => prev.filter((row) => row.targetId !== item.targetId));
  };

  return (
    <Card className="border-none shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg">신고 검토</CardTitle>
        <p className="text-xs text-muted-foreground">
          신고는 24시간 안에 처리해 주세요. 3명 이상 신고한 내용은 자동으로 숨겨져 있어요.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? "불러오는 중..." : "새로고침"}
        </Button>
        {message ? <p className="text-sm text-red-600">{message}</p> : null}
        {items.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground">처리할 신고가 없어요.</p>
        ) : null}
        {items.map((item) => (
          <div key={`${item.targetType}:${item.targetId}`} className="rounded-lg border border-border px-3 py-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">신고 {item.reportCount}건</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{item.targetType === "post" ? "게시글" : "댓글"}</span>
              {item.isHidden ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">숨김 상태</span> : null}
              {item.isBanned ? <span className="rounded-full bg-gray-800 px-2 py-0.5 text-white">정지된 사용자</span> : null}
              <span className="text-muted-foreground">{item.reasons.join(", ")} · {elapsedLabel(item.latestAt)}</span>
            </div>
            {item.title ? <p className="text-sm font-semibold">{item.title}</p> : null}
            <p className="text-sm whitespace-pre-wrap break-words line-clamp-6">{item.content}</p>
            <p className="text-xs text-muted-foreground">
              작성자 표시: {item.authorName ?? "-"} · 계정 닉네임: {item.authorAccountName ?? "-"}
            </p>
            {item.postId ? (
              <a
                href={`/c/transfer/free/${item.postId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline underline-offset-2"
              >
                게시글 열기
              </a>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="destructive" onClick={() => void act(item, "remove")}>삭제</Button>
              <Button size="sm" variant="destructive" onClick={() => void act(item, "ban")} disabled={!item.reportedUserId}>
                삭제 + 작성자 정지
              </Button>
              <Button size="sm" variant="outline" onClick={() => void act(item, "dismiss")}>문제없음</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
