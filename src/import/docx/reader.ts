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
  // 1. Check cancellation before starting
  if (signal.aborted) {
    return {
      ok: false,
      error: {
        code: "IMPORT_CANCELLED",
        path: "file",
        message: "Tiến trình nhập DOCX đã bị hủy",
        recoverable: true,
      },
    };
  }

  // 2. Read file bytes
  let bytes: Uint8Array;
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

  // Check cancellation after reading file
  if (signal.aborted) {
    return {
      ok: false,
      error: {
        code: "IMPORT_CANCELLED",
        path: "file",
        message: "Tiến trình nhập DOCX đã bị hủy",
        recoverable: true,
      },
    };
  }

  // 3. Decompress ZIP archive with strict limits
  const limits = options?.limits ?? PROPOSED_ZIP_LIMITS;
  const zipResult = await readZip(bytes, limits, signal);
  if (!zipResult.ok) {
    return zipResult;
  }

  // Check cancellation after unzipping
  if (signal.aborted) {
    return {
      ok: false,
      error: {
        code: "IMPORT_CANCELLED",
        path: "file",
        message: "Tiến trình nhập DOCX đã bị hủy",
        recoverable: true,
      },
    };
  }

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

  // 6. Parse relationships (word/_rels/document.xml.rels)
  let relationships: RelationshipMap = new Map();
  const relsEntry = entryMap.get("word/_rels/document.xml.rels");
  if (relsEntry) {
    const relsXml = decodeUtf8(relsEntry.bytes);
    const relsResult = parseRelationships(relsXml, xmlParser);
    if (!relsResult.ok) {
      return relsResult;
    }
    relationships = relsResult.value;
  }

  // 7. Parse numbering definitions (word/numbering.xml)
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

  // 8. Validate styles if present (word/styles.xml)
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

  // 9. Parse main document XML (word/document.xml)
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

  // 10. Heuristic semantic segmentation
  const drafts = segmentDocument(parsedDoc, sourceId);

  // 11. Assemble ImportJob in 'preview' state
  const job: DocxImportJob = {
    jobId: `job-${idGen()}`,
    sourceId,
    format: "docx",
    state: "preview",
    blocks: parsedDoc.blocks,
    drafts,
    flags: parsedDoc.flags,
    assets: parsedDoc.assets,
  };

  return {
    ok: true,
    value: job,
  };
}
