import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  checkXmlSecurity,
  checkParserError,
  parseXmlSafe,
  getXmlParser,
  getAttr,
  getChildren,
  findElementsByTagName,
} from "../../src/import/docx/xml-parser.ts";

describe("WEB-W2-DOCX: XML Parser & Security Validator", () => {
  describe("checkXmlSecurity", () => {
    it("approves clean standard XML without DOCTYPE or ENTITY", () => {
      const clean = `<?xml version="1.0" encoding="UTF-8"?><w:document><w:body><w:p/></w:body></w:document>`;
      const res = checkXmlSecurity(clean, "word/document.xml");
      assert.strictEqual(res.ok, true);
    });

    it("rejects DOCTYPE declaration with XML_INVALID", () => {
      const hostile = `<!DOCTYPE root [<!ELEMENT root ANY>]><root>Test</root>`;
      const res = checkXmlSecurity(hostile, "word/document.xml");
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, "XML_INVALID");
        assert.ok(res.error.message.includes("DOCTYPE"));
      }
    });

    it("rejects case-insensitive DOCTYPE variants", () => {
      const hostile = `<!doctype html><html><body>Test</body></html>`;
      const res = checkXmlSecurity(hostile, "word/document.xml");
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, "XML_INVALID");
      }
    });

    it("rejects ENTITY declaration with XML_INVALID", () => {
      const hostile = `<!ENTITY xxe SYSTEM "file:///etc/passwd"><root>&xxe;</root>`;
      const res = checkXmlSecurity(hostile, "word/document.xml");
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, "XML_INVALID");
        assert.ok(res.error.message.includes("ENTITY"));
      }
    });
  });

  describe("parseXmlSafe", () => {
    it("parses valid XML elements, attributes, and text nodes", () => {
      const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p w:rsidR="001234">
            <w:r>
              <w:t>Xin chào Việt Nam</w:t>
            </w:r>
          </w:p>
        </w:body>
      </w:document>`;

      const doc = parseXmlSafe(xml);
      assert.ok(doc.documentElement !== null);
      assert.strictEqual(doc.documentElement.tagName, "w:document");

      const bodyElements = findElementsByTagName(doc, "w:body");
      assert.strictEqual(bodyElements.length, 1);

      const pElements = findElementsByTagName(doc, "w:p");
      assert.strictEqual(pElements.length, 1);
      assert.strictEqual(getAttr(pElements[0]!, "w:rsidR"), "001234");

      const tElements = findElementsByTagName(doc, "w:t");
      assert.strictEqual(tElements.length, 1);
      assert.strictEqual(tElements[0]!.textContent, "Xin chào Việt Nam");
    });

    it("decodes XML entities and numeric references", () => {
      const xml = `<root attr="&quot;test&quot;">&lt;toán&gt; &amp; &apos;lý&apos; &#65; &#x42;</root>`;
      const doc = parseXmlSafe(xml);
      assert.ok(doc.documentElement !== null);
      assert.strictEqual(doc.documentElement.getAttribute("attr"), '"test"');
      assert.strictEqual(doc.documentElement.textContent, "<toán> & 'lý' A B");
    });

    it("preserves CDATA contents", () => {
      const xml = `<root><![CDATA[Special <unescaped> & "characters"]]></root>`;
      const doc = parseXmlSafe(xml);
      assert.ok(doc.documentElement !== null);
      assert.strictEqual(doc.documentElement.textContent, 'Special <unescaped> & "characters"');
    });

    it("creates parsererror on tag mismatch", () => {
      const malformed = `<root><child>Test</other></root>`;
      const doc = parseXmlSafe(malformed);
      const errRes = checkParserError(doc, "test.xml");
      assert.strictEqual(errRes.ok, false);
      if (!errRes.ok) {
        assert.strictEqual(errRes.error.code, "XML_INVALID");
      }
    });

    it("creates parsererror on unclosed opening tag", () => {
      const malformed = `<root><unclosed>Content`;
      const doc = parseXmlSafe(malformed);
      const errRes = checkParserError(doc, "test.xml");
      assert.strictEqual(errRes.ok, false);
      if (!errRes.ok) {
        assert.strictEqual(errRes.error.code, "XML_INVALID");
      }
    });
  });

  describe("getXmlParser & Injectable Port", () => {
    it("uses injectable XML port for Node tests", () => {
      let customCalled = false;
      const customPort = {
        parseFromString(str: string) {
          customCalled = true;
          return parseXmlSafe(str);
        },
      };

      const parser = getXmlParser(customPort);
      const doc = parser.parseFromString("<root>Test</root>");
      assert.strictEqual(customCalled, true);
      assert.strictEqual(doc.documentElement?.textContent, "Test");
    });

    it("falls back to safe pure-JS parser when no DOMParser exists", () => {
      const parser = getXmlParser();
      const doc = parser.parseFromString("<test><item id='1'>Value</item></test>");
      assert.ok(doc.documentElement !== null);
      const items = findElementsByTagName(doc, "item");
      assert.strictEqual(items.length, 1);
      assert.strictEqual(getAttr(items[0]!, "id"), "1");
      assert.strictEqual(items[0]!.textContent, "Value");
    });
  });
});
