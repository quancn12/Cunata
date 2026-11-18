/// <reference lib="dom" />
/**
 * Cunata Web M6 Foundations: Safe DOM, Focus, Dialogs, and IME Primitives.
 * Conforms to WEB-contract.md §3, §5, §9 and Shared Product Contract v2.0.
 */
// Legacy exports below are retained for compatibility.
// New screens should use components.ts and components.css (DESIGN.md §4).
export { Button, Input, Select, Textarea, Card, ExamCard, StatusBadge, TopBar, NavRail, BottomNav, Dialog, BottomSheet, Toast, EmptyState, ErrorState, OfflineBanner, Skeleton, Table, createButton, createInput, createSelect, createTextarea, createCard, createExamCard, createExamStatusBadge, createTopBar, createNavRail, createBottomNav, createDialog, createBottomSheet, createToast, createEmptyState, createErrorState, createOfflineBanner, createSkeleton, createTable, } from './components.js';
export { Icon, createIcon } from './icons.js';
// 1. Mount convention
export { mount } from './mount.js';
// 3. Security, URL, and MIME validation
export { ALLOWED_IMAGE_MIMES, isSafeMimeType, isSafeUrl, sanitizeUrl, isSafeSvg, resolveAssetUrl, } from './security.js';
// 4. Safe DOM and block rendering
export { renderText, renderMath, renderImage, renderTable, renderBlock, renderBlocks, } from './blocks.js';
// 5. Accessible modal and focus return management
export { openModal, trapFocus, getFocusableElements, } from './modal.js';
// 6. Accessible aria-live status announcer (suppresses routine timer ticks)
export { createStatusAnnouncer, announceStatus, isRoutineTimerTick, isMilestoneAnnouncement, } from './status.js';
// 7. IME composition guards preserving native Vietnamese input and cursor
export { createCompositionGuard, isImeComposing, } from './composition.js';
// 8. Scoped UI CSS styles
export { SCOPED_UI_CSS, ensureScopedStyles, } from './styles.js';
// 9. Responsive layout, breakpoints, touch targets and overflow wrappers
export { BREAKPOINTS, LAYOUT_STYLE_ELEMENT_ID, LAYOUT_CSS, classifyBreakpoint, ensureLayoutStyles, enforceTouchTarget, wrapMathOverflow, wrapTableResponsive, createStatusBadge, createSkipLink, isReducedMotionPreferred, createExamLayout, handleRadioGroupKeyDown, } from './layout.js';
// 10. Accessible dialogs and submit confirmation
export { createConfirmDialog, createAlertDialog, createSubmitConfirmDialog, createPromptDialog, } from './dialog.js';
