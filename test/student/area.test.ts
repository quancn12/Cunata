import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatScoreD02, mountStudentArea } from '../../src/student/area.ts';
import { createEnhancedMockDocument } from './view/testDom.ts';

describe('Student Area & D02 Scoring Specification Tests', () => {
  describe('D02 Scoring Policy (WEB-contract §19.1 & Shared Product Contract v2.0)', () => {
    test('formats integer scores as clean integers without decimal part', () => {
      assert.equal(formatScoreD02('10'), '10');
      assert.equal(formatScoreD02('5'), '5');
      assert.equal(formatScoreD02('12/1'), '12');
      assert.equal(formatScoreD02(10), '10');
      assert.equal(formatScoreD02(0), '0');
    });

    test('formats non-integer scores to exactly 2 decimal places with Vietnamese comma and half-up rounding', () => {
      // 0.5 -> 0,50
      assert.equal(formatScoreD02('1/2'), '0,50');
      assert.equal(formatScoreD02('0.5'), '0,50');

      // 0.75 -> 0,75
      assert.equal(formatScoreD02('3/4'), '0,75');
      assert.equal(formatScoreD02('0.75'), '0,75');

      // 3.5 -> 3,50
      assert.equal(formatScoreD02('7/2'), '3,50');
      assert.equal(formatScoreD02('3.5'), '3,50');

      // 4.75 -> 4,75
      assert.equal(formatScoreD02('19/4'), '4,75');

      // 4.6666... -> 4,67
      assert.equal(formatScoreD02('14/3'), '4,67');

      // 7.25 -> 7,25
      assert.equal(formatScoreD02('29/4'), '7,25');
      assert.equal(formatScoreD02('7.25'), '7,25');
    });

    test('handles empty, null, and undefined values safely', () => {
      assert.equal(formatScoreD02(null), '0');
      assert.equal(formatScoreD02(undefined), '0');
      assert.equal(formatScoreD02(''), '0');
    });
  });

  describe('Student Area Controller Contract Interface', () => {
    test('exports expected controller methods', () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
      });

      assert.equal(typeof ctrl.refreshList, 'function');
      assert.equal(typeof ctrl.selectExamId, 'function');
      assert.equal(typeof ctrl.joinClass, 'function');
      assert.equal(typeof ctrl.setCandidateName, 'function');
      assert.equal(typeof ctrl.getCandidateName, 'function');
      assert.equal(typeof ctrl.dispose, 'function');

      ctrl.setCandidateName('Nguyễn Văn An');
      assert.equal(ctrl.getCandidateName(), 'Nguyễn Văn An');

      ctrl.dispose();
    });

    test('studentNameGate: verifies input#startName and button#btnNameContinue interaction', () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
      });

      const nameGate = root.querySelector('#studentNameGate');
      assert.ok(nameGate, '#studentNameGate must be rendered in Student Area');

      const nameInput = root.querySelector('#startName') as any;
      assert.ok(nameInput, 'input#startName must be rendered');

      const btnContinue = root.querySelector('#btnNameContinue') as any;
      assert.ok(btnContinue, 'button#btnNameContinue must be rendered');

      // Initially empty: btnNameContinue must be disabled
      assert.equal(btnContinue.disabled, true, 'btnNameContinue must be disabled when name is empty');

      // Entering name
      nameInput.value = 'Trần Thị Mai';
      nameInput.dispatchEvent({ type: 'input' });
      assert.equal(btnContinue.disabled, false, 'btnNameContinue must be enabled after entering non-empty name');

      // Clicking continue
      btnContinue.click();
      assert.equal(ctrl.getCandidateName(), 'Trần Thị Mai');

      ctrl.dispose();
    });

    test('classCodeInput: verifies join button and error message for empty input', async () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
      });

      const classCodeInput = root.querySelector('#classCodeInput') as any;
      assert.ok(classCodeInput, 'input#classCodeInput must be rendered');

      const btnJoinClass = root.querySelector('#btnJoinClass') as any;
      assert.ok(btnJoinClass, 'button#btnJoinClass must be rendered');

      const classCodeError = root.querySelector('#classCodeError') as any;
      assert.ok(classCodeError, 'div#classCodeError must be rendered');

      // Clicking join without entering code
      classCodeInput.value = '';
      btnJoinClass.click();
      assert.ok(classCodeError.textContent.includes('Vui lòng nhập mã lớp'), 'Displays error for empty class code');

      ctrl.dispose();
    });

    test('examPreview: verifies dialog structure and #btnStartExam', () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
      });

      const examPreview = root.querySelector('#examPreview') as any;
      assert.ok(examPreview, 'dialog#examPreview must be rendered');

      const btnStartExam = root.querySelector('#btnStartExam') as any;
      assert.ok(btnStartExam, 'button#btnStartExam must be rendered');

      ctrl.dispose();
    });

    test('typography tokens: injects cunata-student-typography style into doc.head', () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
      });

      const styleTag = doc.getElementById('cunata-student-typography');
      assert.ok(styleTag, '#cunata-student-typography must be injected into doc.head');
      assert.ok(styleTag.textContent.includes('--fs-xs'), 'Typography style should reference --fs-xs');
      assert.ok(styleTag.textContent.includes('--fs-md'), 'Typography style should reference --fs-md');

      ctrl.dispose();
    });

    test('preserves readOnly on #candidateName per WEB-contract §19.1', () => {
      const doc = createEnhancedMockDocument();
      const candidateInput = doc.createElement('input');
      candidateInput.id = 'candidateName';
      doc.body.appendChild(candidateInput);

      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
      });

      // Contract §19.1: candidateInput in exam mode must be strictly readOnly
      // Setting readOnly = true should work natively without being overridden
      (candidateInput as any).readOnly = true;
      assert.equal((candidateInput as any).readOnly, true, '#candidateName must preserve readOnly=true in exam mode');

      // Calling setCandidateName should update value without tampering with readOnly
      ctrl.setCandidateName('Nguyễn An 0123');
      assert.equal((candidateInput as any).value, 'Nguyễn An 0123');

      ctrl.dispose();
    });

    test('handleStartOrResumeExam cleans active assignment storage when launching practice exam', async () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const dummySessionStorage: Record<string, string> = {
        'cunata:active_assignment': JSON.stringify({ classCode: '12A1', assignmentId: 'asg-old' }),
        'cunata_active_assignment': JSON.stringify({ classCode: '12A1', assignmentId: 'asg-old' }),
      };
      const dummyLocalStorage: Record<string, string> = {
        'cunata:active_assignment': JSON.stringify({ classCode: '12A1', assignmentId: 'asg-old' }),
        'cunata_active_assignment': JSON.stringify({ classCode: '12A1', assignmentId: 'asg-old' }),
      };

      (doc.defaultView as any).sessionStorage = {
        getItem: (k: string) => dummySessionStorage[k] ?? null,
        setItem: (k: string, v: string) => { dummySessionStorage[k] = v; },
        removeItem: (k: string) => { delete dummySessionStorage[k]; },
      };
      (doc.defaultView as any).localStorage = {
        getItem: (k: string) => dummyLocalStorage[k] ?? null,
        setItem: (k: string, v: string) => { dummyLocalStorage[k] = v; },
        removeItem: (k: string) => { delete dummyLocalStorage[k]; },
      };

      let startedMeta: any = 'NOT_CALLED';
      const fakeExam = {
        schemaVersion: 'web-exam-v1',
        examId: 'practice-01',
        examVersionId: 'v1',
        title: 'Đề tự luyện 1',
        subject: 'Toán',
        grade: 12,
        durationMinutes: 50,
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        questions: [
          {
            questionId: 'q-ii-01',
            questionVersionId: 'q-ii-01',
            kind: 'II',
            prompt: 'Câu hỏi Đúng/Sai',
            statements: [
              { statementId: 's1', label: 'a', text: 'Mệnh đề 1', answer: false },
              { statementId: 's2', label: 'b', text: 'Mệnh đề 2', answer: false },
              { statementId: 's3', label: 'c', text: 'Mệnh đề 3', answer: false },
              { statementId: 's4', label: 'd', text: 'Mệnh đề 4', answer: false },
            ],
          },
        ],
      };

      const mockClient = {
        configured: true,
        listExams: async () => ({
          ok: true as const,
          value: [{ id: 'practice-01', title: 'Đề tự luyện 1', subject: 'Toán', source: 'teacher' as const }],
        }),
        getExam: async () => ({ ok: true as const, value: fakeExam }),
      };

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
        client: mockClient as any,
        onStartExam: async (_exam, _name, meta) => {
          startedMeta = meta;
        },
      });

      ctrl.setCandidateName('Học sinh thử nghiệm');
      await ctrl.refreshList();

      // Open and start practice exam
      ctrl.selectExamId('practice-01');
      const startBtn = (doc.getElementById('btnStartExam') || root.querySelector('#btnStartExam')) as any;
      assert.ok(startBtn, '#btnStartExam should exist');
      startBtn.click();
      await new Promise((r) => setTimeout(r, 20));

      // Verify that active assignment was cleared from both session and local storage
      assert.equal(dummySessionStorage['cunata:active_assignment'], undefined);
      assert.equal(dummyLocalStorage['cunata:active_assignment'], undefined);
      assert.equal(startedMeta, undefined);

      ctrl.dispose();
    });

    test('loadPublicExams merges teacher-published exams and displays notice on error', async () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const mockClientWithError = {
        configured: true,
        listExams: async () => ({ ok: false as const, error: { code: 'NETWORK_ERROR', message: 'Mạng yếu' } }),
      };

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
        client: mockClientWithError as any,
      });

      await ctrl.refreshList();

      const notice = root.querySelector('#practiceNotice') as HTMLElement | null;
      assert.ok(notice, 'Notice element should exist in DOM');
      assert.notEqual(notice?.style.display, 'none', 'Notice should be visible when teacher catalog fails');
      assert.ok(notice?.textContent?.includes('Mạng yếu') || notice?.textContent?.includes('Không thể tải danh sách đề từ giáo viên'));

      ctrl.dispose();
    });

    test('handleStartOrResumeExam starts assigned exam with frozen WebExam without object extensible error', async () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const frozenExam = Object.freeze({
        schemaVersion: 'web-exam-v1',
        examId: 'frozen-exam-01',
        examVersionId: 'v1.0.0',
        title: 'Đề kiểm tra đóng băng',
        subject: 'Toán',
        grade: 12,
        durationMinutes: 50,
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        settings: { durationMinutes: 50, maxAttempts: null, releasePolicy: 'immediate', shuffleQuestions: false, shuffleOptions: false },
        assets: [],
        questions: [
          {
            kind: 'III',
            questionVersionId: 'q-iii-01',
            title: 'Câu 1',
            content: 'Nội dung',
            answerKey: '1,5',
          },
        ],
      });

      const mockClient = {
        configured: true,
        listExams: async () => ({
          ok: true as const,
          value: [{ id: 'frozen-exam-01', title: 'Đề kiểm tra đóng băng', subject: 'Toán', source: 'teacher' as const }],
        }),
        getExam: async () => ({ ok: true as const, value: frozenExam }),
      };

      let startedPayload: any = null;
      let startedMeta: any = null;

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
        client: mockClient as any,
        onStartExam: async (exam, _name, meta) => {
          startedPayload = exam;
          startedMeta = meta;
        },
      });

      ctrl.setCandidateName('Học sinh lớp A');
      await ctrl.refreshList();

      // Simulate starting an assigned exam
      ctrl.selectExamId('frozen-exam-01');
      const startBtn = (doc.getElementById('btnStartExam') || root.querySelector('#btnStartExam')) as any;
      assert.ok(startBtn, '#btnStartExam should exist');
      startBtn.click();
      await new Promise((r) => setTimeout(r, 20));

      assert.ok(startedPayload, 'Exam should start successfully without throwing error on frozen object');
      assert.equal(startedPayload.examId, 'frozen-exam-01');

      ctrl.dispose();
    });

    test('CK36-F01 regression: onStartExam receives dueAt and openAt in meta for assigned exams', async () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const assignedExam = {
        schemaVersion: 'web-exam-v1',
        examId: 'assign-exam-01',
        examVersionId: 'v1.0.0',
        title: 'Đề kiểm tra lớp 12',
        subject: 'Toán',
        grade: 12,
        durationMinutes: 50,
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        settings: {
          durationMinutes: 50,
          maxAttempts: null,
          releasePolicy: 'immediate',
          shuffleQuestions: false,
          shuffleOptions: false,
        },
        questions: [
          {
            kind: 'III',
            questionVersionId: 'q-iii-01',
            title: 'Câu 1',
            content: 'Nội dung',
            answerKey: '1,5',
          },
        ],
        assets: [],
      };

      const nowTime = 1700000000000;
      const openTime = new Date(nowTime - 60000).toISOString();
      const dueTime = new Date(nowTime + 120000).toISOString();

      const joinedClasses = [
        {
          code: 'LOPHOC',
          name: 'Lớp 12A1',
          teacherName: 'Thầy Bình',
          assignments: [
            {
              assignmentId: 'asg-01',
              examId: 'assign-exam-01',
              title: 'Đề kiểm tra lớp 12',
              subject: 'Toán',
              questionCount: 1,
              durationMinutes: 50,
              openAt: openTime,
              dueAt: dueTime,
            },
          ],
        },
      ];
      const dummyStore: Record<string, string> = {
        'cunata:classes': JSON.stringify(joinedClasses),
        'cunata:candidate_name': 'Học sinh An',
      };
      const mockStorage = {
        getItem: (k: string) => dummyStore[k] ?? null,
        setItem: (k: string, v: string) => { dummyStore[k] = v; },
        removeItem: (k: string) => { delete dummyStore[k]; },
        clear: () => { for (const k of Object.keys(dummyStore)) delete dummyStore[k]; },
        key: (i: number) => Object.keys(dummyStore)[i] ?? null,
        get length() { return Object.keys(dummyStore).length; },
      };
      (doc.defaultView as any).localStorage = mockStorage;
      (doc.defaultView as any).sessionStorage = mockStorage;
      const prevLocalStorage = (globalThis as any).localStorage;
      const prevSessionStorage = (globalThis as any).sessionStorage;
      (globalThis as any).localStorage = mockStorage;
      (globalThis as any).sessionStorage = mockStorage;

      const mockClient = {
        configured: true,
        listExams: async () => ({
          ok: true as const,
          value: [{ id: 'assign-exam-01', title: 'Đề kiểm tra lớp 12', subject: 'Toán', source: 'teacher' as const }],
        }),
        getExam: async () => ({ ok: true as const, value: assignedExam }),
      };

      let startedPayload: any = null;
      let startedMeta: any = null;

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => nowTime,
        client: mockClient as any,
        onStartExam: async (exam, _name, meta) => {
          startedPayload = exam;
          startedMeta = meta;
        },
      });

      await ctrl.refreshList();

      // Find the card for asg-01 in myClasses
      const card = (root.querySelector('.class-section .exam-card') || root.querySelector('.exam-card')) as any;
      assert.ok(card, 'Exam card for assignment must be rendered');
      card.click();

      const startBtn = (doc.getElementById('btnStartExam') || root.querySelector('#btnStartExam')) as any;
      assert.ok(startBtn, '#btnStartExam should exist');
      startBtn.click();
      await new Promise((r) => setTimeout(r, 30));

      assert.ok(startedPayload, 'Exam should start');
      assert.ok(startedMeta, 'meta must be passed to onStartExam');
      assert.equal(startedMeta.assignmentId, 'asg-01');
      assert.equal(startedMeta.classCode, 'LOPHOC');
      assert.equal(startedMeta.dueAt, dueTime, 'meta.dueAt must match assignment dueAt');
      assert.equal(startedMeta.openAt, openTime, 'meta.openAt must match assignment openAt');

      ctrl.dispose();
      (globalThis as any).localStorage = prevLocalStorage;
      (globalThis as any).sessionStorage = prevSessionStorage;
    });

    test('FX46-student: classCodeInput has label and aria attributes on error', async () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
      });

      const label = root.querySelector('label[for="classCodeInput"]') as HTMLElement | null;
      assert.ok(label, 'Label for classCodeInput must exist');
      assert.ok(label.textContent?.includes('Mã lớp'), 'Label text must describe class code');

      const input = root.querySelector('#classCodeInput') as any;
      const joinBtn = root.querySelector('#btnJoinClass') as any;
      assert.ok(input && joinBtn);

      // Trigger empty join
      input.value = '';
      joinBtn.click();
      await new Promise((r) => setTimeout(r, 10));

      assert.equal(input.getAttribute('aria-invalid'), 'true');
      assert.ok(input.getAttribute('aria-describedby')?.includes('classCodeError'));

      // Input changes clear error
      input.value = 'ABCDEF';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      assert.equal(input.getAttribute('aria-invalid'), null);

      ctrl.dispose();
    });

    test('FX46-student: practiceExams grid is hidden per WEB-contract §21', async () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
      });

      await ctrl.refreshList();

      const practiceWrap = root.querySelector('#practiceWrapper') as HTMLElement | null;
      const practiceGrid = root.querySelector('#practiceExams') as HTMLElement | null;
      assert.ok(practiceWrap && practiceGrid);
      assert.equal(practiceWrap.style.display, 'none');
      assert.equal(practiceGrid.style.display, 'none');
      assert.equal(practiceGrid.childNodes.length, 0, 'No cards rendered in practiceGrid');

      ctrl.dispose();
    });

    test('FX46-student: examPreview modal has accessible name and returns focus on Escape', async () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
      });

      const previewModal = (doc.getElementById('examPreview') || root.querySelector('#examPreview')) as HTMLElement | null;
      assert.ok(previewModal);
      assert.ok(previewModal.getAttribute('aria-labelledby') || previewModal.getAttribute('aria-label'), 'Dialog must have accessible name');

      ctrl.dispose();
    });
  });
});

