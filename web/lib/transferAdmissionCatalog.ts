import type { SupabaseClient } from "@supabase/supabase-js";
import { basicPlanNotice, missingAdmissionEvidence, noAdmissionDocument } from "@/lib/transferDocumentPolicy";
import {
  createEmbedding,
  generateGroundedAnswer,
  generateStructuredJson,
} from "@/lib/aiRag";

type UnitType = "section" | "selection_rule" | "schedule" | "program";
type FactKind =
  | "recruitment_quota"
  | "actual_outcome"
  | "competition_rate"
  | "cutoff"
  | "selection"
  | "schedule"
  | "eligibility"
  | "documents"
  | "fees"
  | "general";

type TransferQueryPlan = {
  domain: "admission_guide" | "other";
  operation: "lookup" | "list" | "count" | "compare" | "explain" | "other";
  factKind: FactKind;
  universities: string[];
  admissionYear: number | null;
  yearReference: "explicit" | "previous" | "current" | "unspecified";
  unitTypes: UnitType[];
  transferType: string | null;
  major: string | null;
  college: string | null;
  category: "natural" | "humanities" | "unspecified";
  subjectMode: "math_only" | "english_only" | "both" | "none";
  minDocumentWeight: number | null;
  maxInterviewWeight: number | null;
  scheduleKeyword: string | null;
  semanticQuery: string;
};

export type TransferCatalogAnswer = {
  answer: string;
  admissionYear: number | null;
  coverageCount: number;
  matchedRuleCount: number;
  grounded: boolean;
};

type SourceDocumentRow = {
  id: string;
  university: string;
  campus: string;
  admission_year: number;
  document_type: string;
  title: string;
  source_url: string | null;
  verified_at: string | null;
  metadata: Record<string, unknown> | null;
};

type KnowledgeUnitRow = {
  id: string;
  document_id: string;
  unit_key: string;
  unit_type: UnitType;
  university: string;
  campus: string;
  admission_year: number;
  college: string | null;
  category: string | null;
  major: string | null;
  scope_type: string | null;
  scope_value: string | null;
  transfer_types: string[] | null;
  written_subjects: string[] | null;
  general_count: number | null;
  bachelor_count: number | null;
  nursing_night_count: number | null;
  exam_minutes: number | null;
  question_count: number | null;
  exam_format: string | null;
  stage1_written_weight: number | null;
  final_written_weight: number | null;
  final_document_weight: number | null;
  final_interview_weight: number | null;
  final_practical_weight: number | null;
  stage1_selection_min_multiple: number | null;
  stage1_selection_max_multiple: number | null;
  english_toeic_min: number | null;
  english_teps_min: number | null;
  english_toefl_ibt_min: number | null;
  english_score_valid_from: string | null;
  english_score_valid_through: string | null;
  event_label: string | null;
  event_audience: string | null;
  starts_on: string | null;
  ends_on: string | null;
  starts_at: string | null;
  ends_at: string | null;
  content: string;
  source_pages: number[] | null;
  metadata: Record<string, unknown> | null;
  similarity?: number;
};

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
} as const;

const UNIT_SELECT = [
  "id,document_id,unit_key,unit_type,university,campus,admission_year",
  "college,category,major,scope_type,scope_value,transfer_types,written_subjects",
  "general_count,bachelor_count,nursing_night_count,exam_minutes,question_count,exam_format",
  "stage1_written_weight,final_written_weight,final_document_weight,final_interview_weight,final_practical_weight",
  "stage1_selection_min_multiple,stage1_selection_max_multiple",
  "english_toeic_min,english_teps_min,english_toefl_ibt_min,english_score_valid_from,english_score_valid_through",
  "event_label,event_audience,starts_on,ends_on,starts_at,ends_at,content,source_pages,metadata",
].join(",");

const DOCUMENT_TYPE_PRIORITY: Record<string, number> = {
  "최종 모집요강": 100,
  모집요강: 90,
  "전형 기본계획": 60,
  "모집 주요사항(안)": 50,
};

function isMissingCatalogError(message: string): boolean {
  return /does not exist|schema cache|could not find the table|could not find the function|relation .* does not exist/i.test(message);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeUniversity(value: string): string {
  const normalized = value.toLowerCase().replace(/\s+/g, "").replace(/대학교$/, "대");
  return ({ 연대: "연세대", 경상대: "경상국립대" } as Record<string, string>)[normalized] ?? normalized;
}

function explicitUniversities(question: string): string[] {
  const matches = question.matchAll(/([가-힣]{2,12}대학교|[가-힣]{2,8}대)(?=가|와|과|는|은|를|을|에서|의|\s|[?!.,]|$)/g);
  return uniqueStrings([...matches].map((match) => match[1]));
}

function explicitAdmissionYear(question: string): number | null {
  const match = question.match(/\b(20\d{2})\s*(?:학년도|년도|년)?/);
  return match?.[1] ? Number(match[1]) : null;
}

function selectAuthoritativeDocuments(documents: SourceDocumentRow[]): SourceDocumentRow[] {
  const selected = new Map<string, SourceDocumentRow>();
  for (const document of documents) {
    const key = `${document.university}|${document.campus}|${document.admission_year}`;
    const existing = selected.get(key);
    if (!existing) {
      selected.set(key, document);
      continue;
    }
    const priority = DOCUMENT_TYPE_PRIORITY[document.document_type] ?? 0;
    const existingPriority = DOCUMENT_TYPE_PRIORITY[existing.document_type] ?? 0;
    if (
      priority > existingPriority
      || (priority === existingPriority
        && Date.parse(document.verified_at || "") > Date.parse(existing.verified_at || ""))
    ) {
      selected.set(key, document);
    }
  }
  return [...selected.values()];
}

function latestDocumentPerSchool(documents: SourceDocumentRow[]): SourceDocumentRow[] {
  const latest = new Map<string, SourceDocumentRow>();
  for (const document of documents) {
    const key = `${document.university}|${document.campus}`;
    const previous = latest.get(key);
    if (!previous || previous.admission_year < document.admission_year) latest.set(key, document);
  }
  return [...latest.values()];
}

function distinctSchoolCount(documents: SourceDocumentRow[]): number {
  return new Set(documents.map((row) => `${row.university}|${row.campus}`)).size;
}

function factAvailability(document: SourceDocumentRow, fact: string): string | null {
  const availability = document.metadata?.factAvailability;
  if (!availability || typeof availability !== "object" || Array.isArray(availability)) return null;
  const value = (availability as Record<string, unknown>)[fact];
  return typeof value === "string" ? value : null;
}

function finalGuideExpectation(documents: SourceDocumentRow[]): string {
  const expected = documents
    .map((document) => document.metadata?.finalGuideExpected)
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  return expected ? ` 기본계획에 기재된 최종 모집요강 발표 예정 시기는 ${expected}입니다. 최종 모집요강을 확인해야 합니다.` : " 최종 모집요강을 확인해야 합니다.";
}

function documentBasisLabel(documents: SourceDocumentRow[]): string {
  const types = uniqueStrings(documents.map((document) => document.document_type));
  if (types.length === 1 && types[0] === "전형 기본계획") return "기본계획(안)";
  if (types.length === 1 && types[0]) return types[0];
  return "활성화된 검증 문서";
}

function schoolCampusLabel(university: string, campus: string): string {
  if (!campus || campus === "전체") return university;
  return `${university} ${campus}캠퍼스`;
}

function pagesLabel(pages: number[] | null): string {
  return uniqueStrings((pages ?? []).map(String)).join(", ");
}

function formatPercent(value: number | null): string {
  if (value === null) return "-";
  return `${Number.isInteger(value) ? value.toFixed(0) : value}%`;
}

function categoryMatches(rowCategory: string | null, category: TransferQueryPlan["category"]): boolean {
  if (category === "unspecified") return true;
  return category === "natural" ? rowCategory === "자연" : rowCategory === "인문";
}

function textMatches(value: string | null, needle: string | null): boolean {
  if (!needle) return true;
  const left = (value || "").replace(/\s+/g, "").toLowerCase();
  const right = needle.replace(/\s+/g, "").toLowerCase();
  return left.includes(right) || right.includes(left);
}

function subjectMatches(subjects: string[] | null, mode: TransferQueryPlan["subjectMode"]): boolean {
  if (mode === "none") return true;
  const normalized = uniqueStrings((subjects ?? []).map((subject) => {
    const compact = subject.replace(/\s+/g, "");
    if (compact.startsWith("수학")) return "수학";
    if (compact.startsWith("영어")) return "영어";
    return compact;
  })).sort();
  if (mode === "math_only") return normalized.length === 1 && normalized[0] === "수학";
  if (mode === "english_only") return normalized.length === 1 && normalized[0] === "영어";
  return normalized.includes("영어") && normalized.includes("수학");
}

function selectionScopeMatches(row: KnowledgeUnitRow, plan: TransferQueryPlan): boolean {
  if (!plan.major && !plan.college) return true;
  const haystack = [
    row.scope_value || "",
    row.content,
    JSON.stringify(row.metadata ?? {}),
  ].join(" ");
  return textMatches(haystack, plan.major) && textMatches(haystack, plan.college);
}

function transferTypeMatches(types: string[] | null, requested: string | null): boolean {
  if (!requested) return true;
  return (types ?? []).some((value) => value.includes(requested) || requested.includes(value));
}

function unsupportedFact(kind: FactKind): boolean {
  return kind === "actual_outcome" || kind === "competition_rate" || kind === "cutoff";
}

async function createPlan(question: string, currentAdmissionYear: number): Promise<TransferQueryPlan> {
  return generateStructuredJson<TransferQueryPlan>({
    schemaName: "transfer_query_plan",
    schema: QUERY_PLAN_SCHEMA as unknown as Record<string, unknown>,
    disableThinking: true,
    maxOutputTokens: 900,
    systemPrompt: [
      "너는 대한민국 대학 편입 모집요강 질문을 DB 검색 계획으로 변환한다.",
      `현재 운영 중인 최신 입시 학년도는 ${currentAdmissionYear}학년도다.`,
      "답을 만들지 말고 검색 계획만 반환한다.",
      "질문에 직접 나온 대학만 universities에 넣고 추측하지 않는다.",
      "공부법·공부시간·학습 우선순위·루틴 상담이나 학생이 자신의 베이스·진도만 설명한 메시지는 admission_guide가 아니라 other다.",
      "학사·인문·자연 같은 단어가 있어도 모집요강의 자격·인원·전형·일정 등을 묻지 않으면 other다.",
      "작년·지난해·전년도는 previous, 올해는 current, 명시 연도는 explicit이다.",
      "모집인원·몇 명 모집·티오는 recruitment_quota이고 실제 합격·등록 인원은 actual_outcome이다.",
      "자연계·이과는 category=natural, 인문계·문과는 humanities이다.",
      "학과별 티오처럼 행 목록을 원하는 질문은 operation=list로 둔다.",
      "정확한 모집인원은 program, 시험과목·반영비율·1단계 배수는 selection_rule, 일정은 schedule이다.",
      "지원자격·제출서류·전형료·기타 설명은 section을 사용한다.",
      "수학만은 math_only, 영어만은 english_only, 영어와 수학 모두는 both다.",
      "면접 없음은 maxInterviewWeight=0, 서류 N% 이상은 minDocumentWeight=N이다.",
      "semanticQuery는 검색에 충분하도록 학교·학년도·핵심 사실을 포함해 정규화한다.",
    ].join(" "),
    userPrompt: question,
  });
}

function resolveScope(params: {
  question: string;
  plan: TransferQueryPlan;
  documents: SourceDocumentRow[];
  currentAdmissionYear: number;
}): { documents: SourceDocumentRow[]; year: number | null; missingUniversities: string[] } {
  const requestedUniversities = uniqueStrings([
    ...params.plan.universities,
    ...explicitUniversities(params.question),
  ]);
  const missingUniversities = requestedUniversities.filter(
    (requested) => !params.documents.some(
      (document) => normalizeUniversity(document.university) === normalizeUniversity(requested)
    )
  );
  if (missingUniversities.length) return {
    documents: [],
    year: explicitAdmissionYear(params.question) ?? params.plan.admissionYear
      ?? (params.plan.yearReference === "previous" ? params.currentAdmissionYear - 1 : params.currentAdmissionYear),
    missingUniversities,
  };

  let candidates = requestedUniversities.length
    ? params.documents.filter((document) => requestedUniversities.some(
      (requested) => normalizeUniversity(document.university) === normalizeUniversity(requested)
    ))
    : [...params.documents];

  const explicitYear = explicitAdmissionYear(params.question);
  let year = explicitYear ?? params.plan.admissionYear;
  if (/(작년|지난해|전년도)/.test(params.question) || params.plan.yearReference === "previous") {
    year = params.currentAdmissionYear - 1;
  } else if (params.plan.yearReference === "current") {
    year = params.currentAdmissionYear;
  } else if (year === null) {
    year = params.currentAdmissionYear;
  }

  candidates = year === null
    ? latestDocumentPerSchool(candidates)
    : candidates.filter((document) => document.admission_year === year);
  return { documents: candidates, year, missingUniversities: [] };
}

function coveragePrefix(documents: SourceDocumentRow[], year: number | null): string {
  const years = uniqueStrings(documents.map((document) => String(document.admission_year))).join("·");
  const yearLabel = year ? `${year}학년도` : `${years}학년도`;
  return `${yearLabel} 현재 적재·검증된 ${distinctSchoolCount(documents)}개교 ${documentBasisLabel(documents)} 기준`;
}

function formatQuotaAnswer(
  rows: KnowledgeUnitRow[],
  plan: TransferQueryPlan,
  documents: SourceDocumentRow[],
  year: number | null
): string {
  const prefix = coveragePrefix(documents, year);
  if (!rows.length && documents.some((document) => factAvailability(document, "recruitmentQuota") === "deferred")) {
    const schoolNames = uniqueStrings(documents.map((document) => document.university)).join("·");
    return `${schoolNames} ${year ?? documents[0]?.admission_year}학년도 기본계획에는 모집단위별 정확한 모집인원이 아직 공개되지 않았습니다.${finalGuideExpectation(documents)}`;
  }
  if (!rows.length) return `${prefix}으로 조건에 맞는 모집단위를 찾지 못했습니다.`;

  const sorted = [...rows].sort((a, b) =>
    a.university.localeCompare(b.university, "ko")
    || (a.college || "").localeCompare(b.college || "", "ko")
    || (a.major || "").localeCompare(b.major || "", "ko")
  );
  const lines = [`${prefix}입니다.`];
  let previousSchool = "";
  for (const row of sorted) {
    const school = schoolCampusLabel(row.university, row.campus);
    if (school !== previousSchool) {
      lines.push(`\n- ${school}`);
      previousSchool = school;
    }
    const counts = plan.transferType?.includes("학사")
      ? `학사편입 ${row.bachelor_count ?? 0}명`
      : plan.transferType?.includes("간호")
        ? `간호학과(야) ${row.nursing_night_count ?? 0}명`
        : plan.transferType?.includes("일반")
          ? `일반편입 ${row.general_count ?? 0}명`
          : `일반편입 ${row.general_count ?? 0}명·학사편입 ${row.bachelor_count ?? 0}명${row.nursing_night_count === null ? "" : `·간호학과(야) ${row.nursing_night_count}명`}`;
    lines.push(`  - ${row.major}: ${counts} (PDF ${pagesLabel(row.source_pages)}페이지)`);
  }
  lines.push("\n아직 DB에 적재되지 않은 학교·학년도는 결과에 포함되지 않습니다.");
  return lines.join("\n");
}

function formatSelectionAnswer(
  rows: KnowledgeUnitRow[],
  documents: SourceDocumentRow[],
  year: number | null
): string {
  const prefix = coveragePrefix(documents, year);
  if (!rows.length) return `${prefix}으로 조건에 맞는 학교·전형을 찾지 못했습니다.`;

  const lines = [`${prefix}입니다.`];
  const grouped = new Map<string, KnowledgeUnitRow[]>();
  for (const row of rows) {
    const key = `${row.university}|${row.campus}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  for (const group of [...grouped.values()]) {
    const document = group[0];
    lines.push(`\n- ${schoolCampusLabel(document.university, document.campus)}`);
    for (const row of group) {
      const subjects = row.written_subjects?.length ? row.written_subjects.join("·") : "없음";
      const multiple = row.stage1_selection_min_multiple && row.stage1_selection_max_multiple
        ? `, 1단계 ${row.stage1_selection_min_multiple}~${row.stage1_selection_max_multiple}배수`
        : "";
      const english = row.english_toeic_min === null
        ? ""
        : `, 공인영어 TOEIC ${row.english_toeic_min}·TEPS ${row.english_teps_min}·TOEFL(iBT) ${row.english_toefl_ibt_min}점 이상 중 하나`;
      const supplementalWeights = [
        ["전적대학", row.metadata?.finalPriorUniversityWeight],
        ["자격실적", row.metadata?.finalQualificationWeight],
        ["공인어학", row.metadata?.finalLanguageWeight],
        ["전공이수능력", row.metadata?.finalMajorCourseWeight],
      ]
        .filter((entry): entry is [string, number] => typeof entry[1] === "number")
        .map(([label, value]) => `${label} ${formatPercent(value)}`);
      const finalWeights = [
        row.final_written_weight === null ? null : `필기 ${formatPercent(row.final_written_weight)}`,
        row.final_document_weight === null ? null : `서류 ${formatPercent(row.final_document_weight)}`,
        ...supplementalWeights,
        row.final_interview_weight === null ? null : `면접 ${formatPercent(row.final_interview_weight)}`,
        row.final_practical_weight === null ? null : `실기 ${formatPercent(row.final_practical_weight)}`,
      ].filter((value): value is string => value !== null);
      lines.push(
        `  - ${row.scope_value}: 필기 ${subjects}, 최종 ${finalWeights.length ? finalWeights.join("·") : "세부 반영비율 미공개"}${multiple}${english} (PDF ${pagesLabel(row.source_pages)}페이지)`
      );
      if (typeof row.metadata?.notes === "string" && row.metadata.notes) lines.push(`    ${row.metadata.notes}`);
    }
  }
  lines.push("\n'수학만/영어만'은 필기시험 과목 기준이며 최종 서류·면접 반영은 별도로 표시했습니다.");
  lines.push("아직 DB에 적재되지 않은 학교·학년도는 결과에 포함되지 않습니다.");
  return lines.join("\n");
}

function formatScheduleAnswer(
  rows: KnowledgeUnitRow[],
  documents: SourceDocumentRow[],
  year: number | null
): string {
  const prefix = coveragePrefix(documents, year);
  if (!rows.length && documents.some((document) => factAvailability(document, "exactSchedule") === "deferred")) {
    const schoolNames = uniqueStrings(documents.map((document) => document.university)).join("·");
    return `${schoolNames} ${year ?? documents[0]?.admission_year}학년도 기본계획에는 정확한 전형 일정이 아직 공개되지 않았습니다.${finalGuideExpectation(documents)}`;
  }
  if (!rows.length) return `${prefix}으로 요청한 일정을 찾지 못했습니다.`;
  const lines = [`${prefix}입니다.`];
  for (const row of rows) {
    const displayText = typeof row.metadata?.displayText === "string"
      ? row.metadata.displayText
      : [row.starts_on, row.ends_on].filter(Boolean).join(" ~ ");
    lines.push(`- ${row.university} ${row.event_label}: ${displayText} (PDF ${pagesLabel(row.source_pages)}페이지)`);
  }
  if (documents.some((document) => factAvailability(document, "exactSchedule") === "deferred")) {
    lines.push(`정확한 날짜와 시간은 아직 공개되지 않았습니다.${finalGuideExpectation(documents)}`);
  }
  return lines.join("\n");
}

function scheduleKeywordScore(row: KnowledgeUnitRow, keyword: string): number {
  const tokens = keyword.split(/[^가-힣A-Za-z0-9]+/).filter((token) => token.length >= 2);
  return tokens.filter((token) => `${row.event_label || ""} ${row.content}`.includes(token)).length;
}

async function loadUnits(
  admin: SupabaseClient,
  documentIds: string[],
  unitType: UnitType
): Promise<{ rows: KnowledgeUnitRow[]; missingCatalog: boolean }> {
  const { data, error } = await admin
    .from("transfer_knowledge_units")
    .select(UNIT_SELECT)
    .in("document_id", documentIds)
    .eq("unit_type", unitType);
  if (error) {
    if (isMissingCatalogError(error.message || "")) return { rows: [], missingCatalog: true };
    throw new Error(error.message);
  }
  return { rows: (data as unknown as KnowledgeUnitRow[] | null) ?? [], missingCatalog: false };
}

async function answerStructured(params: {
  admin: SupabaseClient;
  question: string;
  plan: TransferQueryPlan;
  documents: SourceDocumentRow[];
  year: number | null;
}): Promise<{ answer: string; matched: number } | null | "missing_catalog"> {
  const documentIds = params.documents.map((document) => document.id);

  if (params.plan.factKind === "recruitment_quota") {
    const loaded = await loadUnits(params.admin, documentIds, "program");
    if (loaded.missingCatalog) return "missing_catalog";
    const requestedMajor = /컴소/.test(params.question)
      ? "컴퓨터소프트웨어학부"
      : params.plan.major;
    const rows = loaded.rows.filter((row) =>
      categoryMatches(row.category, params.plan.category)
      && textMatches(row.college, params.plan.college)
      && textMatches(row.major, requestedMajor)
    );
    return {
      answer: formatQuotaAnswer(rows, params.plan, params.documents, params.year),
      matched: rows.length,
    };
  }

  if (params.plan.factKind === "selection") {
    const loaded = await loadUnits(params.admin, documentIds, "selection_rule");
    if (loaded.missingCatalog) return "missing_catalog";
    const rows = loaded.rows.filter((row) =>
      subjectMatches(row.written_subjects, params.plan.subjectMode)
      && selectionScopeMatches(row, params.plan)
      && transferTypeMatches(row.transfer_types, params.plan.transferType)
      && (params.plan.minDocumentWeight === null
        || Number(row.final_document_weight ?? -1) >= params.plan.minDocumentWeight)
      && (params.plan.maxInterviewWeight === null
        || Number(row.final_interview_weight ?? Number.POSITIVE_INFINITY) <= params.plan.maxInterviewWeight)
    );
    return {
      answer: formatSelectionAnswer(rows, params.documents, params.year),
      matched: rows.length,
    };
  }

  if (params.plan.factKind === "schedule") {
    const loaded = await loadUnits(params.admin, documentIds, "schedule");
    if (loaded.missingCatalog) return "missing_catalog";
    const keyword = params.plan.scheduleKeyword || params.question;
    const ranked = loaded.rows
      .map((row) => ({ row, score: scheduleKeywordScore(row, keyword) }))
      .sort((a, b) => b.score - a.score);
    const bestScore = ranked[0]?.score ?? 0;
    const rows = bestScore > 0 ? ranked.filter((item) => item.score === bestScore).map((item) => item.row) : [];
    return {
      answer: formatScheduleAnswer(rows, params.documents, params.year),
      matched: rows.length,
    };
  }

  return null;
}

async function answerSemantic(params: {
  admin: SupabaseClient;
  question: string;
  plan: TransferQueryPlan;
  documents: SourceDocumentRow[];
  year: number | null;
}): Promise<{ answer: string; matched: number } | "missing_catalog"> {
  const queryEmbedding = await createEmbedding(params.plan.semanticQuery || params.question);
  const unitTypes = params.plan.unitTypes.length ? params.plan.unitTypes : null;
  const documentGroups = params.plan.operation === "compare"
    ? params.documents.map((document) => [document])
    : [params.documents];

  const results = await Promise.all(documentGroups.map(async (documents) => {
    const { data, error } = await params.admin.rpc("match_transfer_knowledge_units", {
      query_embedding: queryEmbedding,
      query_document_ids: documents.map((document) => document.id),
      query_unit_types: unitTypes,
      match_count: params.plan.operation === "compare" ? 4 : 8,
      min_similarity: 0.3,
    });
    if (error) {
      if (isMissingCatalogError(error.message || "")) return "missing_catalog" as const;
      throw new Error(error.message);
    }
    return (data as unknown as KnowledgeUnitRow[] | null) ?? [];
  }));
  if (results.some((result) => result === "missing_catalog")) return "missing_catalog";
  const rows = (results as KnowledgeUnitRow[][])
    .flat()
    .sort((a, b) => Number(b.similarity ?? 0) - Number(a.similarity ?? 0));
  if (!rows.length) {
    return {
      answer: missingAdmissionEvidence(params.documents),
      matched: 0,
    };
  }

  const generated = await generateGroundedAnswer({
    question: [
      params.question,
      `검색 범위: ${coveragePrefix(params.documents, params.year)}`,
      basicPlanNotice(params.documents),
      "기본계획은 확정 모집요강이 아니다. 검색 근거에 없으면 현재 확보한 문서에서 확인하지 못했다고 답하고, 공개되지 않았다고 추정하지 마라. 문서의 발표 예정 시기와 실제 공개 여부를 구분하라. 데이터 미보유를 대학 미공개로 단정하지 마라. 지원자격이나 전형별 예외를 추측하지 마라.",
      "답변 끝에 아직 DB에 적재되지 않은 학교·학년도는 포함되지 않는다고 밝혀라.",
    ].join("\n"),
    contexts: rows.map((row) => ({
      chunkText: row.content,
      similarity: Number(row.similarity ?? 0),
    })),
    maxContextCount: params.plan.operation === "compare" ? 12 : 8,
  });
  return { answer: generated, matched: rows.length };
}

export async function tryAnswerTransferCatalogQuestion(params: {
  admin: SupabaseClient;
  question: string;
}): Promise<TransferCatalogAnswer | null> {
  const { data: documentData, error: documentError } = await params.admin
    .from("ai_source_documents")
    .select("id,university,campus,admission_year,document_type,title,source_url,verified_at,metadata")
    .eq("exam_slug", "transfer")
    .eq("review_status", "verified")
    .eq("lifecycle_status", "active");

  if (documentError) {
    if (isMissingCatalogError(documentError.message || "")) return null;
    throw new Error(documentError.message);
  }
  const documents = selectAuthoritativeDocuments((documentData as SourceDocumentRow[] | null) ?? []);
  const currentAdmissionYear = documents.length
    ? Math.max(...documents.map((document) => document.admission_year))
    : new Date().getFullYear() + 1;

  let plan: TransferQueryPlan;
  try {
    plan = await createPlan(params.question, currentAdmissionYear);
  } catch {
    return {
      answer: "모집요강 검색 조건을 안전하게 해석하지 못해 답변하지 않았습니다. 학교·학년도·전형 또는 학과를 조금 더 구체적으로 적어주세요.",
      admissionYear: null,
      coverageCount: 0,
      matchedRuleCount: 0,
      grounded: false,
    };
  }
  if (plan.domain !== "admission_guide") return null;

  const requestedUniversities = explicitUniversities(params.question);
  const crossSchoolOperation = plan.operation === "list"
    || plan.operation === "count"
    || plan.operation === "compare";
  if (!requestedUniversities.length && !crossSchoolOperation) {
    return null;
  }

  const scope = resolveScope({
    question: params.question,
    plan,
    documents,
    currentAdmissionYear,
  });
  if (scope.missingUniversities.length) {
    return {
      answer: noAdmissionDocument(`${scope.year ?? currentAdmissionYear}학년도 ${scope.missingUniversities.join(", ")}`),
      admissionYear: scope.year,
      coverageCount: 0,
      matchedRuleCount: 0,
      grounded: false,
    };
  }
  if (!scope.documents.length) {
    const requestedYear = scope.year ? `${scope.year}학년도` : "요청한 범위의";
    return {
      answer: noAdmissionDocument(requestedYear),
      admissionYear: scope.year,
      coverageCount: 0,
      matchedRuleCount: 0,
      grounded: false,
    };
  }
  if (unsupportedFact(plan.factKind)) {
    return {
      answer: "현재 모집요강 DB에는 모집정원만 있고 실제 합격자 수·등록자 수·경쟁률·합격선 자료는 없어 답변할 수 없습니다.",
      admissionYear: scope.year,
      coverageCount: distinctSchoolCount(scope.documents),
      matchedRuleCount: 0,
      grounded: false,
    };
  }

  const structured = await answerStructured({
    admin: params.admin,
    question: params.question,
    plan,
    documents: scope.documents,
    year: scope.year,
  });
  if (structured === "missing_catalog") return null;
  const retrySelectionInText = structured && structured.matched === 0
    && plan.factKind === "selection" && ["lookup", "explain"].includes(plan.operation);
  if (structured && !retrySelectionInText) {
    return {
      answer: [basicPlanNotice(scope.documents), structured.matched > 0 || plan.factKind === "recruitment_quota" ? structured.answer : missingAdmissionEvidence(scope.documents)].filter(Boolean).join("\n\n"),
      admissionYear: scope.year,
      coverageCount: distinctSchoolCount(scope.documents),
      matchedRuleCount: structured.matched,
      grounded: structured.matched > 0,
    };
  }

  let semantic: { answer: string; matched: number } | "missing_catalog";
  try {
    semantic = await answerSemantic({
      admin: params.admin,
      question: params.question,
      plan: retrySelectionInText ? { ...plan, unitTypes: ["section", "selection_rule"] } : plan,
      documents: scope.documents,
      year: scope.year,
    });
  } catch {
    return {
      answer: "검증된 모집요강 근거를 검색하지 못해 답변하지 않았습니다. 잠시 후 다시 시도해주세요.",
      admissionYear: scope.year,
      coverageCount: distinctSchoolCount(scope.documents),
      matchedRuleCount: 0,
      grounded: false,
    };
  }
  if (semantic === "missing_catalog") return null;
  return {
    answer: [basicPlanNotice(scope.documents), semantic.answer].filter(Boolean).join("\n\n"),
    admissionYear: scope.year,
    coverageCount: distinctSchoolCount(scope.documents),
    matchedRuleCount: semantic.matched,
    grounded: semantic.matched > 0,
  };
}
