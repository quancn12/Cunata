/// <reference lib="dom" />

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { openModal, trapFocus, getFocusableElements } from '../../../src/ui/modal.ts';
import { createMockDocument, MockKeyboardEvent } from './dom-mock.ts';

describe('WEB-W1-UI: Modal Focus Return, Trapping, and Accessibility', () => {
  it('guarantees focus return to the originating element upon modal close', () => {
    const doc = createMockDocument();

    // 1. Setup originating trigger button
    const triggerBtn = doc.createElement('button');
    triggerBtn.textContent = 'Mở hộp thoại';
    doc.body.appendChild(triggerBtn);
    triggerBtn.focus();
    assert.strictEqual(doc.activeElement, triggerBtn, 'Trigger button must be active before modal opens');

    // 2. Setup modal dialog with focusable elements inside
    const dialog = doc.createElement('div');
    const closeBtn = doc.createElement('button');
    closeBtn.textContent = 'Hủy bỏ';
    const confirmBtn = doc.createElement('button');
    confirmBtn.textContent = 'Đồng ý nộp bài';

    dialog.appendChild(closeBtn);
    dialog.appendChild(confirmBtn);
    doc.body.appendChild(dialog);

    // 3. Open modal
    let closed = false;
    const modal = openModal(dialog as unknown as HTMLElement, {
      document: doc as unknown as Document,
      onClose: () => {
        closed = true;
      },
    });

    assert.strictEqual(modal.isOpened(), true);
    assert.strictEqual(dialog.getAttribute('role'), 'dialog');
    assert.strictEqual(dialog.getAttribute('aria-modal'), 'true');
    // Focus should have moved to the first focusable element inside dialog
    assert.strictEqual(doc.activeElement, closeBtn, 'First element inside dialog must receive focus');

    // 4. Close modal
    modal.close();

    assert.strictEqual(closed, true);
    assert.strictEqual(modal.isOpened(), false);
    // Focus must return to the original trigger button
    assert.strictEqual(doc.activeElement, triggerBtn, 'Focus must be restored to triggerBtn');
  });

  it('traps Tab key navigation inside modal: wraps from last element to first element', () => {
    const doc = createMockDocument();

    const dialog = doc.createElement('div');
    const btn1 = doc.createElement('button');
    btn1.textContent = 'Nút 1';
    const btn2 = doc.createElement('button');
    btn2.textContent = 'Nút 2';
    const btn3 = doc.createElement('button');
    btn3.textContent = 'Nút 3';

    dialog.appendChild(btn1);
    dialog.appendChild(btn2);
    dialog.appendChild(btn3);
    doc.body.appendChild(dialog);

    openModal(dialog as unknown as HTMLElement, { document: doc as unknown as Document });

    // Focus is on btn3 (last element)
    btn3.focus();
    assert.strictEqual(doc.activeElement, btn3);

    // Simulate Tab press on btn3
    const tabEvent = new MockKeyboardEvent('keydown', { key: 'Tab', shiftKey: false });
    dialog.dispatchEvent(tabEvent);

    assert.strictEqual(tabEvent.defaultPrevented, true, 'Tab default must be prevented to trap focus');
    assert.strictEqual(doc.activeElement, btn1, 'Focus must wrap to first button');
  });

  it('traps Shift+Tab key navigation inside modal: wraps from first element to last element', () => {
    const doc = createMockDocument();

    const dialog = doc.createElement('div');
    const btn1 = doc.createElement('button');
    btn1.textContent = 'Nút 1';
    const btn2 = doc.createElement('button');
    btn2.textContent = 'Nút 2';

    dialog.appendChild(btn1);
    dialog.appendChild(btn2);
    doc.body.appendChild(dialog);

    openModal(dialog as unknown as HTMLElement, { document: doc as unknown as Document });

    // Focus is on btn1 (first element)
    btn1.focus();
    assert.strictEqual(doc.activeElement, btn1);

    // Simulate Shift+Tab press on btn1
    const shiftTabEvent = new MockKeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
    dialog.dispatchEvent(shiftTabEvent);

    assert.strictEqual(shiftTabEvent.defaultPrevented, true);
    assert.strictEqual(doc.activeElement, btn2, 'Focus must wrap to last button');
  });

  it('dismisses modal on Escape key and triggers onClose', () => {
    const doc = createMockDocument();

    const trigger = doc.createElement('button');
    doc.body.appendChild(trigger);
    trigger.focus();

    const dialog = doc.createElement('div');
    const okBtn = doc.createElement('button');
    dialog.appendChild(okBtn);
    doc.body.appendChild(dialog);

    let closeCalled = false;
    const modal = openModal(dialog as unknown as HTMLElement, {
      document: doc as unknown as Document,
      closeOnEscape: true,
      onClose: () => {
        closeCalled = true;
      },
    });

    assert.strictEqual(modal.isOpened(), true);

    // Dispatch Escape key
    const escEvent = new MockKeyboardEvent('keydown', { key: 'Escape' });
    dialog.dispatchEvent(escEvent);

    assert.strictEqual(closeCalled, true);
    assert.strictEqual(modal.isOpened(), false);
    assert.strictEqual(doc.activeElement, trigger, 'Focus must return to trigger');
  });

  it('ignores disabled elements when calculating focusable targets', () => {
    const doc = createMockDocument();

    const dialog = doc.createElement('div');
    const disabledBtn = doc.createElement('button');
    disabledBtn.disabled = true;
    const activeBtn = doc.createElement('button');

    dialog.appendChild(disabledBtn);
    dialog.appendChild(activeBtn);

    const focusables = getFocusableElements(dialog as unknown as HTMLElement);
    assert.strictEqual(focusables.length, 1);
    assert.strictEqual(focusables[0], activeBtn);
  });
});
