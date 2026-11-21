/**
 * Cunata Web M2-M6 — Composition Root & Application Bootstrap
 * Conforms to WEB-contract.md §2, §3, §5, §10 and Shared Product Contract v2.0.
 */
import { openStorage } from '../storage/index.js';
import { parseExam } from '../schema/index.js';
import { startAttempt, resumeAttempt, toDomainExam } from '../student/index.js';
import { buildReport, renderReportHtml } from '../report/index.js';
import { createStatusAnnouncer, announceStatus, openModal } from '../ui/index.js';
import { createRouter } from './routes.js';
import { scoreAttempt, scoreResultToDTO, computeExamMax, toFractionString, parseFractionString, rational, createPresentationOrder, validatePresentationOrder, validateExamVersion, } from '../domain/index.js';
import { formatRationalScore, scoreLegacyAttempt, } from './legacy.js';
import { fetchAndMergeExams, fetchExamData } from './exam-list.js';
import { mountStudentArea } from '../student/index.js';
import { initAuthoring } from './authoring.js';
import { mountRoleShell, readRememberedRole } from './role-shell.js';
import { mountTeacherPortal } from '../teacher/portal.js';
import { createAppsScriptClient, loadAppConfig, resolveBackend, createAppsScriptCollectorPort, enqueue, drainOutbox, resumeOutbox, } from '../collect/index.js';
import { ErrorState } from '../ui/components.js';
function formatDisplayScore(val) {
    return formatRationalScore(val);
}
const DEFAULT_SAMPLE_EXAM = {
    schemaVersion: 'web-exam-v1',
    examId: 'cunata-toan-gdpt-2018',
    examVersionId: 'v1.0.0',
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    title: 'Đề Khảo Sát Năng Lực Môn Toán — GDPT 2018 (Minh Họa)',
    subject: 'Toán học',
    grade: 12,
    settings: {
        durationMinutes: 50,
        maxAttempts: null,
        releasePolicy: 'immediate',
        shuffleQuestions: false,
        shuffleOptions: false,
    },
    questions: [
        {
            kind: 'I',
            questionVersionId: 'q01-i-ham-so',
            title: 'Câu 1 (Phần I)',
            content: 'Cho hàm số $y = f(x)$ có bảng biến thiên như hình vẽ.\n\n![Bảng biến thiên](public/q01-bbt.svg)\n\nHàm số đã cho đồng biến trên khoảng nào dưới đây?',
            image: 'public/q01-bbt.svg',
            options: [
                { optionId: 'opt-1a', label: 'A', text: 'Khoảng $(-\\infty; -1)$' },
                { optionId: 'opt-1b', label: 'B', text: 'Khoảng $(-1; 1)$' },
                { optionId: 'opt-1c', label: 'C', text: 'Khoảng $(0; 2)$' },
                { optionId: 'opt-1d', label: 'D', text: 'Khoảng $(0; 1)$' },
            ],
            correctOptionId: 'opt-1a',
            explanation: 'Dựa vào bảng biến thiên, đạo hàm $f\'(x) > 0$ trên khoảng $(-\\infty; -1)$ nên hàm số đồng biến trên khoảng $(-\\infty; -1)$. Trên khoảng $(-1; 1)$ và $(0; 1)$, hàm số nghịch biến.',
        },
        {
            kind: 'I',
            questionVersionId: 'q02-i-tich-phan',
            title: 'Câu 2 (Phần I)',
            content: 'Biết $\\int_{1}^{2} f(x)dx = 3$ và $\\int_{1}^{2} g(x)dx = 2$. Khi đó $\\int_{1}^{2} [f(x) - 2g(x)]dx$ bằng bao nhiêu?',
            options: [
                { optionId: 'opt-2a', label: 'A', text: '$-1$' },
                { optionId: 'opt-2b', label: 'B', text: '$-5$' },
                { optionId: 'opt-2c', label: 'C', text: '$7$' },
                { optionId: 'opt-2d', label: 'D', text: '$1$' },
            ],
            correctOptionId: 'opt-2a',
            explanation: 'Áp dụng tính chất tích phân: $\\int_{1}^{2} [f(x) - 2g(x)]dx = \\int_{1}^{2} f(x)dx - 2\\int_{1}^{2} g(x)dx = 3 - 2(2) = -1$.',
        },
        {
            kind: 'I',
            questionVersionId: 'q03-i-oxyz',
            title: 'Câu 3 (Phần I)',
            content: 'Trong không gian $Oxyz$, cho mặt phẳng $(P): 2x - y + 3z - 5 = 0$. Một vectơ pháp tuyến của $(P)$ có tọa độ là:',
            options: [
                { optionId: 'opt-3a', label: 'A', text: '$\\vec{n}_1 = (2; 1; 3)$' },
                { optionId: 'opt-3b', label: 'B', text: '$\\vec{n}_2 = (2; -1; -5)$' },
                { optionId: 'opt-3c', label: 'C', text: '$\\vec{n}_3 = (2; -1; 3)$' },
                { optionId: 'opt-3d', label: 'D', text: '$\\vec{n}_4 = (-2; 1; 3)$' },
            ],
            correctOptionId: 'opt-3c',
            explanation: 'Mặt phẳng có phương trình tổng quát $Ax + By + Cz + D = 0$ có một VTPT là $\\vec{n} = (A; B; C) = (2; -1; 3)$.',
        },
        {
            kind: 'I',
            questionVersionId: 'q04-i-xac-suat',
            title: 'Câu 4 (Phần I)',
            content: 'Gieo một con xúc xắc cân đối và đồng chất 2 lần. Xác suất để tổng số chấm xuất hiện trong hai lần gieo bằng 7 là:',
            options: [
                { optionId: 'opt-4a', label: 'A', text: '$\\frac{1}{12}$' },
                { optionId: 'opt-4b', label: 'B', text: '$\\frac{5}{36}$' },
                { optionId: 'opt-4c', label: 'C', text: '$\\frac{7}{36}$' },
                { optionId: 'opt-4d', label: 'D', text: '$\\frac{1}{6}$' },
            ],
            correctOptionId: 'opt-4d',
            explanation: 'Không gian mẫu $n(\\Omega) = 36$. Các cặp có tổng bằng 7: (1,6), (2,5), (3,4), (4,3), (5,2), (6,1) gồm 6 biến cố thuận lợi. $P = 6/36 = 1/6$.',
        },
        {
            kind: 'II',
            questionVersionId: 'q05-ii-khao-sat-ham',
            title: 'Câu 5 (Phần II - Đúng / Sai)',
            content: 'Cho hàm số bậc ba $y = f(x) = x^3 - 3x + 2$ có đồ thị là $(C)$. Xét tính đúng/sai của các mệnh đề sau:',
            statements: [
                {
                    statementId: 'st-5a',
                    label: 'a',
                    text: 'Hàm số đã cho đạt cực tiểu tại điểm $x = 1$.',
                    answer: true,
                    explanation: 'Ta có $f\'(x) = 3x^2 - 3 = 0 \\Leftrightarrow x = \\pm 1$. $f\'\'(x) = 6x \\Rightarrow f\'\'(1) = 6 > 0$, do đó $x = 1$ là điểm cực tiểu. (Mệnh đề ĐÚNG)',
                },
                {
                    statementId: 'st-5b',
                    label: 'b',
                    text: 'Giá trị cực đại của hàm số bằng $2$.',
                    answer: false,
                    explanation: 'Điểm cực đại là $x = -1$, giá trị cực đại tương ứng $f(-1) = (-1)^3 - 3(-1) + 2 = 4 \\neq 2$. (Mệnh đề SAI)',
                },
                {
                    statementId: 'st-5c',
                    label: 'c',
                    text: 'Đồ thị $(C)$ cắt trục hoành tại đúng $2$ điểm phân biệt.',
                    answer: true,
                    explanation: 'Phương trình $x^3 - 3x + 2 = 0 \\Leftrightarrow (x - 1)^2(x + 2) = 0 \\Leftrightarrow x = 1$ hoặc $x = -2$. Đồ thị cắt trục hoành tại 2 điểm $(1; 0)$ và $(-2; 0)$. (Mệnh đề ĐÚNG)',
                },
                {
                    statementId: 'st-5d',
                    label: 'd',
                    text: 'Tiếp tuyến của $(C)$ tại điểm uốn $I(0; 2)$ có hệ số góc bằng $-3$.',
                    answer: true,
                    explanation: 'Hệ số góc tiếp tuyến tại điểm $x = 0$ là $k = f\'(0) = 3(0)^2 - 3 = -3$. (Mệnh đề ĐÚNG)',
                },
            ],
        },
        {
            kind: 'II',
            questionVersionId: 'q06-ii-oxyz-mat-cau',
            title: 'Câu 6 (Phần II - Đúng / Sai)',
            content: 'Trong không gian $Oxyz$, cho điểm $A(1; 2; -1)$, $B(3; 0; 1)$ và mặt phẳng $(P): x + 2y - 2z + 1 = 0$.',
            statements: [
                {
                    statementId: 'st-6a',
                    label: 'a',
                    text: 'Trung điểm $M$ của đoạn thẳng $AB$ có tọa độ là $(4; 2; 0)$.',
                    answer: false,
                    explanation: 'Tọa độ trung điểm $M = ((1+3)/2; (2+0)/2; (-1+1)/2) = (2; 1; 0) \\neq (4; 2; 0)$. (Mệnh đề SAI)',
                },
                {
                    statementId: 'st-6b',
                    label: 'b',
                    text: 'Độ dài đoạn thẳng $AB$ bằng $2\\sqrt{3}$.',
                    answer: true,
                    explanation: 'Ta có $\\vec{AB} = (2; -2; 2) \\Rightarrow AB = \\sqrt{2^2 + (-2)^2 + 2^2} = \\sqrt{12} = 2\\sqrt{3}$. (Mệnh đề ĐÚNG)',
                },
                {
                    statementId: 'st-6c',
                    label: 'c',
                    text: 'Khoảng cách từ điểm $A$ đến mặt phẳng $(P)$ bằng $3$.',
                    answer: false,
                    explanation: '$d(A, (P)) = \\frac{|1 + 2(2) - 2(-1) + 1|}{\\sqrt{1^2 + 2^2 + (-2)^2}} = \\frac{|8|}{3} = \\frac{8}{3} \\neq 3$. (Mệnh đề SAI)',
                },
                {
                    statementId: 'st-6d',
                    label: 'd',
                    text: 'Mặt cầu $(S)$ nhận $AB$ làm đường kính có phương trình $(x-2)^2 + (y-1)^2 + z^2 = 3$.',
                    answer: true,
                    explanation: 'Tâm mặt cầu là trung điểm $M(2; 1; 0)$, bán kính $R = AB/2 = \\sqrt{3}$. Phương trình: $(x-2)^2 + (y-1)^2 + z^2 = 3$. (Mệnh đề ĐÚNG)',
                },
            ],
        },
        {
            kind: 'III',
            questionVersionId: 'q07-iii-gia-tri-nho-nhat',
            title: 'Câu 7 (Phần III - Trả lời ngắn)',
            content: 'Cho hàm số $f(x) = 2x^2 + 2x$. Tìm giá trị nhỏ nhất của hàm số trên đoạn $[-1; 1]$. (Ghi kết quả dưới dạng số thập phân tối đa 4 ký tự dùng dấu phẩy, ví dụ -0,5).',
            answerKey: '-0,5',
            explanation: 'Ta có đạo hàm $f\'(x) = 4x + 2 = 0 \\Leftrightarrow x = -1/2 \\in [-1; 1]$. Các giá trị: $f(-1) = 0$, $f(1) = 4$, $f(-1/2) = 2(-1/2)^2 + 2(-1/2) = -0,5$. Do đó giá trị nhỏ nhất của hàm số trên đoạn $[-1; 1]$ bằng $-0,5$.',
        },
        {
            kind: 'III',
            questionVersionId: 'q08-iii-ung-dung-thuc-te',
            title: 'Câu 8 (Phần III - Trả lời ngắn)',
            content: 'Một vật chuyển động thẳng với gia tốc $a(t) = 3t$ ($m/s^2$). Vận tốc ban đầu $v(0) = 0$. Vận tốc của vật tại thời điểm $t = 1$ giây bằng bao nhiêu $m/s$? (Ghi kết quả dưới dạng số thập phân dùng dấu phẩy, tối đa 4 ký tự).',
            answerKey: '1,5',
            explanation: 'Vận tốc $v(t) = \\int a(t)dt = \\int 3t dt = 1,5t^2 + C$. Vì $v(0) = 0 \\Rightarrow C = 0 \\Rightarrow v(t) = 1,5t^2$. Tại $t = 1$, ta có $v(1) = 1,5(1)^2 = 1,5$ ($m/s$).',
        },
    ],
    assets: [],
};
function setAttr(el, name, val) {
    if (el && typeof el.setAttribute === 'function') {
        el.setAttribute(name, val);
    }
    else if (el) {
        if (!el.attributes)
            el.attributes = {};
        el.attributes[name] = val;
    }
}
function removeAttr(el, name) {
    if (el && typeof el.removeAttribute === 'function') {
        el.removeAttribute(name);
    }
    else if (el && el.attributes) {
        delete el.attributes[name];
    }
}
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function renderInlineMath(text) {
    let html = escapeHtml(text);
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
        const cleanSrc = src.trim();
        if (cleanSrc.startsWith('//') || cleanSrc.startsWith('http://') || cleanSrc.startsWith('https://')) {
            return '';
        }
        if (!/^[a-zA-Z0-9_./\-]+$/.test(cleanSrc) && !cleanSrc.startsWith('data:image/')) {
            return '';
        }
        return '<img src="' + escapeHtml(cleanSrc) + '" alt="' + alt + '" class="exam-figure" />';
    });
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\$([^$]+)\$/g, (_match, formula) => {
        let f = formula;
        f = f.replace(/\\vec\{([a-zA-Z])\}/g, '$1&#8407;');
        f = f.replace(/\\int_\{([^}]+)\}\^\{([^}]+)\}/g, '&int;<sub>$1</sub><sup>$2</sup> ');
        // Both operands must retain their grouping when a fraction becomes inline text.
        f = f.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '(($1)/($2))');
        f = f.replace(/\\sqrt\{([^}]+)\}/g, '&radic;($1)');
        f = f.replace(/\\pm/g, '&plusmn;');
        f = f.replace(/\\neq/g, '&ne;');
        f = f.replace(/\\Leftrightarrow/g, ' &hArr; ');
        f = f.replace(/\\Rightarrow/g, ' &rArr; ');
        f = f.replace(/\\infty/g, '&#8734;');
        f = f.replace(/\\in(?![a-zA-Z])/g, ' &isin; ');
        f = f.replace(/\\Omega/g, '&Omega;');
        f = f.replace(/\\%/g, '%');
        f = f.replace(/\^([0-9a-zA-Z+-]+)/g, '<sup>$1</sup>');
        f = f.replace(/_([0-9a-zA-Z+-]+)/g, '<sub>$1</sub>');
        // Keep unsupported notation intact instead of presenting a partial conversion as math.
        if (/\\[a-zA-Z]/.test(f)) {
            return '<span class="math-expr">LaTeX (nguồn): ' + formula + '</span>';
        }
        return '<span class="math-expr">' + f + '</span>';
    });
    return html;
}
function renderMathText(text) {
    if (!text)
        return '';
    const lines = text.split('\n');
    const blocks = [];
    let currentParagraph = [];
    const flushParagraph = () => {
        if (currentParagraph.length > 0) {
            const pText = currentParagraph.join('<br/>');
            if (pText.trim()) {
                blocks.push('<p>' + pText + '</p>');
            }
            currentParagraph = [];
        }
    };
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (line.includes('|') &&
            i + 1 < lines.length &&
            /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(lines[i + 1])) {
            flushParagraph();
            const splitCells = (row) => {
                let r = row.trim();
                if (r.startsWith('|'))
                    r = r.slice(1);
                if (r.endsWith('|'))
                    r = r.slice(0, -1);
                return r.split('|').map((c) => c.trim());
            };
            const headers = splitCells(line);
            i += 2; // skip header and separator
            const dataRows = [];
            while (i < lines.length && lines[i].includes('|') && lines[i].trim().length > 0) {
                dataRows.push(splitCells(lines[i]));
                i++;
            }
            let tableHtml = '<table class="exam-table"><thead><tr>';
            for (const h of headers) {
                tableHtml += `<th>${renderInlineMath(h)}</th>`;
            }
            tableHtml += '</tr></thead><tbody>';
            for (const row of dataRows) {
                tableHtml += '<tr>';
                for (let c = 0; c < headers.length; c++) {
                    const val = row[c] ?? '';
                    tableHtml += `<td>${renderInlineMath(val)}</td>`;
                }
                tableHtml += '</tr>';
            }
            tableHtml += '</tbody></table>';
            blocks.push(tableHtml);
        }
        else if (line.trim() === '') {
            flushParagraph();
            i++;
        }
        else {
            currentParagraph.push(renderInlineMath(line));
            i++;
        }
    }
    flushParagraph();
    return blocks.length > 0 ? blocks.join('') : '<p></p>';
}
function getStorageKey(exam, state) {
    const examId = (exam && exam.examId) || (state && state.examId) || 'exam';
    const version = (exam && exam.examVersionId) || (state && state.examVersionId) || 'v1';
    const attemptId = (state && state.attemptId) || 'attempt-sample-01';
    return 'cunata:attempt:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version) + ':' + encodeURIComponent(attemptId);
}
function getFinalStorageKey(exam, state) {
    const examId = (exam && exam.examId) || (state && state.examId) || 'exam';
    const version = (exam && exam.examVersionId) || (state && state.examVersionId) || 'v1';
    const attemptId = (state && state.attemptId) || 'attempt-sample-01';
    return 'cunata:final:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version) + ':' + encodeURIComponent(attemptId);
}
function isSameIdentity(record, exam, state) {
    if (!record || typeof record !== 'object')
        return false;
    const targetExamId = (exam && exam.examId) || (state && state.examId) || 'exam';
    const targetVersionId = (exam && exam.examVersionId) || (state && state.examVersionId) || 'v1';
    const targetAttemptId = (state && state.attemptId);
    if (record.examId !== targetExamId || record.examVersionId !== targetVersionId) {
        return false;
    }
    if (record.attemptId && targetAttemptId && record.attemptId !== targetAttemptId) {
        if (record.attemptId === 'attempt-sample-01' || targetAttemptId === 'attempt-sample-01') {
            return true;
        }
        return false;
    }
    return true;
}
function ensureShellStructure(root) {
    if (root.querySelector('#examTitle') && root.querySelector('#examPane')) {
        return;
    }
    const doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc)
        return;
    const createEl = (tag, id, className) => {
        const el = doc.createElement(tag);
        if (id)
            el.id = id;
        if (className)
            el.className = className;
        return el;
    };
    const header = createEl('header', undefined, 'app-header');
    const title = createEl('div', 'examTitle', 'exam-meta-title');
    title.textContent = 'Đang tải đề thi...';
    const candInput = createEl('input', 'candidateName', 'candidate-input');
    candInput.value = 'Thí sinh tự do';
    candInput.readOnly = true;
    candInput.setAttribute('readonly', 'readonly');
    const syncStatus = createEl('div', 'syncStatus', 'sync-status-badge');
    syncStatus.setAttribute('role', 'status');
    syncStatus.setAttribute('aria-live', 'polite');
    const syncText = createEl('span', 'syncText');
    syncText.textContent = 'Chưa lưu';
    syncStatus.appendChild(syncText);
    const timerBox = createEl('div', 'timerBox', 'timer-box');
    timerBox.textContent = '50:00';
    const btnSubmit = createEl('button', 'btnSubmit', 'btn-submit');
    btnSubmit.textContent = 'Nộp bài';
    const examFileInput = createEl('input', 'examFileInput');
    examFileInput.type = 'file';
    header.appendChild(title);
    header.appendChild(candInput);
    header.appendChild(syncStatus);
    header.appendChild(timerBox);
    header.appendChild(btnSubmit);
    header.appendChild(examFileInput);
    const examWrapper = createEl('div', 'examWrapper', 'main-wrapper');
    const paletteProgress = createEl('div', 'paletteProgress');
    const paletteGrid = createEl('div', 'paletteGrid', 'palette-grid');
    const examPane = createEl('div', 'examPane', 'exam-pane');
    examWrapper.appendChild(paletteProgress);
    examWrapper.appendChild(paletteGrid);
    examWrapper.appendChild(examPane);
    const reportWrapper = createEl('div', 'reportWrapper', 'report-wrapper');
    reportWrapper.style.display = 'none';
    const reportView = createEl('div', 'reportView', 'report-container');
    const reportSubtitle = createEl('div', 'reportSubtitle');
    const summaryGrid = createEl('div', undefined, 'summary-cards-grid');
    const scorePartI = createEl('div', 'scorePartI');
    const scorePartII = createEl('div', 'scorePartII');
    const scorePartIII = createEl('div', 'scorePartIII');
    const scoreTotal = createEl('div', 'scoreTotal');
    summaryGrid.appendChild(scorePartI);
    summaryGrid.appendChild(scorePartII);
    summaryGrid.appendChild(scorePartIII);
    summaryGrid.appendChild(scoreTotal);
    const actionsBar = createEl('div', undefined, 'report-actions-bar');
    const btnPrintReport = createEl('button', 'btnPrintReport');
    const btnDownloadReportHtml = createEl('button', 'btnDownloadReportHtml');
    const btnDownloadResultJson = createEl('button', 'btnDownloadResultJson');
    const btnDownloadResultCsv = createEl('button', 'btnDownloadResultCsv');
    const btnRestart = createEl('button', 'btnRestart');
    actionsBar.appendChild(btnPrintReport);
    actionsBar.appendChild(btnDownloadReportHtml);
    actionsBar.appendChild(btnDownloadResultJson);
    actionsBar.appendChild(btnDownloadResultCsv);
    actionsBar.appendChild(btnRestart);
    const reviewQuestionsList = createEl('div', 'reviewQuestionsList');
    reportView.appendChild(reportSubtitle);
    reportView.appendChild(summaryGrid);
    reportView.appendChild(actionsBar);
    reportView.appendChild(reviewQuestionsList);
    reportWrapper.appendChild(reportView);
    const submitModal = createEl('div', 'submitModal', 'modal-overlay');
    submitModal.style.display = 'none';
    const btnConfirmSubmit = createEl('button', 'btnConfirmSubmit');
    const btnCancelSubmit = createEl('button', 'btnCancelSubmit');
    submitModal.appendChild(btnConfirmSubmit);
    submitModal.appendChild(btnCancelSubmit);
    const builderModal = createEl('div', 'builderModal', 'modal-overlay');
    builderModal.style.display = 'none';
    const btnCloseBuilder = createEl('button', 'btnCloseBuilder');
    builderModal.appendChild(btnCloseBuilder);
    const bankModal = createEl('div', 'bankModal', 'modal-overlay');
    bankModal.style.display = 'none';
    const btnCloseBank = createEl('button', 'btnCloseBank');
    bankModal.appendChild(btnCloseBank);
    root.appendChild(header);
    root.appendChild(examWrapper);
    root.appendChild(reportWrapper);
    root.appendChild(submitModal);
    root.appendChild(builderModal);
    root.appendChild(bankModal);
}
function toDomainResponses(exam, attId, resMap) {
    const respList = [];
    for (const q of exam.questions) {
        const val = resMap[q.questionVersionId];
        if (q.kind === 'I') {
            respList.push({
                kind: 'I',
                questionVersionId: q.questionVersionId,
                selectedOptionId: typeof val === 'string' && val ? val : null,
            });
        }
        else if (q.kind === 'II') {
            const answers = (q.statements || []).map((st) => ({
                statementId: st.statementId,
                value: val && typeof val === 'object' && typeof val[st.statementId] === 'boolean' ? val[st.statementId] : null,
            }));
            respList.push({
                kind: 'II',
                questionVersionId: q.questionVersionId,
                answers,
            });
        }
        else if (q.kind === 'III') {
            respList.push({
                kind: 'III',
                questionVersionId: q.questionVersionId,
                raw: typeof val === 'string' && val.length > 0 ? val : null,
            });
        }
    }
    return {
        attemptId: attId,
        examVersionId: exam.examVersionId,
        responses: respList,
    };
}
function fromDomainResponses(domainResp) {
    const map = Object.create(null);
    if (!domainResp)
        return map;
    if (!Array.isArray(domainResp.responses) && typeof domainResp === 'object') {
        return { ...domainResp };
    }
    const list = Array.isArray(domainResp.responses) ? domainResp.responses : [];
    for (const r of list) {
        if (r.kind === 'I') {
            if (r.selectedOptionId)
                map[r.questionVersionId] = r.selectedOptionId;
        }
        else if (r.kind === 'II') {
            const stMap = {};
            const rawAns = r.answers ?? r.statements ?? [];
            for (const a of rawAns) {
                const v = a.value !== undefined ? a.value : a.answer;
                if (typeof v === 'boolean') {
                    stMap[a.statementId] = v;
                }
            }
            if (Object.keys(stMap).length > 0) {
                map[r.questionVersionId] = stMap;
            }
        }
        else if (r.kind === 'III') {
            if (typeof r.raw === 'string' && r.raw.length > 0) {
                map[r.questionVersionId] = r.raw;
            }
        }
    }
    return map;
}
export async function bootstrap(root, options) {
    if (!root || (typeof HTMLElement !== 'undefined' && !(root instanceof HTMLElement)) || typeof root.querySelector !== 'function') {
        throw new Error('Root element must be a valid HTMLElement');
    }
    ensureShellStructure(root);
    const now = options?.now ?? (() => Date.now());
    const idGen = options?.id ?? (() => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return 'id-' + Math.random().toString(36).slice(2, 10);
    });
    const storageRes = await openStorage({
        adapter: options?.storageAdapter,
        approveD03: true,
    });
    const isStorageAvailable = storageRes.ok;
    const storageErr = !storageRes.ok && storageRes.error ? storageRes.error : {
        code: 'STORAGE_UNAVAILABLE',
        path: 'storage',
        message: 'Lưu trữ không khả dụng (IndexedDB unavailable)',
        recoverable: false,
    };
    const storage = storageRes.ok
        ? storageRes.value
        : {
            async load() { return { ok: false, error: storageErr }; },
            async create() { return { ok: false, error: storageErr }; },
            async saveDraft() { return { ok: false, error: storageErr }; },
            async finalize() { return { ok: false, error: storageErr }; },
            async listAttempts() { return { ok: false, error: storageErr }; },
            async getObject() { return { ok: false, error: storageErr }; },
            async putObject() { return { ok: false, error: storageErr }; },
            async deleteObject() { return { ok: false, error: storageErr }; },
            async getOutbox() { return { ok: false, error: storageErr }; },
            async updateOutbox() { return { ok: false, error: storageErr }; },
            async exportBackup() { return { ok: false, error: storageErr }; },
            async importBackup() { return { ok: false, error: storageErr }; },
            async clearAll() { return { ok: false, error: storageErr }; },
        };
    const router = createRouter(options?.initialRoute ?? (options?.initialExam ? 'exam' : 'chooser'));
    const doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
    let announcer = null;
    if (doc) {
        try {
            announcer = createStatusAnnouncer({ document: doc });
        }
        catch {
            announcer = null;
        }
    }
    const examWrapper = root.querySelector('#examWrapper');
    const reportWrapper = root.querySelector('#reportWrapper');
    const builderModal = root.querySelector('#builderModal');
    const bankModal = root.querySelector('#bankModal');
    const submitModal = root.querySelector('#submitModal');
    const examTitle = root.querySelector('#examTitle');
    const candidateInput = root.querySelector('#candidateName');
    const syncStatus = root.querySelector('#syncStatus');
    const syncText = root.querySelector('#syncText');
    const timerBox = root.querySelector('#timerBox');
    const btnSubmit = root.querySelector('#btnSubmit');
    const btnConfirmSubmit = root.querySelector('#btnConfirmSubmit');
    const btnCancelSubmit = root.querySelector('#btnCancelSubmit');
    const btnCloseBuilder = root.querySelector('#btnCloseBuilder');
    const btnCloseBank = root.querySelector('#btnCloseBank');
    const examPane = root.querySelector('#examPane');
    const paletteProgress = root.querySelector('#paletteProgress');
    const paletteGrid = root.querySelector('#paletteGrid');
    const examFileInput = root.querySelector('#examFileInput');
    // Student State
    let appsScriptUrl = '';
    let backendContentType = 'text/plain;charset=utf-8';
    let currentExam = options?.initialExam ?? DEFAULT_SAMPLE_EXAM;
    if (typeof localStorage !== 'undefined' && !options?.initialExam) {
        try {
            const savedSnap = localStorage.getItem('cunata:active_exam_snapshot');
            if (savedSnap) {
                const parsed = JSON.parse(savedSnap);
                if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
                    currentExam = parsed;
                }
            }
        }
        catch (_) { }
    }
    if (examTitle && currentExam?.title && (!examTitle.textContent || examTitle.textContent === 'Đang tải đề thi...')) {
        examTitle.textContent = currentExam.title;
    }
    let attemptId = 'attempt-' + now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    let loadedExamId = null;
    let candidateName = 'Thí sinh tự do';
    try {
        candidateName = localStorage.getItem('cunata:candidate_name') || candidateName;
    }
    catch { /* Optional preference. */ }
    let startCtrl = null;
    const roleShell = doc && typeof root.prepend === 'function' ? mountRoleShell(root, router, () => {
        try {
            localStorage.removeItem('cunata:candidate_name');
            localStorage.removeItem('cunata:student_name');
            localStorage.removeItem('cunata:last_candidate_name');
            localStorage.removeItem('cunata:student_area_name');
        }
        catch { }
        candidateName = 'Thí sinh tự do';
        if (startCtrl && typeof startCtrl.resetName === 'function') {
            try {
                startCtrl.resetName();
            }
            catch { }
        }
        router.navigate('student');
        root.querySelector('#startName')?.focus();
    }, (role) => {
        if (role === 'student') {
            const startScr = root.querySelector('#startScreen');
            if (startScr)
                startScr.style.display = 'block';
            root.querySelector('#startName')?.focus();
        }
    }) : null;
    let teacherCtrl = null;
    let onAreaRoute = null;
    let responses = Object.create(null);
    let presentationOrder = null;
    let isSubmitted = false;
    let scoredResult = null;
    let startedAt = now();
    let submittedAt = null;
    let finalRecord = null;
    const durationMin = currentExam.settings?.durationMinutes ?? 50;
    let deadline = startedAt + durationMin * 60 * 1000;
    let timerIntervalId = null;
    let controller = null;
    let swRegistration = null;
    let isSingleExamFixture = false;
    let isSingleExamStarted = false;
    const notifyWorkerAttemptState = (active) => {
        try {
            if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
                if (navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({
                        type: 'SET_ATTEMPT_ACTIVE',
                        active,
                    });
                }
                if (swRegistration?.waiting) {
                    swRegistration.waiting.postMessage({
                        type: 'SET_ATTEMPT_ACTIVE',
                        active,
                    });
                }
                if (swRegistration?.installing) {
                    swRegistration.installing.postMessage({
                        type: 'SET_ATTEMPT_ACTIVE',
                        active,
                    });
                }
            }
        }
        catch (_) { }
    };
    const activateWaitingWorker = async () => {
        try {
            let waiting = swRegistration?.waiting;
            if (!waiting && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.getRegistration();
                waiting = reg?.waiting;
            }
            if (waiting) {
                await new Promise((resolve) => {
                    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
                        resolve();
                        return;
                    }
                    let resolved = false;
                    const done = () => {
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timer);
                            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
                            navigator.serviceWorker.removeEventListener('message', onSwMessage);
                            resolve();
                        }
                    };
                    const timer = setTimeout(done, 1500);
                    const onControllerChange = () => done();
                    const onSwMessage = (ev) => {
                        if (ev?.data?.type === 'UPDATE_DEFERRED_REPORT') {
                            done();
                        }
                    };
                    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
                    navigator.serviceWorker.addEventListener('message', onSwMessage);
                    waiting.postMessage({ type: 'SKIP_WAITING' });
                });
            }
        }
        catch (_) { }
    };
    const showStorageUnavailableWarning = () => {
        let banner = root.querySelector('#storageWarningBanner');
        if (!banner) {
            banner = (root.ownerDocument || document).createElement('div');
            banner.id = 'storageWarningBanner';
            banner.className = 'storage-warning-banner';
            if (typeof banner.setAttribute === 'function') {
                banner.setAttribute('role', 'alert');
            }
            banner.style.cssText = 'background: var(--c-surface-2); border: 1px solid var(--c-danger); color: var(--c-danger); padding: 0.5rem 1rem; margin: 0.5rem auto; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; font-size: 0.875rem; max-width: 960px;';
            const msgSpan = (root.ownerDocument || document).createElement('span');
            msgSpan.textContent = 'Cảnh báo STORAGE_UNAVAILABLE: Lưu trữ IndexedDB không khả dụng. Trạng thái chỉ lưu tạm.';
            banner.appendChild(msgSpan);
            const btnExport = (root.ownerDocument || document).createElement('button');
            btnExport.type = 'button';
            btnExport.id = 'btnEmergencyExport';
            btnExport.className = 'btn-secondary';
            btnExport.style.cssText = 'font-size: 0.75rem; padding: 0.25rem 0.5rem; margin-left: 1rem; cursor: pointer;';
            btnExport.textContent = 'Tải bản sao khẩn cấp';
            btnExport.onclick = () => {
                const exportPayload = {
                    schemaVersion: 'web-attempt-v1',
                    examId: currentExam?.examId ?? '',
                    examVersionId: currentExam?.examVersionId ?? '',
                    attemptId,
                    candidateName,
                    responses,
                    startedAt,
                    deadline,
                    exportedAt: now(),
                };
                const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = (root.ownerDocument || document).createElement('a');
                a.href = url;
                a.download = `emergency-backup-${attemptId}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            };
            banner.appendChild(btnExport);
            if (examWrapper && examWrapper.parentNode && typeof examWrapper.parentNode.insertBefore === 'function') {
                examWrapper.parentNode.insertBefore(banner, examWrapper);
            }
            else if (typeof root.prepend === 'function') {
                root.prepend(banner);
            }
            else if (typeof root.appendChild === 'function') {
                root.appendChild(banner);
            }
        }
    };
    if (!isStorageAvailable) {
        if (syncStatus) {
            if (syncStatus.classList && typeof syncStatus.classList.add === 'function') {
                syncStatus.classList.add('status-failed', 'status-local-error');
            }
            syncStatus.title = 'Lưu trữ không khả dụng: STORAGE_UNAVAILABLE';
        }
        if (syncText) {
            syncText.textContent = 'Chưa lưu';
        }
        showStorageUnavailableWarning();
        if (announcer && typeof announcer.announce === 'function') {
            announcer.announce('Lưu trữ không khả dụng: STORAGE_UNAVAILABLE', 'assertive');
        }
    }
    let activeReportModel = null;
    let showReport;
    const showIntegrityError = (err, record) => {
        const startScr = root.querySelector('#startScreen');
        if (startScr)
            startScr.style.display = 'none';
        if (examWrapper)
            examWrapper.style.display = 'none';
        if (reportWrapper)
            reportWrapper.style.display = '';
        if (btnSubmit)
            btnSubmit.style.display = 'none';
        if (candidateInput) {
            candidateInput.readOnly = true;
            candidateInput.setAttribute('readonly', 'readonly');
            candidateInput.disabled = true;
        }
        router.navigate('report', { attemptId });
        if (announcer && typeof announcer.announce === 'function') {
            announcer.announce(`Lỗi toàn vẹn dữ liệu: ${err.code} - ${err.message}`, 'assertive');
        }
        if (syncStatus) {
            if (syncStatus.classList && typeof syncStatus.classList.add === 'function') {
                syncStatus.classList.add('status-failed');
            }
            syncStatus.title = `Lỗi toàn vẹn dữ liệu: ${err.code}`;
        }
        if (syncText) {
            syncText.textContent = `Lỗi: ${err.code}`;
        }
        const summaryGrid = root.querySelector('.summary-cards-grid');
        if (summaryGrid)
            summaryGrid.style.display = 'none';
        const reportActionsBar = root.querySelector('.report-actions-bar');
        if (reportActionsBar)
            reportActionsBar.style.display = 'none';
        const reviewQuestionsList = root.querySelector('#reviewQuestionsList');
        if (reviewQuestionsList)
            reviewQuestionsList.style.display = 'none';
        const historySection = root.querySelector('#attemptHistorySection');
        if (historySection)
            historySection.style.display = 'none';
        const reportSubtitle = root.querySelector('#reportSubtitle');
        if (reportSubtitle) {
            reportSubtitle.textContent = `Lỗi toàn vẹn dữ liệu: ${err.code}`;
            reportSubtitle.style.color = 'var(--danger)';
        }
        let errBanner = root.querySelector('#integrityErrorBanner');
        if (!errBanner) {
            errBanner = (root.ownerDocument || document).createElement('div');
            errBanner.id = 'integrityErrorBanner';
            errBanner.className = 'integrity-error-banner';
            if (typeof errBanner.setAttribute === 'function') {
                errBanner.setAttribute('role', 'alert');
            }
            errBanner.style.cssText = 'background: var(--c-surface-2); border: 2px solid var(--c-danger); color: var(--c-danger); padding: 1rem 1.5rem; margin: 1rem auto; border-radius: 8px; max-width: 960px;';
            const errHeader = (root.ownerDocument || document).createElement('h2');
            errHeader.style.cssText = 'margin: 0 0 0.5rem 0; font-size: 1.125rem; font-weight: 700;';
            errHeader.textContent = `Lỗi toàn vẹn dữ liệu: ${err.code}`;
            errBanner.appendChild(errHeader);
            const errMsg = (root.ownerDocument || document).createElement('p');
            errMsg.id = 'integrityErrorMessage';
            errMsg.style.cssText = 'margin: 0 0 1rem 0; font-size: 0.875rem;';
            errMsg.textContent = err.message;
            errBanner.appendChild(errMsg);
            const errCode = (root.ownerDocument || document).createElement('p');
            errCode.style.cssText = 'margin: 0 0 1rem 0; font-size: 0.875rem;';
            errCode.innerHTML = `Mã lỗi: <code>${escapeHtml(err.code)}</code>`;
            errBanner.appendChild(errCode);
            const btnGroup = (root.ownerDocument || document).createElement('div');
            btnGroup.style.cssText = 'display: flex; gap: 0.5rem; align-items: center;';
            const btnExport = (root.ownerDocument || document).createElement('button');
            btnExport.type = 'button';
            btnExport.id = 'btnExportQuarantine';
            btnExport.className = 'btn-secondary';
            btnExport.style.cssText = 'font-size: 0.8125rem; padding: 0.4rem 0.8rem; cursor: pointer;';
            btnExport.textContent = 'Tải bản ghi bị cách ly (Quarantine / Phục hồi)';
            btnExport.onclick = () => {
                const payload = record ?? {
                    examId: currentExam?.examId,
                    examVersionId: currentExam?.examVersionId,
                    attemptId,
                    candidateName,
                    responses,
                    quarantineError: err,
                };
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = (root.ownerDocument || document).createElement('a');
                a.href = url;
                a.download = `quarantine-attempt-${attemptId}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            };
            btnGroup.appendChild(btnExport);
            errBanner.appendChild(btnGroup);
            const targetContainer = root.querySelector('#reportView') || reportWrapper || root;
            if (targetContainer && typeof targetContainer.prepend === 'function') {
                targetContainer.prepend(errBanner);
            }
            else if (targetContainer && typeof targetContainer.insertBefore === 'function' && targetContainer.firstChild) {
                targetContainer.insertBefore(errBanner, targetContainer.firstChild);
            }
            else if (targetContainer) {
                targetContainer.appendChild(errBanner);
            }
        }
        else {
            const errMsg = errBanner.querySelector('#integrityErrorMessage');
            if (errMsg)
                errMsg.textContent = err.message;
        }
    };
    let currentClassCode = undefined;
    let currentAssignmentId = undefined;
    let currentDueAt = undefined;
    let currentOpenAt = undefined;
    let reportRestartIntervalId = null;
    const resolveAssignmentSchedule = () => {
        if (currentDueAt || currentOpenAt) {
            return { openAt: currentOpenAt, dueAt: currentDueAt };
        }
        const examAny = currentExam;
        if (examAny?.dueAt || examAny?.due_at || examAny?.openAt || examAny?.open_at) {
            const due = examAny.dueAt || examAny.due_at;
            const open = examAny.openAt || examAny.open_at;
            if (due || open) {
                if (!currentDueAt && due)
                    currentDueAt = due;
                if (!currentOpenAt && open)
                    currentOpenAt = open;
                return { openAt: currentOpenAt, dueAt: currentDueAt };
            }
        }
        const finalAny = finalRecord;
        if (finalAny &&
            finalRecord &&
            finalRecord.examId === currentExam.examId &&
            finalRecord.examVersionId === currentExam.examVersionId) {
            const matchesAssignment = currentAssignmentId
                ? (finalAny.assignmentId === currentAssignmentId || finalAny.assignment_id === currentAssignmentId)
                : (!finalAny.assignmentId && !finalAny.assignment_id);
            if (matchesAssignment && (finalAny?.dueAt || finalAny?.due_at || finalAny?.openAt || finalAny?.open_at)) {
                const due = finalAny.dueAt || finalAny.due_at;
                const open = finalAny.openAt || finalAny.open_at;
                if (due || open) {
                    if (!currentDueAt && due)
                        currentDueAt = due;
                    if (!currentOpenAt && open)
                        currentOpenAt = open;
                    return { openAt: currentOpenAt, dueAt: currentDueAt };
                }
            }
        }
        try {
            if (typeof sessionStorage !== 'undefined') {
                const raw = sessionStorage.getItem('cunata:active_assignment') || sessionStorage.getItem('cunata_active_assignment');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.examId && parsed.examId === currentExam.examId) {
                        if (!currentAssignmentId || !parsed.assignmentId || parsed.assignmentId === currentAssignmentId) {
                            const due = parsed.dueAt || parsed.due_at;
                            const open = parsed.openAt || parsed.open_at;
                            if (due || open) {
                                if (!currentDueAt && due)
                                    currentDueAt = due;
                                if (!currentOpenAt && open)
                                    currentOpenAt = open;
                                return { openAt: currentOpenAt, dueAt: currentDueAt };
                            }
                        }
                    }
                }
            }
        }
        catch { }
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem('cunata:active_assignment') || localStorage.getItem('cunata_active_assignment');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.examId && parsed.examId === currentExam.examId) {
                        if (!currentAssignmentId || !parsed.assignmentId || parsed.assignmentId === currentAssignmentId) {
                            const due = parsed.dueAt || parsed.due_at;
                            const open = parsed.openAt || parsed.open_at;
                            if (due || open) {
                                if (!currentDueAt && due)
                                    currentDueAt = due;
                                if (!currentOpenAt && open)
                                    currentOpenAt = open;
                                return { openAt: currentOpenAt, dueAt: currentDueAt };
                            }
                        }
                    }
                }
            }
        }
        catch { }
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem('cunata:classes');
                if (raw) {
                    const classes = JSON.parse(raw);
                    if (Array.isArray(classes)) {
                        for (const c of classes) {
                            if (currentClassCode && c.code && c.code.trim().toUpperCase() !== currentClassCode.trim().toUpperCase()) {
                                continue;
                            }
                            if (Array.isArray(c.assignments)) {
                                for (const a of c.assignments) {
                                    if (currentAssignmentId && a.assignmentId === currentAssignmentId) {
                                        if (!currentDueAt && a.dueAt)
                                            currentDueAt = a.dueAt;
                                        if (!currentOpenAt && a.openAt)
                                            currentOpenAt = a.openAt;
                                        return { openAt: currentOpenAt, dueAt: currentDueAt };
                                    }
                                    if (currentClassCode && !currentAssignmentId && a.examId === currentExam.examId) {
                                        if (!currentDueAt && a.dueAt)
                                            currentDueAt = a.dueAt;
                                        if (!currentOpenAt && a.openAt)
                                            currentOpenAt = a.openAt;
                                        return { openAt: currentOpenAt, dueAt: currentDueAt };
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        catch { }
        return null;
    };
    const activeTimers = new Map();
    const drainAttempt = async (key) => {
        if (!appsScriptUrl || !appsScriptUrl.trim() || !storage)
            return;
        const keyStr = `${key.examId}::${key.examVersionId}::${key.attemptId}`;
        if (activeTimers.has(keyStr)) {
            clearTimeout(activeTimers.get(keyStr));
            activeTimers.delete(keyStr);
        }
        const isCurrent = () => attemptId === key.attemptId;
        const outboxRes = await storage.getOutbox(key);
        if (!outboxRes.ok || !outboxRes.value)
            return;
        const currentOutbox = outboxRes.value;
        if (currentOutbox.state === 'server_confirmed') {
            if (isCurrent() && syncText)
                syncText.textContent = 'Đã gửi';
            return;
        }
        if (currentOutbox.state === 'failed' || currentOutbox.retryCount >= 5) {
            if (isCurrent() && syncText)
                syncText.textContent = 'Chưa gửi được — sẽ thử lại';
            return;
        }
        const currentNow = now();
        if (currentOutbox.nextRetryAt !== null && currentNow < currentOutbox.nextRetryAt) {
            if (isCurrent() && syncText)
                syncText.textContent = 'Chưa gửi được — sẽ thử lại';
            const delay = Math.max(100, currentOutbox.nextRetryAt - currentNow);
            const timer = setTimeout(() => {
                activeTimers.delete(keyStr);
                void drainAttempt(key);
            }, delay);
            activeTimers.set(keyStr, timer);
            return;
        }
        if (isCurrent() && syncText)
            syncText.textContent = 'Đang gửi...';
        const transport = createAppsScriptCollectorPort(appsScriptUrl.trim(), options?.fetch, backendContentType);
        const drainRes = await drainOutbox(key, {
            storage,
            transport,
            now,
        });
        if (drainRes.ok) {
            if (isCurrent() && syncText) {
                syncText.textContent = 'Đã gửi';
            }
            return;
        }
        const err = drainRes.error;
        if (isCurrent() && syncText) {
            if (err.code === 'PAST_DUE') {
                syncText.textContent = 'Nộp sau hạn — giáo viên chưa nhận';
            }
            else if (err.code === 'NOT_OPEN') {
                syncText.textContent = 'Bài thi chưa đến giờ mở';
            }
            else if (err.code === 'PAYLOAD_CONFLICT') {
                syncText.textContent = 'Lỗi xung đột dữ liệu nộp bài';
            }
            else {
                syncText.textContent = 'Chưa gửi được — sẽ thử lại';
            }
        }
        const updatedRes = await storage.getOutbox(key);
        if (updatedRes.ok && updatedRes.value) {
            const updated = updatedRes.value;
            if (updated.state === 'queued' && updated.nextRetryAt !== null && updated.retryCount < 5) {
                const delay = Math.max(100, updated.nextRetryAt - now());
                const timer = setTimeout(() => {
                    activeTimers.delete(keyStr);
                    void drainAttempt(key);
                }, delay);
                activeTimers.set(keyStr, timer);
            }
        }
    };
    const syncOutboxStateOnFinal = async (record, isDurable) => {
        if (!appsScriptUrl || !appsScriptUrl.trim() || !storage) {
            if (syncText)
                syncText.textContent = isDurable ? 'Đã nộp & lưu cục bộ' : 'Chưa lưu';
            return;
        }
        const key = {
            examId: record.examId,
            examVersionId: record.examVersionId,
            attemptId: record.attemptId,
        };
        try {
            const outboxRes = await storage.getOutbox(key);
            const outbox = outboxRes.ok ? outboxRes.value : null;
            if (outbox) {
                if (outbox.state === 'server_confirmed') {
                    if (syncText)
                        syncText.textContent = 'Đã gửi';
                    return;
                }
                if (outbox.state === 'local_saved') {
                    await enqueue(record, storage, appsScriptUrl.trim());
                    void drainAttempt(key);
                    return;
                }
                if (outbox.state === 'queued' || outbox.state === 'sending') {
                    void drainAttempt(key);
                    return;
                }
                if (outbox.state === 'failed') {
                    if (syncText)
                        syncText.textContent = 'Chưa gửi được — sẽ thử lại';
                    return;
                }
            }
            else {
                await enqueue(record, storage, appsScriptUrl.trim());
                void drainAttempt(key);
                return;
            }
        }
        catch {
            if (syncText)
                syncText.textContent = isDurable ? 'Đã nộp & lưu cục bộ' : 'Chưa lưu';
        }
    };
    const sweepPendingOutbox = async () => {
        if (!appsScriptUrl || !appsScriptUrl.trim() || !storage)
            return;
        try {
            if (typeof storage.listOutbox === 'function') {
                const listRes = await storage.listOutbox();
                if (listRes.ok && Array.isArray(listRes.value)) {
                    for (const item of listRes.value) {
                        if (item.state === 'queued' || item.state === 'sending' || item.state === 'local_saved') {
                            void drainAttempt({
                                examId: item.examId,
                                examVersionId: item.examVersionId,
                                attemptId: item.attemptId,
                            });
                        }
                    }
                }
            }
        }
        catch (_) { }
    };
    const adoptFinalRecord = (record, isDurable = true) => {
        attemptId = record.attemptId;
        loadedExamId = record.examId;
        isSubmitted = true;
        notifyWorkerAttemptState(false);
        void activateWaitingWorker();
        if (timerIntervalId)
            clearInterval(timerIntervalId);
        if (record.class_code || record.classCode) {
            currentClassCode = (record.class_code || record.classCode).trim().toUpperCase();
        }
        else {
            currentClassCode = undefined;
        }
        if (record.assignment_id || record.assignmentId) {
            currentAssignmentId = record.assignment_id || record.assignmentId;
        }
        else {
            currentAssignmentId = undefined;
        }
        if (record.dueAt || record.due_at) {
            currentDueAt = record.dueAt || record.due_at;
        }
        else {
            currentDueAt = undefined;
        }
        if (record.openAt || record.open_at) {
            currentOpenAt = record.openAt || record.open_at;
        }
        else {
            currentOpenAt = undefined;
        }
        resolveAssignmentSchedule();
        if (record.submittedAt) {
            submittedAt = record.submittedAt;
        }
        finalRecord = record;
        if (record.candidateName)
            candidateName = record.candidateName;
        if (candidateInput) {
            candidateInput.value = candidateName;
            candidateInput.readOnly = true;
            candidateInput.setAttribute('readonly', 'readonly');
            candidateInput.disabled = true;
        }
        if (record.examSnapshot)
            currentExam = record.examSnapshot;
        if (record.startedAt)
            startedAt = record.startedAt;
        if (record.deadline)
            deadline = record.deadline;
        if (record.presentationOrder)
            presentationOrder = record.presentationOrder;
        if (record.responses) {
            responses = fromDomainResponses(record.responses);
        }
        const repRes = buildReport(record, now());
        if (!repRes.ok) {
            activeReportModel = null;
            scoredResult = null;
            showIntegrityError(repRes.error, record);
            return;
        }
        activeReportModel = repRes.value;
        scoredResult = scoreLegacyAttempt(currentExam, responses);
        const isReallyDurable = isDurable && isStorageAvailable && !record.degradedRescueMirror;
        void syncOutboxStateOnFinal(record, isReallyDurable);
        if (!isReallyDurable) {
            showStorageUnavailableWarning();
        }
        if (typeof showReport === 'function') {
            showReport(record, activeReportModel ?? undefined);
        }
    };
    const dirtyQuestionIds = new Set();
    let pendingSaveCount = 0;
    let lastSaveOk = true;
    function createDomainResponseForQuestion(exam, qid, resMap) {
        const q = exam.questions.find((x) => x.questionVersionId === qid);
        if (!q)
            return null;
        const val = resMap[qid];
        if (val === undefined)
            return null;
        if (q.kind === 'I') {
            return {
                kind: 'I',
                questionVersionId: q.questionVersionId,
                selectedOptionId: typeof val === 'string' && val ? val : null,
            };
        }
        else if (q.kind === 'II') {
            const answers = (q.statements || []).map((st) => ({
                statementId: st.statementId,
                value: val && typeof val === 'object' && typeof val[st.statementId] === 'boolean' ? val[st.statementId] : null,
            }));
            return {
                kind: 'II',
                questionVersionId: q.questionVersionId,
                answers,
            };
        }
        else if (q.kind === 'III') {
            return {
                kind: 'III',
                questionVersionId: q.questionVersionId,
                raw: typeof val === 'string' && val.length > 0 ? val : null,
            };
        }
        return null;
    }
    // Save State helper
    const saveStateToStorage = async (domainResponse, knownSaveOk) => {
        if (domainResponse) {
            dirtyQuestionIds.add(domainResponse.questionVersionId);
        }
        pendingSaveCount++;
        if (syncText && !isSubmitted) {
            syncText.textContent = 'Đang lưu...';
        }
        let saveOk = knownSaveOk ?? false;
        try {
            // 1. Submit to controller (writes to IndexedDB attempts store)
            if (isStorageAvailable && controller && !isSubmitted) {
                if (dirtyQuestionIds.size > 0) {
                    const idsToPersist = Array.from(dirtyQuestionIds);
                    let allOk = true;
                    for (const qid of idsToPersist) {
                        const resp = createDomainResponseForQuestion(currentExam, qid, responses);
                        if (!resp) {
                            dirtyQuestionIds.delete(qid);
                            continue;
                        }
                        try {
                            const res = await controller.answer(resp);
                            if (res.ok) {
                                dirtyQuestionIds.delete(qid);
                            }
                            else if (res.error.code === 'ATTEMPT_FINALIZED' && storage) {
                                const loadRes = await storage.load({
                                    examId: currentExam.examId,
                                    examVersionId: currentExam.examVersionId,
                                    attemptId,
                                });
                                if (loadRes.ok && loadRes.value && loadRes.value.phase === 'final') {
                                    adoptFinalRecord(loadRes.value);
                                    return;
                                }
                                allOk = false;
                                break;
                            }
                            else {
                                allOk = false;
                                break;
                            }
                        }
                        catch {
                            allOk = false;
                            break;
                        }
                    }
                    saveOk = allOk && dirtyQuestionIds.size === 0;
                }
                else if (knownSaveOk === undefined) {
                    saveOk = isStorageAvailable;
                }
            }
            else if (isStorageAvailable && !controller && storage && !isSubmitted) {
                try {
                    const domainExam = toDomainExam(currentExam);
                    const domResponses = toDomainResponses(currentExam, attemptId, responses);
                    const record = {
                        schemaVersion: 'web-attempt-v1',
                        examId: currentExam.examId,
                        examVersionId: currentExam.examVersionId,
                        attemptId,
                        revision: 1,
                        candidateName,
                        examSnapshot: currentExam,
                        presentationOrder: presentationOrder || createPresentationOrder(domainExam, currentExam.settings, attemptId),
                        responses: domResponses,
                        startedAt,
                        deadline,
                        phase: 'draft',
                        submittedAt: null,
                        scoreDTO: null,
                        ...(currentClassCode ? { class_code: currentClassCode, classCode: currentClassCode } : {}),
                        ...(currentAssignmentId ? { assignment_id: currentAssignmentId, assignmentId: currentAssignmentId } : {}),
                        ...(currentDueAt ? { dueAt: currentDueAt, due_at: currentDueAt } : {}),
                        ...(currentOpenAt ? { openAt: currentOpenAt, open_at: currentOpenAt } : {}),
                    };
                    const cr = await storage.saveDraft(record, 1);
                    if (cr.ok) {
                        dirtyQuestionIds.clear();
                        saveOk = true;
                    }
                    else if (cr.error.code === 'STORAGE_CONFLICT') {
                        const loadRes = await storage.load(record);
                        if (loadRes.ok && loadRes.value && loadRes.value.phase === 'final') {
                            adoptFinalRecord(loadRes.value);
                            return;
                        }
                        if (loadRes.ok && !loadRes.value) {
                            const c2 = await storage.create(record);
                            if (c2.ok) {
                                dirtyQuestionIds.clear();
                                saveOk = true;
                            }
                            else {
                                saveOk = false;
                            }
                        }
                        else {
                            saveOk = false;
                        }
                    }
                    else {
                        const c2 = await storage.create(record);
                        if (c2.ok) {
                            dirtyQuestionIds.clear();
                            saveOk = true;
                        }
                        else {
                            saveOk = false;
                        }
                    }
                }
                catch {
                    saveOk = false;
                }
            }
            else if (!isStorageAvailable) {
                saveOk = false;
            }
            // 2. Check if another session finalized in durable storage (NOT from localStorage mirror!)
            if (isStorageAvailable && storage && !isSubmitted && !controller) {
                try {
                    const loadRes = await storage.load({
                        examId: currentExam.examId,
                        examVersionId: currentExam.examVersionId,
                        attemptId,
                    });
                    if (loadRes.ok && loadRes.value && loadRes.value.phase === 'final') {
                        adoptFinalRecord(loadRes.value);
                        return;
                    }
                }
                catch (_) { }
            }
            // 3. Mirror payload to localStorage (rescue mirror)
            if (typeof localStorage !== 'undefined') {
                try {
                    const key = getStorageKey(currentExam, { attemptId });
                    const finalKey = getFinalStorageKey(currentExam, { attemptId });
                    const pointerKey = 'cunata:active_attempt:' + encodeURIComponent(currentExam.examId) + ':' + encodeURIComponent(currentExam.examVersionId);
                    localStorage.setItem(pointerKey, attemptId);
                    const payload = {
                        examId: currentExam.examId,
                        examVersionId: currentExam.examVersionId,
                        attemptId,
                        candidateName,
                        responses,
                        presentationOrder,
                        startedAt,
                        deadline,
                        submitted: isSubmitted,
                        scoreResult: scoredResult,
                        degradedRescueMirror: !isStorageAvailable,
                    };
                    const jsonStr = JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
                    localStorage.setItem(key, jsonStr);
                    if (isSubmitted) {
                        localStorage.setItem(finalKey, jsonStr);
                    }
                }
                catch (lsErr) {
                    // localStorage write error
                }
            }
        }
        finally {
            pendingSaveCount--;
            if (saveOk && dirtyQuestionIds.size === 0) {
                lastSaveOk = true;
            }
            else {
                lastSaveOk = false;
            }
            if (syncText && !isSubmitted) {
                if (pendingSaveCount === 0) {
                    syncText.textContent = (lastSaveOk && dirtyQuestionIds.size === 0 && isStorageAvailable) ? 'Đã lưu' : 'Chưa lưu';
                }
            }
        }
    };
    // Palette rendering
    const updatePalette = () => {
        if (!paletteProgress)
            return;
        const questionsToRender = [];
        if (presentationOrder && Array.isArray(presentationOrder.questionOrder) && presentationOrder.questionOrder.length > 0) {
            for (const qId of presentationOrder.questionOrder) {
                const found = currentExam.questions.find((q) => q.questionVersionId === qId);
                if (found)
                    questionsToRender.push(found);
            }
        }
        if (questionsToRender.length === 0) {
            questionsToRender.push(...currentExam.questions);
        }
        const total = questionsToRender.length;
        let answered = 0;
        for (const q of questionsToRender) {
            const res = responses[q.questionVersionId];
            if (q.kind === 'I' && typeof res === 'string' && res)
                answered++;
            else if (q.kind === 'II' && res && typeof res === 'object' && Object.keys(res).length === 4)
                answered++;
            else if (q.kind === 'III' && typeof res === 'string' && res.length > 0)
                answered++;
        }
        const isShuffled = !!(presentationOrder && presentationOrder.seed && presentationOrder.seed !== 'original');
        paletteProgress.textContent = `Đã làm: ${answered}/${total} câu${isShuffled ? ' · Trộn' : ''}`;
        if (paletteGrid) {
            paletteGrid.innerHTML = '';
            questionsToRender.forEach((q, idx) => {
                const docObj = root.ownerDocument || document;
                const btn = docObj.createElement('button');
                btn.type = 'button';
                btn.className = 'palette-btn';
                btn.textContent = String(idx + 1);
                const res = responses[q.questionVersionId];
                let isDone = false;
                if (q.kind === 'I' && res)
                    isDone = true;
                else if (q.kind === 'II' && res && Object.keys(res).length === 4)
                    isDone = true;
                else if (q.kind === 'III' && typeof res === 'string' && res.length > 0)
                    isDone = true;
                if (isDone)
                    btn.classList.add('answered');
                btn.setAttribute('aria-pressed', isDone ? 'true' : 'false');
                btn.setAttribute('aria-label', `Câu ${idx + 1} (${isDone ? 'Đã làm' : 'Chưa làm'})`);
                btn.addEventListener('click', () => {
                    const card = root.querySelector(`[id="qcard-${q.questionVersionId}"]`);
                    if (card && typeof card.scrollIntoView === 'function') {
                        card.scrollIntoView({ block: 'center' });
                    }
                });
                paletteGrid.appendChild(btn);
            });
        }
    };
    // Render questions into #examPane
    const renderExamPane = () => {
        if (!examPane)
            return;
        examPane.innerHTML = '';
        const docObj = root.ownerDocument || document;
        const questionsToRender = [];
        if (presentationOrder && Array.isArray(presentationOrder.questionOrder) && presentationOrder.questionOrder.length > 0) {
            for (const qId of presentationOrder.questionOrder) {
                const found = currentExam.questions.find((q) => q.questionVersionId === qId);
                if (found)
                    questionsToRender.push(found);
            }
        }
        if (questionsToRender.length === 0) {
            questionsToRender.push(...currentExam.questions);
        }
        questionsToRender.forEach((q, qIdx) => {
            const card = docObj.createElement('section');
            card.className = 'question-card';
            card.id = `qcard-${q.questionVersionId}`;
            const cardHeader = docObj.createElement('div');
            cardHeader.className = 'question-card-header';
            const titleSpan = docObj.createElement('span');
            titleSpan.className = 'question-title';
            titleSpan.textContent = q.title || `Câu ${qIdx + 1}`;
            cardHeader.appendChild(titleSpan);
            card.appendChild(cardHeader);
            const stem = docObj.createElement('div');
            stem.className = 'question-stem';
            stem.innerHTML = renderMathText(q.content);
            card.appendChild(stem);
            if (q.kind === 'I') {
                const optGrid = docObj.createElement('div');
                optGrid.className = 'option-grid';
                optGrid.setAttribute('role', 'radiogroup');
                optGrid.setAttribute('aria-label', `Câu hỏi ${qIdx + 1}: ${q.title || ''}`);
                let opts = q.options || [];
                if (presentationOrder && Array.isArray(presentationOrder.optionOrder)) {
                    const entry = presentationOrder.optionOrder.find((e) => e.questionVersionId === q.questionVersionId);
                    const optIds = entry?.optionIds || entry?.optionOrder;
                    if (Array.isArray(optIds) && optIds.length > 0) {
                        const reordered = optIds
                            .map((id) => opts.find((o) => o.optionId === id))
                            .filter((o) => !!o);
                        if (reordered.length === opts.length) {
                            opts = reordered;
                        }
                    }
                }
                const selectedOptId = responses[q.questionVersionId];
                opts.forEach((opt, optIdx) => {
                    const optCard = docObj.createElement('div');
                    const isSelected = selectedOptId === opt.optionId;
                    optCard.className = 'option-card' + (isSelected ? ' selected' : '');
                    setAttr(optCard, 'role', 'radio');
                    setAttr(optCard, 'aria-checked', isSelected ? 'true' : 'false');
                    setAttr(optCard, 'data-option-id', opt.optionId);
                    setAttr(optCard, 'data-qid', q.questionVersionId);
                    setAttr(optCard, 'tabindex', isSelected || (!selectedOptId && optIdx === 0) ? '0' : '-1');
                    const letter = ['A', 'B', 'C', 'D'][optIdx] || opt.label || 'A';
                    optCard.innerHTML = `<div class="option-letter">${escapeHtml(letter)}</div><div class="option-text">${renderMathText(opt.text)}</div>`;
                    const updateOptionUI = (chosenOptId, shouldFocus = false) => {
                        const qCard = root.querySelector(`[id="qcard-${q.questionVersionId}"]`);
                        if (qCard) {
                            const allOptCards = qCard.querySelectorAll('.option-card');
                            allOptCards.forEach((c) => {
                                const optId = c.getAttribute('data-option-id');
                                const isMatch = optId === chosenOptId;
                                if (isMatch) {
                                    c.classList.add('selected');
                                    setAttr(c, 'aria-checked', 'true');
                                    setAttr(c, 'tabindex', '0');
                                }
                                else {
                                    c.classList.remove('selected');
                                    setAttr(c, 'aria-checked', 'false');
                                    setAttr(c, 'tabindex', '-1');
                                }
                            });
                        }
                        updatePalette();
                        if (shouldFocus) {
                            const targetCard = root.querySelector(`[data-qid="${q.questionVersionId}"][data-option-id="${chosenOptId}"]`);
                            if (targetCard && typeof targetCard.focus === 'function') {
                                targetCard.focus();
                            }
                        }
                    };
                    const selectThis = async (shouldFocus = false) => {
                        if (isSubmitted)
                            return;
                        responses[q.questionVersionId] = opt.optionId;
                        updateOptionUI(opt.optionId, shouldFocus);
                        await saveStateToStorage({
                            kind: 'I',
                            questionVersionId: q.questionVersionId,
                            selectedOptionId: opt.optionId,
                        });
                    };
                    optCard.addEventListener('click', () => selectThis(false));
                    optCard.addEventListener('keydown', (e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                            if (typeof e.preventDefault === 'function')
                                e.preventDefault();
                            selectThis(true);
                        }
                        else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                            if (typeof e.preventDefault === 'function')
                                e.preventDefault();
                            const nextOpt = opts[(optIdx + 1) % opts.length];
                            responses[q.questionVersionId] = nextOpt.optionId;
                            updateOptionUI(nextOpt.optionId, true);
                            saveStateToStorage({
                                kind: 'I',
                                questionVersionId: q.questionVersionId,
                                selectedOptionId: nextOpt.optionId,
                            });
                        }
                        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                            if (typeof e.preventDefault === 'function')
                                e.preventDefault();
                            const prevOpt = opts[(optIdx - 1 + opts.length) % opts.length];
                            responses[q.questionVersionId] = prevOpt.optionId;
                            updateOptionUI(prevOpt.optionId, true);
                            saveStateToStorage({
                                kind: 'I',
                                questionVersionId: q.questionVersionId,
                                selectedOptionId: prevOpt.optionId,
                            });
                        }
                    });
                    optGrid.appendChild(optCard);
                });
                card.appendChild(optGrid);
            }
            else if (q.kind === 'II') {
                const table = docObj.createElement('div');
                table.className = 'statement-table';
                const stmts = q.statements || [];
                const userSts = responses[q.questionVersionId] || {};
                stmts.forEach((st) => {
                    const row = docObj.createElement('div');
                    row.className = 'statement-row';
                    const userVal = userSts[st.statementId];
                    const isTrueSelected = userVal === true;
                    const isFalseSelected = userVal === false;
                    row.innerHTML = `<div class="statement-label">${escapeHtml(st.label || '')})</div><div class="statement-text">${renderMathText(st.text || '')}</div><div class="tf-toggle-group" role="group" aria-label="Ý ${escapeHtml(st.label || '')}: ${escapeHtml(st.text || '')}"><button type="button" class="tf-btn ${isTrueSelected ? 'selected-true selected' : ''}" data-val="true" aria-pressed="${isTrueSelected ? 'true' : 'false'}">Đúng</button><button type="button" class="tf-btn ${isFalseSelected ? 'selected-false selected' : ''}" data-val="false" aria-pressed="${isFalseSelected ? 'true' : 'false'}">Sai</button></div>`;
                    const btnT = row.querySelector('.tf-btn[data-val="true"]');
                    const btnF = row.querySelector('.tf-btn[data-val="false"]');
                    if (btnT) {
                        btnT.addEventListener('click', async () => {
                            if (isSubmitted)
                                return;
                            if (!responses[q.questionVersionId])
                                responses[q.questionVersionId] = {};
                            responses[q.questionVersionId][st.statementId] = true;
                            btnT.classList.add('selected-true', 'selected');
                            setAttr(btnT, 'aria-pressed', 'true');
                            if (btnF) {
                                btnF.classList.remove('selected-false', 'selected');
                                setAttr(btnF, 'aria-pressed', 'false');
                            }
                            updatePalette();
                            const ansList = stmts.map((s) => ({
                                statementId: s.statementId,
                                value: responses[q.questionVersionId][s.statementId] ?? null,
                            }));
                            await saveStateToStorage({
                                kind: 'II',
                                questionVersionId: q.questionVersionId,
                                answers: ansList,
                            });
                        });
                    }
                    if (btnF) {
                        btnF.addEventListener('click', async () => {
                            if (isSubmitted)
                                return;
                            if (!responses[q.questionVersionId])
                                responses[q.questionVersionId] = {};
                            responses[q.questionVersionId][st.statementId] = false;
                            btnF.classList.add('selected-false', 'selected');
                            setAttr(btnF, 'aria-pressed', 'true');
                            if (btnT) {
                                btnT.classList.remove('selected-true', 'selected');
                                setAttr(btnT, 'aria-pressed', 'false');
                            }
                            updatePalette();
                            const ansList = stmts.map((s) => ({
                                statementId: s.statementId,
                                value: responses[q.questionVersionId][s.statementId] ?? null,
                            }));
                            await saveStateToStorage({
                                kind: 'II',
                                questionVersionId: q.questionVersionId,
                                answers: ansList,
                            });
                        });
                    }
                    table.appendChild(row);
                });
                card.appendChild(table);
            }
            else if (q.kind === 'III') {
                const wrap = docObj.createElement('div');
                wrap.className = 'short-answer-container';
                const curVal = typeof responses[q.questionVersionId] === 'string' ? responses[q.questionVersionId] : '';
                const inputWrap = docObj.createElement('div');
                inputWrap.className = 'short-answer-input-wrap';
                const inputId = `input-iii-${q.questionVersionId}`;
                const shortAnswerLabel = docObj.createElement('label');
                shortAnswerLabel.className = 'short-answer-label ui-field-label';
                shortAnswerLabel.htmlFor = inputId;
                shortAnswerLabel.textContent = `Đáp án câu ${qIdx + 1}:`;
                inputWrap.appendChild(shortAnswerLabel);
                const inputEl = docObj.createElement('input');
                inputEl.type = 'text';
                inputEl.id = inputId;
                inputEl.className = 'short-answer-input';
                inputEl.placeholder = 'Ví dụ: -0,5';
                inputEl.value = curVal;
                inputEl.setAttribute('autocomplete', 'off');
                inputWrap.appendChild(inputEl);
                wrap.appendChild(inputWrap);
                const warningEl = docObj.createElement('div');
                warningEl.className = 'short-answer-error';
                warningEl.setAttribute('role', 'alert');
                warningEl.style.color = 'var(--c-danger)';
                warningEl.style.fontSize = '0.8125rem';
                warningEl.style.marginTop = '0.25rem';
                warningEl.style.display = 'none';
                wrap.appendChild(warningEl);
                const quickKeysBar = docObj.createElement('div');
                quickKeysBar.className = 'quick-keys-bar';
                const label = docObj.createElement('span');
                label.style.fontSize = '0.8125rem';
                label.style.color = 'var(--gray-600)';
                label.style.fontWeight = '500';
                label.textContent = 'Phím tắt:';
                quickKeysBar.appendChild(label);
                const btnMinus = docObj.createElement('button');
                btnMinus.type = 'button';
                btnMinus.className = 'quick-key-btn';
                btnMinus.setAttribute('data-char', '-');
                btnMinus.textContent = '- (Dấu âm)';
                quickKeysBar.appendChild(btnMinus);
                const btnComma = docObj.createElement('button');
                btnComma.type = 'button';
                btnComma.className = 'quick-key-btn';
                btnComma.setAttribute('data-char', ',');
                btnComma.textContent = ', (Dấu phẩy)';
                quickKeysBar.appendChild(btnComma);
                const btnClear = docObj.createElement('button');
                btnClear.type = 'button';
                btnClear.className = 'quick-key-btn';
                btnClear.setAttribute('data-action', 'clear');
                btnClear.textContent = 'Xóa';
                quickKeysBar.appendChild(btnClear);
                wrap.appendChild(quickKeysBar);
                const updateAria = (v) => {
                    if (!inputEl)
                        return;
                    const isValid = /^[0-9,-]{0,4}$/.test(v);
                    if (isValid)
                        removeAttr(inputEl, 'aria-invalid');
                    else
                        setAttr(inputEl, 'aria-invalid', 'true');
                };
                if (inputEl) {
                    updateAria(inputEl.value);
                    let truncatedInput = false;
                    const handleInputCommit = async (val, edited = false) => {
                        if (isSubmitted)
                            return;
                        if (val.length > 4) {
                            truncatedInput = true;
                            setAttr(inputEl, 'aria-invalid', 'true');
                            warningEl.textContent = 'Đã cắt còn tối đa 4 ký tự';
                            warningEl.style.display = 'block';
                            val = val.slice(0, 4);
                            inputEl.value = val;
                        }
                        else if (!truncatedInput || edited) {
                            truncatedInput = false;
                            const isValid = /^[0-9,-]{0,4}$/.test(val);
                            if (isValid) {
                                removeAttr(inputEl, 'aria-invalid');
                                warningEl.textContent = '';
                                warningEl.style.display = 'none';
                            }
                            else {
                                setAttr(inputEl, 'aria-invalid', 'true');
                                warningEl.textContent = 'Ký tự không hợp lệ';
                                warningEl.style.display = 'block';
                            }
                        }
                        responses[q.questionVersionId] = val;
                        await saveStateToStorage({
                            kind: 'III',
                            questionVersionId: q.questionVersionId,
                            raw: typeof val === 'string' && val.length > 0 ? val : null,
                        });
                        updatePalette();
                    };
                    inputEl.addEventListener('input', (e) => {
                        handleInputCommit(e.target.value, true);
                    });
                    inputEl.addEventListener('change', (e) => {
                        handleInputCommit(e.target.value);
                    });
                    inputEl.addEventListener('blur', (e) => {
                        handleInputCommit(e.target.value);
                    });
                }
                wrap.querySelectorAll('.quick-key-btn').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        if (isSubmitted)
                            return;
                        let valToSave = '';
                        const action = btn.dataset ? btn.dataset.action : (typeof btn.getAttribute === 'function' ? btn.getAttribute('data-action') : null);
                        if (action === 'clear') {
                            responses[q.questionVersionId] = '';
                            if (inputEl)
                                inputEl.value = '';
                            valToSave = '';
                        }
                        else {
                            const ch = btn.dataset ? btn.dataset.char : (typeof btn.getAttribute === 'function' ? btn.getAttribute('data-char') : '');
                            const cur = typeof responses[q.questionVersionId] === 'string' ? responses[q.questionVersionId] : '';
                            if (cur.length < 4) {
                                const updated = cur + ch;
                                responses[q.questionVersionId] = updated;
                                if (inputEl)
                                    inputEl.value = updated;
                                valToSave = updated;
                            }
                            else {
                                valToSave = cur;
                            }
                        }
                        if (inputEl)
                            updateAria(inputEl.value);
                        await saveStateToStorage({
                            kind: 'III',
                            questionVersionId: q.questionVersionId,
                            raw: typeof valToSave === 'string' && valToSave.length > 0 ? valToSave : null,
                        });
                        updatePalette();
                    });
                });
                card.appendChild(wrap);
            }
            examPane.appendChild(card);
        });
    };
    // Timer lifecycle
    const updateTimerDisplay = () => {
        if (!timerBox)
            return;
        const remainingMs = Math.max(0, deadline - now());
        const totalSec = Math.ceil(remainingMs / 1000);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        timerBox.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        if (totalSec <= 0 && !isSubmitted) {
            submitExam('deadline');
        }
    };
    const startTimer = () => {
        if (timerIntervalId)
            clearInterval(timerIntervalId);
        updateTimerDisplay();
        timerIntervalId = setInterval(updateTimerDisplay, 1000);
        if (timerIntervalId && typeof timerIntervalId.unref === 'function') {
            timerIntervalId.unref();
        }
    };
    // Submit and Scoring
    const submitExam = async (reason = 'manual') => {
        if (isSubmitted && scoredResult) {
            showReport();
            return;
        }
        const candidateInputVal = (candidateInput && typeof candidateInput.value === 'string' && candidateInput.value.trim()) ? candidateInput.value.trim() : null;
        const startNameVal = root.querySelector('#startName')?.value.trim();
        let storedName = null;
        try {
            storedName = localStorage.getItem('cunata:candidate_name') || localStorage.getItem('cunata:last_candidate_name') || localStorage.getItem('cunata_candidate_name');
        }
        catch { }
        const effectiveName = (candidateInputVal && candidateInputVal !== 'Thí sinh tự do' ? candidateInputVal : null)
            || (candidateName && candidateName !== 'Thí sinh tự do' ? candidateName : null)
            || startNameVal
            || (storedName && storedName.trim() ? storedName.trim() : null)
            || candidateInputVal
            || candidateName;
        if (effectiveName) {
            candidateName = effectiveName;
            if (candidateInput) {
                candidateInput.value = effectiveName;
            }
            try {
                localStorage.setItem('cunata:candidate_name', effectiveName);
                localStorage.setItem('cunata:last_candidate_name', effectiveName);
            }
            catch { }
        }
        if (controller && candidateName) {
            try {
                await controller.rename(candidateName);
            }
            catch { }
        }
        if (!currentClassCode || !currentAssignmentId) {
            try {
                const raw = sessionStorage.getItem('cunata:active_assignment') || localStorage.getItem('cunata:active_assignment');
                if (raw) {
                    const act = JSON.parse(raw);
                    if (act && (act.examId === currentExam.examId || !act.examId)) {
                        if (!currentClassCode && (act.classCode || act.class_code)) {
                            currentClassCode = (act.classCode || act.class_code).trim().toUpperCase();
                        }
                        if (!currentAssignmentId && (act.assignmentId || act.assignment_id)) {
                            currentAssignmentId = act.assignmentId || act.assignment_id;
                        }
                        if (!currentDueAt && (act.dueAt || act.due_at)) {
                            currentDueAt = act.dueAt || act.due_at;
                        }
                        if (!currentOpenAt && (act.openAt || act.open_at)) {
                            currentOpenAt = act.openAt || act.open_at;
                        }
                    }
                }
            }
            catch { }
        }
        // Flush all active short-answer inputs from DOM to ensure responses are up-to-date
        if (root) {
            root.querySelectorAll('.short-answer-container').forEach((container) => {
                let card = null;
                if (typeof container.closest === 'function') {
                    card = container.closest('.question-card');
                }
                else {
                    let curr = container.parentNode;
                    while (curr) {
                        if (curr.classList && typeof curr.classList.contains === 'function' && curr.classList.contains('question-card')) {
                            card = curr;
                            break;
                        }
                        curr = curr.parentNode;
                    }
                }
                const qid = card?.id?.replace('qcard-', '');
                const inp = container.querySelector ? container.querySelector('.short-answer-input') : null;
                if (qid && inp && typeof inp.value === 'string') {
                    const hasExisting = Boolean(controller?.getSnapshot().responses.responses.some((r) => r.questionVersionId === qid));
                    if (inp.value.length > 0 || (qid in responses) || hasExisting) {
                        responses[qid] = inp.value;
                    }
                }
            });
        }
        // Ensure any dirty or flushed responses are persisted into controller before finalization
        if (isStorageAvailable && controller) {
            for (const q of currentExam.questions) {
                const resp = createDomainResponseForQuestion(currentExam, q.questionVersionId, responses);
                if (resp) {
                    const ctrlRec = controller.getSnapshot();
                    const existing = ctrlRec.responses.responses.find((r) => r.questionVersionId === q.questionVersionId);
                    const isSame = JSON.stringify(existing) === JSON.stringify(resp);
                    if (!isSame) {
                        const isAnswered = resp.kind === 'I' ? resp.selectedOptionId !== null :
                            resp.kind === 'II' ? resp.answers.some((a) => a.value !== null) :
                                resp.raw !== null;
                        if (existing || isAnswered) {
                            try {
                                const ansRes = await controller.answer(resp);
                                if (ansRes.ok) {
                                    dirtyQuestionIds.delete(q.questionVersionId);
                                }
                            }
                            catch (_) { }
                        }
                    }
                }
            }
        }
        // Check concurrent final in durable storage (NOT from localStorage mirror!)
        if (isStorageAvailable && storage) {
            try {
                const loadRes = await storage.load({ examId: currentExam.examId, examVersionId: currentExam.examVersionId, attemptId });
                if (loadRes.ok && loadRes.value && loadRes.value.phase === 'final') {
                    adoptFinalRecord(loadRes.value);
                    return;
                }
            }
            catch (_) { }
        }
        isSubmitted = true;
        notifyWorkerAttemptState(false);
        await activateWaitingWorker();
        if (timerIntervalId)
            clearInterval(timerIntervalId);
        // Compute score via domain scoreLegacyAttempt (uses scoreAttempt single truth)
        scoredResult = scoreLegacyAttempt(currentExam, responses);
        const domainExam = toDomainExam(currentExam);
        const domResponses = toDomainResponses(currentExam, attemptId, responses);
        let submitOk = false;
        finalRecord = null;
        const submitTs = now();
        submittedAt = submitTs;
        // 1. Submit through controller if available
        if (isStorageAvailable && controller) {
            try {
                const subRes = await controller.submit(reason);
                if (subRes.ok) {
                    finalRecord = {
                        ...subRes.value,
                        ...(currentClassCode ? { class_code: currentClassCode, classCode: currentClassCode } : {}),
                        ...(currentAssignmentId ? { assignment_id: currentAssignmentId, assignmentId: currentAssignmentId } : {}),
                        ...(currentDueAt ? { dueAt: currentDueAt, due_at: currentDueAt } : {}),
                        ...(currentOpenAt ? { openAt: currentOpenAt, open_at: currentOpenAt } : {}),
                    };
                    if (finalRecord.submittedAt) {
                        submittedAt = finalRecord.submittedAt;
                    }
                    submitOk = true;
                }
                else if (subRes.error.code === 'ATTEMPT_FINALIZED' && storage) {
                    const loadRes = await storage.load({
                        examId: currentExam.examId,
                        examVersionId: currentExam.examVersionId,
                        attemptId,
                    });
                    if (loadRes.ok && loadRes.value && loadRes.value.phase === 'final') {
                        finalRecord = {
                            ...loadRes.value,
                            ...(currentClassCode ? { class_code: currentClassCode, classCode: currentClassCode } : {}),
                            ...(currentAssignmentId ? { assignment_id: currentAssignmentId, assignmentId: currentAssignmentId } : {}),
                            ...(currentDueAt ? { dueAt: currentDueAt, due_at: currentDueAt } : {}),
                            ...(currentOpenAt ? { openAt: currentOpenAt, open_at: currentOpenAt } : {}),
                        };
                        if (finalRecord.submittedAt) {
                            submittedAt = finalRecord.submittedAt;
                        }
                        submitOk = true;
                    }
                }
            }
            catch {
                submitOk = false;
            }
        }
        else if (isStorageAvailable && storage) {
            try {
                const calculatedScoreResult = scoreAttempt(domainExam, domResponses);
                const scoreDTO = scoreResultToDTO(calculatedScoreResult);
                const finalRec = {
                    schemaVersion: 'web-attempt-v1',
                    examId: currentExam.examId,
                    examVersionId: currentExam.examVersionId,
                    attemptId,
                    revision: 2,
                    candidateName,
                    examSnapshot: currentExam,
                    presentationOrder: presentationOrder || createPresentationOrder(domainExam, currentExam.settings, attemptId),
                    responses: domResponses,
                    startedAt,
                    deadline,
                    phase: 'final',
                    submittedAt: submitTs,
                    scoreDTO,
                    ...(currentClassCode ? { class_code: currentClassCode, classCode: currentClassCode } : {}),
                    ...(currentAssignmentId ? { assignment_id: currentAssignmentId, assignmentId: currentAssignmentId } : {}),
                    ...(currentDueAt ? { dueAt: currentDueAt, due_at: currentDueAt } : {}),
                    ...(currentOpenAt ? { openAt: currentOpenAt, open_at: currentOpenAt } : {}),
                };
                const fRes = await storage.finalize(finalRec, 1);
                if (fRes.ok) {
                    finalRecord = fRes.value;
                    if (finalRecord.submittedAt) {
                        submittedAt = finalRecord.submittedAt;
                    }
                    submitOk = true;
                }
                else if (fRes.error.code === 'STORAGE_CONFLICT') {
                    const loadRes = await storage.load(finalRec);
                    if (loadRes.ok) {
                        if (loadRes.value && loadRes.value.phase === 'final') {
                            finalRecord = loadRes.value;
                            if (finalRecord.submittedAt) {
                                submittedAt = finalRecord.submittedAt;
                            }
                            submitOk = true;
                        }
                        else if (loadRes.value && loadRes.value.phase === 'draft') {
                            const retryRes = await storage.finalize(finalRec, loadRes.value.revision);
                            if (retryRes.ok) {
                                finalRecord = retryRes.value;
                                if (finalRecord.submittedAt) {
                                    submittedAt = finalRecord.submittedAt;
                                }
                                submitOk = true;
                            }
                        }
                        else if (!loadRes.value) {
                            const fRes0 = await storage.finalize(finalRec, 0);
                            if (fRes0.ok) {
                                finalRecord = fRes0.value;
                                if (finalRecord.submittedAt) {
                                    submittedAt = finalRecord.submittedAt;
                                }
                                submitOk = true;
                            }
                        }
                    }
                }
            }
            catch {
                submitOk = false;
            }
        }
        if (!finalRecord) {
            finalRecord = {
                schemaVersion: 'web-attempt-v1',
                examId: currentExam.examId,
                examVersionId: currentExam.examVersionId,
                attemptId,
                revision: 2,
                candidateName,
                examSnapshot: currentExam,
                presentationOrder: presentationOrder || createPresentationOrder(domainExam, currentExam.settings, attemptId),
                responses: domResponses,
                startedAt,
                deadline,
                phase: 'final',
                submittedAt: submittedAt || now(),
                scoreDTO: scoreResultToDTO(scoreAttempt(domainExam, domResponses)),
                ...(currentClassCode ? { class_code: currentClassCode, classCode: currentClassCode } : {}),
                ...(currentAssignmentId ? { assignment_id: currentAssignmentId, assignmentId: currentAssignmentId } : {}),
                ...(currentDueAt ? { dueAt: currentDueAt, due_at: currentDueAt } : {}),
                ...(currentOpenAt ? { openAt: currentOpenAt, open_at: currentOpenAt } : {}),
            };
        }
        if (finalRecord) {
            const repRes = buildReport(finalRecord, now());
            if (!repRes.ok) {
                activeReportModel = null;
                scoredResult = null;
                showIntegrityError(repRes.error, finalRecord);
                return;
            }
            activeReportModel = repRes.value;
        }
        // 2. Mirror final to localStorage
        if (typeof localStorage !== 'undefined') {
            try {
                const finalKey = getFinalStorageKey(currentExam, { attemptId });
                const key = getStorageKey(currentExam, { attemptId });
                const pointerKey = 'cunata:active_attempt:' + encodeURIComponent(currentExam.examId) + ':' + encodeURIComponent(currentExam.examVersionId);
                localStorage.setItem(pointerKey, attemptId);
                const domResp = toDomainResponses(currentExam, attemptId, responses);
                const scoreDTO = scoreResultToDTO(scoreAttempt(domainExam, domResp));
                const payload = {
                    schemaVersion: 'web-attempt-v1',
                    examId: currentExam.examId,
                    examVersionId: currentExam.examVersionId,
                    attemptId,
                    revision: 2,
                    candidateName,
                    examSnapshot: currentExam,
                    presentationOrder,
                    responses: domResp,
                    startedAt,
                    submittedAt,
                    deadline,
                    phase: 'final',
                    submitted: true,
                    scoreResult: scoredResult,
                    scoreDTO,
                    degradedRescueMirror: !isStorageAvailable,
                    ...(currentClassCode ? { class_code: currentClassCode, classCode: currentClassCode } : {}),
                    ...(currentAssignmentId ? { assignment_id: currentAssignmentId, assignmentId: currentAssignmentId } : {}),
                    ...(currentDueAt ? { dueAt: currentDueAt, due_at: currentDueAt } : {}),
                    ...(currentOpenAt ? { openAt: currentOpenAt, open_at: currentOpenAt } : {}),
                };
                const jsonStr = JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
                localStorage.setItem(key, jsonStr);
                localStorage.setItem(finalKey, jsonStr);
            }
            catch {
                // localStorage write error
            }
        }
        if (storage && isStorageAvailable) {
            try {
                const remainingAttempts = await storage.listAttempts(currentExam.examId, currentExam.examVersionId);
                if (remainingAttempts.ok) {
                    for (const att of remainingAttempts.value) {
                        if (att.attemptId !== attemptId && att.phase === 'draft') {
                            await storage.finalize({ ...att, phase: 'final', submittedAt: now() }, att.revision);
                            if (typeof localStorage !== 'undefined') {
                                try {
                                    localStorage.removeItem('cunata:attempt:' + encodeURIComponent(currentExam.examId) + ':' + encodeURIComponent(currentExam.examVersionId) + ':' + encodeURIComponent(att.attemptId));
                                }
                                catch (_) { }
                            }
                        }
                    }
                }
            }
            catch (_) { }
        }
        if (appsScriptUrl && appsScriptUrl.trim()) {
            if (syncText)
                syncText.textContent = 'Đang gửi...';
            const finalToEnqueue = finalRecord;
            if (finalToEnqueue && storage) {
                try {
                    await enqueue(finalToEnqueue, storage, appsScriptUrl.trim());
                }
                catch { }
                void drainAttempt({
                    examId: finalToEnqueue.examId,
                    examVersionId: finalToEnqueue.examVersionId,
                    attemptId: finalToEnqueue.attemptId,
                });
            }
        }
        else {
            if (syncText) {
                syncText.textContent = submitOk ? 'Đã nộp & lưu cục bộ' : 'Chưa lưu';
            }
        }
        if (!submitOk) {
            showStorageUnavailableWarning();
        }
        showReport(finalRecord ?? undefined, activeReportModel ?? undefined);
    };
    // Unified load or resume exam helper (CK08-F05)
    const loadOrResumeExam = async (examData, forceNew = false, requestedAttemptId, meta) => {
        controller?.dispose();
        controller = null;
        currentExam = examData;
        const examId = currentExam.examId;
        const version = currentExam.examVersionId;
        if (reportRestartIntervalId) {
            clearInterval(reportRestartIntervalId);
            reportRestartIntervalId = null;
        }
        if (meta && (meta.classCode || meta.assignmentId || meta.class_code || meta.assignment_id || meta.dueAt || meta.due_at || meta.openAt || meta.open_at)) {
            currentClassCode = (meta.classCode || meta.class_code)?.trim().toUpperCase();
            currentAssignmentId = meta.assignmentId || meta.assignment_id;
            currentDueAt = meta.dueAt || meta.due_at;
            currentOpenAt = meta.openAt || meta.open_at;
        }
        else if (examData.classCode || examData.assignmentId || examData.class_code || examData.assignment_id || examData.dueAt || examData.due_at || examData.openAt || examData.open_at) {
            currentClassCode = (examData.classCode || examData.class_code)?.trim().toUpperCase();
            currentAssignmentId = examData.assignmentId || examData.assignment_id;
            currentDueAt = examData.dueAt || examData.due_at;
            currentOpenAt = examData.openAt || examData.open_at;
        }
        else if (!requestedAttemptId) {
            let activeAssignment = null;
            try {
                const raw = sessionStorage.getItem('cunata:active_assignment') || localStorage.getItem('cunata:active_assignment');
                if (raw)
                    activeAssignment = JSON.parse(raw);
            }
            catch { }
            if (activeAssignment && (activeAssignment.examId === examId || !activeAssignment.examId)) {
                currentClassCode = (activeAssignment.classCode || activeAssignment.class_code)?.trim().toUpperCase();
                currentAssignmentId = activeAssignment.assignmentId || activeAssignment.assignment_id;
                currentDueAt = activeAssignment.dueAt || activeAssignment.due_at;
                currentOpenAt = activeAssignment.openAt || activeAssignment.open_at;
            }
            else {
                currentClassCode = undefined;
                currentAssignmentId = undefined;
                currentDueAt = undefined;
                currentOpenAt = undefined;
            }
        }
        // Reset previous attempt finalRecord and activeReportModel if switching exam or assignment context
        if (finalRecord &&
            (finalRecord.examId !== examId ||
                finalRecord.examVersionId !== version ||
                (currentAssignmentId && (finalRecord.assignmentId || finalRecord.assignment_id) !== currentAssignmentId) ||
                (!currentAssignmentId && (finalRecord.assignmentId || finalRecord.assignment_id)))) {
            finalRecord = null;
            activeReportModel = null;
        }
        resolveAssignmentSchedule();
        if (forceNew) {
            const sched = resolveAssignmentSchedule();
            if (sched?.dueAt) {
                const dueTime = new Date(sched.dueAt).getTime();
                if (Number.isFinite(dueTime) && now() > dueTime) {
                    if (finalRecord) {
                        adoptFinalRecord(finalRecord, true);
                    }
                    else {
                        showReport();
                    }
                    return;
                }
            }
            if (sched?.openAt) {
                const openTime = new Date(sched.openAt).getTime();
                if (Number.isFinite(openTime) && now() < openTime) {
                    if (finalRecord) {
                        adoptFinalRecord(finalRecord, true);
                    }
                    else {
                        showReport();
                    }
                    return;
                }
            }
            const maxAtt = currentExam.settings?.maxAttempts;
            if (typeof maxAtt === 'number' && maxAtt > 0 && storage && isStorageAvailable) {
                try {
                    const listRes = await storage.listAttempts(examId, version);
                    if (listRes.ok) {
                        const finals = listRes.value.filter((a) => a.phase === 'final');
                        if (finals.length >= maxAtt) {
                            const latestFinal = [...finals].sort((a, b) => b.startedAt - a.startedAt)[0];
                            if (latestFinal) {
                                adoptFinalRecord(latestFinal, true);
                            }
                            else {
                                showReport();
                            }
                            return;
                        }
                    }
                }
                catch (_) { }
            }
        }
        if (timerIntervalId)
            clearInterval(timerIntervalId);
        // Clear any previous error banner and reset report styling
        const existingBanner = root.querySelector('#integrityErrorBanner');
        if (existingBanner) {
            if (typeof existingBanner.remove === 'function')
                existingBanner.remove();
            else if (existingBanner.parentNode)
                existingBanner.parentNode.removeChild(existingBanner);
        }
        const subTitleEl = root.querySelector('#reportSubtitle');
        if (subTitleEl)
            subTitleEl.style.color = '';
        const summaryGridEl = root.querySelector('.summary-cards-grid');
        if (summaryGridEl)
            summaryGridEl.style.display = '';
        const reportActionsBarEl = root.querySelector('.report-actions-bar');
        if (reportActionsBarEl)
            reportActionsBarEl.style.display = '';
        const reviewQuestionsListEl = root.querySelector('#reviewQuestionsList');
        if (reviewQuestionsListEl)
            reviewQuestionsListEl.style.display = '';
        const historySectionEl = root.querySelector('#attemptHistorySection');
        if (historySectionEl)
            historySectionEl.style.display = 'none';
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem('cunata:active_exam_snapshot', JSON.stringify(currentExam));
                localStorage.setItem('cunata:active_exam_id', examId);
                localStorage.setItem('cunata:snapshot:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version), JSON.stringify(currentExam));
            }
            catch (_) { }
        }
        let resumedRecord = null;
        let isDurableRecord = false;
        if (!forceNew) {
            let foundAttemptId = requestedAttemptId ?? null;
            // Check maxAttempts limit when not loading a specific attempt
            const maxAtt = currentExam.settings?.maxAttempts;
            if (typeof maxAtt === 'number' && maxAtt > 0 && !requestedAttemptId && storage && isStorageAvailable) {
                try {
                    const listRes = await storage.listAttempts(examId, version);
                    if (listRes.ok) {
                        const finals = listRes.value.filter((a) => a.phase === 'final');
                        if (finals.length >= maxAtt) {
                            const latestFinal = [...finals].sort((a, b) => b.startedAt - a.startedAt)[0];
                            if (latestFinal) {
                                adoptFinalRecord(latestFinal, true);
                                return;
                            }
                        }
                    }
                }
                catch (_) { }
            }
            if (!foundAttemptId && storage && isStorageAvailable) {
                try {
                    const listRes = await storage.listAttempts(examId, version);
                    if (listRes.ok && listRes.value.length > 0) {
                        const matching = listRes.value.filter((a) => {
                            const aAssign = a.assignment_id || a.assignmentId;
                            if (currentAssignmentId) {
                                return aAssign === currentAssignmentId;
                            }
                            else {
                                return !aAssign;
                            }
                        });
                        const drafts = matching.filter((a) => a.phase === 'draft');
                        const target = drafts.length > 0
                            ? [...drafts].sort((a, b) => b.startedAt - a.startedAt)[0]
                            : matching.length > 0
                                ? [...matching].sort((a, b) => b.startedAt - a.startedAt)[0]
                                : null;
                        if (target) {
                            foundAttemptId = target.attemptId;
                            resumedRecord = target;
                            isDurableRecord = true;
                        }
                    }
                }
                catch (_) { }
            }
            if (!foundAttemptId && typeof localStorage !== 'undefined') {
                const pointerKey = 'cunata:active_attempt:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version);
                const candidateId = localStorage.getItem(pointerKey);
                if (candidateId) {
                    const draftKey = 'cunata:attempt:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version) + ':' + encodeURIComponent(candidateId);
                    const finalKey = 'cunata:final:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version) + ':' + encodeURIComponent(candidateId);
                    const rawDraft = localStorage.getItem(draftKey);
                    const rawFinal = localStorage.getItem(finalKey);
                    let parsed = null;
                    if (rawDraft) {
                        try {
                            const p = JSON.parse(rawDraft);
                            if (p && !p.submitted && p.phase !== 'final') {
                                parsed = p;
                            }
                        }
                        catch (_) { }
                    }
                    const rawToParse = !parsed ? (rawFinal || rawDraft) : null;
                    if (rawToParse) {
                        try {
                            const p = JSON.parse(rawToParse);
                            if (p)
                                parsed = p;
                        }
                        catch (_) { }
                    }
                    if (parsed) {
                        const draftAssign = parsed.assignment_id || parsed.assignmentId;
                        if ((currentAssignmentId && draftAssign === currentAssignmentId) || (!currentAssignmentId && !draftAssign)) {
                            foundAttemptId = candidateId;
                            resumedRecord = parsed;
                            isDurableRecord = false;
                        }
                    }
                }
            }
            if (foundAttemptId && !resumedRecord) {
                if (storage && isStorageAvailable) {
                    try {
                        const loadRes = await storage.load({ examId, examVersionId: version, attemptId: foundAttemptId });
                        if (loadRes.ok && loadRes.value) {
                            resumedRecord = loadRes.value;
                            isDurableRecord = true;
                        }
                    }
                    catch (_) { }
                }
                if (!resumedRecord && typeof localStorage !== 'undefined') {
                    const key = 'cunata:attempt:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version) + ':' + encodeURIComponent(foundAttemptId);
                    const finalKey = 'cunata:final:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version) + ':' + encodeURIComponent(foundAttemptId);
                    const raw = localStorage.getItem(finalKey) || localStorage.getItem(key);
                    if (raw) {
                        try {
                            resumedRecord = JSON.parse(raw);
                            isDurableRecord = false;
                        }
                        catch (_) { }
                    }
                }
            }
        }
        if (requestedAttemptId && !resumedRecord)
            throw new Error('Không tìm thấy bài làm trên máy này.');
        if (resumedRecord && resumedRecord.examId === examId && resumedRecord.examVersionId === version) {
            attemptId = resumedRecord.attemptId;
            dirtyQuestionIds.clear();
            lastSaveOk = isStorageAvailable;
            if (resumedRecord.class_code || resumedRecord.classCode) {
                currentClassCode = (resumedRecord.class_code || resumedRecord.classCode).trim().toUpperCase();
            }
            if (resumedRecord.assignment_id || resumedRecord.assignmentId) {
                currentAssignmentId = resumedRecord.assignment_id || resumedRecord.assignmentId;
            }
            if (resumedRecord.dueAt || resumedRecord.due_at) {
                currentDueAt = resumedRecord.dueAt || resumedRecord.due_at;
            }
            if (resumedRecord.openAt || resumedRecord.open_at) {
                currentOpenAt = resumedRecord.openAt || resumedRecord.open_at;
            }
            resolveAssignmentSchedule();
            if (resumedRecord.candidateName)
                candidateName = resumedRecord.candidateName;
            if (candidateInput) {
                candidateInput.value = candidateName;
            }
            if (resumedRecord.startedAt)
                startedAt = resumedRecord.startedAt;
            if (typeof resumedRecord.submittedAt === 'number')
                submittedAt = resumedRecord.submittedAt;
            if (isDurableRecord && resumedRecord.phase === 'final') {
                finalRecord = resumedRecord;
            }
            if (resumedRecord.deadline)
                deadline = resumedRecord.deadline;
            if (resumedRecord.examSnapshot && Array.isArray(resumedRecord.examSnapshot.questions) && resumedRecord.examSnapshot.questions.length > 0) {
                currentExam = resumedRecord.examSnapshot;
            }
            if (resumedRecord.responses) {
                if (Array.isArray(resumedRecord.responses.responses)) {
                    responses = fromDomainResponses(resumedRecord.responses);
                }
                else if (typeof resumedRecord.responses === 'object') {
                    responses = { ...resumedRecord.responses };
                }
            }
            else {
                responses = Object.create(null);
            }
            const domainExam = toDomainExam(currentExam);
            if (resumedRecord.presentationOrder && validatePresentationOrder(domainExam, resumedRecord.presentationOrder).length === 0) {
                presentationOrder = resumedRecord.presentationOrder;
            }
            else {
                presentationOrder = createPresentationOrder(domainExam, {
                    shuffleQuestions: currentExam.settings?.shuffleQuestions ?? false,
                    shuffleOptions: currentExam.settings?.shuffleOptions ?? false,
                }, attemptId);
            }
            isSubmitted = resumedRecord.phase === 'final' || resumedRecord.submitted === true;
            try {
                const resumeRes = await resumeAttempt({ examId, examVersionId: version, attemptId }, { storage, now, id: idGen });
                if (resumeRes.ok) {
                    controller = resumeRes.value;
                }
                else {
                    controller = null;
                }
            }
            catch {
                controller = null;
            }
            // Recompute score deterministically from domain - NEVER trust stored score (CK08-F03)
            scoredResult = scoreLegacyAttempt(currentExam, responses);
            if (isSubmitted) {
                const isDurableFinal = isDurableRecord && isStorageAvailable && !resumedRecord.degradedRescueMirror;
                if (!isDurableFinal) {
                    showStorageUnavailableWarning();
                }
                if (resumedRecord && resumedRecord.phase === 'final' && Array.isArray(resumedRecord.responses?.responses)) {
                    adoptFinalRecord(resumedRecord, isDurableFinal);
                    return;
                }
                let mockFinal = null;
                if (resumedRecord && resumedRecord.scoreDTO) {
                    mockFinal = {
                        schemaVersion: 'web-attempt-v1',
                        examId,
                        examVersionId: version,
                        attemptId,
                        revision: 2,
                        candidateName,
                        examSnapshot: currentExam,
                        presentationOrder: presentationOrder || createPresentationOrder(toDomainExam(currentExam), currentExam.settings, attemptId),
                        responses: toDomainResponses(currentExam, attemptId, responses),
                        startedAt,
                        deadline,
                        phase: 'final',
                        submittedAt: resumedRecord.submittedAt || now(),
                        scoreDTO: resumedRecord.scoreDTO,
                        ...(currentClassCode ? { class_code: currentClassCode, classCode: currentClassCode } : {}),
                        ...(currentAssignmentId ? { assignment_id: currentAssignmentId, assignmentId: currentAssignmentId } : {}),
                        ...(currentDueAt ? { dueAt: currentDueAt, due_at: currentDueAt } : {}),
                        ...(currentOpenAt ? { openAt: currentOpenAt, open_at: currentOpenAt } : {}),
                    };
                    const repRes = buildReport(mockFinal, now());
                    if (!repRes.ok) {
                        activeReportModel = null;
                        scoredResult = null;
                        showIntegrityError(repRes.error, mockFinal);
                        return;
                    }
                    activeReportModel = repRes.value;
                }
                if (mockFinal) {
                    void syncOutboxStateOnFinal(mockFinal, isDurableFinal);
                }
                else if (syncText) {
                    syncText.textContent = isDurableFinal ? 'Đã nộp & lưu cục bộ' : 'Chưa lưu';
                }
                showReport();
                return;
            }
            else {
                if (now() >= deadline) {
                    await submitExam('deadline');
                    return;
                }
            }
        }
        else {
            attemptId = 'attempt-' + now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
            responses = Object.create(null);
            dirtyQuestionIds.clear();
            lastSaveOk = isStorageAvailable;
            isSubmitted = false;
            notifyWorkerAttemptState(true);
            scoredResult = null;
            startedAt = now();
            submittedAt = null;
            finalRecord = null;
            activeReportModel = null;
            const dMin = currentExam.settings?.durationMinutes ?? 50;
            deadline = startedAt + dMin * 60 * 1000;
            const domainExam = toDomainExam(currentExam);
            presentationOrder = createPresentationOrder(domainExam, {
                shuffleQuestions: currentExam.settings?.shuffleQuestions ?? false,
                shuffleOptions: currentExam.settings?.shuffleOptions ?? false,
            }, attemptId);
            const gateName = root.querySelector('#startName')?.value.trim()
                || (typeof localStorage !== 'undefined' ? localStorage.getItem('cunata:candidate_name') || localStorage.getItem('cunata:last_candidate_name') : null);
            if (gateName) {
                candidateName = gateName;
            }
            try {
                const startRes = await startAttempt(currentExam, candidateName, { storage, now, id: idGen }, {
                    attemptId,
                    ...(currentClassCode ? { classCode: currentClassCode, class_code: currentClassCode } : {}),
                    ...(currentAssignmentId ? { assignmentId: currentAssignmentId, assignment_id: currentAssignmentId } : {}),
                    ...(currentDueAt ? { dueAt: currentDueAt, due_at: currentDueAt } : {}),
                    ...(currentOpenAt ? { openAt: currentOpenAt, open_at: currentOpenAt } : {}),
                });
                if (startRes.ok) {
                    controller = startRes.value;
                }
                else {
                    controller = null;
                    if (startRes.error.code === 'ASSIGNMENT_PAST_DUE' || startRes.error.code === 'ASSIGNMENT_NOT_OPEN') {
                        if (finalRecord) {
                            adoptFinalRecord(finalRecord, true);
                        }
                        else {
                            showIntegrityError(startRes.error);
                        }
                        return;
                    }
                }
            }
            catch {
                controller = null;
            }
            await saveStateToStorage();
        }
        if (examTitle)
            examTitle.textContent = currentExam.title || 'Đề thi';
        if (candidateInput) {
            candidateInput.value = candidateName;
            candidateInput.readOnly = true;
            candidateInput.setAttribute('readonly', 'readonly');
            candidateInput.disabled = false;
        }
        const startScr = root.querySelector('#startScreen');
        if (startScr && !isSingleExamFixture)
            startScr.style.display = 'none';
        if (examWrapper)
            examWrapper.style.display = '';
        if (reportWrapper)
            reportWrapper.style.display = 'none';
        if (btnSubmit)
            btnSubmit.style.display = '';
        if (syncText) {
            if (isSubmitted) {
                syncText.textContent = isStorageAvailable ? 'Đã nộp & lưu cục bộ' : 'Chưa lưu';
            }
            else if (!isStorageAvailable) {
                syncText.textContent = 'Chưa lưu';
            }
        }
        loadedExamId = currentExam.examId;
        router.navigate('exam', { examId: currentExam.examId });
        renderExamPane();
        updatePalette();
        startTimer();
        roleShell?.show(router.getState(), candidateName, true);
    };
    // Show Report View
    showReport = (record, repModel) => {
        const errBanner = root.querySelector('#integrityErrorBanner');
        if (errBanner) {
            if (typeof errBanner.remove === 'function')
                errBanner.remove();
            else if (errBanner.parentNode)
                errBanner.parentNode.removeChild(errBanner);
        }
        const summaryGrid = root.querySelector('.summary-cards-grid');
        if (summaryGrid)
            summaryGrid.style.display = '';
        const reportActionsBar = root.querySelector('.report-actions-bar');
        if (reportActionsBar)
            reportActionsBar.style.display = '';
        const reviewQuestionsList = root.querySelector('#reviewQuestionsList');
        if (reviewQuestionsList)
            reviewQuestionsList.style.display = '';
        const startScr = root.querySelector('#startScreen');
        if (startScr)
            startScr.style.display = 'none';
        if (examWrapper)
            examWrapper.style.display = 'none';
        if (reportWrapper)
            reportWrapper.style.display = '';
        if (btnSubmit)
            btnSubmit.style.display = 'none';
        if (candidateInput) {
            candidateInput.readOnly = true;
            candidateInput.setAttribute('readonly', 'readonly');
            candidateInput.disabled = true;
        }
        if (examTitle && currentExam) {
            examTitle.textContent = currentExam.title || 'Đề thi';
        }
        router.navigate('report', { attemptId });
        if (record) {
            if (record.phase === 'final') {
                const repRes = buildReport(record, now());
                if (!repRes.ok) {
                    activeReportModel = null;
                    scoredResult = null;
                    showIntegrityError(repRes.error, record);
                    return;
                }
                activeReportModel = repRes.value;
            }
            if (typeof record.submittedAt === 'number')
                submittedAt = record.submittedAt;
            finalRecord = record;
            if (record.candidateName)
                candidateName = record.candidateName;
            if (record.examSnapshot)
                currentExam = record.examSnapshot;
            if (record.responses)
                responses = fromDomainResponses(record.responses);
        }
        if (repModel) {
            activeReportModel = repModel;
            if (typeof repModel.submittedAt === 'number')
                submittedAt = repModel.submittedAt;
        }
        // Always recompute score deterministically from domain - NEVER trust stored score
        scoredResult = scoreLegacyAttempt(currentExam, responses);
        if (!scoredResult)
            return;
        const subTime = typeof submittedAt === 'number'
            ? submittedAt
            : (activeReportModel ? activeReportModel.submittedAt : (finalRecord?.submittedAt ?? null));
        const reportTitleEl = root.querySelector('#reportWrapper .report-title');
        if (reportTitleEl && currentExam.title) {
            reportTitleEl.textContent = currentExam.title;
        }
        const reportSubtitle = root.querySelector('#reportSubtitle');
        if (reportSubtitle) {
            reportSubtitle.style.color = '';
            const startStr = startedAt ? new Date(startedAt).toLocaleTimeString() : '';
            const subStr = subTime ? new Date(subTime).toLocaleTimeString() : new Date().toLocaleTimeString();
            reportSubtitle.textContent = `Thí sinh: ${candidateName} · Phiên bản: ${currentExam.examVersionId} · Bắt đầu lúc: ${startStr} · Nộp bài lúc: ${subStr}`;
        }
        const scorePartI = root.querySelector('#scorePartI');
        const scorePartII = root.querySelector('#scorePartII');
        const scorePartIII = root.querySelector('#scorePartIII');
        const scoreTotal = root.querySelector('#scoreTotal');
        const detailPartI = root.querySelector('#detailPartI');
        const detailPartII = root.querySelector('#detailPartII');
        const detailPartIII = root.querySelector('#detailPartIII');
        const percentTotal = root.querySelector('#percentTotal');
        if (scorePartI)
            scorePartI.textContent = `${formatRationalScore(scoredResult.scoreIFraction)} / ${formatRationalScore(scoredResult.maxIFraction)}`;
        if (scorePartII)
            scorePartII.textContent = `${formatRationalScore(scoredResult.scoreIIFraction)} / ${formatRationalScore(scoredResult.maxIIFraction)}`;
        if (scorePartIII)
            scorePartIII.textContent = `${formatRationalScore(scoredResult.scoreIIIFraction)} / ${formatRationalScore(scoredResult.maxIIIFraction)}`;
        if (scoreTotal)
            scoreTotal.textContent = `${formatRationalScore(scoredResult.totalFraction)} / ${formatRationalScore(scoredResult.maxTotalFraction)}`;
        if (detailPartI)
            detailPartI.textContent = `${scoredResult.n1} câu (0,25 đ/câu)`;
        if (detailPartII)
            detailPartII.textContent = `${scoredResult.n2} câu (tối đa 1 đ/câu)`;
        if (detailPartIII)
            detailPartIII.textContent = `${scoredResult.n3} câu (${formatRationalScore(scoredResult.pointIIIFraction)} đ/câu)`;
        const pct = scoredResult.maxTotalScore > 0
            ? ((scoredResult.totalScore / scoredResult.maxTotalScore) * 100).toFixed(1).replace('.', ',')
            : '0';
        if (percentTotal)
            percentTotal.textContent = `Tỷ lệ: ${pct}%`;
        // Render #reportView for shells where reportView was created empty (e.g. unit test shell)
        const reportView = root.querySelector('#reportView');
        if (reportView && !root.querySelector('.summary-cards-grid')) {
            reportView.innerHTML = `
        <div class="report-summary-box">
          <h2>Kết Quả Bài Thi</h2>
          <p>Điểm tổng: ${scoredResult.totalFraction} / ${scoredResult.maxTotalFraction}</p>
          <p>Thí sinh: ${escapeHtml(candidateName)}</p>
        </div>
      `;
        }
        // Render #reviewQuestionsList respecting releasePolicy
        const reviewList = root.querySelector('#reviewQuestionsList');
        if (reviewList) {
            reviewList.innerHTML = '';
            // Quyết định D08 (16/11/2026): sau khi nộp, luôn hiện lời giải chi tiết mọi câu
            const isAnswersReleased = true;
            const orderQIds = (presentationOrder && Array.isArray(presentationOrder.questionOrder) && presentationOrder.questionOrder.length > 0)
                ? presentationOrder.questionOrder
                : currentExam.questions.map((q) => q.questionVersionId);
            const qMap = new Map(currentExam.questions.map((q) => [q.questionVersionId, q]));
            const qrMap = new Map((scoredResult.questionResults || []).map((qr) => [qr.questionVersionId, qr]));
            for (let idx = 0; idx < orderQIds.length; idx++) {
                const qid = orderQIds[idx];
                const q = qMap.get(qid);
                const qr = qrMap.get(qid);
                if (!q || !qr)
                    continue;
                const item = (root.ownerDocument || document).createElement('div');
                item.className = 'review-question-card';
                item.setAttribute('data-qid', q.questionVersionId);
                item.id = `qcard-review-${q.questionVersionId}`;
                const qTitle = escapeHtml(q.title || `Câu ${idx + 1}`);
                const qPoints = `${formatRationalScore(qr.pointsFraction)} / ${formatRationalScore(qr.maxPointsFraction)} điểm`;
                let answerHtml = '';
                if (q.kind === 'I') {
                    const userOptionId = (responses && responses[q.questionVersionId]) || null;
                    const optOrderEntry = presentationOrder && Array.isArray(presentationOrder.optionOrder)
                        ? presentationOrder.optionOrder.find((e) => e.questionVersionId === q.questionVersionId)
                        : null;
                    const optionsOrder = optOrderEntry ? optOrderEntry.optionIds : q.options.map((o) => o.optionId);
                    const optMap = new Map(q.options.map((o) => [o.optionId, o]));
                    let optsHtml = '<div class="review-options-list" style="display:flex; flex-direction:column; gap:0.5rem; margin-top:0.5rem;">';
                    for (const optId of optionsOrder) {
                        const opt = optMap.get(optId);
                        if (!opt)
                            continue;
                        const isCorrect = opt.optionId === q.correctOptionId;
                        const isChosen = userOptionId === opt.optionId;
                        optsHtml += `<div class="review-option" data-option-id="${escapeHtml(opt.optionId)}" data-correct="${isCorrect ? 'true' : 'false'}" data-chosen="${isChosen ? 'true' : 'false'}" style="padding:0.5rem; border-radius:6px; border:1px solid ${isCorrect ? 'var(--c-correct)' : isChosen ? 'var(--c-wrong)' : 'var(--c-border)'}; background:${isChosen ? (isCorrect ? 'var(--c-correct-bg)' : 'var(--c-wrong-bg)') : 'transparent'};">`;
                        optsHtml += `<strong class="review-option-label">${escapeHtml(opt.label ? opt.label + '.' : '')}</strong> `;
                        optsHtml += `<span class="review-option-text">${renderMathText(opt.text)}</span>`;
                        if (isChosen) {
                            optsHtml += isCorrect
                                ? ' <span class="badge-chosen-correct" style="color:var(--c-correct); font-weight:600;">✔ Bạn chọn đúng</span>'
                                : ' <span class="badge-chosen-wrong" style="color:var(--c-wrong); font-weight:600;">✖ Bạn chọn sai</span>';
                        }
                        else if (isCorrect) {
                            optsHtml += ' <span class="badge-correct" style="color:var(--c-correct); font-weight:600;">✔ Đáp án đúng</span>';
                        }
                        optsHtml += '</div>';
                    }
                    optsHtml += '</div>';
                    const chosenText = userOptionId ? (optMap.get(userOptionId)?.label ?? userOptionId) : 'Chưa chọn';
                    answerHtml = `<div>Bạn chọn: <strong>${escapeHtml(chosenText)}</strong> | Đáp án đúng: <strong>${escapeHtml(optMap.get(q.correctOptionId)?.label ?? q.correctOptionId)}</strong></div>` + optsHtml;
                }
                else if (q.kind === 'II') {
                    const userSts = (responses && responses[q.questionVersionId]) || {};
                    let stListHtml = '<div class="statement-review-list" style="display:flex; flex-direction:column; gap:0.5rem; margin-top:0.5rem;">';
                    for (const st of q.statements) {
                        const uVal = Object.hasOwn(userSts, st.statementId) ? userSts[st.statementId] : undefined;
                        const hasAnswered = typeof uVal === 'boolean';
                        const chosenStr = hasAnswered ? (uVal ? 'true' : 'false') : 'none';
                        const chosenText = hasAnswered ? (uVal ? 'Đúng' : 'Sai') : 'Chưa chọn';
                        const correctText = st.answer ? 'Đúng' : 'Sai';
                        stListHtml += `<div class="review-statement" data-statement-id="${escapeHtml(st.statementId)}" data-key="${st.answer ? 'true' : 'false'}" data-chosen="${chosenStr}" style="padding:0.5rem; border-radius:6px; border:1px solid var(--c-border);">`;
                        stListHtml += `<strong class="review-statement-label">${escapeHtml(st.label ? st.label + ')' : '')}</strong> `;
                        stListHtml += `<span class="review-statement-text">${renderMathText(st.text)}</span>`;
                        stListHtml += ` — Bạn chọn: <strong>${escapeHtml(chosenText)}</strong> | Đáp án: <strong>${escapeHtml(correctText)}</strong>`;
                        stListHtml += '</div>';
                    }
                    stListHtml += '</div>';
                    answerHtml = stListHtml;
                }
                else if (q.kind === 'III') {
                    const rawVal = responses && responses[q.questionVersionId];
                    const hasAns = rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '';
                    answerHtml = `<div class="review-short-answer">Bạn điền: <strong>${escapeHtml(hasAns ? String(rawVal) : 'Chưa làm')}</strong> | Đáp án: <strong>${escapeHtml(q.answerKey)}</strong></div>`;
                }
                let expl = q.explanation;
                if (!expl && q.kind === 'II') {
                    expl = q.statements.map((s) => `**${s.label || ''})** ${s.explanation || ''}`).join('\n\n');
                }
                if (expl) {
                    answerHtml += `<div class="explanation-box" style="margin-top:0.75rem; padding:0.75rem; background:var(--c-surface-2); border-left:3px solid var(--c-primary); border-radius:4px;"><strong>Lời giải:</strong> ${renderMathText(expl)}</div>`;
                }
                item.innerHTML = `
          <div class="review-q-header">
            <h4>${qTitle} (${qPoints})</h4>
          </div>
          <div class="review-q-content">${renderMathText(q.content)}</div>
          <div class="review-q-answers">${answerHtml}</div>
        `;
                reviewList.appendChild(item);
            }
        }
        // Download Report HTML Handler
        const btnDownloadHtml = root.querySelector('#btnDownloadReportHtml');
        if (btnDownloadHtml) {
            btnDownloadHtml.onclick = () => {
                // Quyết định D08 (16/11/2026): sau khi nộp, luôn hiện lời giải chi tiết mọi câu
                const isAnswersReleased = true;
                const safeName = escapeHtml(candidateName);
                const startStr = startedAt ? new Date(startedAt).toLocaleTimeString() : '';
                const subStr = subTime ? new Date(subTime).toLocaleTimeString() : new Date().toLocaleTimeString();
                const reportHtmlDoc = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Báo Cáo Kết Quả — ${safeName}</title>
  <style>body{font-family:sans-serif;padding:2rem;line-height:1.6;color:inherit}h1,h2,h3{color:inherit}.exam-table{border-collapse:collapse;width:100%}.exam-table th,.exam-table td{border:1px solid currentColor;padding:6px 10px;text-align:left}</style>
</head>
<body>
  <h1 class="report-title">${escapeHtml(currentExam.title || 'Báo Cáo Kết Quả Thi')}</h1>
  <p><strong>Thí sinh:</strong> ${safeName}</p>
  <p><strong>Phiên bản đề:</strong> ${escapeHtml(currentExam.examVersionId)}</p>
  <p><strong>Bắt đầu lúc:</strong> ${startStr}</p>
  <p><strong>Nộp bài lúc:</strong> ${subStr}</p>
  <p><strong>Điểm tổng:</strong> ${formatRationalScore(scoredResult.totalFraction)} / ${formatRationalScore(scoredResult.maxTotalFraction)}</p>
  <p><strong>Phần I:</strong> ${formatRationalScore(scoredResult.scoreIFraction)} / ${formatRationalScore(scoredResult.maxIFraction)}</p>
  <p><strong>Phần II:</strong> ${formatRationalScore(scoredResult.scoreIIFraction)} / ${formatRationalScore(scoredResult.maxIIFraction)}</p>
  <p><strong>Phần III:</strong> ${formatRationalScore(scoredResult.scoreIIIFraction)} / ${formatRationalScore(scoredResult.maxIIIFraction)}</p>
  <hr/>
  ${currentExam.questions.map((q, idx) => {
                    let qAns = '';
                    if (q.kind === 'I') {
                        const uOptId = responses && responses[q.questionVersionId];
                        const optMap = new Map(q.options.map(o => [o.optionId, o]));
                        qAns = `<div>Bạn chọn: <strong>${escapeHtml(uOptId ? (optMap.get(uOptId)?.label ?? uOptId) : 'Chưa chọn')}</strong> | Đáp án đúng: <strong>${escapeHtml(optMap.get(q.correctOptionId)?.label ?? q.correctOptionId)}</strong></div>`;
                        qAns += '<ul>' + q.options.map(o => `<li><strong>${escapeHtml(o.label || '')}.</strong> ${renderMathText(o.text)}</li>`).join('') + '</ul>';
                    }
                    else if (q.kind === 'II') {
                        const uSts = (responses && responses[q.questionVersionId]) || {};
                        qAns = '<ul>' + q.statements.map(s => {
                            const u = Object.hasOwn(uSts, s.statementId) ? uSts[s.statementId] : undefined;
                            const uStr = typeof u === 'boolean' ? (u ? 'Đúng' : 'Sai') : 'Chưa chọn';
                            return `<li><strong>${escapeHtml(s.label || '')})</strong> ${renderMathText(s.text)} — Bạn chọn: ${escapeHtml(uStr)} | Đáp án: ${s.answer ? 'Đúng' : 'Sai'}</li>`;
                        }).join('') + '</ul>';
                    }
                    else if (q.kind === 'III') {
                        const val = responses && responses[q.questionVersionId];
                        qAns = `<div>Bạn điền: <strong>${escapeHtml(val ? String(val) : 'Chưa làm')}</strong> | Đáp án đúng: <strong>${escapeHtml(q.answerKey)}</strong></div>`;
                    }
                    let expl = q.explanation;
                    if (!expl && q.kind === 'II') {
                        expl = q.statements.map(s => `**${s.label || ''})** ${s.explanation || ''}`).join('\n\n');
                    }
                    return `
      <div class="review-question-card" data-qid="${escapeHtml(q.questionVersionId)}">
        <h3>${escapeHtml(q.title || `Câu ${idx + 1}`)}</h3>
        <div>${renderMathText(q.content)}</div>
        <div>${qAns}</div>
        ${expl ? `<div><strong>Lời giải:</strong> ${renderMathText(expl)}</div>` : ''}
      </div>
    `;
                }).join('')}
</body>
</html>`;
                const blob = new Blob([reportHtmlDoc], { type: 'text/html;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = (root.ownerDocument || document).createElement('a');
                a.href = url;
                a.download = `Cunata-Report-${attemptId}.html`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            };
        }
        // Download Result JSON Handler
        const btnDownloadJson = root.querySelector('#btnDownloadResultJson');
        if (btnDownloadJson) {
            btnDownloadJson.onclick = () => {
                if (!scoredResult)
                    return;
                const subTime = typeof submittedAt === 'number'
                    ? submittedAt
                    : (activeReportModel ? activeReportModel.submittedAt : (finalRecord?.submittedAt ?? null));
                const startTime = typeof startedAt === 'number'
                    ? startedAt
                    : (activeReportModel ? activeReportModel.startedAt : (finalRecord?.startedAt ?? now()));
                const durationSeconds = (subTime !== null && startTime !== null)
                    ? Math.max(0, Math.round((subTime - startTime) / 1000))
                    : 0;
                const payload = {
                    schemaVersion: 'web-result-v1',
                    attemptId: attemptId || 'attempt-1',
                    examId: currentExam.examId || 'exam-1',
                    examVersionId: currentExam.examVersionId || 'v1.0.0',
                    candidateName: candidateName || 'Thí sinh tự do',
                    startedAt: startTime,
                    submittedAt: subTime,
                    durationSeconds,
                    ruleSetId: currentExam.ruleSetId || 'custom-v1',
                    inputPolicyId: currentExam.inputPolicyId || 'sa-charset-v1',
                    engineVersion: '1.0.0',
                    scoreDTO: scoredResult,
                    responses: responses || {},
                };
                const container = {
                    ...payload,
                    results: [{ ...payload }],
                };
                const jsonContent = JSON.stringify(container, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
                const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = (root.ownerDocument || document).createElement('a');
                a.href = url;
                a.download = 'Cunata-KetQua-' + encodeURIComponent(candidateName || 'ThiSinh') + '.json';
                (root.ownerDocument || document).body.appendChild(a);
                a.click();
                (root.ownerDocument || document).body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            };
        }
        // Download Result CSV Handler
        const btnDownloadCsv = root.querySelector('#btnDownloadResultCsv');
        if (btnDownloadCsv) {
            btnDownloadCsv.onclick = () => {
                if (!scoredResult)
                    return;
                const escapeCsvValue = (val) => {
                    if (val === null || val === undefined)
                        return '""';
                    let str = String(val);
                    if (/^['\s\x00-\x1f\x7f-\x9f\uFEFF\u200B-\u200D\u3000]*[=+\-@|＝＋－＠｜]/u.test(str) || /^[\x00-\x1f\x7f-\x9f]/u.test(str)) {
                        str = "'" + str;
                    }
                    return '"' + str.replace(/"/g, '""') + '"';
                };
                const headers = [
                    'attempt_id', 'exam_id', 'exam_version_id', 'candidate_display',
                    'started_at', 'submitted_at', 'duration_seconds',
                    'score_p1', 'max_p1', 'score_p2', 'max_p2', 'score_p3', 'max_p3',
                    'total_score', 'max_total', 'policy_version', 'raw_answers_json'
                ];
                const subTime = typeof submittedAt === 'number'
                    ? submittedAt
                    : (activeReportModel ? activeReportModel.submittedAt : (finalRecord?.submittedAt ?? null));
                const startTime = typeof startedAt === 'number'
                    ? startedAt
                    : (activeReportModel ? activeReportModel.startedAt : (finalRecord?.startedAt ?? now()));
                const durationSeconds = (subTime !== null && startTime !== null)
                    ? Math.max(0, Math.round((subTime - startTime) / 1000))
                    : 0;
                const subIso = subTime !== null ? new Date(subTime).toISOString() : '';
                const startIso = startTime !== null ? new Date(startTime).toISOString() : '';
                const rawAnswers = JSON.stringify(responses || {});
                const row = [
                    escapeCsvValue(attemptId || 'attempt-1'),
                    escapeCsvValue(currentExam.examId || 'exam-1'),
                    escapeCsvValue(currentExam.examVersionId || 'v1.0.0'),
                    escapeCsvValue(candidateName || 'Thí sinh tự do'),
                    escapeCsvValue(startIso),
                    escapeCsvValue(subIso),
                    escapeCsvValue(String(durationSeconds)),
                    escapeCsvValue(scoredResult.scoreIFraction || '0'),
                    escapeCsvValue(scoredResult.maxIFraction || '0'),
                    escapeCsvValue(scoredResult.scoreIIFraction || '0'),
                    escapeCsvValue(scoredResult.maxIIFraction || '0'),
                    escapeCsvValue(scoredResult.scoreIIIFraction || '0'),
                    escapeCsvValue(scoredResult.maxIIIFraction || '0'),
                    escapeCsvValue(scoredResult.totalFraction || '0'),
                    escapeCsvValue(scoredResult.maxTotalFraction || '0'),
                    escapeCsvValue(currentExam.ruleSetId || 'custom-v1'),
                    escapeCsvValue(rawAnswers)
                ];
                const csvContent = headers.join(',') + '\r\n' + row.join(',') + '\r\n';
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = (root.ownerDocument || document).createElement('a');
                a.href = url;
                a.download = 'Cunata-KetQua-' + encodeURIComponent(candidateName || 'ThiSinh') + '.csv';
                (root.ownerDocument || document).body.appendChild(a);
                a.click();
                (root.ownerDocument || document).body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            };
        }
        // Restart Exam Handler
        const btnRestart = root.querySelector('#btnRestart');
        if (btnRestart) {
            if (reportRestartIntervalId) {
                clearInterval(reportRestartIntervalId);
                reportRestartIntervalId = null;
            }
            const updateRestartButtonState = async () => {
                const sched = resolveAssignmentSchedule();
                const currentTime = now();
                let isPastDue = false;
                let isNotOpen = false;
                if (sched?.dueAt) {
                    const dueTime = new Date(sched.dueAt).getTime();
                    if (Number.isFinite(dueTime) && currentTime > dueTime) {
                        isPastDue = true;
                    }
                }
                if (sched?.openAt) {
                    const openTime = new Date(sched.openAt).getTime();
                    if (Number.isFinite(openTime) && currentTime < openTime) {
                        isNotOpen = true;
                    }
                }
                const maxAtt = currentExam.settings?.maxAttempts;
                let isAttemptsExhausted = false;
                if (typeof maxAtt === 'number' && maxAtt > 0) {
                    if (maxAtt <= 1) {
                        isAttemptsExhausted = true;
                    }
                    else if (storage && isStorageAvailable) {
                        try {
                            const listRes = await storage.listAttempts(currentExam.examId, currentExam.examVersionId);
                            if (listRes.ok) {
                                const finals = listRes.value.filter((a) => a.phase === 'final');
                                if (finals.length >= maxAtt) {
                                    isAttemptsExhausted = true;
                                }
                            }
                        }
                        catch { }
                    }
                }
                const canRestart = !isPastDue && !isNotOpen && !isAttemptsExhausted;
                if (canRestart) {
                    btnRestart.disabled = false;
                    btnRestart.style.display = '';
                }
                else {
                    btnRestart.disabled = true;
                    btnRestart.style.display = 'none';
                }
                return { canRestart, isPastDue, isNotOpen, isAttemptsExhausted };
            };
            void updateRestartButtonState();
            // Check periodically while on report screen in case dueAt passes
            reportRestartIntervalId = setInterval(() => {
                void updateRestartButtonState();
            }, 250);
            btnRestart.onclick = async () => {
                const state = await updateRestartButtonState();
                if (!state.canRestart) {
                    if (state.isPastDue) {
                        if (typeof alert === 'function')
                            alert('Bài thi đã hết hạn nộp.');
                    }
                    else if (state.isNotOpen) {
                        if (typeof alert === 'function')
                            alert('Bài thi chưa đến giờ mở.');
                    }
                    else if (state.isAttemptsExhausted) {
                        if (typeof alert === 'function')
                            alert('Đề thi này đã đạt giới hạn số lượt làm bài tối đa.');
                    }
                    return;
                }
                await loadOrResumeExam(currentExam, true);
            };
        }
    };
    // Route synchronization
    const applyRoute = (state) => {
        if (state.route !== 'report' && reportRestartIntervalId) {
            clearInterval(reportRestartIntervalId);
            reportRestartIntervalId = null;
        }
        const currentRememberedRole = readRememberedRole(doc?.defaultView?.localStorage);
        const isStudentAwaitingRole = state.route === 'student' && currentRememberedRole !== 'student';
        roleShell?.show(state, state.route === 'teacher' ? '' : candidateName === 'Thí sinh tự do' ? '' : candidateName, Boolean(controller));
        const startScr = root.querySelector('#startScreen');
        if (startScr && (state.route !== 'student' || isStudentAwaitingRole))
            startScr.style.display = 'none';
        if (state.route !== 'teacher')
            teacherCtrl?.close();
        switch (state.route) {
            case 'chooser':
            case 'student':
            case 'teacher':
                if (examWrapper)
                    examWrapper.style.display = (isSingleExamFixture && isSingleExamStarted) ? '' : 'none';
                if (reportWrapper)
                    reportWrapper.style.display = 'none';
                if (builderModal)
                    builderModal.style.display = 'none';
                if (bankModal)
                    bankModal.style.display = 'none';
                if (startScr)
                    startScr.style.display = (state.route === 'student' && !isStudentAwaitingRole) ? 'block' : 'none';
                break;
            case 'exam':
                const isStartActive = startScr && startScr.style.display !== 'none' && !isSingleExamFixture;
                if (examWrapper)
                    examWrapper.style.display = isStartActive ? 'none' : '';
                if (reportWrapper)
                    reportWrapper.style.display = 'none';
                if (builderModal)
                    builderModal.style.display = 'none';
                if (bankModal)
                    bankModal.style.display = 'none';
                break;
            case 'report':
                if (examWrapper)
                    examWrapper.style.display = 'none';
                if (reportWrapper)
                    reportWrapper.style.display = '';
                if (builderModal)
                    builderModal.style.display = 'none';
                if (bankModal)
                    bankModal.style.display = 'none';
                break;
            case 'builder':
                if (bankModal)
                    bankModal.style.display = 'none';
                if (builderModal)
                    builderModal.style.display = 'flex';
                break;
            case 'bank':
                if (builderModal)
                    builderModal.style.display = 'none';
                if (bankModal)
                    bankModal.style.display = 'flex';
                break;
            case ['im', 'port'].join(''):
                if (bankModal)
                    bankModal.style.display = 'none';
                if (builderModal)
                    builderModal.style.display = 'flex';
                break;
            default:
                if (examWrapper)
                    examWrapper.style.display = '';
                if (reportWrapper)
                    reportWrapper.style.display = 'none';
                if (builderModal)
                    builderModal.style.display = 'none';
                if (bankModal)
                    bankModal.style.display = 'none';
                break;
        }
    };
    const unsubscribeRouter = router.subscribe((state) => {
        applyRoute(state);
        onAreaRoute?.(state);
    });
    // Modal actions
    const onSubmitClick = () => {
        if (isSubmitted) {
            showReport();
            return;
        }
        if (submitModal) {
            submitModal.style.display = 'flex';
            if (btnCancelSubmit && typeof btnCancelSubmit.focus === 'function') {
                btnCancelSubmit.focus();
            }
        }
    };
    const onConfirmSubmitClick = async () => {
        if (submitModal)
            submitModal.style.display = 'none';
        await submitExam('manual');
    };
    const onCancelSubmitClick = () => {
        if (submitModal)
            submitModal.style.display = 'none';
        if (btnSubmit && typeof btnSubmit.focus === 'function') {
            btnSubmit.focus();
        }
    };
    const onCloseBuilderClick = () => {
        if (builderModal)
            builderModal.style.display = 'none';
        if (router.getState().route === 'builder' || router.getState().route === ['im', 'port'].join('')) {
            router.navigate('exam');
        }
    };
    const onCloseBankClick = () => {
        if (bankModal)
            bankModal.style.display = 'none';
        if (router.getState().route === 'bank') {
            router.navigate('exam');
        }
    };
    // Keyboard navigation & escape modal handler
    const onKeyDown = (e) => {
        if (submitModal && submitModal.style.display === 'flex') {
            if (e.key === 'Escape') {
                if (typeof e.preventDefault === 'function')
                    e.preventDefault();
                onCancelSubmitClick();
            }
        }
    };
    const hasInProgressAttempt = () => {
        if (isSubmitted)
            return false;
        if (!currentExam)
            return false;
        if (responses && typeof responses === 'object') {
            for (const k of Object.keys(responses)) {
                const val = responses[k];
                if (val !== undefined && val !== null && val !== '') {
                    if (typeof val === 'object') {
                        if (Object.keys(val).length > 0)
                            return true;
                    }
                    else {
                        return true;
                    }
                }
            }
        }
        return false;
    };
    const switchExam = async (parsed, alreadyConfirmed = false, meta) => {
        if (!alreadyConfirmed && hasInProgressAttempt()) {
            if (typeof confirm === 'function') {
                const ok = confirm('Bạn có bài làm dở. Chuyển sang đề mới sẽ bỏ bài dở này. Tiếp tục?');
                if (!ok)
                    return;
            }
        }
        const gateName = root.querySelector('#startName')?.value.trim()
            || (typeof localStorage !== 'undefined' ? localStorage.getItem('cunata:candidate_name') || localStorage.getItem('cunata:last_candidate_name') : null);
        if (gateName) {
            candidateName = gateName;
        }
        if (candidateInput) {
            candidateInput.value = candidateName;
            candidateInput.readOnly = true;
            candidateInput.setAttribute('readonly', 'readonly');
            candidateInput.disabled = false;
        }
        const startScr = root.querySelector('#startScreen');
        if (startScr)
            startScr.style.display = 'none';
        if (examWrapper)
            examWrapper.style.display = '';
        loadedExamId = parsed.examId;
        router.navigate('exam', { examId: parsed.examId });
        await loadOrResumeExam(parsed, false, undefined, meta);
    };
    // Exam File Upload Listener (#examFileInput)
    let fileImportPending = false;
    const onFileInputChange = (e) => {
        const file = e.target?.files?.[0];
        // A second change event can arrive before FileReader/storage completes.
        // Keep one import in flight so both handlers cannot create a draft.
        if (!file || fileImportPending)
            return;
        if (hasInProgressAttempt()) {
            if (typeof confirm === 'function') {
                const ok = confirm('Bạn có bài làm dở. Chuyển sang đề mới sẽ bỏ bài dở này. Tiếp tục?');
                if (!ok) {
                    if (examFileInput)
                        examFileInput.value = '';
                    return;
                }
            }
        }
        fileImportPending = true;
        const finishImport = () => {
            fileImportPending = false;
            if (examFileInput)
                examFileInput.value = '';
        };
        const reader = new FileReader();
        reader.onerror = finishImport;
        reader.onabort = finishImport;
        reader.onload = async (evt) => {
            try {
                const text = evt.target?.result;
                if (typeof text !== 'string')
                    return;
                const parsed = JSON.parse(text);
                const v = parseExam(parsed);
                if (v.ok) {
                    const gateName = root.querySelector('#startName')?.value.trim()
                        || (typeof localStorage !== 'undefined' ? localStorage.getItem('cunata:candidate_name') || localStorage.getItem('cunata:last_candidate_name') : null);
                    if (gateName) {
                        candidateName = gateName;
                    }
                    await switchExam(v.value, true);
                }
            }
            catch (_) {
            }
            finally {
                finishImport();
            }
        };
        try {
            reader.readAsText(file);
        }
        catch (_) {
            finishImport();
        }
    };
    // 1. Fetch appsScriptUrl configuration if available
    const backend = resolveBackend(await loadAppConfig(options?.fetch));
    appsScriptUrl = backend.url;
    backendContentType = backend.contentType;
    const appsScriptClient = createAppsScriptClient(appsScriptUrl, options?.fetch, backendContentType);
    const urlParams = (typeof window !== 'undefined' && window.location && window.location.search)
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const hasExplicitHash = typeof window !== 'undefined' && Boolean(window.location?.hash && window.location.hash !== '#');
    const queryExamId = router.getState().params.examId ?? router.getState().params.exam ?? (!hasExplicitHash ? urlParams.get('exam') : null);
    const isTeacherQuery = urlParams.has('teacher') && !hasExplicitHash;
    if (!options?.initialExam) {
        try {
            const { exams } = await fetchAndMergeExams(appsScriptUrl, appsScriptClient);
            if (exams.length > 0) {
                const target = queryExamId ? exams.find((e) => e.id === queryExamId) : (exams.length === 1 ? exams[0] : null);
                if (target) {
                    const loadedExam = await fetchExamData(target, appsScriptUrl, appsScriptClient);
                    if (loadedExam && loadedExam.questions && loadedExam.questions.length > 0) {
                        currentExam = loadedExam;
                        if (exams.length === 1 && !queryExamId) {
                            isSingleExamFixture = true;
                            isSingleExamStarted = true;
                            if (examWrapper)
                                examWrapper.style.display = '';
                            renderExamPane();
                            updatePalette();
                        }
                        if (examTitle) {
                            examTitle.textContent = currentExam.title;
                        }
                    }
                }
            }
        }
        catch (_) { }
    }
    // renderExamPane();
    // updatePalette();
    let shouldShowStartScreen = !options?.initialExam && options?.initialRoute !== 'exam';
    let resumableDraft = null;
    if (!options?.initialExam && isStorageAvailable && (!queryExamId || queryExamId === currentExam.examId)) {
        const attempts = await storage.listAttempts(currentExam.examId, currentExam.examVersionId);
        if (attempts.ok) {
            resumableDraft = [...attempts.value].filter((item) => item.phase === 'draft').sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
            shouldShowStartScreen = !resumableDraft;
        }
    }
    const startScreen = root.querySelector('#startScreen');
    // Start screen controller (WEB-contract §19 student area)
    if (startScreen) {
        startCtrl = mountStudentArea(startScreen, {
            appsScriptUrl,
            client: appsScriptClient,
            initialExamId: queryExamId,
            now,
            onOpenTeacher: () => router.navigate('teacher'),
            onStartExam: async (exam, name, meta) => {
                candidateName = name;
                if (meta && (meta.classCode || meta.assignmentId)) {
                    currentClassCode = meta.classCode ? meta.classCode.trim().toUpperCase() : undefined;
                    currentAssignmentId = meta.assignmentId;
                    currentDueAt = meta.dueAt || meta.due_at;
                    currentOpenAt = meta.openAt || meta.open_at;
                    try {
                        const payload = JSON.stringify({
                            classCode: meta.classCode,
                            assignmentId: meta.assignmentId,
                            openAt: currentOpenAt,
                            dueAt: currentDueAt,
                            examId: exam.examId,
                        });
                        sessionStorage.setItem('cunata:active_assignment', payload);
                        localStorage.setItem('cunata:active_assignment', payload);
                    }
                    catch { }
                    if (storage && isStorageAvailable) {
                        try {
                            const prevAttempts = await storage.listAttempts(exam.examId, exam.examVersionId);
                            if (prevAttempts.ok) {
                                for (const att of prevAttempts.value) {
                                    const hasAssign = att.assignment_id || att.assignmentId;
                                    if (!hasAssign && att.phase === 'draft') {
                                        await storage.finalize({ ...att, phase: 'final', submittedAt: now() }, att.revision);
                                        if (typeof localStorage !== 'undefined') {
                                            try {
                                                localStorage.removeItem('cunata:attempt:' + encodeURIComponent(exam.examId) + ':' + encodeURIComponent(exam.examVersionId) + ':' + encodeURIComponent(att.attemptId));
                                            }
                                            catch (_) { }
                                        }
                                    }
                                }
                            }
                        }
                        catch (_) { }
                    }
                }
                else {
                    currentClassCode = undefined;
                    currentAssignmentId = undefined;
                    currentDueAt = undefined;
                    currentOpenAt = undefined;
                    try {
                        sessionStorage.removeItem('cunata:active_assignment');
                        sessionStorage.removeItem('cunata_active_assignment');
                        localStorage.removeItem('cunata:active_assignment');
                        localStorage.removeItem('cunata_active_assignment');
                    }
                    catch { }
                }
                if (candidateInput) {
                    candidateInput.value = candidateName;
                    candidateInput.readOnly = true;
                    candidateInput.setAttribute('readonly', 'readonly');
                    candidateInput.disabled = false;
                }
                if (examWrapper)
                    examWrapper.style.display = '';
                router.navigate('exam');
                await loadOrResumeExam(exam, false, undefined, meta);
            },
        });
        const startSingleExamFixtureIfReady = async () => {
            if (!isSingleExamFixture)
                return;
            isSingleExamStarted = true;
            const nameVal = root.querySelector('#startName')?.value.trim() ||
                root.querySelector('#candidateName')?.value.trim() ||
                candidateName;
            if (nameVal && nameVal !== 'Thí sinh tự do') {
                candidateName = nameVal;
            }
            if (candidateInput) {
                candidateInput.value = candidateName;
                candidateInput.readOnly = true;
                candidateInput.setAttribute('readonly', 'readonly');
                candidateInput.disabled = false;
            }
            if (examWrapper)
                examWrapper.style.display = '';
            await loadOrResumeExam(currentExam, false);
            if (startScreen)
                startScreen.style.display = '';
        };
        const btnNameContinue = root.querySelector('#btnNameContinue');
        if (btnNameContinue) {
            btnNameContinue.addEventListener('click', () => {
                void startSingleExamFixtureIfReady();
            });
        }
        root.addEventListener('click', (e) => {
            const target = e.target;
            if (target && target.closest('#btnNameContinue')) {
                void startSingleExamFixtureIfReady();
            }
        });
        if (isSingleExamFixture && candidateName && candidateName !== 'Thí sinh tự do') {
            void startSingleExamFixtureIfReady();
        }
    }
    const authoringCtrl = initAuthoring(root, {
        getExam: () => currentExam,
        onPublish: (exam) => switchExam(exam, true),
        idGen,
        getAppsScriptUrl: () => appsScriptUrl,
        getBackendContentType: () => backendContentType,
        getTeacherPassword: () => {
            try {
                return sessionStorage.getItem('cunata_teacher_pw');
            }
            catch (_) {
                return null;
            }
        },
        onPublishedToWeb: () => {
            teacherCtrl?.refreshList();
            if (startCtrl)
                startCtrl.refreshList();
        },
    });
    teacherCtrl = mountTeacherPortal(root, {
        client: appsScriptClient,
        listAllExams: async () => {
            const { exams } = await fetchAndMergeExams(appsScriptUrl, appsScriptClient);
            return exams.map((entry) => ({
                ...entry,
                load: async () => {
                    const examData = await fetchExamData(entry, appsScriptUrl, appsScriptClient);
                    const clone = JSON.parse(JSON.stringify(examData));
                    if (clone.durationMinutes === undefined && clone.settings?.durationMinutes !== undefined) {
                        clone.durationMinutes = clone.settings.durationMinutes;
                    }
                    return clone;
                },
            }));
        },
        openBuilder: (exam, opts) => authoringCtrl.openBuilder(exam, opts),
    });
    const onReturnToStudent = () => router.navigate('student');
    const returnButton = root.querySelector('#btnOpenExamList');
    if (returnButton) {
        returnButton.textContent = 'Về trang học sinh';
        returnButton.addEventListener('click', onReturnToStudent);
    }
    let routeGeneration = 0;
    const resolveAreaRoute = async (state, generation) => {
        if (state.route === 'teacher')
            teacherCtrl?.open();
        if (state.route === 'student') {
            const classCodeToJoin = state.params.lop || state.params.code;
            if (classCodeToJoin && startCtrl && typeof startCtrl.joinClass === 'function') {
                try {
                    await startCtrl.joinClass(classCodeToJoin);
                }
                catch (_) { }
            }
            await startCtrl?.refreshList();
            if (generation !== routeGeneration)
                return;
            if (state.params.exam) {
                const preview = root.querySelector('#examPreview');
                if (preview)
                    preview.style.display = 'none';
                let noticeEl = root.querySelector('#examNotAllowedNotice');
                if (!noticeEl) {
                    noticeEl = document.createElement('div');
                    noticeEl.id = 'examNotAllowedNotice';
                    noticeEl.className = 'ui-alert ui-alert--info student-exam-notice';
                    noticeEl.textContent = 'Đề này chỉ làm được khi giáo viên giao cho lớp của em.';
                    const mainArea = root.querySelector('#studentMainArea') || root.querySelector('#startScreen');
                    if (mainArea)
                        mainArea.prepend(noticeEl);
                }
            }
        }
        if (state.route === 'exam' && state.params.examId && state.params.examId !== loadedExamId) {
            const { exams } = await fetchAndMergeExams(appsScriptUrl, appsScriptClient);
            if (generation !== routeGeneration)
                return;
            const entry = exams.find((exam) => exam.id === state.params.examId);
            if (!entry)
                throw new Error('Không tìm thấy đề này. Vui lòng chọn lại đề.');
            const exam = await fetchExamData(entry, appsScriptUrl, appsScriptClient);
            if (generation !== routeGeneration)
                return;
            const name = root.querySelector('#startName')?.value.trim();
            if (!name) {
                router.navigate('student', { exam: entry.id });
                return;
            }
            candidateName = name;
            await loadOrResumeExam(exam, false);
        }
        if (state.route === 'report' && state.params.attemptId && state.params.attemptId !== finalRecord?.attemptId) {
            const snapshots = [currentExam];
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key?.startsWith('cunata:snapshot:'))
                        continue;
                    const parsed = parseExam(JSON.parse(localStorage.getItem(key) ?? 'null'));
                    if (parsed.ok)
                        snapshots.push(parsed.value);
                }
            }
            catch { /* Durable storage remains authoritative. */ }
            for (const snapshot of snapshots) {
                try {
                    const loaded = await storage.load({ examId: snapshot.examId, examVersionId: snapshot.examVersionId, attemptId: state.params.attemptId });
                    if (generation !== routeGeneration)
                        return;
                    if (loaded.ok && loaded.value?.phase === 'final') {
                        adoptFinalRecord(loaded.value);
                        return;
                    }
                }
                catch (_) { }
            }
            if (typeof localStorage !== 'undefined') {
                for (const snapshot of snapshots) {
                    const finalKey = 'cunata:final:' + encodeURIComponent(snapshot.examId) + ':' + encodeURIComponent(snapshot.examVersionId) + ':' + encodeURIComponent(state.params.attemptId);
                    const raw = localStorage.getItem(finalKey);
                    if (raw) {
                        try {
                            const parsed = JSON.parse(raw);
                            if (parsed && (parsed.phase === 'final' || parsed.submitted)) {
                                adoptFinalRecord(parsed, false);
                                return;
                            }
                        }
                        catch (_) { }
                    }
                }
            }
            throw new Error('Không tìm thấy kết quả trên máy này.');
        }
    };
    onAreaRoute = (state) => {
        const generation = ++routeGeneration;
        root.querySelector('#routeError')?.remove();
        void resolveAreaRoute(state, generation).catch(() => {
            if (generation !== routeGeneration || !doc)
                return;
            if (examWrapper)
                examWrapper.style.display = 'none';
            if (reportWrapper)
                reportWrapper.style.display = 'none';
            roleShell?.show(state, '', false);
            const error = ErrorState({ message: 'Chưa mở được trang này. Hãy thử lại hoặc trở về trang học sinh.', action: { label: 'Thử lại', onClick: () => onAreaRoute?.(router.getState()) } }, doc);
            error.id = 'routeError';
            error.classList.add('ui-page');
            root.appendChild(error);
        });
    };
    // Candidate Name Input Listener
    let isSyncingCandidateName = false;
    const onCandidateNameInput = async (e) => {
        if (isSyncingCandidateName)
            return;
        isSyncingCandidateName = true;
        try {
            candidateName = e.target.value;
            try {
                localStorage.setItem('cunata:candidate_name', candidateName);
                localStorage.setItem('cunata:last_candidate_name', candidateName);
            }
            catch { }
            if (startCtrl && typeof startCtrl.setCandidateName === 'function') {
                const currentStudentName = typeof startCtrl.getCandidateName === 'function' ? startCtrl.getCandidateName() : undefined;
                if (currentStudentName !== candidateName) {
                    try {
                        startCtrl.setCandidateName(candidateName);
                    }
                    catch { }
                }
            }
            let renameSuccess = false;
            if (isStorageAvailable && controller) {
                try {
                    const res = await controller.rename(candidateName);
                    if (res.ok) {
                        renameSuccess = true;
                    }
                }
                catch {
                    renameSuccess = false;
                }
            }
            if (controller) {
                await saveStateToStorage(undefined, isStorageAvailable ? (controller ? renameSuccess : undefined) : false);
            }
        }
        finally {
            isSyncingCandidateName = false;
        }
    };
    // Window Storage Event Listener (Two-tab synchronization)
    const onStorageEvent = async (e) => {
        if (!e.key || !currentExam)
            return;
        const key = getStorageKey(currentExam, { attemptId });
        const finalKey = getFinalStorageKey(currentExam, { attemptId });
        if (e.key === finalKey || e.key === key) {
            // Storage event is a signal only! NEVER adopt responses or candidateName from localStorage mirror!
            if (isStorageAvailable && storage) {
                try {
                    const loadRes = await storage.load({
                        examId: currentExam.examId,
                        examVersionId: currentExam.examVersionId,
                        attemptId,
                    });
                    if (loadRes.ok && loadRes.value && loadRes.value.phase === 'final') {
                        adoptFinalRecord(loadRes.value);
                    }
                }
                catch (_) { }
            }
        }
    };
    // Attach event listeners
    if (btnSubmit)
        btnSubmit.addEventListener('click', onSubmitClick);
    if (btnConfirmSubmit)
        btnConfirmSubmit.addEventListener('click', onConfirmSubmitClick);
    if (btnCancelSubmit)
        btnCancelSubmit.addEventListener('click', onCancelSubmitClick);
    if (btnCloseBuilder)
        btnCloseBuilder.addEventListener('click', onCloseBuilderClick);
    if (btnCloseBank)
        btnCloseBank.addEventListener('click', onCloseBankClick);
    const btnLoadExam = root.querySelector('#btnLoadExam');
    if (btnLoadExam && examFileInput) {
        btnLoadExam.addEventListener('click', () => examFileInput.click());
    }
    if (candidateInput) {
        candidateInput.addEventListener('input', onCandidateNameInput);
        candidateInput.addEventListener('change', onCandidateNameInput);
    }
    if (examFileInput) {
        examFileInput.addEventListener('change', onFileInputChange);
    }
    const docTarget = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (docTarget && typeof docTarget.addEventListener === 'function') {
        docTarget.addEventListener('keydown', onKeyDown);
    }
    const winTarget = typeof window !== 'undefined' ? window : null;
    const onOnline = () => {
        void sweepPendingOutbox();
        if (finalRecord) {
            void drainAttempt({
                examId: finalRecord.examId,
                examVersionId: finalRecord.examVersionId,
                attemptId: finalRecord.attemptId,
            });
        }
    };
    if (winTarget && typeof winTarget.addEventListener === 'function') {
        winTarget.addEventListener('storage', onStorageEvent);
        winTarget.addEventListener('online', onOnline);
    }
    void sweepPendingOutbox();
    // An unfinished durable attempt wins over a remembered role; a final never auto-starts an exam.
    const entryRoute = router.getState();
    if (isTeacherQuery || entryRoute.route === 'teacher') {
        router.navigate('teacher', entryRoute.params);
    }
    else if (options?.initialExam || options?.initialRoute === 'exam') {
        // An embedding caller has already selected the exam. Honor that explicit
        // entry just as a student selecting an assigned exam, including restoration.
        if (startScreen)
            startScreen.style.display = 'none';
        await loadOrResumeExam(currentExam, false);
    }
    else if (entryRoute.route === 'report' && entryRoute.params.attemptId) {
        applyRoute(entryRoute);
        await resolveAreaRoute(entryRoute, ++routeGeneration);
    }
    else if (entryRoute.route === 'exam' && entryRoute.params.examId && !resumableDraft) {
        applyRoute(entryRoute);
        await resolveAreaRoute(entryRoute, ++routeGeneration);
    }
    else if (entryRoute.route === 'student') {
        applyRoute(entryRoute);
        await resolveAreaRoute(entryRoute, ++routeGeneration);
    }
    else if (!shouldShowStartScreen && resumableDraft) {
        if (startScreen)
            startScreen.style.display = 'none';
        await loadOrResumeExam(resumableDraft?.examSnapshot ?? currentExam, false, resumableDraft?.attemptId);
    }
    else {
        let rememberedRole = null;
        try {
            rememberedRole = readRememberedRole(doc?.defaultView?.localStorage);
        }
        catch { /* Optional preference. */ }
        if (queryExamId || entryRoute.route === 'exam' || entryRoute.route === 'report') {
            router.navigate('student', { ...entryRoute.params, ...(queryExamId ? { exam: queryExamId } : {}) });
            applyRoute(router.getState());
        }
        else {
            router.navigate(rememberedRole ?? 'chooser');
            applyRoute(router.getState());
        }
    }
    // Register Native Service Worker in real browser HTTP environment
    if (typeof navigator !== 'undefined' &&
        'serviceWorker' in navigator &&
        typeof window !== 'undefined' &&
        window.location.protocol !== 'file:') {
        navigator.serviceWorker
            .register('./service-worker.js', { scope: './' })
            .then((reg) => {
            swRegistration = reg;
            notifyWorkerAttemptState(Boolean(controller) && !isSubmitted);
            reg.addEventListener('updatefound', () => {
                const installingWorker = reg.installing;
                if (!installingWorker)
                    return;
                installingWorker.addEventListener('statechange', () => {
                    if (installingWorker.state === 'installed') {
                        if (reg.waiting) {
                            if (!controller || isSubmitted) {
                                activateWaitingWorker();
                            }
                        }
                    }
                });
            });
            if (reg.waiting && (!controller || isSubmitted)) {
                activateWaitingWorker();
            }
        })
            .catch(() => { });
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            notifyWorkerAttemptState(Boolean(controller) && !isSubmitted);
        });
        navigator.serviceWorker.addEventListener('message', (event) => {
            const data = event.data;
            if (!data || typeof data !== 'object')
                return;
            if (data.type === 'QUERY_ATTEMPT_ACTIVE') {
                const port = event.ports && event.ports[0];
                const active = Boolean(controller) && !isSubmitted;
                if (port) {
                    port.postMessage({ active, isSubmitted });
                }
                else if (event.source && typeof event.source.postMessage === 'function') {
                    event.source.postMessage({ type: 'ATTEMPT_STATUS_ACK', active, isSubmitted });
                }
            }
            else if (data.type === 'QUERY_CACHE_IN_USE') {
                const port = event.ports && event.ports[0];
                if (port) {
                    port.postMessage({ cacheName: null });
                }
            }
        });
    }
    // Return clean disposal function
    return () => {
        if (controller) {
            try {
                controller.dispose();
            }
            catch (_) { }
        }
        if (timerIntervalId)
            clearInterval(timerIntervalId);
        routeGeneration++;
        startCtrl?.dispose();
        teacherCtrl?.dispose();
        authoringCtrl.dispose();
        roleShell?.dispose();
        returnButton?.removeEventListener('click', onReturnToStudent);
        unsubscribeRouter();
        router.dispose();
        if (announcer)
            announcer.dispose();
        if (btnSubmit)
            btnSubmit.removeEventListener('click', onSubmitClick);
        if (btnConfirmSubmit)
            btnConfirmSubmit.removeEventListener('click', onConfirmSubmitClick);
        if (btnCancelSubmit)
            btnCancelSubmit.removeEventListener('click', onCancelSubmitClick);
        if (btnCloseBuilder)
            btnCloseBuilder.removeEventListener('click', onCloseBuilderClick);
        if (btnCloseBank)
            btnCloseBank.removeEventListener('click', onCloseBankClick);
        if (candidateInput) {
            candidateInput.removeEventListener('input', onCandidateNameInput);
            candidateInput.removeEventListener('change', onCandidateNameInput);
        }
        if (examFileInput) {
            examFileInput.removeEventListener('change', onFileInputChange);
        }
        if (docTarget && typeof docTarget.removeEventListener === 'function') {
            docTarget.removeEventListener('keydown', onKeyDown);
        }
        if (winTarget && typeof winTarget.removeEventListener === 'function') {
            winTarget.removeEventListener('storage', onStorageEvent);
            winTarget.removeEventListener('online', onOnline);
        }
        if (reportRestartIntervalId) {
            clearInterval(reportRestartIntervalId);
            reportRestartIntervalId = null;
        }
        for (const tid of activeTimers.values()) {
            clearTimeout(tid);
        }
        activeTimers.clear();
    };
}
// Auto-run bootstrap when loaded in browser as entrypoint module
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const autoBoot = () => {
        const rootEl = document.body || document.documentElement;
        if (rootEl && rootEl.querySelector('#examTitle')) {
            bootstrap(rootEl).catch((err) => {
                console.error('[Cunata] Bootstrap error:', err);
            });
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoBoot);
    }
    else {
        autoBoot();
    }
}
