#!/usr/bin/env node

import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { buildTransferKnowledgeUnits, parseManifest } from "./ingest-transfer-manifest.mjs";

const OPENAI_API_BASE = "https://api.openai.com/v1";
const EMBEDDING_DIMENSIONS = 1536;
const CURRENT_ADMISSION_YEAR = 2026;

const QUERY_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    domain: { type: "string", enum: ["admission_guide", "other"] },
    operation: { type: "string", enum: ["lookup", "list", "count", "compare", "explain", "other"] },
    factKind: {
      type: "string",
      enum: [
        "recruitment_quota",
        "actual_outcome",
        "competition_rate",
        "cutoff",
        "selection",
        "schedule",
        "eligibility",
        "documents",
        "fees",
        "general",
      ],
    },
    universities: { type: "array", items: { type: "string" } },
    admissionYear: { type: ["integer", "null"] },
    yearReference: { type: "string", enum: ["explicit", "previous", "current", "unspecified"] },
    unitTypes: {
      type: "array",
      items: { type: "string", enum: ["section", "selection_rule", "schedule", "program"] },
    },
    transferType: { type: ["string", "null"] },
    major: { type: ["string", "null"] },
    college: { type: ["string", "null"] },
    category: { type: "string", enum: ["natural", "humanities", "unspecified"] },
    subjectMode: { type: "string", enum: ["math_only", "english_only", "both", "none"] },
    minDocumentWeight: { type: ["number", "null"] },
    maxInterviewWeight: { type: ["number", "null"] },
    scheduleKeyword: { type: ["string", "null"] },
    semanticQuery: { type: "string" },
  },
  required: [
    "domain",
    "operation",
    "factKind",
    "universities",
    "admissionYear",
    "yearReference",
    "unitTypes",
    "transferType",
    "major",
    "college",
    "category",
    "subjectMode",
    "minDocumentWeight",
    "maxInterviewWeight",
    "scheduleKeyword",
    "semanticQuery",
  ],
};

function requireApiKey() {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) throw new Error("OPENAI_API_KEY가 필요합니다.");
  return key;
}

function chatModel() {
  return String(process.env.OPENAI_CHAT_MODEL || "gpt-5.6-luna").trim();
}

function embeddingModel() {
  return String(process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small").trim();
}

function isReasoningModel(model) {
  const normalized = model.toLowerCase();
  return normalized.startsWith("gpt-5") || /^(o1|o3|o4)(-|$)/.test(normalized);
}

function minimalEffortForModel(model) {
  const normalized = model.toLowerCase();
  return /^gpt-5(\.[12])?(-|$)/.test(normalized) || /^o[134](-|$)/.test(normalized)
    ? "minimal"
    : "none";
}

function parseResponseText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  return (payload?.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => (typeof content?.text === "string" ? content.text.trim() : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function responseBody(input, maxOutputTokens) {
  const model = chatModel();
  return {
    model,
    input,
    max_output_tokens: maxOutputTokens,
    store: false,
    ...(isReasoningModel(model)
      ? { reasoning: { effort: minimalEffortForModel(model) } }
      : { temperature: 0 }),
  };
}

async function requestPlan(question) {
  const startedAt = performance.now();
  const body = responseBody(
    [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: [
              "너는 대한민국 대학 편입 모집요강 질의를 DB 검색 계획으로 바꾸는 플래너다.",
              `현재 기준 학년도는 ${CURRENT_ADMISSION_YEAR}학년도다.`,
              "답을 만들지 말고 검색 계획만 반환한다.",
              "질문에 직접 나온 대학만 universities에 넣고 대학을 추측하지 않는다.",
              "작년·지난해·전년도는 yearReference=previous, 명시 연도는 explicit으로 둔다.",
              "'모집인원/몇 명 모집/몇 명 뽑아'는 recruitment_quota지만 '실제 합격/실제로 등록'은 actual_outcome이다.",
              "정확한 값·목록·조건 검색은 program/selection_rule/schedule을 사용한다.",
              "자연계·이과는 category=natural, 인문계·문과는 category=humanities로 둔다.",
              "자격·제출서류·설명형 질문은 section을 포함한다.",
              "수학만은 math_only, 영어만은 english_only, 영어와 수학 모두는 both다.",
              "면접 없음은 maxInterviewWeight=0으로 표현한다.",
              "서류 반영비율 N% 이상은 minDocumentWeight=N으로 표현한다.",
              "semanticQuery는 검색에 충분하도록 질문을 짧고 명확하게 정규화한다.",
            ].join(" "),
          },
        ],
      },
      { role: "user", content: [{ type: "input_text", text: question }] },
    ],
    800
  );
  body.text = {
    format: {
      type: "json_schema",
      name: "transfer_query_plan",
      strict: true,
      schema: QUERY_PLAN_SCHEMA,
    },
  };

  const response = await fetch(`${OPENAI_API_BASE}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${requireApiKey()}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || `Planner HTTP ${response.status}`);
  const text = parseResponseText(payload);
  if (!text) throw new Error(`Planner 응답 파싱 실패: ${payload?.status || "unknown"}`);
  return { plan: JSON.parse(text), latencyMs: performance.now() - startedAt };
}

async function requestEmbeddings(inputs) {
  if (!inputs.length) return { vectors: [], latencyMs: 0 };
  const model = embeddingModel();
  const startedAt = performance.now();
  const response = await fetch(`${OPENAI_API_BASE}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${requireApiKey()}` },
    body: JSON.stringify({
      model,
      input: inputs,
      ...(model.startsWith("text-embedding-3") ? { dimensions: EMBEDDING_DIMENSIONS } : {}),
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || `Embedding HTTP ${response.status}`);
  const vectors = Array.isArray(payload?.data) ? payload.data.map((row) => row.embedding ?? []) : [];
  if (vectors.length !== inputs.length || vectors.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)) {
    throw new Error(`임베딩 응답 불일치: inputs=${inputs.length}, vectors=${vectors.length}`);
  }
  return { vectors, latencyMs: performance.now() - startedAt };
}

function cosineSimilarity(left, right) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  return leftNorm && rightNorm ? dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) : 0;
}

function normalizedUniversity(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/대학교$/, "대")
    .toLowerCase();
}

function explicitUniversities(question) {
  const matches = question.matchAll(/([가-힣]{2,12}대학교|[가-힣]{2,8}대)(?=가|와|과|는|은|를|을|에서|의|\s|$)/g);
  return [...new Set([...matches].map((match) => match[1]))];
}

function requestedYear(question, plan) {
  const explicit = question.match(/(20\d{2})\s*학년도?/);
  if (explicit) return Number(explicit[1]);
  if (/(작년|지난해|전년도)/.test(question) || plan.yearReference === "previous") {
    return CURRENT_ADMISSION_YEAR - 1;
  }
  if (plan.admissionYear) return plan.admissionYear;
  return null;
}

function majorNeedle(question, plannedMajor) {
  if (/컴소/.test(question)) return "컴퓨터소프트웨어학부";
  return String(plannedMajor || "").replace(/\s+/g, "");
}

function containsMajor(unit, needle) {
  if (!needle) return true;
  const major = String(unit.major || "").replace(/\s+/g, "");
  return major.includes(needle) || needle.includes(major);
}

function pagesLabel(pages) {
  return [...new Set(pages)].sort((a, b) => a - b).join(", ");
}

function scopeDocuments(question, plan, documents) {
  const requested = [...new Set([...plan.universities, ...explicitUniversities(question)])];
  const unresolved = requested.filter(
    (name) => !documents.some((document) => normalizedUniversity(document.university) === normalizedUniversity(name))
  );
  if (unresolved.length) {
    return {
      refusal: `현재 검증된 모집요강 DB에는 ${unresolved.join(", ")} 자료가 없어 답변할 수 없습니다.`,
      reason: "missing_university",
    };
  }

  const year = requestedYear(question, plan);
  let scoped = requested.length
    ? documents.filter((document) => requested.some(
      (name) => normalizedUniversity(document.university) === normalizedUniversity(name)
    ))
    : [...documents];
  if (year !== null) scoped = scoped.filter((document) => document.admissionYear === year);
  if (!scoped.length) {
    const label = year ? `${year}학년도` : "요청한 범위의";
    return {
      refusal: `현재 검증된 모집요강 DB에는 ${label} 자료가 없어 답변할 수 없습니다.`,
      reason: "missing_year",
    };
  }

  if (year === null) {
    const latestByUniversity = new Map();
    for (const document of scoped) {
      const key = normalizedUniversity(document.university);
      if (!latestByUniversity.has(key) || latestByUniversity.get(key).admissionYear < document.admissionYear) {
        latestByUniversity.set(key, document);
      }
    }
    scoped = [...latestByUniversity.values()];
  }
  return { documents: scoped, year };
}

function unsupportedFact(plan) {
  return ["actual_outcome", "competition_rate", "cutoff"].includes(plan.factKind);
}

function subjectMatches(unit, mode) {
  const subjects = [...(unit.writtenSubjects ?? [])].sort();
  if (mode === "math_only") return subjects.length === 1 && subjects[0] === "수학";
  if (mode === "english_only") return subjects.length === 1 && subjects[0] === "영어";
  if (mode === "both") return subjects.includes("수학") && subjects.includes("영어");
  return true;
}

function transferMatches(unit, transferType) {
  if (!transferType) return true;
  return (unit.transferTypes ?? []).some(
    (value) => value.includes(transferType) || transferType.includes(value)
  );
}

function structuredLookup(question, plan, scopedUnits) {
  if (plan.factKind === "recruitment_quota") {
    const needle = majorNeedle(question, plan.major);
    const rows = scopedUnits.filter((unit) =>
      unit.unitType === "program"
      && containsMajor(unit, needle)
      && (plan.category === "unspecified"
        || (plan.category === "natural" ? unit.category === "자연" : unit.category === "인문"))
    );
    if (!rows.length) return null;
    const countKey = plan.transferType?.includes("학사")
      ? "bachelorCount"
      : plan.transferType?.includes("간호")
        ? "nursingNightCount"
        : "generalCount";
    const typeLabel = countKey === "bachelorCount" ? "학사편입" : countKey === "nursingNightCount" ? "간호학과(야)" : "일반편입";
    const answer = rows.map((row) =>
      `${row.admissionYear}학년도 ${row.university} ${row.campus}캠퍼스 ${row.major}의 ${typeLabel} 모집인원은 ${row[countKey] ?? 0}명입니다. (PDF ${pagesLabel(row.sourcePages)}페이지)`
    ).join("\n");
    return { answer, rows, route: "structured" };
  }

  if (plan.factKind === "selection") {
    let rows = scopedUnits.filter((unit) => unit.unitType === "selection_rule");
    rows = rows.filter((unit) => subjectMatches(unit, plan.subjectMode));
    rows = rows.filter((unit) => transferMatches(unit, plan.transferType));
    if (plan.minDocumentWeight !== null) {
      rows = rows.filter((unit) => Number(unit.finalDocumentWeight ?? -1) >= plan.minDocumentWeight);
    }
    if (plan.maxInterviewWeight !== null) {
      rows = rows.filter((unit) => Number(unit.finalInterviewWeight ?? Infinity) <= plan.maxInterviewWeight);
    }
    if (!rows.length) {
      return {
        answer: "현재 검증된 모집요강 범위에서 조건과 일치하는 학교·전형을 찾지 못했습니다.",
        rows,
        route: "structured",
      };
    }
    const answer = rows.map((row) => {
      const subjects = row.writtenSubjects.length ? row.writtenSubjects.join("·") : "없음";
      return `${row.admissionYear}학년도 ${row.university} ${row.campus}캠퍼스 ${row.scopeValue}: 필기과목 ${subjects}, 최종 필기 ${row.finalWrittenWeight ?? 0}%·서류 ${row.finalDocumentWeight ?? 0}%·면접 ${row.finalInterviewWeight ?? 0}% (PDF ${pagesLabel(row.sourcePages)}페이지)`;
    }).join("\n");
    return { answer, rows, route: "structured" };
  }

  if (plan.factKind === "schedule") {
    const rows = scopedUnits.filter((unit) => unit.unitType === "schedule");
    const keywords = String(plan.scheduleKeyword || question)
      .split(/[^가-힣A-Za-z0-9]+/)
      .filter((token) => token.length >= 2);
    const ranked = rows
      .map((row) => ({ row, score: keywords.filter((keyword) => row.eventLabel.includes(keyword)).length }))
      .sort((left, right) => right.score - left.score);
    const selected = ranked[0]?.score > 0 ? [ranked[0].row] : [];
    if (!selected.length) return null;
    const answer = selected.map((row) =>
      `${row.admissionYear}학년도 ${row.university} ${row.eventLabel} 일정은 ${row.metadata.displayText}입니다. (PDF ${pagesLabel(row.sourcePages)}페이지)`
    ).join("\n");
    return { answer, rows: selected, route: "structured" };
  }
  return null;
}

async function generateGroundedAnswer(question, contexts) {
  const evidence = contexts
    .map(({ unit, score }, index) => `근거 ${index + 1} (유사도 ${score.toFixed(3)}):\n${unit.content}`)
    .join("\n\n");
  const body = responseBody(
    [
      {
        role: "system",
        content: [{
          type: "input_text",
          text: "너는 편입 모집요강 답변기다. 제공된 검증 근거에 있는 사실만 사용한다. 근거에 없는 내용은 추측하지 않는다. 학교·학년도와 PDF 페이지를 밝히고 간결한 한국어로 답한다.",
        }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: `질문:\n${question}\n\n검증 근거:\n${evidence}` }],
      },
    ],
    700
  );
  const startedAt = performance.now();
  const response = await fetch(`${OPENAI_API_BASE}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${requireApiKey()}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || `Answer HTTP ${response.status}`);
  const answer = parseResponseText(payload);
  if (!answer) throw new Error("답변 생성 결과가 비어 있습니다.");
  return { answer, latencyMs: performance.now() - startedAt };
}

function offlinePlan(question) {
  const yearMatch = question.match(/(20\d{2})\s*학년도?/);
  const previous = /(작년|지난해|전년도)/.test(question);
  const plan = {
    domain: "admission_guide",
    operation: "explain",
    factKind: "general",
    universities: explicitUniversities(question),
    admissionYear: yearMatch ? Number(yearMatch[1]) : null,
    yearReference: yearMatch ? "explicit" : previous ? "previous" : "unspecified",
    unitTypes: ["section"],
    transferType: question.includes("일반편입") ? "일반편입" : question.includes("학사편입") ? "학사편입" : null,
    major: /컴퓨터소프트웨어학부|컴소/.test(question) ? "컴퓨터소프트웨어학부" : null,
    college: null,
    category: /자연계|이과/.test(question) ? "natural" : /인문계|문과/.test(question) ? "humanities" : "unspecified",
    subjectMode: "none",
    minDocumentWeight: null,
    maxInterviewWeight: null,
    scheduleKeyword: null,
    semanticQuery: question,
  };

  if (/실제로|실제\s*(합격|등록)|등록자/.test(question)) {
    plan.operation = "lookup";
    plan.factKind = "actual_outcome";
    plan.unitTypes = ["program"];
  } else if (/몇\s*명|모집인원|티오/.test(question)) {
    plan.operation = /학과별|대학별|티오/.test(question) ? "list" : "lookup";
    plan.factKind = "recruitment_quota";
    plan.unitTypes = ["program"];
  } else if (/수학만|영어만|영어.*수학|수학.*영어|서류\s*반영|면접\s*(없|없는)/.test(question)) {
    plan.operation = "list";
    plan.factKind = "selection";
    plan.unitTypes = ["selection_rule"];
    if (question.includes("수학만")) plan.subjectMode = "math_only";
    if (question.includes("영어만")) plan.subjectMode = "english_only";
    if (/영어.*수학|수학.*영어/.test(question)) plan.subjectMode = "both";
    const documentWeight = question.match(/서류\s*반영비율(?:이|은)?\s*(\d+(?:\.\d+)?)%?\s*이상/);
    if (documentWeight) plan.minDocumentWeight = Number(documentWeight[1]);
    if (/면접\s*(없|없는)/.test(question)) plan.maxInterviewWeight = 0;
  } else if (/일정|언제|발표/.test(question)) {
    plan.operation = "lookup";
    plan.factKind = "schedule";
    plan.unitTypes = ["schedule"];
    plan.scheduleKeyword = question.includes("최종") ? "최종 합격자 발표" : question;
  } else if (/지원\s*자격|지원자격/.test(question)) {
    plan.factKind = "eligibility";
    plan.unitTypes = ["section"];
    plan.semanticQuery = question.includes("일반편입") ? "일반편입학 지원자격" : "편입학 지원자격";
  } else if (/비교/.test(question)) {
    plan.operation = "compare";
    plan.unitTypes = ["section", "selection_rule"];
  }
  return plan;
}

async function executeQuestion(question, documents, units, vectors, offline = false) {
  const totalStartedAt = performance.now();
  const plannerStartedAt = performance.now();
  const planner = offline
    ? { plan: offlinePlan(question), latencyMs: performance.now() - plannerStartedAt }
    : await requestPlan(question);
  const scoped = scopeDocuments(question, planner.plan, documents);
  if (scoped.refusal) {
    return {
      status: "refused",
      reason: scoped.reason,
      answer: scoped.refusal,
      plan: planner.plan,
      rows: [],
      embeddingUsed: false,
      timings: { plannerMs: planner.latencyMs, dbMs: 0, embeddingMs: 0, answerMs: 0, totalMs: performance.now() - totalStartedAt },
    };
  }
  if (unsupportedFact(planner.plan)) {
    return {
      status: "refused",
      reason: "unsupported_fact",
      answer: "현재 모집요강 DB에는 모집정원만 있고 실제 합격자 수·등록자 수·경쟁률·합격선 자료는 없어 답변할 수 없습니다.",
      plan: planner.plan,
      rows: [],
      embeddingUsed: false,
      timings: { plannerMs: planner.latencyMs, dbMs: 0, embeddingMs: 0, answerMs: 0, totalMs: performance.now() - totalStartedAt },
    };
  }

  const documentKeys = new Set(scoped.documents.map((document) => `${document.university}|${document.admissionYear}`));
  const dbStartedAt = performance.now();
  const scopedEntries = units
    .map((unit, index) => ({ unit, vector: vectors[index] }))
    .filter(({ unit }) => documentKeys.has(`${unit.university}|${unit.admissionYear}`));
  const scopedUnits = scopedEntries.map(({ unit }) => unit);
  const structured = structuredLookup(question, planner.plan, scopedUnits);
  const dbMs = performance.now() - dbStartedAt;
  if (structured) {
    return {
      status: "answered",
      reason: null,
      ...structured,
      plan: planner.plan,
      embeddingUsed: false,
      timings: { plannerMs: planner.latencyMs, dbMs, embeddingMs: 0, answerMs: 0, totalMs: performance.now() - totalStartedAt },
    };
  }

  const desiredTypes = planner.plan.unitTypes.length ? new Set(planner.plan.unitTypes) : null;
  let candidates = scopedEntries
    .filter(({ unit }) => !desiredTypes || desiredTypes.has(unit.unitType));
  if (!candidates.length) candidates = scopedEntries;
  if (offline) {
    const keywords = (planner.plan.semanticQuery || question)
      .split(/[^가-힣A-Za-z0-9]+/)
      .filter((token) => token.length >= 2);
    const ranked = candidates
      .map(({ unit }) => ({
        unit,
        score: keywords.reduce((sum, keyword) => sum + (unit.content.includes(keyword) ? 1 : 0), 0),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);
    const best = ranked[0];
    return {
      status: "answered",
      reason: null,
      answer: best?.unit.content || "검증 근거를 찾지 못했습니다.",
      rows: ranked.map(({ unit, score }) => ({ unitType: unit.unitType, sourcePages: unit.sourcePages, score })),
      route: "semantic",
      plan: planner.plan,
      embeddingUsed: false,
      timings: {
        plannerMs: planner.latencyMs,
        dbMs,
        embeddingMs: 0,
        answerMs: 0,
        totalMs: performance.now() - totalStartedAt,
      },
    };
  }
  const queryEmbedding = await requestEmbeddings([planner.plan.semanticQuery || question]);
  const ranked = candidates
    .map(({ unit, vector }) => ({ unit, score: cosineSimilarity(queryEmbedding.vectors[0], vector) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
  const generated = await generateGroundedAnswer(question, ranked);
  return {
    status: "answered",
    reason: null,
    answer: generated.answer,
    rows: ranked.map(({ unit, score }) => ({ unitType: unit.unitType, sourcePages: unit.sourcePages, score })),
    route: "semantic",
    plan: planner.plan,
    embeddingUsed: true,
    timings: {
      plannerMs: planner.latencyMs,
      dbMs,
      embeddingMs: queryEmbedding.latencyMs,
      answerMs: generated.latencyMs,
      totalMs: performance.now() - totalStartedAt,
    },
  };
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

async function main() {
  const manifestPath = path.resolve(
    process.cwd(),
    process.argv.find((arg) => arg.endsWith(".json")) || "../docs/knowledge-extractions/2026-hanyang-transfer.verified.json"
  );
  const manifest = parseManifest(await readFile(manifestPath, "utf8"), manifestPath);
  const units = buildTransferKnowledgeUnits(manifest);
  const documents = [manifest.document];
  const offline = process.argv.includes("--offline");
  const setup = offline
    ? { vectors: units.map(() => null), latencyMs: 0 }
    : await requestEmbeddings(units.map((unit) => unit.content));
  console.log(`\n[setup] mode=${offline ? "offline-table" : "live-api"}, documents=${documents.length}, units=${units.length}, corpus_embedding=${setup.latencyMs.toFixed(0)}ms`);

  const cases = [
    {
      id: "quota",
      question: "2026학년도 한양대 컴퓨터소프트웨어학부 일반편입 몇 명 뽑아?",
      check: (result) => result.status === "answered" && result.answer.includes("28명") && result.answer.includes("PDF 5페이지"),
    },
    {
      id: "previous-year-gate",
      question: "작년에 한양대 컴소 몇 명 뽑았어?",
      check: (result) => result.status === "refused" && result.reason === "missing_year" && !result.embeddingUsed,
    },
    {
      id: "natural-program-list",
      question: "2026학년도 대학별 자연계 학과 티오 알려줘",
      check: (result) => result.status === "answered" && result.rows.length === 25 && result.rows.every((row) => row.category === "자연"),
    },
    {
      id: "unknown-school-gate",
      question: "건국대학교가 수학만 보는지 알려줘",
      check: (result) => result.status === "refused" && result.reason === "missing_university" && !result.embeddingUsed,
    },
    {
      id: "math-only-list",
      question: "2026학년도 수학만 보는 학교 나열해줘",
      check: (result) => result.status === "answered" && result.answer.includes("한양대학교") && result.answer.includes("자연계열") && result.answer.includes("PDF 9페이지"),
    },
    {
      id: "document-weight-filter",
      question: "2026학년도 서류 반영비율이 30% 이상인 학교와 전형을 알려줘",
      check: (result) => result.status === "answered" && result.rows.length === 4 && result.rows.every((row) => row.finalDocumentWeight >= 30),
    },
    {
      id: "no-interview-filter",
      question: "2026학년도 면접 없는 학교와 전형을 알려줘",
      check: (result) => result.status === "answered" && result.rows.length === 4 && result.rows.every((row) => row.finalInterviewWeight === 0),
    },
    {
      id: "schedule",
      question: "한양대 최종 합격자 발표는 언제야?",
      check: (result) => result.status === "answered" && result.answer.includes("2026. 2. 4") && result.answer.includes("PDF 4페이지"),
    },
    {
      id: "semantic-eligibility",
      question: "한양대 일반편입 지원자격을 설명해줘",
      check: (result) => result.status === "answered" && result.route === "semantic" && result.answer.includes("한양대학교") && result.answer.includes("PDF"),
    },
    {
      id: "additional-admission-1",
      question: "한양대 1차 추가합격자 발표는 언제야?",
      check: (result) => result.status === "answered" && result.answer.includes("2026. 2. 9") && result.answer.includes("PDF 4페이지"),
    },
    {
      id: "unsupported-actual-outcome",
      question: "한양대 컴퓨터소프트웨어학부에 실제로 몇 명 합격했어?",
      check: (result) => result.status === "refused" && result.reason === "unsupported_fact" && !result.embeddingUsed,
    },
    {
      id: "partial-comparison-gate",
      question: "한양대와 건국대 편입 전형을 비교해줘",
      check: (result) => result.status === "refused" && result.reason === "missing_university" && !result.embeddingUsed,
    },
  ];

  const results = [];
  for (const caseItem of cases) {
    const result = await executeQuestion(caseItem.question, documents, units, setup.vectors, offline);
    const pass = caseItem.check(result);
    results.push({ ...caseItem, result, pass });
    console.log(`\n[${pass ? "PASS" : "FAIL"}] ${caseItem.id} (${result.route || result.reason}, ${result.timings.totalMs.toFixed(0)}ms)`);
    console.log(`Q: ${caseItem.question}`);
    console.log(`A: ${result.answer}`);
    console.log(`plan: ${JSON.stringify(result.plan)}`);
  }

  const passed = results.filter((result) => result.pass).length;
  const totals = results.map((result) => result.result.timings.totalMs);
  const planners = results.map((result) => result.result.timings.plannerMs);
  const semantic = results.filter((result) => result.result.route === "semantic");
  const guardCases = results.filter((result) => result.result.status === "refused");
  console.log("\n=== FINAL ARCHITECTURE EVAL ===");
  console.log(`accuracy: ${passed}/${results.length} (${(passed / results.length * 100).toFixed(1)}%)`);
  console.log(`planner latency: avg ${average(planners).toFixed(0)}ms / p95 ${percentile(planners, 0.95).toFixed(0)}ms`);
  console.log(`end-to-end latency: avg ${average(totals).toFixed(0)}ms / p95 ${percentile(totals, 0.95).toFixed(0)}ms`);
  console.log(`semantic cases: ${semantic.length}, guard cases without embedding: ${guardCases.filter((result) => !result.result.embeddingUsed).length}/${guardCases.length}`);
  console.log(offline
    ? "models: offline deterministic planner + local text ranking (API network unavailable)"
    : `models: planner=${chatModel()}, embedding=${embeddingModel()}`);

  if (passed !== results.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
