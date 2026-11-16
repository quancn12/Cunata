/// <reference lib="dom" />
const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');
/**
 * Returns all currently visible and focusable elements inside a container.
 */
/** @deprecated Use components.ts for new screens; retained for existing callers. */
export function getFocusableElements(container) {
    const elements = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
    return elements.filter((el) => {
        // Basic visibility check
        const style = el.style;
        if (style && (style.display === 'none' || style.visibility === 'hidden')) {
            return false;
        }
        return !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true';
    });
}
/**
 * Traps Tab and Shift+Tab focus navigation within the modal container.
 */
/** @deprecated Use components.ts for new screens; retained for existing callers. */
export function trapFocus(container, event) {
    if (event.key !== 'Tab')
        return;
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const doc = container.ownerDocument || document;
    const current = doc.activeElement;
    if (event.shiftKey) {
        // Shift + Tab: if on first element or on container, wrap to last
        if (!current || current === first || current === container) {
            event.preventDefault();
            last?.focus();
        }
    }
    else {
        // Tab: if on last element, wrap to first
        if (current === last) {
            event.preventDefault();
            first?.focus();
        }
    }
}
/**
 * Opens a modal dialog with accessibility semantics, focus trap, and guaranteed
 * focus return to the originating element when dismissed.
 */
/** @deprecated Use components.ts for new screens; retained for existing callers. */
export function openModal(dialogEl, options = {}) {
    const doc = options.document || dialogEl.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc) {
        throw new Error('DOM Document is required for modal management');
    }
    // 1. Remember the element that had focus before opening the dialog
    const returnFocusTo = options.returnFocusTo !== undefined
        ? options.returnFocusTo
        : doc.activeElement;
    // 2. Configure accessibility attributes
    dialogEl.setAttribute('role', 'dialog');
    dialogEl.setAttribute('aria-modal', 'true');
    if (options.ariaLabel) {
        dialogEl.setAttribute('aria-label', options.ariaLabel);
    }
    if (options.ariaLabelledBy) {
        dialogEl.setAttribute('aria-labelledby', options.ariaLabelledBy);
    }
    // Ensure dialog container can receive focus if needed
    if (!dialogEl.hasAttribute('tabindex')) {
        dialogEl.setAttribute('tabindex', '-1');
    }
    let isOpen = true;
    // 3. Keydown handler for Escape and Tab focus trap
    const handleKeydown = (event) => {
        if (!isOpen)
            return;
        if (options.closeOnEscape !== false && (event.key === 'Escape' || event.key === 'Esc')) {
            event.preventDefault();
            close();
            return;
        }
        if (event.key === 'Tab') {
            trapFocus(dialogEl, event);
        }
    };
    dialogEl.addEventListener('keydown', handleKeydown);
    // 4. Initial focus
    const setInitialFocus = () => {
        if (options.initialFocus) {
            if (typeof options.initialFocus === 'string') {
                const found = dialogEl.querySelector(options.initialFocus);
                if (found) {
                    found.focus();
                    return;
                }
            }
            else if (typeof options.initialFocus.focus === 'function') {
                options.initialFocus.focus();
                return;
            }
        }
        // Default: focus first focusable child, or dialog itself
        const focusable = getFocusableElements(dialogEl);
        if (focusable.length > 0 && focusable[0]) {
            focusable[0].focus();
        }
        else {
            dialogEl.focus();
        }
    };
    // Run initial focus
    setInitialFocus();
    // 5. Close / unmount handler
    const close = () => {
        if (!isOpen)
            return;
        isOpen = false;
        dialogEl.removeEventListener('keydown', handleKeydown);
        // Call custom close callback
        options.onClose?.();
        // Critical: Return focus to previous element
        if (returnFocusTo && typeof returnFocusTo.focus === 'function') {
            try {
                returnFocusTo.focus();
            }
            catch {
                // Silently catch if element was detached from DOM
            }
        }
    };
    return {
        close,
        isOpened: () => isOpen,
        element: dialogEl,
    };
}
