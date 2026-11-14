/**
 * Public entrypoint for DOCX import module.
 * Conforms to docs/contracts/WEB-contract.md §4-§5, §8, §11.
 */

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
  XmlParserPort,
  XmlDocument,
  XmlElement,
  XmlNode,
  XmlTextNode,
  DocxImportOptions,
  DocxImportJob,
} from "./types.ts";

export {
  checkXmlSecurity,
  checkParserError,
  parseXmlSafe,
  getXmlParser,
} from "./xml-parser.ts";

export {
  convertOmmlToLatex,
  serializeXml,
} from "./omml.ts";

export {
  parseRelationships,
} from "./rels.ts";

export {
  parseNumbering,
} from "./numbering.ts";

export {
  parseDocumentXml,
} from "./document-parser.ts";

export {
  segmentDocument,
} from "./segmentation.ts";

export {
  importDocx,
} from "./reader.ts";
