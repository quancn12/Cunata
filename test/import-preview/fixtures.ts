/**
 * Test fixtures for M5 Import Preview, Correction and Confirmation.
 */

import type {
  ImportJob,
  ImportDraft,
  ExamDraft,
  WebQuestionI,
  WebQuestionII,
  WebQuestionIII,
  Block,
} from "../../src/import/preview/types.ts";
import { PREVIEW_FLAGS } from "../../src/import/preview/types.ts";

export const sampleValidPartI: WebQuestionI = {
  kind: "I",
  questionVersionId: "q-p1-01",
  title: "Câu 1: Hàm số đồng biến",
  content: "Cho hàm số y = f(x) có bảng biến thiên...",
  explanation: "Đạo hàm f'(x) > 0 trên khoảng (1; 3).",
  options: [
    { optionId: "opt-1", label: "A", text: "(1; 3)" },
    { optionId: "opt-2", label: "B", text: "(-1; 1)" },
    { optionId: "opt-3", label: "C", text: "(0; 2)" },
    { optionId: "opt-4", label: "D", text: "(2; +∞)" },
  ],
  correctOptionId: "opt-1",
  subject: "Toán",
  grade: 12,
  topic: "Khảo sát hàm số",
  lesson: "Tính đơn điệu",
  difficulty: "Thông hiểu",
  provenance: {
    sourceId: "de-toan-thpt.docx",
    location: "Trang 1, Đoạn 5",
    confidence: 0.95,
    flags: [],
  },
};

export const sampleMissingKeyPartI: Partial<WebQuestionI> = {
  kind: "I",
  questionVersionId: "q-p1-nokey",
  title: "Câu 1: Hàm số",
  content: "Cho hàm số y = f(x)...",
  options: [
    { optionId: "opt-a", label: "A", text: "Lựa chọn A" },
    { optionId: "opt-b", label: "B", text: "Lựa chọn B" },
    { optionId: "opt-c", label: "C", text: "Lựa chọn C" },
    { optionId: "opt-d", label: "D", text: "Lựa chọn D" },
  ],
  correctOptionId: undefined, // Missing key
  provenance: {
    sourceId: "de-toan-thpt.docx",
    location: "Trang 1, Đoạn 5",
    confidence: null,
    flags: [PREVIEW_FLAGS.KEY_MISSING],
  },
};

export const sampleValidPartII: WebQuestionII = {
  kind: "II",
  questionVersionId: "q-p2-01",
  title: "Câu 2: Tứ diện ABCD",
  content: "Cho tứ diện đều ABCD có cạnh bằng a.",
  explanation: "Tam giác ABC đều vì các cạnh bằng nhau.",
  statements: [
    { statementId: "st-1", label: "a", text: "Tam giác ABC là tam giác đều.", answer: true, explanation: "Đúng" },
    { statementId: "st-2", label: "b", text: "Góc giữa AB và CD bằng 90 độ.", answer: true, explanation: "Đúng" },
    { statementId: "st-3", label: "c", text: "Thể tích khối tứ diện bằng a^3/12.", answer: false, explanation: "Sai" },
    { statementId: "st-4", label: "d", text: "Bán kính mặt cầu ngoại tiếp bằng a.", answer: false, explanation: "Sai" },
  ],
  subject: "Toán",
  grade: 12,
  topic: "Hình học không gian",
  lesson: "Khối đa diện",
  difficulty: "Vận dụng",
  provenance: {
    sourceId: "de-toan-thpt.docx",
    location: "Trang 2, Đoạn 15",
    confidence: 0.9,
    flags: [],
  },
};

export const sampleMissingKeyPartII: Partial<WebQuestionII> = {
  kind: "II",
  questionVersionId: "q-p2-nokey",
  title: "Câu 2: Đúng Sai chưa có đáp án",
  content: "Xét các khẳng định sau...",
  statements: [
    { statementId: "st-a", label: "a", text: "Mệnh đề A", answer: undefined as unknown as boolean },
    { statementId: "st-b", label: "b", text: "Mệnh đề B", answer: undefined as unknown as boolean },
    { statementId: "st-c", label: "c", text: "Mệnh đề C", answer: undefined as unknown as boolean },
    { statementId: "st-d", label: "d", text: "Mệnh đề D", answer: undefined as unknown as boolean },
  ],
  provenance: {
    sourceId: "de-toan-thpt.docx",
    location: "Trang 2, Đoạn 15",
    confidence: null,
    flags: [PREVIEW_FLAGS.KEY_MISSING],
  },
};

export const sampleValidPartIII: WebQuestionIII = {
  kind: "III",
  questionVersionId: "q-p3-01",
  title: "Câu 3: Tính tích phân",
  content: "Tính giá trị của tích phân I = ∫_0^1 (2x + 1) dx.",
  explanation: "I = [x^2 + x]_0^1 = 2.",
  answerKey: "2",
  subject: "Toán",
  grade: 12,
  topic: "Nguyên hàm - Tích phân",
  lesson: "Tích phân",
  difficulty: "Thông hiểu",
  provenance: {
    sourceId: "de-toan-thpt.docx",
    location: "Trang 3, Đoạn 25",
    confidence: 0.98,
    flags: [],
  },
};

export const sampleMissingKeyPartIII: Partial<WebQuestionIII> = {
  kind: "III",
  questionVersionId: "q-p3-nokey",
  title: "Câu 3: Trả lời ngắn thiếu đáp án",
  content: "Tính độ dài đoạn thẳng AB...",
  answerKey: "", // Missing key
  provenance: {
    sourceId: "de-toan-thpt.docx",
    location: "Trang 3, Đoạn 25",
    confidence: null,
    flags: [PREVIEW_FLAGS.KEY_MISSING],
  },
};

export const sampleBlocksWithOmml: readonly Block[] = [
  { type: "text", text: "Phương trình dao động điều hòa:" },
  { type: "math", source: "<m:oMath><m:r><m:t>x=A\\cos(\\omega t+\\varphi)</m:t></m:r></m:oMath>", format: "omml", verified: false },
  {
    type: "table",
    rows: [
      [
        { blocks: [{ type: "text", text: "Thời điểm t" }], rowSpan: 1, colSpan: 1 },
        { blocks: [{ type: "text", text: "Li độ x" }], rowSpan: 1, colSpan: 1 },
      ],
      [
        { blocks: [{ type: "text", text: "0 s" }], rowSpan: 1, colSpan: 1 },
        { blocks: [{ type: "text", text: "2 cm" }], rowSpan: 1, colSpan: 1 },
      ],
    ],
  },
];

export function createSampleImportJob(overrides?: Partial<ImportJob>): ImportJob {
  const drafts: ImportDraft[] = [
    {
      draftId: "draft-01",
      question: sampleMissingKeyPartI,
      provenance: {
        sourceId: "de-toan-thpt.docx",
        location: "Trang 1, Đoạn 5",
        confidence: null,
        flags: [PREVIEW_FLAGS.KEY_MISSING],
      },
      confirmed: false,
    },
    {
      draftId: "draft-02",
      question: sampleMissingKeyPartII,
      provenance: {
        sourceId: "de-toan-thpt.docx",
        location: "Trang 2, Đoạn 15",
        confidence: null,
        flags: [PREVIEW_FLAGS.KEY_MISSING],
      },
      confirmed: false,
    },
    {
      draftId: "draft-03",
      question: sampleMissingKeyPartIII,
      provenance: {
        sourceId: "de-toan-thpt.docx",
        location: "Trang 3, Đoạn 25",
        confidence: null,
        flags: [PREVIEW_FLAGS.KEY_MISSING],
      },
      confirmed: false,
    },
    {
      draftId: "draft-04-omml",
      question: {
        kind: "I",
        questionVersionId: "q-p1-omml",
        title: "Câu 4: Công thức có OMML",
        content: "Chọn khẳng định đúng về dao động:",
        blocks: sampleBlocksWithOmml,
        options: [
          { optionId: "opt-4a", label: "A", text: "Dao động điều hòa" },
          { optionId: "opt-4b", label: "B", text: "Dao động tắt dần" },
          { optionId: "opt-4c", label: "C", text: "Dao động cưỡng bức" },
          { optionId: "opt-4d", label: "D", text: "Cộng hưởng" },
        ],
        correctOptionId: "opt-4a",
      },
      provenance: {
        sourceId: "de-toan-thpt.docx",
        location: "Trang 4, Đoạn 35",
        confidence: null,
        flags: [PREVIEW_FLAGS.OMML_UNSUPPORTED],
      },
      confirmed: false,
    },
    {
      draftId: "draft-05-pdf-manual",
      question: {
        kind: "III",
        questionVersionId: "q-p3-pdf",
        title: "Câu 5: Nhập tay từ PDF",
        content: "Tìm số giao điểm của đồ thị hàm số với trục hoành...",
        answerKey: "-0,5",
      },
      provenance: {
        sourceId: "de-ly-thpt.pdf",
        location: "Trang 1, Cột 2",
        confidence: null,
        flags: [PREVIEW_FLAGS.PDF_MANUAL_REVIEW_REQUIRED, PREVIEW_FLAGS.PDF_MANUAL_INPUT],
      },
      confirmed: false,
    },
  ];

  return {
    jobId: "job-sample-01",
    sourceId: "de-toan-thpt.docx",
    format: "docx",
    state: "preview",
    blocks: [],
    drafts,
    flags: [],
    ...overrides,
  };
}

export function createSampleTargetExamDraft(overrides?: Partial<ExamDraft>): ExamDraft {
  return {
    draftId: "target-exam-draft-01",
    revision: 1,
    exam: {
      schemaVersion: "web-exam-v1",
      examId: "exam-target-01",
      examVersionId: "v1",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      title: "Đề thi thử tốt nghiệp THPT",
      subject: "Toán",
      grade: 12,
      settings: {
        durationMinutes: 50,
        maxAttempts: null,
        releasePolicy: "immediate",
        shuffleQuestions: false,
        shuffleOptions: false,
      },
      questions: [
        {
          kind: "I",
          questionVersionId: "existing-q-01",
          title: "Câu có sẵn trong đề",
          content: "Câu hỏi tồn tại từ trước...",
          options: [
            { optionId: "ex-opt-1", label: "A", text: "1" },
            { optionId: "ex-opt-2", label: "B", text: "2" },
            { optionId: "ex-opt-3", label: "C", text: "3" },
            { optionId: "ex-opt-4", label: "D", text: "4" },
          ],
          correctOptionId: "ex-opt-1",
          provenance: {
            sourceId: "existing-file.docx",
            location: "Trang 1, Đoạn 1",
            confidence: 1.0,
            flags: [],
          },
        },
      ],
      assets: [],
    },
    ...overrides,
  };
}
