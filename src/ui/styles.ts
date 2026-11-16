/// <reference lib="dom" />

/**
 * Scoped CSS styles for Cunata UI components.
 * Keep CSS strictly within the UI region (.cunata-ui); does not modify root stylesheet.
 * Meets WCAG AA contrast (>= 4.5:1 text, >= 3:1 UI), 44px touch targets,
 * responsive viewports (320px/390px/768px/1280px), zoom 200%, and reduced motion.
 */
/** @deprecated Use components.ts for new screens; retained for existing callers. */
export const SCOPED_UI_CSS = `
/* Scoped Cunata UI Region */
.cunata-ui {
  font-family: var(--font);
  color: var(--c-text);
  background-color: transparent;
  line-height: 1.5;
  box-sizing: border-box;
}

.cunata-ui *,
.cunata-ui *::before,
.cunata-ui *::after {
  box-sizing: border-box;
}

/* Touch targets: minimum 44x44px for interactive controls */
.cunata-ui button,
.cunata-ui input[type="button"],
.cunata-ui input[type="submit"],
.cunata-ui input[type="reset"],
.cunata-ui .cunata-btn {
  min-height: 44px;
  min-width: 44px;
  padding: 10px 16px;
  font-size: var(--fs-md);
  font-weight: 600;
  border-radius: var(--r-sm);
  border: 1px solid var(--c-border);
  background-color: var(--c-surface);
  color: var(--c-text);
  cursor: pointer;
  touch-action: manipulation;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

.cunata-ui input[type="text"],
.cunata-ui input[type="search"],
.cunata-ui textarea,
.cunata-ui select {
  min-height: 44px;
  padding: 8px 12px;
  font-size: var(--fs-md);
  border-radius: var(--r-sm);
  border: 1px solid var(--c-border);
  background-color: var(--c-surface);
  color: var(--c-text);
  width: 100%;
}

/* Accessible visible focus indication */
.cunata-ui :focus-visible,
.cunata-modal-dialog :focus-visible {
  outline: var(--focus-width) solid var(--c-primary);
  outline-offset: 2px;
}

/* Text and blocks */
.cunata-ui .cunata-text-block {
  margin: 8px 0;
  word-break: break-word;
}

/* Math container (LaTeX / OMML) without CDN dependencies */
.cunata-ui .cunata-math {
  display: inline-block;
  padding: 2px 8px;
  background-color: var(--c-surface-2);
  border: 1px solid var(--c-border);
  border-radius: var(--r-sm);
  max-width: 100%;
  overflow-x: auto;
  vertical-align: middle;
}

.cunata-ui .cunata-math-source {
  font-family: var(--font-math);
  font-size: var(--fs-sm);
  color: var(--c-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

/* Images: responsive and overflow protection */
.cunata-ui .cunata-image-container {
  margin: 12px 0;
  max-width: 100%;
  overflow: hidden;
}

.cunata-ui .cunata-image {
  max-width: 100%;
  height: auto;
  display: block;
  object-fit: contain;
  border-radius: var(--r-sm);
}

.cunata-ui .cunata-image-placeholder {
  display: inline-block;
  padding: 12px 16px;
  background-color: var(--c-surface-2);
  border: 1px dashed var(--c-border);
  border-radius: var(--r-sm);
  color: var(--c-text-2);
  font-size: var(--fs-sm);
}

.cunata-ui .cunata-image-unsafe {
  background-color: var(--c-surface-2);
  border-color: var(--c-border);
  color: var(--c-danger);
}

/* Tables: responsive wrapper to prevent overflow */
.cunata-ui .cunata-table-wrapper {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin: 12px 0;
  border: 1px solid var(--c-border);
  border-radius: var(--r-sm);
}

.cunata-ui .cunata-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
  text-align: left;
}

.cunata-ui .cunata-table th,
.cunata-ui .cunata-table td {
  border: 1px solid var(--c-border);
  padding: 10px 14px;
  vertical-align: top;
}

.cunata-ui .cunata-table th {
  background-color: var(--c-surface-2);
  font-weight: 600;
  color: var(--c-text);
}

/* Modal and dialogs */
.cunata-modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: var(--c-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}

.cunata-modal-dialog {
  background-color: var(--c-surface);
  color: var(--c-text);
  border-radius: 8px;
  box-shadow: var(--shadow-2);
  width: 100%;
  max-width: 540px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
  outline: var(--focus-width) solid transparent;
  border: 1px solid var(--c-border);
}

/* Visually hidden utility for aria-live status announcers */
.cunata-sr-only {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
}

/* Form accessibility: Fieldset and legend */
.cunata-ui fieldset {
  border: 1px solid var(--c-border);
  border-radius: var(--r-sm);
  padding: 16px;
  margin: 16px 0;
}

.cunata-ui legend {
  font-weight: 600;
  padding: 0 8px;
  color: var(--c-text);
}

/* Reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .cunata-ui *,
  .cunata-modal-backdrop * {
    animation: none !important;
    animation-iteration-count: 1 !important;
    transition: none !important;
  }
}

/* Responsive adjustments */
@media (max-width: 390px) {
  .cunata-ui {
    font-size: var(--fs-sm);
  }
  .cunata-modal-dialog {
    padding: 16px;
  }
}
`;

const STYLE_ELEMENT_ID = 'cunata-ui-scoped-styles';

/**
 * Injects or ensures scoped CSS styles exist in the document or container,
 * without altering any root stylesheets or global files.
 */
/** @deprecated Use components.ts for new screens; retained for existing callers. */
export function ensureScopedStyles(doc?: Document): void {
  const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
  if (!targetDoc) return;

  if (targetDoc.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }

  const styleEl = targetDoc.createElement('style');
  styleEl.id = STYLE_ELEMENT_ID;
  styleEl.textContent = SCOPED_UI_CSS;
  if (targetDoc.head) {
    targetDoc.head.appendChild(styleEl);
  } else if (targetDoc.body) {
    targetDoc.body.appendChild(styleEl);
  }
}
