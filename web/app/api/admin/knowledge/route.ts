import { NextResponse } from "next/server";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getBearerToken, getUserByAccessToken, isAdminUser } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
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

  const rawInput = normalizeText(body.rawInput, 12000);
  const question = normalizeText(body.question, 120) || buildSuggestedQuestion(rawInput);
  const answer = normalizeText(body.answer, 6000) || rawInput;
  const manualTags = normalizeTags(body.tags);
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
