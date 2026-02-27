import { NextResponse } from "next/server";
import { ENABLE_CPA } from "@/lib/featureFlags";
import { getBearerToken, getUserByAccessToken, isAdminUser } from "@/lib/authServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { inferKnowledgeTags, mergeKnowledgeTags } from "@/lib/knowledgeTags";

type Exam = "transfer" | "cpa";

function resolveExam(value: string): Exam | null {
  if (value === "transfer" || value === "cpa") return value;
  return null;
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

export async function POST(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return auth.response;

  const formData = await request.formData();
  const examRaw = formData.get("exam");
  const exam = resolveExam(typeof examRaw === "string" ? examRaw.trim() : "transfer");
  const examError = validateExam(exam);
  if (examError) return examError;

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "PDF 파일(file)이 필요합니다." }, { status: 400 });
  }

  const isPdfType = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdfType) {
    return NextResponse.json({ error: "PDF 파일만 업로드할 수 있습니다." }, { status: 400 });
  }

  const maxSize = 20 * 1024 * 1024;
  if (file.size > maxSize) {
    return NextResponse.json({ error: "PDF는 20MB 이하여야 합니다." }, { status: 400 });
  }

  const note = normalizeText(formData.get("note"), 6000);
  const question = normalizeText(formData.get("question"), 120);
  const answer = normalizeText(formData.get("answer"), 6000);
  const manualTags = normalizeTags(formData.get("tags"));

  const admin = getSupabaseAdmin();
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filepath = `knowledge/${exam}/${timestamp}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage.from("attachments").upload(filepath, buffer, {
    contentType: "application/pdf",
    upsert: false,
  });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data: urlData } = admin.storage.from("attachments").getPublicUrl(filepath);
  const pdfUrl = urlData.publicUrl;

  const rawInput = [
    `PDF 파일명: ${file.name}`,
    `PDF URL: ${pdfUrl}`,
    note ? `관리자 메모:\n${note}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const finalQuestion = question || `${file.name} 핵심 내용 알려줘?`.slice(0, 120);
  const finalAnswer = answer || note || `PDF 원문(${file.name}) 기반 초안입니다. 관리자 검수 후 승인 반영하세요.`;
  const inferredTags = inferKnowledgeTags([rawInput, finalQuestion, finalAnswer].join("\n"));
  const tags = mergeKnowledgeTags(manualTags, inferredTags);

  const { data: inserted, error: insertError } = await admin
    .from("ai_knowledge_items")
    .insert({
      exam_slug: exam,
      raw_input: rawInput,
      question: finalQuestion,
      answer: finalAnswer,
      tags,
      status: "pending",
      created_by: auth.user.id,
    })
    .select("id,exam_slug,question,answer,status,created_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    pdfUrl,
    draft: inserted,
  });
}
