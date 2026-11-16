/// <reference lib="dom" />

/**
 * Cunata Web M6 Foundations: Safe DOM, Focus, Dialogs, and IME Primitives.
 * Conforms to WEB-contract.md §3, §5, §9 and Shared Product Contract v2.0.
 */

// Legacy exports below are retained for compatibility.
// New screens should use components.ts and components.css (DESIGN.md §4).
export {
  Button, Input, Select, Textarea, Card, ExamCard, StatusBadge, TopBar,
  NavRail, BottomNav, Dialog, BottomSheet, Toast, EmptyState, ErrorState,
  OfflineBanner, Skeleton, Table,
  createButton, createInput, createSelect, createTextarea, createCard, createExamCard,
  createExamStatusBadge, createTopBar, createNavRail, createBottomNav, createDialog,
  createBottomSheet, createToast, createEmptyState, createErrorState,
  createOfflineBanner, createSkeleton, createTable,
} from './components.ts';
export type {
  Content, ButtonOptions, ButtonElement, FieldOptions, InputOptions, Field, SelectOptions,
  ExamStatus, ExamCardOptions, TopBarOptions, NavItem, NavOptions, DialogOptions,
  DialogHandle, ToastHandle, StateOptions, TableColumn, TableOptions,
  StatusBadgeOptions as ExamStatusBadgeOptions,
} from './components.ts';
export { Icon, createIcon } from './icons.ts';
export type { IconName } from './icons.ts';

// 1. Mount convention
export { mount } from './mount.ts';
export type { UiViewModel } from './mount.ts';

// 2. Types
export type {
  Block,
  Cell,
  Asset,
  RenderOptions,
  ModalOptions,
  ModalInstance,
  AnnouncerOptions,
  StatusAnnouncer,
  CompositionGuardOptions,
  CompositionGuard,
  UiActions,
  MountFn,
} from './types.ts';

// 3. Security, URL, and MIME validation
export {
  ALLOWED_IMAGE_MIMES,
  isSafeMimeType,
  isSafeUrl,
  sanitizeUrl,
  isSafeSvg,
  resolveAssetUrl,
} from './security.ts';
export type { AllowedImageMime } from './security.ts';

// 4. Safe DOM and block rendering
export {
  renderText,
  renderMath,
  renderImage,
  renderTable,
  renderBlock,
  renderBlocks,
} from './blocks.ts';

// 5. Accessible modal and focus return management
export {
  openModal,
  trapFocus,
  getFocusableElements,
} from './modal.ts';

// 6. Accessible aria-live status announcer (suppresses routine timer ticks)
export {
  createStatusAnnouncer,
  announceStatus,
  isRoutineTimerTick,
  isMilestoneAnnouncement,
} from './status.ts';

// 7. IME composition guards preserving native Vietnamese input and cursor
export {
  createCompositionGuard,
  isImeComposing,
} from './composition.ts';

// 8. Scoped UI CSS styles
export {
  SCOPED_UI_CSS,
  ensureScopedStyles,
} from './styles.ts';

// 9. Responsive layout, breakpoints, touch targets and overflow wrappers
export {
  BREAKPOINTS,
  LAYOUT_STYLE_ELEMENT_ID,
  LAYOUT_CSS,
  classifyBreakpoint,
  ensureLayoutStyles,
  enforceTouchTarget,
  wrapMathOverflow,
  wrapTableResponsive,
  createStatusBadge,
  createSkipLink,
  isReducedMotionPreferred,
  createExamLayout,
  handleRadioGroupKeyDown,
} from './layout.ts';
export type {
  Breakpoint,
  SaveState,
  StatusBadgeOptions,
  ExamLayoutOptions,
  ExamLayoutInstance,
  RadioGroupKeyboardOptions,
} from './layout.ts';

// 10. Accessible dialogs and submit confirmation
export {
  createConfirmDialog,
  createAlertDialog,
  createSubmitConfirmDialog,
  createPromptDialog,
} from './dialog.ts';
export type {
  BaseDialogOptions,
  DialogInstance,
  ConfirmDialogOptions,
  AlertDialogOptions,
  SubmitConfirmDialogOptions,
  PromptDialogOptions,
} from './dialog.ts';
