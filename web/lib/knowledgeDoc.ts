// 모집요강 PDF를 지식으로 넣기 위한 분할 유틸.
//
// 요강 하나를 지식 1건으로 넣으면 전형방법·지원자격·일정·학과별 모집여부가 한 덩어리가 되어
// 검색이 뭉개진다. 마크다운 헤딩 기준으로 섹션을 나누고, 각 섹션에 출처(학교·학년도)를
// 붙여 청크만 봐도 어느 학교 것인지 알 수 있게 한다.

export type DocMeta = {
  university: string;
  year: number;
  docTitle: string;
};

export type DocSection = {
  heading: string;
  body: string;
  /** 임베딩·저장용 본문. 출처 프리픽스가 붙어 있다. */
  text: string;
  /** 지식 항목의 question 으로 쓸 한 줄 */
  title: string;
};

const HEADING = /^(#{1,3})\s+(.*)$/;

/** 섹션이 너무 잘게 쪼개지지 않도록 이 길이 미만이면 앞 섹션에 붙인다. */
const MIN_SECTION_CHARS = 120;

export function buildContextPrefix(meta: DocMeta, heading: string): string {
  return `[출처: ${meta.year}학년도 ${meta.university} ${meta.docTitle} / 섹션: ${heading}]`;
}

function parseRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function isSeparator(line: string): boolean {
  return /^\|[\s|:-]+\|$/.test(line.trim());
}

const EMPTY_VALUES = new Set(["", "-", "–", "—"]);

// 요강 표는 모집 여부를 O/X로만 적는다. X를 빈 칸으로 취급하면 "학사편입은 안 뽑는다"는
// 정보가 통째로 사라지므로 말로 풀어준다.
function describeValue(value: string): string {
  if (value === "O" || value === "○") return "모집함(O)";
  if (value === "X" || value === "x" || value === "×") return "모집 안 함(X)";
  return value;
}

/**
 * 마크다운 표의 각 행을 한 문장으로 편다.
 *
 * `| 자연계열Ⅱ | 3단계 | - | 2단계 60% | - | 35% | 5% |` 를 그대로 임베딩하면
 * "서류평가 몇 프로야?" 같은 자연어 질문과 벡터가 붙지 않는다. 열 이름을 값에 붙여
 * "서류정성평가 35%"처럼 만들어야 질문과 같은 표현 공간에 놓인다.
 */
export function serializeTableRows(markdown: string, prefix: string): string[] {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let header: string[] | null = null;

  for (const line of lines) {
    if (!line.trim().startsWith("|")) {
      header = null;
      continue;
    }
    if (isSeparator(line)) continue;

    const cells = parseRow(line);
    if (!header) {
      header = cells;
      continue;
    }

    const label = cells[0] && !EMPTY_VALUES.has(cells[0]) ? cells[0] : "";
    const parts = cells
      .slice(1)
      .map((value, index) => {
        const name = header?.[index + 1] ?? "";
        if (EMPTY_VALUES.has(value)) return "";
        const described = describeValue(value);
        return name ? `${name} ${described}` : described;
      })
      .filter(Boolean);

    if (!parts.length) continue;
    out.push(`${prefix} ${label ? `${label}: ` : ""}${parts.join(", ")}`.replace(/\s+/g, " ").trim());
  }

  return out;
}

function stripMarkdownTables(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let inTable = false;

  for (const line of lines) {
    if (line.trim().startsWith("|")) {
      if (!inTable && out.length && out[out.length - 1] !== "") out.push("");
      inTable = true;
      continue;
    }
    inTable = false;
    out.push(line);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function chunkPlainText(text: string, maxChars: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + maxChars);
    if (end < normalized.length) {
      const paragraphBreak = normalized.lastIndexOf("\n\n", end);
      const lineBreak = normalized.lastIndexOf("\n", end);
      const sentenceBreak = normalized.lastIndexOf(". ", end);
      const candidate = Math.max(paragraphBreak, lineBreak, sentenceBreak);
      if (candidate > start + Math.floor(maxChars * 0.55)) {
        end = candidate + (candidate === sentenceBreak ? 1 : 0);
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = end;
  }
  return chunks;
}

/**
 * 검증 완료 문서 섹션을 임베딩 청크로 변환한다.
 *
 * - 첫 `[출처: ...]` 줄을 모든 청크에 반복한다.
 * - 마크다운 표는 행별 자기완결 문장으로 변환한다.
 * - 표가 아닌 설명은 문단 경계를 우선해 나눈다.
 */
export function chunkVerifiedSectionText(text: string, maxChars = 900): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const firstLine = lines[0]?.trim() ?? "";
  const hasSourcePrefix = /^\[출처:\s*.+\]$/.test(firstLine);
  const prefix = hasSourcePrefix ? firstLine : "";
  const body = hasSourcePrefix ? lines.slice(1).join("\n").trim() : normalized;
  const bodyLimit = Math.max(360, maxChars - (prefix ? prefix.length + 1 : 0));

  const proseChunks = chunkPlainText(stripMarkdownTables(body), bodyLimit).map((chunk) =>
    prefix ? `${prefix}\n${chunk}` : chunk
  );
  const tableChunks = serializeTableRows(body, prefix).map((chunk) => chunk.trim());

  return [...new Set([...proseChunks, ...tableChunks].filter(Boolean))];
}

export function splitMarkdownSections(markdown: string, meta: DocMeta): DocSection[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const raw: Array<{ heading: string; lines: string[] }> = [];

  let heading = "개요";
  let buffer: string[] = [];
  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body) raw.push({ heading, lines: buffer });
    buffer = [];
  };

  for (const line of lines) {
    const match = line.match(HEADING);
    if (match) {
      flush();
      heading = match[2].replace(/[#*]/g, "").trim() || "개요";
      continue;
    }
    buffer.push(line);
  }
  flush();

  // 표만 있고 설명이 없는 짧은 섹션은 앞 섹션에 합친다.
  const merged: Array<{ heading: string; body: string }> = [];
  for (const section of raw) {
    const body = section.lines.join("\n").trim();
    const previous = merged[merged.length - 1];
    if (previous && body.length < MIN_SECTION_CHARS) {
      previous.body = `${previous.body}\n\n${section.heading}\n${body}`.trim();
      continue;
    }
    merged.push({ heading: section.heading, body });
  }

  return merged.map((section) => {
    const prefix = buildContextPrefix(meta, section.heading);
    return {
      heading: section.heading,
      body: section.body,
      text: `${prefix}\n${section.body}`,
      title: `${meta.year}학년도 ${meta.university} ${section.heading}`.slice(0, 120),
    };
  });
}
