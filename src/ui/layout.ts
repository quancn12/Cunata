/// <reference lib="dom" />

/**
 * Cunata Web M6: Responsive Layout, Keyboard, and Shared Status Presentation.
 * Conforms to WEB-contract.md §5, §9 and Shared Product Contract v2.0.
 * Zero external framework/CDN dependencies.
 */

import { ensureScopedStyles } from './styles.ts';

export type Breakpoint = 'mobile-sm' | 'mobile' | 'tablet' | 'desktop';

export const BREAKPOINTS = {
  mobileSm: 320,
  mobile: 390,
  tablet: 768,
  desktop: 1280,
} as const;

export type SaveState =
  | 'local_saved'
  | 'queued'
  | 'sending'
  | 'server_confirmed'
  | 'failed'
  | 'offline'
  | 'error';

export interface StatusBadgeOptions {
  readonly state: SaveState;
  readonly label?: string;
  readonly detail?: string;
  readonly ariaLive?: 'polite' | 'assertive' | 'off';
  readonly document?: Document;
}

export interface ExamLayoutOptions {
  readonly header?: HTMLElement | {
    readonly title: string;
    readonly subtitle?: string;
    readonly timerEl?: HTMLElement;
    readonly statusEl?: HTMLElement;
  };
  readonly content: HTMLElement;
  readonly palette: HTMLElement;
  readonly footer?: HTMLElement;
  readonly document?: Document;
}

export interface ExamLayoutInstance {
  readonly container: HTMLElement;
  readonly headerEl: HTMLElement;
  readonly contentEl: HTMLElement;
  readonly paletteDrawerEl: HTMLElement;
  readonly togglePaletteBtn: HTMLElement;
  readonly togglePalette: () => void;
  readonly isPaletteOpen: () => boolean;
  readonly setPaletteOpen: (open: boolean) => void;
  readonly dispose: () => void;
}

export const LAYOUT_STYLE_ELEMENT_ID = 'cunata-ui-layout-styles';

/**
 * Inlined CSS matching src/ui/layout.css for direct document injection.
 */
export const LAYOUT_CSS = `
.cunata-layout-root {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #0f172a;
  background-color: transparent;
  line-height: 1.5;
  box-sizing: border-box;
  width: 100%;
}
.cunata-layout-root *, .cunata-layout-root *::before, .cunata-layout-root *::after {
  box-sizing: border-box;
}
.cunata-skip-link {
  position: absolute;
  top: -9999px;
  left: 16px;
  z-index: 100000;
  padding: 12px 16px;
  background-color: #1d4ed8;
  color: #ffffff;
  font-weight: 600;
  border-radius: 6px;
  text-decoration: none;
}
.cunata-skip-link:focus, .cunata-skip-link:focus-visible {
  top: 16px;
  outline: 3px solid #ffffff;
  outline-offset: 2px;
}
.cunata-touch-target {
  min-height: 44px;
  min-width: 44px;
  touch-action: manipulation;
}
.cunata-math-overflow-guard {
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  display: block;
  margin: 6px 0;
  padding: 4px;
  border-radius: 4px;
}
.cunata-math-overflow-guard:focus {
  outline: 2px dashed #1d4ed8;
  outline-offset: 1px;
}
.cunata-table-responsive-wrapper {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  margin: 12px 0;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}
.cunata-table-responsive-wrapper:focus {
  outline: 2px dashed #1d4ed8;
  outline-offset: 1px;
}
.cunata-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 9999px;
  border: 1px solid transparent;
  line-height: 1.4;
  white-space: nowrap;
}
.cunata-status--local_saved { background-color: #eff6ff; color: #1e40af; border-color: #93c5fd; }
.cunata-status--queued { background-color: #fefce8; color: #854d0e; border-color: #fde047; }
.cunata-status--sending { background-color: #f0fdf4; color: #166534; border-color: #86efac; }
.cunata-status--server_confirmed { background-color: #ecfdf5; color: #065f46; border-color: #6ee7b7; }
.cunata-status--failed, .cunata-status--error { background-color: #fef2f2; color: #991b1b; border-color: #fca5a5; }
.cunata-status--offline { background-color: #f8fafc; color: #334155; border-color: #cbd5e1; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
`;

/**
 * Classifies viewport width into responsive breakpoints:
 * - mobile-sm: <= 320px
 * - mobile: 321px - 480px (covering 390px mobile standard)
 * - tablet: 481px - 1024px (covering 768px tablet)
 * - desktop: >= 1025px (covering 1280px desktop)
 */
export function classifyBreakpoint(widthPx: number): Breakpoint {
  if (widthPx <= BREAKPOINTS.mobileSm) {
    return 'mobile-sm';
  }
  if (widthPx <= 480) {
    return 'mobile';
  }
  if (widthPx < 1025) {
    return 'tablet';
  }
  return 'desktop';
}

/**
 * Ensures responsive layout CSS styles are injected into document head.
 */
export function ensureLayoutStyles(doc?: Document): void {
  const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
  if (!targetDoc) return;

  // First ensure base scoped styles exist
  ensureScopedStyles(targetDoc);

  if (targetDoc.getElementById(LAYOUT_STYLE_ELEMENT_ID)) {
    return;
  }

  const styleEl = targetDoc.createElement('style');
  styleEl.id = LAYOUT_STYLE_ELEMENT_ID;
  styleEl.textContent = LAYOUT_CSS;
  if (targetDoc.head) {
    targetDoc.head.appendChild(styleEl);
  } else if (targetDoc.body) {
    targetDoc.body.appendChild(styleEl);
  }
}

/**
 * Enforces the minimum 44px x 44px accessible touch target size (WCAG 2.5.5 / 2.5.8).
 */
export function enforceTouchTarget(element: HTMLElement, minPx: number = 44): void {
  element.classList.add('cunata-touch-target');
  if (element.style) {
    element.style.minHeight = `${minPx}px`;
    element.style.minWidth = `${minPx}px`;
    element.style.touchAction = 'manipulation';
  }
}

/**
 * Wraps math container (LaTeX / OMML) with an accessible overflow guard.
 * Prevents complex formulas from overflowing screen or covering answer choices.
 * Keyboard-navigable with tabIndex 0 so keyboard users can scroll horizontal formulas.
 */
export function wrapMathOverflow(
  mathElement: HTMLElement,
  options: { document?: Document; label?: string } = {}
): HTMLElement {
  const doc = options.document || mathElement.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) {
    throw new Error('Document is required to wrap math element');
  }

  const guard = doc.createElement('div');
  guard.className = 'cunata-math-overflow-guard';
  guard.setAttribute('role', 'region');
  guard.setAttribute('aria-label', options.label || 'Công thức toán học');
  guard.setAttribute('tabindex', '0');

  // Reparent or insert
  if (mathElement.parentNode) {
    mathElement.parentNode.replaceChild(guard, mathElement);
  }
  guard.appendChild(mathElement);

  return guard;
}

/**
 * Wraps table elements with an accessible responsive horizontal scroll wrapper.
 * Keyboard-navigable with tabIndex 0 for users navigating without a mouse.
 */
export function wrapTableResponsive(
  tableElement: HTMLElement,
  options: { document?: Document; label?: string } = {}
): HTMLElement {
  const doc = options.document || tableElement.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) {
    throw new Error('Document is required to wrap table element');
  }

  const wrapper = doc.createElement('div');
  wrapper.className = 'cunata-table-responsive-wrapper';
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', options.label || 'Bảng dữ liệu');
  wrapper.setAttribute('tabindex', '0');

  if (tableElement.parentNode) {
    tableElement.parentNode.replaceChild(wrapper, tableElement);
  }
  wrapper.appendChild(tableElement);

  return wrapper;
}

/**
 * Standard Vietnamese labels for sync and network save states.
 */
const DEFAULT_STATE_LABELS: Record<SaveState, string> = {
  local_saved: 'Đã lưu máy',
  queued: 'Chờ gửi',
  sending: 'Đang gửi...',
  server_confirmed: 'Đã lưu máy chủ',
  failed: 'Lỗi gửi bài',
  offline: 'Ngoại tuyến',
  error: 'Lỗi hệ thống',
};

/**
 * Creates an accessible status badge representing the active synchronization or network state.
 */
export function createStatusBadge(options: StatusBadgeOptions): HTMLElement {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) {
    throw new Error('Document is required to create status badge');
  }

  const badge = doc.createElement('span');
  badge.className = `cunata-status-badge cunata-status--${options.state}`;
  badge.setAttribute('role', 'status');

  const live = options.ariaLive || (options.state === 'failed' || options.state === 'error' ? 'assertive' : 'polite');
  badge.setAttribute('aria-live', live);

  const label = options.label || DEFAULT_STATE_LABELS[options.state] || options.state;
  badge.textContent = options.detail ? `${label} (${options.detail})` : label;

  return badge;
}

/**
 * Creates an accessible skip-to-content navigation link for keyboard users.
 */
export function createSkipLink(options: { targetId: string; text?: string; document?: Document }): HTMLElement {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) {
    throw new Error('Document is required to create skip link');
  }

  const link = doc.createElement('a');
  link.className = 'cunata-skip-link';
  link.setAttribute('href', `#${options.targetId}`);
  link.textContent = options.text || 'Chuyển đến nội dung chính';
  return link;
}

/**
 * Detects if the current environment or user prefers reduced motion.
 */
export function isReducedMotionPreferred(win?: Window): boolean {
  const targetWin = win || (typeof window !== 'undefined' ? window : null);
  if (!targetWin || typeof targetWin.matchMedia !== 'function') {
    return false;
  }
  try {
    return targetWin.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Creates a responsive exam layout supporting 320px / 390px / 768px / 1280px viewports.
 * Features:
 * - Fluid header with title, timer, status, and palette toggle.
 * - Main content question pane with overflow protection.
 * - Collapsible navigation palette drawer for mobile/tablet with ARIA expanded state.
 * - Desktop side-by-side view with non-overlapping sticky palette.
 */
export function createExamLayout(options: ExamLayoutOptions): ExamLayoutInstance {
  const doc = options.document || options.content.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) {
    throw new Error('Document is required to create exam layout');
  }

  ensureLayoutStyles(doc);

  // 1. Root container
  const container = doc.createElement('div');
  container.className = 'cunata-ui cunata-layout-root cunata-layout-container';

  // 2. Skip to main content link
  const mainContentId = 'cunata-main-content';
  const skipLink = createSkipLink({ targetId: mainContentId, document: doc });
  container.appendChild(skipLink);

  // 3. Header
  const headerEl = doc.createElement('header');
  headerEl.className = 'cunata-layout-header';

  let togglePaletteBtn: HTMLElement;

  if (options.header instanceof (doc.defaultView?.HTMLElement || Object) && (options.header as HTMLElement).tagName) {
    headerEl.appendChild(options.header as HTMLElement);
    // Create standalone toggle button if not provided
    togglePaletteBtn = doc.createElement('button');
  } else {
    const meta = options.header as {
      readonly title: string;
      readonly subtitle?: string;
      readonly timerEl?: HTMLElement;
      readonly statusEl?: HTMLElement;
    } | undefined;

    const titleGroup = doc.createElement('div');
    titleGroup.className = 'cunata-header-title-group';

    const h1 = doc.createElement('h1');
    h1.className = 'cunata-exam-title';
    h1.textContent = meta?.title || 'Bài thi trắc nghiệm';
    h1.style.fontSize = '1.25rem';
    h1.style.fontWeight = '700';
    h1.style.margin = '0';
    titleGroup.appendChild(h1);

    if (meta?.subtitle) {
      const p = doc.createElement('p');
      p.className = 'cunata-exam-subtitle';
      p.textContent = meta.subtitle;
      p.style.fontSize = '0.875rem';
      p.style.color = '#475569';
      p.style.margin = '2px 0 0 0';
      titleGroup.appendChild(p);
    }
    headerEl.appendChild(titleGroup);

    const controlsGroup = doc.createElement('div');
    controlsGroup.className = 'cunata-header-controls-group';
    controlsGroup.style.display = 'flex';
    controlsGroup.style.alignItems = 'center';
    controlsGroup.style.gap = '8px';

    if (meta?.statusEl) {
      controlsGroup.appendChild(meta.statusEl);
    }
    if (meta?.timerEl) {
      controlsGroup.appendChild(meta.timerEl);
    }

    togglePaletteBtn = doc.createElement('button');
    togglePaletteBtn.setAttribute('type', 'button');
    togglePaletteBtn.className = 'cunata-btn cunata-palette-toggle-btn';
    togglePaletteBtn.textContent = 'Danh sách câu';
    enforceTouchTarget(togglePaletteBtn, 44);
    controlsGroup.appendChild(togglePaletteBtn);

    headerEl.appendChild(controlsGroup);
  }

  container.appendChild(headerEl);

  // 4. Main wrapper
  const mainEl = doc.createElement('main');
  mainEl.id = mainContentId;
  mainEl.className = 'cunata-layout-main';

  // Question content section
  const contentEl = doc.createElement('section');
  contentEl.className = 'cunata-layout-content cunata-fluid-container';
  contentEl.setAttribute('aria-label', 'Nội dung câu hỏi');
  contentEl.appendChild(options.content);
  mainEl.appendChild(contentEl);

  // Palette navigation drawer
  const paletteDrawerEl = doc.createElement('aside');
  paletteDrawerEl.id = 'cunata-palette-drawer';
  paletteDrawerEl.className = 'cunata-layout-palette-drawer';
  paletteDrawerEl.setAttribute('aria-label', 'Bảng điều hướng câu hỏi');
  paletteDrawerEl.appendChild(options.palette);
  mainEl.appendChild(paletteDrawerEl);

  container.appendChild(mainEl);

  if (options.footer) {
    container.appendChild(options.footer);
  }

  // 5. Drawer open / close state
  let isPaletteOpenState = false;
  togglePaletteBtn.setAttribute('aria-controls', paletteDrawerEl.id);
  togglePaletteBtn.setAttribute('aria-expanded', 'false');

  const setPaletteOpen = (open: boolean) => {
    isPaletteOpenState = open;
    togglePaletteBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      paletteDrawerEl.classList.add('is-open');
    } else {
      paletteDrawerEl.classList.remove('is-open');
    }
  };

  const togglePalette = () => {
    setPaletteOpen(!isPaletteOpenState);
  };

  const handleToggleClick = () => {
    togglePalette();
  };
  togglePaletteBtn.addEventListener('click', handleToggleClick);

  const dispose = () => {
    togglePaletteBtn.removeEventListener('click', handleToggleClick);
  };

  return {
    container,
    headerEl,
    contentEl,
    paletteDrawerEl,
    togglePaletteBtn,
    togglePalette,
    isPaletteOpen: () => isPaletteOpenState,
    setPaletteOpen,
    dispose,
  };
}
