/**
 * Types and interfaces for DOCX import module.
 * Conforms to docs/contracts/WEB-contract.md §4-§5, §8, §11.
 */

import type {
  Block,
  Cell,
  Provenance,
  Asset,
  WebOption,
  WebStatement,
  WebQuestion,
  ImportJob,
  ImportDraft,
  Result,
  WebError,
} from "../../schema/types.ts";
import type { ZipLimits } from "../zip/index.ts";

export type {
  Block,
  Cell,
  Provenance,
  Asset,
  WebOption,
  WebStatement,
  WebQuestion,
  ImportJob,
  ImportDraft,
  Result,
  WebError,
};

/**
 * Universal minimal XML DOM Node interface for browser DOMParser and Node test environments.
 */
export interface XmlNode {
  readonly nodeType: number; // 1: Element, 3: Text
  readonly nodeName: string;
  readonly textContent: string;
  readonly parentNode: XmlNode | null;
}

export interface XmlElement extends XmlNode {
  readonly nodeType: 1;
  readonly tagName: string;
  readonly localName: string;
  readonly childNodes: readonly XmlNode[];
  readonly children: readonly XmlElement[];
  getAttribute(name: string): string | null;
  getElementsByTagName(name: string): readonly XmlElement[];
}

export interface XmlTextNode extends XmlNode {
  readonly nodeType: 3;
  readonly nodeValue: string;
}

export interface XmlDocument {
  readonly documentElement: XmlElement | null;
  getElementsByTagName(name: string): readonly XmlElement[];
}

/**
 * Injectable XML Parser port for browser and Node environments.
 */
export interface XmlParserPort {
  parseFromString(
    xmlString: string,
    mimeType?: "application/xml" | "text/xml",
  ): XmlDocument | Document;
}

/**
 * Options for importDocx.
 */
export interface DocxImportOptions {
  readonly xmlParser?: XmlParserPort;
  readonly limits?: ZipLimits;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  readonly id?: () => string;
}

/**
 * Extended ImportJob preserving extracted assets in memory.
 */
export interface DocxImportJob extends ImportJob {
  readonly assets: readonly Asset[];
}
