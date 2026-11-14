/// <reference lib="dom" />

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mount } from '../../../src/ui/mount.ts';
import type { UiViewModel } from '../../../src/ui/mount.ts';
import type { Block } from '../../../src/ui/types.ts';
import { createMockDocument } from './dom-mock.ts';

describe('WEB-W1-UI: Mount Convention, Scoped CSS, and Action Dispatching', () => {
  it('mounts a structured view model with heading, blocks, form field and actions', () => {
    const doc = createMockDocument();
    const root = doc.createElement('div');
    doc.body.appendChild(root);

    const actionCalls: { name: string; value: unknown }[] = [];
    const actions = {
      updateName: (val: unknown) => {
        actionCalls.push({ name: 'updateName', value: val });
      },
      submitExam: (val: unknown) => {
        actionCalls.push({ name: 'submitExam', value: val });
      },
    };

    const model: UiViewModel = {
      title: 'Bài thi thử THPT GDPT 2018',
      description: 'Đề thi minh họa môn Toán',
      blocks: [
        { type: 'text', text: 'Phần I: Câu hỏi trắc nghiệm bốn lựa chọn' },
        { type: 'math', source: 'y = ax^4 + bx^2 + c', format: 'latex', verified: true },
      ],
      fields: [
        {
          name: 'updateName',
          label: 'Họ và tên thí sinh:',
          value: 'Nguyễn Văn A',
          placeholder: 'Nhập họ tên...',
        },
      ],
      actions: [
        {
          name: 'submitExam',
          label: 'Nộp bài thi',
          primary: true,
        },
      ],
    };

    const unmount = mount(root as unknown as HTMLElement, model, actions);

    // Root should have .cunata-ui class
    assert.strictEqual(root.classList.contains('cunata-ui'), true);

    // Heading exists
    const heading = root.querySelector('h2');
    assert.ok(heading !== null);
    assert.strictEqual(heading.textContent, 'Bài thi thử THPT GDPT 2018');

    // Blocks rendered
    assert.ok(root.querySelector('.cunata-math') !== null);

    // Form field rendered with composition guard
    const input = root.querySelector('input');
    assert.ok(input !== null);
    assert.strictEqual(input.value, 'Nguyễn Văn A');

    // Button click triggers action
    const btn = root.querySelector('button');
    assert.ok(btn !== null);
    assert.strictEqual(btn.textContent, 'Nộp bài thi');
    btn.click();

    assert.strictEqual(actionCalls.length, 1);
    assert.strictEqual(actionCalls[0]?.name, 'submitExam');

    // Unmount clears the container
    unmount();
    assert.strictEqual(root.textContent, '');
  });

  it('mounts Block array directly and unmounts cleanly', () => {
    const doc = createMockDocument();
    const root = doc.createElement('div');

    const blocks: Block[] = [
      { type: 'text', text: 'Hướng dẫn làm bài:' },
      { type: 'text', text: 'Mỗi câu chỉ chọn một đáp án đúng.' },
    ];

    const unmount = mount(root as unknown as HTMLElement, blocks, {});

    assert.ok(root.querySelector('.cunata-blocks-container') !== null);
    assert.ok(root.textContent.includes('Hướng dẫn làm bài:'));

    unmount();
    assert.strictEqual(root.textContent, '');
  });

  it('mounts primitive text directly', () => {
    const doc = createMockDocument();
    const root = doc.createElement('div');

    const unmount = mount(root as unknown as HTMLElement, 'Đang tải dữ liệu...', {});

    assert.ok(root.textContent.includes('Đang tải dữ liệu...'));
    unmount();
    assert.strictEqual(root.textContent, '');
  });

  it('ensures scoped CSS is injected into document head without modifying global styles', () => {
    const doc = createMockDocument();
    const root = doc.createElement('div');
    doc.body.appendChild(root);

    assert.strictEqual(doc.getElementById('cunata-ui-scoped-styles'), null);

    mount(root as unknown as HTMLElement, 'Hello', {});

    const styleEl = doc.getElementById('cunata-ui-scoped-styles');
    assert.ok(styleEl !== null, 'Scoped style tag must be created');
    assert.ok(styleEl.textContent.includes('.cunata-ui'), 'Style must be scoped to .cunata-ui');
  });
});
