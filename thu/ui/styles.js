/// <reference lib="dom" />
/**
 * Scoped CSS styles for Cunata UI components.
 * Keep CSS strictly within the UI region (.cunata-ui); does not modify root stylesheet.
 * Meets WCAG AA contrast (>= 4.5:1 text, >= 3:1 UI), 44px touch targets,
 * responsive viewports (320px/390px/768px/1280px), zoom 200%, and reduced motion.
 */
export const SCOPED_UI_CSS = `
/* Scoped Cunata UI Region */
.cunata-ui {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #0f172a;
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
  font-size: 1rem;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background-color: #ffffff;
  color: #0f172a;
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
  font-size: 1rem;
  border-radius: 6px;
  border: 1px solid #94a3b8;
  background-color: #ffffff;
  color: #0f172a;
  width: 100%;
}

/* Accessible visible focus indication */
.cunata-ui :focus-visible,
.cunata-modal-dialog :focus-visible {
  outline: 3px solid #1d4ed8;
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
  background-color: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  max-width: 100%;
  overflow-x: auto;
  vertical-align: middle;
}

.cunata-ui .cunata-math-source {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.95em;
  color: #0369a1;
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
  border-radius: 4px;
}

.cunata-ui .cunata-image-placeholder {
  display: inline-block;
  padding: 12px 16px;
  background-color: #f8fafc;
  border: 1px dashed #94a3b8;
  border-radius: 6px;
  color: #475569;
  font-size: 0.95rem;
}

.cunata-ui .cunata-image-unsafe {
  background-color: #fef2f2;
  border-color: #f87171;
  color: #991b1b;
}

/* Tables: responsive wrapper to prevent overflow */
.cunata-ui .cunata-table-wrapper {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin: 12px 0;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}

.cunata-ui .cunata-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
  text-align: left;
}

.cunata-ui .cunata-table th,
.cunata-ui .cunata-table td {
  border: 1px solid #cbd5e1;
  padding: 10px 14px;
  vertical-align: top;
}

.cunata-ui .cunata-table th {
  background-color: #f8fafc;
  font-weight: 600;
  color: #0f172a;
}

/* Modal and dialogs */
.cunata-modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(15, 23, 42, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}

.cunata-modal-dialog {
  background-color: #ffffff;
  color: #0f172a;
  border-radius: 8px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
  width: 100%;
  max-width: 540px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
  outline: none;
  border: 1px solid #cbd5e1;
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
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 16px;
  margin: 16px 0;
}

.cunata-ui legend {
  font-weight: 600;
  padding: 0 8px;
  color: #0f172a;
}

/* Reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .cunata-ui *,
  .cunata-modal-backdrop * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* Responsive adjustments */
@media (max-width: 390px) {
  .cunata-ui {
    font-size: 0.95rem;
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
export function ensureScopedStyles(doc) {
    const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
    if (!targetDoc)
        return;
    if (targetDoc.getElementById(STYLE_ELEMENT_ID)) {
        return;
    }
    const styleEl = targetDoc.createElement('style');
    styleEl.id = STYLE_ELEMENT_ID;
    styleEl.textContent = SCOPED_UI_CSS;
    if (targetDoc.head) {
        targetDoc.head.appendChild(styleEl);
    }
    else if (targetDoc.body) {
        targetDoc.body.appendChild(styleEl);
    }
}
