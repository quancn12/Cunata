/// <reference lib="dom" />
/**
 * Cunata Web — Teacher Portal (src/teacher/portal.ts)
 * Conforms to WEB-contract.md §17, §18.1, §19.1, §19.3 and DESIGN.md.
 *
 * Implements:
 * - #teacherLogin:
 *     - input#teacherUsername
 *     - input#teacherPassword[type=password]
 *     - button#btnTeacherLogin
 *     - div#teacherLoginError
 *     - Unconfigured notice when !client.configured ("chưa cấu hình")
 * - #teacherShell:
 *     - #teacherNav (a[data-nav="lop"], a[data-nav="de"], a[data-nav="ket-qua"], aria-current="page")
 *     - button#btnTeacherLogout
 *     - Section Lớp học (#btnCreateClass, .class-card[data-class-id] .class-code, copy code/link,
 *       class details, .assignment-row[data-assignment-id], #btnAssignExam, #assignDialog with
 *       exam select + #assignOpenAt + #assignDueAt + #btnAssignConfirm)
 *     - Section Đề thi (.exam-card[data-exam-id], .btn-teacher-edit, .btn-teacher-assign,
 *       .btn-teacher-unpublish, #btnTeacherNewExam)
 *     - Section Kết quả (#resultsTable, #btnExportResults with CSV formula injection protection)
 * - Strict adherence to DESIGN.md tokens (no raw hex or rgb colors), 44px touch targets,
 *   focus rings, no emoji (SVG icons only), and single system font inheritance.
 */
import { Icon } from "../ui/icons.js";
import { parseFractionString, toDecimalString } from "../domain/index.js";
export const TEACHER_SESSION_PW_KEY = 'cunata_teacher_pw';
export const TEACHER_TOKEN_KEY = 'cunata_teacher_token';
export const TEACHER_NAME_KEY = 'cunata_teacher_name';
export const TEACHER_ROLE_KEY = 'cunata:role';
export function getStoredTeacherPassword() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            return sessionStorage.getItem(TEACHER_SESSION_PW_KEY);
        }
    }
    catch { }
    return null;
}
export function setStoredTeacherPassword(pw) {
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(TEACHER_SESSION_PW_KEY, pw);
        }
    }
    catch { }
}
export function clearStoredTeacherPassword() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem(TEACHER_SESSION_PW_KEY);
        }
    }
    catch { }
}
export function getStoredTeacherToken() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            return sessionStorage.getItem(TEACHER_TOKEN_KEY) || sessionStorage.getItem(TEACHER_SESSION_PW_KEY);
        }
    }
    catch { }
    return null;
}
export function setStoredTeacherToken(token) {
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(TEACHER_TOKEN_KEY, token);
        }
    }
    catch { }
}
export function clearStoredTeacherToken() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem(TEACHER_TOKEN_KEY);
            sessionStorage.removeItem(TEACHER_NAME_KEY);
            sessionStorage.removeItem(TEACHER_SESSION_PW_KEY);
        }
    }
    catch { }
}
function clearChildren(el) {
    el.textContent = '';
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
    if (Array.isArray(el.childNodes)) {
        el.childNodes = [];
    }
}
function formatViDateTime(isoStr) {
    if (!isoStr)
        return '';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime()))
            return String(isoStr);
        const p = (n) => String(n).padStart(2, '0');
        return `${p(d.getHours())}:${p(d.getMinutes())}, ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
    }
    catch {
        return String(isoStr);
    }
}
function formatScoreD02(scoreVal) {
    if (scoreVal === null || scoreVal === undefined || scoreVal === '')
        return '0';
    const str = String(scoreVal).trim();
    try {
        const r = parseFractionString(str);
        if (r.den === BigInt(1)) {
            return r.num.toString();
        }
        return toDecimalString(r, 2, 'half-up').replace('.', ',');
    }
    catch {
        const num = Number(str.replace(',', '.'));
        if (!isNaN(num)) {
            if (Number.isInteger(num))
                return num.toString();
            return num.toFixed(2).replace('.', ',');
        }
        return str;
    }
}
function escapeCsvCell(val) {
    if (val === null || val === undefined)
        return '""';
    let s = String(val);
    // Anti formula injection: prefix with single quote if starts with = + - @ or fullwidth equivalents
    if (/^[\s\u0000-\u001f]*[=+\-@\uff1d\uff0b\uff0d\uff20]/.test(s)) {
        s = "'" + s;
    }
    return `"${s.replace(/"/g, '""')}"`;
}
function toVietnameseErrorMessage(code, serverMsg, isLoginAttempt = false) {
    if (code === 'UNAUTHORIZED') {
        if (serverMsg && /hết hạn|phiên|token/i.test(serverMsg)) {
            return serverMsg.trim();
        }
        return isLoginAttempt ? 'Sai tên đăng nhập hoặc mật khẩu' : 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại';
    }
    if (code === 'FORBIDDEN')
        return 'Bạn không có quyền thực hiện thao tác này';
    if (code === 'NOT_CONFIGURED')
        return 'Chức năng kết nối máy chủ chưa cấu hình';
    if (code === 'TIMEOUT')
        return 'Hết thời gian chờ kết nối máy chủ (15s)';
    if (code === 'NETWORK')
        return 'Lỗi kết nối mạng, vui lòng kiểm tra đường truyền';
    if (code === 'USERNAME_TAKEN')
        return 'Tên đăng nhập đã được dùng';
    if (code === 'INVALID_EXAM')
        return serverMsg ? `Cấu trúc đề không hợp lệ: ${serverMsg}` : 'Cấu trúc đề không hợp lệ';
    if (code === 'INVALID_DATES')
        return 'Hạn nộp phải sau giờ mở';
    if (serverMsg && serverMsg.trim() && !/^[A-Z0-9_]+$/.test(serverMsg.trim())) {
        return serverMsg.trim();
    }
    return 'Yêu cầu không thành công, vui lòng thử lại';
}
function setupModalA11y(dialogBackdrop, dialogBox, firstFocusEl, restoreFocusEl, onClose) {
    if (firstFocusEl && typeof firstFocusEl.focus === 'function') {
        setTimeout(() => firstFocusEl.focus(), 0);
    }
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            if (typeof e.preventDefault === 'function')
                e.preventDefault();
            if (typeof e.stopPropagation === 'function')
                e.stopPropagation();
            onClose();
            if (restoreFocusEl && typeof restoreFocusEl.focus === 'function') {
                restoreFocusEl.focus();
            }
            return;
        }
        if (e.key === 'Tab') {
            const focusable = Array.from(dialogBox.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((el) => {
                if (el.getAttribute('aria-hidden') === 'true')
                    return false;
                return true;
            });
            if (focusable.length === 0) {
                if (typeof e.preventDefault === 'function')
                    e.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!first || !last)
                return;
            if (e.shiftKey) {
                if (dialogBackdrop.ownerDocument.activeElement === first || !dialogBox.contains(dialogBackdrop.ownerDocument.activeElement)) {
                    if (typeof e.preventDefault === 'function')
                        e.preventDefault();
                    last.focus();
                }
            }
            else {
                if (dialogBackdrop.ownerDocument.activeElement === last || !dialogBox.contains(dialogBackdrop.ownerDocument.activeElement)) {
                    if (typeof e.preventDefault === 'function')
                        e.preventDefault();
                    first.focus();
                }
            }
        }
    };
    const ownerDoc = dialogBackdrop.ownerDocument;
    if (ownerDoc && typeof ownerDoc.addEventListener === 'function') {
        ownerDoc.addEventListener('keydown', handleKeyDown, true);
    }
    return () => {
        if (ownerDoc && typeof ownerDoc.removeEventListener === 'function') {
            ownerDoc.removeEventListener('keydown', handleKeyDown, true);
        }
        if (restoreFocusEl && typeof restoreFocusEl.focus === 'function') {
            restoreFocusEl.focus();
        }
    };
}
function parseNavFromHash() {
    try {
        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        if (hash.includes('/de'))
            return 'de';
        if (hash.includes('/ket-qua'))
            return 'ket-qua';
        if (hash.includes('/lop'))
            return 'lop';
    }
    catch { }
    return 'lop';
}
/**
 * Mount Teacher Portal into root element.
 */
export function mountTeacherPortal(root, deps) {
    const doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc) {
        throw new Error('DOM Document is required to mount teacher portal');
    }
    // --- Style Injection (strictly uses design tokens) ---
    const STYLE_ID = 'cunata-teacher-portal-styles';
    if (!doc.getElementById(STYLE_ID) && doc.head) {
        const styleEl = doc.createElement('style');
        styleEl.id = STYLE_ID;
        styleEl.textContent = `
      .teacher-area-container {
        font-family: var(--font, system-ui, sans-serif);
        color: var(--c-text);
        max-width: var(--content-width, 1120px);
        margin: 0 auto;
        padding: var(--sp-4, 16px);
        box-sizing: border-box;
      }
      .teacher-login-box {
        max-width: 440px;
        margin: var(--sp-6, 32px) auto;
        padding: var(--sp-5, 24px);
        background: var(--c-surface);
        border: 1px solid var(--c-border);
        border-radius: var(--r-md, 12px);
        box-shadow: var(--shadow-1);
      }
      .teacher-login-title {
        font-size: var(--fs-xl, 24px);
        font-weight: 700;
        margin: 0 0 var(--sp-2, 8px) 0;
        color: var(--c-text);
      }
      .teacher-login-desc {
        font-size: var(--fs-sm, 14px);
        color: var(--c-text-2);
        margin: 0 0 var(--sp-4, 16px) 0;
      }
      .teacher-unconfigured-notice {
        padding: var(--sp-3, 12px);
        background: var(--c-surface-2);
        border: 1px solid var(--c-warning);
        border-radius: var(--r-sm, 8px);
        color: var(--c-warning);
        font-size: var(--fs-sm, 14px);
        margin-bottom: var(--sp-4, 16px);
      }
      .teacher-field-group {
        margin-bottom: var(--sp-4, 16px);
      }
      .teacher-field-label {
        display: block;
        font-size: var(--fs-sm, 14px);
        font-weight: 600;
        margin-bottom: var(--sp-1, 4px);
        color: var(--c-text);
      }
      .teacher-control {
        width: 100%;
        min-height: var(--target, 44px);
        padding: 0 var(--sp-3, 12px);
        font-size: var(--fs-md, 16px);
        font-family: inherit;
        color: var(--c-text);
        background: var(--c-surface);
        border: 1px solid var(--c-border);
        border-radius: var(--r-sm, 8px);
        box-sizing: border-box;
      }
      .teacher-control:focus-visible {
        outline: 2px solid var(--c-primary);
        outline-offset: 2px;
      }
      .teacher-error-text {
        font-size: var(--fs-sm, 14px);
        color: var(--c-danger);
        min-height: var(--fs-sm, 14px);
        margin-top: var(--sp-2, 8px);
        margin-bottom: var(--sp-3, 12px);
      }
      .teacher-shell-layout {
        display: flex;
        flex-direction: column;
        gap: var(--sp-4, 16px);
      }
      @media (min-width: 1024px) {
        .teacher-shell-layout {
          flex-direction: row;
          align-items: flex-start;
        }
      }
      .teacher-nav-rail {
        width: 100%;
        background: var(--c-surface);
        border: 1px solid var(--c-border);
        border-radius: var(--r-md, 12px);
        padding: var(--sp-2, 8px);
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: var(--sp-2, 8px);
        box-sizing: border-box;
      }
      @media (min-width: 1024px) {
        .teacher-nav-rail {
          width: var(--rail-width, 240px);
          flex-shrink: 0;
          flex-direction: column;
        }
      }
      .teacher-nav-link {
        display: inline-flex;
        align-items: center;
        gap: var(--sp-2, 8px);
        min-height: var(--target, 44px);
        padding: 0 var(--sp-3, 12px);
        font-size: var(--fs-md, 16px);
        font-weight: 500;
        color: var(--c-text);
        text-decoration: none;
        border-radius: var(--r-sm, 8px);
        cursor: pointer;
        transition: background 0.15s ease;
        box-sizing: border-box;
      }
      .teacher-nav-link:hover {
        background: var(--c-surface-2);
      }
      .teacher-nav-link[aria-current="page"] {
        background: var(--c-primary-soft);
        color: var(--c-primary);
        font-weight: 600;
      }
      .teacher-nav-link:focus-visible {
        outline: 2px solid var(--c-primary);
        outline-offset: 2px;
      }
      .teacher-logout-btn {
        margin-top: auto;
        color: var(--c-danger);
      }
      .teacher-main-pane {
        flex: 1;
        min-width: 0;
      }
      .teacher-section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--sp-3, 12px);
        margin-bottom: var(--sp-4, 16px);
      }
      .teacher-section-title {
        font-size: var(--fs-xl, 24px);
        font-weight: 700;
        margin: 0;
        color: var(--c-text);
      }
      .teacher-grid-list {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--sp-4, 16px);
      }
      @media (min-width: 640px) {
        .teacher-grid-list {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (min-width: 1024px) {
        .teacher-grid-list {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      .class-card {
        background: var(--c-surface);
        border: 1px solid var(--c-border);
        border-radius: var(--r-md, 12px);
        padding: var(--sp-4, 16px);
        box-shadow: var(--shadow-1);
        display: flex;
        flex-direction: column;
        gap: var(--sp-2, 8px);
        cursor: pointer;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .class-card:hover {
        border-color: var(--c-primary);
        box-shadow: var(--shadow-2);
      }
      .class-card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      .class-name {
        font-size: var(--fs-lg, 20px);
        font-weight: 600;
        margin: 0;
        color: var(--c-text);
      }
      .class-code-badge {
        font-size: var(--fs-md, 16px);
        font-weight: 700;
        letter-spacing: 1px;
        background: var(--c-surface-2);
        padding: var(--sp-1, 4px) var(--sp-2, 8px);
        border-radius: var(--r-sm, 8px);
        border: 1px solid var(--c-border);
        color: var(--c-primary);
      }
      .class-actions-bar {
        display: flex;
        gap: var(--sp-2, 8px);
        flex-wrap: wrap;
        margin-top: var(--sp-2, 8px);
      }
      .class-btn-action {
        min-height: var(--target, 44px);
        min-width: var(--target, 44px);
        padding: 0 var(--sp-3, 12px);
        font-size: var(--fs-sm, 14px);
        font-weight: 500;
        font-family: inherit;
        border-radius: var(--r-sm, 8px);
        border: 1px solid var(--c-border);
        background: var(--c-surface);
        color: var(--c-text);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--sp-1, 4px);
      }
      .class-btn-action:hover {
        background: var(--c-surface-2);
      }
      .class-btn-action:focus-visible {
        outline: 2px solid var(--c-primary);
        outline-offset: 2px;
      }
      .assignment-row {
        background: var(--c-surface);
        border: 1px solid var(--c-border);
        border-radius: var(--r-sm, 8px);
        padding: var(--sp-3, 12px) var(--sp-4, 16px);
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--sp-2, 8px);
        margin-bottom: var(--sp-2, 8px);
      }
      .assignment-title {
        font-weight: 600;
        font-size: var(--fs-md, 16px);
      }
      .assignment-meta-info {
        font-size: var(--fs-sm, 14px);
        color: var(--c-text-2);
        display: flex;
        gap: var(--sp-3, 12px);
        flex-wrap: wrap;
      }
      .teacher-dialog-backdrop {
        position: fixed;
        inset: 0;
        background: var(--c-backdrop);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: var(--sp-4, 16px);
        box-sizing: border-box;
      }
      .teacher-dialog-box {
        background: var(--c-surface);
        border: 1px solid var(--c-border);
        border-radius: var(--r-lg, 16px);
        box-shadow: var(--shadow-2);
        max-width: 540px;
        width: 100%;
        padding: var(--sp-5, 24px);
        box-sizing: border-box;
      }
      .teacher-table-wrap {
        width: 100%;
        overflow-x: auto;
        background: var(--c-surface);
        border: 1px solid var(--c-border);
        border-radius: var(--r-md, 12px);
        box-shadow: var(--shadow-1);
      }
      .teacher-table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--fs-sm, 14px);
        text-align: left;
      }
      .teacher-table th {
        background: var(--c-surface-2);
        padding: var(--sp-3, 12px) var(--sp-4, 16px);
        font-weight: 600;
        color: var(--c-text);
        border-bottom: 1px solid var(--c-border);
      }
      .teacher-table td {
        padding: var(--sp-3, 12px) var(--sp-4, 16px);
        border-bottom: 1px solid var(--c-border);
        color: var(--c-text);
      }
      .teacher-table tr:hover td {
        background: var(--c-surface-2);
      }
      .btn-teacher-primary {
        min-height: var(--target, 44px);
        min-width: var(--target, 44px);
        padding: 0 var(--sp-4, 16px);
        font-size: var(--fs-md, 16px);
        font-weight: 600;
        font-family: inherit;
        background: var(--c-primary);
        color: var(--c-primary-ink);
        border: none;
        border-radius: var(--r-sm, 8px);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--sp-2, 8px);
      }
      .btn-teacher-primary:hover:not(:disabled) {
        filter: brightness(1.1);
      }
      .btn-teacher-primary:focus-visible {
        outline: 2px solid var(--c-primary);
        outline-offset: 2px;
      }
      .btn-teacher-secondary {
        min-height: var(--target, 44px);
        min-width: var(--target, 44px);
        padding: 0 var(--sp-4, 16px);
        font-size: var(--fs-md, 16px);
        font-weight: 500;
        font-family: inherit;
        background: var(--c-surface);
        color: var(--c-text);
        border: 1px solid var(--c-border);
        border-radius: var(--r-sm, 8px);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--sp-2, 8px);
      }
      .btn-teacher-secondary:hover:not(:disabled) {
        background: var(--c-surface-2);
      }
      .btn-teacher-secondary:focus-visible {
        outline: 2px solid var(--c-primary);
        outline-offset: 2px;
      }
    `;
        doc.head.appendChild(styleEl);
    }
    // --- Ensure Container Elements in Root ---
    let loginSection = root.querySelector('#teacherLogin');
    if (!loginSection) {
        loginSection = doc.createElement('div');
        loginSection.id = 'teacherLogin';
        loginSection.className = 'teacher-area-container';
        loginSection.style.display = 'none';
        root.appendChild(loginSection);
    }
    let shell = root.querySelector('#teacherShell');
    if (!shell) {
        shell = doc.createElement('div');
        shell.id = 'teacherShell';
        shell.className = 'teacher-area-container';
        shell.style.display = 'none';
        root.appendChild(shell);
    }
    // Active state
    let currentNav = 'lop';
    let cachedMyClasses = [];
    let selectedClassIdForDetail = null;
    let cachedAssignments = [];
    // --------------------------------------------------------------------------
    // 1. Render #teacherLogin
    // --------------------------------------------------------------------------
    function renderLoginView() {
        if (!loginSection)
            return;
        clearChildren(loginSection);
        const box = doc.createElement('div');
        box.className = 'teacher-login-box';
        const h2 = doc.createElement('h2');
        h2.className = 'teacher-login-title';
        h2.textContent = 'Giáo viên đăng nhập';
        box.appendChild(h2);
        const desc = doc.createElement('p');
        desc.className = 'teacher-login-desc';
        desc.textContent = 'Quản lý lớp học, kho đề thi và xem kết quả của học sinh.';
        box.appendChild(desc);
        if (!deps.client.configured) {
            const unconf = doc.createElement('div');
            unconf.className = 'teacher-unconfigured-notice';
            unconf.textContent = 'Máy chủ chưa cấu hình kết nối Google Apps Script. Vui lòng liên hệ quản trị viên.';
            box.appendChild(unconf);
        }
        const form = doc.createElement('form');
        form.id = 'teacherLoginForm';
        form.setAttribute('novalidate', 'true');
        // Username field
        const userGroup = doc.createElement('div');
        userGroup.className = 'teacher-field-group';
        const userLabel = doc.createElement('label');
        userLabel.className = 'teacher-field-label';
        userLabel.setAttribute('for', 'teacherUsername');
        userLabel.textContent = 'Tên đăng nhập';
        const userInput = doc.createElement('input');
        userInput.id = 'teacherUsername';
        userInput.name = 'teacherUsername';
        userInput.type = 'text';
        userInput.className = 'teacher-control';
        userInput.setAttribute('autocomplete', 'username');
        userInput.required = true;
        userGroup.appendChild(userLabel);
        userGroup.appendChild(userInput);
        form.appendChild(userGroup);
        // Password field
        const pwGroup = doc.createElement('div');
        pwGroup.className = 'teacher-field-group';
        const pwLabel = doc.createElement('label');
        pwLabel.className = 'teacher-field-label';
        pwLabel.setAttribute('for', 'teacherPassword');
        pwLabel.textContent = 'Mật khẩu';
        const pwInput = doc.createElement('input');
        pwInput.id = 'teacherPassword';
        pwInput.name = 'teacherPassword';
        pwInput.type = 'password';
        pwInput.className = 'teacher-control';
        pwInput.setAttribute('autocomplete', 'current-password');
        pwInput.required = true;
        pwGroup.appendChild(pwLabel);
        pwGroup.appendChild(pwInput);
        form.appendChild(pwGroup);
        // Error div
        const errDiv = doc.createElement('div');
        errDiv.id = 'teacherLoginError';
        errDiv.className = 'teacher-error-text';
        errDiv.setAttribute('aria-live', 'polite');
        form.appendChild(errDiv);
        // Submit button
        const submitBtn = doc.createElement('button');
        submitBtn.id = 'btnTeacherLogin';
        submitBtn.type = 'submit';
        submitBtn.className = 'btn-teacher-primary';
        submitBtn.style.width = '100%';
        submitBtn.textContent = 'Đăng nhập';
        form.appendChild(submitBtn);
        form.addEventListener('submit', async (e) => {
            if (e && typeof e.preventDefault === 'function')
                e.preventDefault();
            errDiv.textContent = '';
            const u = userInput.value.trim();
            const p = pwInput.value;
            if (!u && !p) {
                errDiv.textContent = 'Vui lòng nhập tên đăng nhập và mật khẩu';
                if (typeof userInput.focus === 'function')
                    userInput.focus();
                return;
            }
            if (!u) {
                errDiv.textContent = 'Vui lòng nhập tên đăng nhập';
                if (typeof userInput.focus === 'function')
                    userInput.focus();
                return;
            }
            if (!p) {
                errDiv.textContent = 'Vui lòng nhập mật khẩu';
                if (typeof pwInput.focus === 'function')
                    pwInput.focus();
                return;
            }
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang đăng nhập...';
            try {
                const res = await deps.client.teacherLogin(u, p);
                if (res.ok) {
                    const tok = (typeof res.value === 'object' && res.value && res.value.token)
                        ? res.value.token
                        : p;
                    const name = (typeof res.value === 'object' && res.value && res.value.name)
                        ? res.value.name
                        : u;
                    setStoredTeacherToken(tok);
                    setStoredTeacherPassword(p);
                    try {
                        sessionStorage.setItem(TEACHER_NAME_KEY, name);
                        localStorage.setItem(TEACHER_ROLE_KEY, 'teacher');
                    }
                    catch { }
                    errDiv.textContent = '';
                    showShell('lop');
                }
                else {
                    errDiv.textContent = toVietnameseErrorMessage(res.code, res.message);
                }
            }
            catch (err) {
                errDiv.textContent = toVietnameseErrorMessage('NETWORK', err?.message);
            }
            finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Đăng nhập';
            }
        });
        box.appendChild(form);
        loginSection.appendChild(box);
    }
    // --------------------------------------------------------------------------
    // 2. Render #teacherShell and Sections
    // --------------------------------------------------------------------------
    function renderShellView() {
        if (!shell)
            return;
        clearChildren(shell);
        const layout = doc.createElement('div');
        layout.className = 'teacher-shell-layout';
        // NavRail
        const nav = doc.createElement('nav');
        nav.id = 'teacherNav';
        nav.className = 'teacher-nav-rail';
        nav.setAttribute('aria-label', 'Điều hướng giáo viên');
        const links = [
            { key: 'lop', label: 'Lớp học', href: '#/giao-vien/lop', icon: 'classes' },
            { key: 'de', label: 'Đề thi', href: '#/giao-vien/de', icon: 'book' },
            { key: 'ket-qua', label: 'Kết quả', href: '#/giao-vien/ket-qua', icon: 'results' },
        ];
        for (const item of links) {
            const a = doc.createElement('a');
            a.href = item.href;
            a.className = 'teacher-nav-link';
            a.setAttribute('data-nav', item.key);
            if (a.dataset)
                a.dataset.nav = item.key;
            if (item.key === currentNav) {
                a.setAttribute('aria-current', 'page');
            }
            a.appendChild(Icon(item.icon, doc));
            const span = doc.createElement('span');
            span.textContent = item.label;
            a.appendChild(span);
            a.addEventListener('click', (e) => {
                if (e && typeof e.preventDefault === 'function')
                    e.preventDefault();
                setNav(item.key);
            });
            nav.appendChild(a);
        }
        // Logout button
        const logoutBtn = doc.createElement('button');
        logoutBtn.id = 'btnTeacherLogout';
        logoutBtn.type = 'button';
        logoutBtn.className = 'teacher-nav-link teacher-logout-btn';
        logoutBtn.style.border = 'none';
        logoutBtn.style.background = 'none';
        logoutBtn.appendChild(Icon('logout', doc));
        const logoutSpan = doc.createElement('span');
        logoutSpan.textContent = 'Đăng xuất';
        logoutBtn.appendChild(logoutSpan);
        logoutBtn.addEventListener('click', () => {
            clearStoredTeacherToken();
            clearStoredTeacherPassword();
            try {
                localStorage.removeItem(TEACHER_ROLE_KEY);
            }
            catch { }
            showLogin();
        });
        nav.appendChild(logoutBtn);
        layout.appendChild(nav);
        // Main Content
        const main = doc.createElement('main');
        main.id = 'teacherMainContent';
        main.className = 'teacher-main-pane';
        layout.appendChild(main);
        shell.appendChild(layout);
        renderActiveSection();
    }
    function setNav(navKey) {
        currentNav = navKey;
        const allLinks = shell?.querySelectorAll('#teacherNav a[data-nav]');
        allLinks?.forEach((a) => {
            const key = a.getAttribute('data-nav') || a.dataset?.nav;
            if (key === navKey) {
                a.setAttribute('aria-current', 'page');
            }
            else {
                a.removeAttribute('aria-current');
            }
        });
        try {
            const targetHash = `#/giao-vien/${navKey}`;
            if (window.location.hash !== targetHash) {
                window.history.pushState(null, '', targetHash);
            }
        }
        catch { }
        renderActiveSection();
    }
    function renderActiveSection() {
        const main = shell?.querySelector('#teacherMainContent');
        if (!main)
            return;
        clearChildren(main);
        if (currentNav === 'lop') {
            renderClassesSection(main);
        }
        else if (currentNav === 'de') {
            renderExamsSection(main);
        }
        else if (currentNav === 'ket-qua') {
            renderResultsSection(main);
        }
    }
    // --------------------------------------------------------------------------
    // 3. Section: Lớp học
    // --------------------------------------------------------------------------
    async function renderClassesSection(container) {
        clearChildren(container);
        // If viewing class detail
        if (selectedClassIdForDetail) {
            renderClassDetailView(container, selectedClassIdForDetail);
            return;
        }
        const header = doc.createElement('div');
        header.className = 'teacher-section-header';
        const title = doc.createElement('h2');
        title.className = 'teacher-section-title';
        title.textContent = 'Lớp học của tôi';
        header.appendChild(title);
        const createBtn = doc.createElement('button');
        createBtn.id = 'btnCreateClass';
        createBtn.type = 'button';
        createBtn.className = 'btn-teacher-primary';
        createBtn.appendChild(Icon('plus', doc));
        const btnSpan = doc.createElement('span');
        btnSpan.textContent = 'Tạo lớp học';
        createBtn.appendChild(btnSpan);
        createBtn.addEventListener('click', () => {
            openCreateClassDialog(() => {
                void loadClasses();
            });
        });
        header.appendChild(createBtn);
        container.appendChild(header);
        const listContainer = doc.createElement('div');
        listContainer.className = 'teacher-grid-list';
        listContainer.id = 'teacherClassGrid';
        container.appendChild(listContainer);
        async function loadClasses() {
            clearChildren(listContainer);
            const tok = getStoredTeacherToken() || '';
            if (!deps.client.listMyClasses) {
                const p = doc.createElement('p');
                p.className = 'teacher-empty-text';
                p.textContent = 'Chưa hỗ trợ danh sách lớp.';
                listContainer.appendChild(p);
                return;
            }
            try {
                const res = await deps.client.listMyClasses(tok);
                if (res.ok) {
                    cachedMyClasses = res.value;
                    if (cachedMyClasses.length === 0) {
                        const p = doc.createElement('p');
                        p.className = 'teacher-empty-text';
                        p.textContent = 'Chưa có lớp nào. Hãy bấm "Tạo lớp học" để bắt đầu.';
                        listContainer.appendChild(p);
                        return;
                    }
                    clearChildren(listContainer);
                    for (const cls of cachedMyClasses) {
                        const card = doc.createElement('div');
                        card.className = 'class-card';
                        card.setAttribute('data-class-id', cls.classId);
                        if (card.dataset)
                            card.dataset.classId = cls.classId;
                        card.setAttribute('tabindex', '0');
                        card.setAttribute('role', 'button');
                        card.setAttribute('aria-label', `Xem chi tiết lớp ${cls.name}`);
                        const cardHeader = doc.createElement('div');
                        cardHeader.className = 'class-card-header';
                        const nameEl = doc.createElement('h3');
                        nameEl.className = 'class-name';
                        nameEl.textContent = cls.name;
                        const codeBadge = doc.createElement('div');
                        codeBadge.className = 'class-code-badge';
                        const codeSpan = doc.createElement('span');
                        codeSpan.className = 'class-code';
                        codeSpan.textContent = cls.code;
                        codeBadge.appendChild(codeSpan);
                        cardHeader.appendChild(nameEl);
                        cardHeader.appendChild(codeBadge);
                        card.appendChild(cardHeader);
                        const countEl = doc.createElement('div');
                        countEl.style.fontSize = 'var(--fs-sm, 14px)';
                        countEl.style.color = 'var(--c-text-2)';
                        countEl.textContent = `Sĩ số: ${cls.studentCount || 0} học sinh`;
                        card.appendChild(countEl);
                        const actions = doc.createElement('div');
                        actions.className = 'class-actions-bar';
                        const copyCodeBtn = doc.createElement('button');
                        copyCodeBtn.type = 'button';
                        copyCodeBtn.className = 'class-btn-action';
                        copyCodeBtn.setAttribute('aria-label', `Sao chép mã lớp ${cls.code}`);
                        copyCodeBtn.appendChild(Icon('copy', doc));
                        const copyCodeSpan = doc.createElement('span');
                        copyCodeSpan.textContent = 'Sao chép mã';
                        copyCodeBtn.appendChild(copyCodeSpan);
                        copyCodeBtn.addEventListener('click', (e) => {
                            if (e && typeof e.stopPropagation === 'function')
                                e.stopPropagation();
                            try {
                                navigator.clipboard?.writeText(cls.code);
                                copyCodeSpan.textContent = 'Đã chép!';
                                setTimeout(() => { copyCodeSpan.textContent = 'Sao chép mã'; }, 2000);
                            }
                            catch { }
                        });
                        actions.appendChild(copyCodeBtn);
                        const copyLinkBtn = doc.createElement('button');
                        copyLinkBtn.type = 'button';
                        copyLinkBtn.className = 'class-btn-action';
                        copyLinkBtn.setAttribute('aria-label', `Sao chép liên kết mời`);
                        copyLinkBtn.appendChild(Icon('arrow', doc));
                        const copyLinkSpan = doc.createElement('span');
                        copyLinkSpan.textContent = 'Link mời';
                        copyLinkBtn.appendChild(copyLinkSpan);
                        copyLinkBtn.addEventListener('click', (e) => {
                            if (e && typeof e.stopPropagation === 'function')
                                e.stopPropagation();
                            try {
                                const inviteUrl = `${window.location.origin}${window.location.pathname}#/hoc-sinh?lop=${cls.code}`;
                                navigator.clipboard?.writeText(inviteUrl);
                                copyLinkSpan.textContent = 'Đã chép link!';
                                setTimeout(() => { copyLinkSpan.textContent = 'Link mời'; }, 2000);
                            }
                            catch { }
                        });
                        actions.appendChild(copyLinkBtn);
                        card.appendChild(actions);
                        card.addEventListener('click', () => {
                            selectedClassIdForDetail = cls.classId;
                            renderActiveSection();
                        });
                        card.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                if (e.target === card) {
                                    if (typeof e.preventDefault === 'function')
                                        e.preventDefault();
                                    selectedClassIdForDetail = cls.classId;
                                    renderActiveSection();
                                }
                            }
                        });
                        listContainer.appendChild(card);
                    }
                }
                else {
                    const errP = doc.createElement('p');
                    errP.className = 'teacher-error-text';
                    errP.textContent = toVietnameseErrorMessage(res.code, res.message, false);
                    listContainer.appendChild(errP);
                }
            }
            catch (err) {
                const errP = doc.createElement('p');
                errP.className = 'teacher-error-text';
                errP.textContent = `Không thể tải danh sách lớp học: ${err?.message || ''}`;
                listContainer.appendChild(errP);
            }
        }
        void loadClasses();
    }
    function openCreateClassDialog(onCreated) {
        const backdrop = doc.createElement('div');
        backdrop.className = 'teacher-dialog-backdrop';
        const box = doc.createElement('div');
        box.className = 'teacher-dialog-box';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.setAttribute('aria-labelledby', 'createClassTitle');
        const h3 = doc.createElement('h3');
        h3.id = 'createClassTitle';
        h3.style.margin = '0 0 var(--sp-3, 12px) 0';
        h3.textContent = 'Tạo lớp học mới';
        box.appendChild(h3);
        const form = doc.createElement('form');
        const field = doc.createElement('div');
        field.className = 'teacher-field-group';
        const label = doc.createElement('label');
        label.className = 'teacher-field-label';
        label.setAttribute('for', 'createClassNameInput');
        label.textContent = 'Tên lớp';
        const input = doc.createElement('input');
        input.id = 'createClassNameInput';
        input.type = 'text';
        input.className = 'teacher-control';
        input.placeholder = 'Ví dụ: 12A1 Toán';
        input.required = true;
        field.appendChild(label);
        field.appendChild(input);
        form.appendChild(field);
        const err = doc.createElement('div');
        err.className = 'teacher-error-text';
        form.appendChild(err);
        const btnRow = doc.createElement('div');
        btnRow.style.display = 'flex';
        btnRow.style.justifyContent = 'flex-end';
        btnRow.style.gap = 'var(--sp-2, 8px)';
        const triggerBtn = doc.getElementById('btnCreateClass');
        let cleanupA11y = null;
        const closeDialog = () => {
            if (cleanupA11y)
                cleanupA11y();
            backdrop.remove();
        };
        const cancelBtn = doc.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn-teacher-secondary';
        cancelBtn.textContent = 'Hủy';
        cancelBtn.addEventListener('click', closeDialog);
        const submitBtn = doc.createElement('button');
        submitBtn.type = 'submit';
        submitBtn.className = 'btn-teacher-primary';
        submitBtn.textContent = 'Tạo lớp';
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(submitBtn);
        form.appendChild(btnRow);
        form.addEventListener('submit', async (e) => {
            if (e && typeof e.preventDefault === 'function')
                e.preventDefault();
            const val = input.value.trim();
            if (!val) {
                err.textContent = 'Vui lòng nhập tên lớp';
                if (typeof input.focus === 'function')
                    input.focus();
                return;
            }
            submitBtn.disabled = true;
            try {
                const tok = getStoredTeacherToken() || '';
                if (deps.client.createClass) {
                    const res = await deps.client.createClass(tok, val);
                    if (res.ok) {
                        closeDialog();
                        onCreated();
                    }
                    else {
                        err.textContent = toVietnameseErrorMessage(res.code, res.message, false);
                    }
                }
            }
            catch (ex) {
                err.textContent = 'Lỗi tạo lớp: ' + (ex?.message || String(ex));
            }
            finally {
                submitBtn.disabled = false;
            }
        });
        box.appendChild(form);
        backdrop.appendChild(box);
        doc.body.appendChild(backdrop);
        cleanupA11y = setupModalA11y(backdrop, box, input, triggerBtn, () => backdrop.remove());
    }
    // --------------------------------------------------------------------------
    // 3.1 Class Detail View (Assignments and Assign Exam)
    // --------------------------------------------------------------------------
    async function renderClassDetailView(container, classId) {
        const cls = cachedMyClasses.find((c) => c.classId === classId);
        const topBar = doc.createElement('div');
        topBar.className = 'teacher-section-header';
        const left = doc.createElement('div');
        const backBtn = doc.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'btn-teacher-secondary';
        backBtn.style.marginBottom = 'var(--sp-2, 8px)';
        backBtn.textContent = '← Quay lại danh sách lớp';
        backBtn.addEventListener('click', () => {
            selectedClassIdForDetail = null;
            renderActiveSection();
        });
        left.appendChild(backBtn);
        const h2 = doc.createElement('h2');
        h2.className = 'teacher-section-title';
        h2.textContent = cls ? `Lớp ${cls.name} (Mã: ${cls.code})` : 'Chi tiết lớp học';
        left.appendChild(h2);
        topBar.appendChild(left);
        const assignBtn = doc.createElement('button');
        assignBtn.id = 'btnAssignExam';
        assignBtn.type = 'button';
        assignBtn.className = 'btn-teacher-primary';
        assignBtn.appendChild(Icon('plus', doc));
        const btnSpan = doc.createElement('span');
        btnSpan.textContent = 'Giao đề thi';
        assignBtn.appendChild(btnSpan);
        assignBtn.addEventListener('click', () => {
            openAssignDialog(classId, () => {
                void loadAssignments();
            });
        });
        topBar.appendChild(assignBtn);
        container.appendChild(topBar);
        const assignListContainer = doc.createElement('div');
        assignListContainer.id = 'assignedExamsList';
        container.appendChild(assignListContainer);
        async function loadAssignments() {
            clearChildren(assignListContainer);
            const tok = getStoredTeacherToken() || '';
            if (!deps.client.listAssignments) {
                const p = doc.createElement('p');
                p.className = 'teacher-empty-text';
                p.textContent = 'Chưa hỗ trợ danh sách bài giao.';
                assignListContainer.appendChild(p);
                return;
            }
            try {
                const res = await deps.client.listAssignments(tok, classId);
                if (res.ok) {
                    cachedAssignments = res.value;
                    if (cachedAssignments.length === 0) {
                        const p = doc.createElement('p');
                        p.className = 'teacher-empty-text';
                        p.textContent = 'Lớp chưa được giao đề thi nào. Bấm "Giao đề thi" để giao bài.';
                        assignListContainer.appendChild(p);
                        return;
                    }
                    const allExams = await deps.listAllExams();
                    clearChildren(assignListContainer);
                    for (const a of cachedAssignments) {
                        const row = doc.createElement('div');
                        row.className = 'assignment-row';
                        row.setAttribute('data-assignment-id', a.assignmentId);
                        if (row.dataset)
                            row.dataset.assignmentId = a.assignmentId;
                        const matchedExam = allExams.find((e) => e.id === a.examId);
                        const displayTitle = matchedExam?.title || a.title || 'Đề thi';
                        const info = doc.createElement('div');
                        const titleSpan = doc.createElement('div');
                        titleSpan.className = 'assignment-title';
                        titleSpan.textContent = displayTitle;
                        info.appendChild(titleSpan);
                        const meta = doc.createElement('div');
                        meta.className = 'assignment-meta-info';
                        meta.textContent = `Mở: ${formatViDateTime(a.openAt)} · ${a.dueAt ? `Hạn nộp: ${formatViDateTime(a.dueAt)}` : 'Không hạn nộp'} · ${a.submissionCount || 0} bài đã nộp`;
                        info.appendChild(meta);
                        row.appendChild(info);
                        assignListContainer.appendChild(row);
                    }
                }
                else {
                    const errP = doc.createElement('p');
                    errP.className = 'teacher-error-text';
                    errP.textContent = toVietnameseErrorMessage(res.code, res.message, false);
                    assignListContainer.appendChild(errP);
                }
            }
            catch (err) {
                const errP = doc.createElement('p');
                errP.className = 'teacher-error-text';
                errP.textContent = `Lỗi nạp bài giao: ${err?.message || ''}`;
                assignListContainer.appendChild(errP);
            }
        }
        void loadAssignments();
    }
    // --------------------------------------------------------------------------
    // 3.2 #assignDialog (Giao đề thi)
    // --------------------------------------------------------------------------
    async function openAssignDialog(targetClassId, onAssigned, preselectedExamId) {
        const existing = doc.getElementById('assignDialog');
        if (existing)
            existing.remove();
        const backdrop = doc.createElement('div');
        backdrop.id = 'assignDialog';
        backdrop.className = 'teacher-dialog-backdrop';
        backdrop.setAttribute('role', 'dialog');
        backdrop.setAttribute('aria-modal', 'true');
        backdrop.setAttribute('aria-labelledby', 'assignDialogTitle');
        backdrop.style.display = 'flex';
        const box = doc.createElement('div');
        box.className = 'teacher-dialog-box';
        const h3 = doc.createElement('h3');
        h3.id = 'assignDialogTitle';
        h3.style.margin = '0 0 var(--sp-3, 12px) 0';
        h3.textContent = 'Giao đề thi cho lớp';
        box.appendChild(h3);
        const form = doc.createElement('form');
        form.setAttribute('novalidate', 'true');
        // Class selection (if not pre-targeted)
        let classSelect = null;
        if (!targetClassId) {
            const clsGroup = doc.createElement('div');
            clsGroup.className = 'teacher-field-group';
            const clsLabel = doc.createElement('label');
            clsLabel.className = 'teacher-field-label';
            clsLabel.setAttribute('for', 'assignClassSelect');
            clsLabel.textContent = 'Chọn lớp học';
            classSelect = doc.createElement('select');
            classSelect.id = 'assignClassSelect';
            classSelect.className = 'teacher-control';
            for (const c of cachedMyClasses) {
                const opt = doc.createElement('option');
                opt.value = c.classId;
                opt.textContent = `${c.name} (${c.code})`;
                classSelect.appendChild(opt);
            }
            clsGroup.appendChild(clsLabel);
            clsGroup.appendChild(classSelect);
            form.appendChild(clsGroup);
        }
        // Exam selection
        const examGroup = doc.createElement('div');
        examGroup.className = 'teacher-field-group';
        const examLabel = doc.createElement('label');
        examLabel.className = 'teacher-field-label';
        examLabel.setAttribute('for', 'assignExamSelect');
        examLabel.textContent = 'Chọn đề thi (kho chung hoặc đề đã tạo)';
        const examSelect = doc.createElement('select');
        examSelect.id = 'assignExamSelect';
        examSelect.className = 'teacher-control';
        examSelect.setAttribute('aria-label', 'Chọn đề thi');
        examGroup.appendChild(examLabel);
        examGroup.appendChild(examSelect);
        form.appendChild(examGroup);
        // OpenAt field
        const openGroup = doc.createElement('div');
        openGroup.className = 'teacher-field-group';
        const openLabel = doc.createElement('label');
        openLabel.className = 'teacher-field-label';
        openLabel.setAttribute('for', 'assignOpenAt');
        openLabel.textContent = 'Thời gian mở đề';
        const openInput = doc.createElement('input');
        openInput.id = 'assignOpenAt';
        openInput.name = 'assignOpenAt';
        openInput.type = 'datetime-local';
        openInput.className = 'teacher-control';
        openInput.required = true;
        const now = new Date();
        openInput.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        openGroup.appendChild(openLabel);
        openGroup.appendChild(openInput);
        form.appendChild(openGroup);
        // DueAt field
        const dueGroup = doc.createElement('div');
        dueGroup.className = 'teacher-field-group';
        const dueLabel = doc.createElement('label');
        dueLabel.className = 'teacher-field-label';
        dueLabel.setAttribute('for', 'assignDueAt');
        dueLabel.textContent = 'Hạn nộp bài';
        const dueInput = doc.createElement('input');
        dueInput.id = 'assignDueAt';
        dueInput.name = 'assignDueAt';
        dueInput.type = 'datetime-local';
        dueInput.className = 'teacher-control';
        dueInput.required = true;
        dueGroup.appendChild(dueLabel);
        dueGroup.appendChild(dueInput);
        form.appendChild(dueGroup);
        const noDueLabel = doc.createElement('label');
        noDueLabel.className = 'teacher-field-label teacher-checkbox-label';
        noDueLabel.setAttribute('for', 'assignNoDue');
        const noDueInput = doc.createElement('input');
        noDueInput.id = 'assignNoDue';
        noDueInput.type = 'checkbox';
        noDueLabel.appendChild(noDueInput);
        noDueLabel.appendChild(doc.createTextNode('Không hạn nộp'));
        form.appendChild(noDueLabel);
        noDueInput.addEventListener('change', () => {
            dueInput.disabled = noDueInput.checked;
            dueInput.required = !noDueInput.checked;
        });
        // Error message
        const errDiv = doc.createElement('div');
        errDiv.className = 'teacher-error-text';
        form.appendChild(errDiv);
        // Buttons
        const btnRow = doc.createElement('div');
        btnRow.style.display = 'flex';
        btnRow.style.justifyContent = 'flex-end';
        btnRow.style.gap = 'var(--sp-2, 8px)';
        const triggerBtn = doc.getElementById('btnAssignExam');
        let cleanupA11y = null;
        const closeDialog = () => {
            if (cleanupA11y)
                cleanupA11y();
            backdrop.remove();
        };
        const cancelBtn = doc.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn-teacher-secondary';
        cancelBtn.textContent = 'Hủy';
        cancelBtn.addEventListener('click', closeDialog);
        const confirmBtn = doc.createElement('button');
        confirmBtn.id = 'btnAssignConfirm';
        confirmBtn.type = 'submit';
        confirmBtn.className = 'btn-teacher-primary';
        confirmBtn.textContent = 'Xác nhận giao';
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(confirmBtn);
        form.appendChild(btnRow);
        // Populate exams
        try {
            const allExams = await deps.listAllExams();
            clearChildren(examSelect);
            for (const e of allExams) {
                const opt = doc.createElement('option');
                opt.value = e.id;
                opt.textContent = e.title;
                if (preselectedExamId && e.id === preselectedExamId) {
                    opt.selected = true;
                    examSelect.value = e.id;
                }
                else if (!examSelect.value) {
                    examSelect.value = e.id;
                }
                examSelect.appendChild(opt);
            }
        }
        catch { }
        form.addEventListener('submit', async (e) => {
            if (e && typeof e.preventDefault === 'function')
                e.preventDefault();
            errDiv.textContent = '';
            const chosenClassId = targetClassId || classSelect?.value || '';
            const chosenExamId = examSelect.value;
            const openVal = openInput.value;
            const dueVal = noDueInput.checked ? '' : dueInput.value;
            if (!chosenClassId) {
                errDiv.textContent = 'Vui lòng chọn lớp học';
                return;
            }
            if (!chosenExamId) {
                errDiv.textContent = 'Vui lòng chọn đề thi';
                return;
            }
            if (!openVal) {
                errDiv.textContent = 'Vui lòng nhập thời gian mở đề';
                return;
            }
            if (!noDueInput.checked && !dueVal) {
                errDiv.textContent = 'Vui lòng nhập hạn nộp bài';
                return;
            }
            const openMs = new Date(openVal).getTime();
            const dueMs = new Date(dueVal).getTime();
            if (isNaN(openMs) || (!noDueInput.checked && (isNaN(dueMs) || dueMs <= openMs))) {
                errDiv.textContent = 'Hạn nộp bài phải sau thời gian mở đề';
                return;
            }
            confirmBtn.disabled = true;
            try {
                const tok = getStoredTeacherToken() || '';
                if (deps.client.assignExam) {
                    const res = noDueInput.checked ? await deps.client.assignExam({
                        token: tok,
                        classId: chosenClassId,
                        examId: chosenExamId,
                        openAt: new Date(openVal).toISOString(),
                        dueAt: '',
                    }) : await deps.client.assignExam(tok, chosenClassId, chosenExamId, new Date(openVal).toISOString(), new Date(dueVal).toISOString());
                    if (res.ok) {
                        closeDialog();
                        onAssigned();
                    }
                    else {
                        errDiv.textContent = toVietnameseErrorMessage(res.code, res.message, false);
                    }
                }
            }
            catch (ex) {
                errDiv.textContent = 'Lỗi giao đề: ' + (ex?.message || String(ex));
            }
            finally {
                confirmBtn.disabled = false;
            }
        });
        box.appendChild(form);
        backdrop.appendChild(box);
        doc.body.appendChild(backdrop);
        cleanupA11y = setupModalA11y(backdrop, box, examSelect, triggerBtn, () => backdrop.remove());
    }
    // --------------------------------------------------------------------------
    // 4. Section: Đề thi
    // --------------------------------------------------------------------------
    const myExamIds = new Set();
    const forbiddenExamIds = new Set();
    let activeEditingExam = null;
    if (typeof doc.addEventListener === 'function') {
        doc.addEventListener('click', (e) => {
            const btn = e.target?.closest ? e.target.closest('.btn-q-edit') : null;
            if (!btn)
                return;
            const idxStr = btn.getAttribute('data-idx');
            if (idxStr === null)
                return;
            const idx = parseInt(idxStr, 10);
            if (isNaN(idx))
                return;
            setTimeout(() => {
                const origQ = activeEditingExam?.questions?.[idx];
                if (origQ && origQ.kind === 'I' && origQ.correctOptionId) {
                    const radios = doc.querySelectorAll(`input[name="editCorrectOpt_${idx}"]`);
                    radios.forEach((r) => {
                        r.checked = (r.value === origQ.correctOptionId);
                    });
                }
            }, 0);
        }, true);
    }
    async function renderExamsSection(container) {
        clearChildren(container);
        const header = doc.createElement('div');
        header.className = 'teacher-section-header';
        const title = doc.createElement('h2');
        title.className = 'teacher-section-title';
        title.textContent = 'Kho đề thi & Quản lý đề';
        header.appendChild(title);
        const newBtn = doc.createElement('button');
        newBtn.id = 'btnTeacherNewExam';
        newBtn.type = 'button';
        newBtn.className = 'btn-teacher-primary';
        newBtn.appendChild(Icon('plus', doc));
        const btnSpan = doc.createElement('span');
        btnSpan.textContent = 'Soạn đề mới';
        newBtn.appendChild(btnSpan);
        newBtn.addEventListener('click', () => {
            deps.openBuilder(null, {
                onPublish: async (exam) => {
                    const tok = getStoredTeacherToken() || '';
                    const res = await deps.client.publishExam(tok, exam);
                    if (res.ok) {
                        if (exam?.examId)
                            myExamIds.add(exam.examId);
                        void loadExams();
                    }
                    return res;
                },
            });
        });
        header.appendChild(newBtn);
        container.appendChild(header);
        const grid = doc.createElement('div');
        grid.className = 'teacher-grid-list';
        grid.id = 'teacherExamGrid';
        container.appendChild(grid);
        async function loadExams() {
            clearChildren(grid);
            const loadingP = doc.createElement('p');
            loadingP.className = 'teacher-empty-text';
            loadingP.textContent = 'Đang tải danh sách đề thi...';
            grid.appendChild(loadingP);
            try {
                const allExams = await deps.listAllExams();
                clearChildren(grid);
                if (allExams.length === 0) {
                    const emptyP = doc.createElement('p');
                    emptyP.className = 'teacher-empty-text';
                    emptyP.textContent = 'Chưa có đề thi nào.';
                    grid.appendChild(emptyP);
                    return;
                }
                const tok = getStoredTeacherToken() || '';
                const visibleExams = [];
                for (const exam of allExams) {
                    if (exam.source === 'static') {
                        visibleExams.push(exam);
                        continue;
                    }
                    if (forbiddenExamIds.has(exam.id)) {
                        continue;
                    }
                    if (myExamIds.has(exam.id)) {
                        visibleExams.push(exam);
                        continue;
                    }
                    try {
                        const fullExam = (await exam.load());
                        if (tok && deps.client.publishExam) {
                            const checkRes = await deps.client.publishExam(tok, fullExam);
                            if (!checkRes.ok && checkRes.code === 'FORBIDDEN') {
                                forbiddenExamIds.add(exam.id);
                                continue;
                            }
                            myExamIds.add(exam.id);
                        }
                        visibleExams.push(exam);
                    }
                    catch {
                        visibleExams.push(exam);
                    }
                }
                if (visibleExams.length === 0) {
                    const emptyP = doc.createElement('p');
                    emptyP.className = 'teacher-empty-text';
                    emptyP.textContent = 'Chưa có đề thi nào.';
                    grid.appendChild(emptyP);
                    return;
                }
                for (const exam of visibleExams) {
                    const card = doc.createElement('div');
                    card.className = 'class-card';
                    card.setAttribute('data-exam-id', exam.id);
                    if (card.dataset)
                        card.dataset.examId = exam.id;
                    const h3 = doc.createElement('h3');
                    h3.className = 'class-name';
                    h3.textContent = exam.title;
                    card.appendChild(h3);
                    const desc = doc.createElement('div');
                    desc.style.fontSize = 'var(--fs-sm, 14px)';
                    desc.style.color = 'var(--c-text-2)';
                    desc.textContent = exam.description || `Môn ${exam.subject || 'GDPT'} · ${exam.questionCount || 0} câu · ${exam.durationMinutes || 50} phút`;
                    card.appendChild(desc);
                    const srcBadge = doc.createElement('div');
                    srcBadge.style.fontSize = 'var(--fs-xs, 12px)';
                    srcBadge.style.color = exam.source === 'teacher' ? 'var(--c-primary)' : 'var(--c-text-2)';
                    srcBadge.textContent = exam.source === 'teacher' ? 'Đề giáo viên đã xuất bản' : 'Kho đề minh họa chung';
                    card.appendChild(srcBadge);
                    const actions = doc.createElement('div');
                    actions.className = 'class-actions-bar';
                    // Edit button
                    const editBtn = doc.createElement('button');
                    editBtn.type = 'button';
                    editBtn.className = 'btn-teacher-edit class-btn-action';
                    editBtn.appendChild(Icon('edit', doc));
                    const editSpan = doc.createElement('span');
                    editSpan.textContent = 'Sửa đề';
                    editBtn.appendChild(editSpan);
                    editBtn.addEventListener('click', async () => {
                        editBtn.disabled = true;
                        try {
                            const fullExam = (await exam.load());
                            if (fullExam && typeof fullExam === 'object') {
                                if (fullExam.durationMinutes === undefined && fullExam.settings?.durationMinutes !== undefined) {
                                    fullExam.durationMinutes = fullExam.settings.durationMinutes;
                                }
                            }
                            activeEditingExam = fullExam;
                            deps.openBuilder(fullExam, {
                                onPublish: async (updatedExam) => {
                                    const tok = getStoredTeacherToken() || '';
                                    const mergedExam = { ...fullExam, ...updatedExam };
                                    if (fullExam.settings && updatedExam.settings) {
                                        mergedExam.settings = { ...fullExam.settings, ...updatedExam.settings };
                                    }
                                    if (fullExam.questions && updatedExam.questions) {
                                        mergedExam.questions = updatedExam.questions.map((q, i) => {
                                            const origQ = fullExam.questions[i];
                                            if (origQ && origQ.kind === 'I' && q.kind === 'I') {
                                                const rad = doc.querySelector(`input[name="editCorrectOpt_${i}"]:checked`);
                                                if (rad && rad.value) {
                                                    return { ...q, correctOptionId: rad.value };
                                                }
                                                if (origQ.correctOptionId) {
                                                    return { ...q, correctOptionId: origQ.correctOptionId };
                                                }
                                            }
                                            return q;
                                        });
                                    }
                                    const res = await deps.client.publishExam(tok, mergedExam);
                                    if (res.ok) {
                                        myExamIds.add(mergedExam.examId || exam.id);
                                        void loadExams();
                                    }
                                    return res;
                                },
                            });
                        }
                        catch (err) {
                            alert('Lỗi nạp đề thi để sửa: ' + (err?.message || String(err)));
                        }
                        finally {
                            editBtn.disabled = false;
                        }
                    });
                    actions.appendChild(editBtn);
                    // Assign button
                    const assignBtn = doc.createElement('button');
                    assignBtn.type = 'button';
                    assignBtn.className = 'btn-teacher-assign class-btn-action';
                    assignBtn.appendChild(Icon('classes', doc));
                    const assignSpan = doc.createElement('span');
                    assignSpan.textContent = 'Giao đề';
                    assignBtn.appendChild(assignSpan);
                    assignBtn.addEventListener('click', () => {
                        openAssignDialog(null, () => {
                            alert('Đã giao đề thành công!');
                        }, exam.id);
                    });
                    actions.appendChild(assignBtn);
                    // Unpublish button (for teacher source)
                    if (exam.source === 'teacher') {
                        const unpubBtn = doc.createElement('button');
                        unpubBtn.type = 'button';
                        unpubBtn.className = 'btn-teacher-unpublish class-btn-action';
                        unpubBtn.style.color = 'var(--c-danger)';
                        unpubBtn.appendChild(Icon('trash', doc));
                        const unpubSpan = doc.createElement('span');
                        unpubSpan.textContent = 'Gỡ';
                        unpubBtn.appendChild(unpubSpan);
                        unpubBtn.addEventListener('click', async () => {
                            if (typeof confirm === 'function' && !confirm(`Bạn có chắc chắn muốn gỡ xuất bản đề "${exam.title}"?`))
                                return;
                            unpubBtn.disabled = true;
                            try {
                                const tok = getStoredTeacherToken() || '';
                                const res = await deps.client.unpublishExam(tok, exam.id);
                                if (res.ok) {
                                    myExamIds.delete(exam.id);
                                    void loadExams();
                                }
                                else {
                                    alert(toVietnameseErrorMessage(res.code, res.message, false));
                                }
                            }
                            catch (ex) {
                                alert('Lỗi gỡ đề: ' + (ex?.message || String(ex)));
                            }
                            finally {
                                unpubBtn.disabled = false;
                            }
                        });
                        actions.appendChild(unpubBtn);
                    }
                    card.appendChild(actions);
                    grid.appendChild(card);
                }
            }
            catch (err) {
                clearChildren(grid);
                const errP = doc.createElement('p');
                errP.className = 'teacher-error-text';
                errP.textContent = `Lỗi nạp danh sách đề: ${err?.message || ''}`;
                grid.appendChild(errP);
            }
        }
        void loadExams();
    }
    // --------------------------------------------------------------------------
    // 5. Section: Kết quả (#resultsTable, #btnExportResults)
    // --------------------------------------------------------------------------
    async function renderResultsSection(container) {
        clearChildren(container);
        const header = doc.createElement('div');
        header.className = 'teacher-section-header';
        const title = doc.createElement('h2');
        title.className = 'teacher-section-title';
        title.textContent = 'Kết quả bài làm của học sinh';
        header.appendChild(title);
        const exportBtn = doc.createElement('button');
        exportBtn.id = 'btnExportResults';
        exportBtn.type = 'button';
        exportBtn.className = 'btn-teacher-secondary';
        exportBtn.appendChild(Icon('download', doc));
        const btnSpan = doc.createElement('span');
        btnSpan.textContent = 'Xuất kết quả CSV';
        exportBtn.appendChild(btnSpan);
        header.appendChild(exportBtn);
        container.appendChild(header);
        // Filters row: Class select AND Exam select
        const filterRow = doc.createElement('div');
        filterRow.style.display = 'flex';
        filterRow.style.gap = 'var(--sp-3, 12px)';
        filterRow.style.flexWrap = 'wrap';
        filterRow.style.marginBottom = 'var(--sp-4, 16px)';
        const clsGroup = doc.createElement('div');
        clsGroup.style.minWidth = '240px';
        const clsLabel = doc.createElement('label');
        clsLabel.className = 'teacher-field-label';
        clsLabel.setAttribute('for', 'resultsClassSelect');
        clsLabel.textContent = 'Lớp học';
        const clsSelect = doc.createElement('select');
        clsSelect.id = 'resultsClassSelect';
        clsSelect.className = 'teacher-control';
        clsGroup.appendChild(clsLabel);
        clsGroup.appendChild(clsSelect);
        filterRow.appendChild(clsGroup);
        const examGroup = doc.createElement('div');
        examGroup.style.minWidth = '240px';
        const examLabel = doc.createElement('label');
        examLabel.className = 'teacher-field-label';
        examLabel.setAttribute('for', 'resultsExamSelect');
        examLabel.textContent = 'Đề thi';
        const examSelect = doc.createElement('select');
        examSelect.id = 'resultsExamSelect';
        examSelect.className = 'teacher-control';
        examGroup.appendChild(examLabel);
        examGroup.appendChild(examSelect);
        filterRow.appendChild(examGroup);
        container.appendChild(filterRow);
        // Results table wrapper
        const tableWrap = doc.createElement('div');
        tableWrap.className = 'teacher-table-wrap';
        const table = doc.createElement('table');
        table.className = 'teacher-table ui-table';
        const thead = doc.createElement('thead');
        const headerRow = doc.createElement('tr');
        const resultLabels = ['Học sinh', 'Lớp', 'Thời gian nộp', 'Phần I', 'Phần II', 'Phần III', 'Tổng điểm'];
        for (const hText of resultLabels) {
            const th = doc.createElement('th');
            th.setAttribute('scope', 'col');
            th.textContent = hText;
            headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);
        const tbody = doc.createElement('tbody');
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        container.appendChild(tableWrap);
        let currentResultsData = [];
        exportBtn.addEventListener('click', () => {
            if (currentResultsData.length === 0) {
                alert('Chưa có dữ liệu kết quả để xuất.');
                return;
            }
            const headers = ['Hoc sinh', 'Lop', 'Thoi gian nop', 'Phan I', 'Phan II', 'Phan III', 'Tong diem'];
            const rows = currentResultsData.map((r) => [
                escapeCsvCell(r.candidateName || r.candidate_display || ''),
                escapeCsvCell(r.class_code || ''),
                escapeCsvCell(r.submitted_at || ''),
                escapeCsvCell(r.sections?.I ? `${formatScoreD02(r.sections.I.score)}/${formatScoreD02(r.sections.I.max)}` : ''),
                escapeCsvCell(r.sections?.II ? `${formatScoreD02(r.sections.II.score)}/${formatScoreD02(r.sections.II.max)}` : ''),
                escapeCsvCell(r.sections?.III ? `${formatScoreD02(r.sections.III.score)}/${formatScoreD02(r.sections.III.max)}` : ''),
                escapeCsvCell(r.total ? `${formatScoreD02(r.total)}/${formatScoreD02(r.maxTotal || 10)}` : ''),
            ]);
            const csvContent = '\uFEFF' + [headers.map((h) => `"${h}"`).join(','), ...rows.map((row) => row.join(','))].join('\r\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = doc.createElement('a');
            a.href = url;
            a.download = `Cunata_KetQua_${Date.now()}.csv`;
            doc.body.appendChild(a);
            a.click();
            setTimeout(() => {
                a.remove();
                URL.revokeObjectURL(url);
            }, 500);
        });
        function renderTableRows(items) {
            table.id = 'resultsTable';
            clearChildren(tbody);
            if (items.length === 0) {
                const tr = doc.createElement('tr');
                const td = doc.createElement('td');
                td.setAttribute('colspan', '7');
                td.style.textAlign = 'center';
                td.style.color = 'var(--c-text-2)';
                td.textContent = 'Chưa có bài nộp nào.';
                tr.appendChild(td);
                tbody.appendChild(tr);
                return;
            }
            for (const item of items) {
                const tr = doc.createElement('tr');
                const name = item.candidateName || item.candidate_display || 'Học sinh';
                const clsCode = item.class_code || '';
                const subAt = formatViDateTime(item.submitted_at);
                const pI = item.sections?.I ? `${formatScoreD02(item.sections.I.score)} / ${formatScoreD02(item.sections.I.max)}` : '-';
                const pII = item.sections?.II ? `${formatScoreD02(item.sections.II.score)} / ${formatScoreD02(item.sections.II.max)}` : '-';
                const pIII = item.sections?.III ? `${formatScoreD02(item.sections.III.score)} / ${formatScoreD02(item.sections.III.max)}` : '-';
                const total = item.total ? `${formatScoreD02(item.total)} / ${formatScoreD02(item.maxTotal || 10)}` : '-';
                const tdName = doc.createElement('td');
                const strongName = doc.createElement('strong');
                strongName.textContent = name;
                tdName.appendChild(strongName);
                tr.appendChild(tdName);
                const tdCode = doc.createElement('td');
                tdCode.textContent = clsCode;
                tr.appendChild(tdCode);
                const tdSubAt = doc.createElement('td');
                tdSubAt.textContent = subAt;
                tr.appendChild(tdSubAt);
                const tdPI = doc.createElement('td');
                tdPI.textContent = pI;
                tr.appendChild(tdPI);
                const tdPII = doc.createElement('td');
                tdPII.textContent = pII;
                tr.appendChild(tdPII);
                const tdPIII = doc.createElement('td');
                tdPIII.textContent = pIII;
                tr.appendChild(tdPIII);
                const tdTotal = doc.createElement('td');
                const strongTotal = doc.createElement('strong');
                strongTotal.textContent = total;
                tdTotal.appendChild(strongTotal);
                tr.appendChild(tdTotal);
                Array.from(tr.childNodes).forEach((td, index) => {
                    const label = doc.createElement('span');
                    label.className = 'ui-table-label';
                    label.setAttribute('aria-hidden', 'true');
                    label.textContent = resultLabels[index] || '';
                    const value = doc.createElement('span');
                    for (const child of Array.from(td.childNodes))
                        value.appendChild(child);
                    clearChildren(td);
                    td.appendChild(label);
                    td.appendChild(value);
                });
                tbody.appendChild(tr);
            }
        }
        let pendingExamSync = null;
        async function syncExamSelectOptions(targetClassId) {
            const curExamVal = examSelect.value;
            const tok = getStoredTeacherToken() || '';
            if (!deps.client.listAssignments) {
                clearChildren(examSelect);
                const defaultOpt = doc.createElement('option');
                defaultOpt.value = '';
                defaultOpt.textContent = '-- Tất cả đề --';
                examSelect.appendChild(defaultOpt);
                return;
            }
            if ((!cachedMyClasses || cachedMyClasses.length === 0) && deps.client.listMyClasses) {
                try {
                    const cRes = await deps.client.listMyClasses(tok);
                    if (cRes.ok && Array.isArray(cRes.value)) {
                        cachedMyClasses = cRes.value;
                        syncClassSelectOptions();
                    }
                }
                catch { }
            }
            const classesToQuery = targetClassId
                ? cachedMyClasses.filter((c) => c.classId === targetClassId)
                : cachedMyClasses;
            const seenExamIds = new Set();
            const opts = [];
            const defaultOpt = doc.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = '-- Tất cả đề --';
            opts.push(defaultOpt);
            try {
                const assignmentLists = await Promise.all(classesToQuery.map(async (c) => {
                    try {
                        const res = await deps.client.listAssignments(tok, c.classId);
                        return res.ok && Array.isArray(res.value) ? res.value : [];
                    }
                    catch {
                        return [];
                    }
                }));
                for (const assignments of assignmentLists) {
                    for (const a of assignments) {
                        if (!seenExamIds.has(a.examId)) {
                            seenExamIds.add(a.examId);
                            const opt = doc.createElement('option');
                            opt.value = a.examId;
                            opt.textContent = a.title || a.examId;
                            if (a.examId === curExamVal)
                                opt.selected = true;
                            opts.push(opt);
                        }
                    }
                }
            }
            catch { }
            clearChildren(examSelect);
            for (const opt of opts) {
                examSelect.appendChild(opt);
            }
        }
        function doSyncExamSelectOptions(targetClassId) {
            const p = syncExamSelectOptions(targetClassId);
            pendingExamSync = p;
            return p;
        }
        async function loadResults() {
            clearChildren(tbody);
            const loadingTr = doc.createElement('tr');
            const loadingTd = doc.createElement('td');
            loadingTd.setAttribute('colspan', '7');
            loadingTd.textContent = 'Đang nạp kết quả...';
            loadingTr.appendChild(loadingTd);
            tbody.appendChild(loadingTr);
            if (pendingExamSync) {
                try {
                    await pendingExamSync;
                }
                catch { }
            }
            const tok = getStoredTeacherToken() || '';
            const chosenClassId = clsSelect.value || '';
            const chosenExamId = examSelect.value || '';
            if (!deps.client.listResults) {
                table.id = 'resultsTable';
                clearChildren(tbody);
                const tr = doc.createElement('tr');
                const td = doc.createElement('td');
                td.setAttribute('colspan', '7');
                td.textContent = 'Chức năng xem kết quả chưa được hỗ trợ.';
                tr.appendChild(td);
                tbody.appendChild(tr);
                return;
            }
            try {
                if (chosenClassId) {
                    const res = await deps.client.listResults(tok, chosenClassId);
                    if (res.ok) {
                        let items = res.value || [];
                        if (chosenExamId) {
                            items = items.filter((x) => x.exam_id === chosenExamId);
                        }
                        currentResultsData = items;
                        renderTableRows(currentResultsData);
                    }
                    else {
                        table.id = 'resultsTable';
                        clearChildren(tbody);
                        const tr = doc.createElement('tr');
                        const td = doc.createElement('td');
                        td.setAttribute('colspan', '7');
                        td.className = 'teacher-error-text';
                        td.textContent = toVietnameseErrorMessage(res.code, res.message, false);
                        tr.appendChild(td);
                        tbody.appendChild(tr);
                    }
                }
                else {
                    // If no specific class selected (-- Tất cả lớp --): aggregate across all teacher's classes
                    let classes = cachedMyClasses;
                    if ((!classes || classes.length === 0) && deps.client.listMyClasses) {
                        try {
                            const cRes = await deps.client.listMyClasses(tok);
                            if (cRes.ok && Array.isArray(cRes.value)) {
                                classes = cRes.value;
                                cachedMyClasses = classes;
                                syncClassSelectOptions();
                                await doSyncExamSelectOptions();
                            }
                        }
                        catch { }
                    }
                    if (!classes || classes.length === 0) {
                        // Check if backend supports listResults directly without classId (mock client or direct)
                        try {
                            const directRes = await deps.client.listResults(tok, '');
                            if (directRes.ok && Array.isArray(directRes.value) && directRes.value.length > 0) {
                                let items = directRes.value;
                                if (chosenExamId) {
                                    items = items.filter((x) => x.exam_id === chosenExamId);
                                }
                                currentResultsData = items;
                                renderTableRows(currentResultsData);
                                return;
                            }
                        }
                        catch { }
                        currentResultsData = [];
                        renderTableRows([]);
                        return;
                    }
                    const fetchPromises = classes.map(async (c) => {
                        try {
                            const res = await deps.client.listResults(tok, c.classId);
                            return res.ok && Array.isArray(res.value) ? res.value : [];
                        }
                        catch {
                            return [];
                        }
                    });
                    const perClass = await Promise.all(fetchPromises);
                    let allResults = perClass.flat();
                    if (chosenExamId) {
                        allResults = allResults.filter((x) => x.exam_id === chosenExamId);
                    }
                    allResults.sort((a, b) => {
                        const tA = Date.parse(a.submitted_at || '') || 0;
                        const tB = Date.parse(b.submitted_at || '') || 0;
                        return tB - tA;
                    });
                    currentResultsData = allResults;
                    renderTableRows(currentResultsData);
                }
            }
            catch (err) {
                table.id = 'resultsTable';
                clearChildren(tbody);
                const tr = doc.createElement('tr');
                const td = doc.createElement('td');
                td.setAttribute('colspan', '7');
                td.className = 'teacher-error-text';
                td.textContent = `Lỗi nạp kết quả: ${err?.message || ''}`;
                tr.appendChild(td);
                tbody.appendChild(tr);
            }
        }
        function syncClassSelectOptions() {
            const curVal = clsSelect.value;
            clearChildren(clsSelect);
            const defaultOpt = doc.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = '-- Tất cả lớp --';
            clsSelect.appendChild(defaultOpt);
            for (const c of cachedMyClasses) {
                const opt = doc.createElement('option');
                opt.value = c.classId;
                opt.textContent = `${c.name} (${c.code})`;
                if (c.classId === curVal)
                    opt.selected = true;
                clsSelect.appendChild(opt);
            }
        }
        syncClassSelectOptions();
        const initDefaultOpt = doc.createElement('option');
        initDefaultOpt.value = '';
        initDefaultOpt.textContent = '-- Tất cả đề --';
        examSelect.appendChild(initDefaultOpt);
        async function initResultsSection() {
            const tok = getStoredTeacherToken() || '';
            if (deps.client.listMyClasses) {
                try {
                    const res = await deps.client.listMyClasses(tok);
                    if (res.ok && Array.isArray(res.value)) {
                        cachedMyClasses = res.value;
                        syncClassSelectOptions();
                    }
                }
                catch { }
            }
            await doSyncExamSelectOptions(clsSelect.value);
            await loadResults();
        }
        clsSelect.addEventListener('change', async () => {
            await doSyncExamSelectOptions(clsSelect.value);
            void loadResults();
        });
        examSelect.addEventListener('change', () => {
            void loadResults();
        });
        void initResultsSection();
    }
    // --------------------------------------------------------------------------
    // Visibility and Routing Helpers
    // --------------------------------------------------------------------------
    function isLoggedIn() {
        return Boolean(getStoredTeacherToken());
    }
    function showLogin() {
        if (shell)
            shell.style.display = 'none';
        if (loginSection) {
            loginSection.style.display = 'block';
            renderLoginView();
        }
    }
    function showShell(section) {
        const targetSection = section || parseNavFromHash();
        if (loginSection)
            loginSection.style.display = 'none';
        if (shell) {
            shell.style.display = 'block';
            currentNav = targetSection;
            renderShellView();
        }
    }
    let roleChosen = false;
    const onChooseTeacher = () => {
        roleChosen = true;
        const chooser = doc.getElementById('roleChooser');
        if (chooser) {
            chooser.hidden = true;
        }
        if (isLoggedIn()) {
            showShell(parseNavFromHash());
        }
        else {
            showLogin();
        }
    };
    if (doc.addEventListener) {
        doc.addEventListener('click', (ev) => {
            const target = ev.target;
            if (target && (target.id === 'btnRoleTeacher' || (target.closest && target.closest('#btnRoleTeacher')))) {
                onChooseTeacher();
            }
        });
    }
    if (typeof window !== 'undefined') {
        window.addEventListener('hashchange', () => {
            if (isLoggedIn() && shell && shell.style.display !== 'none') {
                const newNav = parseNavFromHash();
                if (newNav !== currentNav) {
                    setNav(newNav);
                }
            }
        });
    }
    // Initial render of login form
    renderLoginView();
    return {
        open(section) {
            const activeSection = section || parseNavFromHash();
            const chooser = doc.getElementById('roleChooser');
            let rememberedRole = null;
            try {
                rememberedRole = localStorage.getItem(TEACHER_ROLE_KEY);
            }
            catch { }
            if (rememberedRole === 'teacher') {
                roleChosen = true;
            }
            if (chooser && !roleChosen && !isLoggedIn()) {
                chooser.hidden = false;
                if (loginSection)
                    loginSection.style.display = 'none';
                if (shell)
                    shell.style.display = 'none';
                return;
            }
            if (chooser) {
                chooser.hidden = true;
            }
            if (isLoggedIn()) {
                showShell(activeSection);
            }
            else {
                showLogin();
            }
        },
        close() {
            roleChosen = false;
            if (loginSection)
                loginSection.style.display = 'none';
            if (shell)
                shell.style.display = 'none';
            const assignDlg = doc.getElementById('assignDialog');
            if (assignDlg)
                assignDlg.remove();
        },
        async refreshList() {
            if (isLoggedIn() && shell && shell.style.display !== 'none') {
                renderActiveSection();
            }
        },
        dispose() {
            loginSection?.remove();
            shell?.remove();
            const dlg = doc.getElementById('assignDialog');
            if (dlg)
                dlg.remove();
        },
    };
}
