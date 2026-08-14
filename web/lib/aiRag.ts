// ============================================================================
// Provider: OpenAI 단일화
//   - Chat 생성:  OpenAI Responses API (기본 gpt-5.6-luna, OPENAI_CHAT_MODEL로 교체)
//   - Embedding:  OpenAI (text-embedding-3-small, 1536차원, DB와 일치) → OPENAI_API_KEY
//
// OPENAI_API_KEY가 없으면 임베딩은 EmbeddingsDisabledError throw → chat/route.ts가
// catch해서 RAG 없이 fallback 답변으로 진행.
// ============================================================================

const OPENAI_API_BASE = "https://api.openai.com/v1";
const DEFAULT_OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
// gpt-5.6-luna: 최신 세대 중 가장 저렴한 티어($0.20/$1.20 per 1M, 캐시 입력 $0.02).
// RAG 근거 요약/재작성이 주 작업이라 추론 예산 없이도 품질이 충분하다.
const DEFAULT_OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-5.6-luna";

// Responses API는 max_output_tokens 최소값이 16이다. 분류기처럼 8토큰만 요청하는
// 호출이 있어서 하한을 강제한다.
const MIN_OUTPUT_TOKENS = 16;

function getOpenAIKey(): string {
  return (process.env.OPENAI_API_KEY || "").trim();
}

function assertOpenAIKey() {
  if (!getOpenAIKey()) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  }
}

export class EmbeddingsDisabledError extends Error {
  constructor(message = "임베딩 기능이 비활성화되어 있습니다.") {
    super(message);
    this.name = "EmbeddingsDisabledError";
  }
}

export type RagKnowledgeItem = {
  id: string;
  question: string;
  answer: string;
  raw_input: string;
  tags?: string[] | null;
};

export type KnowledgeChunk = {
  knowledgeItemId: string;
  chunkIndex: number;
  chunkText: string;
};

export function getAiProviderName(): "openai" {
  return "openai";
}

export function getEmbeddingModelName(): string {
  return DEFAULT_OPENAI_EMBEDDING_MODEL;
}

export function getChatModelName(): string {
  return DEFAULT_OPENAI_CHAT_MODEL;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

type TableBlock = { start: number; end: number; head: string };

// 마크다운 표 블록의 위치와 헤더(제목행 + 구분행)를 찾아둔다.
function findTableBlocks(text: string): TableBlock[] {
  const blocks: TableBlock[] = [];
  let offset = 0;
  let current: { start: number; end: number; lines: string[] } | null = null;

  for (const line of text.split("\n")) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (current) {
        current.end = offset + line.length;
        if (current.lines.length < 2) current.lines.push(line);
      } else {
        current = { start: offset, end: offset + line.length, lines: [line] };
      }
    } else if (current) {
      blocks.push({ start: current.start, end: current.end, head: current.lines.join("\n") });
      current = null;
    }
    offset += line.length + 1;
  }
  if (current) {
    blocks.push({ start: current.start, end: current.end, head: current.lines.join("\n") });
  }
  return blocks;
}

export function chunkText(text: string, maxChars = 900, overlapChars = 180): string[] {
  const normalized = text.trim().replace(/\r\n/g, "\n");
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const tables = findTableBlocks(normalized);
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + maxChars);
    if (end < normalized.length) {
      // 줄 한가운데(표라면 행 한가운데)에서 자르지 않는다.
      const lineBreak = normalized.lastIndexOf("\n", end);
      if (lineBreak > start + maxChars / 2) end = lineBreak;
    }

    const slice = normalized.slice(start, end).trim();
    if (slice) {
      // 표 중간부터 시작하는 조각은 헤더가 없어 어느 열인지 알 수 없다. 헤더를 붙여준다.
      const openTable = tables.find((block) => block.start < start && block.end > start);
      const needsHead = openTable && !slice.startsWith(openTable.head);
      chunks.push(needsHead ? `${openTable.head}\n${slice}` : slice);
    }
    if (end >= normalized.length) break;
    start = Math.max(0, end - overlapChars);
  }
  return chunks;
}

export function buildKnowledgeSourceText(item: RagKnowledgeItem): string {
  const tags = (item.tags ?? []).filter(Boolean).join(", ");
  return [
    item.question ? `질문: ${item.question}` : "",
    item.answer ? `답변: ${item.answer}` : "",
    item.raw_input ? `원문 메모: ${item.raw_input}` : "",
    tags ? `태그: ${tags}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildKnowledgeChunks(items: RagKnowledgeItem[]): KnowledgeChunk[] {
  const result: KnowledgeChunk[] = [];
  for (const item of items) {
    const sourceText = buildKnowledgeSourceText(item);
    const parts = chunkText(sourceText);
    parts.forEach((chunkTextPart, index) => {
      result.push({
        knowledgeItemId: item.id,
        chunkIndex: index,
        chunkText: chunkTextPart,
      });
    });
  }
  return result;
}

type OpenAIEmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
  error?: { message?: string };
};

export async function createEmbeddings(inputs: string[]): Promise<number[][]> {
  if (!inputs.length) return [];
  const key = getOpenAIKey();
  if (!key) {
    throw new EmbeddingsDisabledError("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  }

  const response = await fetch(`${OPENAI_API_BASE}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: DEFAULT_OPENAI_EMBEDDING_MODEL,
      input: inputs,
    }),
  });

  const payload = (await response.json().catch(() => null)) as OpenAIEmbeddingResponse | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message || "임베딩 생성에 실패했습니다.");
  }
  const vectors = payload?.data?.map((row) => row.embedding ?? []) ?? [];
  if (vectors.length !== inputs.length || vectors.some((vector) => !vector.length)) {
    throw new Error("임베딩 응답 형식이 올바르지 않습니다.");
  }
  return vectors;
}

export async function createEmbedding(input: string): Promise<number[]> {
  const [vector] = await createEmbeddings([input]);
  return vector;
}

type ResponsesApiResponse = {
  output_text?: string;
  status?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  incomplete_details?: { reason?: string };
  error?: { message?: string };
};

type StreamEvent = {
  type?: string;
  delta?: string;
  text?: string;
  error?: { message?: string };
};

type GenerateParams = {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  disableThinking?: boolean;
};

// gpt-5 / o시리즈는 temperature를 거부하고, reasoning 토큰이 max_output_tokens를
// 먼저 소모한다.
function isReasoningModel(model: string): boolean {
  const normalized = model.toLowerCase();
  return (
    normalized.startsWith("gpt-5") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  );
}

// 추론을 최소로 낮추는 값이 세대마다 다르다.
//   gpt-5 / 5.1 / 5.2, o시리즈 → "minimal" ("none" 거부)
//   gpt-5.4 이상            → "none"    ("minimal" 거부)
// 잘못된 값을 보내면 400이 나므로 모델명으로 분기한다.
function minimalEffortForModel(model: string): "none" | "minimal" {
  const normalized = model.toLowerCase();
  const legacyMinimal =
    /^gpt-5(\.[12])?(-|$)/.test(normalized) || /^o[134](-|$)/.test(normalized);
  return legacyMinimal ? "minimal" : "none";
}

function buildResponsesBody(params: GenerateParams, stream: boolean): Record<string, unknown> {
  const reasoning = isReasoningModel(DEFAULT_OPENAI_CHAT_MODEL);
  const body: Record<string, unknown> = {
    model: DEFAULT_OPENAI_CHAT_MODEL,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: params.systemPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: params.userPrompt }],
      },
    ],
  };

  if (params.maxOutputTokens) {
    // 추론 모델은 reasoning 토큰까지 이 예산에서 나가므로 여유를 더 준다.
    const floor = reasoning ? 256 : MIN_OUTPUT_TOKENS;
    body.max_output_tokens = Math.max(floor, params.maxOutputTokens);
  }

  if (reasoning) {
    // 분류기처럼 짧은 출력만 필요한 호출은 추론 예산을 최소로.
    if (params.disableThinking) {
      body.reasoning = { effort: minimalEffortForModel(DEFAULT_OPENAI_CHAT_MODEL) };
    }
  } else {
    body.temperature = params.temperature ?? 0.3;
  }

  if (stream) {
    body.stream = true;
  }
  return body;
}

function parseResponsesText(payload: ResponsesApiResponse | null): string {
  const byOutputText = payload?.output_text?.trim();
  if (byOutputText) return byOutputText;

  const byContents = payload?.output
    ?.flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" || content.type === "text")
    .map((content) => content.text?.trim() || "")
    .filter(Boolean)
    .join("\n")
    .trim();

  if (byContents) return byContents;
  if (payload?.status === "incomplete") {
    throw new Error(
      `답변이 잘렸습니다(${payload.incomplete_details?.reason || "incomplete"}).`
    );
  }
  throw new Error("응답 생성 결과를 파싱하지 못했습니다.");
}

export async function generateText(params: GenerateParams): Promise<string> {
  assertOpenAIKey();

  const response = await fetch(`${OPENAI_API_BASE}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIKey()}`,
    },
    body: JSON.stringify(buildResponsesBody(params, false)),
  });

  const payload = (await response.json().catch(() => null)) as ResponsesApiResponse | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message || "답변 생성에 실패했습니다.");
  }
  return parseResponsesText(payload);
}

function extractStreamDelta(event: StreamEvent): string {
  if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
    return event.delta;
  }
  if (event.type === "response.output_text.done" && typeof event.text === "string") {
    return event.text;
  }
  return "";
}

async function parseSseStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (delta: string) => void
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let sawDelta = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const boundary = buffer.indexOf("\n\n");
      if (boundary < 0) break;

      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const data = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");

      if (!data || data === "[DONE]") continue;

      let parsed: StreamEvent | null = null;
      try {
        parsed = JSON.parse(data) as StreamEvent;
      } catch {
        continue;
      }
      if (!parsed) continue;

      if (parsed.type === "error") {
        throw new Error(parsed.error?.message || "스트리밍 응답 생성에 실패했습니다.");
      }

      const delta = extractStreamDelta(parsed);
      if (!delta) continue;

      // delta 이벤트를 이미 받았다면 done 이벤트의 전체 텍스트는 중복이라 버린다.
      if (parsed.type === "response.output_text.delta") {
        sawDelta = true;
      } else if (parsed.type === "response.output_text.done" && sawDelta) {
        continue;
      }

      onDelta(delta);
      text += delta;
    }
  }

  return text;
}

export async function streamText(
  params: GenerateParams & { onDelta: (delta: string) => void }
): Promise<string> {
  assertOpenAIKey();

  const response = await fetch(`${OPENAI_API_BASE}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIKey()}`,
    },
    body: JSON.stringify(buildResponsesBody(params, true)),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ResponsesApiResponse | null;
    throw new Error(payload?.error?.message || "답변 생성에 실패했습니다.");
  }
  if (!response.body) {
    throw new Error("스트리밍 응답 본문이 비어 있습니다.");
  }

  const streamed = await parseSseStream(response.body, params.onDelta);
  if (streamed) return streamed;

  const fallbackText = await generateText({
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    temperature: params.temperature,
    maxOutputTokens: params.maxOutputTokens,
    disableThinking: params.disableThinking,
  });
  if (fallbackText) {
    params.onDelta(fallbackText);
  }
  return fallbackText;
}

function buildGroundedPrompts(params: {
  question: string;
  contexts: Array<{ chunkText: string; similarity: number }>;
  maxContextCount?: number;
}) {
  const maxContextCount = params.maxContextCount ?? 6;
  const selected = params.contexts.slice(0, maxContextCount);
  const contextText = selected
    .map((ctx, index) => `근거 ${index + 1} (유사도 ${ctx.similarity.toFixed(3)}):\n${ctx.chunkText}`)
    .join("\n\n");

  // 지식은 마크다운 표로 저장하지만, 답변을 그리는 쪽(iOS SwiftUI Text·웹 pre-wrap)은
  // 마크다운을 렌더링하지 않는다. 표를 그대로 뱉으면 파이프 문자가 그대로 노출된다.
  const systemPrompt = [
    "너는 편입/학습 상담 도우미 '합곰'이다. 친구처럼 친근한 반말로 답하되, 제공된 근거를 최우선으로 답하고 근거가 부족하면 단정하지 말고 일반적인 조언으로 답하라.",
    "근거에 표가 있어도 마크다운 표나 파이프(|) 기호로 출력하지 마라. 항목마다 줄을 바꿔 '구분: 값' 형태로 풀어써라.",
  ].join("\n");
  const userPrompt = [
    `질문:\n${params.question}`,
    contextText ? `\n근거:\n${contextText}` : "\n근거: 없음",
    "\n출력 규칙: 간결하고 직설적으로 답해라. 불필요한 서론은 생략해라.",
  ].join("\n");

  return { systemPrompt, userPrompt };
}

export async function generateGroundedAnswer(params: {
  question: string;
  contexts: Array<{ chunkText: string; similarity: number }>;
  maxContextCount?: number;
}): Promise<string> {
  const { systemPrompt, userPrompt } = buildGroundedPrompts(params);
  return generateText({
    systemPrompt,
    userPrompt,
    temperature: 0.3,
  });
}

export async function generateGroundedAnswerStream(params: {
  question: string;
  contexts: Array<{ chunkText: string; similarity: number }>;
  maxContextCount?: number;
  onDelta: (delta: string) => void;
}): Promise<string> {
  const { systemPrompt, userPrompt } = buildGroundedPrompts(params);
  return streamText({
    systemPrompt,
    userPrompt,
    temperature: 0.3,
    onDelta: params.onDelta,
  });
}

export function estimateChunkTokens(text: string): number {
  return estimateTokens(text);
}
