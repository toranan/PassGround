import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SourcePdfViewer } from "@/components/SourcePdfViewer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { loadSourcePdfPaths, sourcePdfPublicUrl } from "@/lib/sourcePdfs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "근거 원문",
  robots: { index: false },
};

// AI 상담 답변의 근거 칩에서 연다. 앱에서는 같은 주소를 인앱 브라우저로 연다.
export default async function SourceViewPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string; page?: string; q?: string }>;
}) {
  const { doc = "", page = "1", q = "" } = await searchParams;
  if (!/^[a-f0-9]{64}$/.test(doc)) notFound();

  const admin = getSupabaseAdmin();
  const [paths, { data: document }] = await Promise.all([
    loadSourcePdfPaths(admin),
    admin.from("ai_source_documents").select("title,source_url,page_count").eq("sha256", doc).limit(1).maybeSingle(),
  ]);
  const path = paths.get(doc);
  if (!path || !document) notFound();

  const pageNumber = Math.max(1, Math.min(Number.parseInt(page, 10) || 1, document.page_count ?? Number.MAX_SAFE_INTEGER));
  const highlights = q.split("|").map((term) => term.trim()).filter(Boolean).slice(0, 10);

  return (
    <SourcePdfViewer
      pdfUrl={sourcePdfPublicUrl(admin, path)}
      title={document.title}
      initialPage={pageNumber}
      highlights={highlights}
      officialUrl={document.source_url}
    />
  );
}
