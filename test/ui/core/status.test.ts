/// <reference lib="dom" />

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createStatusAnnouncer,
  announceStatus,
  isRoutineTimerTick,
  isMilestoneAnnouncement,
} from '../../../src/ui/status.ts';
import { createMockDocument } from './dom-mock.ts';

describe('WEB-W1-UI: Accessible Status Announcements and Timer Suppression', () => {
  describe('isRoutineTimerTick: Detection of second-by-second countdown ticks', () => {
    it('identifies bare mm:ss and hh:mm:ss timers as routine ticks', () => {
      assert.strictEqual(isRoutineTimerTick('49:59'), true);
      assert.strictEqual(isRoutineTimerTick('49:58'), true);
      assert.strictEqual(isRoutineTimerTick('00:01'), true);
      assert.strictEqual(isRoutineTimerTick('1:20:00'), true);
    });

    it('identifies timer tick labels as routine ticks', () => {
      assert.strictEqual(isRoutineTimerTick('Thời gian: 12:30'), true);
      assert.strictEqual(isRoutineTimerTick('Còn lại: 05:12'), true);
      assert.strictEqual(isRoutineTimerTick('Timer: 45:00'), true);
    });

    it('does not classify non-timer status messages as routine timer ticks', () => {
      assert.strictEqual(isRoutineTimerTick('Đã lưu bài làm cục bộ'), false);
      assert.strictEqual(isRoutineTimerTick('Nộp bài thành công'), false);
      assert.strictEqual(isRoutineTimerTick('Có lỗi kết nối'), false);
    });
  });

  describe('isMilestoneAnnouncement: Critical countdown alerts', () => {
    it('detects time expiration and critical milestone warnings', () => {
      assert.strictEqual(isMilestoneAnnouncement('Hết giờ làm bài!'), true);
      assert.strictEqual(isMilestoneAnnouncement('Thời gian thi còn 1 phút'), true);
      assert.strictEqual(isMilestoneAnnouncement('Còn 5 phút nữa sẽ hết giờ'), true);
      assert.strictEqual(isMilestoneAnnouncement('Còn 15 phút'), true);
    });

    it('does not classify routine ticks as milestones', () => {
      assert.strictEqual(isMilestoneAnnouncement('49:59'), false);
      assert.strictEqual(isMilestoneAnnouncement('32:15'), false);
    });
  });

  describe('createStatusAnnouncer: aria-live behavior and suppression', () => {
    it('creates an accessible live region with role="status" and aria-live="polite"', () => {
      const doc = createMockDocument();
      const announcer = createStatusAnnouncer({ document: doc as unknown as Document });
      const el = announcer.getElement();

      assert.strictEqual(el.getAttribute('role'), 'status');
      assert.strictEqual(el.getAttribute('aria-live'), 'polite');
      assert.strictEqual(el.getAttribute('aria-atomic'), 'true');
      assert.ok(el.className.includes('cunata-sr-only'));
    });

    it('suppresses routine timer ticks from aria-live announcements (WEB-contract.md §9)', () => {
      const doc = createMockDocument();
      const announcer = createStatusAnnouncer({ document: doc as unknown as Document });
      const el = announcer.getElement();

      // Initial state
      assert.strictEqual(el.textContent, '');

      // Routine countdown tick every second
      announcer.announce('49:59');
      assert.strictEqual(el.textContent, '', 'Second countdown must NOT be announced');

      announcer.announce('49:58');
      assert.strictEqual(el.textContent, '', 'Second countdown must NOT be announced');

      announcer.announce('Thời gian: 12:30');
      assert.strictEqual(el.textContent, '', 'Labeled countdown must NOT be announced');
    });

    it('announces milestones even if they contain time references', () => {
      const doc = createMockDocument();
      const announcer = createStatusAnnouncer({ document: doc as unknown as Document });
      const el = announcer.getElement();

      announcer.announce('Còn 5 phút làm bài');
      assert.strictEqual(el.textContent, 'Còn 5 phút làm bài');

      announcer.announce('Hết giờ! Bài thi đang được tự động nộp');
      assert.strictEqual(el.textContent, 'Hết giờ! Bài thi đang được tự động nộp');
    });

    it('announces normal status updates with polite or assertive priority', () => {
      const doc = createMockDocument();
      const announcer = createStatusAnnouncer({ document: doc as unknown as Document });
      const el = announcer.getElement();

      announcer.announce('Đã lưu cục bộ', 'polite');
      assert.strictEqual(el.textContent, 'Đã lưu cục bộ');
      assert.strictEqual(el.getAttribute('aria-live'), 'polite');

      announcer.announce('Mất kết nối mạng!', 'assertive');
      assert.strictEqual(el.textContent, 'Mất kết nối mạng!');
      assert.strictEqual(el.getAttribute('aria-live'), 'assertive');
    });

    it('clear() empties text content and dispose() cleans up', () => {
      const doc = createMockDocument();
      const announcer = createStatusAnnouncer({ document: doc as unknown as Document });
      const el = announcer.getElement();

      announcer.announce('Đã lưu');
      assert.strictEqual(el.textContent, 'Đã lưu');

      announcer.clear();
      assert.strictEqual(el.textContent, '');

      announcer.dispose();
      assert.strictEqual(el.textContent, '');
    });
  });

  describe('announceStatus direct helper', () => {
    it('sets aria-live attributes and text on target element while filtering timer ticks', () => {
      const doc = createMockDocument();
      const target = doc.createElement('div');

      // Routine tick ignored
      announceStatus(target as unknown as HTMLElement, '49:59');
      assert.strictEqual(target.textContent, '');

      // Regular status announced
      announceStatus(target as unknown as HTMLElement, 'Đã lưu thành công');
      assert.strictEqual(target.textContent, 'Đã lưu thành công');
      assert.strictEqual(target.getAttribute('role'), 'status');
    });
  });
});
