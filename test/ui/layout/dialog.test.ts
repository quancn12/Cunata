/// <reference lib="dom" />

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createConfirmDialog,
  createAlertDialog,
  createSubmitConfirmDialog,
} from '../../../src/ui/dialog.ts';
import { createMockDocument, MockEvent, MockKeyboardEvent } from '../core/dom-mock.ts';

describe('WEB-W2-UI-POLISH: Accessible Dialogs, Double-Click Guards & Focus Restoration', () => {
  describe('createConfirmDialog: Safe Focus Return & Double-Click Guard', () => {
    it('restores focus to originating trigger element upon cancellation', () => {
      const doc = createMockDocument();

      // 1. Originating button
      const triggerBtn = doc.createElement('button');
      triggerBtn.id = 'trigger-open-dialog';
      doc.body.appendChild(triggerBtn);
      triggerBtn.focus();
      assert.strictEqual(doc.activeElement, triggerBtn);

      // 2. Open confirmation dialog
      let cancelled = false;
      const dialog = createConfirmDialog({
        title: 'Xóa câu hỏi',
        message: 'Bạn có chắc chắn muốn xóa câu hỏi này khỏi đề thi?',
        isDestructive: true,
        confirmText: 'Xóa câu hỏi',
        cancelText: 'Giữ lại',
        returnFocusTo: triggerBtn as unknown as HTMLElement,
        onCancel: () => {
          cancelled = true;
        },
        onConfirm: () => {},
        document: doc as unknown as Document,
      });

      assert.strictEqual(dialog.isOpened(), true);
      assert.strictEqual(dialog.element.getAttribute('role'), 'dialog');
      assert.strictEqual(dialog.element.getAttribute('aria-modal'), 'true');

      // Cancel button should have initial focus for safety on destructive action
      const cancelBtn = dialog.element.querySelector('.cunata-btn-cancel');
      assert.strictEqual(doc.activeElement, cancelBtn);

      // 3. Click cancel
      (cancelBtn as any)?.dispatchEvent(new MockEvent('click'));

      assert.strictEqual(cancelled, true);
      assert.strictEqual(dialog.isOpened(), false);
      // Focus must return to trigger button
      assert.strictEqual(doc.activeElement, triggerBtn, 'Focus must return to trigger button after cancel');
    });

    it('enforces double-click protection on confirm button', async () => {
      const doc = createMockDocument();

      let confirmCount = 0;
      const dialog = createConfirmDialog({
        title: 'Cập nhật cấu hình đề',
        message: 'Lưu thay đổi cài đặt?',
        onConfirm: () => {
          confirmCount++;
        },
        document: doc as unknown as Document,
      });

      const confirmBtn = dialog.element.querySelector('.cunata-btn-primary') as any;
      assert.notStrictEqual(confirmBtn, null);

      // First click
      confirmBtn.dispatchEvent(new MockEvent('click'));
      // Immediate second click (simulating accidental rapid double-click)
      confirmBtn.dispatchEvent(new MockEvent('click'));

      assert.strictEqual(confirmCount, 1, 'Confirm callback must only be triggered once');
      assert.strictEqual(dialog.isOpened(), false);
    });

    it('dismisses dialog on Escape key and restores focus', () => {
      const doc = createMockDocument();
      const triggerBtn = doc.createElement('button');
      doc.body.appendChild(triggerBtn);
      triggerBtn.focus();

      let cancelled = false;
      const dialog = createConfirmDialog({
        title: 'Xác nhận hủy thay đổi',
        message: 'Bỏ qua các thay đổi chưa lưu?',
        returnFocusTo: triggerBtn as unknown as HTMLElement,
        onCancel: () => {
          cancelled = true;
        },
        onConfirm: () => {},
        document: doc as unknown as Document,
      });

      // Press Escape
      const escEvent = new MockKeyboardEvent('keydown', { key: 'Escape' });
      (dialog.element as any).dispatchEvent(escEvent);

      assert.strictEqual(dialog.isOpened(), false);
      assert.strictEqual(cancelled, true);
      assert.strictEqual(doc.activeElement, triggerBtn);
    });
  });

  describe('createAlertDialog: Non-blocking Notification Dialog', () => {
    it('creates alertdialog without freezing background timer execution', () => {
      const doc = createMockDocument();
      const trigger = doc.createElement('button');
      doc.body.appendChild(trigger);
      trigger.focus();

      let okCalled = false;
      const dialog = createAlertDialog({
        title: 'Hết giờ làm bài',
        message: 'Thời gian làm bài thi đã kết thúc. Hệ thống sẽ tự động nộp bài của bạn.',
        okText: 'Xem kết quả',
        returnFocusTo: trigger as unknown as HTMLElement,
        onOk: () => {
          okCalled = true;
        },
        document: doc as unknown as Document,
      });

      assert.strictEqual(dialog.element.getAttribute('role'), 'alertdialog');

      const okBtn = dialog.element.querySelector('.cunata-btn-primary');
      assert.strictEqual(doc.activeElement, okBtn, 'OK button must receive initial focus');

      (okBtn as any)?.dispatchEvent(new MockEvent('click'));
      assert.strictEqual(okCalled, true);
      assert.strictEqual(dialog.isOpened(), false);
      assert.strictEqual(doc.activeElement, trigger);
    });
  });

  describe('createSubmitConfirmDialog: Exam Submission Flow (WEB-contract.md §9)', () => {
    it('displays prominent warning banner and alert role when unanswered questions exist', () => {
      const doc = createMockDocument();

      const dialog = createSubmitConfirmDialog({
        title: 'Xác nhận nộp bài',
        totalQuestions: 40,
        answeredCount: 35,
        unansweredCount: 5,
        flaggedCount: 2,
        candidateName: 'Nguyễn Văn A',
        onConfirmSubmit: () => {},
        document: doc as unknown as Document,
      });

      const bodyText = dialog.element.textContent;
      assert.match(bodyText, /Nguyễn Văn A/);
      assert.match(bodyText, /Tổng số câu hỏi: 40 câu/);
      assert.match(bodyText, /Đã trả lời: 35 câu/);
      assert.match(bodyText, /Chưa trả lời: 5 câu/);
      assert.match(bodyText, /Đánh dấu xem lại: 2 câu/);

      // Warning box check
      const warningBox = dialog.element.querySelector('.cunata-dialog-warning-box');
      assert.notStrictEqual(warningBox, null, 'Warning box must be present for unanswered questions');
      assert.strictEqual(warningBox?.getAttribute('role'), 'alert');
      assert.match(warningBox?.textContent || '', /Bạn còn 5 câu chưa làm/);

      // Submit button should have danger styling when questions are unanswered
      const submitBtn = dialog.element.querySelector('.cunata-btn-danger');
      assert.notStrictEqual(submitBtn, null);
    });

    it('displays completion confirmation when all questions are answered', () => {
      const doc = createMockDocument();

      const dialog = createSubmitConfirmDialog({
        title: 'Xác nhận nộp bài',
        totalQuestions: 20,
        answeredCount: 20,
        unansweredCount: 0,
        onConfirmSubmit: () => {},
        document: doc as unknown as Document,
      });

      const warningBox = dialog.element.querySelector('.cunata-dialog-warning-box');
      assert.strictEqual(warningBox, null, 'Warning box must not be shown when all questions are answered');

      assert.match(dialog.element.textContent, /Bạn đã hoàn thành tất cả các câu hỏi/);
    });

    it('prevents double submissions with disabled button and loading text', async () => {
      const doc = createMockDocument();

      let submitCalls = 0;
      const dialog = createSubmitConfirmDialog({
        totalQuestions: 10,
        answeredCount: 10,
        unansweredCount: 0,
        onConfirmSubmit: () => {
          submitCalls++;
        },
        document: doc as unknown as Document,
      });

      const submitBtn = dialog.element.querySelector('.cunata-btn-primary') as any;
      assert.notStrictEqual(submitBtn, null);

      // First click
      submitBtn.dispatchEvent(new MockEvent('click'));
      // Second rapid click
      submitBtn.dispatchEvent(new MockEvent('click'));

      assert.strictEqual(submitCalls, 1, 'Submission must execute exactly once');
      assert.strictEqual(dialog.isOpened(), false);
    });

    it('does not dismiss submit confirmation dialog on backdrop click to prevent accidents', () => {
      const doc = createMockDocument();

      const dialog = createSubmitConfirmDialog({
        totalQuestions: 10,
        answeredCount: 8,
        unansweredCount: 2,
        onConfirmSubmit: () => {},
        document: doc as unknown as Document,
      });

      // Click on backdrop outside dialog
      (dialog.backdrop as any).dispatchEvent(new MockEvent('click'));

      assert.strictEqual(dialog.isOpened(), true, 'Dialog must remain open when clicking backdrop');

      // Cancel button explicitly closes it
      const cancelBtn = dialog.element.querySelector('.cunata-btn-cancel');
      (cancelBtn as any)?.dispatchEvent(new MockEvent('click'));
      assert.strictEqual(dialog.isOpened(), false);
    });
  });
});
