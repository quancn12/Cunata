/// <reference lib="dom" />

export interface ParsedTable {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export type ContentSegment =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "table"; readonly table: ParsedTable };

function isSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("-")) return false;
  const stripped = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const parts = stripped.split("|");
  if (parts.length === 0) return false;
  return parts.every((p) => /^\s*:?-+:?\s*$/.test(p));
}

function parseRowCells(line: string): string[] {
  const trimmed = line.trim();
  const stripped = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return stripped.split("|").map((c) => c.trim());
}

/**
 * Parses markdown text into text segments and markdown tables.
 */
export function parseMarkdownSegments(content: string): readonly ContentSegment[] {
  if (!content || !content.includes("|")) {
    return [{ type: "text", text: content }];
  }

  const lines = content.split("\n");
  const segments: ContentSegment[] = [];
  let textBuffer: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (line.includes("|") && i + 1 < lines.length && isSeparatorLine(lines[i + 1]!)) {
      // Found potential markdown table
      if (textBuffer.length > 0) {
        segments.push({ type: "text", text: textBuffer.join("\n") });
        textBuffer = [];
      }

      const headers = parseRowCells(line);
      i += 2; // skip header and separator
      const tableRows: string[][] = [];

      while (i < lines.length) {
        const rowLine = lines[i]!;
        if (!rowLine.trim() || !rowLine.includes("|")) {
          break;
        }
        tableRows.push(parseRowCells(rowLine));
        i++;
      }

      segments.push({
        type: "table",
        table: {
          headers: Object.freeze(headers),
          rows: Object.freeze(tableRows.map((r) => Object.freeze(r))),
        },
      });
    } else {
      textBuffer.push(line);
      i++;
    }
  }

  if (textBuffer.length > 0) {
    segments.push({ type: "text", text: textBuffer.join("\n") });
  }

  return Object.freeze(segments);
}
