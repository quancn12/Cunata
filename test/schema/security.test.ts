import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseExam, exportExam, validateImportDraft } from "../../src/schema/exam.ts";
import type { ImportDraft } from "../../src/schema/types.ts";

describe("Schema Security & Hostile Asset Sanitization", () => {
  const samplePath = path.resolve("public/sample-exam.json");
  const rawSample = JSON.parse(fs.readFileSync(samplePath, "utf8"));

  it("rejects non-whitelisted asset MIME types with ASSET_UNSAFE", () => {
    const hostileExam = {
      ...rawSample,
      assets: [
        {
          assetId: "evil-script",
          mime: "application/javascript",
          data: "alert(1)",
          alt: "Malicious script",
        },
      ],
    };
    const res = parseExam(hostileExam);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.ok(res.issues.some((i) => i.code === "ASSET_UNSAFE" && i.path === "assets[0].mime"));
    }
  });

  it("rejects asset data containing javascript: URI with ASSET_UNSAFE", () => {
    const hostileExam = {
      ...rawSample,
      assets: [
        {
          assetId: "js-link",
          mime: "image/svg+xml",
          data: "javascript:alert(document.cookie)",
          alt: "XSS SVG",
        },
      ],
    };
    const res = parseExam(hostileExam);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.ok(res.issues.some((i) => i.code === "ASSET_UNSAFE" && i.path === "assets[0].data"));
    }
  });

  it("rejects SVG asset data containing script tags or event handlers with ASSET_UNSAFE", () => {
    const scriptTagExam = {
      ...rawSample,
      assets: [
        {
          assetId: "svg-script",
          mime: "image/svg+xml",
          data: '<svg><script>alert("hacked")</script></svg>',
          alt: "Script SVG",
        },
      ],
    };
    const res1 = parseExam(scriptTagExam);
    assert.equal(res1.ok, false);
    if (!res1.ok) {
      assert.ok(res1.issues.some((i) => i.code === "ASSET_UNSAFE" && i.path === "assets[0].data"));
    }

    const onloadExam = {
      ...rawSample,
      assets: [
        {
          assetId: "svg-onload",
          mime: "image/svg+xml",
          data: '<svg onload="alert(1)"></svg>',
          alt: "Onload SVG",
        },
      ],
    };
    const res2 = parseExam(onloadExam);
    assert.equal(res2.ok, false);
    if (!res2.ok) {
      assert.ok(res2.issues.some((i) => i.code === "ASSET_UNSAFE" && i.path === "assets[0].data"));
    }
  });

  it("rejects directory traversal in question image path with ASSET_UNSAFE", () => {
    const traversalExam = {
      ...rawSample,
      questions: [
        {
          ...rawSample.questions[0],
          image: "../../etc/passwd",
        },
        ...rawSample.questions.slice(1),
      ],
    };
    const res = parseExam(traversalExam);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.ok(res.issues.some((i) => i.code === "ASSET_UNSAFE" && i.path === "questions[0].image"));
    }
  });

  it("rejects javascript: URI in question image with ASSET_UNSAFE", () => {
    const jsImageExam = {
      ...rawSample,
      questions: [
        {
          ...rawSample.questions[0],
          image: "javascript:void(0)",
        },
        ...rawSample.questions.slice(1),
      ],
    };
    const res = parseExam(jsImageExam);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.ok(res.issues.some((i) => i.code === "ASSET_UNSAFE" && i.path === "questions[0].image"));
    }
  });

  it("rejects hostile image URLs inside markdown content with ASSET_UNSAFE", () => {
    const mdImageExam = {
      ...rawSample,
      questions: [
        {
          ...rawSample.questions[0],
          content: "Câu hỏi có hình: ![XSS](javascript:alert(1))",
        },
        ...rawSample.questions.slice(1),
      ],
    };
    const res = parseExam(mdImageExam);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.ok(res.issues.some((i) => i.code === "ASSET_UNSAFE" && i.path === "questions[0].content"));
    }
  });

  it("detects hostile image in ImportDraft with ASSET_UNSAFE", () => {
    const draft: ImportDraft = {
      draftId: "draft-sec-1",
      provenance: {
        sourceId: "src-1",
        location: "1",
        confidence: 1,
        flags: [],
      },
      confirmed: false,
      question: {
        kind: "I",
        questionVersionId: "q-sec-1",
        image: "../sensitive/file.png",
        options: [
          { optionId: "o1", text: "A" },
          { optionId: "o2", text: "B" },
          { optionId: "o3", text: "C" },
          { optionId: "o4", text: "D" },
        ],
        correctOptionId: "o1",
      },
    };
    const issues = validateImportDraft(draft);
    assert.ok(issues.some((i) => i.code === "ASSET_UNSAFE" && i.path === "question.image"));
  });

  it("preserves special IDs across parse and export roundtrip without modification", () => {
    const specialExam = {
      ...rawSample,
      examId: "exam:special/sub-id#test_01",
      examVersionId: "v:1.0.0-rc.1+build",
      questions: [
        {
          kind: "I",
          questionVersionId: "q:01/special_id-alpha#1",
          title: "Câu hỏi đặc biệt",
          content: "Nội dung đặc biệt",
          options: [
            { optionId: "opt:alpha/1", label: "A", text: "Opt 1" },
            { optionId: "opt:beta/2", label: "B", text: "Opt 2" },
            { optionId: "opt:gamma/3", label: "C", text: "Opt 3" },
            { optionId: "opt:delta/4", label: "D", text: "Opt 4" },
          ],
          correctOptionId: "opt:alpha/1",
        },
      ],
    };

    const res = parseExam(specialExam);
    assert.equal(res.ok, true, `Parse failed: ${res.ok ? "" : JSON.stringify(res.issues)}`);
    if (!res.ok) return;

    assert.equal(res.value.examId, "exam:special/sub-id#test_01");
    assert.equal(res.value.questions[0]?.questionVersionId, "q:01/special_id-alpha#1");
    const q0 = res.value.questions[0];
    assert.ok(q0);
    if (q0.kind !== "I") throw new Error("q0 must be kind I");
    assert.equal(q0.correctOptionId, "opt:alpha/1");

    const exported = exportExam(res.value);
    const reparsed = parseExam(exported);
    assert.equal(reparsed.ok, true);
    if (reparsed.ok) {
      assert.equal(reparsed.value.examId, "exam:special/sub-id#test_01");
      assert.equal(reparsed.value.questions[0]?.questionVersionId, "q:01/special_id-alpha#1");
    }
  });

  it("preserves rich Vietnamese Unicode text without mojibake or corruption", () => {
    const unicodeTitle = "Kỳ thi thử Tốt nghiệp THPT — Môn Toán học: Khảo sát Hàm số & Tích phân (Lớp 12 — GDPT 2018)";
    const unicodeContent = "Cho hàm số bậc ba $f(x)$ liên tục trên $\\mathbb{R}$. Tìm giá trị lớn nhất và nhỏ nhất của biểu thức $P = x^2 + 2y^2 - 3xy + \\sqrt{5}$.";

    const customExam = {
      ...rawSample,
      title: unicodeTitle,
      questions: [
        {
          ...rawSample.questions[0],
          content: unicodeContent,
        },
        ...rawSample.questions.slice(1),
      ],
    };

    const res = parseExam(customExam);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.title, unicodeTitle);
    assert.equal(res.value.questions[0]?.content, unicodeContent);

    const exported = exportExam(res.value);
    assert.ok(exported.includes(unicodeTitle));
    assert.ok(exported.includes("Khảo sát Hàm số & Tích phân"));

    const reparsed = parseExam(exported);
    assert.equal(reparsed.ok, true);
    if (reparsed.ok) {
      assert.equal(reparsed.value.title, unicodeTitle);
      assert.equal(reparsed.value.questions[0]?.content, unicodeContent);
    }
  });
});
