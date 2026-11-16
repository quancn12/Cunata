/// <reference lib="dom" />

/**
 * Cunata Web M6: Accessible Modal Dialogs, Safe Focus Return & Composition-Preserving Inputs.
 * Conforms to WEB-contract.md §5, §9 and Shared Product Contract v2.0.
 * Zero external framework/CDN dependencies.
 */

import { openModal } from './modal.ts';
import { enforceTouchTarget } from './layout.ts';

export interface BaseDialogOptions {
  readonly title: string;
  readonly role?: 'dialog' | 'alertdialog';
  readonly returnFocusTo?: HTMLElement | null;
  readonly closeOnEscape?: boolean;
  readonly closeOnBackdropClick?: boolean;
  readonly document?: Document;
}

export interface DialogInstance {
  readonly element: HTMLElement;
  readonly backdrop: HTMLElement;
  readonly close: () => void;
  readonly isOpened: () => boolean;
}

export interface ConfirmDialogOptions extends BaseDialogOptions {
  readonly message: string | HTMLElement;
  readonly confirmText?: string;
  readonly cancelText?: string;
  readonly isDestructive?: boolean;
  readonly onConfirm: () => void | Promise<void>;
  readonly onCancel?: () => void;
}

export interface AlertDialogOptions extends BaseDialogOptions {
  readonly message: string | HTMLElement;
  readonly okText?: string;
  readonly priority?: 'info' | 'warning' | 'error';
  readonly onOk?: () => void;
}

export interface SubmitConfirmDialogOptions extends Omit<BaseDialogOptions, 'title'> {
  readonly title?: string;
  readonly totalQuestions: number;
  readonly answeredCount: number;
  readonly unansweredCount: number;
  readonly flaggedCount?: number;
  readonly candidateName?: string;
  readonly onConfirmSubmit: () => void | Promise<void>;
  readonly onCancel?: () => void;
}

export interface PromptDialogOptions extends BaseDialogOptions {
  readonly message?: string | HTMLElement;
  readonly defaultValue?: string;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly confirmText?: string;
  readonly cancelText?: string;
  readonly onConfirm: (value: string) => void | Promise<void>;
  readonly onCancel?: () => void;
  readonly validate?: (value: string) => string | null;
}

let dialogIdCounter = 0;

/**
 * Generic dialog builder with accessible backdrop, title, focus trap, and focus return.
 */
function buildDialogBase(
  options: BaseDialogOptions,
  builder: (dialogEl: HTMLElement, closeDialog: () => void) => {
    initialFocus?: HTMLElement;
    onBeforeClose?: () => void;
  }
): DialogInstance {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) {
    throw new Error('Document is required to open a dialog');
  }

  const dialogId = `cunata-dialog-${++dialogIdCounter}`;
  const titleId = `${dialogId}-title`;
  const bodyId = `${dialogId}-body`;

  // 1. Backdrop
  const backdrop = doc.createElement('div');
  backdrop.className = 'cunata-dialog-backdrop';

  // 2. Dialog Container
  const dialogEl = doc.createElement('div');
  dialogEl.id = dialogId;
  dialogEl.className = 'cunata-dialog';
  dialogEl.setAttribute('role', options.role || 'dialog');
  dialogEl.setAttribute('aria-modal', 'true');
  dialogEl.setAttribute('aria-labelledby', titleId);
  dialogEl.setAttribute('aria-describedby', bodyId);
  backdrop.appendChild(dialogEl);

  // 3. Header
  const headerEl = doc.createElement('div');
  headerEl.className = 'cunata-dialog-header';

  const titleEl = doc.createElement('h2');
  titleEl.id = titleId;
  titleEl.className = 'cunata-dialog-title';
  titleEl.textContent = options.title;
  headerEl.appendChild(titleEl);
  dialogEl.appendChild(headerEl);

  let modalInstance: ReturnType<typeof openModal> | null = null;
  let isOpen = true;

  const closeDialog = () => {
    if (!isOpen) return;
    isOpen = false;
    hookResult.onBeforeClose?.();
    if (backdrop.parentNode) {
      backdrop.parentNode.removeChild(backdrop);
    }
    modalInstance?.close();
  };

  // Close on backdrop click if enabled
  if (options.closeOnBackdropClick !== false) {
    backdrop.addEventListener('click', (e: MouseEvent) => {
      if (e.target === backdrop) {
        closeDialog();
      }
    });
  }

  // 4. Construct content via builder hook
  const hookResult = builder(dialogEl, closeDialog);

  // 5. Mount to document
  if (doc.body) {
    doc.body.appendChild(backdrop);
  }

  // 6. Open accessible modal with focus trap and return
  modalInstance = openModal(dialogEl, {
    document: doc,
    initialFocus: hookResult.initialFocus,
    returnFocusTo: options.returnFocusTo,
    closeOnEscape: options.closeOnEscape !== false,
    ariaLabelledBy: titleId,
    onClose: () => {
      if (isOpen) {
        closeDialog();
      }
    },
  });

  // Re-assert specific role if requested (since openModal sets role="dialog")
  if (options.role) {
    dialogEl.setAttribute('role', options.role);
  }

  return {
    element: dialogEl,
    backdrop,
    close: closeDialog,
    isOpened: () => isOpen,
  };
}

/**
 * Creates an accessible confirmation dialog with double-click guard.
 */
/** @deprecated Use components.ts for new screens; retained for existing callers. */
export function createConfirmDialog(options: ConfirmDialogOptions): DialogInstance {
  let isConfirmed = false;
  let isSubmitting = false;

  return buildDialogBase(options, (dialogEl, closeDialog) => {
    const doc = options.document || dialogEl.ownerDocument || document;

    const onBeforeClose = () => {
      if (!isConfirmed) {
        options.onCancel?.();
      }
    };

    // Body
    const bodyEl = doc.createElement('div');
    bodyEl.id = `${dialogEl.id}-body`;
    bodyEl.className = 'cunata-dialog-body';
    if (typeof options.message === 'string') {
      bodyEl.textContent = options.message;
    } else {
      bodyEl.appendChild(options.message);
    }
    dialogEl.appendChild(bodyEl);

    // Footer actions
    const footerEl = doc.createElement('div');
    footerEl.className = 'cunata-dialog-footer';

    const cancelBtn = doc.createElement('button');
    cancelBtn.setAttribute('type', 'button');
    cancelBtn.className = 'cunata-btn cunata-btn-cancel';
    cancelBtn.textContent = options.cancelText || 'Hủy bỏ';
    enforceTouchTarget(cancelBtn, 44);

    const confirmBtn = doc.createElement('button');
    confirmBtn.setAttribute('type', 'button');
    confirmBtn.className = options.isDestructive
      ? 'cunata-btn cunata-btn-danger'
      : 'cunata-btn cunata-btn-primary';
    confirmBtn.textContent = options.confirmText || 'Xác nhận';
    enforceTouchTarget(confirmBtn, 44);

    cancelBtn.addEventListener('click', () => {
      if (isSubmitting) return;
      closeDialog();
    });

    confirmBtn.addEventListener('click', () => {
      if (isSubmitting) return;
      isSubmitting = true;
      confirmBtn.setAttribute('disabled', 'true');
      cancelBtn.setAttribute('disabled', 'true');

      try {
        const result = options.onConfirm();
        if (result && typeof (result as any).then === 'function') {
          (result as Promise<void>).then(
            () => {
              isConfirmed = true;
              closeDialog();
            },
            () => {
              closeDialog();
            }
          );
        } else {
          isConfirmed = true;
          closeDialog();
        }
      } catch (err) {
        closeDialog();
        throw err;
      }
    });

    footerEl.appendChild(cancelBtn);
    footerEl.appendChild(confirmBtn);
    dialogEl.appendChild(footerEl);

    // For safety, especially on destructive actions, focus cancel button by default
    return { initialFocus: cancelBtn, onBeforeClose };
  });
}

/**
 * Creates an accessible non-blocking alert dialog (never halts background timer countdowns).
 */
/** @deprecated Use components.ts for new screens; retained for existing callers. */
export function createAlertDialog(options: AlertDialogOptions): DialogInstance {
  return buildDialogBase({ ...options, role: 'alertdialog' }, (dialogEl, closeDialog) => {
    const doc = options.document || dialogEl.ownerDocument || document;

    // Body
    const bodyEl = doc.createElement('div');
    bodyEl.id = `${dialogEl.id}-body`;
    bodyEl.className = 'cunata-dialog-body';
    if (typeof options.message === 'string') {
      bodyEl.textContent = options.message;
    } else {
      bodyEl.appendChild(options.message);
    }
    dialogEl.appendChild(bodyEl);

    // Footer
    const footerEl = doc.createElement('div');
    footerEl.className = 'cunata-dialog-footer';

    const okBtn = doc.createElement('button');
    okBtn.setAttribute('type', 'button');
    okBtn.className = 'cunata-btn cunata-btn-primary';
    okBtn.textContent = options.okText || 'Đã hiểu';
    enforceTouchTarget(okBtn, 44);

    okBtn.addEventListener('click', () => {
      options.onOk?.();
      closeDialog();
    });

    footerEl.appendChild(okBtn);
    dialogEl.appendChild(footerEl);

    return { initialFocus: okBtn };
  });
}

/**
 * Creates the Exam Submission Confirmation Dialog.
 * Conforms to WEB-contract.md §9:
 * - Summarizes answered vs unanswered questions.
 * - Prominently warns about unanswered questions with zero score.
 * - Double-click / double-trigger protection against race conditions.
 * - Restores focus to trigger button upon cancellation.
 */
/** @deprecated Use components.ts for new screens; retained for existing callers. */
export function createSubmitConfirmDialog(options: SubmitConfirmDialogOptions): DialogInstance {
  let isConfirmed = false;
  let isSubmitting = false;

  const dialogOptions: BaseDialogOptions = {
    title: options.title || 'Xác nhận nộp bài thi',
    returnFocusTo: options.returnFocusTo,
    closeOnEscape: options.closeOnEscape !== false,
    closeOnBackdropClick: false, // Prevent accidental closing by clicking outside
    document: options.document,
  };

  return buildDialogBase(dialogOptions, (dialogEl, closeDialog) => {
    const doc = options.document || dialogEl.ownerDocument || document;

    const onBeforeClose = () => {
      if (!isConfirmed) {
        options.onCancel?.();
      }
    };

    // Body
    const bodyEl = doc.createElement('div');
    bodyEl.id = `${dialogEl.id}-body`;
    bodyEl.className = 'cunata-dialog-body';

    if (options.candidateName) {
      const candidateP = doc.createElement('p');
      candidateP.className = 'cunata-dialog-candidate-info';
      candidateP.textContent = `Thí sinh: ${options.candidateName}`;
      candidateP.style.fontWeight = '600';
      bodyEl.appendChild(candidateP);
    }

    const summaryP = doc.createElement('p');
    summaryP.textContent = `Tổng số câu hỏi: ${options.totalQuestions} câu.`;
    bodyEl.appendChild(summaryP);

    const statsList = doc.createElement('ul');
    statsList.style.paddingLeft = '20px';
    statsList.style.margin = '8px 0';

    const liAnswered = doc.createElement('li');
    liAnswered.textContent = `Đã trả lời: ${options.answeredCount} câu`;
    liAnswered.style.color = 'var(--c-success)'; // green-700
    liAnswered.style.fontWeight = '600';
    statsList.appendChild(liAnswered);

    const liUnanswered = doc.createElement('li');
    liUnanswered.textContent = `Chưa trả lời: ${options.unansweredCount} câu`;
    if (options.unansweredCount > 0) {
      liUnanswered.style.color = 'var(--c-danger)'; // red-700
      liUnanswered.style.fontWeight = '700';
    }
    statsList.appendChild(liUnanswered);

    if (options.flaggedCount !== undefined && options.flaggedCount > 0) {
      const liFlagged = doc.createElement('li');
      liFlagged.textContent = `Đánh dấu xem lại: ${options.flaggedCount} câu`;
      liFlagged.style.color = 'var(--c-warning)'; // amber-700
      statsList.appendChild(liFlagged);
    }

    bodyEl.appendChild(statsList);

    // Prominent Warning if unanswered
    if (options.unansweredCount > 0) {
      const warningBox = doc.createElement('div');
      warningBox.className = 'cunata-dialog-warning-box';
      warningBox.setAttribute('role', 'alert');
      warningBox.textContent = `Chú ý: Bạn còn ${options.unansweredCount} câu chưa làm. Khi nộp bài, các câu chưa làm sẽ nhận 0 điểm. Bạn có chắc chắn muốn nộp bài?`;
      bodyEl.appendChild(warningBox);
    } else {
      const allDoneP = doc.createElement('p');
      allDoneP.textContent = 'Bạn đã hoàn thành tất cả các câu hỏi trong đề thi!';
      allDoneP.style.color = 'var(--c-success)';
      allDoneP.style.fontWeight = '600';
      bodyEl.appendChild(allDoneP);
    }

    dialogEl.appendChild(bodyEl);

    // Footer actions
    const footerEl = doc.createElement('div');
    footerEl.className = 'cunata-dialog-footer';

    const cancelBtn = doc.createElement('button');
    cancelBtn.setAttribute('type', 'button');
    cancelBtn.className = 'cunata-btn cunata-btn-cancel';
    cancelBtn.textContent = 'Tiếp tục làm bài';
    enforceTouchTarget(cancelBtn, 44);

    const submitBtn = doc.createElement('button');
    submitBtn.setAttribute('type', 'button');
    submitBtn.className = options.unansweredCount > 0
      ? 'cunata-btn cunata-btn-danger'
      : 'cunata-btn cunata-btn-primary';
    submitBtn.textContent = 'Đồng ý nộp bài';
    enforceTouchTarget(submitBtn, 44);

    cancelBtn.addEventListener('click', () => {
      if (isSubmitting) return;
      closeDialog();
    });

    submitBtn.addEventListener('click', () => {
      if (isSubmitting) return;
      isSubmitting = true;

      // Double-click guard: disable buttons and update label
      submitBtn.setAttribute('disabled', 'true');
      cancelBtn.setAttribute('disabled', 'true');
      submitBtn.textContent = 'Đang nộp bài...';

      try {
        const result = options.onConfirmSubmit();
        if (result && typeof (result as any).then === 'function') {
          (result as Promise<void>).then(
            () => {
              isConfirmed = true;
              closeDialog();
            },
            () => {
              closeDialog();
            }
          );
        } else {
          isConfirmed = true;
          closeDialog();
        }
      } catch (err) {
        closeDialog();
        throw err;
      }
    });

    footerEl.appendChild(cancelBtn);
    footerEl.appendChild(submitBtn);
    dialogEl.appendChild(footerEl);

    // Default focus to cancelBtn to prevent accidental submissions
    return { initialFocus: cancelBtn, onBeforeClose };
  });
}

/**
 * Creates an accessible prompt dialog with Vietnamese IME composition protection.
 * Conforms to Shared Product Contract v2.0 §1, §3 and WEB-contract.md §9:
 * - Enter key pressed during IME composition (Telex/VNI) DOES NOT submit the form.
 * - Preserves native text input and cursor position.
 */
/** @deprecated Use components.ts for new screens; retained for existing callers. */
export function createPromptDialog(options: PromptDialogOptions): DialogInstance {
  let isConfirmed = false;
  let isSubmitting = false;

  return buildDialogBase(options, (dialogEl, closeDialog) => {
    const doc = options.document || dialogEl.ownerDocument || document;

    const onBeforeClose = () => {
      if (!isConfirmed) {
        options.onCancel?.();
      }
    };

    // Body
    const bodyEl = doc.createElement('div');
    bodyEl.id = `${dialogEl.id}-body`;
    bodyEl.className = 'cunata-dialog-body';

    if (options.message) {
      if (typeof options.message === 'string') {
        const p = doc.createElement('p');
        p.textContent = options.message;
        bodyEl.appendChild(p);
      } else {
        bodyEl.appendChild(options.message);
      }
    }

    // Input form
    const form = doc.createElement('form');
    form.onsubmit = (e) => {
      e?.preventDefault?.();
    };

    const inputGroup = doc.createElement('div');
    inputGroup.style.margin = '12px 0';

    const input = doc.createElement('input');
    input.setAttribute('type', 'text');
    input.className = 'cunata-prompt-input';
    input.value = options.defaultValue || '';
    if (options.placeholder) input.placeholder = options.placeholder;
    if (options.maxLength) input.maxLength = options.maxLength;
    enforceTouchTarget(input, 44);

    const errorMsg = doc.createElement('div');
    errorMsg.className = 'cunata-prompt-error';
    errorMsg.style.color = 'var(--c-danger)';
    errorMsg.style.fontSize = '0.875rem';
    errorMsg.style.marginTop = '4px';
    errorMsg.style.minHeight = '1.25rem';
    errorMsg.setAttribute('aria-live', 'polite');

    inputGroup.appendChild(input);
    inputGroup.appendChild(errorMsg);
    form.appendChild(inputGroup);
    bodyEl.appendChild(form);
    dialogEl.appendChild(bodyEl);

    // Footer actions
    const footerEl = doc.createElement('div');
    footerEl.className = 'cunata-dialog-footer';

    const cancelBtn = doc.createElement('button');
    cancelBtn.setAttribute('type', 'button');
    cancelBtn.className = 'cunata-btn cunata-btn-cancel';
    cancelBtn.textContent = options.cancelText || 'Hủy bỏ';
    enforceTouchTarget(cancelBtn, 44);

    const submitBtn = doc.createElement('button');
    submitBtn.setAttribute('type', 'button');
    submitBtn.className = 'cunata-btn cunata-btn-primary';
    submitBtn.textContent = options.confirmText || 'Xác nhận';
    enforceTouchTarget(submitBtn, 44);

    let isComposing = false;

    // IME composition events
    input.addEventListener('compositionstart', () => {
      isComposing = true;
    });

    input.addEventListener('compositionend', () => {
      isComposing = false;
    });

    const triggerSubmit = () => {
      if (isSubmitting) return;

      const val = input.value;
      if (options.validate) {
        const err = options.validate(val);
        if (err) {
          errorMsg.textContent = err;
          input.focus();
          return;
        }
      }

      isSubmitting = true;
      submitBtn.setAttribute('disabled', 'true');
      cancelBtn.setAttribute('disabled', 'true');

      try {
        const result = options.onConfirm(val);
        if (result && typeof (result as any).then === 'function') {
          (result as Promise<void>).then(
            () => {
              isConfirmed = true;
              closeDialog();
            },
            () => {
              closeDialog();
            }
          );
        } else {
          isConfirmed = true;
          closeDialog();
        }
      } catch (err) {
        closeDialog();
        throw err;
      }
    };

    // Keyboard model: Enter submits only when NOT composing
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      // If user is actively typing Vietnamese IME, ignore Enter so it commits IME syllable without submitting
      if (e.key === 'Enter') {
        if (isComposing || (e as any).isComposing) {
          return;
        }
        e.preventDefault();
        triggerSubmit();
      }
    });

    cancelBtn.addEventListener('click', () => {
      if (isSubmitting) return;
      closeDialog();
    });

    submitBtn.addEventListener('click', () => {
      triggerSubmit();
    });

    footerEl.appendChild(cancelBtn);
    footerEl.appendChild(submitBtn);
    dialogEl.appendChild(footerEl);

    return { initialFocus: input, onBeforeClose };
  });
}
