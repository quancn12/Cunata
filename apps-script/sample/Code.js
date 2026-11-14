/**
 * ============================================================================
 * CẢNH BÁO BẮT BUỘC THEO HỢP ĐỒNG KỸ THUẬT (WEB-contract.md §7):
 * Mẫu tham khảo kỹ thuật — "chưa triển khai, chưa kiểm CORS thật".
 * 
 * - KHÔNG CHỨA CREDENTIALS, API KEY, SERVICE ACCOUNT, TOKEN HOẶC ENDPOINT DEPLOYED.
 * - MẶC ĐỊNH BỊ VÔ HIỆU HÓA (DISABLED) KHI CHƯA CÓ QUYẾT ĐỊNH D04 TỪ TRƯỞNG PHÒNG.
 * - KHÔNG TUYÊN BỐ ĐÃ GỬI GOOGLE DRIVE KHI CHƯA CÓ RECEIPT XÁC NHẬN TỪ HỆ THỐNG NHẬN.
 * - CÁC BÀI TEST LIÊN QUAN TRONG MÔI TRƯỜNG NODE VM LÀ TEST MÔ PHỎNG (SIMULATED).
 * - KIỂM THỬ CORS VÀ ĐỌC LẠI (READBACK) TRÊN GOOGLE SHEETS THẬT ĐƯỢC ĐÁNH DẤU LÀ NOT_RUN
 *   KHI CHƯA ĐƯỢC CHỦ DỰ ÁN PHÊ DUYỆT CẤP QUYỀN VÀ MÔI TRƯỜNG.
 * ============================================================================
 * 
 * GIẢI THÍCH GIỚI HẠN BẢO MẬT CHẤM ĐIỂM (TRUSTED SERVER GRADING LIMITATIONS):
 * 1. Client-Side Trust Boundary:
 *    Trong kiến trúc web tĩnh (GitHub Pages), mã nguồn chạy hoàn toàn trên trình duyệt người dùng.
 *    Điểm số được tính toán tại client và gửi lên endpoint này. Người dùng có kiến thức kỹ thuật
 *    có thể can thiệp devtools để sửa payload, thay đổi câu trả lời hoặc làm giả điểm.
 * 2. Nguy cơ lộ đáp án (Key Leakage):
 *    Nếu đề thi tải về máy kèm đáp án để phục vụ việc chấm offline, học sinh có thể trích xuất
 *    đáp án trước khi hết giờ thi. Việc ẩn giao diện đáp án chỉ là tính năng trải nghiệm (UX),
 *    không phải cơ chế bảo mật cryptographic.
 * 3. Yêu cầu hệ thống chấm tin cậy phía máy chủ (Trusted Server Grading — D04 / D08):
 *    Đối với các kỳ thi chính thức có yêu cầu tính trung thực cao, không được chấp nhận điểm
 *    do client tự tính là nguồn sự thật (authoritative). Khi đó, cần triển khai dịch vụ backend
 *    tin cậy (Cloudflare Worker hoặc Apps Script có xác thực) nắm giữ phiên bản đề thi và đáp án
 *    bí mật, tự chạy lại hàm chấm scoreAttempt deterministically để xác nhận điểm.
 * ============================================================================
 */

// Danh sách ký tự kích hoạt công thức bảng tính nguy hiểm (CWE-1236)
const DANGEROUS_TRIGGERS = [
  '=', '+', '-', '@', '|',
  '\t', '\r', '\n',
  '＝', '＋', '－', '＠', '｜'
];

const DANGEROUS_TRIGGER_PREFIX_REGEX = /^['\s\x00-\x1f\x7f-\x9f\uFEFF\u200B-\u200D\u3000]*[=+\-@|＝＋－＠｜]/u;
const CONTROL_CHAR_START_REGEX = /^[\x00-\x1f\x7f-\x9f]/u;

/**
 * Kiểm tra xem chuỗi có chứa tiền tố kích hoạt công thức bảng tính nguy hiểm hay không.
 * @param {string} str
 * @returns {boolean}
 */
function isFormulaDangerous(str) {
  if (!str || typeof str !== 'string') return false;
  return DANGEROUS_TRIGGER_PREFIX_REGEX.test(str) || CONTROL_CHAR_START_REGEX.test(str);
}

/**
 * Làm sạch ô bảng tính chống Spreadsheet Formula Injection (CWE-1236).
 * Nếu chuỗi bắt đầu bằng ký tự nguy hiểm (ví dụ: -0,5 ở Phần III hoặc =IMPORTXML),
 * thêm tiền tố nháy đơn (') để Google Sheets / Excel hiểu đây là chuỗi thuần.
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
  if (isFormulaDangerous(str)) {
    return "'" + str;
  }
  return str;
}

/**
 * Tìm ước số chung lớn nhất để tối giản phân số BigInt.
 */
function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * Phân tích chuỗi số hoặc phân số thành đối tượng { num: BigInt, den: BigInt } tối giản chuẩn tắc.
 * @param {unknown} val
 * @returns {{ num: bigint, den: bigint } | null}
 */
function parseRational(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  const m = s.match(/^(-?\d+)(?:\/([1-9]\d*))?$/);
  if (!m) return null;
  try {
    let num = BigInt(m[1]);
    let den = m[2] ? BigInt(m[2]) : 1n;
    if (den === 0n) return null;
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    if (num === 0n) {
      return { num: 0n, den: 1n };
    }
    const g = gcd(num, den);
    return { num: num / g, den: den / g };
  } catch (_) {
    return null;
  }
}

function ratAdd(a, b) {
  return { num: a.num * b.den + b.num * a.den, den: a.den * b.den };
}

function ratCmp(a, b) {
  const diff = a.num * b.den - b.num * a.den;
  if (diff < 0n) return -1;
  if (diff > 0n) return 1;
  return 0;
}

/**
 * Chuẩn hóa chuỗi phân số BigInt về dạng chuỗi chuẩn.
 */
function toCanonicalStr(r) {
  if (!r) return '0';
  return r.den === 1n ? String(r.num) : String(r.num) + '/' + String(r.den);
}

/**
 * Chuẩn hóa JSON với các keys được sắp xếp đệ quy để so sánh cấu trúc bất biến thứ tự.
 */
function canonicalizeJson(v) {
  if (v === null || v === undefined) return 'null';
  let val = v;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        val = JSON.parse(trimmed);
      } catch (_) {
        return JSON.stringify(v);
      }
    } else {
      return JSON.stringify(v);
    }
  }

  function walk(node) {
    if (node === null || node === undefined) return 'null';
    if (typeof node === 'string') return JSON.stringify(node);
    if (typeof node === 'number') return Number.isFinite(node) ? String(node) : 'null';
    if (typeof node === 'boolean') return node ? 'true' : 'false';
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

/**
 * Tính toán mã băm 16 ký tự hex deterministically từ dữ liệu lượt làm bài,
 * đồng bộ thuật toán với client computePayloadHash trong src/collect/index.ts.
 * 
 * @param {Object} payload Dữ liệu bài thi
 * @returns {string} Mã băm hex 16 ký tự
 */
function computePayloadHash(payload) {
  if (payload && (payload.payloadHash || payload.payload_hash)) {
    const directHash = String(payload.payloadHash || payload.payload_hash).trim();
    if (directHash.length === 16) {
      return directHash;
    }
  }

  const canonical = JSON.stringify({
    examId: payload.examId || payload.exam_id,
    examVersionId: payload.examVersionId || payload.exam_version_id,
    attemptId: payload.attemptId || payload.attempt_id,
    revision: payload.revision ?? 1,
    candidateName: payload.candidateName || payload.candidate_display || '',
    startedAt: payload.startedAt || payload.started_at,
    submittedAt: payload.submittedAt || payload.submitted_at,
    responses: payload.responses || payload.raw_answers_json,
    scoreDTO: payload.scoreDTO || null,
  });

  let h1 = 0x811c9dc5;
  let h2 = 0x9dc5811c;
  for (let i = 0; i < canonical.length; i++) {
    const ch = canonical.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 16777619);
    h2 = Math.imul(h2 ^ (ch >>> 8), 16777619);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${hex1}${hex2}`;
}

/**
 * 18 cột chuẩn của Google Sheets Collector mẫu (A-R):
 * A: attempt_id (UUID)
 * B: exam_id
 * C: exam_version_id
 * D: candidate_display
 * E: started_at (ISO 8601)
 * F: submitted_at (ISO 8601)
 * G: duration_seconds
 * H: score_p1
 * I: max_p1
 * J: score_p2
 * K: max_p2
 * L: score_p3
 * M: max_p3
 * N: total_score
 * O: max_total
 * P: policy_version
 * Q: raw_answers_json
 * R: payload_hash (khóa dedupe đồng bộ với client)
 */
const SAMPLE_HEADERS = [
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
  'raw_answers_json',
  'payload_hash'
];

/**
 * Đảm bảo hàng tiêu đề chuẩn 18 cột được tạo nếu trang tính mới.
 * Thực thi bên trong LockService lock để tránh race condition.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function ensureHeaderRow(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SAMPLE_HEADERS);
    SpreadsheetApp.flush();
  }
}

/**
 * Loại bỏ tiền tố nháy đơn (') khi đọc ô bảng tính.
 */
function cleanCell(val) {
  const s = String(val ?? '').trim();
  return s.startsWith("'") ? s.slice(1) : s;
}

/**
 * Tìm chỉ số dòng đã tồn tại theo bộ ba định danh (Tuple Deduplication):
 * Tuple = (exam_id, exam_version_id, attempt_id)
 * 
 * Khác với bản cũ chỉ kiểm tra attempt_id, việc tra cứu theo toàn bộ tuple bảo đảm:
 * 1. Phân lập hoàn toàn dữ liệu giữa các đề thi hoặc phiên bản khác nhau.
 * 2. Không bị bypass khi các kỳ thi khác nhau tình cờ có trùng attempt ID hoặc alias.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} examId Mã đề thi
 * @param {string} examVersionId Phiên bản đề thi
 * @param {string} attemptId Mã lượt thi
 * @returns {number} Chỉ số dòng (1-based) nếu tìm thấy, -1 nếu chưa tồn tại
 */
function findRowByTuple(sheet, examId, examVersionId, attemptId) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return -1;
  }

  const rawAttemptId = String(attemptId || '').trim();
  const rawExamId = String(examId || '').trim();
  const rawExamVersionId = String(examVersionId || '').trim();

  // Đọc 3 cột đầu: A (attempt_id), B (exam_id), C (exam_version_id)
  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const rowAttempt = cleanCell(row[0]);
    const rowExam = cleanCell(row[1]);
    const rowVersion = cleanCell(row[2]);

    if (rowAttempt === rawAttemptId && rowExam === rawExamId && rowVersion === rawExamVersionId) {
      return i + 2; // 1-based row index (bỏ qua hàng tiêu đề)
    }
  }

  return -1;
}

/**
 * Định dạng 18 cột chuẩn cho một bản ghi kết quả bài thi.
 * Mọi trường chuỗi đều được bảo vệ chống Formula Injection (CWE-1236).
 * 
 * @param {Object} data Dữ liệu kết quả bài thi
 * @param {string} payloadHash Mã băm payload
 * @returns {Array<string|number>}
 */
function formatRecordRow(data, payloadHash) {
  const attemptId = sanitizeSheetCell(String(data.attempt_id || data.attemptId || '').trim());
  const examId = sanitizeSheetCell(String(data.exam_id || data.examId || '').trim());
  const examVersionId = sanitizeSheetCell(String(data.exam_version_id || data.examVersionId || '').trim());
  const candidateDisplay = sanitizeSheetCell(data.candidate_display || data.candidateName || 'Thí sinh tự do');
  const startedAt = sanitizeSheetCell(String(data.started_at || data.startedAt || ''));
  const submittedAt = sanitizeSheetCell(String(data.submitted_at || data.submittedAt || new Date().toISOString()));
  const durationSeconds = typeof data.duration_seconds === 'number' && Number.isFinite(data.duration_seconds) && data.duration_seconds >= 0 ? data.duration_seconds : 0;

  const scoreP1 = sanitizeSheetCell(data.sections?.I?.score ?? data.score_p1 ?? '0');
  const maxP1 = sanitizeSheetCell(data.sections?.I?.max ?? data.max_p1 ?? '0');
  const scoreP2 = sanitizeSheetCell(data.sections?.II?.score ?? data.score_p2 ?? '0');
  const maxP2 = sanitizeSheetCell(data.sections?.II?.max ?? data.max_p2 ?? '0');
  const scoreP3 = sanitizeSheetCell(data.sections?.III?.score ?? data.score_p3 ?? '0');
  const maxP3 = sanitizeSheetCell(data.sections?.III?.max ?? data.max_p3 ?? '0');
  const totalScore = sanitizeSheetCell(data.total ?? data.total_score ?? '0');
  const maxTotal = sanitizeSheetCell(data.maxTotal ?? data.max_total ?? '0');
  const policyVersion = sanitizeSheetCell(String(data.policy_version || data.ruleSetId || 'custom-v1'));

  let rawJson = '';
  if (data.raw_answers_json) {
    rawJson = typeof data.raw_answers_json === 'string'
      ? data.raw_answers_json
      : JSON.stringify(data.raw_answers_json);
  } else if (data.responses) {
    rawJson = JSON.stringify(data.responses);
  }
  const sanitizedRawJson = sanitizeSheetCell(rawJson);
  const sanitizedPayloadHash = sanitizeSheetCell(payloadHash);

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
    sanitizedRawJson,
    sanitizedPayloadHash
  ];
}

/**
 * Xử lý yêu cầu HTTP POST gửi kết quả bài làm về hệ thống.
 * 
 * Luồng hoạt động tuân thủ nghiêm ngặt Hợp đồng kỹ thuật §7:
 * 1. Phân tích cú pháp payload (postData hoặc parameter).
 * 2. Xác thực schema, định danh tuple (exam_id, exam_version_id, attempt_id) và BigInt rational scores.
 * 3. Tính toán/xác nhận payloadHash độc lập.
 * 4. Đồng bộ tranh chấp đồng thời bằng LockService.getScriptLock() (timeout 30s).
 * 5. Tra cứu tuple trong Google Sheets:
 *    - Nếu tuple tồn tại và payloadHash khớp -> trả về ALREADY_RECORDED receipt (idempotent).
 *    - Nếu tuple tồn tại nhưng payloadHash hoặc nội dung khác nhau -> trả về PAYLOAD_CONFLICT, không ghi đè!
 *    - Nếu tuple chưa tồn tại -> appendRow và trả về RECORDED receipt.
 * 
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  try {
    let payload = null;
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter && e.parameter.payload) {
      payload = JSON.parse(e.parameter.payload);
    }

    if (!payload || typeof payload !== 'object') {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'INVALID_PAYLOAD',
        message: 'Dữ liệu gửi lên không đúng định dạng JSON'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 1. Xác thực tuple định danh bắt buộc: (attempt_id, exam_id, exam_version_id)
    const rawAttemptId = payload.attempt_id ?? payload.attemptId;
    if (rawAttemptId === undefined || rawAttemptId === null || typeof rawAttemptId !== 'string' || !rawAttemptId.trim()) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'INVALID_ATTEMPT_ID',
        message: 'Trường attempt_id là bắt buộc và phải là chuỗi không rỗng'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    const attemptId = rawAttemptId.trim();

    const rawExamId = payload.exam_id ?? payload.examId;
    if (rawExamId === undefined || rawExamId === null || typeof rawExamId !== 'string' || !rawExamId.trim()) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'INVALID_EXAM_ID',
        message: 'Trường exam_id là bắt buộc và phải là chuỗi không rỗng'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    const examId = rawExamId.trim();

    const rawExamVersionId = payload.exam_version_id ?? payload.examVersionId;
    if (rawExamVersionId === undefined || rawExamVersionId === null || typeof rawExamVersionId !== 'string' || !rawExamVersionId.trim()) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'INVALID_EXAM_VERSION_ID',
        message: 'Trường exam_version_id là bắt buộc và phải là chuỗi không rỗng'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    const examVersionId = rawExamVersionId.trim();

    // 2. Kiểm tra tính nhất quán điểm tổng và điểm tối đa theo phân số BigInt
    const rawTotal = payload.total ?? payload.total_score;
    const rawMaxTotal = payload.maxTotal ?? payload.max_total;
    if (rawTotal === undefined || rawTotal === null || rawMaxTotal === undefined || rawMaxTotal === null) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'MISSING_SCORE',
        message: 'Thiếu trường điểm tổng hoặc điểm tối đa của bài thi'
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
    if (totalRat.num < 0n || maxTotalRat.num <= 0n) {
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

    // 3. Xác thực breakdown 3 phần (Sections I, II, III)
    let secI = null;
    let secII = null;
    let secIII = null;
    if (payload.sections && typeof payload.sections === 'object' && !Array.isArray(payload.sections)) {
      const sec = payload.sections;
      if (!sec.I || !sec.II || !sec.III ||
          sec.I.score === undefined || sec.I.max === undefined ||
          sec.II.score === undefined || sec.II.max === undefined ||
          sec.III.score === undefined || sec.III.max === undefined) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: 'INCOMPLETE_SECTIONS',
          message: 'Trường sections phải có đầy đủ 3 phần I, II, III với điểm score và max'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      secI = { score: sec.I.score, max: sec.I.max };
      secII = { score: sec.II.score, max: sec.II.max };
      secIII = { score: sec.III.score, max: sec.III.max };
    } else if (payload.score_p1 !== undefined && payload.max_p1 !== undefined &&
               payload.score_p2 !== undefined && payload.max_p2 !== undefined &&
               payload.score_p3 !== undefined && payload.max_p3 !== undefined) {
      secI = { score: payload.score_p1, max: payload.max_p1 };
      secII = { score: payload.score_p2, max: payload.max_p2 };
      secIII = { score: payload.score_p3, max: payload.max_p3 };
    } else {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'INCOMPLETE_SECTIONS',
        message: 'Yêu cầu đầy đủ thông tin điểm 3 phần I, II, III'
      })).setMimeType(ContentService.MimeType.JSON);
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
        message: 'Điểm các phần không đúng định dạng phân số hợp lệ'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    if (s1.num < 0n || s2.num < 0n || s3.num < 0n || m1.num < 0n || m2.num < 0n || m3.num < 0n) {
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
        message: 'Tổng điểm các phần không khớp với điểm tổng bài thi'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    if (ratCmp(sumMax, maxTotalRat) !== 0) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'SECTION_MAX_MISMATCH',
        message: 'Tổng điểm tối đa các phần không khớp với điểm tối đa của đề thi'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 4. Tính toán mã băm Payload Hash deterministically
    const payloadHash = computePayloadHash(payload);

    const canonicalPayload = {
      attempt_id: attemptId,
      attemptId,
      exam_id: examId,
      examId,
      exam_version_id: examVersionId,
      examVersionId,
      candidate_display: payload.candidate_display || payload.candidateName || 'Thí sinh tự do',
      candidateName: payload.candidate_display || payload.candidateName || 'Thí sinh tự do',
      started_at: payload.started_at || payload.startedAt || '',
      startedAt: payload.started_at || payload.startedAt || '',
      submitted_at: payload.submitted_at || payload.submittedAt || new Date().toISOString(),
      submittedAt: payload.submitted_at || payload.submittedAt || new Date().toISOString(),
      duration_seconds: typeof payload.duration_seconds === 'number' && Number.isFinite(payload.duration_seconds) && payload.duration_seconds >= 0 ? payload.duration_seconds : 0,
      sections: {
        I: { score: toCanonicalStr(s1), max: toCanonicalStr(m1) },
        II: { score: toCanonicalStr(s2), max: toCanonicalStr(m2) },
        III: { score: toCanonicalStr(s3), max: toCanonicalStr(m3) }
      },
      total: toCanonicalStr(totalRat),
      total_score: toCanonicalStr(totalRat),
      maxTotal: toCanonicalStr(maxTotalRat),
      max_total: toCanonicalStr(maxTotalRat),
      policy_version: payload.policy_version || payload.ruleSetId || 'custom-v1',
      raw_answers_json: payload.raw_answers_json || payload.responses || '',
      responses: payload.responses || payload.raw_answers_json || '',
      payloadHash,
    };

    // 5. Kiểm soát tranh chấp đồng thời bằng LockService (ngăn chặn race conditions)
    const lock = LockService.getScriptLock();
    const hasLock = lock.tryLock(30000); // Đợi tối đa 30s
    if (!hasLock) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'SERVER_BUSY',
        message: 'Máy chủ đang bận xử lý bài thi khác, vui lòng thử lại sau giây lát'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
      ensureHeaderRow(sheet);

      // 6. Deduplication theo Bộ Ba Định Danh (Tuple Deduplication) và Payload Hash
      const existingRow = findRowByTuple(sheet, examId, examVersionId, attemptId);
      if (existingRow > 0) {
        // Đọc dữ liệu dòng hiện tại để xác định xem là retry lũy nghiệm hay conflict dữ liệu
        let storedHash = '';
        let exTotal = '';
        let exMax = '';
        let exRaw = '';
        let readError = null;

        try {
          const rowVals = sheet.getRange(existingRow, 1, 1, 18).getValues()[0];
          if (rowVals) {
            exTotal = cleanCell(rowVals[13]);
            exMax = cleanCell(rowVals[14]);
            exRaw = cleanCell(rowVals[16]);
            storedHash = cleanCell(rowVals[17]);
          }
        } catch (err) {
          readError = err;
        }

        if (readError) {
          return ContentService.createTextOutput(JSON.stringify({
            success: false,
            error: 'STORAGE_READ_ERROR',
            message: 'Lỗi khi đọc bản ghi đã tồn tại để xác minh tính toàn vẹn'
          })).setMimeType(ContentService.MimeType.JSON);
        }

        // So sánh payloadHash hoặc đối chiếu nội dung
        let isConflict = false;
        if (storedHash && storedHash.length === 16) {
          if (storedHash !== payloadHash) {
            isConflict = true;
          }
        } else {
          // Fallback nếu dòng cũ chưa có cột payload_hash: so sánh điểm và raw answers
          const ratEqual = (aStr, bStr) => {
            const ra = parseRational(aStr);
            const rb = parseRational(bStr);
            if (ra && rb) return ratCmp(ra, rb) === 0;
            return aStr === bStr;
          };
          if (!ratEqual(exTotal, toCanonicalStr(totalRat)) || !ratEqual(exMax, toCanonicalStr(maxTotalRat))) {
            isConflict = true;
          } else if (canonicalizeJson(exRaw) !== canonicalizeJson(canonicalPayload.raw_answers_json)) {
            isConflict = true;
          }
        }

        if (isConflict) {
          return ContentService.createTextOutput(JSON.stringify({
            success: false,
            error: 'PAYLOAD_CONFLICT',
            message: 'Xung đột dữ liệu: attemptId đã tồn tại với nội dung hoặc kết quả khác, không thể ghi đè',
            examId,
            examVersionId,
            attemptId,
            storedHash,
            payloadHash
          })).setMimeType(ContentService.MimeType.JSON);
        }

        // Dữ liệu hoàn toàn khớp: trả về biên nhận ALREADY_RECORDED (Receipt chuẩn)
        const receipt = {
          examId,
          examVersionId,
          attemptId,
          submissionId: 'sub-' + attemptId,
          payloadHash,
          receivedAt: new Date().toISOString(),
          status: 'already_recorded'
        };

        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          ...receipt,
          status: 'already_recorded',
          message: 'Kết quả bài thi đã được ghi nhận trước đó (lũy nghiệm/idempotent)'
        })).setMimeType(ContentService.MimeType.JSON);
      }

      // 7. Ghi nhận lượt thi mới vào Google Sheets
      const newRow = formatRecordRow(canonicalPayload, payloadHash);
      sheet.appendRow(newRow);
      SpreadsheetApp.flush();

      const receipt = {
        examId,
        examVersionId,
        attemptId,
        submissionId: 'sub-' + attemptId,
        payloadHash,
        receivedAt: new Date().toISOString(),
        status: 'recorded'
      };

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        ...receipt,
        status: 'recorded',
        message: 'Ghi nhận kết quả bài thi thành công'
      })).setMimeType(ContentService.MimeType.JSON);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || String(err)
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Xử lý yêu cầu HTTP GET kiểm tra tình trạng dịch vụ (Healthcheck).
 * Giữ nguyên cảnh báo chưa kiểm CORS thật theo Hợp đồng kỹ thuật §7.
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    service: 'Cunata Sample Results Collector',
    cors_warning: 'chưa triển khai, chưa kiểm CORS thật',
    status: 'HEALTHY',
    version: 'sample-v1',
    columns: SAMPLE_HEADERS,
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

// Xuất khẩu cho môi trường Node.js testing nếu có
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SAMPLE_HEADERS,
    DANGEROUS_TRIGGERS,
    isFormulaDangerous,
    sanitizeSheetCell,
    gcd,
    parseRational,
    ratAdd,
    ratCmp,
    toCanonicalStr,
    canonicalizeJson,
    computePayloadHash,
    ensureHeaderRow,
    findRowByTuple,
    formatRecordRow,
    doPost,
    doGet
  };
}
