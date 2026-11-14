import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { convertOmmlToLatex, serializeXml } from "../../src/import/docx/omml.ts";
import { parseXmlSafe } from "../../src/import/docx/xml-parser.ts";

describe("WEB-W2-DOCX: OMML to LaTeX Conversion (Verified Subset & Safe Fallback)", () => {
  function parseMath(xml: string) {
    const doc = parseXmlSafe(xml);
    return doc.documentElement!;
  }

  describe("Verified Subset Conversion", () => {
    it("converts fraction <m:f> to \\frac{num}{den}", () => {
      const xml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:f>
          <m:num><m:r><m:t>1</m:t></m:r></m:num>
          <m:den><m:r><m:t>2</m:t></m:r></m:den>
        </m:f>
      </m:oMath>`;
      const res = convertOmmlToLatex(parseMath(xml));
      assert.ok(res.converted !== null);
      assert.strictEqual(res.converted, "\\frac{1}{2}");
    });

    it("converts square root <m:rad> without degree to \\sqrt{e}", () => {
      const xml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:rad>
          <m:radPr><m:degHide m:val="1"/></m:radPr>
          <m:deg/>
          <m:e><m:r><m:t>x + 1</m:t></m:r></m:e>
        </m:rad>
      </m:oMath>`;
      const res = convertOmmlToLatex(parseMath(xml));
      assert.ok(res.converted !== null);
      assert.strictEqual(res.converted, "\\sqrt{x + 1}");
    });

    it("converts cube root <m:rad> with degree to \\sqrt[3]{e}", () => {
      const xml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:rad>
          <m:deg><m:r><m:t>3</m:t></m:r></m:deg>
          <m:e><m:r><m:t>x</m:t></m:r></m:e>
        </m:rad>
      </m:oMath>`;
      const res = convertOmmlToLatex(parseMath(xml));
      assert.ok(res.converted !== null);
      assert.strictEqual(res.converted, "\\sqrt[3]{x}");
    });

    it("converts superscript <m:sSup> to {base}^{sup}", () => {
      const xml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:sSup>
          <m:e><m:r><m:t>x</m:t></m:r></m:e>
          <m:sup><m:r><m:t>2</m:t></m:r></m:sup>
        </m:sSup>
      </m:oMath>`;
      const res = convertOmmlToLatex(parseMath(xml));
      assert.ok(res.converted !== null);
      assert.strictEqual(res.converted, "x^{2}");
    });

    it("converts subscript <m:sSub> to {base}_{sub}", () => {
      const xml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:sSub>
          <m:e><m:r><m:t>x</m:t></m:r></m:e>
          <m:sub><m:r><m:t>1</m:t></m:r></m:sub>
        </m:sSub>
      </m:oMath>`;
      const res = convertOmmlToLatex(parseMath(xml));
      assert.ok(res.converted !== null);
      assert.strictEqual(res.converted, "x_{1}");
    });

    it("converts subscript and superscript <m:sSubSup> to {base}_{sub}^{sup}", () => {
      const xml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:sSubSup>
          <m:e><m:r><m:t>x</m:t></m:r></m:e>
          <m:sub><m:r><m:t>1</m:t></m:r></m:sub>
          <m:sup><m:r><m:t>2</m:t></m:r></m:sup>
        </m:sSubSup>
      </m:oMath>`;
      const res = convertOmmlToLatex(parseMath(xml));
      assert.ok(res.converted !== null);
      assert.strictEqual(res.converted, "x_{1}^{2}");
    });

    it("converts delimiter <m:d> to \\left( ... \\right)", () => {
      const xml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:d>
          <m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/></m:dPr>
          <m:e><m:r><m:t>a + b</m:t></m:r></m:e>
        </m:d>
      </m:oMath>`;
      const res = convertOmmlToLatex(parseMath(xml));
      assert.ok(res.converted !== null);
      assert.strictEqual(res.converted, "\\left( a + b \\right)");
    });

    it("converts square brackets delimiter <m:d> to \\left[ ... \\right]", () => {
      const xml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:d>
          <m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr>
          <m:e><m:r><m:t>0; 1</m:t></m:r></m:e>
        </m:d>
      </m:oMath>`;
      const res = convertOmmlToLatex(parseMath(xml));
      assert.ok(res.converted !== null);
      assert.strictEqual(res.converted, "\\left[ 0; 1 \\right]");
    });

    it("converts definite integral <m:nary> to \\int_{0}^{1} x dx", () => {
      const xml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:nary>
          <m:naryPr><m:chr m:val="∫"/></m:naryPr>
          <m:sub><m:r><m:t>0</m:t></m:r></m:sub>
          <m:sup><m:r><m:t>1</m:t></m:r></m:sup>
          <m:e><m:r><m:t>x dx</m:t></m:r></m:e>
        </m:nary>
      </m:oMath>`;
      const res = convertOmmlToLatex(parseMath(xml));
      assert.ok(res.converted !== null);
      assert.strictEqual(res.converted, "\\int_{0}^{1} x dx");
    });

    it("converts summation <m:nary> to \\sum_{i=1}^{n} a_i", () => {
      const xml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:nary>
          <m:naryPr><m:chr m:val="∑"/></m:naryPr>
          <m:sub><m:r><m:t>i=1</m:t></m:r></m:sub>
          <m:sup><m:r><m:t>n</m:t></m:r></m:sup>
          <m:e><m:r><m:t>a_i</m:t></m:r></m:e>
        </m:nary>
      </m:oMath>`;
      const res = convertOmmlToLatex(parseMath(xml));
      assert.ok(res.converted !== null);
      assert.strictEqual(res.converted, "\\sum_{i = 1}^{n} a_i");
    });

    it("converts vector accent <m:acc> to \\vec{u}", () => {
      const xml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:acc>
          <m:accPr><m:chr m:val="⃗"/></m:accPr>
          <m:e><m:r><m:t>u</m:t></m:r></m:e>
        </m:acc>
      </m:oMath>`;
      const res = convertOmmlToLatex(parseMath(xml));
      assert.ok(res.converted !== null);
      assert.strictEqual(res.converted, "\\vec{u}");
    });

    it("converts overline <m:bar> to \\overline{AB}", () => {
      const xml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:bar>
          <m:barPr><m:pos m:val="top"/></m:barPr>
          <m:e><m:r><m:t>AB</m:t></m:r></m:e>
        </m:bar>
      </m:oMath>`;
      const res = convertOmmlToLatex(parseMath(xml));
      assert.ok(res.converted !== null);
      assert.strictEqual(res.converted, "\\overline{AB}");
    });

    it("converts matrix <m:m> to \\begin{matrix} ... \\end{matrix}", () => {
      const xml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:m>
          <m:mr>
            <m:e><m:r><m:t>1</m:t></m:r></m:e>
            <m:e><m:r><m:t>2</m:t></m:r></m:e>
          </m:mr>
          <m:mr>
            <m:e><m:r><m:t>3</m:t></m:r></m:e>
            <m:e><m:r><m:t>4</m:t></m:r></m:e>
          </m:mr>
        </m:m>
      </m:oMath>`;
      const res = convertOmmlToLatex(parseMath(xml));
      assert.ok(res.converted !== null);
      assert.strictEqual(res.converted, "\\begin{matrix} 1 & 2 \\\\ 3 & 4 \\end{matrix}");
    });

    it("maps Unicode mathematical symbols to standard LaTeX commands", () => {
      const xml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:r><m:t>x ≤ 5, y ≥ 0, z ∈ ℝ, π ≈ 3.14, Δ &gt; 0</m:t></m:r>
      </m:oMath>`;
      const res = convertOmmlToLatex(parseMath(xml));
      assert.ok(res.converted !== null);
      assert.ok(res.converted.includes("\\le"));
      assert.ok(res.converted.includes("\\ge"));
      assert.ok(res.converted.includes("\\in"));
      assert.ok(res.converted.includes("\\pi"));
      assert.ok(res.converted.includes("\\approx"));
      assert.ok(res.converted.includes("\\Delta"));
    });
  });

  describe("Unsupported OMML Safe Fallback", () => {
    it("returns converted: null and preserves raw XML for unverified/unknown tags", () => {
      const xml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:customUnsupportedTag attr="exotic">
          <m:nestedSecret>Payload</m:nestedSecret>
        </m:customUnsupportedTag>
      </m:oMath>`;
      const res = convertOmmlToLatex(parseMath(xml));
      assert.strictEqual(res.converted, null);
      assert.ok(res.rawOmml.includes("customUnsupportedTag"));
      assert.ok(res.rawOmml.includes("Payload"));
    });

    it("serializes XML safely preserving tag names and attributes", () => {
      const xml = `<m:oMath xmlns:m="math" version="2"><m:r><m:t>test</m:t></m:r></m:oMath>`;
      const elem = parseMath(xml);
      const serialized = serializeXml(elem);
      assert.ok(serialized.startsWith("<m:oMath"));
      assert.ok(serialized.includes('xmlns:m="math"'));
      assert.ok(serialized.includes("<m:t>test</m:t>"));
    });
  });
});
