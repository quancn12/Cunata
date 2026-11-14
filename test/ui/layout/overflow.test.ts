/// <reference lib="dom" />

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  wrapMathOverflow,
  wrapTableResponsive,
  createStatusBadge,
} from '../../../src/ui/layout.ts';
import { createMockDocument } from '../core/dom-mock.ts';

describe('WEB-W2-UI-POLISH: Math & Table Overflow Guards & ARIA Status Badges', () => {
  describe('wrapMathOverflow: LaTeX & OMML Math Overflow Protection', () => {
    it('wraps an inline or block math element in an accessible scrollable region', () => {
      const doc = createMockDocument();
      const parent = doc.createElement('div');
      const mathEl = doc.createElement('span');
      mathEl.className = 'cunata-math';
      mathEl.textContent = '\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}';

      parent.appendChild(mathEl);
      assert.strictEqual(parent.childNodes.length, 1);

      const guard = wrapMathOverflow(mathEl as unknown as HTMLElement, {
        document: doc as unknown as Document,
      });

      assert.strictEqual(guard.className, 'cunata-math-overflow-guard');
      assert.strictEqual(guard.getAttribute('role'), 'region');
      assert.strictEqual(guard.getAttribute('aria-label'), 'Công thức toán học');
      assert.strictEqual(guard.getAttribute('tabindex'), '0');

      // Verify the math element is now inside the guard
      assert.strictEqual(mathEl.parentNode, guard);
      // And the guard replaced the math element in the parent container
      assert.strictEqual(guard.parentNode, parent);
      assert.strictEqual(parent.childNodes[0], guard);
    });

    it('supports custom accessibility label for specific equation contexts', () => {
      const doc = createMockDocument();
      const mathEl = doc.createElement('div');
      mathEl.textContent = 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}';

      const guard = wrapMathOverflow(mathEl as unknown as HTMLElement, {
        label: 'Phương trình bậc hai',
        document: doc as unknown as Document,
      });

      assert.strictEqual(guard.getAttribute('aria-label'), 'Phương trình bậc hai');
      assert.strictEqual(mathEl.parentNode, guard);
    });
  });

  describe('wrapTableResponsive: Table Overflow Wrapper', () => {
    it('wraps a data table in a keyboard-accessible horizontal scroll region', () => {
      const doc = createMockDocument();
      const parent = doc.createElement('div');
      const table = doc.createElement('table');
      table.className = 'cunata-table';

      parent.appendChild(table);

      const wrapper = wrapTableResponsive(table as unknown as HTMLElement, {
        document: doc as unknown as Document,
      });

      assert.strictEqual(wrapper.className, 'cunata-table-responsive-wrapper');
      assert.strictEqual(wrapper.getAttribute('role'), 'region');
      assert.strictEqual(wrapper.getAttribute('aria-label'), 'Bảng dữ liệu');
      assert.strictEqual(wrapper.getAttribute('tabindex'), '0');

      // Verify table is inside wrapper and wrapper is in parent
      assert.strictEqual(table.parentNode, wrapper);
      assert.strictEqual(wrapper.parentNode, parent);
    });

    it('supports custom label for table descriptions', () => {
      const doc = createMockDocument();
      const table = doc.createElement('table');

      const wrapper = wrapTableResponsive(table as unknown as HTMLElement, {
        label: 'Bảng thống kê điểm số',
        document: doc as unknown as Document,
      });

      assert.strictEqual(wrapper.getAttribute('aria-label'), 'Bảng thống kê điểm số');
    });
  });

  describe('createStatusBadge: ARIA Status and Network Synchronization Badges', () => {
    it('creates local_saved status badge with polite aria-live and Vietnamese text', () => {
      const doc = createMockDocument();
      const badge = createStatusBadge({
        state: 'local_saved',
        document: doc as unknown as Document,
      });

      assert.strictEqual(badge.className, 'cunata-status-badge cunata-status--local_saved');
      assert.strictEqual(badge.getAttribute('role'), 'status');
      assert.strictEqual(badge.getAttribute('aria-live'), 'polite');
      assert.strictEqual(badge.textContent, 'Đã lưu máy');
    });

    it('creates queued status badge for pending outbox items', () => {
      const doc = createMockDocument();
      const badge = createStatusBadge({
        state: 'queued',
        document: doc as unknown as Document,
      });

      assert.strictEqual(badge.className, 'cunata-status-badge cunata-status--queued');
      assert.strictEqual(badge.getAttribute('role'), 'status');
      assert.strictEqual(badge.getAttribute('aria-live'), 'polite');
      assert.strictEqual(badge.textContent, 'Chờ gửi');
    });

    it('creates sending status badge with animated/in-progress presentation', () => {
      const doc = createMockDocument();
      const badge = createStatusBadge({
        state: 'sending',
        document: doc as unknown as Document,
      });

      assert.strictEqual(badge.className, 'cunata-status-badge cunata-status--sending');
      assert.strictEqual(badge.textContent, 'Đang gửi...');
    });

    it('creates server_confirmed status badge upon validated receipt receipt', () => {
      const doc = createMockDocument();
      const badge = createStatusBadge({
        state: 'server_confirmed',
        document: doc as unknown as Document,
      });

      assert.strictEqual(badge.className, 'cunata-status-badge cunata-status--server_confirmed');
      assert.strictEqual(badge.textContent, 'Đã lưu máy chủ');
    });

    it('creates failed / error status badge with assertive priority for critical alerts', () => {
      const doc = createMockDocument();
      const badge = createStatusBadge({
        state: 'failed',
        detail: 'Không có kết nối mạng',
        document: doc as unknown as Document,
      });

      assert.strictEqual(badge.className, 'cunata-status-badge cunata-status--failed');
      assert.strictEqual(badge.getAttribute('aria-live'), 'assertive');
      assert.strictEqual(badge.textContent, 'Lỗi gửi bài (Không có kết nối mạng)');
    });

    it('creates offline status badge for offline mode', () => {
      const doc = createMockDocument();
      const badge = createStatusBadge({
        state: 'offline',
        document: doc as unknown as Document,
      });

      assert.strictEqual(badge.className, 'cunata-status-badge cunata-status--offline');
      assert.strictEqual(badge.textContent, 'Ngoại tuyến');
    });

    it('allows custom override label and explicit aria-live priority', () => {
      const doc = createMockDocument();
      const badge = createStatusBadge({
        state: 'local_saved',
        label: 'Tự động lưu lúc 14:30',
        ariaLive: 'off',
        document: doc as unknown as Document,
      });

      assert.strictEqual(badge.textContent, 'Tự động lưu lúc 14:30');
      assert.strictEqual(badge.getAttribute('aria-live'), 'off');
    });
  });
});
