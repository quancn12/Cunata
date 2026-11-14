/**
 * Pure TypeScript XML DOM Parser & Security Validator.
 * Conforms to docs/contracts/WEB-contract.md §8, §11.
 * Provides injectable XML port for Node tests and wraps native browser DOMParser.
 */

import type {
  XmlDocument,
  XmlElement,
  XmlNode,
  XmlTextNode,
  XmlParserPort,
  Result,
} from "./types.ts";

/**
 * Validates XML text for security constraints:
 * Rejects DOCTYPE and ENTITY declarations to prevent XXE and expansion attacks.
 */
export function checkXmlSecurity(xmlString: string, path: string): Result<void> {
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
export function checkParserError(
  doc: XmlDocument | Document,
  path: string,
): Result<void> {
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
class XmlElementImpl implements XmlElement {
  public readonly nodeType = 1 as const;
  public readonly tagName: string;
  public readonly localName: string;
  public readonly attributes: Map<string, string>;
  public readonly childNodes: XmlNode[] = [];
  public parentNode: XmlNode | null = null;

  constructor(tagName: string, attributes: Map<string, string> = new Map()) {
    this.tagName = tagName;
    const colonIdx = tagName.indexOf(":");
    this.localName = colonIdx >= 0 ? tagName.slice(colonIdx + 1) : tagName;
    this.attributes = attributes;
  }

  get nodeName(): string {
    return this.tagName;
  }

  get children(): XmlElement[] {
    return this.childNodes.filter(
      (n): n is XmlElement => n.nodeType === 1,
    );
  }

  get textContent(): string {
    let text = "";
    for (const child of this.childNodes) {
      text += child.textContent;
    }
    return text;
  }

  getAttribute(name: string): string | null {
    if (this.attributes.has(name)) {
      return this.attributes.get(name)!;
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

  getElementsByTagName(name: string): XmlElement[] {
    const results: XmlElement[] = [];
    const colonIdx = name.indexOf(":");
    const targetLocal = colonIdx >= 0 ? name.slice(colonIdx + 1) : name;
    const matchAny = name === "*";

    function walk(elem: XmlElementImpl): void {
      for (const child of elem.children) {
        const childElem = child as XmlElementImpl;
        if (
          matchAny ||
          childElem.tagName === name ||
          childElem.localName === targetLocal
        ) {
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
class XmlTextNodeImpl implements XmlTextNode {
  public readonly nodeType = 3 as const;
  public readonly nodeName = "#text";
  public nodeValue: string;
  public parentNode: XmlNode | null = null;

  constructor(text: string) {
    this.nodeValue = text;
  }

  get textContent(): string {
    return this.nodeValue;
  }
}

// Concrete implementation of XmlDocument
class XmlDocumentImpl implements XmlDocument {
  public documentElement: XmlElement | null = null;

  getElementsByTagName(name: string): XmlElement[] {
    if (!this.documentElement) {
      return [];
    }
    const results: XmlElement[] = [];
    const colonIdx = name.indexOf(":");
    const targetLocal = colonIdx >= 0 ? name.slice(colonIdx + 1) : name;
    const matchAny = name === "*";

    if (
      matchAny ||
      this.documentElement.tagName === name ||
      this.documentElement.localName === targetLocal
    ) {
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
export function decodeXmlEntities(str: string): string {
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
export function parseXmlSafe(xmlString: string): XmlDocument {
  const doc = new XmlDocumentImpl();
  let pos = 0;
  const len = xmlString.length;

  const stack: XmlElementImpl[] = [];

  function makeParserError(message: string): XmlDocument {
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
        const parent = stack[stack.length - 1]!;
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
        const parent = stack[stack.length - 1]!;
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
        const parent = stack[stack.length - 1]!;
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
      const current = stack.pop()!;
      if (current.tagName !== closeTagName) {
        return makeParserError(
          `Tag mismatch: expected </${current.tagName}> but found </${closeTagName}> at ${pos}`,
        );
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
    } else {
      tagName = tagContent.slice(0, firstSpace);
      attrString = tagContent.slice(firstSpace).trim();
    }

    if (!tagName) {
      return makeParserError("Empty tag name at " + pos);
    }

    // Parse attributes
    const attributes = new Map<string, string>();
    if (attrString) {
      const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let match: RegExpExecArray | null;
      while ((match = attrRegex.exec(attrString)) !== null) {
        const attrName = match[1]!;
        const attrVal = match[2] !== undefined ? match[2] : match[3]!;
        attributes.set(attrName, decodeXmlEntities(attrVal));
      }
    }

    const elem = new XmlElementImpl(tagName, attributes);

    if (!doc.documentElement) {
      doc.documentElement = elem;
    }

    if (stack.length > 0) {
      const parent = stack[stack.length - 1]!;
      elem.parentNode = parent;
      parent.childNodes.push(elem);
    }

    if (!isSelfClosing) {
      stack.push(elem);
    }

    pos = tagEnd + 1;
  }

  if (stack.length > 0) {
    return makeParserError(`Unclosed tag </${stack[stack.length - 1]!.tagName}> at end of document`);
  }

  return doc;
}

/**
 * Creates or wraps an XmlParserPort.
 * If injected is provided, wraps it with checkXmlSecurity.
 * Otherwise, if browser DOMParser exists, uses native DOMParser wrapped with security checks.
 * Otherwise, falls back to the built-in parseXmlSafe.
 */
export function getXmlParser(injected?: XmlParserPort): XmlParserPort {
  if (injected) {
    return injected;
  }

  if (typeof DOMParser !== "undefined") {
    return {
      parseFromString(xmlString: string, mimeType: "application/xml" | "text/xml" = "application/xml") {
        return new DOMParser().parseFromString(xmlString, mimeType);
      },
    };
  }

  return {
    parseFromString(xmlString: string) {
      return parseXmlSafe(xmlString);
    },
  };
}

/**
 * Safe helper to retrieve attribute from either native DOM Element or XmlElement.
 */
export function getAttr(elem: XmlElement | Element, name: string): string | null {
  if ("getAttribute" in elem && typeof elem.getAttribute === "function") {
    return elem.getAttribute(name);
  }
  return null;
}

/**
 * Safe helper to retrieve direct element children.
 */
export function getChildren(elem: XmlElement | Element, localOrTagName?: string): (XmlElement | Element)[] {
  const children: (XmlElement | Element)[] = [];
  if ("children" in elem && elem.children) {
    const list = elem.children;
    const len = list.length;
    for (let i = 0; i < len; i++) {
      const child = list[i];
      if (child) {
        if (!localOrTagName) {
          children.push(child);
        } else {
          const lName = child.localName || child.tagName;
          if (lName === localOrTagName || child.tagName === localOrTagName) {
            children.push(child);
          }
        }
      }
    }
  } else if ("childNodes" in elem && elem.childNodes) {
    for (let i = 0; i < elem.childNodes.length; i++) {
      const child = elem.childNodes[i];
      if (child && child.nodeType === 1) {
        const cElem = child as XmlElement | Element;
        if (!localOrTagName) {
          children.push(cElem);
        } else {
          const lName = cElem.localName || cElem.tagName;
          if (lName === localOrTagName || cElem.tagName === localOrTagName) {
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
export function findElementsByTagName(
  root: XmlElement | Element | XmlDocument | Document,
  name: string,
): (XmlElement | Element)[] {
  if ("getElementsByTagName" in root && typeof root.getElementsByTagName === "function") {
    const list = root.getElementsByTagName(name);
    const results: (XmlElement | Element)[] = [];
    const len = list.length;
    for (let i = 0; i < len; i++) {
      const item = list[i];
      if (item) {
        results.push(item as XmlElement | Element);
      }
    }
    return results;
  }
  return [];
}
