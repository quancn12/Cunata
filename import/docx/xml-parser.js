/**
 * Pure TypeScript XML DOM Parser & Security Validator.
 * Conforms to docs/contracts/WEB-contract.md §8, §11.
 * Provides injectable XML port for Node tests and wraps native browser DOMParser.
 */
/**
 * Validates XML text for security constraints:
 * Rejects DOCTYPE and ENTITY declarations to prevent XXE and expansion attacks.
 */
export function checkXmlSecurity(xmlString, path) {
    // Reject DOCTYPE declarations (case-insensitive)
    if (/<!DOCTYPE/i.test(xmlString)) {
        return {
            ok: false,
            error: {
                code: "XML_INVALID",
                path,
                message: "Khai báo DOCTYPE không được phép trong tài liệu XML",
                recoverable: false,
            },
        };
    }
    // Reject ENTITY declarations (case-insensitive)
    if (/<!ENTITY/i.test(xmlString)) {
        return {
            ok: false,
            error: {
                code: "XML_INVALID",
                path,
                message: "Khai báo ENTITY không được phép trong tài liệu XML",
                recoverable: false,
            },
        };
    }
    return { ok: true, value: undefined };
}
/**
 * Checks parsed document for <parsererror> elements.
 */
export function checkParserError(doc, path) {
    const root = doc.documentElement;
    if (!root) {
        return {
            ok: false,
            error: {
                code: "XML_INVALID",
                path,
                message: "Tài liệu XML rỗng hoặc không có phần tử gốc",
                recoverable: false,
            },
        };
    }
    const rootName = (root.localName || root.tagName || "").toLowerCase();
    if (rootName === "parsererror") {
        const errorText = root.textContent || "Lỗi cú pháp phân tích XML";
        return {
            ok: false,
            error: {
                code: "XML_INVALID",
                path,
                message: `Lỗi phân tích cú pháp XML: ${errorText.slice(0, 150)}`,
                recoverable: false,
            },
        };
    }
    const parserErrors = doc.getElementsByTagName("parsererror");
    if (parserErrors.length > 0) {
        const errorText = parserErrors[0]?.textContent || "Lỗi cú pháp phân tích XML";
        return {
            ok: false,
            error: {
                code: "XML_INVALID",
                path,
                message: `Lỗi phân tích cú pháp XML: ${errorText.slice(0, 150)}`,
                recoverable: false,
            },
        };
    }
    return { ok: true, value: undefined };
}
// Concrete implementation of XmlElement
class XmlElementImpl {
    nodeType = 1;
    tagName;
    localName;
    attributes;
    childNodes = [];
    parentNode = null;
    constructor(tagName, attributes = new Map()) {
        this.tagName = tagName;
        const colonIdx = tagName.indexOf(":");
        this.localName = colonIdx >= 0 ? tagName.slice(colonIdx + 1) : tagName;
        this.attributes = attributes;
    }
    get nodeName() {
        return this.tagName;
    }
    get children() {
        return this.childNodes.filter((n) => n.nodeType === 1);
    }
    get textContent() {
        let text = "";
        for (const child of this.childNodes) {
            text += child.textContent;
        }
        return text;
    }
    getAttribute(name) {
        if (this.attributes.has(name)) {
            return this.attributes.get(name);
        }
        // Check by local attribute name if namespace prefix differs
        const colonIdx = name.indexOf(":");
        const local = colonIdx >= 0 ? name.slice(colonIdx + 1) : name;
        for (const [k, v] of this.attributes) {
            const kColon = k.indexOf(":");
            const kLocal = kColon >= 0 ? k.slice(kColon + 1) : k;
            if (kLocal === local) {
                return v;
            }
        }
        return null;
    }
    getElementsByTagName(name) {
        const results = [];
        const colonIdx = name.indexOf(":");
        const targetLocal = colonIdx >= 0 ? name.slice(colonIdx + 1) : name;
        const matchAny = name === "*";
        function walk(elem) {
            for (const child of elem.children) {
                const childElem = child;
                if (matchAny ||
                    childElem.tagName === name ||
                    childElem.localName === targetLocal) {
                    results.push(childElem);
                }
                walk(childElem);
            }
        }
        walk(this);
        return results;
    }
}
// Concrete implementation of XmlTextNode
class XmlTextNodeImpl {
    nodeType = 3;
    nodeName = "#text";
    nodeValue;
    parentNode = null;
    constructor(text) {
        this.nodeValue = text;
    }
    get textContent() {
        return this.nodeValue;
    }
}
// Concrete implementation of XmlDocument
class XmlDocumentImpl {
    documentElement = null;
    getElementsByTagName(name) {
        if (!this.documentElement) {
            return [];
        }
        const results = [];
        const colonIdx = name.indexOf(":");
        const targetLocal = colonIdx >= 0 ? name.slice(colonIdx + 1) : name;
        const matchAny = name === "*";
        if (matchAny ||
            this.documentElement.tagName === name ||
            this.documentElement.localName === targetLocal) {
            results.push(this.documentElement);
        }
        for (const child of this.documentElement.getElementsByTagName(name)) {
            results.push(child);
        }
        return results;
    }
}
/**
 * Decodes standard XML entities and numeric character references.
 */
export function decodeXmlEntities(str) {
    return str.replace(/&(?:(lt|gt|amp|quot|apos)|#(\d+)|#x([0-9a-fA-F]+));/g, (match, named, dec, hex) => {
        if (named) {
            switch (named) {
                case "lt":
                    return "<";
                case "gt":
                    return ">";
                case "amp":
                    return "&";
                case "quot":
                    return '"';
                case "apos":
                    return "'";
            }
        }
        if (dec) {
            const code = parseInt(dec, 10);
            return Number.isFinite(code) && code >= 0 ? String.fromCodePoint(code) : match;
        }
        if (hex) {
            const code = parseInt(hex, 16);
            return Number.isFinite(code) && code >= 0 ? String.fromCodePoint(code) : match;
        }
        return match;
    });
}
/**
 * Built-in pure-TypeScript lightweight safe XML parser.
 * Creates an XmlDocument hierarchy without external dependencies.
 */
export function parseXmlSafe(xmlString) {
    const doc = new XmlDocumentImpl();
    let pos = 0;
    const len = xmlString.length;
    const stack = [];
    function makeParserError(message) {
        const errDoc = new XmlDocumentImpl();
        const errElem = new XmlElementImpl("parsererror");
        const textNode = new XmlTextNodeImpl(message);
        textNode.parentNode = errElem;
        errElem.childNodes.push(textNode);
        errDoc.documentElement = errElem;
        return errDoc;
    }
    while (pos < len) {
        const nextLt = xmlString.indexOf("<", pos);
        if (nextLt === -1) {
            // Remaining trailing text
            const trailing = xmlString.slice(pos).trim();
            if (trailing && stack.length > 0) {
                const textNode = new XmlTextNodeImpl(decodeXmlEntities(trailing));
                const parent = stack[stack.length - 1];
                textNode.parentNode = parent;
                parent.childNodes.push(textNode);
            }
            break;
        }
        // Text between previous position and next '<'
        if (nextLt > pos) {
            const rawText = xmlString.slice(pos, nextLt);
            if (rawText.length > 0 && stack.length > 0) {
                const textNode = new XmlTextNodeImpl(decodeXmlEntities(rawText));
                const parent = stack[stack.length - 1];
                textNode.parentNode = parent;
                parent.childNodes.push(textNode);
            }
        }
        pos = nextLt;
        // CDATA section: <![CDATA[ ... ]]>
        if (xmlString.startsWith("<![CDATA[", pos)) {
            const endCdata = xmlString.indexOf("]]>", pos + 9);
            if (endCdata === -1) {
                return makeParserError("Unclosed CDATA section at " + pos);
            }
            const cdataText = xmlString.slice(pos + 9, endCdata);
            if (stack.length > 0) {
                const textNode = new XmlTextNodeImpl(cdataText);
                const parent = stack[stack.length - 1];
                textNode.parentNode = parent;
                parent.childNodes.push(textNode);
            }
            pos = endCdata + 3;
            continue;
        }
        // Comment: <!-- ... -->
        if (xmlString.startsWith("<!--", pos)) {
            const endComment = xmlString.indexOf("-->", pos + 4);
            if (endComment === -1) {
                return makeParserError("Unclosed XML comment at " + pos);
            }
            pos = endComment + 3;
            continue;
        }
        // XML Declaration or Processing Instruction: <? ... ?>
        if (xmlString.startsWith("<?", pos)) {
            const endPi = xmlString.indexOf("?>", pos + 2);
            if (endPi === -1) {
                return makeParserError("Unclosed processing instruction at " + pos);
            }
            pos = endPi + 2;
            continue;
        }
        // Closing tag: </tag>
        if (xmlString.startsWith("</", pos)) {
            const closeEnd = xmlString.indexOf(">", pos + 2);
            if (closeEnd === -1) {
                return makeParserError("Unclosed closing tag at " + pos);
            }
            const closeTagName = xmlString.slice(pos + 2, closeEnd).trim();
            if (stack.length === 0) {
                return makeParserError("Unexpected closing tag </" + closeTagName + "> at " + pos);
            }
            const current = stack.pop();
            if (current.tagName !== closeTagName) {
                return makeParserError(`Tag mismatch: expected </${current.tagName}> but found </${closeTagName}> at ${pos}`);
            }
            pos = closeEnd + 1;
            continue;
        }
        // Opening tag or self-closing tag: <tag ...> or <tag .../>
        const tagEnd = xmlString.indexOf(">", pos + 1);
        if (tagEnd === -1) {
            return makeParserError("Unclosed opening tag at " + pos);
        }
        let tagContent = xmlString.slice(pos + 1, tagEnd).trim();
        const isSelfClosing = tagContent.endsWith("/");
        if (isSelfClosing) {
            tagContent = tagContent.slice(0, -1).trim();
        }
        // Parse tag name and attributes
        const firstSpace = tagContent.search(/[\s/]/);
        let tagName = "";
        let attrString = "";
        if (firstSpace === -1) {
            tagName = tagContent;
        }
        else {
            tagName = tagContent.slice(0, firstSpace);
            attrString = tagContent.slice(firstSpace).trim();
        }
        if (!tagName) {
            return makeParserError("Empty tag name at " + pos);
        }
        // Parse attributes
        const attributes = new Map();
        if (attrString) {
            const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
            let match;
            while ((match = attrRegex.exec(attrString)) !== null) {
                const attrName = match[1];
                const attrVal = match[2] !== undefined ? match[2] : match[3];
                attributes.set(attrName, decodeXmlEntities(attrVal));
            }
        }
        const elem = new XmlElementImpl(tagName, attributes);
        if (!doc.documentElement) {
            doc.documentElement = elem;
        }
        if (stack.length > 0) {
            const parent = stack[stack.length - 1];
            elem.parentNode = parent;
            parent.childNodes.push(elem);
        }
        if (!isSelfClosing) {
            stack.push(elem);
        }
        pos = tagEnd + 1;
    }
    if (stack.length > 0) {
        return makeParserError(`Unclosed tag </${stack[stack.length - 1].tagName}> at end of document`);
    }
    return doc;
}
/**
 * Creates or wraps an XmlParserPort.
 * If injected is provided, wraps it with checkXmlSecurity.
 * Otherwise, if browser DOMParser exists, uses native DOMParser wrapped with security checks.
 * Otherwise, falls back to the built-in parseXmlSafe.
 */
export function getXmlParser(injected) {
    if (injected) {
        return injected;
    }
    if (typeof DOMParser !== "undefined") {
        return {
            parseFromString(xmlString, mimeType = "application/xml") {
                return new DOMParser().parseFromString(xmlString, mimeType);
            },
        };
    }
    return {
        parseFromString(xmlString) {
            return parseXmlSafe(xmlString);
        },
    };
}
/**
 * Safe helper to retrieve attribute from either native DOM Element or XmlElement.
 */
export function getAttr(elem, name) {
    if ("getAttribute" in elem && typeof elem.getAttribute === "function") {
        const direct = elem.getAttribute(name);
        if (direct !== null)
            return direct;
        const colonIdx = name.indexOf(":");
        const local = colonIdx >= 0 ? name.slice(colonIdx + 1) : name;
        if ("getAttributeNS" in elem && typeof elem.getAttributeNS === "function") {
            const namespaces = [
                "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
                "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
                "http://schemas.openxmlformats.org/drawingml/2006/main",
            ];
            for (const ns of namespaces) {
                try {
                    const val = elem.getAttributeNS(ns, local);
                    if (val !== null && val !== undefined)
                        return val;
                }
                catch {
                    // ignore
                }
            }
        }
        if ("attributes" in elem && elem.attributes) {
            if (elem.attributes instanceof Map) {
                for (const [k, v] of elem.attributes) {
                    const kColon = k.indexOf(":");
                    const kLocal = kColon >= 0 ? k.slice(kColon + 1) : k;
                    if (kLocal === local || k === name)
                        return v;
                }
            }
            else {
                const attrs = elem.attributes;
                if (typeof attrs.length === "number") {
                    for (let i = 0; i < attrs.length; i++) {
                        const a = attrs[i];
                        if (a && (a.localName === local || a.name === name || a.name?.endsWith(":" + local))) {
                            return a.value;
                        }
                    }
                }
            }
        }
    }
    return null;
}
/**
 * Safe helper to retrieve direct element children.
 */
export function getChildren(elem, localOrTagName) {
    const children = [];
    const colonIdx = localOrTagName ? localOrTagName.indexOf(":") : -1;
    const targetLocal = localOrTagName ? (colonIdx >= 0 ? localOrTagName.slice(colonIdx + 1) : localOrTagName) : "";
    if ("children" in elem && elem.children) {
        const list = elem.children;
        const len = list.length;
        for (let i = 0; i < len; i++) {
            const child = list[i];
            if (child) {
                if (!localOrTagName) {
                    children.push(child);
                }
                else {
                    const lName = child.localName || child.tagName;
                    const tName = child.tagName;
                    if (lName === targetLocal ||
                        lName === localOrTagName ||
                        tName === localOrTagName ||
                        (targetLocal && (tName === targetLocal || tName.endsWith(":" + targetLocal)))) {
                        children.push(child);
                    }
                }
            }
        }
    }
    else if ("childNodes" in elem && elem.childNodes) {
        for (let i = 0; i < elem.childNodes.length; i++) {
            const child = elem.childNodes[i];
            if (child && child.nodeType === 1) {
                const cElem = child;
                if (!localOrTagName) {
                    children.push(cElem);
                }
                else {
                    const lName = cElem.localName || cElem.tagName;
                    const tName = cElem.tagName;
                    if (lName === targetLocal ||
                        lName === localOrTagName ||
                        tName === localOrTagName ||
                        (targetLocal && (tName === targetLocal || tName.endsWith(":" + targetLocal)))) {
                        children.push(cElem);
                    }
                }
            }
        }
    }
    return children;
}
/**
 * Safe helper to find all descendants by tag name (matches either full tagName or localName).
 */
export function findElementsByTagName(root, name) {
    const colonIdx = name.indexOf(":");
    const localName = colonIdx >= 0 ? name.slice(colonIdx + 1) : name;
    if ("getElementsByTagNameNS" in root && typeof root.getElementsByTagNameNS === "function") {
        try {
            const nsList = root.getElementsByTagNameNS("*", localName);
            if (nsList && nsList.length > 0) {
                const results = [];
                for (let i = 0; i < nsList.length; i++) {
                    const item = nsList[i];
                    if (item)
                        results.push(item);
                }
                return results;
            }
        }
        catch {
            // ignore
        }
    }
    if ("getElementsByTagName" in root && typeof root.getElementsByTagName === "function") {
        const list = root.getElementsByTagName(name);
        const results = [];
        const len = list.length;
        for (let i = 0; i < len; i++) {
            const item = list[i];
            if (item) {
                results.push(item);
            }
        }
        if (results.length > 0)
            return results;
        if (colonIdx === -1) {
            for (const prefix of ["w:", "a:", "wp:", "pic:", "v:", "r:"]) {
                const pList = root.getElementsByTagName(prefix + name);
                if (pList && pList.length > 0) {
                    for (let i = 0; i < pList.length; i++) {
                        const item = pList[i];
                        if (item)
                            results.push(item);
                    }
                    return results;
                }
            }
        }
        return results;
    }
    return [];
}
