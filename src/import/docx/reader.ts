/**
 * DOCX import pipeline orchestrator.
 * Conforms to docs/contracts/WEB-contract.md §4-§5, §8, §11:
 * "export function importDocx(file:File, signal:AbortSignal):Promise<Result<ImportJob>>;"
 * "Pipeline bắt buộc đọc -> parse -> IR -> preview/sửa -> xác nhận -> lưu/xuất"
 */

import type {
  ImportJob,
  Result,
  DocxImportOptions,
  DocxImportJob,
} from "./types.ts";
import { readZip, PROPOSED_ZIP_LIMITS } from "../zip/index.ts";
import type { ZipEntry } from "../zip/index.ts";
import { getXmlParser, checkXmlSecurity, checkParserError } from "./xml-parser.ts";
import { parseRelationships } from "./rels.ts";
import type { RelationshipMap } from "./rels.ts";
import { parseNumbering } from "./numbering.ts";
import type { NumberingResolver } from "./numbering.ts";
import { parseDocumentXml } from "./document-parser.ts";
import { segmentDocument } from "./segmentation.ts";

const utf8Decoder = new TextDecoder("utf-8");

function decodeUtf8(bytes: Uint8Array): string {
  return utf8Decoder.decode(bytes);
}

let globalIdCounter = 1;
function defaultIdGenerator(): string {
  return `${Date.now()}-${globalIdCounter++}`;
}

/**
 * Main DOCX import function.
 * Reads a DOCX package, parses OpenXML structure, OMML math, tables, images,
 * and extracts candidate questions into an unconfirmed preview ImportJob.
 */
export async function importDocx(
  file: File,
  signal: AbortSignal,
  options?: DocxImportOptions,
): Promise<Result<ImportJob>> {
  const timeoutMs = options?.timeoutMs;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const internalController = new AbortController();

  const onParentAbort = () => {
    internalController.abort();
  };

  if (signal.aborted) {
    internalController.abort();
  } else {
    signal.addEventListener("abort", onParentAbort, { once: true });
  }

  if (timeoutMs && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      internalController.abort();
    }, timeoutMs);
  }

  const checkCancelled = (path = "file"): Result<never> | null => {
    if (timedOut) {
      return {
        ok: false,
        error: {
          code: "IMPORT_CANCELLED",
          path: "timeout",
          message: `Thời gian phân tích tài liệu DOCX vượt quá giới hạn cho phép (${timeoutMs}ms)`,
          recoverable: true,
        },
      };
    }
    if (signal.aborted || internalController.signal.aborted) {
      return {
        ok: false,
        error: {
          code: "IMPORT_CANCELLED",
          path,
          message: "Tiến trình nhập DOCX đã bị hủy",
          recoverable: true,
        },
      };
    }
    return null;
  };

  try {
    const earlyCancel = checkCancelled();
    if (earlyCancel) return earlyCancel;

    // 2. Read file bytes
    let bytes: Uint8Array = new Uint8Array(0);
    let readAttempts = 0;
    const maxReadAttempts = 5;
    while (readAttempts < maxReadAttempts) {
      readAttempts++;
      try {
        const arrayBuffer = await file.arrayBuffer();
        if (arrayBuffer.byteLength >= 22 || file.size < 22) {
          bytes = new Uint8Array(arrayBuffer);
          break;
        }
      } catch {
        // If file is temporarily locked or being written, retry after short delay
      }
      if (readAttempts < maxReadAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 50 * readAttempts));
      }
    }

    if (bytes.byteLength === 0 && file.size > 0) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        bytes = new Uint8Array(arrayBuffer);
      } catch (err) {
        return {
          ok: false,
          error: {
            code: "ZIP_INVALID",
            path: "file",
            message: `Không thể đọc dữ liệu từ tệp đầu vào: ${String(err)}`,
            recoverable: false,
          },
        };
      }
    }

    const postReadCancel = checkCancelled();
    if (postReadCancel) return postReadCancel;

    // 3. Decompress ZIP archive with strict limits
    const limits = options?.limits ?? PROPOSED_ZIP_LIMITS;
    let zipResult = await readZip(bytes, limits, internalController.signal);
    let zipRetries = 0;
    while (!zipResult.ok && file.size >= 22 && zipRetries < 5) {
      zipRetries++;
      await new Promise((resolve) => setTimeout(resolve, 50 * zipRetries));
      try {
        const retryBuf = await file.arrayBuffer();
        if (retryBuf.byteLength >= 22) {
          bytes = new Uint8Array(retryBuf);
          zipResult = await readZip(bytes, limits, internalController.signal);
        }
      } catch {
        // ignore retry error
      }
    }
    if (!zipResult.ok) {
      return zipResult;
    }

    const postZipCancel = checkCancelled();
    if (postZipCancel) return postZipCancel;

    const entries = zipResult.value;
    const entryMap = new Map<string, ZipEntry>();
    for (const entry of entries) {
      entryMap.set(entry.name, entry);
    }

    // 4. Verify valid DOCX package structure (must contain word/document.xml)
    const docEntry = entryMap.get("word/document.xml");
    if (!docEntry) {
      return {
        ok: false,
        error: {
          code: "DOCX_UNSUPPORTED",
          path: "word/document.xml",
          message: "Tệp không chứa 'word/document.xml' (không phải tài liệu Microsoft Word .docx hợp lệ)",
          recoverable: false,
        },
      };
    }

    // 5. Prepare XML parser and ID generator
    const xmlParser = getXmlParser(options?.xmlParser);
    const idGen = options?.id ?? defaultIdGenerator;
    const sourceId = file.name || "document.docx";

    // 6. Check top-level relationships (_rels/.rels) if present
    const rootRelsEntry = entryMap.get("_rels/.rels");
    if (rootRelsEntry) {
      const rootRelsXml = decodeUtf8(rootRelsEntry.bytes);
      const rootRelsResult = parseRelationships(rootRelsXml, xmlParser, "_rels/.rels");
      if (!rootRelsResult.ok) {
        return rootRelsResult;
      }
    }

    // 7. Parse relationships (word/_rels/document.xml.rels)
    let relationships: RelationshipMap = new Map();
    const relsEntry = entryMap.get("word/_rels/document.xml.rels");
    if (relsEntry) {
      const relsXml = decodeUtf8(relsEntry.bytes);
      const relsResult = parseRelationships(relsXml, xmlParser, "word/_rels/document.xml.rels");
      if (!relsResult.ok) {
        return relsResult;
      }
      relationships = relsResult.value;
    }

    // 8. Parse numbering definitions (word/numbering.xml)
    let numberingResolver: NumberingResolver | null = null;
    const numberingEntry = entryMap.get("word/numbering.xml");
    if (numberingEntry) {
      const numberingXml = decodeUtf8(numberingEntry.bytes);
      const numResult = parseNumbering(numberingXml, xmlParser);
      if (!numResult.ok) {
        return numResult;
      }
      numberingResolver = numResult.value;
    }

    // 9. Validate styles if present (word/styles.xml)
    const stylesEntry = entryMap.get("word/styles.xml");
    if (stylesEntry) {
      const stylesXml = decodeUtf8(stylesEntry.bytes);
      const stylesSec = checkXmlSecurity(stylesXml, "word/styles.xml");
      if (!stylesSec.ok) {
        return stylesSec;
      }
      try {
        const stylesDoc = xmlParser.parseFromString(stylesXml, "application/xml");
        const stylesErr = checkParserError(stylesDoc, "word/styles.xml");
        if (!stylesErr.ok) {
          return stylesErr;
        }
      } catch (err) {
        return {
          ok: false,
          error: {
            code: "XML_INVALID",
            path: "word/styles.xml",
            message: `Lỗi phân tích XML styles: ${String(err)}`,
            recoverable: false,
          },
        };
      }
    }

    const preParseCancel = checkCancelled();
    if (preParseCancel) return preParseCancel;

    // 10. Parse main document XML (word/document.xml)
    const docXml = decodeUtf8(docEntry.bytes);
    const parsedDocResult = parseDocumentXml(
      docXml,
      xmlParser,
      relationships,
      numberingResolver,
      entryMap,
      idGen,
    );
    if (!parsedDocResult.ok) {
      return parsedDocResult;
    }

    const parsedDoc = parsedDocResult.value;

    // 11. Check for macro entries (VBA project binary or macro content types)
    // Macros are strictly inert: never executed, no network fetch.
    let hasMacro = false;
    for (const name of entryMap.keys()) {
      if (/(?:^|\/)vbaProject\.bin$/i.test(name) || /(?:^|\/)vbaData\.xml$/i.test(name)) {
        hasMacro = true;
        break;
      }
    }
    const contentTypesEntry = entryMap.get("[Content_Types].xml");
    if (contentTypesEntry) {
      const ctXml = decodeUtf8(contentTypesEntry.bytes);
      if (/macroEnabled/i.test(ctXml)) {
        hasMacro = true;
      }
    }

    const finalFlags = [...parsedDoc.flags];
    const finalBlocks = [...parsedDoc.blocks];

    if (hasMacro) {
      if (!finalFlags.includes("DOCX_MACRO_IGNORED")) {
        finalFlags.push("DOCX_MACRO_IGNORED");
      }
      finalBlocks.unshift({
        type: "text",
        text: "[Cảnh báo bảo mật] Tệp DOCX chứa macro VBA. Macro đã bị vô hiệu hóa hoàn toàn, không thực thi.",
      });
    }

    const postParseCancel = checkCancelled();
    if (postParseCancel) return postParseCancel;

    // 12. Heuristic semantic segmentation
    const drafts = segmentDocument(parsedDoc, sourceId);

    // 13. Assemble ImportJob in 'preview' state
    const job: DocxImportJob = {
      jobId: `job-${idGen()}`,
      sourceId,
      format: "docx",
      state: "preview",
      blocks: finalBlocks,
      drafts,
      flags: finalFlags,
      assets: parsedDoc.assets,
    };

    return {
      ok: true,
      value: job,
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    signal.removeEventListener("abort", onParentAbort);
  }
}
