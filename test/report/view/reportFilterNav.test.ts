import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mount } from "../../../src/report/view.ts";
import type {
  ReportModel,
  WebExam,
  WebQuestion,
  AttemptRecord,
} from "../../../src/report/types.ts";
import { buildReport } from "../../../src/report/index.ts";
import { scoreAttempt, scoreResultToDTO } from "../../../src/domain/index.ts";
import { createMockDocument, MockElement } from "../../ui/core/dom-mock.ts";

function createMockExam(questions: WebQuestion[]): WebExam {
  return {
    schemaVersion: "web-exam-v1",
    examId: "exam-r4-test",
    examVersionId: "v1.0.0",
    title: "Đề Thi Khảo Sát R4 (§24.1)",
    subject: "Toán học",
    grade: 12,
    settings: {
      durationMinutes: 50,
      maxAttempts: null,
      releasePolicy: "immediate",
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    questions,
    assets: [],
  };
}

describe("R4 Report Filter & Navigation (§24.1 & §24.5)", () => {
  it("renders #reviewFilter with 3 filter buttons (all, wrong, blank) and correct initial aria-pressed", () => {
    const questions: WebQuestion[] = [
      {
        kind: "I",
        questionVersionId: "q-1",
        title: "Câu 1",
        options: [
          { optionId: "opt-1-a", text: "A" },
          { optionId: "opt-1-b", text: "B" },
          { optionId: "opt-1-c", text: "C" },
          { optionId: "opt-1-d", text: "D" },
        ],
        correctOptionId: "opt-1-a",
      },
      {
        kind: "I",
        questionVersionId: "q-2",
        title: "Câu 2",
        options: [
          { optionId: "opt-2-a", text: "A" },
          { optionId: "opt-2-b", text: "B" },
          { optionId: "opt-2-c", text: "C" },
          { optionId: "opt-2-d", text: "D" },
        ],
        correctOptionId: "opt-2-a",
      },
      {
        kind: "I",
        questionVersionId: "q-3",
        title: "Câu 3",
        options: [
          { optionId: "opt-3-a", text: "A" },
          { optionId: "opt-3-b", text: "B" },
          { optionId: "opt-3-c", text: "C" },
          { optionId: "opt-3-d", text: "D" },
        ],
        correctOptionId: "opt-3-a",
      },
    ];

    const exam = createMockExam(questions);
    const domainExam = {
      examId: exam.examId,
      examVersionId: exam.examVersionId,
      ruleSetId: "custom-v1" as const,
      inputPolicyId: "sa-charset-v1" as const,
      questions: [
        {
          kind: "I" as const,
          questionVersionId: "q-1",
          options: [{ optionId: "opt-1-a" }, { optionId: "opt-1-b" }, { optionId: "opt-1-c" }, { optionId: "opt-1-d" }],
          correctOptionId: "opt-1-a",
        },
        {
          kind: "I" as const,
          questionVersionId: "q-2",
          options: [{ optionId: "opt-2-a" }, { optionId: "opt-2-b" }, { optionId: "opt-2-c" }, { optionId: "opt-2-d" }],
          correctOptionId: "opt-2-a",
        },
        {
          kind: "I" as const,
          questionVersionId: "q-3",
          options: [{ optionId: "opt-3-a" }, { optionId: "opt-3-b" }, { optionId: "opt-3-c" }, { optionId: "opt-3-d" }],
          correctOptionId: "opt-3-a",
        },
      ],
    };

    // q-1: full, q-2: wrong, q-3: blank
    const responses = {
      attemptId: "att-r4",
      examVersionId: exam.examVersionId,
      responses: [
        { kind: "I" as const, questionVersionId: "q-1", selectedOptionId: "opt-1-a" },
        { kind: "I" as const, questionVersionId: "q-2", selectedOptionId: "opt-2-b" },
      ],
    };

    const scoreRes = scoreAttempt(domainExam, responses);
    const scoreDTO = scoreResultToDTO(scoreRes);

    const record: AttemptRecord = {
      examId: exam.examId,
      examVersionId: exam.examVersionId,
      attemptId: "att-r4",
      schemaVersion: "web-attempt-v1",
      revision: 1,
      candidateName: "Học sinh R4",
      examSnapshot: exam,
      presentationOrder: { questionOrder: ["q-1", "q-2", "q-3"], optionOrder: [], seed: "test-seed" },
      responses,
      startedAt: 1000,
      deadline: 4000,
      phase: "final",
      submittedAt: 2000,
      scoreDTO,
    };

    const reportRes = buildReport(record, 2000);
    assert.equal(reportRes.ok, true);
    if (!reportRes.ok) return;

    const doc = createMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    let retryWrongCalled = false;
    const unmount = mount(root as unknown as HTMLElement, { report: reportRes.value }, {
      retryWrong: () => {
        retryWrongCalled = true;
      },
    });

    // 1. Check #reviewFilter
    const filterBar = root.querySelector("#reviewFilter") as unknown as MockElement;
    assert.ok(filterBar, "#reviewFilter must exist");

    const buttons = filterBar.querySelectorAll("button");
    assert.equal(buttons.length, 3, "Must have 3 filter buttons");

    const btnAll = filterBar.querySelector('[data-filter="all"]') as unknown as MockElement;
    const btnWrong = filterBar.querySelector('[data-filter="wrong"]') as unknown as MockElement;
    const btnBlank = filterBar.querySelector('[data-filter="blank"]') as unknown as MockElement;

    assert.ok(btnAll, "Must have 'all' button");
    assert.ok(btnWrong, "Must have 'wrong' button");
    assert.ok(btnBlank, "Must have 'blank' button");

    assert.match(btnAll.textContent, /Tất cả/);
    assert.match(btnWrong.textContent, /Sai/);
    assert.match(btnBlank.textContent, /Bỏ trống/);

    assert.equal(btnAll.getAttribute("aria-pressed"), "true");
    assert.equal(btnWrong.getAttribute("aria-pressed"), "false");
    assert.equal(btnBlank.getAttribute("aria-pressed"), "false");

    // 2. Check question visibility initially
    const cards = root.querySelectorAll(".review-question-card");
    assert.equal(cards.length, 3);
    for (const card of cards) {
      assert.notEqual(card.style.display, "none", "All cards visible initially");
    }

    // 3. Filter by wrong
    btnWrong.click();
    assert.equal(btnAll.getAttribute("aria-pressed"), "false");
    assert.equal(btnWrong.getAttribute("aria-pressed"), "true");
    assert.equal(btnBlank.getAttribute("aria-pressed"), "false");

    const card1 = root.querySelector("#q-q-1");
    const card2 = root.querySelector("#q-q-2");
    const card3 = root.querySelector("#q-q-3");

    assert.equal(card1?.style.display, "none", "q-1 (full) hidden under wrong filter");
    assert.notEqual(card2?.style.display, "none", "q-2 (wrong) visible under wrong filter");
    assert.equal(card3?.style.display, "none", "q-3 (blank) hidden under wrong filter");

    // 4. Filter by blank
    btnBlank.click();
    assert.equal(btnAll.getAttribute("aria-pressed"), "false");
    assert.equal(btnWrong.getAttribute("aria-pressed"), "false");
    assert.equal(btnBlank.getAttribute("aria-pressed"), "true");

    assert.equal(card1?.style.display, "none", "q-1 hidden under blank filter");
    assert.equal(card2?.style.display, "none", "q-2 hidden under blank filter");
    assert.notEqual(card3?.style.display, "none", "q-3 (blank) visible under blank filter");

    // 5. Restore all
    btnAll.click();
    assert.equal(btnAll.getAttribute("aria-pressed"), "true");
    assert.notEqual(card1?.style.display, "none");
    assert.notEqual(card2?.style.display, "none");
    assert.notEqual(card3?.style.display, "none");

    // 6. Check #reviewNav
    const navBar = root.querySelector("#reviewNav") as unknown as MockElement;
    assert.ok(navBar, "#reviewNav must exist");

    const links = navBar.querySelectorAll("a");
    assert.equal(links.length, 3, "Must have 3 links in #reviewNav");

    const link1 = navBar.querySelector('[data-qid="q-1"]') as unknown as MockElement;
    const link2 = navBar.querySelector('[data-qid="q-2"]') as unknown as MockElement;
    const link3 = navBar.querySelector('[data-qid="q-3"]') as unknown as MockElement;

    assert.ok(link1);
    assert.ok(link2);
    assert.ok(link3);

    assert.equal(link1.getAttribute("href"), "#q-q-1");
    assert.equal(link2.getAttribute("href"), "#q-q-2");
    assert.equal(link3.getAttribute("href"), "#q-q-3");

    assert.equal(link1.getAttribute("data-qid"), "q-1");
    assert.equal(link2.getAttribute("data-qid"), "q-2");
    assert.equal(link3.getAttribute("data-qid"), "q-3");

    assert.match(link1.textContent, /\b1\b/);
    assert.match(link2.textContent, /\b2\b/);
    assert.match(link3.textContent, /\b3\b/);

    assert.match(link2.textContent + " " + (link2.getAttribute("aria-label") ?? ""), /Sai/i);
    assert.match(link3.textContent + " " + (link3.getAttribute("aria-label") ?? ""), /Bỏ trống/i);

    // 7. Check #btnRetryWrong
    const btnRetryWrong = root.querySelector("#btnRetryWrong");
    assert.ok(btnRetryWrong, "#btnRetryWrong must exist (§24.5)");
    (btnRetryWrong as unknown as MockElement).click();
    assert.equal(retryWrongCalled, true, "Clicking #btnRetryWrong invokes action");

    unmount();
  });

  it("navigating via #reviewNav resets filter to 'all' if target was filtered out", () => {
    const questions: WebQuestion[] = [
      {
        kind: "I",
        questionVersionId: "q-a",
        title: "Câu A",
        options: [
          { optionId: "opt-a-1", text: "A" },
          { optionId: "opt-a-2", text: "B" },
          { optionId: "opt-a-3", text: "C" },
          { optionId: "opt-a-4", text: "D" },
        ],
        correctOptionId: "opt-a-1",
      },
      {
        kind: "I",
        questionVersionId: "q-b",
        title: "Câu B",
        options: [
          { optionId: "opt-b-1", text: "A" },
          { optionId: "opt-b-2", text: "B" },
          { optionId: "opt-b-3", text: "C" },
          { optionId: "opt-b-4", text: "D" },
        ],
        correctOptionId: "opt-b-1",
      },
    ];

    const exam = createMockExam(questions);
    const domainExam = {
      examId: exam.examId,
      examVersionId: exam.examVersionId,
      ruleSetId: "custom-v1" as const,
      inputPolicyId: "sa-charset-v1" as const,
      questions: [
        {
          kind: "I" as const,
          questionVersionId: "q-a",
          options: [{ optionId: "opt-a-1" }, { optionId: "opt-a-2" }, { optionId: "opt-a-3" }, { optionId: "opt-a-4" }],
          correctOptionId: "opt-a-1",
        },
        {
          kind: "I" as const,
          questionVersionId: "q-b",
          options: [{ optionId: "opt-b-1" }, { optionId: "opt-b-2" }, { optionId: "opt-b-3" }, { optionId: "opt-b-4" }],
          correctOptionId: "opt-b-1",
        },
      ],
    };

    // q-a: correct, q-b: wrong
    const responses = {
      attemptId: "att-nav-reset",
      examVersionId: exam.examVersionId,
      responses: [
        { kind: "I" as const, questionVersionId: "q-a", selectedOptionId: "opt-a-1" },
        { kind: "I" as const, questionVersionId: "q-b", selectedOptionId: "opt-b-2" },
      ],
    };

    const scoreRes = scoreAttempt(domainExam, responses);
    const scoreDTO = scoreResultToDTO(scoreRes);

    const record: AttemptRecord = {
      examId: exam.examId,
      examVersionId: exam.examVersionId,
      attemptId: "att-nav-reset",
      schemaVersion: "web-attempt-v1",
      revision: 1,
      candidateName: "Học sinh Reset",
      examSnapshot: exam,
      presentationOrder: { questionOrder: ["q-a", "q-b"], optionOrder: [], seed: "test-seed" },
      responses,
      startedAt: 1000,
      deadline: 4000,
      phase: "final",
      submittedAt: 2000,
      scoreDTO,
    };

    const reportRes = buildReport(record, 2000);
    assert.equal(reportRes.ok, true);
    if (!reportRes.ok) return;

    const doc = createMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const unmount = mount(root as unknown as HTMLElement, { report: reportRes.value });

    const filterBar = root.querySelector("#reviewFilter") as unknown as MockElement;
    assert.ok(filterBar);
    const btnWrong = filterBar.querySelector('[data-filter="wrong"]') as unknown as MockElement;
    assert.ok(btnWrong);
    btnWrong.click();

    const cardA = root.querySelector("#q-q-a");
    assert.equal(cardA?.style.display, "none", "Card A hidden under wrong filter");

    // Click link for q-a in nav
    const navBar = root.querySelector("#reviewNav") as unknown as MockElement;
    assert.ok(navBar);
    const linkA = navBar.querySelector('[data-qid="q-a"]') as unknown as MockElement;
    assert.ok(linkA);

    let scrolled = false;
    (cardA as any).scrollIntoView = () => {
      scrolled = true;
    };

    linkA.click();

    // After clicking, filter should reset to 'all' so cardA is visible
    assert.notEqual(cardA?.style.display, "none", "Card A must be unhidden when navigated to");
    assert.equal(scrolled, true, "scrollIntoView called on target card");

    const btnAll = filterBar.querySelector('[data-filter="all"]') as unknown as MockElement;
    assert.equal(btnAll?.getAttribute("aria-pressed"), "true");

    unmount();
  });
});
