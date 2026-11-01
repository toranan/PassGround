// 근거 문서의 원본 PDF를 찾는다. 뉴스에 올린 공식 PDF(attachments 버킷)를 그대로 쓴다.
// 적재 문서와 첨부파일을 파일 크기로 짝짓는다(2026-11 기준 22개 문서를 SHA-256으로 대조해 모두 일치 확인).
import type { SupabaseClient } from "@supabase/supabase-js";

const CACHE_MS = 10 * 60 * 1000;
let cache: { at: number; paths: Map<string, string> } | null = null;

export async function loadSourcePdfPaths(admin: SupabaseClient): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.paths;
  const [{ data: files }, { data: documents }] = await Promise.all([
    admin.storage.from("attachments").list("posts", { limit: 1000 }),
    admin.from("ai_source_documents").select("sha256,file_size_bytes").eq("exam_slug", "transfer").eq("lifecycle_status", "active"),
  ]);
  const bySize = new Map<number, string>();
  for (const file of files ?? []) {
    const size = (file.metadata as { size?: number } | null)?.size;
    if (/\.pdf$/i.test(file.name) && typeof size === "number") bySize.set(size, `posts/${file.name}`);
  }
  const paths = new Map<string, string>();
  for (const document of (documents ?? []) as Array<{ sha256: string; file_size_bytes: number | null }>) {
    const path = document.file_size_bytes ? bySize.get(document.file_size_bytes) : undefined;
    if (path) paths.set(document.sha256, path);
  }
  cache = { at: Date.now(), paths };
  return paths;
}

export function sourcePdfPublicUrl(admin: SupabaseClient, path: string): string {
  return admin.storage.from("attachments").getPublicUrl(path).data.publicUrl;
}
