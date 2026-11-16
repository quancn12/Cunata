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
import { initExamList, initStartScreen, initTeacherModal } from './exam-list.js';
import { initAuthoring } from './authoring.js';
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
function renderMathText(text) {
    if (!text)
        return '';
    let html = escapeHtml(text);
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
        const cleanSrc = src.trim();
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
        f = f.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1/$2)');
        f = f.replace(/\\sqrt\{([^}]+)\}/g, '&radic;($1)');
        f = f.replace(/\\pm/g, '&plusmn;');
        f = f.replace(/\\neq/g, '&ne;');
        f = f.replace(/\\Leftrightarrow/g, ' &hArr; ');
        f = f.replace(/\\Rightarrow/g, ' &rArr; ');
        f = f.replace(/\\infty/g, '&#8734;');
        f = f.replace(/\\in(?![a-zA-Z])/g, ' &isin; ');
        f = f.replace(/\\Omega/g, '&Omega;');
        f = f.replace(/\^([0-9a-zA-Z+-]+)/g, '<sup>$1</sup>');
        f = f.replace(/_([0-9a-zA-Z+-]+)/g, '<sub>$1</sub>');
        return '<span class="math-expr">' + f + '</span>';
    });
    html = html.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>');
    return '<p>' + html + '</p>';
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
    const syncStatus = createEl('div', 'syncStatus', 'sync-status-badge');
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
    const router = createRouter(options?.initialRoute ?? 'exam');
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
    let attemptId = 'attempt-' + now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    let candidateName = 'Thí sinh tự do';
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
            if (swRegistration?.waiting) {
                swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
                return;
            }
            if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.getRegistration();
                if (reg?.waiting) {
                    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
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
            banner.style.cssText = 'background: #fef2f2; border: 1px solid #f87171; color: #991b1b; padding: 0.5rem 1rem; margin: 0.5rem auto; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; font-size: 0.875rem; max-width: 960px;';
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
        if (examWrapper)
            examWrapper.style.display = 'none';
        if (reportWrapper)
            reportWrapper.style.display = '';
        if (btnSubmit)
            btnSubmit.style.display = 'none';
        if (candidateInput)
            candidateInput.disabled = true;
        router.navigate('report');
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
            reportSubtitle.style.color = 'var(--danger, #ef4444)';
        }
        let errBanner = root.querySelector('#integrityErrorBanner');
        if (!errBanner) {
            errBanner = (root.ownerDocument || document).createElement('div');
            errBanner.id = 'integrityErrorBanner';
            errBanner.className = 'integrity-error-banner';
            if (typeof errBanner.setAttribute === 'function') {
                errBanner.setAttribute('role', 'alert');
            }
            errBanner.style.cssText = 'background: #fef2f2; border: 2px solid #ef4444; color: #991b1b; padding: 1rem 1.5rem; margin: 1rem auto; border-radius: 8px; max-width: 960px;';
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
    const adoptFinalRecord = (record, isDurable = true) => {
        isSubmitted = true;
        notifyWorkerAttemptState(false);
        activateWaitingWorker();
        if (timerIntervalId)
            clearInterval(timerIntervalId);
        if (record.submittedAt) {
            submittedAt = record.submittedAt;
        }
        finalRecord = record;
        if (record.candidateName)
            candidateName = record.candidateName;
        if (candidateInput) {
            candidateInput.value = candidateName;
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
        if (syncText) {
            syncText.textContent = isReallyDurable ? 'Đã nộp & lưu cục bộ' : 'Chưa lưu';
        }
        if (!isReallyDurable) {
            showStorageUnavailableWarning();
        }
        if (typeof showReport === 'function') {
            showReport(record, activeReportModel ?? undefined);
        }
    };
    // Save State helper
    const saveStateToStorage = async (domainResponse, knownSaveOk) => {
        let saveOk = knownSaveOk ?? false;
        // 1. Submit to controller (writes to IndexedDB attempts store)
        if (isStorageAvailable && controller && !isSubmitted) {
            if (domainResponse) {
                try {
                    const res = await controller.answer(domainResponse);
                    if (res.ok) {
                        saveOk = true;
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
                    }
                }
                catch {
                    saveOk = false;
                }
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
                };
                const cr = await storage.saveDraft(record, 1);
                if (cr.ok) {
                    saveOk = true;
                }
                else if (cr.error.code === 'STORAGE_CONFLICT') {
                    const loadRes = await storage.load(record);
                    if (loadRes.ok && loadRes.value && loadRes.value.phase === 'final') {
                        adoptFinalRecord(loadRes.value);
                        return;
                    }
                }
                else {
                    const c2 = await storage.create(record);
                    if (c2.ok)
                        saveOk = true;
                }
            }
            catch {
                saveOk = false;
            }
        }
        // 2. Check if another session finalized in durable storage (NOT from localStorage mirror!)
        if (isStorageAvailable && storage && !isSubmitted) {
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
        // 4. Update syncText based strictly on durable saveOk
        if (syncText) {
            if (saveOk) {
                syncText.textContent = isSubmitted ? 'Đã nộp & lưu cục bộ' : 'Đã lưu';
            }
            else {
                syncText.textContent = 'Chưa lưu';
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
                    row.innerHTML = `<div class="statement-label">${escapeHtml(st.label || '')})</div><div class="statement-text">${renderMathText(st.text || '')}</div><div class="tf-toggle-group"><button type="button" class="tf-btn ${isTrueSelected ? 'selected-true selected' : ''}" data-val="true" aria-pressed="${isTrueSelected ? 'true' : 'false'}">Đúng</button><button type="button" class="tf-btn ${isFalseSelected ? 'selected-false selected' : ''}" data-val="false" aria-pressed="${isFalseSelected ? 'true' : 'false'}">Sai</button></div>`;
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
                wrap.innerHTML = `<div class="short-answer-input-wrap"><input type="text" maxlength="4" class="short-answer-input" placeholder="Ví dụ: -0,5" value="${escapeHtml(curVal)}" autocomplete="off" /></div><div class="quick-keys-bar"><span style="font-size: 0.8125rem; color: var(--gray-600); font-weight: 500;">Phím tắt:</span><button type="button" class="quick-key-btn" data-char="-">- (Dấu âm)</button><button type="button" class="quick-key-btn" data-char=",">, (Dấu phẩy)</button><button type="button" class="quick-key-btn" data-action="clear">Xóa</button></div>`;
                const inputEl = wrap.querySelector('.short-answer-input');
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
                    const handleInputCommit = async (val) => {
                        if (isSubmitted)
                            return;
                        updateAria(val);
                        responses[q.questionVersionId] = val;
                        await saveStateToStorage({
                            kind: 'III',
                            questionVersionId: q.questionVersionId,
                            raw: val,
                        });
                        updatePalette();
                    };
                    inputEl.addEventListener('input', (e) => {
                        handleInputCommit(e.target.value);
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
                        if (btn.dataset.action === 'clear') {
                            responses[q.questionVersionId] = '';
                            if (inputEl)
                                inputEl.value = '';
                            valToSave = '';
                        }
                        else {
                            const ch = btn.dataset.char;
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
                            raw: valToSave,
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
        if (candidateInput && typeof candidateInput.value === 'string' && candidateInput.value.trim()) {
            candidateName = candidateInput.value.trim();
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
                    responses[qid] = inp.value;
                }
            });
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
        activateWaitingWorker();
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
                    finalRecord = subRes.value;
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
                        finalRecord = loadRes.value;
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
                    if (loadRes.ok && loadRes.value && loadRes.value.phase === 'final') {
                        finalRecord = loadRes.value;
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
                const payload = {
                    examId: currentExam.examId,
                    examVersionId: currentExam.examVersionId,
                    attemptId,
                    candidateName,
                    responses,
                    presentationOrder,
                    startedAt,
                    submittedAt,
                    deadline,
                    submitted: true,
                    scoreResult: scoredResult,
                    degradedRescueMirror: !isStorageAvailable,
                };
                const jsonStr = JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
                localStorage.setItem(key, jsonStr);
                localStorage.setItem(finalKey, jsonStr);
            }
            catch {
                // localStorage write error
            }
        }
        if (appsScriptUrl && appsScriptUrl.trim()) {
            if (syncText)
                syncText.textContent = 'Đang gửi...';
            const toRatStr = (val) => {
                if (typeof val === 'string')
                    return val;
                if (!val)
                    return '0';
                if (typeof val === 'object') {
                    const num = val.num !== undefined ? val.num : val.n;
                    const den = val.den !== undefined ? val.den : (val.d !== undefined ? val.d : 1);
                    return (den === 1 || den === 1n || den === '1') ? String(num) : String(num) + '/' + String(den);
                }
                return String(val);
            };
            const scoreDTO = scoreResultToDTO(scoreAttempt(domainExam, domResponses));
            const asPayload = {
                action: 'submitResult',
                attempt_id: attemptId,
                exam_id: currentExam.examId,
                exam_version_id: currentExam.examVersionId,
                candidate_display: candidateName,
                started_at: new Date(startedAt).toISOString(),
                submitted_at: new Date(submittedAt || now()).toISOString(),
                duration_seconds: Math.max(0, Math.round(((submittedAt || now()) - startedAt) / 1000)),
                policy_version: currentExam.ruleSetId || 'custom-v1',
                sections: {
                    I: { score: toRatStr(scoreDTO.sections.I.score), max: toRatStr(scoreDTO.sections.I.max) },
                    II: { score: toRatStr(scoreDTO.sections.II.score), max: toRatStr(scoreDTO.sections.II.max) },
                    III: { score: toRatStr(scoreDTO.sections.III.score), max: toRatStr(scoreDTO.sections.III.max) }
                },
                total: toRatStr(scoreDTO.total),
                maxTotal: toRatStr(scoreDTO.maxTotal),
                raw_answers_json: responses,
            };
            const sendToGas = async (retry = 0) => {
                const MAX_RETRIES = 5;
                try {
                    const res = await fetch(appsScriptUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify(asPayload),
                    });
                    const data = await res.json();
                    if (data && data.success) {
                        if (syncText)
                            syncText.textContent = 'Đã gửi';
                        return;
                    }
                }
                catch (_) { }
                if (syncText)
                    syncText.textContent = 'Chưa gửi được — sẽ thử lại';
                if (retry < MAX_RETRIES) {
                    const delays = [1000, 2000, 4000, 8000, 16000];
                    const delay = delays[retry] || 5000;
                    setTimeout(() => {
                        sendToGas(retry + 1);
                    }, delay);
                }
            };
            sendToGas();
        }
        else {
            if (syncText) {
                syncText.textContent = submitOk ? 'Đã lưu cục bộ' : 'Chưa lưu';
            }
        }
        if (!submitOk) {
            showStorageUnavailableWarning();
        }
        showReport(finalRecord ?? undefined, activeReportModel ?? undefined);
    };
    // Unified load or resume exam helper (CK08-F05)
    const loadOrResumeExam = async (examData, forceNew = false) => {
        currentExam = examData;
        const examId = currentExam.examId;
        const version = currentExam.examVersionId;
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
            let foundAttemptId = null;
            if (typeof localStorage !== 'undefined') {
                const pointerKey = 'cunata:active_attempt:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version);
                foundAttemptId = localStorage.getItem(pointerKey);
                if (!foundAttemptId) {
                    const prefix = 'cunata:attempt:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version) + ':';
                    const finalPrefix = 'cunata:final:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version) + ':';
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k && k.startsWith(prefix)) {
                            foundAttemptId = decodeURIComponent(k.slice(prefix.length));
                            break;
                        }
                        else if (k && k.startsWith(finalPrefix)) {
                            foundAttemptId = decodeURIComponent(k.slice(finalPrefix.length));
                            break;
                        }
                    }
                }
            }
            if (!foundAttemptId && storage && isStorageAvailable) {
                try {
                    const listRes = await storage.listAttempts(examId, version);
                    if (listRes.ok && listRes.value.length > 0) {
                        const sorted = [...listRes.value].sort((a, b) => b.startedAt - a.startedAt);
                        const first = sorted[0];
                        if (first) {
                            foundAttemptId = first.attemptId;
                            resumedRecord = first;
                            isDurableRecord = true;
                        }
                    }
                }
                catch (_) { }
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
        if (resumedRecord && resumedRecord.examId === examId && resumedRecord.examVersionId === version) {
            attemptId = resumedRecord.attemptId;
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
                if (resumedRecord && resumedRecord.scoreDTO) {
                    const mockFinal = {
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
                if (syncText)
                    syncText.textContent = isDurableFinal ? 'Đã nộp & lưu cục bộ' : 'Chưa lưu';
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
            try {
                const startRes = await startAttempt(currentExam, candidateName, { storage, now, id: idGen }, { attemptId });
                if (startRes.ok) {
                    controller = startRes.value;
                }
                else {
                    controller = null;
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
            candidateInput.disabled = false;
        }
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
        router.navigate('exam');
        renderExamPane();
        updatePalette();
        startTimer();
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
        if (examWrapper)
            examWrapper.style.display = 'none';
        if (reportWrapper)
            reportWrapper.style.display = '';
        if (btnSubmit)
            btnSubmit.style.display = 'none';
        if (candidateInput)
            candidateInput.disabled = true;
        if (examTitle && currentExam) {
            examTitle.textContent = currentExam.title || 'Đề thi';
        }
        router.navigate('report');
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
        const reportSubtitle = root.querySelector('#reportSubtitle');
        if (reportSubtitle) {
            reportSubtitle.style.color = '';
            reportSubtitle.textContent = `Thí sinh: ${candidateName} · Nộp bài lúc: ${subTime ? new Date(subTime).toLocaleTimeString() : new Date().toLocaleTimeString()}`;
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
            scoredResult.questionResults.forEach((qr) => {
                const item = (root.ownerDocument || document).createElement('div');
                item.className = 'review-question-card';
                const qTitle = escapeHtml(qr.title || `Câu hỏi ${qr.questionVersionId}`);
                const qPoints = `${formatRationalScore(qr.pointsFraction)} / ${formatRationalScore(qr.maxPointsFraction)} điểm`;
                let answerHtml = '';
                if (isAnswersReleased) {
                    if (qr.kind === 'I') {
                        answerHtml = `<div>Bạn chọn: <strong>${escapeHtml(qr.userAnswer || 'Chưa chọn')}</strong> | Đáp án đúng: <strong>${escapeHtml(qr.correctAnswer || '')}</strong></div>`;
                    }
                    else if (qr.kind === 'II') {
                        answerHtml = `<div class="statement-review-list">` + (qr.stDetails || []).map((st) => `<div>${escapeHtml(st.label || '')}) Bạn chọn: ${escapeHtml(st.userVal)} | Đáp án: ${escapeHtml(st.correctVal)}</div>`).join('') + `</div>`;
                    }
                    else if (qr.kind === 'III') {
                        answerHtml = `<div>Bạn điền: <strong>${escapeHtml(qr.userAnswer || 'Chưa điền')}</strong> | Đáp án đúng: <strong>${escapeHtml(qr.correctAnswer || '')}</strong></div>`;
                    }
                    if (qr.explanation) {
                        answerHtml += `<div class="explanation-box"><strong>Lời giải:</strong> ${renderMathText(qr.explanation)}</div>`;
                    }
                }
                else {
                    answerHtml = `<div><em>Đáp án và lời giải chi tiết sẽ được công bố sau khi hết giờ làm bài.</em></div>`;
                }
                item.innerHTML = `
          <div class="review-q-header">
            <h4>${qTitle} (${qPoints})</h4>
          </div>
          <div class="review-q-content">${renderMathText(qr.content)}</div>
          <div class="review-q-answers">${answerHtml}</div>
        `;
                reviewList.appendChild(item);
            });
        }
        // Download Report HTML Handler
        const btnDownloadHtml = root.querySelector('#btnDownloadReportHtml');
        if (btnDownloadHtml) {
            btnDownloadHtml.onclick = () => {
                // Quyết định D08 (16/11/2026): sau khi nộp, luôn hiện lời giải chi tiết mọi câu
                const isAnswersReleased = true;
                const safeName = escapeHtml(candidateName);
                const reportHtmlDoc = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Báo Cáo Kết Quả — ${safeName}</title>
  <style>body{font-family:sans-serif;padding:2rem;line-height:1.6;color:#1e293b}h1,h2{color:#0f172a}</style>
</head>
<body>
  <h1>Báo Cáo Kết Quả Thi</h1>
  <p><strong>Thí sinh:</strong> ${safeName}</p>
  <p><strong>Điểm tổng:</strong> ${formatRationalScore(scoredResult.totalFraction)} / ${formatRationalScore(scoredResult.maxTotalFraction)}</p>
  <p><strong>Phần I:</strong> ${formatRationalScore(scoredResult.scoreIFraction)} / ${formatRationalScore(scoredResult.maxIFraction)}</p>
  <p><strong>Phần II:</strong> ${formatRationalScore(scoredResult.scoreIIFraction)} / ${formatRationalScore(scoredResult.maxIIFraction)}</p>
  <p><strong>Phần III:</strong> ${formatRationalScore(scoredResult.scoreIIIFraction)} / ${formatRationalScore(scoredResult.maxIIIFraction)}</p>
  <hr/>
  ${(scoredResult.questionResults || []).map((qr) => `
    <div>
      <h3>${escapeHtml(qr.title || '')} (${formatRationalScore(qr.pointsFraction)} / ${formatRationalScore(qr.maxPointsFraction)} điểm)</h3>
      ${isAnswersReleased ? `<div>Bạn trả lời: ${escapeHtml(qr.userAnswer || '')} | Đáp án đúng: ${escapeHtml(qr.correctAnswer || '')}</div>${qr.explanation ? `<div>Lời giải: ${escapeHtml(qr.explanation)}</div>` : ''}` : `<div><em>Đáp án và lời giải chi tiết sẽ được công bố sau khi hết giờ làm bài.</em></div>`}
    </div>
  `).join('')}
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
            const maxAtt = currentExam.settings?.maxAttempts;
            if (typeof maxAtt === 'number' && maxAtt <= 1) {
                btnRestart.disabled = true;
                btnRestart.style.display = 'none';
            }
            else {
                btnRestart.disabled = false;
                btnRestart.style.display = '';
            }
            btnRestart.onclick = async () => {
                const maxAttCurrent = currentExam.settings?.maxAttempts;
                if (typeof maxAttCurrent === 'number' && maxAttCurrent <= 1) {
                    if (typeof alert === 'function')
                        alert('Đề thi này chỉ cho phép làm bài tối đa 1 lượt.');
                    return;
                }
                await loadOrResumeExam(currentExam, true);
            };
        }
    };
    // Route synchronization
    const applyRoute = (state) => {
        switch (state.route) {
            case 'exam':
                const startScr = root.querySelector('#startScreen');
                const isStartActive = startScr && startScr.style.display !== 'none';
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
    applyRoute(router.getState());
    const unsubscribeRouter = router.subscribe((state) => {
        applyRoute(state);
    });
    // Modal actions
    const onSubmitClick = async () => {
        if (isSubmitted) {
            showReport();
            return;
        }
        // Flush active inputs before prompting submit
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
                    responses[qid] = inp.value;
                }
            });
        }
        // Check if finalized concurrently in durable storage (NOT from localStorage mirror!)
        if (isStorageAvailable && storage) {
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
    const switchExam = async (parsed, alreadyConfirmed = false) => {
        if (!alreadyConfirmed && hasInProgressAttempt()) {
            if (typeof confirm === 'function') {
                const ok = confirm('Bạn có bài làm dở. Chuyển sang đề mới sẽ bỏ bài dở này. Tiếp tục?');
                if (!ok)
                    return;
            }
        }
        await loadOrResumeExam(parsed, false);
    };
    // Exam File Upload Listener (#examFileInput)
    const onFileInputChange = (e) => {
        const file = e.target?.files?.[0];
        if (!file)
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
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const text = evt.target?.result;
                if (typeof text !== 'string')
                    return;
                const parsed = JSON.parse(text);
                const v = validateExamVersion(parsed);
                if (v.ok) {
                    switchExam(parsed, true);
                }
            }
            catch (_) { }
        };
        reader.readAsText(file);
    };
    // 1. Fetch appsScriptUrl configuration if available
    try {
        const cfgRes = await fetch('public/config.json');
        if (cfgRes.ok) {
            const cfg = await cfgRes.json();
            if (cfg && typeof cfg.appsScriptUrl === 'string') {
                appsScriptUrl = cfg.appsScriptUrl.trim();
            }
        }
    }
    catch (_) { }
    const urlParams = (typeof window !== 'undefined' && window.location && window.location.search)
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const queryExamId = urlParams.get('exam');
    const isTeacherQuery = urlParams.has('teacher');
    let shouldShowStartScreen = false;
    if (!options?.initialExam) {
        if (queryExamId) {
            let hasDraft = false;
            let hasFinal = false;
            try {
                const draftPrefix = 'cunata:attempt:' + encodeURIComponent(queryExamId) + ':';
                const finalPrefix = 'cunata:final:' + encodeURIComponent(queryExamId) + ':';
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith(draftPrefix)) {
                        const raw = localStorage.getItem(k);
                        if (raw) {
                            const item = JSON.parse(raw);
                            if (item && item.submitted !== true && item.phase !== 'final')
                                hasDraft = true;
                        }
                    }
                    if (k && k.startsWith(finalPrefix))
                        hasFinal = true;
                }
            }
            catch (_) { }
            shouldShowStartScreen = !(hasDraft && !hasFinal);
        }
        else {
            let hasSnapshot = false;
            let hasDraftOrFinal = false;
            try {
                const snapRaw = localStorage.getItem('cunata:active_exam_snapshot');
                if (snapRaw) {
                    const snap = JSON.parse(snapRaw);
                    if (snap && snap.examId) {
                        hasSnapshot = true;
                        const draftPrefix = 'cunata:attempt:' + encodeURIComponent(snap.examId) + ':';
                        const finalPrefix = 'cunata:final:' + encodeURIComponent(snap.examId) + ':';
                        for (let i = 0; i < localStorage.length; i++) {
                            const k = localStorage.key(i);
                            if (k && (k.startsWith(draftPrefix) || k.startsWith(finalPrefix))) {
                                hasDraftOrFinal = true;
                                break;
                            }
                        }
                    }
                }
            }
            catch (_) { }
            shouldShowStartScreen = !(hasSnapshot && hasDraftOrFinal);
        }
    }
    const startScreen = root.querySelector('#startScreen');
    // Teacher modal controller
    const teacherCtrl = initTeacherModal(root, {
        appsScriptUrl,
        onEditExam: (examData) => {
            root.__cunata_loadBuilderExam?.(examData);
        },
        onNewExam: () => {
            if (builderModal)
                builderModal.style.display = 'flex';
            const btnPub = root.querySelector('#btnPublishExam');
            if (btnPub)
                btnPub.style.display = 'inline-block';
        },
    });
    // Start screen controller
    let startCtrl = null;
    if (startScreen) {
        startCtrl = initStartScreen(root, {
            appsScriptUrl,
            initialExamId: queryExamId,
            onOpenTeacher: () => teacherCtrl.openModal(),
            onStartExam: async (exam, name) => {
                candidateName = name;
                if (candidateInput)
                    candidateInput.value = candidateName;
                if (examWrapper)
                    examWrapper.style.display = '';
                await loadOrResumeExam(exam, true);
            },
        });
    }
    // Connect Exam List Modal (§15) and Teacher Authoring Modal
    initExamList(root, {
        onSelectExam: (exam) => switchExam(exam, true),
        hasUnsavedProgress: hasInProgressAttempt,
        appsScriptUrl,
    });
    initAuthoring(root, {
        getExam: () => currentExam,
        onPublish: (exam) => switchExam(exam, true),
        idGen,
        getAppsScriptUrl: () => appsScriptUrl,
        getTeacherPassword: () => {
            try {
                return sessionStorage.getItem('cunata_teacher_pw');
            }
            catch (_) {
                return null;
            }
        },
        onPublishedToWeb: () => {
            teacherCtrl.refreshList();
            if (startCtrl)
                startCtrl.refreshList();
        },
    });
    if (isTeacherQuery) {
        teacherCtrl.openModal();
    }
    // Candidate Name Input Listener
    const onCandidateNameInput = async (e) => {
        candidateName = e.target.value;
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
        await saveStateToStorage(undefined, isStorageAvailable ? (controller ? renameSuccess : undefined) : false);
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
    if (winTarget && typeof winTarget.addEventListener === 'function') {
        winTarget.addEventListener('storage', onStorageEvent);
    }
    // Initial load or resume
    if (shouldShowStartScreen) {
        if (startScreen)
            startScreen.style.display = 'block';
        if (examWrapper)
            examWrapper.style.display = 'none';
        if (reportWrapper)
            reportWrapper.style.display = 'none';
        if (examPane)
            examPane.innerHTML = '';
    }
    else {
        if (startScreen)
            startScreen.style.display = 'none';
        await loadOrResumeExam(currentExam, false);
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
            notifyWorkerAttemptState(!isSubmitted);
            reg.addEventListener('updatefound', () => {
                const installingWorker = reg.installing;
                if (!installingWorker)
                    return;
                installingWorker.addEventListener('statechange', () => {
                    if (installingWorker.state === 'installed') {
                        if (reg.waiting) {
                            if (isSubmitted) {
                                activateWaitingWorker();
                            }
                        }
                    }
                });
            });
            if (reg.waiting && isSubmitted) {
                activateWaitingWorker();
            }
        })
            .catch(() => { });
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            notifyWorkerAttemptState(!isSubmitted);
        });
        navigator.serviceWorker.addEventListener('message', (event) => {
            const data = event.data;
            if (!data || typeof data !== 'object')
                return;
            if (data.type === 'QUERY_ATTEMPT_ACTIVE') {
                const port = event.ports && event.ports[0];
                const active = !isSubmitted;
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
        }
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
