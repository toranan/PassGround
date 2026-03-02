import { NextResponse } from "next/server";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getBearerToken, getUserByAccessToken, isAdminUser } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { generateText } from "@/lib/aiRag";
import { deleteKnowledgeChunksByItem, upsertKnowledgeChunksForApprovedItem } from "@/lib/ragIndexing";
import { inferKnowledgeTags, mergeKnowledgeTags } from "@/lib/knowledgeTags";

type Exam = "transfer" | "cpa";
type KnowledgeStatus = "pending" | "approved";

type KnowledgeRow = {
  id: string;
  exam_slug: string;
  raw_input: string;
  question: string;
  answer: string;
  tags: string[] | null;
  status: KnowledgeStatus;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
};

function resolveExam(value: string): Exam | null {
  if (value === "transfer" || value === "cpa") return value;
  return null;
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function normalizeTags(value: unknown): string[] {
  const rawList = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n]/g)
      : [];

  const dedup = new Set<string>();
  for (const entry of rawList) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim().replace(/\s+/g, " ").slice(0, 40);
    if (normalized) dedup.add(normalized);
  }
  return [...dedup].slice(0, 15);
}

function buildSuggestedQuestion(rawInput: string): string {
  const firstLine = rawInput
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "";
  const candidate = firstLine.replace(/\s+/g, " ").slice(0, 120);
  if (candidate.endsWith("?")) return candidate;
  return `${candidate}?`.slice(0, 120);
}

type ParsedBulkQAItem = {
  rawInput: string;
  question: string;
  answer: string;
};

function buildSuggestedTitle(rawInput: string): string {
  const firstLine = rawInput
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "RAG 본문";
  return firstLine.replace(/\s+/g, " ").slice(0, 120);
}

function normalizeQuestionLine(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!normalized) return "";
  return /[?？]$/.test(normalized) ? normalized : `${normalized}?`.slice(0, 120);
}

function normalizeAnswerBody(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 6000);
}

function parseBulkQAItems(raw: string): ParsedBulkQAItem[] {
  const source = raw.replace(/\r\n/g, "\n").trim();
  if (!source) return [];

  const regex = /Q\s*\d+\.\s*([\s\S]*?)\n\s*A\s*\d+\.\s*([\s\S]*?)(?=\n\s*Q\s*\d+\.|$)/gi;
  const parsed: ParsedBulkQAItem[] = [];

  for (const match of source.matchAll(regex)) {
    const questionRaw = (match[1] ?? "").trim();
    const answerRaw = (match[2] ?? "").trim();
    const question = normalizeQuestionLine(questionRaw);
    const answer = normalizeAnswerBody(answerRaw);
    if (!question || !answer) continue;

    parsed.push({
      rawInput: `Q. ${questionRaw}\nA. ${answerRaw}`.slice(0, 12000),
      question,
      answer,
    });
  }

  return parsed;
}

function parseRefinedDraft(raw: string): { question: string; answer: string } | null {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return null;

  const questionMatch = text.match(/(?:^|\n)\s*QUESTION\s*:\s*(.+)/i);
  const answerMatch = text.match(/(?:^|\n)\s*ANSWER\s*:\s*([\s\S]+)/i);

  let question = (questionMatch?.[1] || "").trim();
  let answer = (answerMatch?.[1] || "").trim();

  if (!question || !answer) {
    try {
      const json = JSON.parse(text) as { question?: string; answer?: string };
      question = (json.question || "").trim();
      answer = (json.answer || "").trim();
    } catch {
      return null;
    }
  }

  if (!question || !answer) return null;
  return {
    question: question.slice(0, 120),
    answer: answer.slice(0, 6000),
  };
}

async function refineDraftFromRawInput(rawInput: string): Promise<{ question: string; answer: string } | null> {
  const source = rawInput.replace(/\s+/g, " ").trim().slice(0, 3200);
  if (!source) return null;

  try {
    const refined = await generateText({
      systemPrompt: [
        "너는 편입/수험 코칭 지식을 정제하는 편집기다.",
        "입력된 메모를 관리자 검수용 초안으로 깔끔하게 다듬어라.",
        "원문의 핵심 의미, 수치, 비율(예: 10%)은 절대 바꾸지 마라.",
        "출력 형식을 반드시 지켜라.",
        "QUESTION: 사용자 질문형 한 줄",
        "ANSWER: 3~6문장, 자연스러운 한국어",
      ].join("\n"),
      userPrompt: `원문 메모:\n${source}`,
      temperature: 0,
      maxOutputTokens: 420,
    });
    return parseRefinedDraft(refined);
  } catch {
    return null;
  }
}

function validateExam(exam: Exam | null) {
  if (!exam) {
    return NextResponse.json({ error: "지원하지 않는 시험 카테고리입니다." }, { status: 400 });
  }
  if (exam === "cpa" && !ENABLE_CPA) {
    return NextResponse.json({ error: "CPA 서비스 비활성화 상태입니다." }, { status: 404 });
  }
  return null;
}

async function ensureAdmin(request: Request) {
  const token = getBearerToken(request);
  const user = await getUserByAccessToken(token);
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }),
    };
  }

  const allowed = await isAdminUser(user.id, user.email);
  if (!allowed) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    };
  }

  return { ok: true as const, user };
}

async function loadKnowledge(exam: Exam) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("ai_knowledge_items")
    .select("id,exam_slug,raw_input,question,answer,tags,status,created_at,updated_at,approved_at")
    .eq("exam_slug", exam)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return { error: error.message };
  }

  const mapped = ((data as KnowledgeRow[] | null) ?? []).map((row) => ({
    id: row.id,
    examSlug: row.exam_slug,
    rawInput: row.raw_input ?? "",
    question: row.question ?? "",
    answer: row.answer ?? "",
    tags: Array.isArray(row.tags) ? row.tags : [],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at,
  }));

  return {
    pending: mapped.filter((item) => item.status === "pending"),
    approved: mapped.filter((item) => item.status === "approved"),
  };
}

export async function GET(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const exam = resolveExam(searchParams.get("exam")?.trim() || "transfer");
  const examError = validateExam(exam);
  if (examError) return examError;

  const result = await loadKnowledge(exam as Exam);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const exam = resolveExam(normalizeText(body.exam, 20) || "transfer");
  const examError = validateExam(exam);
  if (examError) return examError;

  const directRawInput = normalizeText(body.directRawInput, 120000);
  if (directRawInput) {
    const manualTags = normalizeTags(body.tags);
    const directTitle = normalizeText(body.directTitle, 120);
    const question = directTitle || buildSuggestedTitle(directRawInput);
    const answer = directRawInput.slice(0, 60000);
    const inferredTags = inferKnowledgeTags([directRawInput, question, answer].join("\n"));
    const tags = mergeKnowledgeTags(manualTags, inferredTags);
    const approvedAt = new Date().toISOString();

    const admin = getSupabaseAdmin();
    const { data: inserted, error } = await admin
      .from("ai_knowledge_items")
      .insert({
        exam_slug: exam,
        raw_input: directRawInput,
        question,
        answer,
        tags,
        status: "approved",
        created_by: auth.user.id,
        approved_by: auth.user.id,
        approved_at: approvedAt,
      })
      .select("id,question,answer,raw_input,tags")
      .single();

    if (error || !inserted) {
      return NextResponse.json({ error: error?.message ?? "원문 직투입 저장에 실패했습니다." }, { status: 400 });
    }

    let ragSyncError: string | null = null;
    try {
      await upsertKnowledgeChunksForApprovedItem({
        admin,
        exam: exam as Exam,
        item: {
          id: inserted.id,
          question: inserted.question ?? "",
          answer: inserted.answer ?? "",
          raw_input: inserted.raw_input ?? "",
          tags: Array.isArray(inserted.tags) ? inserted.tags : [],
        },
      });
    } catch (syncError) {
      ragSyncError = syncError instanceof Error ? syncError.message : "증분 색인 동기화에 실패했습니다.";
    }

    const result = await loadKnowledge(exam as Exam);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, directInserted: true, ragSyncError, ...result });
  }

  const bulkRawInput = normalizeText(body.bulkRawInput, 180000);
  const manualTags = normalizeTags(body.tags);
  if (bulkRawInput) {
    const qaItems = parseBulkQAItems(bulkRawInput);
    if (!qaItems.length) {
      return NextResponse.json(
        { error: "Q/A 본문 형식을 인식하지 못했습니다. 'Q01. ... A01. ...' 형식으로 넣어주세요." },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const rows = qaItems.map((item) => {
      const inferredTags = inferKnowledgeTags([item.rawInput, item.question, item.answer].join("\n"));
      const tags = mergeKnowledgeTags(manualTags, inferredTags);
      return {
        exam_slug: exam,
        raw_input: item.rawInput,
        question: item.question,
        answer: item.answer,
        tags,
        status: "pending" as const,
        created_by: auth.user.id,
      };
    });

    const { error } = await admin.from("ai_knowledge_items").insert(rows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const result = await loadKnowledge(exam as Exam);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, bulkInsertedCount: rows.length, ...result });
  }

  const rawInput = normalizeText(body.rawInput, 12000);
  const providedQuestion = normalizeText(body.question, 120);
  const providedAnswer = normalizeText(body.answer, 6000);
  const refinedDraft =
    !providedQuestion || !providedAnswer ? await refineDraftFromRawInput(rawInput) : null;
  const question =
    providedQuestion || refinedDraft?.question || buildSuggestedQuestion(rawInput);
  const answer = providedAnswer || refinedDraft?.answer || rawInput;
  const inferredTags = inferKnowledgeTags([rawInput, question, answer].filter(Boolean).join("\n"));
  const tags = mergeKnowledgeTags(manualTags, inferredTags);

  if (!rawInput) {
    return NextResponse.json({ error: "날것 입력(rawInput)은 필수입니다." }, { status: 400 });
  }
  if (!answer) {
    return NextResponse.json({ error: "답변 내용(answer)을 생성하지 못했습니다." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("ai_knowledge_items").insert({
    exam_slug: exam,
    raw_input: rawInput,
    question,
    answer,
    tags,
    status: "pending",
    created_by: auth.user.id,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const result = await loadKnowledge(exam as Exam);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...result });
}

export async function PATCH(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const exam = resolveExam(normalizeText(body.exam, 20) || "transfer");
  const examError = validateExam(exam);
  if (examError) return examError;

  const id = normalizeText(body.id, 80);
  const status = normalizeText(body.status, 20) === "approved" ? "approved" : "pending";
  const rawInput = normalizeText(body.rawInput, 12000);
  const question = normalizeText(body.question, 120);
  const answer = normalizeText(body.answer, 6000);
  const manualTags = normalizeTags(body.tags);

  if (!id) {
    return NextResponse.json({ error: "수정할 지식 id가 필요합니다." }, { status: 400 });
  }
  if (!question) {
    return NextResponse.json({ error: "질문(question)은 필수입니다." }, { status: 400 });
  }
  if (!answer) {
    return NextResponse.json({ error: "답변(answer)은 필수입니다." }, { status: 400 });
  }

  const inferredTags = inferKnowledgeTags([rawInput, question, answer].filter(Boolean).join("\n"));
  const tags = mergeKnowledgeTags(manualTags, inferredTags);

  const updatePayload: {
    raw_input?: string;
    question: string;
    answer: string;
    tags: string[];
    status: KnowledgeStatus;
    approved_at: string | null;
    approved_by: string | null;
  } = {
    question,
    answer,
    tags,
    status,
    approved_at: status === "approved" ? new Date().toISOString() : null,
    approved_by: status === "approved" ? auth.user.id : null,
  };

  if (rawInput) {
    updatePayload.raw_input = rawInput;
  }

  const admin = getSupabaseAdmin();
  const { data: updated, error } = await admin
    .from("ai_knowledge_items")
    .update(updatePayload)
    .eq("id", id)
    .eq("exam_slug", exam)
    .select("id,question,answer,raw_input,tags,status")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!updated) {
    return NextResponse.json({ error: "수정 대상 지식을 찾을 수 없습니다." }, { status: 404 });
  }

  let ragSyncError: string | null = null;
  try {
    if (updated.status === "approved") {
      await upsertKnowledgeChunksForApprovedItem({
        admin,
        exam: exam as Exam,
        item: {
          id: updated.id,
          question: updated.question ?? "",
          answer: updated.answer ?? "",
          raw_input: updated.raw_input ?? "",
          tags: Array.isArray(updated.tags) ? updated.tags : [],
        },
      });
    } else {
      await deleteKnowledgeChunksByItem(admin, updated.id);
    }
  } catch (syncError) {
    ragSyncError = syncError instanceof Error ? syncError.message : "증분 색인 동기화에 실패했습니다.";
  }

  const result = await loadKnowledge(exam as Exam);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ragSyncError, ...result });
}

export async function DELETE(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const exam = resolveExam(normalizeText(body.exam, 20) || "transfer");
  const examError = validateExam(exam);
  if (examError) return examError;

  const id = normalizeText(body.id, 80);
  if (!id) {
    return NextResponse.json({ error: "삭제할 지식 id가 필요합니다." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("ai_knowledge_items").delete().eq("id", id).eq("exam_slug", exam);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const result = await loadKnowledge(exam as Exam);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...result });
}
