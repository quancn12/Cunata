/// <reference lib="dom" />
import { Icon } from './icons.js';
function el(tag, className, doc) {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
}
function append(node, content) {
    if (content !== undefined)
        node.append(...(Array.isArray(content) ? content : [content]));
}
function identify(node, id) { if (id)
    node.id = id; }
/** IDs are scoped to the owning document, with no cross-document global counter. */
function unique(doc, prefix) {
    const id = doc.defaultView?.crypto.randomUUID() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${id}`;
}
export function Button(options, doc = document) {
    const button = el('button', `ui-button ui-button--${options.variant ?? 'secondary'}`, doc);
    button.type = options.type ?? 'button';
    identify(button, options.id);
    button.setAttribute('aria-label', options.label);
    if (options.icon)
        button.append(Icon(options.icon, doc));
    const label = el('span', 'ui-button-label', doc);
    label.textContent = options.label;
    if (!options.iconOnly)
        button.append(label);
    else if (!options.icon)
        throw new TypeError('iconOnly requires an icon');
    const spinner = el('span', 'ui-spinner', doc);
    spinner.setAttribute('aria-hidden', 'true');
    button.append(spinner);
    let disabled = options.disabled ?? false, loading = options.loading ?? false;
    const sync = () => {
        button.disabled = disabled || loading;
        button.setAttribute('aria-disabled', String(button.disabled));
        button.setAttribute('aria-busy', String(loading));
    };
    button.setLoading = (value) => { loading = value; sync(); };
    button.setDisabled = (value) => { disabled = value; sync(); };
    if (options.onClick)
        button.addEventListener('click', options.onClick);
    sync();
    return button;
}
function field(control, options, doc) {
    const element = el('div', 'ui-field', doc);
    control.classList.add('ui-control');
    control.id = options.id ?? unique(doc, 'field');
    control.name = options.name ?? control.id;
    control.required = options.required ?? false;
    control.disabled = options.disabled ?? false;
    const label = el('label', 'ui-field-label', doc);
    label.htmlFor = control.id;
    label.textContent = options.label;
    const hint = el('div', 'ui-field-hint', doc);
    hint.id = `${control.id}-hint`;
    hint.textContent = options.hint ?? '';
    hint.hidden = !options.hint;
    const error = el('div', 'ui-field-error', doc);
    error.id = `${control.id}-error`;
    error.setAttribute('aria-live', 'polite');
    const setError = (message) => {
        error.replaceChildren();
        error.hidden = !message;
        if (message)
            error.append(Icon('warning', doc), doc.createTextNode(message));
        control.setAttribute('aria-invalid', String(Boolean(message)));
        const described = [options.hint ? hint.id : '', message ? error.id : ''].filter(Boolean);
        if (described.length)
            control.setAttribute('aria-describedby', described.join(' '));
        else
            control.removeAttribute('aria-describedby');
    };
    if (options.onInput)
        control.addEventListener('input', (event) => options.onInput(control.value, event));
    element.append(label, control, hint, error);
    setError(options.error ?? '');
    return { element, control, setError };
}
export function Input(options, doc = document) {
    const control = doc.createElement('input');
    control.type = options.type ?? 'text';
    control.value = options.value ?? '';
    if (options.autocomplete)
        control.setAttribute('autocomplete', options.autocomplete);
    if (options.inputMode)
        control.inputMode = options.inputMode;
    return field(control, options, doc);
}
export function Select(options, doc = document) {
    const control = doc.createElement('select');
    for (const item of options.options) {
        const option = doc.createElement('option');
        option.value = item.value;
        option.textContent = item.label;
        option.disabled = item.disabled ?? false;
        control.append(option);
    }
    if (options.value !== undefined)
        control.value = options.value;
    return field(control, options, doc);
}
export function Textarea(options, doc = document) {
    const control = doc.createElement('textarea');
    control.value = options.value ?? '';
    return field(control, options, doc);
}
export function Card(content, doc = document) {
    const card = el('div', 'ui-card', doc);
    append(card, content);
    return card;
}
export function StatusBadge(options, doc = document) {
    const badge = el('span', `ui-badge ui-badge--${options.status} exam-status`, doc);
    const labels = { 'not-started': 'Chưa làm', draft: 'Đang làm dở', submitted: 'Đã nộp', expired: 'Hết hạn', 'not-open': 'Chưa mở' };
    badge.textContent = labels[options.status] + (options.status === 'submitted' && options.score !== undefined ? ` · ${options.score.replace('.', ',')} điểm` : '');
    return badge;
}
export function ExamCard(options, doc = document) {
    const subject = options.subject.toLocaleLowerCase('vi');
    const band = /vật l[íý]|^l[íý]$/.test(subject) ? 'ly' : /hóa|hoá/.test(subject) ? 'hoa' : /toán/.test(subject) ? 'toan' : 'khac';
    const card = el('button', `ui-card exam-card exam-list-item exam-card--${band}`, doc);
    card.type = 'button';
    if (!card.dataset)
        card.dataset = {};
    card.dataset.examId = options.id;
    if (options.url)
        card.dataset.examUrl = options.url;
    if (options.assignmentId)
        card.dataset.assignmentId = options.assignmentId;
    if (options.source)
        card.dataset.examSource = options.source;
    const texts = [
        ['subject', options.subject], ['title', options.title],
        // WEB-contract §14 D05 limits this release to custom-v1; do not imply a verified THPT preset.
        ['description', options.description?.trim() || `Đề luyện tập ${options.questionCount} câu`],
        ['meta', `${options.questionCount} câu · ${options.durationMinutes} phút`],
    ];
    if (options.openAt)
        texts.push(['date', `Mở: ${options.openAt}`]);
    if (options.dueAt)
        texts.push(['date', `Hạn nộp: ${options.dueAt}`]);
    for (const [name, text] of texts) {
        const span = el('span', `ui-exam-${name}`, doc);
        span.textContent = text;
        card.append(span);
    }
    card.append(StatusBadge(options, doc));
    if (options.onClick)
        card.addEventListener('click', options.onClick);
    return card;
}
export function TopBar(options, doc = document) {
    const bar = el('header', 'ui-topbar', doc);
    const brand = el('span', 'ui-brand', doc);
    brand.textContent = 'Cunata';
    const role = el('span', 'ui-topbar-role', doc);
    role.textContent = options.role;
    const person = el('span', 'ui-topbar-person', doc);
    person.textContent = options.name ?? '';
    person.title = options.name ?? '';
    bar.append(brand, role, person);
    if (options.action)
        bar.append(Button(options.action, doc));
    return bar;
}
function nav(options, mode, doc) {
    const node = el('nav', `ui-nav ui-nav--${mode}`, doc);
    identify(node, options.id);
    node.setAttribute('aria-label', options.label ?? 'Điều hướng giáo viên');
    for (const item of options.items) {
        if (!/^(#|\.\/|\.\.\/|\/[^/])/.test(item.href) || /[\u0000-\u0020\\]/.test(item.href))
            throw new TypeError('Navigation requires a local URL');
        const link = el('a', '', doc);
        link.href = item.href;
        link.dataset.nav = item.key;
        if (item.key === options.active)
            link.setAttribute('aria-current', 'page');
        const label = el('span', '', doc);
        label.textContent = item.label;
        link.append(Icon(item.icon, doc), label);
        if (options.onNavigate)
            link.addEventListener('click', (event) => options.onNavigate(item.key, event));
        node.append(link);
    }
    return node;
}
export function NavRail(options, doc = document) { return nav(options, 'rail', doc); }
export function BottomNav(options, doc = document) { return nav(options, 'bottom', doc); }
function focusable(root) {
    return Array.from(root.querySelectorAll('button, [href], input, select, textarea, [tabindex]')).filter((node) => !node.matches(':disabled, [hidden], [aria-disabled="true"]') && node.tabIndex >= 0 && !node.closest('[hidden], [inert]') && node.getClientRects().length > 0 && node.ownerDocument.defaultView?.getComputedStyle(node).visibility !== 'hidden');
}
export function Dialog(options, doc = document) {
    const element = el('dialog', 'ui-dialog', doc);
    identify(element, options.id);
    element.tabIndex = -1;
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-modal', 'true');
    const heading = el('div', 'ui-dialog-heading', doc), title = el('h2', '', doc);
    title.id = unique(doc, 'dialog-title');
    title.textContent = options.title;
    element.setAttribute('aria-labelledby', title.id);
    const body = el('div', 'ui-stack', doc);
    append(body, options.content);
    const actions = el('div', 'ui-actions ui-dialog-actions', doc);
    let opener = null, opened = false, destroyed = false;
    const finish = () => {
        if (!opened)
            return;
        opened = false;
        if (opener?.isConnected)
            opener.focus();
        options.onClose?.();
    };
    const close = () => { if (!opened)
        return; element.close(); finish(); };
    heading.append(title, Button({ label: 'Đóng', icon: 'close', iconOnly: true, variant: 'ghost', onClick: close }, doc));
    for (const action of options.actions ?? [])
        actions.append(Button(action, doc));
    element.append(heading, body, actions);
    const cancel = (event) => { event.preventDefault(); close(); };
    const keydown = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
        }
        if (event.key !== 'Tab')
            return;
        const nodes = focusable(element), first = nodes[0], last = nodes.at(-1);
        if (!first) {
            event.preventDefault();
            element.focus();
            return;
        }
        if (event.shiftKey && (doc.activeElement === first || doc.activeElement === element)) {
            event.preventDefault();
            last?.focus();
        }
        else if (!event.shiftKey && (doc.activeElement === last || doc.activeElement === element)) {
            event.preventDefault();
            first.focus();
        }
    };
    // Native close is queued: an old close event must not finish a newly reopened dialog.
    const nativeClose = () => { if (!element.open)
        finish(); };
    element.addEventListener('cancel', cancel);
    element.addEventListener('close', nativeClose);
    element.addEventListener('keydown', keydown);
    return {
        element, body, actions,
        open(trigger) {
            if (destroyed)
                throw new Error('Dialog has been destroyed');
            if (opened)
                return;
            opener = trigger ?? (doc.activeElement instanceof (doc.defaultView?.HTMLElement ?? HTMLElement) ? doc.activeElement : null);
            if (!element.isConnected)
                doc.body.append(element);
            element.showModal();
            opened = true;
            const preferred = options.initialFocus;
            if (preferred && element.contains(preferred) && !preferred.matches(':disabled'))
                preferred.focus();
            else
                (focusable(element)[0] ?? element).focus();
        },
        close,
        destroy() { close(); destroyed = true; element.removeEventListener('cancel', cancel); element.removeEventListener('close', nativeClose); element.removeEventListener('keydown', keydown); element.remove(); },
    };
}
/** Responsive dialog: full-width bottom sheet below 640px. */
export function BottomSheet(options, doc = document) { return Dialog(options, doc); }
export function Toast(message, doc = document) {
    const element = el('div', 'ui-card ui-toast', doc);
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    let timer;
    const destroy = () => { clearTimeout(timer); element.remove(); };
    return { element, show(root = doc.body) { clearTimeout(timer); element.textContent = ''; root.append(element); element.textContent = message; timer = setTimeout(destroy, 4000); }, destroy };
}
export function EmptyState(options, doc = document) {
    const node = Card(undefined, doc);
    node.classList.add('ui-state');
    node.append(Icon(options.icon ?? 'book', doc));
    const text = el('p', '', doc);
    text.textContent = options.message;
    node.append(text);
    if (options.action)
        node.append(Button(options.action, doc));
    return node;
}
export function ErrorState(options, doc = document) {
    const node = EmptyState({ ...options, icon: 'warning' }, doc);
    node.classList.add('ui-error');
    node.setAttribute('role', 'alert');
    return node;
}
export function OfflineBanner(options = {}, doc = document) {
    const node = el('div', 'ui-offline', doc);
    node.setAttribute('role', 'status');
    const text = el('p', '', doc);
    text.textContent = 'Đang ngoại tuyến — bài làm vẫn được lưu trên máy';
    node.append(Icon('offline', doc), text);
    if (options.onRetry)
        node.append(Button({ label: 'Thử lại', onClick: options.onRetry }, doc));
    return node;
}
export function Skeleton(options = {}, doc = document) {
    const node = Card(undefined, doc);
    node.classList.add('ui-skeleton');
    node.setAttribute('role', 'status');
    node.setAttribute('aria-label', options.label ?? 'Đang tải danh sách');
    node.setAttribute('aria-busy', 'true');
    const lines = Math.max(1, Math.min(20, Math.floor(options.lines ?? 3)));
    for (let i = 0; i < lines; i++) {
        const line = el('div', 'ui-skeleton-line', doc);
        line.setAttribute('aria-hidden', 'true');
        node.append(line);
    }
    return node;
}
export function Table(options, doc = document) {
    const wrap = el('div', 'ui-table-wrap', doc);
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', options.caption);
    const table = el('table', 'ui-table', doc);
    identify(table, options.id);
    table.setAttribute('role', 'table');
    const caption = doc.createElement('caption');
    caption.textContent = options.caption;
    const head = doc.createElement('thead'), row = doc.createElement('tr');
    row.setAttribute('role', 'row');
    for (const column of options.columns) {
        const th = doc.createElement('th');
        th.id = unique(doc, 'column');
        th.scope = 'col';
        th.textContent = column.label;
        if (column.numeric)
            th.className = 'ui-numeric';
        row.append(th);
    }
    head.append(row);
    const body = doc.createElement('tbody');
    body.setAttribute('role', 'rowgroup');
    for (const item of options.rows) {
        const tr = doc.createElement('tr');
        tr.setAttribute('role', 'row');
        options.columns.forEach((column, index) => {
            const td = doc.createElement('td');
            td.setAttribute('role', 'cell');
            td.setAttribute('headers', row.cells[index].id);
            if (column.numeric)
                td.className = 'ui-numeric';
            const label = el('span', 'ui-table-label', doc);
            label.textContent = column.label;
            label.setAttribute('aria-hidden', 'true');
            const value = el('span', '', doc);
            append(value, column.cell(item));
            td.append(label, value);
            tr.append(td);
        });
        body.append(tr);
    }
    table.append(caption, head, body);
    wrap.append(table);
    return wrap;
}
// Descriptive aliases for callers that prefer the existing create* convention.
export { Button as createButton, Input as createInput, Select as createSelect, Textarea as createTextarea, Card as createCard, ExamCard as createExamCard, StatusBadge as createExamStatusBadge, TopBar as createTopBar, NavRail as createNavRail, BottomNav as createBottomNav, Dialog as createDialog, BottomSheet as createBottomSheet, Toast as createToast, EmptyState as createEmptyState, ErrorState as createErrorState, OfflineBanner as createOfflineBanner, Skeleton as createSkeleton, Table as createTable };
