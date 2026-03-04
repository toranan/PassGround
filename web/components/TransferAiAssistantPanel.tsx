"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  traceId?: string;
  needsQuestionSubmission?: boolean;
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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: makeId(),
      role: "assistant",
      text: "안녕하세요. 편입 고민을 함께 정리해드리는 합곰입니다. 궁금한 점을 편하게 말씀해 주세요.",
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

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

  useEffect(() => {
    scrollToBottom();
  }, [messages, pending]);

  const openLoginPrompt = () => {
    setShowLoginPrompt(true);
    setError("");
  };

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;

    const question = input.trim();
    if (!question) return;

    const token = localStorage.getItem("access_token") ?? "";
    if (!token) {
      openLoginPrompt();
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
        throw new Error(payload?.error || "AI 도우미 응답을 불러오지 못했습니다.");
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
            throw new Error(errorPayload.error || "응답 생성 중 오류가 발생했습니다.");
          }
        }
      }

      if (donePayload) {
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantId
              ? {
                  ...item,
                  text: donePayload?.answer?.trim() || item.text || "답변을 생성하지 못했습니다.",
                  traceId: donePayload?.traceId,
                  needsQuestionSubmission: donePayload?.needsQuestionSubmission === true,
                }
              : item
          )
        );
      }

      setTimeout(scrollToBottom, 0);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "응답 중 오류가 발생했습니다.";
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
      openLoginPrompt();
      return;
    }

    const lastUserQuestion = [...messages].reverse().find((item) => item.role === "user")?.text?.trim() ?? "";
    if (!lastUserQuestion) {
      setError("접수할 질문을 찾지 못했습니다.");
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
        throw new Error(payload?.error || "질문 접수에 실패했습니다.");
      }

      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          text: payload.message || "질문 접수가 완료되었습니다. 확인 후 답변을 준비해드리겠습니다.",
        },
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "질문 접수 중 오류가 발생했습니다.");
    } finally {
      setSubmittingQuestion(false);
      setTimeout(scrollToBottom, 0);
    }
  };

  return (
    <>
      <div className="flex h-[80vh] min-h-[640px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
        <div className="border-b border-border/80 bg-background/90 px-4 py-3">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
            <div className="h-8 w-8 overflow-hidden rounded-full border border-border bg-white">
              <Image src="/hapgomi.png" alt="합곰이" width={32} height={32} className="h-full w-full object-cover" />
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <p className="text-sm font-semibold">편입 AI 도우미</p>
              <p className="text-xs text-muted-foreground">편하게 질문해 주세요</p>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-muted/15 px-4 py-5">
          <div className="mx-auto w-full max-w-3xl space-y-4">
            {messages.map((message) =>
              message.role === "assistant" ? (
                <div key={message.id} className="mr-auto max-w-[88%] rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-6 whitespace-pre-wrap text-foreground">
                  {message.text || (pending ? "생각 정리 중..." : "")}
                </div>
              ) : (
                <div key={message.id} className="ml-auto max-w-[80%] rounded-2xl bg-primary px-4 py-3 text-sm leading-6 whitespace-pre-wrap text-primary-foreground">
                  {message.text}
                </div>
              )
            )}
          </div>
        </div>

        <div className="border-t border-border/80 bg-background/95 px-4 py-3">
          <form onSubmit={handleSend} className="mx-auto w-full max-w-3xl space-y-2">
            <div className="flex items-end gap-2 rounded-2xl border border-input bg-background px-3 py-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="질문을 입력하세요"
                rows={1}
                className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none"
                disabled={pending}
              />
              <Button type="submit" disabled={pending || !input.trim()} className="h-9 rounded-xl bg-primary px-4 hover:bg-primary/90">
                {pending ? "생성 중" : "전송"}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="text-muted-foreground">근거 기반 답변을 우선 제공하며, 정보 부족 시 질문 접수를 안내합니다.</div>
              <div className="flex items-center gap-2">
                {canSubmitQuestion ? (
                  <Button type="button" variant="outline" size="sm" onClick={handleSubmitQuestion} disabled={submittingQuestion}>
                    {submittingQuestion ? "접수 중" : "질문하기"}
                  </Button>
                ) : null}
              </div>
            </div>
          </form>

          {error ? (
            <div className="mx-auto mt-2 w-full max-w-3xl">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : null}
        </div>
      </div>

      {showLoginPrompt ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4" onClick={() => setShowLoginPrompt(false)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-base font-semibold">로그인 후 이용 가능합니다</p>
            <p className="mt-2 text-sm text-muted-foreground">
              이 기능은 회원 전용입니다. 로그인 또는 회원가입 후 이용해 주세요.
            </p>
            <div className="mt-4 flex gap-2">
              <Button asChild className="bg-primary hover:bg-primary/90">
                <Link href="/signup">로그인/회원가입</Link>
              </Button>
              <Button variant="outline" onClick={() => setShowLoginPrompt(false)}>
                닫기
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
