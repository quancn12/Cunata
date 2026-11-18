/// <reference lib="dom" />

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyBreakpoint,
  BREAKPOINTS,
  enforceTouchTarget,
  createExamLayout,
  createSkipLink,
  isReducedMotionPreferred,
  ensureLayoutStyles,
  LAYOUT_STYLE_ELEMENT_ID,
  LAYOUT_CSS,
} from '../../../src/ui/layout.ts';
import { createMockDocument, MockEvent } from '../core/dom-mock.ts';

describe('WEB-W2-UI-POLISH: Responsive Viewports, Touch Targets & Layout Structure', () => {
  describe('classifyBreakpoint: 320px / 390px / 768px / 1280px Viewports', () => {
    it('classifies 320px and below as mobile-sm', () => {
      assert.strictEqual(classifyBreakpoint(320), 'mobile-sm');
      assert.strictEqual(classifyBreakpoint(280), 'mobile-sm');
      assert.strictEqual(classifyBreakpoint(0), 'mobile-sm');
    });

    it('classifies 321px to 480px (including 390px mobile standard) as mobile', () => {
      assert.strictEqual(classifyBreakpoint(321), 'mobile');
      assert.strictEqual(classifyBreakpoint(375), 'mobile');
      assert.strictEqual(classifyBreakpoint(390), 'mobile');
      assert.strictEqual(classifyBreakpoint(414), 'mobile');
      assert.strictEqual(classifyBreakpoint(480), 'mobile');
    });

    it('classifies 481px to 1024px (including 768px tablet) as tablet', () => {
      assert.strictEqual(classifyBreakpoint(481), 'tablet');
      assert.strictEqual(classifyBreakpoint(768), 'tablet');
      assert.strictEqual(classifyBreakpoint(834), 'tablet');
      assert.strictEqual(classifyBreakpoint(1024), 'tablet');
    });

    it('classifies 1025px and above (including 1280px desktop) as desktop', () => {
      assert.strictEqual(classifyBreakpoint(1025), 'desktop');
      assert.strictEqual(classifyBreakpoint(1280), 'desktop');
      assert.strictEqual(classifyBreakpoint(1440), 'desktop');
      assert.strictEqual(classifyBreakpoint(1920), 'desktop');
    });

    it('verifies standard breakpoint constants', () => {
      assert.strictEqual(BREAKPOINTS.mobileSm, 320);
      assert.strictEqual(BREAKPOINTS.mobile, 390);
      assert.strictEqual(BREAKPOINTS.tablet, 768);
      assert.strictEqual(BREAKPOINTS.desktop, 1280);
    });
  });

  describe('enforceTouchTarget: Minimum 44px x 44px (WCAG 2.5.5 / 2.5.8)', () => {
    it('applies minimum 44px width and height to interactive elements', () => {
      const doc = createMockDocument();
      const btn = doc.createElement('button');

      enforceTouchTarget(btn as unknown as HTMLElement);

      assert.strictEqual(btn.classList.contains('cunata-touch-target'), true);
      assert.strictEqual(btn.style.minHeight, '44px');
      assert.strictEqual(btn.style.minWidth, '44px');
      assert.strictEqual(btn.style.touchAction, 'manipulation');
    });

    it('supports custom touch target sizes greater than 44px', () => {
      const doc = createMockDocument();
      const customBtn = doc.createElement('button');

      enforceTouchTarget(customBtn as unknown as HTMLElement, 48);

      assert.strictEqual(customBtn.style.minHeight, '48px');
      assert.strictEqual(customBtn.style.minWidth, '48px');
    });
  });

  describe('createSkipLink: Keyboard Accessibility Skip-to-Content', () => {
    it('creates an accessible skip-link pointing to the designated target ID', () => {
      const doc = createMockDocument();
      const skipLink = createSkipLink({
        targetId: 'main-content-section',
        text: 'Chuyển thẳng đến câu hỏi',
        document: doc as unknown as Document,
      });

      assert.strictEqual(skipLink.tagName, 'A');
      assert.strictEqual(skipLink.getAttribute('href'), '#main-content-section');
      assert.strictEqual(skipLink.textContent, 'Chuyển thẳng đến câu hỏi');
      assert.strictEqual(skipLink.classList.contains('cunata-skip-link'), true);
    });

    it('uses standard Vietnamese default text when custom text is omitted', () => {
      const doc = createMockDocument();
      const skipLink = createSkipLink({
        targetId: 'test-target',
        document: doc as unknown as Document,
      });

      assert.strictEqual(skipLink.textContent, 'Chuyển đến nội dung chính');
    });
  });

  describe('createExamLayout: Responsive Exam Shell & Collapsible Palette Drawer', () => {
    it('assembles accessible header, content area, palette drawer and skip-link', () => {
      const doc = createMockDocument();

      const content = doc.createElement('div');
      content.id = 'question-card-1';
      content.textContent = 'Câu 1: Nội dung câu hỏi';

      const palette = doc.createElement('div');
      palette.id = 'palette-nav';
      palette.textContent = 'Danh sách 40 câu hỏi';

      const timerEl = doc.createElement('div');
      timerEl.textContent = '45:00';

      const layout = createExamLayout({
        header: {
          title: 'Đề thi minh họa Toán THPT',
          subtitle: 'Thời gian: 50 phút',
          timerEl: timerEl as unknown as HTMLElement,
        },
        content: content as unknown as HTMLElement,
        palette: palette as unknown as HTMLElement,
        document: doc as unknown as Document,
      });

      assert.strictEqual(layout.container.classList.contains('cunata-layout-root'), true);
      assert.strictEqual(layout.container.classList.contains('cunata-layout-container'), true);

      // Verify skip link is prepended
      const firstChild = layout.container.childNodes[0] as any;
      assert.strictEqual(firstChild.classList.contains('cunata-skip-link'), true);

      // Verify header structure
      const titleEl = layout.headerEl.querySelector('.cunata-exam-title');
      assert.strictEqual(titleEl?.textContent, 'Đề thi minh họa Toán THPT');

      const subtitleEl = layout.headerEl.querySelector('.cunata-exam-subtitle');
      assert.strictEqual(subtitleEl?.textContent, 'Thời gian: 50 phút');

      // Verify content and palette containment
      assert.strictEqual(content.parentNode, layout.contentEl);
      assert.strictEqual(palette.parentNode, layout.paletteDrawerEl);

      // Verify palette toggle button accessibility
      assert.strictEqual(layout.togglePaletteBtn.getAttribute('aria-controls'), 'cunata-palette-drawer');
      assert.strictEqual(layout.togglePaletteBtn.getAttribute('aria-expanded'), 'false');
      assert.strictEqual(layout.isPaletteOpen(), false);

      // Click to toggle palette drawer open
      (layout.togglePaletteBtn as any).dispatchEvent(new MockEvent('click'));
      assert.strictEqual(layout.isPaletteOpen(), true);
      assert.strictEqual(layout.togglePaletteBtn.getAttribute('aria-expanded'), 'true');
      assert.strictEqual(layout.paletteDrawerEl.classList.contains('is-open'), true);

      // Click again to toggle palette drawer closed
      (layout.togglePaletteBtn as any).dispatchEvent(new MockEvent('click'));
      assert.strictEqual(layout.isPaletteOpen(), false);
      assert.strictEqual(layout.togglePaletteBtn.getAttribute('aria-expanded'), 'false');
      assert.strictEqual(layout.paletteDrawerEl.classList.contains('is-open'), false);

      // Dispose cleans up listeners
      layout.dispose();
    });

    it('accepts custom pre-rendered header element', () => {
      const doc = createMockDocument();
      const customHeader = doc.createElement('div');
      customHeader.id = 'custom-header-id';

      const content = doc.createElement('div');
      const palette = doc.createElement('div');

      const layout = createExamLayout({
        header: customHeader as unknown as HTMLElement,
        content: content as unknown as HTMLElement,
        palette: palette as unknown as HTMLElement,
        document: doc as unknown as Document,
      });

      assert.strictEqual(customHeader.parentNode, layout.headerEl);
    });
  });

  describe('ensureLayoutStyles: Idempotent Injection', () => {
    it('injects layout CSS into document head once and only once', () => {
      const doc = createMockDocument();

      assert.strictEqual(doc.getElementById(LAYOUT_STYLE_ELEMENT_ID), null);

      ensureLayoutStyles(doc as unknown as Document);

      const injected = doc.getElementById(LAYOUT_STYLE_ELEMENT_ID);
      assert.notStrictEqual(injected, null);
      assert.strictEqual(injected?.textContent, LAYOUT_CSS);

      // Second call should be an idempotent no-op
      ensureLayoutStyles(doc as unknown as Document);
      const allStyles = doc.head.querySelectorAll(`#${LAYOUT_STYLE_ELEMENT_ID}`);
      assert.strictEqual(allStyles.length, 1);
    });
  });

  describe('isReducedMotionPreferred', () => {
    it('returns false when window.matchMedia is undefined', () => {
      assert.strictEqual(isReducedMotionPreferred(undefined), false);
    });

    it('returns matchMedia result when available', () => {
      const fakeWin = {
        matchMedia: (query: string) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
        }),
      } as unknown as Window;

      assert.strictEqual(isReducedMotionPreferred(fakeWin), true);

      const standardWin = {
        matchMedia: () => ({ matches: false }),
      } as unknown as Window;

      assert.strictEqual(isReducedMotionPreferred(standardWin), false);
    });
  });

  describe('components.css: Responsive Exam Layout & Palette Contract', () => {
    it('enforces mobile ordering and static palette positioning under 1024px', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const cssPath = path.resolve(process.cwd(), 'src/ui/components.css');
      const content = fs.readFileSync(cssPath, 'utf8');

      assert.ok(content.includes('#examWrapper'), 'components.css must define rules for #examWrapper');
      assert.ok(content.includes('order: 1'), 'examPane must be order: 1 on mobile');
      assert.ok(content.includes('order: 2'), 'palette-card must be order: 2 on mobile');
      assert.ok(content.includes('position: static'), 'palette-card must be static on mobile so it never covers questions');
      assert.ok(content.includes('white-space: nowrap'), 'action buttons must have white-space: nowrap');
    });
  });
});
