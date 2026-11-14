/**
 * Numbering definition parser and resolution state machine.
 * Conforms to docs/contracts/WEB-contract.md §8:
 * "Preserve paragraphs/runs/styles/numbering"
 */

import type { Result, XmlParserPort } from "./types.ts";
import {
  checkXmlSecurity,
  checkParserError,
  findElementsByTagName,
  getChildren,
  getAttr,
} from "./xml-parser.ts";

export interface ListLevel {
  readonly ilvl: number;
  readonly start: number;
  readonly numFmt: string; // 'decimal', 'lowerLetter', 'upperLetter', 'bullet', etc.
  readonly lvlText: string; // e.g. '%1.', '%1)', 'a)'
}

export interface AbstractNum {
  readonly abstractNumId: string;
  readonly levels: ReadonlyMap<number, ListLevel>;
}

export interface NumberingResolver {
  resolvePrefix(numId: string, ilvl: number): string | null;
}

function formatCounter(val: number, numFmt: string): string {
  switch (numFmt) {
    case "decimal":
      return String(val);
    case "lowerLetter": {
      const code = "a".charCodeAt(0) + Math.max(0, val - 1);
      return String.fromCharCode(code);
    }
    case "upperLetter": {
      const code = "A".charCodeAt(0) + Math.max(0, val - 1);
      return String.fromCharCode(code);
    }
    case "bullet":
      return "•";
    default:
      return String(val);
  }
}

class NumberingResolverImpl implements NumberingResolver {
  private readonly numToAbstract: ReadonlyMap<string, string>;
  private readonly abstractNums: ReadonlyMap<string, AbstractNum>;
  private readonly counters = new Map<string, number>();

  constructor(
    numToAbstract: Map<string, string>,
    abstractNums: Map<string, AbstractNum>,
  ) {
    this.numToAbstract = numToAbstract;
    this.abstractNums = abstractNums;
  }

  resolvePrefix(numId: string, ilvl: number): string | null {
    const abstractId = this.numToAbstract.get(numId);
    if (!abstractId) return null;

    const abstractNum = this.abstractNums.get(abstractId);
    if (!abstractNum) return null;

    const level = abstractNum.levels.get(ilvl);
    if (!level) return null;

    const counterKey = `${numId}:${ilvl}`;
    let current = this.counters.get(counterKey);
    if (current === undefined) {
      current = level.start;
    } else {
      current += 1;
    }
    this.counters.set(counterKey, current);

    const formatted = formatCounter(current, level.numFmt);
    const prefix = level.lvlText.replace(`%${ilvl + 1}`, formatted);
    return prefix;
  }
}

/**
 * Parses word/numbering.xml into a NumberingResolver.
 */
export function parseNumbering(
  xmlString: string,
  xmlParser: XmlParserPort,
): Result<NumberingResolver> {
  const securityCheck = checkXmlSecurity(xmlString, "word/numbering.xml");
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
        path: "word/numbering.xml",
        message: `Lỗi phân tích XML numbering: ${String(err)}`,
        recoverable: false,
      },
    };
  }

  const parserCheck = checkParserError(doc, "word/numbering.xml");
  if (!parserCheck.ok) {
    return parserCheck;
  }

  const abstractMap = new Map<string, AbstractNum>();
  const abstractElements = findElementsByTagName(doc, "abstractNum");

  for (const absElem of abstractElements) {
    const abstractNumId = getAttr(absElem, "w:abstractNumId") ?? getAttr(absElem, "abstractNumId");
    if (!abstractNumId) continue;

    const levelMap = new Map<number, ListLevel>();
    const lvlElements = getChildren(absElem, "lvl");

    for (const lvl of lvlElements) {
      const ilvlStr = getAttr(lvl, "w:ilvl") ?? getAttr(lvl, "ilvl") ?? "0";
      const ilvl = parseInt(ilvlStr, 10);

      const startElem = getChildren(lvl, "start")[0];
      const startStr = startElem ? (getAttr(startElem, "w:val") ?? getAttr(startElem, "val") ?? "1") : "1";
      const start = parseInt(startStr, 10) || 1;

      const numFmtElem = getChildren(lvl, "numFmt")[0];
      const numFmt = numFmtElem ? (getAttr(numFmtElem, "w:val") ?? getAttr(numFmtElem, "val") ?? "decimal") : "decimal";

      const lvlTextElem = getChildren(lvl, "lvlText")[0];
      const lvlText = lvlTextElem ? (getAttr(lvlTextElem, "w:val") ?? getAttr(lvlTextElem, "val") ?? "%1.") : "%1.";

      levelMap.set(ilvl, {
        ilvl,
        start,
        numFmt,
        lvlText,
      });
    }

    abstractMap.set(abstractNumId, {
      abstractNumId,
      levels: levelMap,
    });
  }

  const numToAbstract = new Map<string, string>();
  const numElements = findElementsByTagName(doc, "num");

  for (const numElem of numElements) {
    const numId = getAttr(numElem, "w:numId") ?? getAttr(numElem, "numId");
    const absRefElem = getChildren(numElem, "abstractNumId")[0];
    const abstractNumId = absRefElem ? (getAttr(absRefElem, "w:val") ?? getAttr(absRefElem, "val")) : null;

    if (numId && abstractNumId) {
      numToAbstract.set(numId, abstractNumId);
    }
  }

  return {
    ok: true,
    value: new NumberingResolverImpl(numToAbstract, abstractMap),
  };
}
