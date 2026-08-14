// 엑셀/한글/노션/PDF에서 복사한 표는 열이 탭, 행이 개행으로 들어온다.
// 그대로 저장하면 (1) 화면에서 열이 안 맞고 (2) RAG 청킹 때 표가 중간에서 잘려
// 헤더가 떨어져 나간 조각이 생긴다. 붙여넣기 시점에 마크다운 표로 정규화해서
// 행 하나가 그 자체로 의미를 갖도록 만든다.

const EMPTY_CELL = "–";

function isTableLine(line: string): boolean {
  return line.includes("\t");
}

function splitCells(line: string): string[] {
  return line.split("\t").map((cell) => cell.trim());
}

function toMarkdownTable(lines: string[]): string {
  const rows = lines.map(splitCells);
  const width = Math.max(...rows.map((row) => row.length));

  // 병합 셀(rowspan)로 앞 칸이 빈 행은 위 값을 물려받게 한다.
  // "3단계 | – | 2단계 55%"처럼 어느 모집단위의 단계인지 알 수 없게 되는 걸 막는다.
  const carried: string[] = [];
  const padded = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: width }, (_, i) => row[i] ?? "");
    if (rowIndex > 0) {
      for (let i = 0; i < width; i += 1) {
        if (cells[i]) break;
        if (carried[i]) cells[i] = carried[i];
      }
    }
    cells.forEach((cell, i) => {
      if (cell) carried[i] = cell;
    });
    return cells.map((cell) => cell || EMPTY_CELL);
  });

  const [header, ...body] = padded;
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

export function normalizePastedTables(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let block: string[] = [];

  const flush = () => {
    if (!block.length) return;
    // 탭이 한 줄에만 있으면 표가 아니라 들여쓴 문장일 수 있으니 그대로 둔다.
    out.push(block.length >= 2 ? toMarkdownTable(block) : block[0].replace(/\t+/g, " "));
    block = [];
  };

  for (const line of lines) {
    if (isTableLine(line)) {
      block.push(line);
      continue;
    }
    flush();
    out.push(line);
  }
  flush();

  return out.join("\n");
}

export function containsTable(text: string): boolean {
  return /^\|.*\|$/m.test(text) || /\t.*\t/.test(text);
}

// 모집요강 PDF나 웹에서 복사하면 줄마다 빈 줄이 끼어 들어와 여백만 잔뜩 생긴다.
// 빈 줄을 걷어내되, 소제목(■, [변경 전], 1. 등) 앞에는 한 줄만 남겨 단락을 구분한다.
const SECTION_HEADING = /^\s*(?:[■◆▶●※]|\[[^\]]+\]|#{1,3}\s|\d+[.)]\s)/;

function tidyBlankLines(text: string): string {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));

  const out: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (SECTION_HEADING.test(line) && out.length && out[out.length - 1] !== "") {
      out.push("");
    }
    out.push(line);
  }
  return out.join("\n").trim();
}

// 붙여넣기 원문을 저장 가능한 형태로 정리한다. 표는 마크다운 표로, 나머지는 빈 줄 정리.
export function normalizePastedText(text: string): string {
  return tidyBlankLines(normalizePastedTables(text));
}
