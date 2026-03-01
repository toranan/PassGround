import { NextResponse } from "next/server";
import { createEmbedding, generateText } from "@/lib/aiRag";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Exam = "transfer" | "cpa";
type AnalyzeStatus = "pass" | "waitlist" | "fail" | "unknown";

type MatchedChunkRow = {
  id: string;
  knowledge_item_id: string;
  chunk_text: string;
  similarity: number;
};

type KnowledgeItemRow = {
  id: string;
  tags: string[] | null;
  question: string | null;
  answer: string | null;
  raw_input: string | null;
};

type ParsedModelResult = {
  status: AnalyzeStatus;
  label: string;
  summary: string;
  detail: string;
  targetGuide: string;
  basis: string[];
};

const CUTOFF_KEYWORDS = [
  "커트라인",
  "컷",
  "합격",
  "추합",
  "불합격",
  "경쟁률",
  "전형",
  "모집요강",
  "원서",
  "서류",
  "면접",
  "필기",
  "점수",
  "학과",
  "대학",
  "대학교",
  "학년도",
  "편입",
];

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function parseExam(value: string): Exam | null {
  if (value === "transfer" || value === "cpa") return value;
  return null;
}

function parseYear(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    if (rounded >= 2000 && rounded <= 2100) return rounded;
    return null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < 2000 || rounded > 2100) return null;
  return rounded;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "")
    .trim();
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildUniversityVariants(value: string): string[] {
  const normalized = normalizeForMatch(value);
  if (!normalized) return [];

  const variants = [normalized];
  if (normalized.endsWith("대학교")) variants.push(normalized.slice(0, -3));
  if (normalized.endsWith("대학")) variants.push(normalized.slice(0, -2));
  if (normalized.endsWith("대")) variants.push(`${normalized.slice(0, -1)}대학교`);
  if (!normalized.endsWith("대")) variants.push(`${normalized}대`);
  return uniq(variants);
}

function buildMajorVariants(value: string): string[] {
  const normalized = normalizeForMatch(value);
  if (!normalized) return [];

  const variants = [normalized];
  if (normalized.endsWith("학과")) variants.push(normalized.slice(0, -2));
  if (normalized.endsWith("학부")) variants.push(normalized.slice(0, -2));
  if (!normalized.endsWith("학과")) variants.push(`${normalized}학과`);
  return uniq(variants);
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => needle.length >= 2 && haystack.includes(needle));
}

function countContains(text: string, keywords: string[]): number {
  return keywords.reduce((count, keyword) => count + (text.includes(normalizeForMatch(keyword)) ? 1 : 0), 0);
}

function isCutoffKnowledgeItem(item: KnowledgeItemRow): boolean {
  const normalizedTags = (item.tags ?? [])
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => normalizeForMatch(tag));
  const normalizedTagKeywords = CUTOFF_KEYWORDS.map((keyword) => normalizeForMatch(keyword));
  const tagHit = normalizedTags.some((tag) =>
    normalizedTagKeywords.some((keyword) => keyword.length >= 2 && tag.includes(keyword))
  );
  if (tagHit) return true;

  const corpus = normalizeForMatch([item.question ?? "", item.answer ?? "", item.raw_input ?? ""].join(" "));
  return countContains(corpus, CUTOFF_KEYWORDS) >= 2;
}

function mapStatus(value: string): AnalyzeStatus {
  const normalized = value.toLowerCase().trim();
  if (normalized === "pass" || normalized.includes("합격")) return "pass";
  if (normalized === "waitlist" || normalized.includes("추합")) return "waitlist";
  if (normalized === "fail" || normalized.includes("불합격")) return "fail";
  return "unknown";
}

function mapStatusLabel(status: AnalyzeStatus): string {
  if (status === "pass") return "합격권";
  if (status === "waitlist") return "추합권";
  if (status === "fail") return "불합격권";
  return "정보부족";
}

function compactSentence(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength).trim();
}

function parseModelResult(raw: string): ParsedModelResult | null {
  const direct = raw.trim();
  const jsonCandidate = direct.startsWith("{") ? direct : (direct.match(/\{[\s\S]*\}/)?.[0] ?? "");
  if (!jsonCandidate) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as Record<string, unknown>;

  const status = mapStatus(normalizeText(row.status, 32));
  const label = normalizeText(row.label, 20) || mapStatusLabel(status);
  const summary = normalizeText(row.summary, 200);
  const detail = normalizeText(row.detail, 900);
  const targetGuide = normalizeText(row.targetGuide, 420);
  const basis = Array.isArray(row.basis)
    ? row.basis
        .filter((item): item is string => typeof item === "string")
        .map((item) => compactSentence(item, 140))
        .filter(Boolean)
        .slice(0, 4)
    : [];

  return {
    status,
    label,
    summary,
    detail,
    targetGuide,
    basis,
  };
}

function buildUnavailablePayload(params: {
  traceId: string;
  detail?: string;
  basis?: string[];
  evidenceCount?: number;
}) {
  return {
    ok: true,
    source: "rag",
    found: false,
    status: "unknown",
    label: "정보부족",
    summary: "아직 해당 정보가 존재하지않습니다.",
    detail:
      params.detail ??
      "아직 해당 정보가 존재하지않습니다. 빠른시일내에 준비하도록하겠습니다.",
    targetGuide: "질문하기 버튼으로 접수해주시면 확인 후 반영하겠습니다.",
    basis: params.basis ?? [],
    message: "아직 해당 정보가 존재하지않습니다. 빠른시일내에 준비하도록하겠습니다.",
    evidenceCount: params.evidenceCount ?? 0,
    traceId: params.traceId,
  };
}

export async function POST(request: Request) {
  const traceId = request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const exam = parseExam(normalizeText(body.exam, 20) || "transfer");
  if (!exam) {
    return NextResponse.json({ error: "지원하지 않는 시험 카테고리입니다.", traceId }, { status: 400 });
  }
  if (exam === "cpa" && !ENABLE_CPA) {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다.", traceId }, { status: 404 });
  }

  const year = parseYear(body.year);
  const university = normalizeText(body.university, 120);
  const major = normalizeText(body.major, 120);
  const score = normalizeText(body.score, 80);

  if (!year) {
    return NextResponse.json({ error: "학년도(year)는 4자리 숫자여야 합니다.", traceId }, { status: 400 });
  }
  if (!university) {
    return NextResponse.json({ error: "학교명(university)은 필수입니다.", traceId }, { status: 400 });
  }
  if (!major) {
    return NextResponse.json({ error: "학과명(major)은 필수입니다.", traceId }, { status: 400 });
  }
  if (!score) {
    return NextResponse.json({ error: "점수(score)는 필수입니다.", traceId }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const retrievalQuery = [
    `${year}학년도`,
    university,
    major,
    `사용자 점수: ${score}`,
    "편입 커트라인",
    "최초합",
    "추합",
    "경쟁률",
  ].join(" ");

  try {
    const queryEmbedding = await createEmbedding(retrievalQuery);
    const { data, error } = await admin.rpc("match_ai_knowledge_chunks", {
      query_embedding: queryEmbedding,
      query_exam: exam,
      match_count: 12,
      min_similarity: 0.45,
    });

    if (error) {
      return NextResponse.json({ error: error.message, traceId }, { status: 400 });
    }

    const rows = ((data as MatchedChunkRow[] | null) ?? []).filter((row) => Boolean(row?.chunk_text?.trim()));
    if (!rows.length) {
      return withNoStore(NextResponse.json(buildUnavailablePayload({ traceId })));
    }

    const yearToken = String(year);
    const universityVariants = buildUniversityVariants(university);
    const majorVariants = buildMajorVariants(major);

    const candidates = rows
      .map((row) => {
        const normalizedChunk = normalizeForMatch(row.chunk_text);
        const hasUniversity = includesAny(normalizedChunk, universityVariants);
        const hasMajor = includesAny(normalizedChunk, majorVariants);
        const hasYear = normalizedChunk.includes(yearToken);
        const relevance =
          (hasUniversity ? 3 : 0) +
          (hasMajor ? 3 : 0) +
          (hasYear ? 2 : 0) +
          Math.max(0, Math.min(2, row.similarity * 2));

        return {
          ...row,
          hasUniversity,
          hasMajor,
          hasYear,
          relevance,
        };
      })
      .filter((row) => row.hasUniversity && row.hasMajor && row.hasYear)
      .sort((left, right) => {
        if (right.relevance !== left.relevance) return right.relevance - left.relevance;
        return right.similarity - left.similarity;
      })
      .slice(0, 6);

    if (!candidates.length) {
      return withNoStore(NextResponse.json(buildUnavailablePayload({ traceId })));
    }

    const knowledgeItemIds = Array.from(new Set(candidates.map((row) => row.knowledge_item_id)));
    const { data: knowledgeItems, error: knowledgeError } = await admin
      .from("ai_knowledge_items")
      .select("id,tags,question,answer,raw_input")
      .in("id", knowledgeItemIds)
      .eq("exam_slug", exam)
      .eq("status", "approved");

    if (knowledgeError) {
      return NextResponse.json({ error: knowledgeError.message, traceId }, { status: 400 });
    }

    const allowedKnowledgeIds = new Set(
      ((knowledgeItems as KnowledgeItemRow[] | null) ?? []).filter(isCutoffKnowledgeItem).map((item) => item.id)
    );
    const scopedCandidates = candidates.filter((row) => allowedKnowledgeIds.has(row.knowledge_item_id));

    if (!scopedCandidates.length) {
      return withNoStore(
        NextResponse.json(
          buildUnavailablePayload({
            traceId,
            detail: "입력한 조건과 일치하는 커트라인 근거가 아직 충분하지 않습니다.",
            evidenceCount: 0,
          })
        )
      );
    }

    const contextLines = scopedCandidates.map((row, index) => {
      const compact = compactSentence(row.chunk_text, 420);
      return `근거 ${index + 1} (유사도 ${row.similarity.toFixed(3)}): ${compact}`;
    });

    const modelRaw = await generateText({
      systemPrompt: [
        "너는 편입 커트라인 분석기다.",
        "반드시 제공된 근거 텍스트 안에서만 판단해라.",
        "감성 위로, 동기부여, 친근한 말투를 사용하지 마라.",
        "문체는 간결하고 딱딱한 안내문 형태로 작성해라.",
        "근거가 부족하거나 서로 충돌하면 status를 unknown으로 내려라.",
        "출력은 JSON만 허용한다. 코드블록/설명문 금지.",
        "JSON 스키마:",
        "{",
        '  "status": "pass|waitlist|fail|unknown",',
        '  "label": "합격권|추합권|불합격권|정보부족",',
        '  "summary": "한 줄 요약",',
        '  "detail": "상세 판단 근거",',
        '  "targetGuide": "점수 보정 가이드",',
        '  "basis": ["근거1","근거2"]',
        "}",
      ].join("\n"),
      userPrompt: [
        `입력 정보`,
        `- 학년도: ${year}`,
        `- 학교명: ${university}`,
        `- 학과명: ${major}`,
        `- 사용자 점수/틀린개수: ${score}`,
        "",
        "RAG 근거:",
        contextLines.join("\n"),
      ].join("\n"),
      temperature: 0,
      maxOutputTokens: 500,
    });

    let parsed = parseModelResult(modelRaw);
    if (!parsed) {
      const guessedStatus = mapStatus(modelRaw);
      parsed = {
        status: guessedStatus,
        label: mapStatusLabel(guessedStatus),
        summary: compactSentence(modelRaw, 120) || "근거를 충분히 구조화하지 못했습니다.",
        detail: compactSentence(modelRaw, 520),
        targetGuide: "입력 조건을 더 구체화하면 정확도를 높일 수 있습니다.",
        basis: contextLines.slice(0, 3).map((line) => compactSentence(line, 140)),
      };
    }

    const found = parsed.status !== "unknown";
    if (!found) {
      return withNoStore(
        NextResponse.json(
          buildUnavailablePayload({
            traceId,
            detail: parsed.detail || parsed.summary,
            basis: parsed.basis,
            evidenceCount: scopedCandidates.length,
          })
        )
      );
    }

    return withNoStore(
      NextResponse.json({
        ok: true,
        source: "rag",
        found: true,
        status: parsed.status,
        label: parsed.label || mapStatusLabel(parsed.status),
        summary: parsed.summary,
        detail: parsed.detail,
        targetGuide: parsed.targetGuide,
        basis: parsed.basis,
        evidenceCount: scopedCandidates.length,
        traceId,
      })
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "커트라인 분석에 실패했습니다.",
        traceId,
      },
      { status: 500 }
    );
  }
}
