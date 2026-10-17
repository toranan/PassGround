#!/usr/bin/env node
// 검증된 모집요강 manifest의 하루 단위 일정(startsOn)을 앱 달력(exam_schedules)에 반영한다.
// "12월 중"처럼 날짜가 없는 일정은 넣지 않는다. 기본은 dry-run이고 --commit일 때만 쓴다.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseManifest } from "./ingest-transfer-manifest.mjs";

const CATEGORY_PATTERNS = [
  [/원서|접수/, "원서접수"],
  [/발표/, "합격발표"],
  [/필기|필답|시험|고사|면접|실기/, "편입학고사"],
];

function categoryOf(label) {
  return CATEGORY_PATTERNS.find(([pattern]) => pattern.test(label))?.[1] ?? "기타";
}

function schoolLabel(document) {
  return ["전체", "서울", ""].includes(document.campus) ? document.university : `${document.university} ${document.campus}`;
}

export function buildScheduleRows(manifest) {
  const { document } = manifest;
  const isFinal = ["최종 모집요강", "모집요강"].includes(document.documentType);
  return manifest.scheduleEvents
    .filter((event) => event.startsOn)
    .map((event) => {
      const provisional = !isFinal && event.metadata?.factStatus !== "scheduled";
      const school = schoolLabel(document);
      const baseTitle = `${document.admissionYear}학년도 ${school} 편입 ${event.label}`;
      const basis = isFinal ? "최종 모집요강" : "기본계획";
      return {
        exam_slug: document.examSlug,
        university: school,
        title: `${baseTitle}${provisional ? " (예정)" : ""}`,
        baseTitle,
        category: categoryOf(event.label),
        starts_at: event.startsAt ?? `${event.startsOn}T00:00:00+09:00`,
        ends_at: event.endsAt ?? `${event.endsOn ?? event.startsOn}T23:59:59+09:00`,
        location: null,
        organizer: `${document.university} 입학처`,
        link_url: document.sourceUrl ?? null,
        is_official: true,
        // 달력에는 대상이 일부일 때의 대상과, 잠정 일정 안내만 짧게 보여준다.
        note: [
          /^(전체|전 모집단위)/.test(event.audience) ? null
            : /대상(자)?$/.test(event.audience) ? event.audience : `${event.audience} 대상`,
          isFinal ? null : "기본계획 기준, 변경될 수 있어요",
        ].filter(Boolean).join(" · ") || null,
      };
    });
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const files = args.filter((arg) => !arg.startsWith("--"));
  if (!files.length) {
    console.log("Usage: npm run transfer:schedules -- <verified.json>... [--commit]");
    process.exit(1);
  }

  const rows = [];
  for (const file of files) {
    rows.push(...buildScheduleRows(parseManifest(await readFile(file, "utf8"), file)));
  }
  for (const row of rows) console.log(`${row.starts_at} ~ ${row.ends_at} | ${row.category} | ${row.title}`);
  console.log(`\n${rows.length}건${commit ? " 반영" : " (dry-run, --commit 시 반영)"}`);
  if (!commit) return;

  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 최종 요강으로 날짜가 바뀌거나 (예정)이 빠지면 같은 학교·일정명의 이전 행을 지우고 새로 넣는다.
  for (const { baseTitle, ...row } of rows) {
    const { error: deleteError } = await admin.from("exam_schedules").delete()
      .eq("exam_slug", row.exam_slug)
      .in("title", [baseTitle, `${baseTitle} (예정)`]);
    if (deleteError) throw new Error(`기존 일정 정리 실패: ${deleteError.message}`);
    const { error } = await admin.from("exam_schedules").insert(row);
    if (error) throw new Error(`${row.title} 반영 실패: ${error.message}`);
  }
  console.log("반영 완료");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
