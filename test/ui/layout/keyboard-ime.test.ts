/// <reference lib="dom" />

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPromptDialog, createConfirmDialog } from '../../../src/ui/dialog.ts';
import { handleRadioGroupKeyDown } from '../../../src/ui/layout.ts';
import {
  createMockDocument,
  MockEvent,
  MockKeyboardEvent,
  MockCompositionEvent,
} from '../core/dom-mock.ts';

describe('WEB-W2-UI-POLISH: Keyboard Navigation Model & IME Composition Preserving Inputs', () => {
  describe('Keyboard Focus Trap Navigation within Dialog', () => {
    it('traps Tab navigation: wraps from last focusable button to first button', () => {
      const doc = createMockDocument();

      const dialog = createConfirmDialog({
        title: 'Xác nhận',
        message: 'Bạn có chắc chắn?',
        confirmText: 'Đồng ý',
        cancelText: 'Hủy bỏ',
        onConfirm: () => {},
        document: doc as unknown as Document,
      });

      const buttons = dialog.element.querySelectorAll<any>('button:not([disabled])');
      assert.strictEqual(buttons.length, 2);
      const cancelBtn = buttons[0];
      const confirmBtn = buttons[1];

      // Focus last element (confirmBtn)
      confirmBtn.focus();
      assert.strictEqual(doc.activeElement, confirmBtn);

      // Press Tab on last element
      const tabEvent = new MockKeyboardEvent('keydown', { key: 'Tab', shiftKey: false });
      (dialog.element as any).dispatchEvent(tabEvent);

      assert.strictEqual(tabEvent.defaultPrevented, true, 'Tab default must be prevented to trap focus');
      assert.strictEqual(doc.activeElement, cancelBtn, 'Focus must wrap to first button');
    });

    it('traps Shift+Tab navigation: wraps from first button to last button', () => {
      const doc = createMockDocument();

      const dialog = createConfirmDialog({
        title: 'Xác nhận',
        message: 'Bạn có chắc chắn?',
        confirmText: 'Đồng ý',
        cancelText: 'Hủy bỏ',
        onConfirm: () => {},
        document: doc as unknown as Document,
      });

      const buttons = dialog.element.querySelectorAll<any>('button:not([disabled])');
      const cancelBtn = buttons[0];
      const confirmBtn = buttons[1];

      // Focus first element (cancelBtn)
      cancelBtn.focus();
      assert.strictEqual(doc.activeElement, cancelBtn);

      // Press Shift+Tab on first element
      const shiftTabEvent = new MockKeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
      (dialog.element as any).dispatchEvent(shiftTabEvent);

      assert.strictEqual(shiftTabEvent.defaultPrevented, true);
      assert.strictEqual(doc.activeElement, confirmBtn, 'Focus must wrap to last button');
    });
  });

  describe('createPromptDialog: Vietnamese IME Composition Protection', () => {
    it('does NOT submit dialog when Enter key is pressed during active IME composition', () => {
      const doc = createMockDocument();
      const trigger = doc.createElement('button');
      doc.body.appendChild(trigger);
      trigger.focus();

      let submittedValue: string | null = null;
      const dialog = createPromptDialog({
        title: 'Nhập tên thí sinh',
        placeholder: 'Họ và tên hoặc mã dự thi',
        confirmText: 'Bắt đầu làm bài',
        returnFocusTo: trigger as unknown as HTMLElement,
        onConfirm: (val) => {
          submittedValue = val;
        },
        document: doc as unknown as Document,
      });

      const input = dialog.element.querySelector<any>('.cunata-prompt-input');
      assert.notStrictEqual(input, null);
      assert.strictEqual(doc.activeElement, input, 'Input element must receive initial focus');

      // 1. Simulate user typing Vietnamese Telex: "Nguyeex" -> composition starts
      input.dispatchEvent(new MockCompositionEvent('compositionstart', { data: 'Nguye' }));

      // 2. User presses Enter to complete IME syllable while composing
      const enterDuringIme = new MockKeyboardEvent('keydown', { key: 'Enter' });
      input.dispatchEvent(enterDuringIme);

      // Submission must NOT be triggered!
      assert.strictEqual(submittedValue, null, 'Must NOT submit during active IME composition');
      assert.strictEqual(dialog.isOpened(), true, 'Dialog must remain open');

      // 3. IME syllable finalized -> composition ends
      input.value = 'Nguyễn';
      input.dispatchEvent(new MockCompositionEvent('compositionend', { data: 'Nguyễn' }));

      // 4. User presses Enter while NOT composing -> submits!
      const enterNormal = new MockKeyboardEvent('keydown', { key: 'Enter' });
      input.dispatchEvent(enterNormal);

      assert.strictEqual(submittedValue, 'Nguyễn', 'Submits the composed Vietnamese text');
      assert.strictEqual(dialog.isOpened(), false, 'Dialog closes after submission');
      assert.strictEqual(doc.activeElement, trigger, 'Focus returns to trigger button');
    });

    it('enforces validation rule without closing dialog on invalid input', () => {
      const doc = createMockDocument();

      let submittedValue: string | null = null;
      const dialog = createPromptDialog({
        title: 'Nhập mã đề',
        validate: (val) => {
          if (!val.trim()) return 'Mã đề không được để trống';
          if (val.length < 3) return 'Mã đề phải có ít nhất 3 ký tự';
          return null;
        },
        onConfirm: (val) => {
          submittedValue = val;
        },
        document: doc as unknown as Document,
      });

      const input = dialog.element.querySelector<any>('.cunata-prompt-input');
      const submitBtn = dialog.element.querySelector<any>('.cunata-btn-primary');
      const errorMsg = dialog.element.querySelector<any>('.cunata-prompt-error');

      // Attempt submit empty
      input.value = '';
      submitBtn.dispatchEvent(new MockEvent('click'));

      assert.strictEqual(submittedValue, null);
      assert.strictEqual(dialog.isOpened(), true);
      assert.strictEqual(errorMsg.textContent, 'Mã đề không được để trống');

      // Attempt submit too short
      input.value = '10';
      submitBtn.dispatchEvent(new MockEvent('click'));

      assert.strictEqual(submittedValue, null);
      assert.strictEqual(dialog.isOpened(), true);
      assert.strictEqual(errorMsg.textContent, 'Mã đề phải có ít nhất 3 ký tự');

      // Valid submit
      input.value = '101';
      submitBtn.dispatchEvent(new MockEvent('click'));

      assert.strictEqual(submittedValue, '101');
      assert.strictEqual(dialog.isOpened(), false);
    });

    it('cancels prompt dialog cleanly without invoking onConfirm', () => {
      const doc = createMockDocument();
      let confirmed = false;
      let cancelled = false;

      const dialog = createPromptDialog({
        title: 'Cài đặt thời gian',
        onConfirm: () => {
          confirmed = true;
        },
        onCancel: () => {
          cancelled = true;
        },
        document: doc as unknown as Document,
      });

      const cancelBtn = dialog.element.querySelector<any>('.cunata-btn-cancel');
      cancelBtn.dispatchEvent(new MockEvent('click'));

      assert.strictEqual(confirmed, false);
      assert.strictEqual(cancelled, true);
      assert.strictEqual(dialog.isOpened(), false);
    });
  });

  describe('handleRadioGroupKeyDown: Part I Radio Group Keyboard Navigation (WCAG / ARIA APG)', () => {
    it('Space / Enter key selects current option and keeps focus on that option', () => {
      const doc = createMockDocument();
      const options = ['opt-a', 'opt-b', 'opt-c', 'opt-d'].map((id) => {
        const el = doc.createElement('div');
        el.setAttribute('role', 'radio');
        el.setAttribute('data-option-id', id);
        return el as unknown as HTMLElement;
      });

      let selectedIndex = -1;
      options[0]!.focus();
      assert.strictEqual(doc.activeElement, options[0]);

      const spaceEvent = new MockKeyboardEvent('keydown', { key: ' ' });
      const handled = handleRadioGroupKeyDown(spaceEvent as unknown as KeyboardEvent, {
        items: options,
        currentIndex: 0,
        onSelect: (idx) => {
          selectedIndex = idx;
        },
        focusAfterSelect: true,
      });

      assert.strictEqual(handled, true);
      assert.strictEqual(spaceEvent.defaultPrevented, true);
      assert.strictEqual(selectedIndex, 0);
      assert.strictEqual(doc.activeElement, options[0], 'Focus must remain on the selected option after Space');
    });

    it('ArrowDown / ArrowRight advances selection and focus to next option with wrap-around', () => {
      const doc = createMockDocument();
      const options = ['opt-a', 'opt-b', 'opt-c', 'opt-d'].map((id) => {
        const el = doc.createElement('div');
        el.setAttribute('role', 'radio');
        el.setAttribute('data-option-id', id);
        return el as unknown as HTMLElement;
      });

      let selectedIndex = -1;

      // From index 0 to 1
      const arrowDownEvent = new MockKeyboardEvent('keydown', { key: 'ArrowDown' });
      const handled1 = handleRadioGroupKeyDown(arrowDownEvent as unknown as KeyboardEvent, {
        items: options,
        currentIndex: 0,
        onSelect: (idx) => {
          selectedIndex = idx;
        },
        focusAfterSelect: true,
      });

      assert.strictEqual(handled1, true);
      assert.strictEqual(arrowDownEvent.defaultPrevented, true);
      assert.strictEqual(selectedIndex, 1);
      assert.strictEqual(doc.activeElement, options[1], 'Focus must move to next option (index 1)');

      // From index 3 wrap around to 0
      const wrapEvent = new MockKeyboardEvent('keydown', { key: 'ArrowRight' });
      const handled2 = handleRadioGroupKeyDown(wrapEvent as unknown as KeyboardEvent, {
        items: options,
        currentIndex: 3,
        onSelect: (idx) => {
          selectedIndex = idx;
        },
        focusAfterSelect: true,
      });

      assert.strictEqual(handled2, true);
      assert.strictEqual(wrapEvent.defaultPrevented, true);
      assert.strictEqual(selectedIndex, 0);
      assert.strictEqual(doc.activeElement, options[0], 'Focus must wrap to first option (index 0)');
    });

    it('ArrowUp / ArrowLeft retreats selection and focus to previous option with wrap-around', () => {
      const doc = createMockDocument();
      const options = ['opt-a', 'opt-b', 'opt-c', 'opt-d'].map((id) => {
        const el = doc.createElement('div');
        el.setAttribute('role', 'radio');
        el.setAttribute('data-option-id', id);
        return el as unknown as HTMLElement;
      });

      let selectedIndex = -1;

      // From index 0 wrap around to 3
      const arrowUpEvent = new MockKeyboardEvent('keydown', { key: 'ArrowUp' });
      const handled = handleRadioGroupKeyDown(arrowUpEvent as unknown as KeyboardEvent, {
        items: options,
        currentIndex: 0,
        onSelect: (idx) => {
          selectedIndex = idx;
        },
        focusAfterSelect: true,
      });

      assert.strictEqual(handled, true);
      assert.strictEqual(arrowUpEvent.defaultPrevented, true);
      assert.strictEqual(selectedIndex, 3);
      assert.strictEqual(doc.activeElement, options[3], 'Focus must wrap to last option (index 3)');
    });

    it('ignores non-navigation keys without preventing default', () => {
      const doc = createMockDocument();
      const options = [doc.createElement('div') as unknown as HTMLElement];
      let selected = false;

      const tabEvent = new MockKeyboardEvent('keydown', { key: 'Tab' });
      const handled = handleRadioGroupKeyDown(tabEvent as unknown as KeyboardEvent, {
        items: options,
        currentIndex: 0,
        onSelect: () => {
          selected = true;
        },
      });

      assert.strictEqual(handled, false);
      assert.strictEqual(tabEvent.defaultPrevented, false);
      assert.strictEqual(selected, false);
    });
  });
});
