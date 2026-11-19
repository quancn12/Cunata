"use strict";
/**
 * Cunata — Google Apps Script Result Collector
 * Phiên bản: v1.0.0 (GDPT 2018)
 *
 * Tài liệu tham chiếu:
 * - Shared Product Contract v2.0 (Mục 1, 2, 4)
 * - Nghiên cứu RSCH-ANTI-R08 (docs/research/anti/R08-result-integration-security.md)
 *
 * Chức năng:
 * 1. Tiếp nhận kết quả nộp bài thi GDPT 2018 từ client Cunata (Web App doPost).
 * 2. Ngăn ngừa lỗ hổng Spreadsheet Formula Injection (CWE-1236) bằng tiền tố nháy đơn (').
 * 3. Chống ghi đè và ghi trùng bản ghi (Idempotency) dựa trên attempt_id.
 * 4. Kiểm soát tranh chấp ghi đồng thời bằng LockService.
 * 5. Xác thực schema, định dạng phân số và tính nhất quán điểm (total <= maxTotal, tổng phần = tổng).
 * 6. Trả về JSON receipt chuẩn có cấu trúc cho client.
 */
// Danh sách ký tự kích hoạt công thức bảng tính nguy hiểm (CWE-1236)
const DANGEROUS_TRIGGERS = [
    '=', '+', '-', '@',
    '\t', '\r', '\n',
    '＝', '＋', '－', '＠'
];
/**
 * Làm sạch ô bảng tính chống Spreadsheet Formula Injection.
 * Nếu chuỗi bắt đầu bằng ký tự nguy hiểm (ví dụ: -0,5 ở Phần III hoặc =IMPORTXML),
 * thêm tiền tố nháy đơn (') để bảng tính hiểu đây là chuỗi thuần, không thực thi công thức.
 *
 * @param {unknown} input Giá trị cần làm sạch
 * @returns {string} Chuỗi an toàn để ghi vào Google Sheets
 */
function sanitizeSheetCell(input) {
    if (input === null || input === undefined) {
        return '';
    }
    const str = String(input);
    if (str.length === 0) {
        return '';
    }
    const firstChar = str.charAt(0);
    if (DANGEROUS_TRIGGERS.includes(firstChar)) {
        return "'" + str;
    }
    return str;
}
/**
 * Tìm ước số chung lớn nhất để tối giản phân số BigInt về dạng chuẩn tắc.
 */
function gcd(a, b) {
    let x = a < BigInt(0) ? -a : a;
    let y = b < BigInt(0) ? -b : b;
    while (y !== BigInt(0)) {
        const t = x % y;
        x = y;
        y = t;
    }
    return x;
}
/**
 * Chuyển đổi chuỗi phân số hoặc số nguyên thành đối tượng { num: BigInt, den: BigInt } tối giản chuẩn tắc.
 * @param {unknown} val
 * @returns {{ num: bigint, den: bigint } | null}
 */
function parseRational(val) {
    if (val === null || val === undefined)
        return null;
    const s = String(val).trim();
    if (!s)
        return null;
    const m = s.match(/^(-?\d+)(?:\/([1-9]\d*))?$/);
    if (!m)
        return null;
    try {
        let num = BigInt(m[1]);
        let den = m[2] ? BigInt(m[2]) : BigInt(1);
        if (den === BigInt(0))
            return null;
        if (den < BigInt(0)) {
            num = -num;
            den = -den;
        }
        if (num === BigInt(0)) {
            return { num: BigInt(0), den: BigInt(1) };
        }
        const g = gcd(num, den);
        return { num: num / g, den: den / g };
    }
    catch (_) {
        return null;
    }
}
/**
 * Chuẩn hóa cấu trúc JSON (sắp xếp keys đệ quy) để so sánh nội dung bất biến thứ tự thuộc tính (LC35-F05, LC36-F02).
 * Parse JSON tại boundary top-level nếu là chuỗi biểu diễn JSON, giữ nguyên kiểu và giá trị của mọi lá (string literal, number, boolean, null).
 * Cấm trim, cấm parse số, cấm normalize chuỗi lá để bảo tồn tuyệt đối từng ký tự (Shared §2/3).
 */
function canonicalizeJson(v) {
    if (v === null || v === undefined)
        return 'null';
    let val = v;
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                val = JSON.parse(trimmed);
            }
            catch (_) {
                return JSON.stringify(v);
            }
        }
        else {
            return JSON.stringify(v);
        }
    }
    function walk(node) {
        if (node === null || node === undefined)
            return 'null';
        if (typeof node === 'string')
            return JSON.stringify(node);
        if (typeof node === 'number')
            return Number.isFinite(node) ? String(node) : 'null';
        if (typeof node === 'boolean')
            return node ? 'true' : 'false';
        if (Array.isArray(node)) {
            return '[' + node.map(walk).join(',') + ']';
        }
        if (typeof node === 'object') {
            const keys = Object.keys(node).sort();
            return '{' + keys.map(k => JSON.stringify(k) + ':' + walk(node[k])).join(',') + '}';
        }
        return JSON.stringify(node);
    }
    return walk(val);
}
function ratAdd(a, b) {
    return { num: a.num * b.den + b.num * a.den, den: a.den * b.den };
}
function ratCmp(a, b) {
    const diff = a.num * b.den - b.num * a.den;
    if (diff < BigInt(0))
        return -1;
    if (diff > BigInt(0))
        return 1;
    return 0;
}
/**
 * Tìm chỉ số dòng đã tồn tại của attempt_id trong Sheet để kiểm tra tính lũy nghiệm.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Bảng tính cần kiểm tra
 * @param {string} attemptId Mã duy nhất của lượt thi
 * @returns {number} Chỉ số dòng (1-based) nếu tìm thấy, -1 nếu chưa tồn tại
 */
function findRowByAttemptId(sheet, attemptId) {
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
        return -1; // Chỉ có tiêu đề hoặc rỗng
    }
    const rawId = String(attemptId || '').trim();
    const sanitizedId = sanitizeSheetCell(rawId);
    // Cột A chứa attempt_id
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < values.length; i++) {
        const cellVal = String(values[i][0]);
        if (cellVal === sanitizedId || cellVal === rawId || (cellVal.startsWith("'") && cellVal.slice(1) === rawId)) {
            return i + 2; // 1-based row index (bỏ qua hàng tiêu đề)
        }
    }
    return -1;
}
/**
 * Tạo hàng tiêu đề chuẩn nếu trang tính còn mới
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function ensureHeaderRow(sheet) {
    if (sheet.getLastRow() === 0) {
        const headers = [
            'attempt_id',
            'exam_id',
            'exam_version_id',
            'candidate_display',
            'started_at',
            'submitted_at',
            'duration_seconds',
            'score_p1',
            'max_p1',
            'score_p2',
            'max_p2',
            'score_p3',
            'max_p3',
            'total_score',
            'max_total',
            'policy_version',
            'raw_answers_json', 'class_code', 'assignment_id'
        ];
        sheet.appendRow(headers);
        SpreadsheetApp.flush();
    }
}
/**
 * Định dạng dòng dữ liệu ghi vào Google Sheets theo 17 cột chuẩn (A-Q)
 * Mọi cột dạng chuỗi đều được bảo vệ chống Formula Injection (CWE-1236).
 *
 * @param {Object} data Đối tượng kết quả bài làm
 * @returns {Array<string|number>}
 */
function formatRecordRow(data) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    var _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3;
    const attemptId = sanitizeSheetCell(String(data.attempt_id || data.attemptId || '').trim());
    const examId = sanitizeSheetCell(String(data.exam_id || data.examId || '').trim());
    const examVersionId = sanitizeSheetCell(String(data.exam_version_id || data.examVersionId || '').trim());
    const candidateDisplay = sanitizeSheetCell(data.candidate_display || data.candidateName || 'Thí sinh tự do');
    const startedAt = sanitizeSheetCell(String(data.started_at || data.startedAt || ''));
    const submittedAt = sanitizeSheetCell(String(data.submitted_at || data.submittedAt || new Date().toISOString()));
    const durationSeconds = typeof data.duration_seconds === 'number' && Number.isFinite(data.duration_seconds) && data.duration_seconds >= 0 ? data.duration_seconds : 0;
    // Breakdown điểm (đều được sanitize phòng ngừa trường hợp format có ký tự đặc biệt)
    // Ưu tiên thuộc tính chuẩn canonical, fallback alias
    const scoreP1 = sanitizeSheetCell((_p = (_o = (_b = (_a = data.sections) === null || _a === void 0 ? void 0 : _a.I) === null || _b === void 0 ? void 0 : _b.score) !== null && _o !== void 0 ? _o : data.score_p1) !== null && _p !== void 0 ? _p : '0');
    const maxP1 = sanitizeSheetCell((_r = (_q = (_d = (_c = data.sections) === null || _c === void 0 ? void 0 : _c.I) === null || _d === void 0 ? void 0 : _d.max) !== null && _q !== void 0 ? _q : data.max_p1) !== null && _r !== void 0 ? _r : '0');
    const scoreP2 = sanitizeSheetCell((_t = (_s = (_f = (_e = data.sections) === null || _e === void 0 ? void 0 : _e.II) === null || _f === void 0 ? void 0 : _f.score) !== null && _s !== void 0 ? _s : data.score_p2) !== null && _t !== void 0 ? _t : '0');
    const maxP2 = sanitizeSheetCell((_v = (_u = (_h = (_g = data.sections) === null || _g === void 0 ? void 0 : _g.II) === null || _h === void 0 ? void 0 : _h.max) !== null && _u !== void 0 ? _u : data.max_p2) !== null && _v !== void 0 ? _v : '0');
    const scoreP3 = sanitizeSheetCell((_x = (_w = (_k = (_j = data.sections) === null || _j === void 0 ? void 0 : _j.III) === null || _k === void 0 ? void 0 : _k.score) !== null && _w !== void 0 ? _w : data.score_p3) !== null && _x !== void 0 ? _x : '0');
    const maxP3 = sanitizeSheetCell((_z = (_y = (_m = (_l = data.sections) === null || _l === void 0 ? void 0 : _l.III) === null || _m === void 0 ? void 0 : _m.max) !== null && _y !== void 0 ? _y : data.max_p3) !== null && _z !== void 0 ? _z : '0');
    const totalScore = sanitizeSheetCell((_1 = (_0 = data.total) !== null && _0 !== void 0 ? _0 : data.total_score) !== null && _1 !== void 0 ? _1 : '0');
    const maxTotal = sanitizeSheetCell((_3 = (_2 = data.maxTotal) !== null && _2 !== void 0 ? _2 : data.max_total) !== null && _3 !== void 0 ? _3 : '0');
    const policyVersion = sanitizeSheetCell(String(data.policy_version || data.ruleSetId || 'custom-v1'));
    // Toàn bộ đáp án thô được làm sạch
    let rawJson = '';
    if (data.raw_answers_json) {
        rawJson = typeof data.raw_answers_json === 'string'
            ? data.raw_answers_json
            : JSON.stringify(data.raw_answers_json);
    }
    else if (data.responses) {
        rawJson = JSON.stringify(data.responses);
    }
    const sanitizedRawJson = sanitizeSheetCell(rawJson);
    return [
        attemptId,
        examId,
        examVersionId,
        candidateDisplay,
        startedAt,
        submittedAt,
        durationSeconds,
        scoreP1,
        maxP1,
        scoreP2,
        maxP2,
        scoreP3,
        maxP3,
        totalScore,
        maxTotal,
        policyVersion,
        sanitizedRawJson
    ];
}
// Force literal text, including numeric strings and leading apostrophes.
// Keep the existing result collector's encoding separate for compatibility.
function examTextCell(value) {
    return "'" + String(value);
}
function jsonOutput(value) {
    return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function validatePublishedExam(exam) {
    var errors = [];
    var nonempty = function (value) { return typeof value === 'string' && value.trim().length > 0; };
    if (!exam || typeof exam !== 'object' || Array.isArray(exam)) return ['Thiếu dữ liệu đề thi'];
    if (exam.schemaVersion !== 'web-exam-v1') errors.push('schemaVersion phải là web-exam-v1');
    if (!nonempty(exam.examId)) errors.push('Thiếu mã đề thi (examId)');
    if (!nonempty(exam.title)) errors.push('Thiếu tiêu đề đề thi');
    if (!Array.isArray(exam.questions) || exam.questions.length === 0) {
        errors.push('Đề thi không có câu hỏi nào');
        return errors;
    }
    if (exam.questions.length > 1000) errors.push('Đề thi có quá 1000 câu');
    var questionIds = new Set();
    exam.questions.forEach(function (q, index) {
        var label = 'Câu ' + (index + 1) + ': ';
        if (!q || typeof q !== 'object' || Array.isArray(q)) {
            errors.push(label + 'dữ liệu không hợp lệ');
            return;
        }
        if (!nonempty(q.questionVersionId) || questionIds.has(q.questionVersionId)) errors.push(label + 'questionVersionId thiếu hoặc trùng');
        questionIds.add(q.questionVersionId);
        if (q.kind === 'I') {
            if (!Array.isArray(q.options) || q.options.length !== 4) {
                errors.push(label + 'Phần I phải có đúng 4 phương án');
                return;
            }
            var optionIds = new Set();
            q.options.forEach(function (option) {
                if (!option || !nonempty(option.optionId) || optionIds.has(option.optionId)) errors.push(label + 'optionId thiếu hoặc trùng');
                else optionIds.add(option.optionId);
            });
            if (!nonempty(q.correctOptionId) || !optionIds.has(q.correctOptionId)) errors.push(label + 'correctOptionId không thuộc phương án');
        } else if (q.kind === 'II') {
            if (!Array.isArray(q.statements) || q.statements.length !== 4) {
                errors.push(label + 'Phần II phải có đúng 4 ý');
                return;
            }
            var statementIds = new Set();
            q.statements.forEach(function (statement) {
                if (!statement || !nonempty(statement.statementId) || statementIds.has(statement.statementId)) errors.push(label + 'statementId thiếu hoặc trùng');
                else statementIds.add(statement.statementId);
                if (!statement || typeof statement.answer !== 'boolean') errors.push(label + 'ý thiếu đáp án boolean');
            });
        } else if (q.kind === 'III') {
            if (typeof q.answerKey !== 'string' || q.answerKey.length < 1 || q.answerKey.length > 4 || /[^0-9,-]/.test(q.answerKey)) errors.push(label + 'answerKey phải là chuỗi 1–4 ký tự 0-9,-');
        } else errors.push(label + 'phần phải là I, II hoặc III');
    });
    return errors;
}
/** Xử lý HTTP POST: kết quả bài làm và thao tác giáo viên. */
function doPost(e) {
    var _a, _b, _c, _d, _e;
    try {
        let payload = null;
        if (e && e.postData && e.postData.contents) {
            payload = JSON.parse(e.postData.contents);
        }
        else if (e && e.parameter && e.parameter.payload) {
            payload = JSON.parse(e.parameter.payload);
        }
        if (!payload || typeof payload !== 'object') {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'INVALID_PAYLOAD',
                message: 'Dữ liệu gửi lên không đúng định dạng JSON'
            })).setMimeType(ContentService.MimeType.JSON);
        }

        // Action routing (WEB-contract mục 17)
        var action = payload.action ? String(payload.action).trim() : '';

        var routed = accountAction(action, payload);
        if (routed !== null) return jsonOutput(routed);
        if (action && ['publishExam', 'unpublishExam', 'submitResult'].indexOf(action) < 0)
            return jsonOutput(failure('UNKNOWN_ACTION', 'Thao tác không hợp lệ'));
        // 2. publishExam
        if (action === 'publishExam') {
            var principal = sessionPrincipal(payload.token, 'teacher');
            if (!principal) return jsonOutput(failure('UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ'));
            var exam = payload.exam;
            var validationErrors = validatePublishedExam(exam);
            if (validationErrors.length > 0) {
                return jsonOutput({ success: false, error: 'INVALID_EXAM',
                    message: 'Đề thi không hợp lệ', errors: validationErrors });
            }
            var pubExamId = exam.examId;

            // Ghi vào sheet DeThi với Lock
            var publishLock = LockService.getScriptLock();
            var hasPublishLock = publishLock.tryLock(30000);
            if (!hasPublishLock) {
                return ContentService.createTextOutput(JSON.stringify({
                    success: false,
                    error: 'SERVER_BUSY',
                    message: 'Máy chủ đang bận, vui lòng thử lại sau'
                })).setMimeType(ContentService.MimeType.JSON);
            }

            try {
                principal = sessionPrincipal(payload.token, 'teacher');
                if (!principal) return jsonOutput(failure('UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ'));
                var ss = SpreadsheetApp.getActiveSpreadsheet();
                var sheet = ss.getSheetByName('DeThi');
                if (!sheet) {
                    sheet = ss.insertSheet('DeThi');
                }
                if (sheet.getLastRow() === 0) {
                    sheet.appendRow(['id', 'title', 'subject', 'grade', 'durationMinutes', 'questionCount', 'group', 'revision', 'updatedAt', 'owner', 'chunks']);
                }

                migrateExamOwner(sheet);
                // Check existing row
                var existingRow = -1;
                var currentRevision = 0;
                var lastRow = sheet.getLastRow();
                for (var r = 2; r <= lastRow; r++) {
                    var cellVal = String(sheet.getRange(r, 1, 1, 1).getValue());
                    if (cellVal === pubExamId) {
                        if (String(sheet.getRange(r, 10, 1, 1).getValue()) !== principal.username)
                            return jsonOutput(failure('FORBIDDEN', 'Đề thi thuộc giáo viên khác'));
                        existingRow = r;
                        currentRevision = Number(sheet.getRange(r, 8, 1, 1).getValue()) || 1;
                        break;
                    }
                }

                var revision = existingRow > 0 ? currentRevision + 1 : 1;
                var title = String(exam.title || '');
                var subject = String(exam.subject || '');
                var grade = typeof exam.grade === 'number' && Number.isFinite(exam.grade) ? exam.grade : '';
                var rawDuration = exam.settings ? exam.settings.durationMinutes : exam.durationMinutes;
                var durationMinutes = typeof rawDuration === 'number' && Number.isFinite(rawDuration) ? rawDuration : '';
                var questionCount = exam.questions.length;
                var group = String(exam.group || (exam.settings && exam.settings.group) || 'Đề giáo viên xuất bản');
                var updatedAt = new Date().toISOString();

                // Chunk exam JSON <= 40000 chars per cell
                var fullJson = JSON.stringify(exam);
                var chunks = [];
                var CHUNK_SIZE = 39999; // Reserve one character for the text prefix.
                for (var k = 0; k < fullJson.length;) {
                    var chunkEnd = Math.min(k + CHUNK_SIZE, fullJson.length);
                    // Keep a Unicode surrogate pair together across the Sheets boundary.
                    var lastCode = fullJson.charCodeAt(chunkEnd - 1);
                    if (chunkEnd < fullJson.length && lastCode >= 0xD800 && lastCode <= 0xDBFF) chunkEnd--;
                    var chunk = fullJson.slice(k, chunkEnd);
                    chunks.push(examTextCell(chunk));
                    k = chunkEnd;
                }

                var rowData = [
                    examTextCell(pubExamId),
                    examTextCell(title),
                    examTextCell(subject),
                    grade,
                    durationMinutes,
                    questionCount,
                    examTextCell(group),
                    revision,
                    updatedAt,
                    examTextCell(principal.username)
                ].concat(chunks);

                // One range write; pad stale chunks when the replacement is shorter.
                var width = Math.max(rowData.length, sheet.getLastColumn());
                while (rowData.length < width) rowData.push('');
                if (typeof sheet.getMaxColumns === 'function' && width > sheet.getMaxColumns()) {
                    sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
                }
                var targetRow = existingRow > 0 ? existingRow : sheet.getLastRow() + 1;
                sheet.getRange(targetRow, 1, 1, width).setValues([rowData]);
                SpreadsheetApp.flush();

                return ContentService.createTextOutput(JSON.stringify({
                    success: true,
                    examId: pubExamId,
                    revision: revision
                })).setMimeType(ContentService.MimeType.JSON);
            } finally {
                try { publishLock.releaseLock(); } catch (_) {}
            }
        }

        // 3. unpublishExam
        if (action === 'unpublishExam') {
            var principal = sessionPrincipal(payload.token, 'teacher');
            if (!principal) return jsonOutput(failure('UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ'));
            var unpublishId = String(payload.examId || '');
            if (!unpublishId) {
                return ContentService.createTextOutput(JSON.stringify({
                    success: false,
                    error: 'MISSING_EXAM_ID',
                    message: 'Thiếu examId cần gỡ xuất bản'
                })).setMimeType(ContentService.MimeType.JSON);
            }

            var unpublishLock = LockService.getScriptLock();
            var hasUnpublishLock = unpublishLock.tryLock(30000);
            if (!hasUnpublishLock) {
                return ContentService.createTextOutput(JSON.stringify({
                    success: false,
                    error: 'SERVER_BUSY',
                    message: 'Máy chủ đang bận, vui lòng thử lại sau'
                })).setMimeType(ContentService.MimeType.JSON);
            }

            try {
                principal = sessionPrincipal(payload.token, 'teacher');
                if (!principal) return jsonOutput(failure('UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ'));
                var ss = SpreadsheetApp.getActiveSpreadsheet();
                var sheet = ss.getSheetByName('DeThi');
                if (sheet && sheet.getLastRow() > 1) {
                    var lastRow = sheet.getLastRow();
                    for (var r = 2; r <= lastRow; r++) {
                        var cellVal = String(sheet.getRange(r, 1, 1, 1).getValue());
                        if (cellVal === unpublishId) {
                            if (examOwner(sheet, r) !== principal.username) return jsonOutput(failure('FORBIDDEN', 'Đề thi thuộc giáo viên khác'));
                            sheet.deleteRow(r);
                            break;
                        }
                    }
                }
                return ContentService.createTextOutput(JSON.stringify({
                    success: true
                })).setMimeType(ContentService.MimeType.JSON);
            } finally {
                try { unpublishLock.releaseLock(); } catch (_) {}
            }
        }

        // 1. Kiểm tra attempt_id bắt buộc
        const rawAttemptId = (_a = payload.attempt_id) !== null && _a !== void 0 ? _a : payload.attemptId;
        if (rawAttemptId === undefined || rawAttemptId === null) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'MISSING_ATTEMPT_ID',
                message: 'Thiếu trường attempt_id bắt buộc'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        if (typeof rawAttemptId !== 'string' || !rawAttemptId.trim()) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'INVALID_ATTEMPT_ID',
                message: 'Trường attempt_id phải là chuỗi không rỗng'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        if (payload.attempt_id !== undefined && payload.attemptId !== undefined &&
            String(payload.attempt_id).trim() !== String(payload.attemptId).trim()) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'CONFLICTING_ATTEMPT_ALIASES',
                message: 'Trường attempt_id và attemptId xung đột giá trị'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        const attemptId = rawAttemptId.trim();
        // 2. Kiểm tra điểm tổng và tối đa bắt buộc (LC29-F07, LC31-F01, LC33-F01)
        const rawTotal = (_b = payload.total) !== null && _b !== void 0 ? _b : payload.total_score;
        const rawMaxTotal = (_c = payload.maxTotal) !== null && _c !== void 0 ? _c : payload.max_total;
        if (rawTotal === undefined || rawTotal === null || rawMaxTotal === undefined || rawMaxTotal === null) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'MISSING_SCORE',
                message: 'Thiếu điểm tổng hoặc điểm tối đa bài thi'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        if (payload.total !== undefined && payload.total_score !== undefined &&
            String(payload.total).trim() !== String(payload.total_score).trim()) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'CONFLICTING_SCORE_ALIASES',
                message: 'Trường total và total_score xung đột giá trị'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        if (payload.maxTotal !== undefined && payload.max_total !== undefined &&
            String(payload.maxTotal).trim() !== String(payload.max_total).trim()) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'CONFLICTING_MAX_ALIASES',
                message: 'Trường maxTotal và max_total xung đột giá trị'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        const totalRat = parseRational(rawTotal);
        const maxTotalRat = parseRational(rawMaxTotal);
        if (!totalRat || !maxTotalRat) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'INVALID_SCORE',
                message: 'Điểm tổng hoặc điểm tối đa không đúng định dạng phân số hợp lệ'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        if (totalRat.num < BigInt(0) || maxTotalRat.num <= BigInt(0)) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'INVALID_SCORE_RANGE',
                message: 'Điểm tổng không được âm và điểm tối đa phải lớn hơn 0'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        if (ratCmp(totalRat, maxTotalRat) > 0) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'SCORE_EXCEEDS_MAX',
                message: 'Điểm tổng không được vượt quá điểm tối đa'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        // 3. Kiểm tra định danh đề thi và phiên bản bắt buộc (LC33-F01)
        const rawExamId = (_d = payload.exam_id) !== null && _d !== void 0 ? _d : payload.examId;
        if (rawExamId === undefined || rawExamId === null) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'MISSING_EXAM_ID',
                message: 'Thiếu trường exam_id bắt buộc'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        if (typeof rawExamId !== 'string' || !rawExamId.trim()) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'INVALID_EXAM_ID',
                message: 'Trường exam_id phải là chuỗi không rỗng'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        if (payload.exam_id !== undefined && payload.examId !== undefined &&
            String(payload.exam_id).trim() !== String(payload.examId).trim()) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'CONFLICTING_EXAM_ALIASES',
                message: 'Trường exam_id và examId xung đột giá trị'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        const examId = rawExamId.trim();
        const rawExamVersionId = (_e = payload.exam_version_id) !== null && _e !== void 0 ? _e : payload.examVersionId;
        if (rawExamVersionId === undefined || rawExamVersionId === null) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'MISSING_EXAM_VERSION_ID',
                message: 'Thiếu trường exam_version_id bắt buộc'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        if (typeof rawExamVersionId !== 'string' || !rawExamVersionId.trim()) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'INVALID_EXAM_VERSION_ID',
                message: 'Trường exam_version_id phải là chuỗi không rỗng'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        if (payload.exam_version_id !== undefined && payload.examVersionId !== undefined &&
            String(payload.exam_version_id).trim() !== String(payload.examVersionId).trim()) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'CONFLICTING_VERSION_ALIASES',
                message: 'Trường exam_version_id và examVersionId xung đột giá trị'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        const examVersionId = rawExamVersionId.trim();
        // Candidate name alias check
        if (payload.candidate_display !== undefined && payload.candidateName !== undefined &&
            String(payload.candidate_display).trim() !== String(payload.candidateName).trim()) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'CONFLICTING_CANDIDATE_ALIASES',
                message: 'Trường candidate_display và candidateName xung đột giá trị'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        const candidateDisplay = String(payload.candidate_display || payload.candidateName || 'Thí sinh tự do').trim();
        // Policy version alias check (LC35-F02)
        if (payload.policy_version !== undefined && payload.ruleSetId !== undefined &&
            String(payload.policy_version).trim() !== String(payload.ruleSetId).trim()) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'CONFLICTING_POLICY_ALIASES',
                message: 'Trường policy_version và ruleSetId xung đột giá trị'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        const policyVersion = String(payload.policy_version || payload.ruleSetId || 'custom-v1').trim();
        // 4. Bắt buộc và chuẩn hóa breakdown 3 phần (LC33-F01)
        let secI = null;
        let secII = null;
        let secIII = null;
        if (payload.sections !== undefined && payload.sections !== null) {
            if (typeof payload.sections !== 'object' || Array.isArray(payload.sections)) {
                return ContentService.createTextOutput(JSON.stringify({
                    success: false,
                    error: 'INVALID_SECTIONS',
                    message: 'Trường sections phải là một đối tượng hợp lệ'
                })).setMimeType(ContentService.MimeType.JSON);
            }
            const sec = payload.sections;
            if (!sec.I || !sec.II || !sec.III ||
                sec.I.score === undefined || sec.I.max === undefined ||
                sec.II.score === undefined || sec.II.max === undefined ||
                sec.III.score === undefined || sec.III.max === undefined) {
                return ContentService.createTextOutput(JSON.stringify({
                    success: false,
                    error: 'INCOMPLETE_SECTIONS',
                    message: 'Trường sections phải có đầy đủ 3 phần I, II, III với score và max'
                })).setMimeType(ContentService.MimeType.JSON);
            }
            secI = { score: sec.I.score, max: sec.I.max };
            secII = { score: sec.II.score, max: sec.II.max };
            secIII = { score: sec.III.score, max: sec.III.max };
            // Kiểm tra xung đột alias nếu có
            if (payload.score_p1 !== undefined && String(payload.score_p1).trim() !== String(secI.score).trim()) {
                return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'CONFLICTING_SECTION_ALIASES', message: 'Xung đột điểm phần I' })).setMimeType(ContentService.MimeType.JSON);
            }
            if (payload.max_p1 !== undefined && String(payload.max_p1).trim() !== String(secI.max).trim()) {
                return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'CONFLICTING_SECTION_ALIASES', message: 'Xung đột điểm tối đa phần I' })).setMimeType(ContentService.MimeType.JSON);
            }
            if (payload.score_p2 !== undefined && String(payload.score_p2).trim() !== String(secII.score).trim()) {
                return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'CONFLICTING_SECTION_ALIASES', message: 'Xung đột điểm phần II' })).setMimeType(ContentService.MimeType.JSON);
            }
            if (payload.max_p2 !== undefined && String(payload.max_p2).trim() !== String(secII.max).trim()) {
                return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'CONFLICTING_SECTION_ALIASES', message: 'Xung đột điểm tối đa phần II' })).setMimeType(ContentService.MimeType.JSON);
            }
            if (payload.score_p3 !== undefined && String(payload.score_p3).trim() !== String(secIII.score).trim()) {
                return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'CONFLICTING_SECTION_ALIASES', message: 'Xung đột điểm phần III' })).setMimeType(ContentService.MimeType.JSON);
            }
            if (payload.max_p3 !== undefined && String(payload.max_p3).trim() !== String(secIII.max).trim()) {
                return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'CONFLICTING_SECTION_ALIASES', message: 'Xung đột điểm tối đa phần III' })).setMimeType(ContentService.MimeType.JSON);
            }
        }
        else {
            // Nếu không có sections, yêu cầu đầy đủ 6 aliases của 3 phần
            if (payload.score_p1 !== undefined && payload.max_p1 !== undefined &&
                payload.score_p2 !== undefined && payload.max_p2 !== undefined &&
                payload.score_p3 !== undefined && payload.max_p3 !== undefined) {
                secI = { score: payload.score_p1, max: payload.max_p1 };
                secII = { score: payload.score_p2, max: payload.max_p2 };
                secIII = { score: payload.score_p3, max: payload.max_p3 };
            }
            else {
                return ContentService.createTextOutput(JSON.stringify({
                    success: false,
                    error: 'INCOMPLETE_SECTIONS',
                    message: 'Yêu cầu đầy đủ thông tin điểm 3 phần I, II, III (qua sections hoặc alias)'
                })).setMimeType(ContentService.MimeType.JSON);
            }
        }
        const s1 = parseRational(secI.score);
        const m1 = parseRational(secI.max);
        const s2 = parseRational(secII.score);
        const m2 = parseRational(secII.max);
        const s3 = parseRational(secIII.score);
        const m3 = parseRational(secIII.max);
        if (!s1 || !m1 || !s2 || !m2 || !s3 || !m3) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'INVALID_SECTION_SCORES',
                message: 'Điểm từng phần không đúng định dạng phân số hợp lệ'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        if (s1.num < BigInt(0) || s2.num < BigInt(0) || s3.num < BigInt(0) || m1.num < BigInt(0) || m2.num < BigInt(0) || m3.num < BigInt(0)) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'NEGATIVE_SECTION_SCORE',
                message: 'Điểm các phần không được âm'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        if (ratCmp(s1, m1) > 0 || ratCmp(s2, m2) > 0 || ratCmp(s3, m3) > 0) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'SECTION_SCORE_EXCEEDS_MAX',
                message: 'Điểm từng phần không được vượt quá điểm tối đa của phần đó'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        const sumScores = ratAdd(ratAdd(s1, s2), s3);
        const sumMax = ratAdd(ratAdd(m1, m2), m3);
        if (ratCmp(sumScores, totalRat) !== 0) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'SECTION_SUM_MISMATCH',
                message: 'Tổng điểm các phần không khớp với điểm tổng'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        if (ratCmp(sumMax, maxTotalRat) !== 0) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'SECTION_MAX_MISMATCH',
                message: 'Tổng điểm tối đa các phần không khớp với điểm tối đa của đề'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        const toCanonicalStr = (r) => (r.den === BigInt(1) ? String(r.num) : String(r.num) + '/' + String(r.den));
        var classCode = typeof payload.class_code === 'string' ? payload.class_code.trim().toUpperCase() : '';
        var assignmentId = typeof payload.assignment_id === 'string' ? payload.assignment_id : '';
        if ((payload.class_code !== undefined && typeof payload.class_code !== 'string') ||
            (payload.assignment_id !== undefined && typeof payload.assignment_id !== 'string') || (!!classCode !== !!assignmentId))
            return jsonOutput(failure('INVALID_ASSIGNMENT', 'Thiếu thông tin lớp hoặc bài giao'));
        const canonicalPayload = {
            attempt_id: attemptId,
            exam_id: examId,
            exam_version_id: examVersionId,
            candidate_display: candidateDisplay,
            started_at: payload.started_at || payload.startedAt || '',
            submitted_at: payload.submitted_at || payload.submittedAt || new Date().toISOString(),
            duration_seconds: typeof payload.duration_seconds === 'number' && Number.isFinite(payload.duration_seconds) && payload.duration_seconds >= 0 ? payload.duration_seconds : 0,
            sections: {
                I: { score: toCanonicalStr(s1), max: toCanonicalStr(m1) },
                II: { score: toCanonicalStr(s2), max: toCanonicalStr(m2) },
                III: { score: toCanonicalStr(s3), max: toCanonicalStr(m3) }
            },
            total: toCanonicalStr(totalRat),
            maxTotal: toCanonicalStr(maxTotalRat),
            policy_version: policyVersion,
            raw_answers_json: payload.raw_answers_json || payload.raw_answers || payload.responses || ''
        };
        // 5. ScriptLock bảo vệ concurrency (LC33-F06: Không ghi Sheets ngoài lock)
        const lock = LockService.getScriptLock();
        const hasLock = lock.tryLock(30000); // Chờ tối đa 30s
        if (!hasLock) {
            return ContentService.createTextOutput(JSON.stringify({
                success: false,
                error: 'SERVER_BUSY',
                message: 'Máy chủ đang xử lý nhiều bài thi, vui lòng thử lại sau giây lát'
            })).setMimeType(ContentService.MimeType.JSON);
        }
        try {
            var ss = SpreadsheetApp.getActiveSpreadsheet();
            var sheet = (typeof ss.getSheetByName === 'function' ? ss.getSheetByName('KetQua') : null);
            if (!sheet) {
                sheet = (typeof ss.insertSheet === 'function' ? ss.insertSheet('KetQua') : null) || (typeof ss.getActiveSheet === 'function' ? ss.getActiveSheet() : null);
            }
            ensureHeaderRow(sheet);
            if (classCode && sheet.getLastColumn() < 19) sheet.getRange(1, 18, 1, 2).setValues([['class_code', 'assignment_id']]);
            // 6. Kiểm tra lũy nghiệm (Idempotency) và phát hiện xung đột dữ liệu toàn diện (LC33-F01, LC34-F02)
            const existingRow = findRowByAttemptId(sheet, attemptId);
            if (existingRow > 0) {
                let conflict = false;
                let readError = null;
                try {
                    const expectedRow = formatRecordRow(canonicalPayload);
                    const cleanCell = (v) => {
                        const s = String(v !== null && v !== void 0 ? v : '').trim();
                        return s.startsWith("'") ? s.slice(1) : s;
                    };
                    let fullRow = null;
                    try {
                        const r = sheet.getRange(existingRow, 1, 1, 17).getValues()[0];
                        if (r && Array.isArray(r) && r.length >= 17)
                            fullRow = r;
                    }
                    catch (_) { }
                    const getColVal = (colIdx) => {
                        if (fullRow && fullRow[colIdx - 1] !== undefined)
                            return cleanCell(fullRow[colIdx - 1]);
                        let vals = null;
                        try {
                            vals = sheet.getRange(existingRow, colIdx, 1, 1).getValues();
                        }
                        catch (_) {
                            vals = sheet.getRange(existingRow, colIdx, 1).getValues();
                        }
                        if (vals && vals[0] && vals[0][0] !== undefined)
                            return cleanCell(vals[0][0]);
                        throw new Error('Không thể đọc dữ liệu cột ' + colIdx);
                    };
                    // So sánh các cột khóa: exam_id (col 2), exam_version_id (col 3), điểm từng phần (col 8..13), tổng (col 14..15), policy (col 16), raw (col 17)
                    const exExamId = getColVal(2);
                    const exVersion = getColVal(3);
                    const exP1Score = getColVal(8);
                    const exP1Max = getColVal(9);
                    const exP2Score = getColVal(10);
                    const exP2Max = getColVal(11);
                    const exP3Score = getColVal(12);
                    const exP3Max = getColVal(13);
                    const exTotal = getColVal(14);
                    const exMax = getColVal(15);
                    const exPolicy = getColVal(16);
                    const exRaw = getColVal(17);
                    const newRaw = cleanCell(expectedRow[16]);
                    if (classCode || (typeof sheet.getLastColumn === 'function' && sheet.getLastColumn() >= 19)) {
                        if (getColVal(18) !== classCode || getColVal(19) !== assignmentId) conflict = true;
                    }
                    const ratEqual = (aStr, bStr) => {
                        const ra = parseRational(aStr);
                        const rb = parseRational(bStr);
                        if (ra && rb)
                            return ratCmp(ra, rb) === 0;
                        return aStr === bStr;
                    };
                    if (!ratEqual(exTotal, cleanCell(expectedRow[13]))) {
                        conflict = true;
                    }
                    else if (!ratEqual(exMax, cleanCell(expectedRow[14]))) {
                        conflict = true;
                    }
                    else if (exExamId !== cleanCell(expectedRow[1])) {
                        conflict = true;
                    }
                    else if (exVersion !== cleanCell(expectedRow[2])) {
                        conflict = true;
                    }
                    else if (!ratEqual(exP1Score, cleanCell(expectedRow[7]))) {
                        conflict = true;
                    }
                    else if (!ratEqual(exP1Max, cleanCell(expectedRow[8]))) {
                        conflict = true;
                    }
                    else if (!ratEqual(exP2Score, cleanCell(expectedRow[9]))) {
                        conflict = true;
                    }
                    else if (!ratEqual(exP2Max, cleanCell(expectedRow[10]))) {
                        conflict = true;
                    }
                    else if (!ratEqual(exP3Score, cleanCell(expectedRow[11]))) {
                        conflict = true;
                    }
                    else if (!ratEqual(exP3Max, cleanCell(expectedRow[12]))) {
                        conflict = true;
                    }
                    else if (exPolicy !== cleanCell(expectedRow[15])) {
                        conflict = true;
                    }
                    else if (canonicalizeJson(exRaw) !== canonicalizeJson(newRaw)) {
                        conflict = true;
                    }
                }
                catch (err) {
                    readError = err;
                }
                if (readError) {
                    return ContentService.createTextOutput(JSON.stringify({
                        success: false,
                        error: 'STORAGE_READ_ERROR',
                        message: 'Không thể đọc bản ghi cũ để xác thực tính toàn vẹn'
                    })).setMimeType(ContentService.MimeType.JSON);
                }
                if (conflict) {
                    return ContentService.createTextOutput(JSON.stringify({
                        success: false,
                        error: 'PAYLOAD_CONFLICT',
                        message: 'Lượt thi đã tồn tại với kết quả hoặc nội dung đề thi khác, không thể ghi đè'
                    })).setMimeType(ContentService.MimeType.JSON);
                }
                return ContentService.createTextOutput(JSON.stringify({
                    success: true,
                    attempt_id: attemptId,
                    status: 'ALREADY_RECORDED',
                    message: 'Kết quả bài thi đã được ghi nhận trước đó',
                    recorded_at: new Date().toISOString()
                })).setMimeType(ContentService.MimeType.JSON);
            }
            // 7. Định dạng dòng và ghi vào bảng
            var assignmentError = validateSubmissionAssignment(classCode, assignmentId, examId);
            if (assignmentError) return jsonOutput(assignmentError);
            const row = formatRecordRow(canonicalPayload);
            sheet.appendRow(row.concat([examTextCell(classCode), examTextCell(assignmentId)]));
            SpreadsheetApp.flush();
            return ContentService.createTextOutput(JSON.stringify({
                success: true,
                attempt_id: attemptId,
                status: 'NEWLY_RECORDED',
                message: 'Ghi nhận kết quả bài thi thành công',
                recorded_at: new Date().toISOString()
            })).setMimeType(ContentService.MimeType.JSON);
        }
        finally {
            lock.releaseLock();
        }
    }
    catch (err) {
        return ContentService.createTextOutput(JSON.stringify({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Không thể xử lý yêu cầu, vui lòng thử lại sau'
        })).setMimeType(ContentService.MimeType.JSON);
    }
}
/**
 * Xử lý yêu cầu HTTP GET để kiểm tra trạng thái hoạt động (Healthcheck)
 */
function doGet(e) {
    try {
        var params = (e && e.parameter) ? e.parameter : {};
        var action = params.action ? String(params.action) : '';

        if (action === 'getClass') return jsonOutput(publicClass(params.code));
        if (action === 'listExams') {
            var ss = SpreadsheetApp.getActiveSpreadsheet();
            var sheet = ss.getSheetByName('DeThi');
            if (!sheet || sheet.getLastRow() <= 1) {
                return ContentService.createTextOutput(JSON.stringify({
                    success: true,
                    exams: []
                })).setMimeType(ContentService.MimeType.JSON);
            }
            var lastRow = sheet.getLastRow();
            var exams = [];
            for (var r = 2; r <= lastRow; r++) {
                var rowVals = sheet.getRange(r, 1, 1, 9).getValues()[0];
                var id = String(rowVals[0] !== undefined && rowVals[0] !== null ? rowVals[0] : '');
                if (!id) continue;
                var title = String(rowVals[1] !== undefined && rowVals[1] !== null ? rowVals[1] : '');
                var subject = String(rowVals[2] !== undefined && rowVals[2] !== null ? rowVals[2] : '');
                var grade = rowVals[3] === '' ? null : Number(rowVals[3]);
                var durationMinutes = rowVals[4] === '' ? null : Number(rowVals[4]);
                var questionCount = Number(rowVals[5]) || 0;
                var group = String(rowVals[6] !== undefined && rowVals[6] !== null ? rowVals[6] : 'Đề giáo viên xuất bản');
                var revision = Number(rowVals[7]) || 1;
                var updatedAt = String(rowVals[8] !== undefined && rowVals[8] !== null ? rowVals[8] : '');
                exams.push({
                    id: id,
                    title: title,
                    subject: subject,
                    grade: grade,
                    durationMinutes: durationMinutes,
                    questionCount: questionCount,
                    group: group,
                    revision: revision,
                    updatedAt: updatedAt
                });
            }
            return ContentService.createTextOutput(JSON.stringify({
                success: true,
                exams: exams
            })).setMimeType(ContentService.MimeType.JSON);
        }

        if (action === 'getExam') {
            var examId = params.id ? String(params.id) : '';
            if (!examId) {
                return ContentService.createTextOutput(JSON.stringify({
                    success: false,
                    error: 'NOT_FOUND',
                    message: 'Không tìm thấy đề thi'
                })).setMimeType(ContentService.MimeType.JSON);
            }
            var ss = SpreadsheetApp.getActiveSpreadsheet();
            var sheet = ss.getSheetByName('DeThi');
            if (!sheet || sheet.getLastRow() <= 1) {
                return ContentService.createTextOutput(JSON.stringify({
                    success: false,
                    error: 'NOT_FOUND',
                    message: 'Không tìm thấy đề thi'
                })).setMimeType(ContentService.MimeType.JSON);
            }
            var lastRow = sheet.getLastRow();
            var foundRow = -1;
            for (var r = 2; r <= lastRow; r++) {
                var cellVal = String(sheet.getRange(r, 1, 1, 1).getValue());
                if (cellVal === examId) {
                    foundRow = r;
                    break;
                }
            }
            if (foundRow < 0) {
                return ContentService.createTextOutput(JSON.stringify({
                    success: false,
                    error: 'NOT_FOUND',
                    message: 'Không tìm thấy đề thi'
                })).setMimeType(ContentService.MimeType.JSON);
            }
            var lastCol = sheet.getLastColumn();
            var chunks = [];
            var chunkStart = String(sheet.getRange(1, 10, 1, 1).getValue()) === 'owner' ? 11 : 10;
            if (lastCol >= chunkStart) {
                var chunkVals = sheet.getRange(foundRow, chunkStart, 1, lastCol - chunkStart + 1).getValues()[0];
                for (var c = 0; c < chunkVals.length; c++) {
                    var val = chunkVals[c];
                    if (val !== undefined && val !== null && val !== '') {
                        chunks.push(String(val));
                    }
                }
            }
            var joinedJson = chunks.join('');
            try {
                var examObj = JSON.parse(joinedJson);
                return ContentService.createTextOutput(JSON.stringify({
                    success: true,
                    exam: examObj
                })).setMimeType(ContentService.MimeType.JSON);
            } catch (parseErr) {
                return ContentService.createTextOutput(JSON.stringify({
                    success: false,
                    error: 'CORRUPTED_EXAM_DATA',
                    message: 'Dữ liệu đề thi bị hỏng'
                })).setMimeType(ContentService.MimeType.JSON);
            }
        }

        return ContentService.createTextOutput(JSON.stringify({
            success: true,
            service: 'Cunata Results Collector (Google Apps Script)',
            status: 'HEALTHY',
            version: '1.0.0',
            time: new Date().toISOString()
        })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
        return jsonOutput({ success: false, error: 'SERVER_ERROR',
            message: 'Không thể đọc dữ liệu, vui lòng thử lại sau' });
    }
}
// Xuất khẩu cho môi trường Node.js testing nếu có
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sanitizeSheetCell,
        parseRational,
        ratAdd,
        ratCmp,
        findRowByAttemptId,
        ensureHeaderRow,
        formatRecordRow,
        doPost,
        doGet,
        DANGEROUS_TRIGGERS
    };
}
// Accounts, sessions and class assignments (WEB-contract 19.2).
function failure(code, message) { return { success: false, error: code, message: message }; }
function tableRows(name) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    return sheet && sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues() : [];
}
function writeTable(name, headers) {
    var book = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = book.getSheetByName(name) || book.insertSheet(name);
    if (!sheet.getLastRow()) sheet.appendRow(headers);
    return sheet;
}
function digest(value) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
        .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function constantEqual(a, b) {
    // Compare fixed-length digests, including when the input lengths differ.
    a = digest(String(a)); b = digest(String(b));
    var difference = 0;
    for (var i = 0; i < 64; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return difference === 0;
}
function randomToken() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
function teacherRow(username) {
    var rows = tableRows('GiaoVien');
    for (var i = 0; i < rows.length; i++) if (rows[i][0] === username) return { row: i + 2, values: rows[i] };
    return null;
}
function newSession(role, username, name, credential) {
    var token = randomToken();
    var expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    var payload = JSON.stringify({ role: role, username: username,
        name: name, credential: credential, expiresAt: expiresAt });
    CacheService.getScriptCache().put('session:' + token, payload, 21600);
    PropertiesService.getScriptProperties().setProperty('session:' + token, payload);
    return { success: true, token: token, name: name, expiresAt: expiresAt };
}
function sessionPrincipal(token, role) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return null;
    var raw = CacheService.getScriptCache().get('session:' + token);
    if (!raw) {
        raw = PropertiesService.getScriptProperties().getProperty('session:' + token);
        if (raw) {
            try {
                var cached = JSON.parse(raw);
                var ttlSec = Math.floor((Date.parse(cached.expiresAt) - Date.now()) / 1000);
                if (ttlSec > 0) {
                    CacheService.getScriptCache().put('session:' + token, raw, Math.min(21600, ttlSec));
                }
            } catch (err) {
                raw = null;
            }
        }
    }
    if (!raw) return null;
    var session = JSON.parse(raw);
    if (session.role !== role || Date.parse(session.expiresAt) <= Date.now()) return null;
    if (role === 'teacher') {
        var teacher = teacherRow(session.username);
        if (!teacher || teacher.values[4] !== true || !constantEqual(session.credential, teacher.values[3])) return null;
    } else {
        var password = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
        if (!password || !constantEqual(session.credential, digest(password))) return null;
    }
    return session;
}
function examOwner(sheet, row) {
    return String(sheet.getRange(1, 10, 1, 1).getValue()) === 'owner' ? String(sheet.getRange(row, 10, 1, 1).getValue()) : '';
}
function migrateExamOwner(sheet) {
    if (String(sheet.getRange(1, 10, 1, 1).getValue()) === 'owner') return;
    var width = Math.max(10, sheet.getLastColumn());
    if (typeof sheet.getMaxColumns === 'function' && width + 1 > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), width + 1 - sheet.getMaxColumns());
    var rows = sheet.getRange(1, 1, sheet.getLastRow(), width).getValues();
    rows.forEach(function (row, i) { row.splice(9, 0, i === 0 ? 'owner' : ''); });
    sheet.getRange(1, 1, rows.length, width + 1).setValues(rows);
}
function classBy(key, value) {
    return tableRows('Lop').find(function (r) { return String(r[key]) === value; }) || null;
}
function classResults(code, assignmentId) {
    // Sheets can return an existing all-digit class code as a number.
    // Compare the stored identity as text on both sides.
    code = String(code);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('KetQua');
    if (!sheet || sheet.getLastRow() <= 1 || sheet.getLastColumn() < 19) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, 19).getValues().filter(function (r) {
        return String(r[17]) === code && (!assignmentId || String(r[18]) === assignmentId);
    }).map(function (r) {
        return { attempt_id: String(r[0]), exam_id: String(r[1]), exam_version_id: String(r[2]), candidate_display: String(r[3]),
            started_at: String(r[4]), submitted_at: String(r[5]), duration_seconds: r[6],
            sections: { I: { score: String(r[7]), max: String(r[8]) }, II: { score: String(r[9]), max: String(r[10]) }, III: { score: String(r[11]), max: String(r[12]) } },
            score_p1: String(r[7]), max_p1: String(r[8]), score_p2: String(r[9]), max_p2: String(r[10]), score_p3: String(r[11]), max_p3: String(r[12]),
            total: String(r[13]), maxTotal: String(r[14]), class_code: String(r[17]), assignment_id: String(r[18]) };
    });
}
function examMetadata(id) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DeThi');
    if (!sheet) return null;
    var rows = tableRows('DeThi');
    for (var i = 0; i < rows.length; i++) if (String(rows[i][0]) === id)
        return { title: String(rows[i][1]), questionCount: Number(rows[i][5]), durationMinutes: rows[i][4] === '' ? null : Number(rows[i][4]), owner: examOwner(sheet, i + 2) };
    return null;
}
function assignmentsFor(classId, code) {
    return tableRows('GiaoDe').filter(function (r) { return r[1] === classId; }).map(function (r) {
        var meta = examMetadata(String(r[2]));
        return { assignmentId: String(r[0]), classId: classId, examId: String(r[2]), openAt: String(r[3]), dueAt: String(r[4]),
            title: meta ? meta.title : String(r[2]), questionCount: meta ? meta.questionCount : null,
            durationMinutes: meta ? meta.durationMinutes : null, submissionCount: classResults(code, String(r[0])).length };
    });
}
function publicClass(rawCode) {
    var code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
    var cls = classBy(1, code);
    if (!cls) return failure('NOT_FOUND', 'Không tìm thấy lớp');
    var teacher = teacherRow(cls[3]);
    return { success: true, class: { code: code, name: String(cls[2]), teacherName: teacher ? String(teacher.values[1]) : '' }, assignments: assignmentsFor(cls[0], code).map(function (a) {
        // Public reads never include student names or submission counts.
        delete a.submissionCount; delete a.classId; return a;
    }) };
}
function validateSubmissionAssignment(code, id, examId) {
    if (!code && !id) return null;
    var cls = classBy(1, code);
    var assignment = tableRows('GiaoDe').find(function (r) { return r[0] === id; });
    if (!cls || !assignment || assignment[1] !== cls[0] || assignment[2] !== examId) return failure('INVALID_ASSIGNMENT', 'Bài giao không thuộc lớp hoặc đề đã chọn');
    if (Date.now() < Date.parse(assignment[3])) return failure('NOT_OPEN', 'Bài giao chưa mở');
    if (Date.now() > Date.parse(assignment[4]) + 120000) return failure('PAST_DUE', 'Nộp sau hạn — giáo viên chưa nhận');
    return null;
}
function accountAction(action, payload) {
    if (action === 'adminLogin') {
        var configured = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
        if (!configured) return failure('ADMIN_PASSWORD_NOT_SET', 'Chưa đặt ADMIN_PASSWORD trong Script Properties');
        if (typeof payload.password !== 'string' || !constantEqual(payload.password, configured)) return failure('UNAUTHORIZED', 'Sai mật khẩu');
        return newSession('admin', '', 'Admin', digest(configured));
    }
    if (action === 'teacherLogin') {
        var teacher = teacherRow(payload.username);
        var hash = digest((teacher ? teacher.values[2] : 'invalid') + ':' + (typeof payload.password === 'string' ? payload.password : ''));
        var valid = constantEqual(hash, teacher ? teacher.values[3] : digest('invalid'));
        if (!teacher || teacher.values[4] !== true || !valid) return failure('UNAUTHORIZED', 'Sai tên đăng nhập hoặc mật khẩu');
        return newSession('teacher', teacher.values[0], teacher.values[1], teacher.values[3]);
    }
    var adminActions = ['adminCreateTeacher', 'adminListTeachers', 'adminResetPassword', 'adminSetTeacherActive', 'adminStats'];
    var teacherActions = ['createClass', 'listMyClasses', 'assignExam', 'listAssignments', 'listResults'];
    var role = adminActions.indexOf(action) >= 0 ? 'admin' : teacherActions.indexOf(action) >= 0 ? 'teacher' : '';
    if (!role) return null;
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) return failure('SERVER_BUSY', 'Máy chủ đang bận, vui lòng thử lại');
    try {
        var principal = sessionPrincipal(payload.token, role);
        if (!principal) return failure('UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ');
        if (action === 'adminListTeachers') return { success: true, teachers: tableRows('GiaoVien').map(function (r) {
            return { username: String(r[0]), name: String(r[1]), active: r[4] === true, createdAt: String(r[5]) };
        }) };
        if (action === 'adminStats') return { success: true, stats: { teachers: tableRows('GiaoVien').length, classes: tableRows('Lop').length, exams: tableRows('DeThi').length, results: tableRows('KetQua').length } };
        if (['adminCreateTeacher', 'adminResetPassword', 'adminSetTeacherActive'].indexOf(action) >= 0) {
            var username = payload.username;
            if (typeof username !== 'string' || username.length < 3 || username.length > 32 || /[^a-z0-9._-]/.test(username)) return failure('INVALID_USERNAME', 'Tên đăng nhập phải có 3–32 ký tự a-z0-9._-');
            var existing = teacherRow(username);
            if (action === 'adminCreateTeacher' && existing) return failure('USERNAME_TAKEN', 'Tên đăng nhập đã được dùng');
            if (action !== 'adminCreateTeacher' && !existing) return failure('NOT_FOUND', 'Không tìm thấy giáo viên');
            if (action === 'adminSetTeacherActive') {
                if (typeof payload.active !== 'boolean') return failure('INVALID_ACTIVE', 'Trạng thái không hợp lệ');
                writeTable('GiaoVien', []).getRange(existing.row, 5).setValue(payload.active);
            } else {
                if (typeof payload.password !== 'string' || Array.from(payload.password).length < 8) return failure('INVALID_PASSWORD', 'Mật khẩu cần ít nhất 8 ký tự');
                if (action === 'adminCreateTeacher' && (typeof payload.name !== 'string' || !payload.name.trim())) return failure('INVALID_NAME', 'Cần nhập tên giáo viên');
                var sheet = writeTable('GiaoVien', ['username', 'name', 'salt', 'hash', 'active', 'createdAt']);
                var salt = randomToken();
                var passwordHash = digest(salt + ':' + payload.password);
                if (existing) sheet.getRange(existing.row, 3, 1, 2).setValues([[salt, passwordHash]]);
                else sheet.appendRow([examTextCell(username), examTextCell(payload.name.trim()), salt, passwordHash, true, new Date().toISOString()]);
            }
            SpreadsheetApp.flush(); return { success: true };
        }
        if (action === 'createClass') {
            if (typeof payload.name !== 'string' || !payload.name.trim()) return failure('INVALID_NAME', 'Cần nhập tên lớp');
            var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            var code = '';
            for (var tries = 0; tries < 100; tries++) {
                // UUID hex digits are unbiased; discard bytes beyond an even multiple of alphabet length.
                var random = randomToken(); code = '';
                for (var i = 0; i + 1 < random.length && code.length < 6; i += 2) {
                    var byte = parseInt(random.slice(i, i + 2), 16);
                    if (byte < Math.floor(256 / alphabet.length) * alphabet.length) code += alphabet[byte % alphabet.length];
                }
                if (code.length === 6 && !classBy(1, code)) break;
                code = '';
            }
            if (!code) return failure('SERVER_BUSY', 'Chưa tạo được mã lớp, vui lòng thử lại');
            var classId = Utilities.getUuid();
            writeTable('Lop', ['classId', 'code', 'name', 'username', 'createdAt']).appendRow([classId, code, examTextCell(payload.name.trim()), examTextCell(principal.username), new Date().toISOString()]);
            SpreadsheetApp.flush(); return { success: true, classId: classId, code: code };
        }
        if (action === 'listMyClasses') return { success: true, classes: tableRows('Lop').filter(function (r) { return r[3] === principal.username; }).map(function (r) {
            var results = classResults(r[1]);
            return { classId: String(r[0]), code: String(r[1]), name: String(r[2]), createdAt: String(r[4]), studentCount: new Set(results.map(function (x) { return x.candidate_display; })).size };
        }) };
        var cls = classBy(0, payload.classId);
        if (!cls) return failure('NOT_FOUND', 'Không tìm thấy lớp');
        if (cls[3] !== principal.username) return failure('FORBIDDEN', 'Lớp thuộc giáo viên khác');
        if (action === 'listAssignments') return { success: true, assignments: assignmentsFor(cls[0], cls[1]) };
        if (action === 'listResults') return { success: true, results: classResults(cls[1], payload.assignmentId) };
        if (action === 'assignExam') {
            var isoDate = function (s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(s) && Number.isFinite(Date.parse(s)); };
            if (!isoDate(payload.openAt) || !isoDate(payload.dueAt) || Date.parse(payload.dueAt) <= Date.parse(payload.openAt)) return failure('INVALID_DATES', 'Hạn nộp phải sau giờ mở, theo ISO 8601');
            if (typeof payload.examId !== 'string' || !payload.examId.trim()) return failure('INVALID_EXAM', 'Thiếu mã đề');
            var meta = examMetadata(payload.examId);
            if (meta && meta.owner !== principal.username && meta.owner !== '') return failure('FORBIDDEN', 'Đề thuộc giáo viên khác');
            // Static shared exams live on the frontend; no client-supplied title/key is persisted here.
            var assignmentId = Utilities.getUuid();
            writeTable('GiaoDe', ['assignmentId', 'classId', 'examId', 'openAt', 'dueAt', 'createdAt']).appendRow([assignmentId, cls[0], examTextCell(payload.examId), new Date(payload.openAt).toISOString(), new Date(payload.dueAt).toISOString(), new Date().toISOString()]);
            SpreadsheetApp.flush(); return { success: true, assignmentId: assignmentId };
        }
    } finally { lock.releaseLock(); }
    return failure('UNKNOWN_ACTION', 'Thao tác không hợp lệ');
}
