/**
 * Relationships parser for DOCX package.
 * Conforms to docs/contracts/WEB-contract.md §4.1, §8, §11:
 * "reject DOCTYPE/entities/parsererror/external relations."
 * "Chặn javascript:, external relationships/fetch tự động, file path traversal."
 */
import { checkXmlSecurity, checkParserError, findElementsByTagName, getAttr, } from "./xml-parser.js";
/**
 * Normalizes a relationship target path relative to the 'word/' directory.
 */
function normalizeDocxTargetPath(target) {
    // Strip leading slash if any
    const clean = target.replace(/^\/+/, "");
    if (clean.startsWith("word/")) {
        return clean;
    }
    return `word/${clean}`;
}
/**
 * Parses word/_rels/document.xml.rels and returns validated internal relationships.
 * Rejects external relationships and path traversal attempts.
 */
export function parseRelationships(xmlString, xmlParser, path = "word/_rels/document.xml.rels") {
    const securityCheck = checkXmlSecurity(xmlString, path);
    if (!securityCheck.ok) {
        return securityCheck;
    }
    let doc;
    try {
        doc = xmlParser.parseFromString(xmlString, "application/xml");
    }
    catch (err) {
        return {
            ok: false,
            error: {
                code: "XML_INVALID",
                path,
                message: `Lỗi phân tích XML relationships: ${String(err)}`,
                recoverable: false,
            },
        };
    }
    const parserCheck = checkParserError(doc, path);
    if (!parserCheck.ok) {
        return parserCheck;
    }
    const relElements = findElementsByTagName(doc, "Relationship");
    const map = new Map();
    for (const rel of relElements) {
        const id = getAttr(rel, "Id");
        const type = getAttr(rel, "Type") ?? "";
        const target = getAttr(rel, "Target") ?? "";
        const targetMode = getAttr(rel, "TargetMode");
        if (!id) {
            continue;
        }
        // Reject external relations
        if (targetMode && targetMode.toLowerCase() === "external") {
            return {
                ok: false,
                error: {
                    code: "XML_INVALID",
                    path,
                    message: `Tài liệu chứa quan hệ ngoại vi không được phép (TargetMode='External', Id='${id}')`,
                    recoverable: false,
                },
            };
        }
        // Reject external URLs or protocols
        const trimmedTarget = target.trim();
        if (/^(?:https?:|ftp:|file:|\/\/|javascript:|data:)/i.test(trimmedTarget)) {
            return {
                ok: false,
                error: {
                    code: "XML_INVALID",
                    path,
                    message: `Target quan hệ chứa giao thức ngoại vi hoặc không an toàn: '${trimmedTarget}'`,
                    recoverable: false,
                },
            };
        }
        // Reject path traversal escaping word/
        const normalizedParts = trimmedTarget.split(/[\\/]/);
        if (normalizedParts.includes("..")) {
            return {
                ok: false,
                error: {
                    code: "XML_INVALID",
                    path,
                    message: `Target quan hệ chứa đường dẫn vượt giới hạn (path traversal): '${trimmedTarget}'`,
                    recoverable: false,
                },
            };
        }
        const normalizedTarget = normalizeDocxTargetPath(trimmedTarget);
        map.set(id, {
            id,
            type,
            target: normalizedTarget,
        });
    }
    return { ok: true, value: map };
}
