export type NewsAttachment = {
  url: string;
  filename: string;
};

export type ParsedNewsContent = {
  body: string;
  linkUrl: string | null;
  attachments: NewsAttachment[];
};

const RESOURCE_MARKDOWN_LINE_REGEX = /^(?:[🔗📎]\s*)?\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*$/i;
const RESOURCE_URL_LINE_REGEX = /^(?:[🔗📎]\s*)?(https?:\/\/\S+)\s*$/i;

const FILE_EXTENSIONS = new Set([
  "pdf", "zip", "hwp", "hwpx", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "jpg", "jpeg", "png", "gif", "webp", "heic", "txt", "csv",
]);

export function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function inferFilename(url: string): string {
  try {
    const parsed = new URL(url);
    const candidate = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    return candidate || "첨부파일";
  } catch {
    return "첨부파일";
  }
}

function isLikelyFileResource(line: string, label: string, href: string): boolean {
  if (line.includes("📎")) return true;

  try {
    const parsed = new URL(href);
    const ext = parsed.pathname.split(".").pop()?.toLowerCase() ?? "";
    if (FILE_EXTENSIONS.has(ext)) return true;
    if (parsed.pathname.toLowerCase().includes("/attachments/")) return true;
  } catch {
    return false;
  }

  const labelExt = label.split(".").pop()?.toLowerCase() ?? "";
  return FILE_EXTENSIONS.has(labelExt);
}

export function parseNewsContent(content: string): ParsedNewsContent {
  const bodyLines: string[] = [];
  const links: string[] = [];
  const attachments: NewsAttachment[] = [];
  const seenLinks = new Set<string>();
  const seenFiles = new Set<string>();

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      bodyLines.push(line);
      continue;
    }

    const markdownMatch = trimmed.match(RESOURCE_MARKDOWN_LINE_REGEX);
    if (markdownMatch) {
      const label = markdownMatch[1]?.trim() || "링크 열기";
      const href = normalizeHttpUrl(markdownMatch[2]);
      if (!href) {
        bodyLines.push(line);
        continue;
      }

      if (isLikelyFileResource(trimmed, label, href)) {
        if (!seenFiles.has(href)) {
          seenFiles.add(href);
          attachments.push({
            url: href,
            filename: label || inferFilename(href),
          });
        }
      } else if (!seenLinks.has(href)) {
        seenLinks.add(href);
        links.push(href);
      }
      continue;
    }

    const rawUrlMatch = trimmed.match(RESOURCE_URL_LINE_REGEX);
    if (rawUrlMatch?.[1]) {
      const href = normalizeHttpUrl(rawUrlMatch[1]);
      if (!href) {
        bodyLines.push(line);
        continue;
      }

      if (isLikelyFileResource(trimmed, inferFilename(href), href)) {
        if (!seenFiles.has(href)) {
          seenFiles.add(href);
          attachments.push({ url: href, filename: inferFilename(href) });
        }
      } else if (!seenLinks.has(href)) {
        seenLinks.add(href);
        links.push(href);
      }
      continue;
    }

    bodyLines.push(line);
  }

  return {
    body: bodyLines.join("\n").trim(),
    linkUrl: links[0] ?? null,
    attachments,
  };
}

export function buildNewsContent(options: {
  body: string;
  linkUrl?: string | null;
  attachments?: NewsAttachment[];
}): string {
  const body = options.body.trim();
  const parsedBodyResources = parseNewsContent(body);
  let normalizedBody = parsedBodyResources.body;

  const dedupLinks = new Set<string>();
  const dedupFiles = new Set<string>();
  const blocks: string[] = [];

  const normalizedLink = normalizeHttpUrl(options.linkUrl ?? null);
  if (normalizedLink && !dedupLinks.has(normalizedLink)) {
    dedupLinks.add(normalizedLink);
    blocks.push(`🔗 [관련 링크](${normalizedLink})`);
  }

  const attachments = Array.isArray(options.attachments) ? options.attachments : [];
  for (const attachment of attachments) {
    const url = normalizeHttpUrl(attachment?.url);
    if (!url || dedupFiles.has(url)) continue;
    dedupFiles.add(url);
    const filename = typeof attachment?.filename === "string" ? attachment.filename.trim() : "";
    blocks.push(`📎 [${filename || inferFilename(url)}](${url})`);
  }

  // Keep links/files already typed in body (legacy / manual input).
  if (parsedBodyResources.linkUrl && !dedupLinks.has(parsedBodyResources.linkUrl)) {
    dedupLinks.add(parsedBodyResources.linkUrl);
    blocks.push(`🔗 [관련 링크](${parsedBodyResources.linkUrl})`);
  }
  for (const attachment of parsedBodyResources.attachments) {
    const url = normalizeHttpUrl(attachment.url);
    if (!url || dedupFiles.has(url)) continue;
    dedupFiles.add(url);
    blocks.push(`📎 [${attachment.filename || inferFilename(url)}](${url})`);
  }

  if (!normalizedBody && blocks.length === 0) return "";
  if (blocks.length === 0) return normalizedBody;
  if (!normalizedBody) return blocks.join("\n");

  normalizedBody += `\n\n${blocks.join("\n")}`;
  return normalizedBody;
}

export function stripNewsResources(content: string): string {
  return parseNewsContent(content).body;
}
