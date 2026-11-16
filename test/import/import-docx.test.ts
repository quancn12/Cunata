import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importDocx } from '../../src/import/docx/index.ts';
import { findElementsByTagName } from '../../src/import/docx/xml-parser.ts';
import { mount } from '../../src/import/preview/view.ts';
import type { ExamDraft } from '../../src/import/preview/types.ts';
import { createMockDocument, MockEvent } from '../ui/core/dom-mock.ts';

describe('DOCX parser XML tag lookup', () => {
  it('findElementsByTagName matches localName without namespace prefix in native DOM', () => {
    // Test if DOMParser or mock DOM works
    const xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p>hello</w:p></w:body></w:document>';
    // If DOMParser exists
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const bodies = findElementsByTagName(doc, 'body');
      assert.equal(bodies.length, 1);
    }
  });

  it('parses minimal.docx fixture with table and image preservation', async () => {
    const raw = readFileSync('./test/codex-check/fixtures/minimal.docx');
    const bytes = new Uint8Array(raw as any);
    const file = new File([bytes], 'minimal.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const res = await importDocx(file, new AbortController().signal);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.value.drafts.length, 1);
      const draft = res.value.drafts[0]!;
      assert.ok(draft.question.blocks && draft.question.blocks.length > 0);
      const hasTable = draft.question.blocks.some((b: any) => b.type === 'table');
      const hasImage = draft.question.blocks.some((b: any) => b.type === 'image' && b.alt === 'IMAGE-KEEP-42');
      assert.equal(hasTable, true, 'table block preserved');
      assert.equal(hasImage, true, 'image block preserved');
      assert.ok((res.value as any).assets?.some((a: any) => a.alt === 'IMAGE-KEEP-42'), 'asset preserved in job.assets');
    }
  });

  it('retries reading when first read attempts fail or are incomplete', async () => {
    const raw = readFileSync('./test/codex-check/fixtures/minimal.docx');
    const bytes = new Uint8Array(raw as any);
    let callCount = 0;
    const mockFile = {
      name: 'minimal.docx',
      size: bytes.byteLength,
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      async arrayBuffer() {
        callCount++;
        if (callCount < 2) {
          throw new Error('Simulated temporary file read lock');
        }
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      },
    } as unknown as File;

    const res = await importDocx(mockFile, new AbortController().signal);
    assert.equal(res.ok, true);
    assert.ok(callCount >= 2, 'resilient retry invoked');
  });

  it('preserves table and image blocks when mounting imported minimal.docx into preview', async () => {
    const raw = readFileSync('./test/codex-check/fixtures/minimal.docx');
    const bytes = new Uint8Array(raw as any);
    const file = new File([bytes], 'minimal.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const res = await importDocx(file, new AbortController().signal);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const doc = createMockDocument();
    const root = doc.createElement('div') as unknown as HTMLElement;

    const unmount = mount(root, { job: res.value });
    const rootEl = root as any;

    const tableEl = rootEl.querySelector('table');
    assert.ok(tableEl, 'table element exists in preview');
    assert.ok(tableEl.textContent.includes('TABLE-KEEP-42'), 'table content preserved');

    const imgEl = rootEl.querySelector('img') as any;
    assert.ok(imgEl, 'img element exists in preview');
    assert.equal(imgEl.getAttribute('alt'), 'IMAGE-KEEP-42', 'image alt preserved');
    assert.ok(imgEl.src?.startsWith('data:image/png') || imgEl.getAttribute('src')?.startsWith('data:image/png'), 'image data URL rendered');

    unmount();
  });

  it('supports preview correction and explicit confirmation into draft', async () => {
    const raw = readFileSync('./test/codex-check/fixtures/minimal.docx');
    const bytes = new Uint8Array(raw as any);
    const file = new File([bytes], 'minimal.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const res = await importDocx(file, new AbortController().signal);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const doc = createMockDocument();
    const root = doc.createElement('div') as unknown as HTMLElement;

    const targetDraft: ExamDraft = {
      draftId: 'draft-target',
      revision: 1,
      exam: {
        schemaVersion: 'web-exam-v1',
        examId: 'test-exam-01',
        examVersionId: 'v1.0.0',
        title: 'Target Exam',
        subject: 'Toán học',
        grade: 12,
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        settings: {
          durationMinutes: 50,
          maxAttempts: 1,
          releasePolicy: 'immediate',
          shuffleQuestions: false,
          shuffleOptions: false,
        },
        questions: [],
        assets: [],
      },
    };

    let confirmedResult: ExamDraft | null = null;
    const unmount = mount(
      root,
      { job: res.value, targetExamDraft: targetDraft },
      {
        onConfirm: (confirmed) => {
          confirmedResult = confirmed as ExamDraft;
        },
      }
    );
    const rootEl = root as any;

    // Click "Hiệu đính"
    const editBtn = Array.from(rootEl.querySelectorAll('.preview-btn')).find((b: any) => b.textContent.trim() === 'Hiệu đính') as any;
    assert.ok(editBtn, 'Hiệu đính button exists');
    editBtn.dispatchEvent(new MockEvent('click'));

    // Edit textarea (using .form-textarea or textarea in mock DOM)
    const textareas = rootEl.querySelectorAll('.form-textarea');
    const textarea = textareas[0] as any;
    assert.ok(textarea, 'form-textarea exists');
    textarea.value = 'DOCX corrected by teacher';
    textarea.dispatchEvent(new MockEvent('input'));

    // Click "Lưu thay đổi"
    const saveBtn = Array.from(rootEl.querySelectorAll('.preview-btn')).find((b: any) => /Lưu thay đổi/.test(b.textContent)) as any;
    assert.ok(saveBtn, 'Lưu thay đổi button exists');
    saveBtn.dispatchEvent(new MockEvent('click'));

    // Select draft checkbox
    const checkbox = rootEl.querySelector('.draft-checkbox-input') as any;
    assert.ok(checkbox, 'draft-checkbox-input exists');
    checkbox.checked = true;
    checkbox.dispatchEvent(new MockEvent('change'));

    // Click "Xác nhận nhập vào đề"
    const confirmBtn = Array.from(rootEl.querySelectorAll('.preview-btn')).find((b: any) => /Xác nhận nhập vào đề/.test(b.textContent) && !b.disabled) as any;
    assert.ok(confirmBtn, 'Xác nhận nhập vào đề button exists and is enabled');
    confirmBtn.dispatchEvent(new MockEvent('click'));

    assert.ok(confirmedResult, 'onConfirm was invoked');
    const addedQ = (confirmedResult as any).exam.questions[0];
    assert.ok(addedQ, 'question was added to draft');
    assert.equal(addedQ.content, 'DOCX corrected by teacher', 'question content was updated by teacher');

    unmount();
  });

  it('cancels preview without adding anything to draft', async () => {
    const raw = readFileSync('./test/codex-check/fixtures/minimal.docx');
    const bytes = new Uint8Array(raw as any);
    const file = new File([bytes], 'minimal.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const res = await importDocx(file, new AbortController().signal);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const doc = createMockDocument();
    const root = doc.createElement('div') as unknown as HTMLElement;

    const targetDraft: ExamDraft = {
      draftId: 'draft-target',
      revision: 1,
      exam: {
        schemaVersion: 'web-exam-v1',
        examId: 'test-exam-01',
        examVersionId: 'v1.0.0',
        title: 'Target Exam',
        subject: 'Toán học',
        grade: 12,
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        settings: {
          durationMinutes: 50,
          maxAttempts: 1,
          releasePolicy: 'immediate',
          shuffleQuestions: false,
          shuffleOptions: false,
        },
        questions: [],
        assets: [],
      },
    };

    let cancelled = false;
    let confirmedResult: ExamDraft | null = null;
    const unmount = mount(
      root,
      { job: res.value, targetExamDraft: targetDraft },
      {
        onConfirm: (confirmed) => {
          confirmedResult = confirmed as ExamDraft;
        },
        onCancel: () => {
          cancelled = true;
        },
      }
    );
    const rootEl = root as any;

    // Click "Hủy nhập"
    const cancelBtn = Array.from(rootEl.querySelectorAll('.preview-btn')).find((b: any) => /Hủy nhập/.test(b.textContent) && !b.disabled) as any;
    assert.ok(cancelBtn, 'Hủy nhập button exists and is enabled');
    cancelBtn.dispatchEvent(new MockEvent('click'));

    assert.equal(cancelled, true, 'onCancel was invoked');
    assert.equal(confirmedResult, null, 'no confirmation occurred');
    assert.equal(targetDraft.exam.questions.length, 0, 'target draft questions unchanged');

    unmount();
  });
});
