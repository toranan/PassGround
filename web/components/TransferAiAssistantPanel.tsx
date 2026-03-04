"use client";

import Link from "next/link";
import { FormEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUserSnapshot, subscribeAuthChange } from "@/lib/authClient";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  traceId?: string;
  needsQuestionSubmission?: boolean;
};

type User = {
  id?: string;
  username?: string;
  nickname?: string;
};

type DonePayload = {
  answer?: string;
  traceId?: string;
  needsQuestionSubmission?: boolean;
};

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toHistory(messages: ChatMessage[]): Array<{ role: ChatRole; text: string }> {
  return messages
    .slice(-8)
    .map((message) => ({
      role: message.role,
      text: message.text,
    }))
    .filter((item) => item.text.trim().length > 0);
}

function parseSseBlock(raw: string): { event: string; data: string } | null {
  const lines = raw.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (!dataLines.length) return null;
  return { event, data: dataLines.join("\n") };
}

function findSseSeparator(buffer: string): { index: number; length: number } | null {
  const match = /\r?\n\r?\n/.exec(buffer);
  if (!match || typeof match.index !== "number") return null;
  return {
    index: match.index,
    length: match[0].length,
  };
}

export function TransferAiAssistantPanel() {
  const user = useSyncExternalStore(
    subscribeAuthChange,
    () => getUserSnapshot() as User | null,
    () => null
  );

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: makeId(),
      role: "assistant",
      text: "안녕! 나는 너의 편입 고민을 같이 풀어줄 합곰이야. 궁금한 거 편하게 물어봐.",
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [submittingQuestion, setSubmittingQuestion] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return messages[i];
    }
    return null;
  }, [messages]);

  const canSubmitQuestion = Boolean(lastAssistant?.needsQuestionSubmission);

  const scrollToBottom = () => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;

    const question = input.trim();
    if (!question) return;

    const token = localStorage.getItem("access_token") ?? "";
    if (!token) {
      setError("AI 도우미는 로그인 후 이용할 수 있어.");
      return;
    }

    const userMessage: ChatMessage = { id: makeId(), role: "user", text: question };
    const assistantId = makeId();

    setPending(true);
    setError("");
    setInput("");
    setMessages((prev) => [...prev, userMessage, { id: assistantId, role: "assistant", text: "" }]);

    try {
      const history = toHistory(messages);
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          exam: "transfer",
          question,
          stream: true,
          messages: history,
        }),
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "AI 도우미 응답을 불러오지 못했어.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let donePayload: DonePayload | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const separator = findSseSeparator(buffer);
          if (!separator) break;

          const block = buffer.slice(0, separator.index).trim();
          buffer = buffer.slice(separator.index + separator.length);

          const parsed = parseSseBlock(block);
          if (!parsed) continue;

          if (parsed.event === "delta") {
            const deltaPayload = JSON.parse(parsed.data) as { text?: string };
            const delta = deltaPayload.text ?? "";
            if (delta) {
              setMessages((prev) =>
                prev.map((item) =>
                  item.id === assistantId
                    ? { ...item, text: `${item.text}${delta}` }
                    : item
                )
              );
            }
          }

          if (parsed.event === "done") {
            donePayload = JSON.parse(parsed.data) as DonePayload;
          }

          if (parsed.event === "error") {
            const errorPayload = JSON.parse(parsed.data) as { error?: string };
            throw new Error(errorPayload.error || "응답 생성 중 오류가 발생했어.");
          }
        }
      }

      if (donePayload) {
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantId
              ? {
                  ...item,
                  text: donePayload?.answer?.trim() || item.text || "답변을 생성하지 못했어.",
                  traceId: donePayload?.traceId,
                  needsQuestionSubmission: donePayload?.needsQuestionSubmission === true,
                }
              : item
          )
        );
      }

      setTimeout(scrollToBottom, 0);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "응답 중 오류가 발생했어.";
      setError(message);
      setMessages((prev) => prev.filter((item) => item.id !== assistantId));
    } finally {
      setPending(false);
      setTimeout(scrollToBottom, 0);
    }
  };

  const handleSubmitQuestion = async () => {
    if (!canSubmitQuestion || submittingQuestion) return;
    const token = localStorage.getItem("access_token") ?? "";
    if (!token) {
      setError("질문 접수는 로그인 후 이용할 수 있어.");
      return;
    }

    const lastUserQuestion = [...messages].reverse().find((item) => item.role === "user")?.text?.trim() ?? "";
    if (!lastUserQuestion) {
      setError("접수할 질문을 찾지 못했어.");
      return;
    }

    try {
      setSubmittingQuestion(true);
      const response = await fetch("/api/ai/questions/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          exam: "transfer",
          question: lastUserQuestion,
          traceId: lastAssistant?.traceId,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "질문 접수에 실패했어.");
      }

      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          text: payload.message || "질문 접수 완료! 확인 후 답변 준비해둘게.",
        },
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "질문 접수 중 오류가 발생했어.");
    } finally {
      setSubmittingQuestion(false);
      setTimeout(scrollToBottom, 0);
    }
  };

  if (!user?.id) {
    return (
      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">합곰 AI 도우미</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">AI 도우미는 로그인 후 이용할 수 있어.</p>
          <Button asChild className="bg-primary hover:bg-primary/90">
            <Link href="/signup">로그인/회원가입</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">합곰 AI 도우미</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={scrollRef} className="max-h-[420px] overflow-y-auto space-y-2 rounded-xl border border-border bg-muted/20 p-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                message.role === "assistant"
                  ? "bg-white border border-border text-foreground"
                  : "ml-auto w-fit max-w-[85%] bg-primary text-primary-foreground"
              }`}
            >
              {message.text || (pending && message.role === "assistant" ? "생각 정리 중..." : "")}
            </div>
          ))}
        </div>

        <form onSubmit={handleSend} className="space-y-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="편입 고민이나 질문을 입력해줘"
            rows={3}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            disabled={pending}
          />
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={pending || !input.trim()} className="bg-primary hover:bg-primary/90">
              {pending ? "답변 생성 중..." : "보내기"}
            </Button>
            {canSubmitQuestion && (
              <Button type="button" variant="outline" onClick={handleSubmitQuestion} disabled={submittingQuestion}>
                {submittingQuestion ? "접수 중..." : "질문하기"}
              </Button>
            )}
            <Button type="button" variant="ghost" asChild>
              <Link href="/transfer/ai?tab=cutoff">AI 커트라인 분석</Link>
            </Button>
          </div>
        </form>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
