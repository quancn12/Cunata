/**
 * Document body parser for word/document.xml.
 * Conforms to docs/contracts/WEB-contract.md §8:
 * "Preserve paragraphs/runs/styles/numbering/table spans/images/alt/OMML source"
 */

import type {
  Block,
  Cell,
  Asset,
  Result,
  XmlParserPort,
} from "./types.ts";
import {
  checkXmlSecurity,
  checkParserError,
  getChildren,
  getAttr,
  findElementsByTagName,
} from "./xml-parser.ts";
import type { XmlElement } from "./types.ts";
import { convertOmmlToLatex } from "./omml.ts";
import type { RelationshipMap } from "./rels.ts";
import type { NumberingResolver } from "./numbering.ts";
import type { ZipEntry } from "../zip/index.ts";

export interface ParsedRun {
  readonly text: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
}

export interface ParsedParagraph {
  readonly index: number;
  readonly text: string;
  readonly rawText: string;
  readonly prefix?: string;
  readonly styleId?: string;
  readonly runs: readonly ParsedRun[];
  readonly blocks: readonly Block[];
  readonly flags: readonly string[];
}

export interface ParsedDocument {
  readonly blocks: readonly Block[];
  readonly paragraphs: readonly ParsedParagraph[];
  readonly assets: readonly Asset[];
  readonly flags: readonly string[];
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  const CHUNK_SIZE = 8192;
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

function getMimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "emf":
      return "image/x-emf";
    case "wmf":
      return "image/x-wmf";
    default:
      return "application/octet-stream";
  }
}

/**
 * Parses word/document.xml and extracts paragraphs, runs, tables, images, and math.
 */
export function parseDocumentXml(
  xmlString: string,
  xmlParser: XmlParserPort,
  relationships: RelationshipMap,
  numberingResolver: NumberingResolver | null,
  zipEntries: ReadonlyMap<string, ZipEntry>,
  idGenerator: () => string,
): Result<ParsedDocument> {
  const securityCheck = checkXmlSecurity(xmlString, "word/document.xml");
  if (!securityCheck.ok) {
    return securityCheck;
  }

  let doc;
  try {
    doc = xmlParser.parseFromString(xmlString, "application/xml");
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "XML_INVALID",
        path: "word/document.xml",
        message: `Lỗi phân tích XML document: ${String(err)}`,
        recoverable: false,
      },
    };
  }

  const parserCheck = checkParserError(doc, "word/document.xml");
  if (!parserCheck.ok) {
    return parserCheck;
  }

  const bodyElements = findElementsByTagName(doc, "body");
  const body = bodyElements[0];
  if (!body) {
    return {
      ok: false,
      error: {
        code: "DOCX_UNSUPPORTED",
        path: "word/document.xml",
        message: "Không tìm thấy phần tử <w:body> trong word/document.xml",
        recoverable: false,
      },
    };
  }

  const documentBlocks: Block[] = [];
  const parsedParagraphs: ParsedParagraph[] = [];
  const extractedAssets: Asset[] = [];
  const documentFlags: string[] = [];

  let paragraphCounter = 0;

  // Process children of <w:body>
  const bodyChildren = getChildren(body);

  for (const child of bodyChildren) {
    const local = (child.localName || child.tagName).replace(/^w:/, "");

    if (local === "p") {
      const pResult = parseParagraph(
        child,
        paragraphCounter++,
        relationships,
        numberingResolver,
        zipEntries,
        extractedAssets,
        documentFlags,
        idGenerator,
      );
      parsedParagraphs.push(pResult);
      for (const b of pResult.blocks) {
        documentBlocks.push(b);
      }
    } else if (local === "tbl") {
      const tblBlock = parseTable(
        child,
        relationships,
        numberingResolver,
        zipEntries,
        extractedAssets,
        documentFlags,
        idGenerator,
      );
      documentBlocks.push(tblBlock);
    }
  }

  return {
    ok: true,
    value: {
      blocks: documentBlocks,
      paragraphs: parsedParagraphs,
      assets: extractedAssets,
      flags: documentFlags,
    },
  };
}

/**
 * Parses a paragraph (<w:p>).
 */
function parseParagraph(
  pElem: XmlElement | Element,
  index: number,
  relationships: RelationshipMap,
  numberingResolver: NumberingResolver | null,
  zipEntries: ReadonlyMap<string, ZipEntry>,
  extractedAssets: Asset[],
  documentFlags: string[],
  idGenerator: () => string,
): ParsedParagraph {
  const pFlags: string[] = [];
  let prefix: string | undefined;
  let styleId: string | undefined;

  // Extract pPr
  const pPr = getChildren(pElem, "pPr")[0];
  if (pPr) {
    // Style ID
    const pStyle = getChildren(pPr, "pStyle")[0];
    if (pStyle) {
      styleId = getAttr(pStyle, "w:val") ?? getAttr(pStyle, "val") ?? undefined;
    }

    // Numbering
    const numPr = getChildren(pPr, "numPr")[0];
    if (numPr && numberingResolver) {
      const ilvlElem = getChildren(numPr, "ilvl")[0];
      const numIdElem = getChildren(numPr, "numId")[0];
      const ilvlStr = ilvlElem ? (getAttr(ilvlElem, "w:val") ?? getAttr(ilvlElem, "val") ?? "0") : "0";
      const numIdStr = numIdElem ? (getAttr(numIdElem, "w:val") ?? getAttr(numIdElem, "val")) : null;

      if (numIdStr) {
        const ilvl = parseInt(ilvlStr, 10) || 0;
        const resolved = numberingResolver.resolvePrefix(numIdStr, ilvl);
        if (resolved) {
          prefix = resolved;
        }
      }
    }
  }

  const runs: ParsedRun[] = [];
  const blocks: Block[] = [];
  let paragraphText = prefix ? `${prefix} ` : "";

  const pChildren = getChildren(pElem);

  for (const child of pChildren) {
    const local = (child.localName || child.tagName).replace(/^[wm]:/, "");

    if (local === "r") {
      // Text run
      const rResult = parseRun(
        child,
        relationships,
        zipEntries,
        extractedAssets,
        documentFlags,
        idGenerator,
      );
      if (rResult.text) {
        runs.push({
          text: rResult.text,
          bold: rResult.bold,
          italic: rResult.italic,
          underline: rResult.underline,
        });
        paragraphText += rResult.text;
      }
      for (const imgBlock of rResult.imageBlocks) {
        blocks.push(imgBlock);
      }
    } else if (local === "oMath" || local === "oMathPara") {
      // Math formula
      const ommlResult = convertOmmlToLatex(child);
      if (ommlResult.converted !== null) {
        blocks.push({
          type: "math",
          source: ommlResult.converted,
          format: "latex",
          verified: true,
        });
        paragraphText += ` $${ommlResult.converted}$ `;
      } else {
        blocks.push({
          type: "math",
          source: ommlResult.rawOmml,
          format: "omml",
          verified: false,
        });
        pFlags.push("UNSUPPORTED_OMML");
        if (!documentFlags.includes("UNSUPPORTED_OMML")) {
          documentFlags.push("UNSUPPORTED_OMML");
        }
        paragraphText += " [Công thức OMML] ";
      }
    }
  }

  // If there's text content, add text block at beginning
  const trimmed = paragraphText.trim().normalize("NFC");
  if (trimmed.length > 0) {
    blocks.unshift({
      type: "text",
      text: trimmed,
    });
  }

  return {
    index,
    text: trimmed,
    rawText: paragraphText,
    prefix,
    styleId,
    runs,
    blocks,
    flags: pFlags,
  };
}

interface RunParseResult {
  readonly text: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly imageBlocks: readonly Block[];
}

/**
 * Parses a run (<w:r>).
 */
function parseRun(
  rElem: XmlElement | Element,
  relationships: RelationshipMap,
  zipEntries: ReadonlyMap<string, ZipEntry>,
  extractedAssets: Asset[],
  documentFlags: string[],
  idGenerator: () => string,
): RunParseResult {
  let bold = false;
  let italic = false;
  let underline = false;

  const rPr = getChildren(rElem, "rPr")[0];
  if (rPr) {
    bold = getChildren(rPr, "b").length > 0;
    italic = getChildren(rPr, "i").length > 0;
    underline = getChildren(rPr, "u").length > 0;
  }

  let text = "";
  const imageBlocks: Block[] = [];

  const rChildren = getChildren(rElem);
  for (const child of rChildren) {
    const local = (child.localName || child.tagName).replace(/^[wv]:/, "");

    if (local === "t") {
      text += child.textContent || "";
    } else if (local === "br") {
      text += "\n";
    } else if (local === "tab") {
      text += "\t";
    } else if (local === "drawing") {
      // DrawingML image
      const img = extractDrawingImage(
        child,
        relationships,
        zipEntries,
        extractedAssets,
        documentFlags,
        idGenerator,
      );
      if (img) imageBlocks.push(img);
    } else if (local === "object") {
      // Embedded OLE object / MathType fallback preview image
      const img = extractObjectImage(
        child,
        relationships,
        zipEntries,
        extractedAssets,
        documentFlags,
        idGenerator,
      );
      if (img) imageBlocks.push(img);
    }
  }

  return {
    text,
    bold,
    italic,
    underline,
    imageBlocks,
  };
}

/**
 * Extracts image from <w:drawing>.
 */
function extractDrawingImage(
  drawingElem: XmlElement | Element,
  relationships: RelationshipMap,
  zipEntries: ReadonlyMap<string, ZipEntry>,
  extractedAssets: Asset[],
  documentFlags: string[],
  idGenerator: () => string,
): Block | null {
  const blipElements = findElementsByTagName(drawingElem, "blip");
  if (blipElements.length === 0) return null;

  const blip = blipElements[0]!;
  const embedId = getAttr(blip, "r:embed") ?? getAttr(blip, "embed");
  if (!embedId) return null;

  const rel = relationships.get(embedId);
  if (!rel) return null;

  // Extract alt text from docPr
  const docPrElements = findElementsByTagName(drawingElem, "docPr");
  let altText = "Hình ảnh DOCX";
  if (docPrElements.length > 0) {
    const docPr = docPrElements[0]!;
    altText = getAttr(docPr, "descr") ?? getAttr(docPr, "title") ?? altText;
  }

  return createAssetFromZip(
    rel.target,
    altText,
    zipEntries,
    extractedAssets,
    documentFlags,
    idGenerator,
  );
}

/**
 * Extracts image from <w:object> (e.g. MathType legacy OLE preview).
 */
function extractObjectImage(
  objElem: XmlElement | Element,
  relationships: RelationshipMap,
  zipEntries: ReadonlyMap<string, ZipEntry>,
  extractedAssets: Asset[],
  documentFlags: string[],
  idGenerator: () => string,
): Block | null {
  const imageDataElements = findElementsByTagName(objElem, "imagedata");
  if (imageDataElements.length === 0) return null;

  const imgData = imageDataElements[0]!;
  const relId = getAttr(imgData, "r:id") ?? getAttr(imgData, "id");
  if (!relId) return null;

  const rel = relationships.get(relId);
  if (!rel) return null;

  if (!documentFlags.includes("FALLBACK_MATHTYPE_IMAGE")) {
    documentFlags.push("FALLBACK_MATHTYPE_IMAGE");
  }

  return createAssetFromZip(
    rel.target,
    "Công thức MathType (Ảnh xem trước)",
    zipEntries,
    extractedAssets,
    documentFlags,
    idGenerator,
  );
}

function createAssetFromZip(
  targetPath: string,
  alt: string,
  zipEntries: ReadonlyMap<string, ZipEntry>,
  extractedAssets: Asset[],
  documentFlags: string[],
  idGenerator: () => string,
): Block | null {
  const entry = zipEntries.get(targetPath);
  if (!entry) return null;

  const mime = getMimeFromPath(targetPath);
  const isUnsupportedVector = mime === "image/x-emf" || mime === "image/x-wmf";

  if (isUnsupportedVector && !documentFlags.includes("DOCX_UNSUPPORTED_VECTOR_IMAGE")) {
    documentFlags.push("DOCX_UNSUPPORTED_VECTOR_IMAGE");
  }

  const base64 = uint8ArrayToBase64(entry.bytes);
  const assetId = `asset-${idGenerator()}`;

  const asset: Asset = {
    assetId,
    mime,
    data: `data:${mime};base64,${base64}`,
    alt,
  };
  extractedAssets.push(asset);

  return {
    type: "image",
    assetId,
    alt,
  };
}

/**
 * Parses a table (<w:tbl>) with gridSpan and vMerge calculations.
 */
function parseTable(
  tblElem: XmlElement | Element,
  relationships: RelationshipMap,
  numberingResolver: NumberingResolver | null,
  zipEntries: ReadonlyMap<string, ZipEntry>,
  extractedAssets: Asset[],
  documentFlags: string[],
  idGenerator: () => string,
): Block {
  const trElements = getChildren(tblElem, "tr");
  const rawRows: {
    cells: {
      blocks: Block[];
      colSpan: number;
      vMerge: "restart" | "continue" | "none";
    }[];
  }[] = [];

  for (const tr of trElements) {
    const tcElements = getChildren(tr, "tc");
    const rowCells: {
      blocks: Block[];
      colSpan: number;
      vMerge: "restart" | "continue" | "none";
    }[] = [];

    for (const tc of tcElements) {
      let colSpan = 1;
      let vMerge: "restart" | "continue" | "none" = "none";

      const tcPr = getChildren(tc, "tcPr")[0];
      if (tcPr) {
        // Colspan
        const gridSpan = getChildren(tcPr, "gridSpan")[0];
        if (gridSpan) {
          const val = getAttr(gridSpan, "w:val") ?? getAttr(gridSpan, "val");
          if (val) {
            colSpan = Math.max(1, parseInt(val, 10) || 1);
          }
        }

        // Rowspan
        const vMergeElem = getChildren(tcPr, "vMerge")[0];
        if (vMergeElem) {
          const val = getAttr(vMergeElem, "w:val") ?? getAttr(vMergeElem, "val");
          vMerge = val === "restart" ? "restart" : "continue";
        }
      }

      // Paragraphs inside cell
      const cellBlocks: Block[] = [];
      const pElements = getChildren(tc, "p");
      for (const p of pElements) {
        const pParsed = parseParagraph(
          p,
          0,
          relationships,
          numberingResolver,
          zipEntries,
          extractedAssets,
          documentFlags,
          idGenerator,
        );
        for (const b of pParsed.blocks) {
          cellBlocks.push(b);
        }
      }

      rowCells.push({
        blocks: cellBlocks,
        colSpan,
        vMerge,
      });
    }

    rawRows.push({ cells: rowCells });
  }

  // Calculate rowspan matrix
  // Matrix tracking active vertical merges: colIndex -> { cellRef, startRow }
  const activeMerges = new Map<number, { cell: Cell; rowSpan: number }>();
  const finalRows: (readonly Cell[])[] = [];

  for (let r = 0; r < rawRows.length; r++) {
    const rawRow = rawRows[r]!;
    const rowCells: Cell[] = [];
    let currentPhysicalCol = 0;

    for (let c = 0; c < rawRow.cells.length; c++) {
      const rawCell = rawRow.cells[c]!;

      // Skip physical columns already occupied by vertical merges
      while (activeMerges.has(currentPhysicalCol)) {
        currentPhysicalCol++;
      }

      const assignedCol = currentPhysicalCol;

      if (rawCell.vMerge === "restart") {
        const cellObj: Cell = {
          blocks: rawCell.blocks,
          colSpan: rawCell.colSpan,
          rowSpan: 1, // Will be updated as continuation rows appear
        };
        activeMerges.set(assignedCol, { cell: cellObj, rowSpan: 1 });
        rowCells.push(cellObj);
      } else if (rawCell.vMerge === "continue") {
        const mergeState = activeMerges.get(assignedCol);
        if (mergeState) {
          mergeState.rowSpan += 1;
          (mergeState.cell as { rowSpan: number }).rowSpan = mergeState.rowSpan;
        } else {
          // Fallback if no restart row preceded
          rowCells.push({
            blocks: rawCell.blocks,
            colSpan: rawCell.colSpan,
            rowSpan: 1,
          });
        }
      } else {
        // No vMerge
        activeMerges.delete(assignedCol);
        rowCells.push({
          blocks: rawCell.blocks,
          colSpan: rawCell.colSpan,
          rowSpan: 1,
        });
      }

      currentPhysicalCol += rawCell.colSpan;
    }

    finalRows.push(rowCells);
  }

  return {
    type: "table",
    rows: finalRows,
  };
}
