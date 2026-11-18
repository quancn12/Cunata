/// <reference lib="dom" />
/**
 * Checks if an event is currently part of an active IME composition session.
 */
export function isImeComposing(event) {
    if (!event)
        return false;
    // Modern browsers set isComposing on InputEvent / KeyboardEvent
    if ('isComposing' in event && event.isComposing === true) {
        return true;
    }
    // Fallback for legacy keycode 229 (IME processing key)
    if ('keyCode' in event && event.keyCode === 229) {
        return true;
    }
    return false;
}
/**
 * Creates an IME composition guard for input and textarea controls.
 *
 * Ensures Vietnamese Telex/VNI IME composition is never corrupted by uncontrolled
 * formatting, value resets, or cursor jumping (WEB-contract.md §9 and Shared Product Contract §1).
 *
 * NOTE: Simulated synthetic events in unit tests verify JavaScript guard logic,
 * but do NOT count as actual OS IME verification.
 */
export function createCompositionGuard(options) {
    const { element, onCommit, onInput } = options;
    let isComposing = false;
    const handleCompositionStart = () => {
        isComposing = true;
    };
    const handleCompositionUpdate = () => {
        isComposing = true;
    };
    const handleCompositionEnd = () => {
        isComposing = false;
        // Commit the final composed string without reformatting or moving cursor
        onCommit(element.value);
    };
    const handleInput = (event) => {
        // If currently composing via IME, never reformat or disrupt native cursor
        if (isComposing || isImeComposing(event)) {
            return;
        }
        if (onInput) {
            onInput(element.value);
        }
        else {
            onCommit(element.value);
        }
    };
    const handleKeyDown = (event) => {
        // Suppress Enter submission or hotkey triggers while IME composition is active
        if (isComposing || isImeComposing(event)) {
            if (event.key === 'Enter') {
                // Do not submit form while confirming IME candidate
                return;
            }
        }
    };
    element.addEventListener('compositionstart', handleCompositionStart);
    element.addEventListener('compositionupdate', handleCompositionUpdate);
    element.addEventListener('compositionend', handleCompositionEnd);
    element.addEventListener('input', handleInput);
    element.addEventListener('keydown', handleKeyDown);
    const dispose = () => {
        element.removeEventListener('compositionstart', handleCompositionStart);
        element.removeEventListener('compositionupdate', handleCompositionUpdate);
        element.removeEventListener('compositionend', handleCompositionEnd);
        element.removeEventListener('input', handleInput);
        element.removeEventListener('keydown', handleKeyDown);
    };
    return {
        isComposing: () => isComposing,
        dispose,
    };
}
