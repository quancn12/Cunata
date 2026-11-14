import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { importDocx } from "../../src/import/docx/reader.ts";
import {
  buildSyntheticDocx,
  createMockDocxFile,
  encodeUtf8,
} from "./docx-builder.ts";
import type { DocxImportJob } from "../../src/import/docx/types.ts";

describe("WEB-W2-DOCX: End-to-End DOCX Importer & Semantic Segmentation", () => {
  it("imports a full GDPT 2018 exam with Section I, II, III and answer keys", async () => {
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    <w:p><w:r><w:t>ĐỀ THI TỐT NGHIỆP THPT MÔN TOÁN</w:t></w:r></w:p>

    <!-- PHẦN I -->
    <w:p><w:r><w:t>PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn</w:t></w:r></w:p>

    <w:p><w:r><w:t>Câu 1. Cho hàm số y = f(x) có bảng biến thiên. Giá trị cực đại là:</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>A. 2</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. -1</w:t></w:r></w:p>
    <w:p><w:r><w:t>C. 0</w:t></w:r></w:p>
    <w:p><w:r><w:t>D. 3</w:t></w:r></w:p>

    <!-- PHẦN II -->
    <w:p><w:r><w:t>PHẦN II. Câu trắc nghiệm Đúng/Sai</w:t></w:r></w:p>

    <w:p><w:r><w:t>Câu 2. Cho tứ diện ABCD có các cạnh bằng a.</w:t></w:r></w:p>
    <w:p><w:r><w:t>a) Tam giác ABC là tam giác đều. (Đúng)</w:t></w:r></w:p>
    <w:p><w:r><w:t>b) Góc giữa AB và CD bằng 90 độ. (Đúng)</w:t></w:r></w:p>
    <w:p><w:r><w:t>c) Thể tích khối tứ diện bằng a^3/12. (Sai)</w:t></w:r></w:p>
    <w:p><w:r><w:t>d) Bán kính mặt cầu ngoại tiếp bằng a. (Sai)</w:t></w:r></w:p>

    <!-- PHẦN III -->
    <w:p><w:r><w:t>PHẦN III. Câu trắc nghiệm trả lời ngắn</w:t></w:r></w:p>

    <w:p><w:r><w:t>Câu 3. Tính tích phân I = ∫_0^1 (2x + 1) dx.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Đáp án: 2</w:t></w:r></w:p>

    <w:p><w:r><w:t>Lời giải: Ta có I = [x^2 + x]_0^1 = 2.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

    const docxBytes = await buildSyntheticDocx({ documentXml });
    const file = createMockDocxFile(docxBytes, "toan-thpt.docx");
    const ac = new AbortController();

    const res = await importDocx(file, ac.signal);
    assert.strictEqual(res.ok, true);

    if (res.ok) {
      const job = res.value;
      assert.strictEqual(job.format, "docx");
      assert.strictEqual(job.state, "preview");
      assert.strictEqual(job.sourceId, "toan-thpt.docx");
      assert.strictEqual(job.drafts.length, 3);

      // Draft 1 (Part I)
      const d1 = job.drafts[0]!;
      assert.strictEqual(d1.confirmed, false);
      assert.strictEqual(d1.question.kind, "I");
      assert.strictEqual(d1.question.title, "Câu 1");
      assert.strictEqual(d1.provenance.location, "part:I,question:1");
      assert.strictEqual(d1.provenance.confidence, null);
      assert.strictEqual(d1.question.options?.length, 4);
      // Option A was bolded in source -> resolved
      assert.strictEqual(d1.question.correctOptionId, "opt-1-A");

      // Draft 2 (Part II)
      const d2 = job.drafts[1]!;
      assert.strictEqual(d2.confirmed, false);
      assert.strictEqual(d2.question.kind, "II");
      assert.strictEqual(d2.question.title, "Câu 2");
      assert.strictEqual(d2.provenance.location, "part:II,question:2");
      assert.strictEqual(d2.question.statements?.length, 4);
      assert.strictEqual(d2.question.statements?.[0]?.answer, true);
      assert.strictEqual(d2.question.statements?.[1]?.answer, true);
      assert.strictEqual(d2.question.statements?.[2]?.answer, false);
      assert.strictEqual(d2.question.statements?.[3]?.answer, false);

      // Draft 3 (Part III)
      const d3 = job.drafts[2]!;
      assert.strictEqual(d3.confirmed, false);
      assert.strictEqual(d3.question.kind, "III");
      assert.strictEqual(d3.question.title, "Câu 3");
      assert.strictEqual(d3.question.answerKey, "2");
      assert.ok(d3.question.explanation?.includes("Lời giải"));
    }
  });

  it("extracts answer keys from separate answer table at document end", async () => {
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>PHẦN I. Trắc nghiệm</w:t></w:r></w:p>
    <w:p><w:r><w:t>Câu 1. Đạo hàm của hàm số y = x^2 là:</w:t></w:r></w:p>
    <w:p><w:r><w:t>A. x</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. 2x</w:t></w:r></w:p>
    <w:p><w:r><w:t>C. x^3</w:t></w:r></w:p>
    <w:p><w:r><w:t>D. 1</w:t></w:r></w:p>

    <w:p><w:r><w:t>BẢNG ĐÁP ÁN</w:t></w:r></w:p>
    <w:p><w:r><w:t>1. B</w:t></w:r></w:p>
  </w:body>
</w:document>`;

    const docxBytes = await buildSyntheticDocx({ documentXml });
    const file = createMockDocxFile(docxBytes);
    const ac = new AbortController();

    const res = await importDocx(file, ac.signal);
    assert.strictEqual(res.ok, true);

    if (res.ok) {
      const d1 = res.value.drafts[0]!;
      assert.strictEqual(d1.question.correctOptionId, "opt-1-B");
      assert.ok(!d1.provenance.flags.includes("KEY_MISSING"));
    }
  });

  it("leaves missing keys unresolved with KEY_MISSING flag and null confidence", async () => {
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>PHẦN I. Trắc nghiệm</w:t></w:r></w:p>
    <w:p><w:r><w:t>Câu 1. Câu hỏi không có đáp án sẵn:</w:t></w:r></w:p>
    <w:p><w:r><w:t>A. 1</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. 2</w:t></w:r></w:p>
    <w:p><w:r><w:t>C. 3</w:t></w:r></w:p>
    <w:p><w:r><w:t>D. 4</w:t></w:r></w:p>
  </w:body>
</w:document>`;

    const docxBytes = await buildSyntheticDocx({ documentXml });
    const file = createMockDocxFile(docxBytes);
    const ac = new AbortController();

    const res = await importDocx(file, ac.signal);
    assert.strictEqual(res.ok, true);

    if (res.ok) {
      const d1 = res.value.drafts[0]!;
      assert.strictEqual(d1.question.correctOptionId, undefined);
      assert.ok(d1.provenance.flags.includes("KEY_MISSING"));
      assert.strictEqual(d1.provenance.confidence, null);
      assert.strictEqual(d1.confirmed, false);
    }
  });

  it("resolves numbering from word/numbering.xml", async () => {
    const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="Câu %1."/>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1">
    <w:abstractNumId w:val="0"/>
  </w:num>
</w:numbering>`;

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>
      </w:pPr>
      <w:r><w:t>Tập xác định của hàm số y = 1/x là:</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>A. R \\ {0}</w:t></w:r></w:p>
    <w:p><w:r><w:t>B. R</w:t></w:r></w:p>
    <w:p><w:r><w:t>C. (0; +inf)</w:t></w:r></w:p>
    <w:p><w:r><w:t>D. [-1; 1]</w:t></w:r></w:p>
  </w:body>
</w:document>`;

    const docxBytes = await buildSyntheticDocx({ documentXml, numberingXml });
    const file = createMockDocxFile(docxBytes);
    const ac = new AbortController();

    const res = await importDocx(file, ac.signal);
    assert.strictEqual(res.ok, true);

    if (res.ok) {
      assert.strictEqual(res.value.drafts.length, 1);
      const d1 = res.value.drafts[0]!;
      assert.strictEqual(d1.question.title, "Câu 1");
      assert.ok(d1.question.content?.includes("Tập xác định"));
    }
  });

  it("parses tables preserving gridSpan (colSpan) and vMerge (rowSpan)", async () => {
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Bảng biến thiên:</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:tcPr><w:gridSpan w:val="2"/></w:tcPr>
          <w:p><w:r><w:t>Tiêu đề gộp 2 cột</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:vMerge w:val="restart"/></w:tcPr>
          <w:p><w:r><w:t>Gộp dọc hàng 1</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>Ô thường</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:vMerge/></w:tcPr>
          <w:p><w:r><w:t/></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>Ô thường 2</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

    const docxBytes = await buildSyntheticDocx({ documentXml });
    const file = createMockDocxFile(docxBytes);
    const ac = new AbortController();

    const res = await importDocx(file, ac.signal);
    assert.strictEqual(res.ok, true);

    if (res.ok) {
      const tableBlock = res.value.blocks.find((b) => b.type === "table");
      assert.ok(tableBlock !== undefined);
      if (tableBlock && tableBlock.type === "table") {
        assert.strictEqual(tableBlock.rows.length, 3);
        // Row 0 has colSpan 2
        assert.strictEqual(tableBlock.rows[0]?.[0]?.colSpan, 2);
        // Row 1 has rowSpan 2
        assert.strictEqual(tableBlock.rows[1]?.[0]?.rowSpan, 2);
      }
    }
  });

  it("extracts PNG images as assets and flags unsupported EMF/WMF vector images", async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
    const emfBytes = new Uint8Array([0x01, 0x00, 0x00, 0x00, 0x6c, 0x00, 0x00, 0x00]);

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
  <Relationship Id="rIdEmf1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.emf"/>
</Relationships>`;

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline>
            <wp:docPr id="1" name="Hình 1" descr="Đồ thị hàm số bậc ba"/>
            <a:graphic>
              <pic:pic>
                <pic:blipFill>
                  <a:blip r:embed="rIdImg1"/>
                </pic:blipFill>
              </pic:pic>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline>
            <wp:docPr id="2" name="Hình 2" descr="Hình vẽ EMF"/>
            <a:graphic>
              <pic:pic>
                <pic:blipFill>
                  <a:blip r:embed="rIdEmf1"/>
                </pic:blipFill>
              </pic:pic>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

    const docxBytes = await buildSyntheticDocx({
      documentXml,
      relsXml,
      mediaEntries: [
        { name: "media/image1.png", bytes: pngBytes },
        { name: "media/image2.emf", bytes: emfBytes },
      ],
    });

    const file = createMockDocxFile(docxBytes);
    const ac = new AbortController();

    const res = await importDocx(file, ac.signal);
    assert.strictEqual(res.ok, true);

    if (res.ok) {
      const job = res.value as DocxImportJob;
      assert.strictEqual(job.assets.length, 2);

      const pngAsset = job.assets.find((a) => a.mime === "image/png");
      assert.ok(pngAsset !== undefined);
      assert.strictEqual(pngAsset?.alt, "Đồ thị hàm số bậc ba");

      const emfAsset = job.assets.find((a) => a.mime === "image/x-emf");
      assert.ok(emfAsset !== undefined);

      // Warning flag for unsupported vector format
      assert.ok(job.flags.includes("DOCX_UNSUPPORTED_VECTOR_IMAGE"));
    }
  });

  it("converts verified OMML formula to LaTeX and retains unsupported OMML with flag", async () => {
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    <w:p>
      <w:r><w:t>Công thức hợp lệ: </w:t></w:r>
      <m:oMath>
        <m:f>
          <m:num><m:r><m:t>1</m:t></m:r></m:num>
          <m:den><m:r><m:t>x</m:t></m:r></m:den>
        </m:f>
      </m:oMath>
    </w:p>
    <w:p>
      <w:r><w:t>Công thức không hỗ trợ: </w:t></w:r>
      <m:oMath>
        <m:unsupportedExoticNode attr="test">
          <m:payload>RAW</m:payload>
        </m:unsupportedExoticNode>
      </m:oMath>
    </w:p>
  </w:body>
</w:document>`;

    const docxBytes = await buildSyntheticDocx({ documentXml });
    const file = createMockDocxFile(docxBytes);
    const ac = new AbortController();

    const res = await importDocx(file, ac.signal);
    assert.strictEqual(res.ok, true);

    if (res.ok) {
      const mathBlocks = res.value.blocks.filter((b) => b.type === "math");
      assert.strictEqual(mathBlocks.length, 2);

      // Verified fraction
      const valid = mathBlocks[0]!;
      if (valid.type === "math") {
        assert.strictEqual(valid.format, "latex");
        assert.strictEqual(valid.verified, true);
        assert.strictEqual(valid.source, "\\frac{1}{x}");
      }

      // Unsupported OMML retains raw source
      const unverified = mathBlocks[1]!;
      if (unverified.type === "math") {
        assert.strictEqual(unverified.format, "omml");
        assert.strictEqual(unverified.verified, false);
        assert.ok(unverified.source.includes("unsupportedExoticNode"));
      }

      assert.ok(res.value.flags.includes("UNSUPPORTED_OMML"));
    }
  });

  describe("Security Violations & Boundary Rejections", () => {
    it("rejects XML with DOCTYPE declaration with XML_INVALID", async () => {
      const documentXml = `<?xml version="1.0"?>
<!DOCTYPE root [<!ENTITY xxe SYSTEM "file:///etc/hosts">]>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>Test</w:t></w:r></w:p></w:body>
</w:document>`;

      const docxBytes = await buildSyntheticDocx({ documentXml });
      const file = createMockDocxFile(docxBytes);
      const ac = new AbortController();

      const res = await importDocx(file, ac.signal);
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, "XML_INVALID");
        assert.ok(res.error.message.includes("DOCTYPE"));
      }
    });

    it("rejects XML with ENTITY declaration with XML_INVALID", async () => {
      const documentXml = `<?xml version="1.0"?>
<!ENTITY evil "payload">
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>Test</w:t></w:r></w:p></w:body>
</w:document>`;

      const docxBytes = await buildSyntheticDocx({ documentXml });
      const file = createMockDocxFile(docxBytes);
      const ac = new AbortController();

      const res = await importDocx(file, ac.signal);
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, "XML_INVALID");
      }
    });

    it("rejects external relationships (TargetMode=External) with XML_INVALID", async () => {
      const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdExt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
                Target="http://malicious.site/tracker.png" TargetMode="External"/>
</Relationships>`;

      const docxBytes = await buildSyntheticDocx({ relsXml });
      const file = createMockDocxFile(docxBytes);
      const ac = new AbortController();

      const res = await importDocx(file, ac.signal);
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, "XML_INVALID");
        assert.ok(res.error.message.includes("ngoại vi"));
      }
    });

    it("rejects external relationship URLs even without TargetMode=External", async () => {
      const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdExt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
                Target="https://external-resource.com/leak.png"/>
</Relationships>`;

      const docxBytes = await buildSyntheticDocx({ relsXml });
      const file = createMockDocxFile(docxBytes);
      const ac = new AbortController();

      const res = await importDocx(file, ac.signal);
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, "XML_INVALID");
      }
    });

    it("rejects path traversal in relationship targets with XML_INVALID", async () => {
      const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdTrav" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
                Target="../secret.png"/>
</Relationships>`;

      const docxBytes = await buildSyntheticDocx({ relsXml });
      const file = createMockDocxFile(docxBytes);
      const ac = new AbortController();

      const res = await importDocx(file, ac.signal);
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, "XML_INVALID");
        assert.ok(res.error.message.includes("traversal") || res.error.message.includes("vượt giới hạn"));
      }
    });

    it("rejects archive missing word/document.xml with DOCX_UNSUPPORTED", async () => {
      const docxBytes = await buildSyntheticDocx({ omitDocumentXml: true });
      const file = createMockDocxFile(docxBytes);
      const ac = new AbortController();

      const res = await importDocx(file, ac.signal);
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, "DOCX_UNSUPPORTED");
      }
    });

    it("rejects corrupt non-zip file with ZIP_INVALID", async () => {
      const garbageBytes = encodeUtf8("This is not a zip file at all!");
      const file = createMockDocxFile(garbageBytes);
      const ac = new AbortController();

      const res = await importDocx(file, ac.signal);
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, "ZIP_INVALID");
      }
    });

    it("aborts parsing immediately when signal is cancelled", async () => {
      const docxBytes = await buildSyntheticDocx({});
      const file = createMockDocxFile(docxBytes);
      const ac = new AbortController();
      ac.abort();

      const res = await importDocx(file, ac.signal);
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, "IMPORT_CANCELLED");
        assert.strictEqual(res.error.recoverable, true);
      }
    });
  });
});
