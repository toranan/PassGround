#!/usr/bin/env node
// 로컬 기출문제 폴더(<학교>/<학년도>_<학교>_<과목>_<문제|정답|문제및정답>.pdf)를 Supabase Storage(past-exams)에 올리고
// 웹 기출문제 탭이 읽는 index.json을 만든다. 기본은 dry-run이고 --commit일 때만 올린다.
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

export const PAST_EXAM_BUCKET = "past-exams";
const CONTENT_TYPES = { ".pdf": "application/pdf", ".zip": "application/zip", ".hwp": "application/x-hwp" };

// "2026_한국항공대학교_자연_영어수학_문제.pdf" → { year: 2026, school, subject: "자연 영어수학", kind: "문제" }
export function parsePastExamFilename(filename) {
  const ext = extname(filename).toLowerCase();
  const parts = basename(filename, extname(filename)).split("_");
  if (parts.length < 4 || !/^\d{4}$/.test(parts[0]) || !CONTENT_TYPES[ext]) return null;
  const kind = parts.at(-1);
  if (!["문제", "정답", "문제및정답"].includes(kind)) return null;
  return { year: Number(parts[0]), school: parts[1], subject: parts.slice(2, -1).join(" "), kind, ext };
}

export async function collectPastExams(root) {
  const items = [];
  for (const school of (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory())) {
    for (const name of await readdir(join(root, school.name))) {
      const parsed = parsePastExamFilename(name);
      if (!parsed) continue;
      const localPath = join(root, school.name, name);
      const buffer = await readFile(localPath);
      const hash = createHash("sha256").update(buffer).digest("hex");
      items.push({
        ...parsed,
        filename: name,
        localPath,
        size: (await stat(localPath)).size,
        // Storage 키는 한글을 피하고 내용 해시로 만든다. 같은 파일을 다시 올려도 키가 같다.
        path: `${parsed.year}/${hash.slice(0, 20)}${parsed.ext}`,
      });
    }
  }
  return items.sort((a, b) => a.school.localeCompare(b.school, "ko") || b.year - a.year || a.subject.localeCompare(b.subject, "ko"));
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const root = args.find((arg) => !arg.startsWith("--")) ?? "/Users/anseung-won/Desktop/편입학pdf모음/기출문제";
  const items = await collectPastExams(root);
  const schools = new Set(items.map((item) => item.school));
  console.log(`${schools.size}개 학교, ${items.length}개 파일, ${(items.reduce((sum, item) => sum + item.size, 0) / 1048576).toFixed(1)}MB`);
  if (!commit) {
    console.log("DRY RUN: --commit으로 실제 업로드합니다.");
    return;
  }

  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: bucketError } = await admin.storage.createBucket(PAST_EXAM_BUCKET, { public: true });
  if (bucketError && !/already exists/i.test(bucketError.message)) throw new Error(`버킷 생성 실패: ${bucketError.message}`);

  for (const [index, item] of items.entries()) {
    const { error } = await admin.storage.from(PAST_EXAM_BUCKET).upload(item.path, await readFile(item.localPath), {
      contentType: CONTENT_TYPES[item.ext],
      upsert: true,
    });
    if (error) throw new Error(`${item.filename} 업로드 실패: ${error.message}`);
    console.log(`[${index + 1}/${items.length}] ${item.filename}`);
  }

  const manifest = {
    updatedAt: new Date().toISOString(),
    items: items.map(({ year, school, subject, kind, ext, filename, size, path }) => ({ year, school, subject, kind, ext, filename, size, path })),
  };
  const { error: indexError } = await admin.storage.from(PAST_EXAM_BUCKET).upload("index.json", JSON.stringify(manifest), {
    contentType: "application/json",
    upsert: true,
    cacheControl: "60",
  });
  if (indexError) throw new Error(`목록 업로드 실패: ${indexError.message}`);
  console.log("업로드 완료");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
