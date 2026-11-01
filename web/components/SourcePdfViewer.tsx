"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

type Highlight = { left: number; top: number; width: number; height: number };

// 텍스트 조각 경계와 띄어쓰기가 PDF마다 달라서, 공백을 뺀 페이지 전체 글자에서 단어를 찾고
// 그 글자가 속한 텍스트 조각을 칠한다.
function findHighlightedItems(items: Array<{ str: string }>, terms: string[]): Set<number> {
  const chars: number[] = [];
  let text = "";
  items.forEach((item, index) => {
    for (const char of item.str) {
      if (/\s/.test(char)) continue;
      text += char;
      chars.push(index);
    }
  });
  const hits = new Set<number>();
  for (const term of terms) {
    const needle = term.replace(/\s+/g, "");
    if (!needle) continue;
    let from = text.indexOf(needle);
    while (from >= 0) {
      for (let offset = 0; offset < needle.length; offset += 1) hits.add(chars[from + offset]);
      from = text.indexOf(needle, from + needle.length);
    }
  }
  return hits;
}

export function SourcePdfViewer({
  pdfUrl,
  title,
  initialPage,
  highlights,
  officialUrl,
}: {
  pdfUrl: string;
  title: string;
  initialPage: number;
  highlights: string[];
  officialUrl: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(initialPage);
  const [boxes, setBoxes] = useState<Highlight[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const loaded = await pdfjs.getDocument(pdfUrl).promise;
        if (!cancelled) setPdf(loaded);
      } catch {
        if (!cancelled) setError("원문 PDF를 불러오지 못했어요.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !containerRef.current) return;
    let cancelled = false;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      const pdfPage = await pdf.getPage(page);
      const base = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: containerRef.current!.clientWidth / base.width });
      const ratio = window.devicePixelRatio || 1;
      const canvas = canvasRef.current!;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      await pdfPage.render({
        canvasContext: canvas.getContext("2d")!,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      }).promise;

      const content = await pdfPage.getTextContent();
      const items = content.items.filter((item): item is typeof item & { str: string; transform: number[]; width: number } => "str" in item);
      const hits = findHighlightedItems(items, highlights);
      const next = [...hits].map((index) => {
        const item = items[index];
        const tx = pdfjs.Util.transform(viewport.transform, item.transform);
        const height = Math.hypot(tx[2], tx[3]);
        return { left: tx[4], top: tx[5] - height, width: item.width * viewport.scale, height };
      });
      if (cancelled) return;
      setSize({ width: viewport.width, height: viewport.height });
      setBoxes(next);
      if (next.length) {
        const top = Math.min(...next.map((box) => box.top));
        window.scrollTo({ top: Math.max(0, containerRef.current!.offsetTop + top - 120), behavior: "smooth" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, page, highlights]);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-3 backdrop-blur">
        <p className="truncate text-sm font-semibold">{title}</p>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              이전
            </button>
            <span>
              {page} / {pdf?.numPages ?? "-"} 페이지
            </span>
            <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={!pdf || page >= pdf.numPages} onClick={() => setPage(page + 1)}>
              다음
            </button>
          </div>
          {officialUrl ? (
            <a href={officialUrl} target="_blank" rel="noreferrer" className="underline">
              입학처 원문
            </a>
          ) : null}
        </div>
        {page === initialPage && highlights.length ? (
          <p className="mt-2 text-xs text-muted-foreground">답변에 쓰인 내용을 노란색으로 표시했어요.</p>
        ) : null}
      </header>

      <main className="mx-auto max-w-3xl px-2 py-4">
        {error ? <p className="p-4 text-sm text-red-600">{error}</p> : null}
        <div ref={containerRef} className="relative bg-white shadow" style={size.height ? { height: size.height } : undefined}>
          <canvas ref={canvasRef} className="block" />
          {page === initialPage
            ? boxes.map((box, index) => (
                <span
                  key={index}
                  className="pointer-events-none absolute rounded-sm bg-yellow-300/50"
                  style={{ left: box.left - 2, top: box.top - 2, width: box.width + 4, height: box.height + 4 }}
                />
              ))
            : null}
        </div>
      </main>
    </div>
  );
}
