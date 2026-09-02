#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chunkVerifiedSectionText } from "../lib/knowledgeDoc.ts";

const EMBEDDING_API_URL = "https://api.openai.com/v1/embeddings";
const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_BATCH_SIZE = 64;
// embedding 80개를 한 번에 PostgREST로 보내면 요청 본문이 커져 연결이 끊길 수 있다.
// 문서가 archived인 동안 작은 멱등 배치로 모두 적재한 뒤 마지막에 active로 전환한다.
const DATABASE_UPSERT_BATCH_SIZE = 10;

function usage() {
  console.log(
    [
      "Usage:",
      "  npm run transfer:ingest -- <verified.json>",
      "  npm run transfer:ingest -- <verified.json> --pdf <source.pdf>",
      "  npm run transfer:ingest -- <verified.json> --pdf <source.pdf> --commit",
      "",
      "기본값은 검증만 수행하는 dry-run이다. --commit을 붙이면 구조화 테이블과",
      "검색용 transfer_knowledge_units를 하나의 manifest에서 멱등 적재한다.",
    ].join("\n")
  );
}

function fail(message) {
  throw new Error(message);
}

function requireString(value, label) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) fail(`${label}이(가) 필요합니다.`);
  return normalized;
}

function requireInteger(value, label, min = Number.MIN_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < min) fail(`${label}이(가) 올바른 정수가 아닙니다.`);
  return value;
}

function optionalInteger(value, label, min = 0) {
  if (value === null || value === undefined) return null;
  return requireInteger(value, label, min);
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    fail(`${label}이(가) 문자열 배열이 아닙니다.`);
  }
  return [...new Set(value.map((entry) => entry.trim()))];
}

function optionalIso(value, label) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = requireString(value, label);
  if (!Number.isFinite(Date.parse(normalized))) fail(`${label}의 날짜 형식이 올바르지 않습니다: ${normalized}`);
  return normalized;
}

function optionalDate(value, label) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = requireString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || !Number.isFinite(Date.parse(`${normalized}T00:00:00Z`))) {
    fail(`${label}의 날짜 형식은 YYYY-MM-DD여야 합니다: ${normalized}`);
  }
  return normalized;
}

export function parseManifest(raw, filename) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`JSON 파싱 실패 (${filename}): ${error instanceof Error ? error.message : error}`);
  }

  if (!parsed || typeof parsed !== "object") fail("manifest 최상위는 객체여야 합니다.");
  if (parsed.schemaVersion !== 1) fail(`지원하지 않는 schemaVersion입니다: ${parsed.schemaVersion}`);

  const doc = parsed.document ?? {};
  const document = {
    examSlug: requireString(doc.examSlug, "document.examSlug"),
    university: requireString(doc.university, "document.university"),
    campus: requireString(doc.campus, "document.campus"),
    admissionYear: requireInteger(doc.admissionYear, "document.admissionYear", 2020),
    documentType: requireString(doc.documentType, "document.documentType"),
    title: requireString(doc.title, "document.title"),
    sourceFile: requireString(doc.sourceFile, "document.sourceFile"),
    sourceUrl: typeof doc.sourceUrl === "string" && doc.sourceUrl.trim() ? doc.sourceUrl.trim() : null,
    sha256: requireString(doc.sha256, "document.sha256").toLowerCase(),
    fileSizeBytes: optionalInteger(doc.fileSizeBytes, "document.fileSizeBytes", 1),
    pageCount: requireInteger(doc.pageCount, "document.pageCount", 1),
    reviewStatus: requireString(doc.reviewStatus, "document.reviewStatus"),
    lifecycleStatus: requireString(doc.lifecycleStatus, "document.lifecycleStatus"),
    verifiedAt: optionalIso(doc.verifiedAt, "document.verifiedAt"),
    metadata: doc.metadata && typeof doc.metadata === "object" && !Array.isArray(doc.metadata) ? doc.metadata : {},
  };

  if (document.examSlug !== "transfer") fail("transfer manifest의 examSlug는 transfer여야 합니다.");
  if (!/^[a-f0-9]{64}$/.test(document.sha256)) fail("document.sha256가 64자 16진수가 아닙니다.");
  if (document.reviewStatus !== "verified") fail("DB 적재는 reviewStatus=verified인 manifest만 허용합니다.");
  if (document.lifecycleStatus !== "active") fail("DB 적재 대상 manifest는 lifecycleStatus=active여야 합니다.");

  const sectionKeys = new Set();
  const sections = (Array.isArray(parsed.sections) ? parsed.sections : []).map((row, index) => {
    const key = requireString(row?.key, `sections[${index}].key`);
    if (sectionKeys.has(key)) fail(`중복 section key: ${key}`);
    sectionKeys.add(key);
    const pageStart = requireInteger(row.pageStart, `sections[${index}].pageStart`, 1);
    const pageEnd = requireInteger(row.pageEnd, `sections[${index}].pageEnd`, pageStart);
    if (pageEnd > document.pageCount) fail(`section ${key}의 pageEnd가 PDF 페이지 수보다 큽니다.`);
    return {
      key,
      heading: requireString(row.heading, `sections[${index}].heading`),
      content: requireString(row.content, `sections[${index}].content`),
      pageStart,
      pageEnd,
      metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {},
    };
  });
  if (!sections.length) fail("sections가 하나 이상 필요합니다.");

  const ruleKeys = new Set();
  const selectionRules = (Array.isArray(parsed.selectionRules) ? parsed.selectionRules : []).map((row, index) => {
    const key = requireString(row?.key, `selectionRules[${index}].key`);
    if (ruleKeys.has(key)) fail(`중복 selection rule key: ${key}`);
    ruleKeys.add(key);
    const scopeType = requireString(row.scopeType, `selectionRules[${index}].scopeType`);
    if (!["all", "category", "college", "major"].includes(scopeType)) fail(`잘못된 scopeType: ${scopeType}`);
    const sourcePages = Array.isArray(row.sourcePages)
      ? row.sourcePages.map((page, pageIndex) => requireInteger(page, `selectionRules[${index}].sourcePages[${pageIndex}]`, 1))
      : [];
    if (!sourcePages.length || sourcePages.some((page) => page > document.pageCount)) {
      fail(`selection rule ${key}의 sourcePages가 올바르지 않습니다.`);
    }
    return {
      key,
      scopeType,
      scopeValue: requireString(row.scopeValue, `selectionRules[${index}].scopeValue`),
      transferTypes: requireStringArray(row.transferTypes, `selectionRules[${index}].transferTypes`),
      writtenSubjects: requireStringArray(row.writtenSubjects ?? [], `selectionRules[${index}].writtenSubjects`),
      examMinutes: optionalInteger(row.examMinutes, `selectionRules[${index}].examMinutes`, 1),
      questionCount: optionalInteger(row.questionCount, `selectionRules[${index}].questionCount`, 1),
      examFormat: typeof row.examFormat === "string" ? row.examFormat.trim() : "",
      stage1WrittenWeight: row.stage1WrittenWeight ?? null,
      finalWrittenWeight: row.finalWrittenWeight ?? null,
      finalDocumentWeight: row.finalDocumentWeight ?? null,
      finalInterviewWeight: row.finalInterviewWeight ?? null,
      finalPracticalWeight: row.finalPracticalWeight ?? null,
      stage1SelectionMinMultiple: optionalInteger(
        row.stage1SelectionMinMultiple,
        `selectionRules[${index}].stage1SelectionMinMultiple`,
        1
      ),
      stage1SelectionMaxMultiple: optionalInteger(
        row.stage1SelectionMaxMultiple,
        `selectionRules[${index}].stage1SelectionMaxMultiple`,
        1
      ),
      englishToeicMin: optionalInteger(row.englishToeicMin, `selectionRules[${index}].englishToeicMin`, 0),
      englishTepsMin: optionalInteger(row.englishTepsMin, `selectionRules[${index}].englishTepsMin`, 0),
      englishToeflIbtMin: optionalInteger(
        row.englishToeflIbtMin,
        `selectionRules[${index}].englishToeflIbtMin`,
        0
      ),
      englishScoreValidFrom: optionalDate(
        row.englishScoreValidFrom,
        `selectionRules[${index}].englishScoreValidFrom`
      ),
      englishScoreValidThrough: optionalDate(
        row.englishScoreValidThrough,
        `selectionRules[${index}].englishScoreValidThrough`
      ),
      sourcePages,
      notes: typeof row.notes === "string" ? row.notes.trim() : "",
      metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {},
    };
  });
  if (!selectionRules.length) fail("selectionRules가 하나 이상 필요합니다.");

  const scheduleKeys = new Set();
  const scheduleEvents = (Array.isArray(parsed.scheduleEvents) ? parsed.scheduleEvents : []).map((row, index) => {
    const key = requireString(row?.key, `scheduleEvents[${index}].key`);
    if (scheduleKeys.has(key)) fail(`중복 schedule event key: ${key}`);
    scheduleKeys.add(key);
    const startsAt = optionalIso(row.startsAt, `scheduleEvents[${index}].startsAt`);
    const endsAt = optionalIso(row.endsAt, `scheduleEvents[${index}].endsAt`);
    const startsOn = optionalDate(row.startsOn, `scheduleEvents[${index}].startsOn`);
    const endsOn = optionalDate(row.endsOn, `scheduleEvents[${index}].endsOn`);
    if (startsAt && endsAt && Date.parse(endsAt) < Date.parse(startsAt)) fail(`schedule event ${key}의 종료가 시작보다 빠릅니다.`);
    if (startsOn && endsOn && endsOn < startsOn) fail(`schedule event ${key}의 종료일이 시작일보다 빠릅니다.`);
    return {
      key,
      audience: requireString(row.audience, `scheduleEvents[${index}].audience`),
      label: requireString(row.label, `scheduleEvents[${index}].label`),
      startsAt,
      endsAt,
      startsOn,
      endsOn,
      displayText: requireString(row.displayText, `scheduleEvents[${index}].displayText`),
      details: typeof row.details === "string" ? row.details.trim() : "",
      sourcePage: requireInteger(row.sourcePage, `scheduleEvents[${index}].sourcePage`, 1),
      metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {},
    };
  });

  const programKeys = new Set();
  const programs = (Array.isArray(parsed.programs) ? parsed.programs : []).map((row, index) => {
    const college = requireString(row?.college, `programs[${index}].college`);
    const major = requireString(row?.major, `programs[${index}].major`);
    const key = `${college}|${major}`;
    if (programKeys.has(key)) fail(`중복 program: ${key}`);
    programKeys.add(key);
    return {
      college,
      category: requireString(row.category, `programs[${index}].category`),
      major,
      general: requireInteger(row.general, `programs[${index}].general`, 0),
      bachelor: requireInteger(row.bachelor, `programs[${index}].bachelor`, 0),
      nursingNight: optionalInteger(row.nursingNight, `programs[${index}].nursingNight`, 0),
      sourcePage: requireInteger(row.sourcePage, `programs[${index}].sourcePage`, 1),
      metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {},
    };
  });
  const recruitmentQuotaStatus = document.metadata?.factAvailability?.recruitmentQuota;
  if (!programs.length && recruitmentQuotaStatus !== "deferred") {
    fail("programs가 하나 이상 필요합니다. 모집인원 미공개 기본계획은 document.metadata.factAvailability.recruitmentQuota=deferred를 지정하세요.");
  }

  const validation = parsed.validation ?? {};
  const actual = {
    programRows: programs.length,
    generalTotal: programs.reduce((sum, row) => sum + row.general, 0),
    bachelorTotal: programs.reduce((sum, row) => sum + row.bachelor, 0),
    nursingNightTotal: programs.reduce((sum, row) => sum + (row.nursingNight ?? 0), 0),
    selectionRuleRows: selectionRules.length,
    scheduleRows: scheduleEvents.length,
  };
  const expectedPairs = [
    ["expectedProgramRows", "programRows"],
    ["expectedGeneralTotal", "generalTotal"],
    ["expectedBachelorTotal", "bachelorTotal"],
    ["expectedNursingNightTotal", "nursingNightTotal"],
    ["expectedSelectionRuleRows", "selectionRuleRows"],
    ["expectedScheduleRows", "scheduleRows"],
  ];
  for (const [expectedKey, actualKey] of expectedPairs) {
    if (validation[expectedKey] !== actual[actualKey]) {
      fail(`검증 실패: ${expectedKey}=${validation[expectedKey]}, actual=${actual[actualKey]}`);
    }
  }

  return { document, sections, selectionRules, scheduleEvents, programs, validation, actual };
}

function pageLabel(start, end = start) {
  return start === end ? `${start}페이지` : `${start}~${end}페이지`;
}

function sourcePrefix(document, pages, heading) {
  return `[출처: ${document.admissionYear}학년도 ${document.university} ${document.title} / PDF ${pages} / 섹션: ${heading}]`;
}

function formatWeight(label, value) {
  return value === null || value === undefined ? "" : `${label} ${Number(value).toFixed(Number(value) % 1 ? 2 : 0)}%`;
}

export function buildTransferKnowledgeUnits(manifest) {
  const { document } = manifest;
  const units = [];
  const base = {
    university: document.university,
    campus: document.campus,
    admissionYear: document.admissionYear,
  };

  for (const section of manifest.sections) {
    const prefix = sourcePrefix(document, pageLabel(section.pageStart, section.pageEnd), section.heading);
    const chunks = chunkVerifiedSectionText(`${prefix}\n${section.content}`);
    chunks.forEach((content, chunkIndex) => {
      units.push({
        ...base,
        unitKey: `section:${section.key}`,
        chunkIndex,
        unitType: "section",
        content,
        sourcePages: Array.from(
          { length: section.pageEnd - section.pageStart + 1 },
          (_, index) => section.pageStart + index
        ),
        metadata: { heading: section.heading, sectionKey: section.key, ...section.metadata },
      });
    });
  }

  for (const rule of manifest.selectionRules) {
    const prefix = sourcePrefix(document, rule.sourcePages.map((page) => `${page}페이지`).join(", "), "전형요소 및 반영비율");
    const subjects = rule.writtenSubjects.length ? rule.writtenSubjects.join("·") : "없음";
    const finalWeights = [
      formatWeight("필기", rule.finalWrittenWeight),
      formatWeight("서류", rule.finalDocumentWeight),
      formatWeight("면접", rule.finalInterviewWeight),
      formatWeight("실기", rule.finalPracticalWeight),
    ].filter(Boolean);
    const body = [
      `${rule.scopeValue}에 적용되는 ${rule.transferTypes.join("·")}의 필기시험 과목은 ${subjects}이다.`,
      rule.examMinutes ? `필기시험 시간은 ${rule.examMinutes}분이고 ${rule.examFormat}이다.` : rule.examFormat,
      rule.stage1WrittenWeight === null ? "" : `1단계는 필기시험 ${rule.stage1WrittenWeight}%를 반영한다.`,
      rule.stage1SelectionMinMultiple === null || rule.stage1SelectionMaxMultiple === null
        ? ""
        : `1단계 합격자는 최종선발인원의 ${rule.stage1SelectionMinMultiple}~${rule.stage1SelectionMaxMultiple}배수를 선발한다.`,
      finalWeights.length ? `최종 단계는 ${finalWeights.join(", ")}를 반영한다.` : "",
      rule.englishToeicMin === null
        ? ""
        : `추가지원자격 공인영어 기준은 TOEIC ${rule.englishToeicMin}점, TEPS ${rule.englishTepsMin}점, TOEFL(iBT) ${rule.englishToeflIbtMin}점 이상 중 하나이며 인정 응시기간은 ${rule.englishScoreValidFrom}부터 ${rule.englishScoreValidThrough}까지다.`,
      rule.notes,
    ].filter(Boolean).join(" ");
    units.push({
      ...base,
      unitKey: `rule:${rule.key}`,
      chunkIndex: 0,
      unitType: "selection_rule",
      scopeType: rule.scopeType,
      scopeValue: rule.scopeValue,
      transferTypes: rule.transferTypes,
      writtenSubjects: rule.writtenSubjects,
      examMinutes: rule.examMinutes,
      questionCount: rule.questionCount,
      examFormat: rule.examFormat || null,
      stage1WrittenWeight: rule.stage1WrittenWeight,
      finalWrittenWeight: rule.finalWrittenWeight,
      finalDocumentWeight: rule.finalDocumentWeight,
      finalInterviewWeight: rule.finalInterviewWeight,
      finalPracticalWeight: rule.finalPracticalWeight,
      stage1SelectionMinMultiple: rule.stage1SelectionMinMultiple,
      stage1SelectionMaxMultiple: rule.stage1SelectionMaxMultiple,
      englishToeicMin: rule.englishToeicMin,
      englishTepsMin: rule.englishTepsMin,
      englishToeflIbtMin: rule.englishToeflIbtMin,
      englishScoreValidFrom: rule.englishScoreValidFrom,
      englishScoreValidThrough: rule.englishScoreValidThrough,
      content: `${prefix}\n${body}`,
      sourcePages: rule.sourcePages,
      metadata: { ruleKey: rule.key, notes: rule.notes, ...rule.metadata },
    });
  }

  for (const event of manifest.scheduleEvents) {
    const prefix = sourcePrefix(document, `${event.sourcePage}페이지`, "편입학 전형일정");
    units.push({
      ...base,
      unitKey: `schedule:${event.key}`,
      chunkIndex: 0,
      unitType: "schedule",
      eventLabel: event.label,
      eventAudience: event.audience,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      content: `${prefix}\n${event.label}의 대상은 ${event.audience}이며 일정은 ${event.displayText}이다.${event.details ? ` ${event.details}` : ""}`,
      sourcePages: [event.sourcePage],
      metadata: { eventKey: event.key, displayText: event.displayText, details: event.details, ...event.metadata },
    });
  }

  for (const program of manifest.programs) {
    const prefix = sourcePrefix(document, `${program.sourcePage}페이지`, "모집인원");
    const nursing = program.nursingNight === null ? "간호학과(야) 해당 없음" : `간호학과(야) ${program.nursingNight}명`;
    units.push({
      ...base,
      unitKey: `program:${program.college}:${program.major}`,
      chunkIndex: 0,
      unitType: "program",
      college: program.college,
      category: program.category,
      major: program.major,
      generalCount: program.general,
      bachelorCount: program.bachelor,
      nursingNightCount: program.nursingNight,
      content: `${prefix}\n${document.university} ${document.campus}캠퍼스 ${program.college} ${program.major}(${program.category})의 모집인원은 일반편입 ${program.general}명, 학사편입 ${program.bachelor}명, ${nursing}이다.`,
      sourcePages: [program.sourcePage],
      metadata: { ...program.metadata },
    });
  }

  return units;
}

async function verifySourcePdf(pdfFilename, document) {
  if (!pdfFilename) return null;
  const buffer = await readFile(pdfFilename);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  if (sha256 !== document.sha256) {
    fail(`PDF SHA-256 불일치: manifest=${document.sha256}, actual=${sha256}`);
  }
  if (document.fileSizeBytes !== null && buffer.length !== document.fileSizeBytes) {
    fail(`PDF 크기 불일치: manifest=${document.fileSizeBytes}, actual=${buffer.length}`);
  }
  return { sha256, size: buffer.length };
}

async function createEmbeddings(inputs) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const model = String(process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small").trim();
  if (!apiKey) fail("OPENAI_API_KEY가 설정되어 있지 않습니다.");

  const vectors = [];
  for (let start = 0; start < inputs.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = inputs.slice(start, start + EMBEDDING_BATCH_SIZE);
    const response = await fetch(EMBEDDING_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        input: batch,
        ...(model.startsWith("text-embedding-3") ? { dimensions: EMBEDDING_DIMENSIONS } : {}),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) fail(payload?.error?.message || `임베딩 생성 실패: HTTP ${response.status}`);
    const batchVectors = Array.isArray(payload?.data)
      ? payload.data.map((row) => (Array.isArray(row?.embedding) ? row.embedding : []))
      : [];
    if (batchVectors.length !== batch.length || batchVectors.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)) {
      fail(`임베딩 차원 불일치: expected=${EMBEDDING_DIMENSIONS}, actual=${batchVectors[0]?.length ?? 0}`);
    }
    vectors.push(...batchVectors);
  }
  return { model, vectors };
}

function createSupabaseAdmin() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !serviceKey) fail("SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

async function syncManifest(manifest, units, embeddingResult) {
  const admin = createSupabaseAdmin();
  const { document } = manifest;
  if (units.length !== embeddingResult.vectors.length) fail("지식 단위와 임베딩 수가 일치하지 않습니다.");

  const { data: existingDocument, error: existingError } = await admin
    .from("ai_source_documents")
    .select("id")
    .eq("sha256", document.sha256)
    .maybeSingle();
  if (existingError) fail(`ai_source_documents 조회 실패: ${existingError.message}`);

  const documentId = existingDocument?.id ?? randomUUID();
  const { data: previousActive, error: previousError } = await admin
    .from("ai_source_documents")
    .select("id,sha256")
    .eq("exam_slug", document.examSlug)
    .eq("university", document.university)
    .eq("campus", document.campus)
    .eq("admission_year", document.admissionYear)
    .eq("lifecycle_status", "active")
    .neq("id", documentId);
  if (previousError) fail(`이전 활성 문서 조회 실패: ${previousError.message}`);

  const { error: documentError } = await admin.from("ai_source_documents").upsert(
    {
      id: documentId,
      exam_slug: document.examSlug,
      university: document.university,
      campus: document.campus,
      admission_year: document.admissionYear,
      document_type: document.documentType,
      title: document.title,
      source_file: document.sourceFile,
      source_url: document.sourceUrl,
      sha256: document.sha256,
      file_size_bytes: document.fileSizeBytes,
      page_count: document.pageCount,
      review_status: document.reviewStatus,
      lifecycle_status: "archived",
      metadata: document.metadata,
      verified_at: document.verifiedAt,
    },
    { onConflict: "sha256" }
  );
  if (documentError) fail(`ai_source_documents upsert 실패: ${documentError.message}`);

  const unitRows = units.map((unit, index) => ({
    document_id: documentId,
    unit_key: unit.unitKey,
    chunk_index: unit.chunkIndex,
    unit_type: unit.unitType,
    university: unit.university,
    campus: unit.campus,
    admission_year: unit.admissionYear,
    college: unit.college ?? null,
    category: unit.category ?? null,
    major: unit.major ?? null,
    scope_type: unit.scopeType ?? null,
    scope_value: unit.scopeValue ?? null,
    transfer_types: unit.transferTypes ?? [],
    written_subjects: unit.writtenSubjects ?? [],
    general_count: unit.generalCount ?? null,
    bachelor_count: unit.bachelorCount ?? null,
    nursing_night_count: unit.nursingNightCount ?? null,
    exam_minutes: unit.examMinutes ?? null,
    question_count: unit.questionCount ?? null,
    exam_format: unit.examFormat ?? null,
    stage1_written_weight: unit.stage1WrittenWeight ?? null,
    final_written_weight: unit.finalWrittenWeight ?? null,
    final_document_weight: unit.finalDocumentWeight ?? null,
    final_interview_weight: unit.finalInterviewWeight ?? null,
    final_practical_weight: unit.finalPracticalWeight ?? null,
    stage1_selection_min_multiple: unit.stage1SelectionMinMultiple ?? null,
    stage1_selection_max_multiple: unit.stage1SelectionMaxMultiple ?? null,
    english_toeic_min: unit.englishToeicMin ?? null,
    english_teps_min: unit.englishTepsMin ?? null,
    english_toefl_ibt_min: unit.englishToeflIbtMin ?? null,
    english_score_valid_from: unit.englishScoreValidFrom ?? null,
    english_score_valid_through: unit.englishScoreValidThrough ?? null,
    event_label: unit.eventLabel ?? null,
    event_audience: unit.eventAudience ?? null,
    starts_on: unit.startsOn ?? null,
    ends_on: unit.endsOn ?? null,
    starts_at: unit.startsAt ?? null,
    ends_at: unit.endsAt ?? null,
    content: unit.content,
    source_pages: unit.sourcePages,
    metadata: unit.metadata,
    embedding: embeddingResult.vectors[index],
  }));

  for (let start = 0; start < unitRows.length; start += DATABASE_UPSERT_BATCH_SIZE) {
    const batch = unitRows.slice(start, start + DATABASE_UPSERT_BATCH_SIZE);
    const { error: unitError } = await admin.from("transfer_knowledge_units").upsert(batch, {
      onConflict: "document_id,unit_key,chunk_index",
    });
    if (unitError) {
      const batchNumber = Math.floor(start / DATABASE_UPSERT_BATCH_SIZE) + 1;
      fail(`transfer_knowledge_units ${batchNumber}번 배치 upsert 실패: ${unitError.message}`);
    }
  }

  const { data: existingUnits, error: existingUnitError } = await admin
    .from("transfer_knowledge_units")
    .select("id,unit_key,chunk_index")
    .eq("document_id", documentId);
  if (existingUnitError) fail(`transfer_knowledge_units 기존 행 조회 실패: ${existingUnitError.message}`);
  const activeKeys = new Set(units.map((unit) => `${unit.unitKey}|${unit.chunkIndex}`));
  const staleUnitIds = (existingUnits ?? [])
    .filter((row) => !activeKeys.has(`${row.unit_key}|${row.chunk_index}`))
    .map((row) => row.id);
  if (staleUnitIds.length) {
    const { error: staleError } = await admin.from("transfer_knowledge_units").delete().in("id", staleUnitIds);
    if (staleError) fail(`stale 지식 단위 정리 실패: ${staleError.message}`);
  }

  const { error: activateError } = await admin
    .from("ai_source_documents")
    .update({ lifecycle_status: "active" })
    .eq("id", documentId);
  if (activateError) fail(`문서 활성화 실패: ${activateError.message}`);

  const supersededIds = (previousActive ?? []).map((row) => row.id);
  if (supersededIds.length) {
    const { error: supersedeError } = await admin
      .from("ai_source_documents")
      .update({ lifecycle_status: "superseded" })
      .in("id", supersededIds);
    if (supersedeError) fail(`이전 문서 superseded 처리 실패: ${supersedeError.message}`);
  }

  return {
    documentId,
    units: unitRows.length,
    staleUnits: staleUnitIds.length,
    supersededDocuments: supersededIds.length,
  };
}

function parseArgs(args) {
  const commit = args.includes("--commit");
  const pdfIndex = args.indexOf("--pdf");
  const pdfArg = pdfIndex >= 0 ? args[pdfIndex + 1] : null;
  if (pdfIndex >= 0 && (!pdfArg || pdfArg.startsWith("--"))) fail("--pdf 뒤에 원본 PDF 경로가 필요합니다.");
  const valueArgs = new Set(pdfIndex >= 0 ? [pdfIndex + 1] : []);
  const manifestArg = args.find((arg, index) => !arg.startsWith("--") && !valueArgs.has(index));
  return { commit, pdfArg, manifestArg };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    usage();
    return;
  }
  const { commit, pdfArg, manifestArg } = parseArgs(args);
  if (!manifestArg) {
    usage();
    process.exit(1);
  }

  const manifestFilename = path.resolve(process.cwd(), manifestArg);
  const raw = await readFile(manifestFilename, "utf8");
  const manifest = parseManifest(raw, manifestFilename);
  const pdfFilename = pdfArg ? path.resolve(process.cwd(), pdfArg) : null;
  const pdfVerification = await verifySourcePdf(pdfFilename, manifest.document);
  const units = buildTransferKnowledgeUnits(manifest);
  const unitTexts = units.map((unit) => unit.content);

  console.log("Transfer manifest validation");
  console.log(`- document: ${manifest.document.title}`);
  console.log(`- university/campus: ${manifest.document.university} / ${manifest.document.campus}`);
  console.log(`- admissionYear: ${manifest.document.admissionYear}`);
  console.log(`- sha256: ${manifest.document.sha256}`);
  console.log(`- sourcePdfVerified: ${pdfVerification ? "yes" : "not requested"}`);
  console.log(`- sections: ${manifest.sections.length}`);
  console.log(`- programs: ${manifest.actual.programRows}`);
  console.log(`- recruitment totals: general=${manifest.actual.generalTotal}, bachelor=${manifest.actual.bachelorTotal}, nursingNight=${manifest.actual.nursingNightTotal}`);
  console.log(`- selectionRules: ${manifest.actual.selectionRuleRows}`);
  console.log(`- scheduleEvents: ${manifest.actual.scheduleRows}`);
  console.log(`- knowledge units: ${units.length}`);
  console.log(`  - sections: ${units.filter((unit) => unit.unitType === "section").length}`);
  console.log(`  - selection rules: ${units.filter((unit) => unit.unitType === "selection_rule").length}`);
  console.log(`  - schedules: ${units.filter((unit) => unit.unitType === "schedule").length}`);
  console.log(`  - programs: ${units.filter((unit) => unit.unitType === "program").length}`);

  if (!commit) {
    console.log("\nDRY RUN: DB와 임베딩 API를 호출하지 않았습니다. --commit으로 실제 적재합니다.");
    return;
  }

  const embeddingResult = await createEmbeddings(unitTexts);
  const result = await syncManifest(manifest, units, embeddingResult);
  console.log("\nTransfer manifest ingestion complete");
  console.log(`- documentId: ${result.documentId}`);
  console.log(`- embeddingModel: ${embeddingResult.model}`);
  console.log(`- knowledgeUnits: ${result.units}`);
  console.log(`- staleUnitsRemoved: ${result.staleUnits}`);
  console.log(`- supersededDocuments: ${result.supersededDocuments}`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error) => {
    console.error("Transfer manifest ingestion failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
