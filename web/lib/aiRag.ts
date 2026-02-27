const OPENAI_API_URL = "https://api.openai.com/v1";
const DEFAULT_EMBEDDING_MODEL =
  process.env.AZURE_OPENAI_EMBEDDING_MODEL ||
  process.env.OPENAI_EMBEDDING_MODEL ||
  "text-embedding-3-small";
const DEFAULT_CHAT_MODEL =
  process.env.AZURE_OPENAI_CHAT_MODEL || process.env.OPENAI_CHAT_MODEL || "gpt-4.1-mini";
const AZURE_RESPONSES_URL = (process.env.AZURE_OPENAI_RESPONSES_URL || "").trim();
const AZURE_EMBEDDINGS_URL = (process.env.AZURE_OPENAI_EMBEDDINGS_URL || "").trim();

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
  error?: { message?: string };
};

type ResponsesApiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: { message?: string };
};

type StreamEvent = {
  type?: string;
  delta?: string;
  text?: string;
  error?: { message?: string };
};

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

function getOpenAIKey(): string {
  return (process.env.OPENAI_API_KEY || "").trim();
}

function getAzureKey(): string {
  return (process.env.AZURE_OPENAI_API_KEY || "").trim();
}

function isAzureProvider(): boolean {
  return Boolean(AZURE_RESPONSES_URL);
}

export function getAiProviderName(): "azure-openai" | "openai" {
  return isAzureProvider() ? "azure-openai" : "openai";
}

export function getEmbeddingModelName(): string {
  return DEFAULT_EMBEDDING_MODEL;
}

export function getChatModelName(): string {
  return DEFAULT_CHAT_MODEL;
}

function assertProviderKey() {
  if (isAzureProvider()) {
    if (!getAzureKey()) {
      throw new Error("AZURE_OPENAI_API_KEY가 설정되어 있지 않습니다.");
    }
    return;
  }
  if (!getOpenAIKey()) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  }
}

function buildAzureEmbeddingsUrl(): string {
  if (AZURE_EMBEDDINGS_URL) return AZURE_EMBEDDINGS_URL;
  if (!AZURE_RESPONSES_URL) return "";
  try {
    const parsed = new URL(AZURE_RESPONSES_URL);
    parsed.pathname = parsed.pathname.replace(/\/responses\/?$/, "/embeddings");
    return parsed.toString();
  } catch {
    return "";
  }
}

function buildAuthHeaders(): Record<string, string> {
  if (isAzureProvider()) {
    return {
      "Content-Type": "application/json",
      "api-key": getAzureKey(),
    };
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getOpenAIKey()}`,
  };
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function chunkText(text: string, maxChars = 900, overlapChars = 180): string[] {
  const normalized = text.trim().replace(/\r\n/g, "\n");
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + maxChars);
    const slice = normalized.slice(start, end).trim();
    if (slice) {
      chunks.push(slice);
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

export async function createEmbeddings(inputs: string[]): Promise<number[][]> {
  assertProviderKey();
  if (!inputs.length) return [];

  const endpoint = isAzureProvider() ? buildAzureEmbeddingsUrl() : `${OPENAI_API_URL}/embeddings`;
  if (!endpoint) {
    throw new Error("AZURE_OPENAI_EMBEDDINGS_URL이 필요합니다.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify({
      model: DEFAULT_EMBEDDING_MODEL,
      input: inputs,
    }),
  });

  const payload = (await response.json().catch(() => null)) as EmbeddingResponse | null;
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
  throw new Error("응답 생성 결과를 파싱하지 못했습니다.");
}

export async function generateText(params: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  assertProviderKey();
  const endpoint = isAzureProvider() ? AZURE_RESPONSES_URL : `${OPENAI_API_URL}/responses`;
  if (!endpoint) {
    throw new Error("AZURE_OPENAI_RESPONSES_URL이 필요합니다.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify({
      model: DEFAULT_CHAT_MODEL,
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
      temperature: params.temperature ?? 0.3,
      max_output_tokens: params.maxOutputTokens,
    }),
  });

  const payload = (await response.json().catch(() => null)) as ResponsesApiResponse | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message || "답변 생성에 실패했습니다.");
  }

  return parseResponsesText(payload);
}

function buildChatInput(systemPrompt: string, userPrompt: string) {
  return [
    {
      role: "system",
      content: [{ type: "input_text", text: systemPrompt }],
    },
    {
      role: "user",
      content: [{ type: "input_text", text: userPrompt }],
    },
  ];
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

      if (parsed.type === "response.output_text.delta") {
        sawDelta = true;
      } else if (parsed.type === "response.output_text.done" && sawDelta) {
        // Ignore duplicated final text when delta events already streamed.
        continue;
      }

      onDelta(delta);
      text += delta;
    }
  }

  return text;
}

export async function streamText(params: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  onDelta: (delta: string) => void;
}): Promise<string> {
  assertProviderKey();
  const endpoint = isAzureProvider() ? AZURE_RESPONSES_URL : `${OPENAI_API_URL}/responses`;
  if (!endpoint) {
    throw new Error("AZURE_OPENAI_RESPONSES_URL이 필요합니다.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify({
      model: DEFAULT_CHAT_MODEL,
      input: buildChatInput(params.systemPrompt, params.userPrompt),
      temperature: params.temperature ?? 0.3,
      max_output_tokens: params.maxOutputTokens,
      stream: true,
    }),
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

  // Fallback: if provider does not emit stream deltas, use non-stream call.
  const fallbackText = await generateText({
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    temperature: params.temperature,
    maxOutputTokens: params.maxOutputTokens,
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

  const systemPrompt =
    "너는 편입/학습 상담 도우미다. 제공된 근거를 최우선으로 답하고, 근거가 부족하면 단정하지 말고 일반적인 조언으로 답하라.";
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
