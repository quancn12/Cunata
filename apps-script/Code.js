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
            'raw_answers_json'
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
/**
 * Xử lý yêu cầu HTTP POST gửi kết quả bài làm về hệ thống
 *
 * @param {GoogleAppsScript.Events.DoPost} e Sự kiện POST của Web App
 * @returns {GoogleAppsScript.Content.TextOutput} Phản hồi JSON
 */
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
            raw_answers_json: payload.raw_answers_json || payload.responses || ''
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
            const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
            ensureHeaderRow(sheet);
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
                        message: 'Lỗi khi đọc bản ghi cũ để xác thực tính toàn vẹn: ' + (readError.message || String(readError))
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
            const row = formatRecordRow(canonicalPayload);
            sheet.appendRow(row);
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
            message: err.message || String(err)
        })).setMimeType(ContentService.MimeType.JSON);
    }
}
/**
 * Xử lý yêu cầu HTTP GET để kiểm tra trạng thái hoạt động (Healthcheck)
 */
function doGet(e) {
    return ContentService.createTextOutput(JSON.stringify({
        service: 'Cunata Results Collector (Google Apps Script)',
        status: 'HEALTHY',
        version: '1.0.0',
        time: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
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
