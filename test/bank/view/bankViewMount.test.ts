import test from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '../../../src/bank/view.ts';
import type { BankEntry, ExamDraft } from '../../../src/bank/types.ts';
import type { BankViewModel } from '../../../src/bank/view.ts';
import { createMockDocument, MockElement, MockEvent } from '../../ui/core/dom-mock.ts';
import { InMemoryStoragePort } from '../core/testStorage.ts';

const testBankEntries: readonly BankEntry[] = [
  {
    questionId: 'q-view-01',
    questionVersionId: 'q-view-01-v1',
    revision: 1,
    taxonomy: {
      subject: 'Toán học',
      grade: 12,
      topic: 'Khảo sát hàm số',
      lesson: 'Đơn điệu của hàm số',
      difficulty: 'Nhận biết',
    },
    question: {
      kind: 'I',
      questionVersionId: 'q-view-01-v1',
      title: 'Hàm số đồng biến trên khoảng nào?',
      content: 'Cho hàm số $y = x^3 - 3x$.',
      explanation: 'Đạo hàm $y\' = 3(x^2 - 1) > 0$ khi $|x| > 1$.',
      options: [
        { optionId: 'opt-1', label: 'A', text: '$(1; +\\infty)$' },
        { optionId: 'opt-2', label: 'B', text: '$(-1; 1)$' },
        { optionId: 'opt-3', label: 'C', text: '$(-\\infty; 1)$' },
        { optionId: 'opt-4', label: 'D', text: '$(0; 2)$' },
      ],
      correctOptionId: 'opt-1',
      provenance: {
        sourceId: 'de-mau-thpt-2025',
        location: 'Trang 1, Câu 1',
        confidence: 0.99,
        flags: ['chuan-hoa'],
      },
    },
  },
  {
    questionId: 'q-view-02',
    questionVersionId: 'q-view-02-v1',
    revision: 1,
    taxonomy: {
      subject: 'Toán học',
      grade: 12,
      topic: 'Tích phân',
      lesson: 'Định nghĩa tích phân',
      difficulty: 'Thông hiểu',
    },
    question: {
      kind: 'II',
      questionVersionId: 'q-view-02-v1',
      title: 'Các khẳng định về tích phân',
      content: 'Cho các hàm số liên tục trên đoạn $[a; b]$.',
      statements: [
        { statementId: 'st-1', label: 'a', text: '$\\int_a^b f(x)dx = -\\int_b^a f(x)dx$', answer: true, explanation: 'Đúng theo tính chất' },
        { statementId: 'st-2', label: 'b', text: '$\\int_a^a f(x)dx = 0$', answer: true, explanation: 'Cận bằng nhau' },
        { statementId: 'st-3', label: 'c', text: '$\\int_a^b dx = b - a$', answer: true, explanation: 'Đúng' },
        { statementId: 'st-4', label: 'd', text: '$\\int_a^b f(x)dx > 0$ với mọi $f(x)$', answer: false, explanation: 'Sai nếu $f(x) < 0$' },
      ],
    },
  },
  {
    questionId: 'q-view-03',
    questionVersionId: 'q-view-03-v1',
    revision: 1,
    taxonomy: {
      subject: 'Vật lí',
      grade: 11,
      topic: 'Dao động',
      lesson: 'Con lắc lò xo',
      difficulty: 'Vận dụng',
    },
    question: {
      kind: 'III',
      questionVersionId: 'q-view-03-v1',
      title: 'Giá trị li độ tại thời điểm t',
      content: 'Phương trình dao động $x = 5\\cos(2\\pi t)$ cm. Tại $t = 0,5$ s, li độ $x$ bằng bao nhiêu?',
      explanation: '$x = 5\\cos(\\pi) = -5$ cm.',
      answerKey: '-5',
    },
  },
];

function createMockDraft(): ExamDraft {
  return {
    draftId: 'draft-test-01',
    revision: 1,
    exam: {
      schemaVersion: 'web-exam-v1',
      examId: 'exam-draft-01',
      examVersionId: 'exam-draft-01-v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      title: 'Đề thi nháp',
      subject: 'Toán học',
      grade: 12,
      settings: {
        durationMinutes: 50,
        maxAttempts: 1,
        releasePolicy: 'immediate',
        shuffleQuestions: false,
        shuffleOptions: false,
      },
      assets: [],
      questions: [],
    },
  };
}

function fire(el: MockElement, type: string) {
  el.dispatchEvent(new MockEvent(type));
}

test('mount: renders basic container and conforms to WEB-contract.md §5 signature', () => {
  const doc = createMockDocument();
  const root = doc.createElement('div');

  const unmount = mount(root as unknown as HTMLElement, { entries: testBankEntries });
  assert.equal(typeof unmount, 'function');

  // Verify view container was mounted
  const viewContainer = root.querySelector('.cunata-bank-view');
  assert.ok(viewContainer);

  // Unmount cleans up
  unmount();
  assert.equal(root.textContent, '');
});

test('mount: honestly labels local-tool role without fake remote authentication', () => {
  const doc = createMockDocument();
  const root = doc.createElement('div');

  mount(root as unknown as HTMLElement, { entries: testBankEntries });

  const roleBanner = root.querySelector('.cunata-bank-role-banner');
  assert.ok(roleBanner, 'Must render role banner');

  const bannerText = roleBanner.textContent;
  assert.ok(bannerText.includes('CÔNG CỤ QUẢN LÝ NGÂN HÀNG CÂU HỎI (CỤC BỘ / OFFLINE)'));
  assert.ok(bannerText.includes('không đăng nhập máy chủ từ xa'));
  assert.ok(bannerText.includes('StoragePort'));
});

test('mount: renders 5-level concurrent filters and full question list', () => {
  const doc = createMockDocument();
  const root = doc.createElement('div');

  mount(root as unknown as HTMLElement, { entries: testBankEntries });

  // 1. Verify 5 filter fields exist in DOM
  assert.ok(root.querySelector('#cunata-filter-subject'), 'Level 1 Subject filter must exist');
  assert.ok(root.querySelector('#cunata-filter-grade'), 'Level 2 Grade filter must exist');
  assert.ok(root.querySelector('#cunata-filter-topic'), 'Level 3 Topic filter must exist');
  assert.ok(root.querySelector('#cunata-filter-lesson'), 'Level 4 Lesson filter must exist');
  assert.ok(root.querySelector('#cunata-filter-diff'), 'Level 5 Difficulty filter must exist');
  assert.ok(root.querySelector('#cunata-filter-kind'), 'Section/Kind filter must exist');
  assert.ok(root.querySelector('.cunata-search-input'), 'Search input must exist');

  // 2. Verify all 3 cards rendered initially
  const cards = root.querySelectorAll('.cunata-bank-card');
  assert.equal(cards.length, 3);

  const countBar = root.querySelector('.cunata-bank-results-count');
  assert.ok(countBar?.textContent.includes('Hiển thị 3 / 3 câu hỏi'));
});

test('mount: concurrent filter updates reactively narrow the question list', () => {
  const doc = createMockDocument();
  const root = doc.createElement('div');

  let lastFilterChange: unknown = null;
  mount(root as unknown as HTMLElement, { entries: testBankEntries }, {
    onFilterChange: (f) => {
      lastFilterChange = f;
    },
  });

  // Filter Level 1: Subject -> 'Toán học'
  const subjectSelect = root.querySelector<MockElement>('#cunata-filter-subject');
  assert.ok(subjectSelect);
  subjectSelect.value = 'Toán học';
  fire(subjectSelect, 'change');

  let cards = root.querySelectorAll('.cunata-bank-card');
  assert.equal(cards.length, 2, 'Should only show 2 Math questions');

  // Filter Level 5: Difficulty -> 'Nhận biết'
  const diffSelect = root.querySelector<MockElement>('#cunata-filter-diff');
  assert.ok(diffSelect);
  diffSelect.value = 'Nhận biết';
  fire(diffSelect, 'change');

  cards = root.querySelectorAll('.cunata-bank-card');
  assert.equal(cards.length, 1, 'Should only show 1 question (Math + Nhận biết)');
  assert.ok(cards[0]?.textContent.includes('Hàm số đồng biến trên khoảng nào?'));

  // Search input Unicode query: 'nghịch biến' -> no match
  const searchInput = root.querySelector<MockElement>('.cunata-search-input');
  assert.ok(searchInput);
  searchInput.value = 'không_tìm_thấy_từ_này';
  fire(searchInput, 'input');

  cards = root.querySelectorAll('.cunata-bank-card');
  assert.equal(cards.length, 0);
  assert.ok(root.querySelector('.cunata-bank-empty'), 'Empty state should appear');

  // Reset filters
  const resetBtn = root.querySelector<MockElement>('.cunata-reset-filter-btn');
  assert.ok(resetBtn);
  fire(resetBtn, 'click');

  cards = root.querySelectorAll('.cunata-bank-card');
  assert.equal(cards.length, 3, 'Should restore all 3 cards after reset');
});

test('mount: preview modal renders complete question details, blocks, choices, and statements', () => {
  const doc = createMockDocument();
  const root = doc.createElement('div');

  mount(root as unknown as HTMLElement, { entries: testBankEntries });

  // Click "Xem chi tiết" on first card (Part I)
  const previewBtns = root.querySelectorAll<MockElement>('.cunata-preview-btn');
  assert.ok(previewBtns.length > 0);
  const viewDetailBtn = previewBtns[0];
  assert.ok(viewDetailBtn);
  fire(viewDetailBtn, 'click');

  // Modal dialog appears
  const modalDialog = root.querySelector('.cunata-modal-dialog');
  assert.ok(modalDialog, 'Preview dialog must be opened');
  assert.ok(modalDialog.textContent.includes('Hàm số đồng biến trên khoảng nào?'));
  assert.ok(modalDialog.textContent.includes('Đạo hàm'));
  assert.ok(modalDialog.textContent.includes('Đáp án đúng'));
  assert.ok(modalDialog.textContent.includes('de-mau-thpt-2025')); // Provenance

  // Close modal via close button in footer
  const footer = root.querySelector('.cunata-modal-footer');
  assert.ok(footer);
  const closeBtn = footer.querySelectorAll<MockElement>('button').find((b) => b.textContent.includes('Đóng'));
  assert.ok(closeBtn);
  fire(closeBtn, 'click');

  assert.equal(root.querySelector('.cunata-modal-dialog'), null, 'Modal should be closed');
});

test('mount: callback reuse into draft integrates with addToDraft action', () => {
  const doc = createMockDocument();
  const root = doc.createElement('div');
  const draft = createMockDraft();

  let reusedEntry: BankEntry | null = null;
  let updatedDraft: ExamDraft | null = null;

  mount(
    root as unknown as HTMLElement,
    { entries: testBankEntries, draft },
    {
      addToDraft: (entry) => {
        reusedEntry = entry as BankEntry;
      },
      onDraftUpdated: (d) => {
        updatedDraft = d as ExamDraft;
      },
    },
  );

  // Click "Thêm vào đề" on the second question (Part II)
  const addBtns = root.querySelectorAll<MockElement>('.cunata-reuse-btn');
  assert.equal(addBtns.length, 3);
  const secondAddBtn = addBtns[1];
  assert.ok(secondAddBtn);
  fire(secondAddBtn, 'click');

  assert.ok(reusedEntry);
  assert.equal((reusedEntry as BankEntry).questionId, 'q-view-02');
});

test('mount: confirmed deletion requires explicit user confirmation before invoking deleteEntry', () => {
  const doc = createMockDocument();
  const root = doc.createElement('div');

  let deletedPayload: unknown = null;
  mount(
    root as unknown as HTMLElement,
    { entries: testBankEntries },
    {
      deleteEntry: (payload) => {
        deletedPayload = payload;
      },
    },
  );

  // 1. Click "Xóa" on first card
  const deleteBtns = root.querySelectorAll<MockElement>('.cunata-delete-btn');
  assert.equal(deleteBtns.length, 3);
  const firstDeleteBtn = deleteBtns[0];
  assert.ok(firstDeleteBtn);
  fire(firstDeleteBtn, 'click');

  // 2. Alert dialog appears; deletion has NOT occurred yet!
  const alertModal = root.querySelector('.cunata-modal-dialog');
  assert.ok(alertModal);
  assert.ok(alertModal.textContent.includes('Xác nhận xóa câu hỏi'));
  assert.equal(deletedPayload, null, 'Must not delete without explicit confirmation');

  // 3. Click "Hủy bỏ"
  const cancelBtn = alertModal.querySelectorAll<MockElement>('button').find((b) => b.textContent.includes('Hủy bỏ'));
  assert.ok(cancelBtn);
  fire(cancelBtn, 'click');
  assert.equal(root.querySelector('.cunata-modal-dialog'), null, 'Modal closed');
  assert.equal(deletedPayload, null);

  // 4. Click "Xóa" again and click "Xác nhận xóa"
  fire(firstDeleteBtn, 'click');
  const footer = root.querySelector('.cunata-modal-footer');
  assert.ok(footer);
  const confirmBtn = footer.querySelectorAll<MockElement>('button').find((b) => b.textContent.includes('Xác nhận xóa'));
  assert.ok(confirmBtn);
  fire(confirmBtn, 'click');

  assert.ok(deletedPayload);
  assert.deepEqual(deletedPayload, {
    questionVersionId: 'q-view-01-v1',
    revision: 1,
    confirmed: true,
  });
});

test('mount: export button triggers exportBank action with filtered entries', () => {
  const doc = createMockDocument();
  const root = doc.createElement('div');

  let exportedData: unknown = null;
  mount(
    root as unknown as HTMLElement,
    { entries: testBankEntries },
    {
      exportBank: (data) => {
        exportedData = data;
      },
    },
  );

  const topActions = root.querySelector('.cunata-bank-top-actions');
  assert.ok(topActions);
  const exportBtn = topActions.querySelectorAll<MockElement>('button').find((b) => b.textContent.includes('Xuất ngân hàng'));
  assert.ok(exportBtn);
  fire(exportBtn, 'click');

  assert.ok(exportedData);
  assert.equal(((exportedData as any).entries as BankEntry[]).length, 3);
});
