/// <reference lib="dom" />
/**
 * Detects routine second-by-second countdown ticks that must NOT be announced
 * via aria-live to avoid screen reader clutter (WEB-contract.md §9).
 */
export function isRoutineTimerTick(message) {
    if (typeof message !== 'string')
        return false;
    const trimmed = message.trim();
    // Pure time patterns like "49:59", "00:05", "1:23:45"
    if (/^(?:\d{1,2}:)?\d{1,2}:\d{2}$/.test(trimmed)) {
        return true;
    }
    // Phrases representing regular timer ticks: "Còn lại 49:58", "Thời gian: 12:30", "45s"
    if (/^(?:còn|thời gian|còn lại|time remaining|timer)?:?\s*(?:\d{1,2}:)?\d{1,2}:\d{2}$/i.test(trimmed)) {
        return true;
    }
    return false;
}
/**
 * Checks whether a timer event is a significant milestone worthy of user announcement
 * (e.g. "Hết giờ", "Còn 5 phút", "Còn 1 phút").
 */
export function isMilestoneAnnouncement(message) {
    if (typeof message !== 'string')
        return false;
    const lower = message.toLowerCase().trim();
    return (lower.includes('hết giờ') ||
        lower.includes('hết thời gian') ||
        lower.includes('còn 1 phút') ||
        lower.includes('còn 5 phút') ||
        lower.includes('còn 15 phút') ||
        lower.includes('time expired'));
}
/**
 * Creates an aria-live status announcer for accessible status updates.
 * Suppresses continuous timer second updates to prevent overwhelming assistive technology.
 */
export function createStatusAnnouncer(options = {}) {
    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    if (!doc) {
        throw new Error('DOM Document is required for status announcer');
    }
    const suppressTimerTicks = options.suppressTimerTicks !== false;
    let liveRegion;
    let managed = false;
    if (options.container) {
        liveRegion = options.container;
    }
    else {
        liveRegion = doc.createElement('div');
        liveRegion.className = 'cunata-sr-only';
        managed = true;
        doc.body.appendChild(liveRegion);
    }
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    const announce = (message, priority = 'polite') => {
        if (typeof message !== 'string')
            return;
        const trimmed = message.trim();
        if (trimmed.length === 0)
            return;
        // Suppress regular second-by-second timer countdown ticks
        if (suppressTimerTicks && isRoutineTimerTick(trimmed) && !isMilestoneAnnouncement(trimmed)) {
            return;
        }
        liveRegion.setAttribute('aria-live', priority);
        // To ensure screen readers announce identical sequential messages, toggle text
        liveRegion.textContent = '';
        liveRegion.textContent = trimmed;
    };
    const clear = () => {
        liveRegion.textContent = '';
    };
    const dispose = () => {
        clear();
        if (managed && liveRegion.parentNode) {
            liveRegion.parentNode.removeChild(liveRegion);
        }
    };
    return {
        announce,
        clear,
        dispose,
        getElement: () => liveRegion,
    };
}
/**
 * Directly announces a status message onto a target container element.
 */
export function announceStatus(container, message, priority = 'polite') {
    if (isRoutineTimerTick(message) && !isMilestoneAnnouncement(message)) {
        return;
    }
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', priority);
    container.setAttribute('aria-atomic', 'true');
    container.textContent = message;
}
