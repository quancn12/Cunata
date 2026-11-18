/**
 * Public entrypoint for DOCX import module.
 * Conforms to docs/contracts/WEB-contract.md §4-§5, §8, §11.
 */
export { checkXmlSecurity, checkParserError, parseXmlSafe, getXmlParser, } from "./xml-parser.js";
export { convertOmmlToLatex, serializeXml, } from "./omml.js";
export { parseRelationships, } from "./rels.js";
export { parseNumbering, } from "./numbering.js";
export { parseDocumentXml, } from "./document-parser.js";
export { segmentDocument, } from "./segmentation.js";
export { importDocx, } from "./reader.js";
