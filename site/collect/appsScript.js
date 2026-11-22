import { CollectorError, computePayloadHash } from './index.js';
import { buildWebResultPayload, resolveScoreDTO } from './export.js';
/** Transport is selected by owner configuration, never by an imported exam. */
export function resolveBackend(config) {
    const apiBase = config.apiBase?.trim();
    return apiBase
        ? { url: apiBase, contentType: 'application/json' }
        : { url: config.appsScriptUrl.trim(), contentType: 'text/plain;charset=utf-8' };
}
/**
 * Nạp cấu hình ứng dụng từ đường dẫn tương đối 'public/config.json'.
 * Theo WEB-contract 17.6: luôn dùng cache: 'no-store' để không bị kẹt bản cũ trong service worker.
 * Nếu có lỗi mạng, mã HTTP lỗi, JSON hỏng hoặc thiếu trường -> trả về { appsScriptUrl: '' }.
 */
export async function loadAppConfig(fetchImpl) {
    const fetchFn = fetchImpl ?? globalThis.fetch;
    if (typeof fetchFn !== 'function') {
        return { appsScriptUrl: '' };
    }
    try {
        const res = await fetchFn('public/config.json', { cache: 'no-store' });
        if (!res || !res.ok) {
            return { appsScriptUrl: '' };
        }
        const data = await res.json();
        if (data && typeof data === 'object') {
            const appsScriptUrl = typeof data.appsScriptUrl === 'string' ? data.appsScriptUrl.trim() : '';
            const apiBase = typeof data.apiBase === 'string' ? data.apiBase.trim() : '';
            return apiBase ? { appsScriptUrl, apiBase } : { appsScriptUrl };
        }
        return { appsScriptUrl: '' };
    }
    catch {
        return { appsScriptUrl: '' };
    }
}
/**
 * Khóa lưu trữ token trong sessionStorage (WEB-contract mục 19.1 & 19.2).
 * Tách biệt khóa riêng cho giáo viên và admin, xóa khi đăng xuất.
 */
export const TEACHER_TOKEN_STORAGE_KEY = 'cunata_teacher_token';
export const ADMIN_TOKEN_STORAGE_KEY = 'cunata_admin_token';
export const LEGACY_TEACHER_PW_STORAGE_KEY = 'cunata_teacher_pw';
/** Lấy token giáo viên từ sessionStorage */
export function getTeacherToken() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            return sessionStorage.getItem(TEACHER_TOKEN_STORAGE_KEY);
        }
    }
    catch { }
    return null;
}
/** Lưu token giáo viên vào sessionStorage */
export function setTeacherToken(token) {
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(TEACHER_TOKEN_STORAGE_KEY, token);
        }
    }
    catch { }
}
/** Xóa token giáo viên khỏi sessionStorage */
export function clearTeacherToken() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem(TEACHER_TOKEN_STORAGE_KEY);
            sessionStorage.removeItem(LEGACY_TEACHER_PW_STORAGE_KEY);
        }
    }
    catch { }
}
/** Lấy token admin từ sessionStorage */
export function getAdminToken() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
        }
    }
    catch { }
    return null;
}
/** Lưu token admin vào sessionStorage */
export function setAdminToken(token) {
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
        }
    }
    catch { }
}
/** Xóa token admin khỏi sessionStorage */
export function clearAdminToken() {
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
        }
    }
    catch { }
}
/** Đăng xuất giáo viên (xóa token và mật khẩu tạm khỏi sessionStorage) */
export function teacherLogout() {
    clearTeacherToken();
}
/** Đăng xuất admin (xóa token khỏi sessionStorage) */
export function adminLogout() {
    clearAdminToken();
}
/**
 * Bảng tra cứu thông báo lỗi người dùng bằng tiếng Việt thân thiện (WEB-contract 11 & 19.2).
 */
export const ERROR_MESSAGES_VI = {
    UNAUTHORIZED: 'Sai tên đăng nhập hoặc mật khẩu',
    FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này',
    NOT_OPEN: 'Bài thi chưa đến giờ mở',
    PAST_DUE: 'Nộp sau hạn — giáo viên chưa nhận',
    USERNAME_TAKEN: 'Tên đăng nhập đã được dùng',
    NOT_FOUND: 'Không tìm thấy dữ liệu yêu cầu',
    INVALID_USERNAME: 'Tên đăng nhập phải có 3–32 ký tự a-z0-9._-',
    INVALID_PASSWORD: 'Mật khẩu cần ít nhất 8 ký tự',
    INVALID_NAME: 'Cần nhập tên',
    INVALID_DATES: 'Hạn nộp phải sau giờ mở, theo ISO 8601',
    INVALID_EXAM: 'Cấu trúc đề thi không hợp lệ',
    INVALID_ASSIGNMENT: 'Thiếu thông tin lớp hoặc bài giao',
    INVALID_ACTIVE: 'Trạng thái hoạt động không hợp lệ',
    ADMIN_PASSWORD_NOT_SET: 'Chưa đặt ADMIN_PASSWORD trong Script Properties',
    TEACHER_PASSWORD_NOT_SET: 'Chưa đặt TEACHER_PASSWORD trong Script Properties',
    NOT_CONFIGURED: 'Apps Script URL chưa được cấu hình',
    PAYLOAD_CONFLICT: 'Xung đột dữ liệu kết quả bài thi',
    SERVER_BUSY: 'Máy chủ đang bận, vui lòng thử lại sau',
    NETWORK: 'Lỗi kết nối mạng, vui lòng kiểm tra đường truyền',
    BAD_RESPONSE: 'Phản hồi từ máy chủ không đúng định dạng',
    TIMEOUT: 'Hết thời gian chờ kết nối máy chủ Apps Script (15s)',
    COLLECTOR_TIMEOUT: 'Yêu cầu bị hủy hoặc hết thời gian chờ',
    COLLECTOR_NETWORK: 'Lỗi mạng khi kết nối máy chủ',
    COLLECTOR_HTTP: 'Lỗi máy chủ khi xử lý yêu cầu',
    COLLECTOR_DISABLED: 'Chức năng gửi máy chủ đang tạm tắt',
    RECEIPT_INVALID: 'Biên nhận máy chủ không hợp lệ',
};
/**
 * Ánh xạ mã lỗi thành thông điệp tiếng Việt rõ ràng, dễ hiểu cho người dùng.
 */
export function mapErrorToVietnamese(code, serverMessage) {
    if (code === 'UNAUTHORIZED') {
        return 'Sai tên đăng nhập hoặc mật khẩu';
    }
    if (code === 'PAST_DUE') {
        return 'Nộp sau hạn — giáo viên chưa nhận';
    }
    if (code === 'NOT_OPEN') {
        return 'Bài thi chưa đến giờ mở';
    }
    if (code === 'USERNAME_TAKEN') {
        return 'Tên đăng nhập đã được dùng';
    }
    if (code === 'FORBIDDEN') {
        if (serverMessage && /thuộc giáo viên khác|không có quyền/i.test(serverMessage)) {
            return serverMessage.trim();
        }
        return 'Bạn không có quyền thực hiện thao tác này';
    }
    if (serverMessage && serverMessage.trim() && !/^[A-Z0-9_]+$/.test(serverMessage.trim())) {
        return serverMessage.trim();
    }
    return ERROR_MESSAGES_VI[code] || serverMessage || 'Yêu cầu không thành công';
}
/**
 * Nối query params vào base URL một cách an toàn.
 */
function buildGetUrl(baseUrl, params) {
    const [base, query] = baseUrl.split('?');
    const searchParams = new URLSearchParams(query || '');
    for (const [key, val] of Object.entries(params)) {
        searchParams.set(key, val);
    }
    const qs = searchParams.toString();
    return qs ? `${base}?${qs}` : base;
}
/**
 * Thực thi một HTTP request tới Apps Script có quản lý timeout 15s và ánh xạ lỗi chuẩn.
 */
/**
 * Bộ nhớ đệm ngắn cho listExams (chậm 2–3 giây mỗi lần qua Apps Script; trang từng gọi 2 lần liền khi mở — đo thật 21/11/2026).
 * Hết hạn sau LIST_TTL_MS và bị xóa ngay khi có bất kỳ yêu cầu POST nào (xuất bản/sửa/gỡ đề) để thư viện luôn mới.
 */
const LIST_TTL_MS = 20000;
const listCache = new Map();
async function executeAppsScriptRequest(url, init, fetchFn, transform) {
    if (String(init.method || 'GET').toUpperCase() !== 'GET')
        listCache.clear();
    const controller = new AbortController();
    const timer = setTimeout(() => {
        controller.abort(new Error('TIMEOUT'));
    }, 15000);
    try {
        let res;
        try {
            res = await fetchFn(url, {
                ...init,
                signal: controller.signal,
            });
        }
        catch (err) {
            if (controller.signal.aborted || err?.name === 'AbortError' || err?.name === 'TimeoutError') {
                return {
                    ok: false,
                    code: 'NETWORK',
                    message: mapErrorToVietnamese('TIMEOUT', 'Hết thời gian chờ kết nối máy chủ Apps Script (15s)'),
                };
            }
            return {
                ok: false,
                code: 'NETWORK',
                message: mapErrorToVietnamese('NETWORK', `Lỗi kết nối mạng: ${err?.message || String(err)}`),
            };
        }
        if (!res.ok) {
            return {
                ok: false,
                code: `HTTP_${res.status}`,
                message: `Lỗi HTTP ${res.status}: ${res.statusText || 'Lỗi phản hồi từ máy chủ'}`,
            };
        }
        let text;
        try {
            text = await res.text();
        }
        catch (err) {
            return {
                ok: false,
                code: 'NETWORK',
                message: `Không thể đọc nội dung phản hồi: ${err?.message || String(err)}`,
            };
        }
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch {
            return {
                ok: false,
                code: 'BAD_RESPONSE',
                message: mapErrorToVietnamese('BAD_RESPONSE'),
            };
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {
                ok: false,
                code: 'BAD_RESPONSE',
                message: mapErrorToVietnamese('BAD_RESPONSE'),
            };
        }
        if (parsed.success === false) {
            const code = typeof parsed.error === 'string' && parsed.error ? parsed.error : 'SERVER_ERROR';
            const rawMessage = typeof parsed.message === 'string' ? parsed.message : '';
            const message = mapErrorToVietnamese(code, rawMessage);
            const details = parsed.errors !== undefined ? parsed.errors : parsed.details;
            return {
                ok: false,
                code,
                message,
                ...(details !== undefined ? { details } : {}),
            };
        }
        if (parsed.success !== true) {
            return {
                ok: false,
                code: 'BAD_RESPONSE',
                message: mapErrorToVietnamese('BAD_RESPONSE', 'Phản hồi thiếu trường success hợp lệ'),
            };
        }
        return transform(parsed);
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * Khởi tạo client giao tiếp với Apps Script.
 * - url rỗng: configured = false, mọi hàm trả NOT_CONFIGURED ngay, không gọi fetch.
 * - GET: đọc danh sách / đọc chi tiết đề / tra cứu lớp học theo mã.
 * - POST: text/plain;charset=utf-8, token/mật khẩu trong body, redirect: 'follow', timeout: 15s.
 */
export function createAppsScriptClient(url, fetchImpl, contentType = 'text/plain;charset=utf-8') {
    const trimmedUrl = (url ?? '').trim();
    const configured = trimmedUrl.length > 0;
    const fetchFn = fetchImpl ?? globalThis.fetch;
    if (!configured) {
        const notConfiguredResult = () => ({
            ok: false,
            code: 'NOT_CONFIGURED',
            message: mapErrorToVietnamese('NOT_CONFIGURED'),
        });
        return {
            configured: false,
            async listExams() {
                return notConfiguredResult();
            },
            async getExam(_id) {
                return notConfiguredResult();
            },
            async getClass(_code) {
                return notConfiguredResult();
            },
            async teacherLogin(_arg1, _arg2) {
                return notConfiguredResult();
            },
            async publishExam(_tokenOrPassword, _exam) {
                return notConfiguredResult();
            },
            async unpublishExam(_tokenOrPassword, _examId) {
                return notConfiguredResult();
            },
            async createClass(_tokenOrName, _name) {
                return notConfiguredResult();
            },
            async listMyClasses(_token) {
                return notConfiguredResult();
            },
            async assignExam(_tokenOrOpts, _classId, _examId, _openAt, _dueAt) {
                return notConfiguredResult();
            },
            async listAssignments(_tokenOrClassId, _classId) {
                return notConfiguredResult();
            },
            async listResults(_tokenOrClassId, _classIdOrAssignmentId, _assignmentId) {
                return notConfiguredResult();
            },
            async adminLogin(_password) {
                return notConfiguredResult();
            },
            async adminCreateTeacher(_tokenOrTeacher, _teacherOrName, _username, _password) {
                return notConfiguredResult();
            },
            async adminListTeachers(_token) {
                return notConfiguredResult();
            },
            async adminResetPassword(_tokenOrOpts, _username, _password) {
                return notConfiguredResult();
            },
            async adminSetTeacherActive(_tokenOrOpts, _username, _active) {
                return notConfiguredResult();
            },
            async adminStats(_token) {
                return notConfiguredResult();
            },
            teacherLogout() {
                clearTeacherToken();
            },
            adminLogout() {
                clearAdminToken();
            },
        };
    }
    const client = {
        configured: true,
        async listExams() {
            const getUrl = buildGetUrl(trimmedUrl, { action: 'listExams' });
            const hit = listCache.get(getUrl);
            if (hit && Date.now() - hit.at < LIST_TTL_MS)
                return hit.p;
            const p = executeAppsScriptRequest(getUrl, { method: 'GET', redirect: 'follow', cache: 'no-store' }, fetchFn, (data) => {
                const rawList = Array.isArray(data.exams) ? data.exams : [];
                const exams = rawList.map((e) => ({
                    id: String(e.id ?? ''),
                    title: String(e.title ?? ''),
                    subject: String(e.subject ?? ''),
                    grade: typeof e.grade === 'number' ? e.grade : (e.grade !== null && !isNaN(Number(e.grade)) ? Number(e.grade) : null),
                    durationMinutes: typeof e.durationMinutes === 'number' ? e.durationMinutes : (e.durationMinutes !== null && !isNaN(Number(e.durationMinutes)) ? Number(e.durationMinutes) : null),
                    questionCount: typeof e.questionCount === 'number' ? e.questionCount : Number(e.questionCount) || 0,
                    group: String(e.group ?? ''),
                    revision: typeof e.revision === 'number' ? e.revision : Number(e.revision) || 1,
                    updatedAt: String(e.updatedAt ?? ''),
                }));
                return { ok: true, value: exams };
            });
            listCache.set(getUrl, { at: Date.now(), p });
            p.then((r) => { if (!r.ok)
                listCache.delete(getUrl); }, () => listCache.delete(getUrl));
            return p;
        },
        async getExam(id) {
            const getUrl = buildGetUrl(trimmedUrl, { action: 'getExam', id });
            return executeAppsScriptRequest(getUrl, { method: 'GET', redirect: 'follow', cache: 'no-store' }, fetchFn, (data) => ({
                ok: true,
                value: data.exam !== undefined ? data.exam : data,
            }));
        },
        async getClass(code) {
            const getUrl = buildGetUrl(trimmedUrl, { action: 'getClass', code: String(code || '').trim() });
            return executeAppsScriptRequest(getUrl, { method: 'GET', redirect: 'follow', cache: 'no-store' }, fetchFn, (data) => {
                const cls = data.class && typeof data.class === 'object' ? data.class : {};
                const rawAssignments = Array.isArray(data.assignments) ? data.assignments : [];
                const assignments = rawAssignments.map((a) => ({
                    assignmentId: String(a.assignmentId ?? ''),
                    examId: String(a.examId ?? ''),
                    title: String(a.title ?? ''),
                    openAt: String(a.openAt ?? ''),
                    dueAt: String(a.dueAt ?? ''),
                    questionCount: typeof a.questionCount === 'number' ? a.questionCount : Number(a.questionCount) || 0,
                    durationMinutes: typeof a.durationMinutes === 'number' ? a.durationMinutes : Number(a.durationMinutes) || 0,
                }));
                return {
                    ok: true,
                    value: {
                        class: {
                            code: String(cls.code ?? ''),
                            name: String(cls.name ?? ''),
                            teacherName: String(cls.teacherName ?? ''),
                        },
                        assignments,
                    },
                };
            });
        },
        async teacherLogin(arg1, arg2) {
            // Legacy 1-arg call: teacherLogin(password)
            if (arg2 === undefined) {
                return executeAppsScriptRequest(trimmedUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': contentType },
                    body: JSON.stringify({ action: 'teacherLogin', password: arg1 }),
                    redirect: 'follow',
                }, fetchFn, () => {
                    try {
                        if (typeof sessionStorage !== 'undefined') {
                            sessionStorage.setItem(LEGACY_TEACHER_PW_STORAGE_KEY, arg1);
                        }
                    }
                    catch { }
                    return { ok: true, value: true };
                });
            }
            // New 2-arg call: teacherLogin(username, password)
            return executeAppsScriptRequest(trimmedUrl, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: JSON.stringify({ action: 'teacherLogin', username: arg1, password: arg2 }),
                redirect: 'follow',
            }, fetchFn, (data) => {
                const token = String(data.token ?? '');
                setTeacherToken(token);
                const result = {
                    token,
                    name: String(data.name ?? ''),
                    ...(data.expiresAt ? { expiresAt: String(data.expiresAt) } : {}),
                };
                return { ok: true, value: result };
            });
        },
        async publishExam(tokenOrPassword, exam) {
            const tok = (tokenOrPassword || getTeacherToken() || '').trim();
            return executeAppsScriptRequest(trimmedUrl, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: JSON.stringify({ action: 'publishExam', token: tok, password: tok, exam }),
                redirect: 'follow',
            }, fetchFn, (data) => ({
                ok: true,
                value: {
                    examId: String(data.examId ?? ''),
                    revision: Number(data.revision) || 1,
                },
            }));
        },
        async unpublishExam(tokenOrPassword, examId) {
            const tok = (tokenOrPassword || getTeacherToken() || '').trim();
            return executeAppsScriptRequest(trimmedUrl, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: JSON.stringify({ action: 'unpublishExam', token: tok, password: tok, examId }),
                redirect: 'follow',
            }, fetchFn, () => ({ ok: true, value: true }));
        },
        async createClass(tokenOrName, nameArg) {
            let token = '';
            let name = '';
            if (typeof tokenOrName === 'string') {
                if (typeof nameArg === 'string') {
                    token = tokenOrName;
                    name = nameArg;
                }
                else {
                    token = getTeacherToken() || '';
                    name = tokenOrName;
                }
            }
            else if (typeof tokenOrName === 'object' && tokenOrName !== null) {
                token = tokenOrName.token || getTeacherToken() || '';
                name = tokenOrName.name;
            }
            if (!token)
                token = getTeacherToken() || '';
            return executeAppsScriptRequest(trimmedUrl, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: JSON.stringify({ action: 'createClass', token, name }),
                redirect: 'follow',
            }, fetchFn, (data) => ({
                ok: true,
                value: {
                    classId: String(data.classId ?? ''),
                    code: String(data.code ?? ''),
                },
            }));
        },
        async listMyClasses(token) {
            const tok = (token || getTeacherToken() || '').trim();
            return executeAppsScriptRequest(trimmedUrl, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: JSON.stringify({ action: 'listMyClasses', token: tok }),
                redirect: 'follow',
            }, fetchFn, (data) => {
                const raw = Array.isArray(data.classes) ? data.classes : [];
                const classes = raw.map((c) => ({
                    classId: String(c.classId ?? ''),
                    code: String(c.code ?? ''),
                    name: String(c.name ?? ''),
                    createdAt: String(c.createdAt ?? ''),
                    studentCount: typeof c.studentCount === 'number' ? c.studentCount : Number(c.studentCount) || 0,
                }));
                return { ok: true, value: classes };
            });
        },
        async assignExam(tokenOrOpts, classIdArg, examIdArg, openAtArg, dueAtArg) {
            let token = '';
            let classId = '';
            let examId = '';
            let openAt = '';
            let dueAt = '';
            if (typeof tokenOrOpts === 'string') {
                if (classIdArg && examIdArg && openAtArg && dueAtArg) {
                    token = tokenOrOpts;
                    classId = classIdArg;
                    examId = examIdArg;
                    openAt = openAtArg;
                    dueAt = dueAtArg;
                }
                else if (classIdArg && examIdArg && openAtArg && !dueAtArg) {
                    token = getTeacherToken() || '';
                    classId = tokenOrOpts;
                    examId = classIdArg;
                    openAt = examIdArg;
                    dueAt = openAtArg;
                }
            }
            else if (typeof tokenOrOpts === 'object' && tokenOrOpts !== null) {
                token = tokenOrOpts.token || getTeacherToken() || '';
                classId = tokenOrOpts.classId;
                examId = tokenOrOpts.examId;
                openAt = tokenOrOpts.openAt;
                dueAt = tokenOrOpts.dueAt;
            }
            if (!token)
                token = getTeacherToken() || '';
            return executeAppsScriptRequest(trimmedUrl, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: JSON.stringify({ action: 'assignExam', token, classId, examId, openAt, dueAt }),
                redirect: 'follow',
            }, fetchFn, (data) => ({
                ok: true,
                value: {
                    assignmentId: String(data.assignmentId ?? ''),
                },
            }));
        },
        async listAssignments(tokenOrClassId, classIdArg) {
            let token = '';
            let classId = '';
            if (classIdArg !== undefined) {
                token = tokenOrClassId;
                classId = classIdArg;
            }
            else {
                token = getTeacherToken() || '';
                classId = tokenOrClassId;
            }
            if (!token)
                token = getTeacherToken() || '';
            return executeAppsScriptRequest(trimmedUrl, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: JSON.stringify({ action: 'listAssignments', token, classId }),
                redirect: 'follow',
            }, fetchFn, (data) => {
                const raw = Array.isArray(data.assignments) ? data.assignments : [];
                const assignments = raw.map((a) => ({
                    assignmentId: String(a.assignmentId ?? ''),
                    classId: String(a.classId ?? classId),
                    examId: String(a.examId ?? ''),
                    openAt: String(a.openAt ?? ''),
                    dueAt: String(a.dueAt ?? ''),
                    createdAt: String(a.createdAt ?? ''),
                    title: String(a.title ?? ''),
                    questionCount: typeof a.questionCount === 'number' ? a.questionCount : Number(a.questionCount) || 0,
                    durationMinutes: typeof a.durationMinutes === 'number' ? a.durationMinutes : Number(a.durationMinutes) || 0,
                    ...(a.submissionCount !== undefined ? { submissionCount: Number(a.submissionCount) || 0 } : {}),
                }));
                return { ok: true, value: assignments };
            });
        },
        async listResults(tokenOrClassId, classIdOrAssignmentId, assignmentIdArg) {
            let token = '';
            let classId = '';
            let assignmentId = undefined;
            if (assignmentIdArg !== undefined) {
                token = tokenOrClassId || '';
                classId = classIdOrAssignmentId || '';
                assignmentId = assignmentIdArg;
            }
            else if (classIdOrAssignmentId !== undefined) {
                const stored = getTeacherToken();
                const isArg0Uuid = Boolean(tokenOrClassId && /^[0-9a-f-]{36}$/i.test(tokenOrClassId) && tokenOrClassId.includes('-'));
                if (stored && isArg0Uuid) {
                    token = stored;
                    classId = tokenOrClassId || '';
                    assignmentId = classIdOrAssignmentId;
                }
                else if (tokenOrClassId && (tokenOrClassId.length >= 32 || tokenOrClassId === stored || !stored)) {
                    token = tokenOrClassId;
                    classId = classIdOrAssignmentId || '';
                }
                else {
                    token = stored || '';
                    classId = tokenOrClassId || '';
                    assignmentId = classIdOrAssignmentId;
                }
            }
            else {
                const stored = getTeacherToken();
                if (tokenOrClassId && tokenOrClassId.length >= 32 && !tokenOrClassId.includes('-')) {
                    token = tokenOrClassId;
                    classId = '';
                }
                else {
                    token = stored || '';
                    classId = tokenOrClassId || '';
                }
            }
            if (!token)
                token = getTeacherToken() || '';
            // Khi classId rỗng (giáo viên chọn "-- Tất cả lớp --" hoặc không truyền classId):
            // Tra cứu toàn bộ các lớp của giáo viên qua listMyClasses rồi tổng hợp kết quả của từng lớp.
            if (!classId || classId.trim() === '') {
                const classesRes = await client.listMyClasses(token);
                if (!classesRes.ok) {
                    return classesRes;
                }
                const classes = classesRes.value || [];
                if (classes.length === 0) {
                    return { ok: true, value: [] };
                }
                const classResultsPromises = classes.map((c) => client.listResults(token, c.classId, assignmentId));
                const settled = await Promise.all(classResultsPromises);
                const seenAttempts = new Set();
                const combined = [];
                let firstErr = null;
                for (const item of settled) {
                    if (item.ok && Array.isArray(item.value)) {
                        for (const resItem of item.value) {
                            const id = resItem.attempt_id || resItem.attemptId;
                            if (id) {
                                if (seenAttempts.has(id))
                                    continue;
                                seenAttempts.add(id);
                            }
                            combined.push(resItem);
                        }
                    }
                    else if (!item.ok && !firstErr) {
                        firstErr = item;
                    }
                }
                if (combined.length === 0 && firstErr && classes.length > 0) {
                    return firstErr;
                }
                return { ok: true, value: combined };
            }
            const body = {
                action: 'listResults',
                token,
                classId,
                ...(assignmentId ? { assignmentId } : {}),
            };
            return executeAppsScriptRequest(trimmedUrl, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: JSON.stringify(body),
                redirect: 'follow',
            }, fetchFn, (data) => {
                const results = Array.isArray(data.results) ? data.results : [];
                return { ok: true, value: results };
            });
        },
        async adminLogin(password) {
            return executeAppsScriptRequest(trimmedUrl, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: JSON.stringify({ action: 'adminLogin', password }),
                redirect: 'follow',
            }, fetchFn, (data) => {
                const token = String(data.token ?? '');
                setAdminToken(token);
                return {
                    ok: true,
                    value: {
                        token,
                        ...(data.expiresAt ? { expiresAt: String(data.expiresAt) } : {}),
                    },
                };
            });
        },
        async adminCreateTeacher(tokenOrTeacher, teacherOrName, usernameArg, passwordArg) {
            let token = '';
            let name = '';
            let username = '';
            let password = '';
            if (typeof tokenOrTeacher === 'string') {
                if (typeof teacherOrName === 'object' && teacherOrName !== null) {
                    token = tokenOrTeacher;
                    name = teacherOrName.name;
                    username = teacherOrName.username;
                    password = teacherOrName.password;
                }
                else if (typeof teacherOrName === 'string') {
                    token = tokenOrTeacher;
                    name = teacherOrName;
                    username = usernameArg ?? '';
                    password = passwordArg ?? '';
                }
            }
            else if (typeof tokenOrTeacher === 'object' && tokenOrTeacher !== null) {
                token = tokenOrTeacher.token || getAdminToken() || '';
                name = tokenOrTeacher.name;
                username = tokenOrTeacher.username;
                password = tokenOrTeacher.password;
            }
            if (!token)
                token = getAdminToken() || '';
            return executeAppsScriptRequest(trimmedUrl, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: JSON.stringify({ action: 'adminCreateTeacher', token, name, username, password }),
                redirect: 'follow',
            }, fetchFn, () => ({ ok: true, value: true }));
        },
        async adminListTeachers(token) {
            const tok = (token || getAdminToken() || '').trim();
            return executeAppsScriptRequest(trimmedUrl, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: JSON.stringify({ action: 'adminListTeachers', token: tok }),
                redirect: 'follow',
            }, fetchFn, (data) => {
                const raw = Array.isArray(data.teachers) ? data.teachers : [];
                const teachers = raw.map((t) => ({
                    username: String(t.username ?? ''),
                    name: String(t.name ?? ''),
                    active: t.active === true,
                    createdAt: String(t.createdAt ?? ''),
                }));
                return { ok: true, value: teachers };
            });
        },
        async adminResetPassword(tokenOrOpts, usernameArg, passwordArg) {
            let token = '';
            let username = '';
            let password = '';
            if (typeof tokenOrOpts === 'string') {
                if (typeof usernameArg === 'string' && typeof passwordArg === 'string') {
                    token = tokenOrOpts;
                    username = usernameArg;
                    password = passwordArg;
                }
                else if (typeof usernameArg === 'string' && !passwordArg) {
                    token = getAdminToken() || '';
                    username = tokenOrOpts;
                    password = usernameArg;
                }
            }
            else if (typeof tokenOrOpts === 'object' && tokenOrOpts !== null) {
                token = tokenOrOpts.token || getAdminToken() || '';
                username = tokenOrOpts.username;
                password = tokenOrOpts.password;
            }
            if (!token)
                token = getAdminToken() || '';
            return executeAppsScriptRequest(trimmedUrl, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: JSON.stringify({ action: 'adminResetPassword', token, username, password }),
                redirect: 'follow',
            }, fetchFn, () => ({ ok: true, value: true }));
        },
        async adminSetTeacherActive(tokenOrOpts, usernameArg, activeArg) {
            let token = '';
            let username = '';
            let active = true;
            if (typeof tokenOrOpts === 'string') {
                if (typeof usernameArg === 'string' && typeof activeArg === 'boolean') {
                    token = tokenOrOpts;
                    username = usernameArg;
                    active = activeArg;
                }
                else if (typeof usernameArg === 'boolean') {
                    token = getAdminToken() || '';
                    username = tokenOrOpts;
                    active = usernameArg;
                }
            }
            else if (typeof tokenOrOpts === 'object' && tokenOrOpts !== null) {
                token = tokenOrOpts.token || getAdminToken() || '';
                username = tokenOrOpts.username;
                active = tokenOrOpts.active;
            }
            if (!token)
                token = getAdminToken() || '';
            return executeAppsScriptRequest(trimmedUrl, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: JSON.stringify({ action: 'adminSetTeacherActive', token, username, active }),
                redirect: 'follow',
            }, fetchFn, () => ({ ok: true, value: true }));
        },
        async adminStats(token) {
            const tok = (token || getAdminToken() || '').trim();
            return executeAppsScriptRequest(trimmedUrl, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: JSON.stringify({ action: 'adminStats', token: tok }),
                redirect: 'follow',
            }, fetchFn, (data) => {
                const stats = data.stats && typeof data.stats === 'object' ? data.stats : {};
                return {
                    ok: true,
                    value: {
                        teachers: typeof stats.teachers === 'number' ? stats.teachers : Number(stats.teachers) || 0,
                        classes: typeof stats.classes === 'number' ? stats.classes : Number(stats.classes) || 0,
                        exams: typeof stats.exams === 'number' ? stats.exams : Number(stats.exams) || 0,
                        results: typeof stats.results === 'number' ? stats.results : Number(stats.results) || 0,
                    },
                };
            });
        },
        teacherLogout() {
            clearTeacherToken();
        },
        adminLogout() {
            clearAdminToken();
        },
    };
    return client;
}
/**
 * Khởi tạo CollectorPort nộp kết quả bài thi tới Apps Script, tương thích với Outbox hiện có.
 * - url rỗng: configured = false, ném lỗi NOT_CONFIGURED ngay khi send được gọi mà không gọi fetch.
 * - POST text/plain;charset=utf-8, payload chuẩn buildWebResultPayload kèm các trường bắt buộc của Code.js.
 * - Thêm class_code và assignment_id khi có (WEB-contract mục 19.2).
 * - Khi server trả success: true (NEWLY_RECORDED hoặc ALREADY_RECORDED), trả về receipt hợp lệ
 *   khớp với validateReceipt trong outbox state machine.
 */
export function createAppsScriptCollectorPort(url, fetchImpl, contentType = 'text/plain;charset=utf-8') {
    const trimmedUrl = (url ?? '').trim();
    const configured = trimmedUrl.length > 0;
    const fetchFn = fetchImpl ?? globalThis.fetch;
    return {
        get configured() {
            return configured;
        },
        async send(final, signal) {
            if (!configured) {
                const err = new CollectorError('NOT_CONFIGURED', 'endpointUrl', mapErrorToVietnamese('NOT_CONFIGURED'), false);
                err.notConfigured = true;
                err.code = 'NOT_CONFIGURED';
                throw err;
            }
            if (signal.aborted) {
                throw new CollectorError('COLLECTOR_TIMEOUT', 'signal', mapErrorToVietnamese('COLLECTOR_TIMEOUT'), true);
            }
            const basePayload = buildWebResultPayload(final);
            const scoreDTO = (basePayload.scoreDTO ?? resolveScoreDTO(final));
            const payloadHash = computePayloadHash(final);
            const durationSeconds = basePayload.durationSeconds;
            let classCode = final.class_code ??
                final.classCode ??
                final.metadata?.class_code ??
                final.metadata?.classCode ??
                basePayload.class_code;
            let assignmentId = final.assignment_id ??
                final.assignmentId ??
                final.metadata?.assignment_id ??
                final.metadata?.assignmentId ??
                basePayload.assignment_id;
            let studentId = final.student_id ??
                final.studentId ??
                final.metadata?.student_id ??
                final.metadata?.studentId ??
                basePayload.student_id;
            const payload = {
                action: 'submitResult',
                ...basePayload,
                attempt_id: final.attemptId,
                exam_id: final.examId,
                exam_version_id: final.examVersionId,
                candidate_display: final.candidateName,
                payloadHash,
                payload_hash: payloadHash,
                started_at: typeof final.startedAt === 'number' ? new Date(final.startedAt).toISOString() : '',
                submitted_at: typeof final.submittedAt === 'number' ? new Date(final.submittedAt).toISOString() : '',
                duration_seconds: durationSeconds,
                policy_version: basePayload.ruleSetId,
                total: scoreDTO?.total ?? '0',
                total_score: scoreDTO?.total ?? '0',
                maxTotal: scoreDTO?.maxTotal ?? '0',
                max_total: scoreDTO?.maxTotal ?? '0',
                sections: scoreDTO?.sections ?? {},
                ...(classCode ? { class_code: String(classCode).trim().toUpperCase() } : {}),
                ...(assignmentId ? { assignment_id: String(assignmentId).trim() } : {}),
                ...(studentId ? { student_id: String(studentId).trim() } : {}),
            };
            let response;
            try {
                response = await fetchFn(trimmedUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': contentType,
                    },
                    body: JSON.stringify(payload),
                    signal,
                    redirect: 'follow',
                });
            }
            catch (err) {
                if (signal.aborted ||
                    err?.name === 'AbortError' ||
                    err?.name === 'TimeoutError' ||
                    err?.code === 'COLLECTOR_TIMEOUT') {
                    throw new CollectorError('COLLECTOR_TIMEOUT', 'transport', mapErrorToVietnamese('COLLECTOR_TIMEOUT'), true);
                }
                throw new CollectorError('COLLECTOR_NETWORK', 'transport', mapErrorToVietnamese('COLLECTOR_NETWORK', `Lỗi mạng khi gửi kết quả: ${err?.message || String(err)}`), true);
            }
            if (response.type === 'opaque' || response.status === 0) {
                throw new CollectorError('COLLECTOR_HTTP', 'response', 'Opaque response nhận được; không thể xác minh receipt', false, 0);
            }
            if (!response.ok) {
                const is4xx = response.status >= 400 && response.status < 500;
                throw new CollectorError('COLLECTOR_HTTP', 'response', `Lỗi HTTP ${response.status}: ${response.statusText}`, !is4xx, response.status);
            }
            let text;
            try {
                text = await response.text();
            }
            catch (err) {
                throw new CollectorError('COLLECTOR_NETWORK', 'response', `Không thể đọc nội dung phản hồi: ${err?.message || String(err)}`, true);
            }
            let raw;
            try {
                raw = JSON.parse(text);
            }
            catch {
                throw new CollectorError('BAD_RESPONSE', 'response', mapErrorToVietnamese('BAD_RESPONSE'), false);
            }
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
                throw new CollectorError('BAD_RESPONSE', 'response', mapErrorToVietnamese('BAD_RESPONSE'), false);
            }
            if (raw.error === 'SERVER_BUSY' || raw.status === 503) {
                throw new CollectorError('COLLECTOR_HTTP', 'response', mapErrorToVietnamese('SERVER_BUSY', raw.message), true, 503);
            }
            if (raw.error === 'PAYLOAD_CONFLICT' || raw.status === 409) {
                throw new CollectorError('PAYLOAD_CONFLICT', 'response', mapErrorToVietnamese('PAYLOAD_CONFLICT', raw.message), false, 409);
            }
            if (raw.error === 'NOT_OPEN') {
                throw new CollectorError('NOT_OPEN', 'response', mapErrorToVietnamese('NOT_OPEN', raw.message), false);
            }
            if (raw.error === 'PAST_DUE') {
                throw new CollectorError('PAST_DUE', 'response', mapErrorToVietnamese('PAST_DUE', raw.message), false);
            }
            if (raw.error === 'SERVER_ERROR' || (typeof raw.status === 'number' && raw.status >= 500)) {
                throw new CollectorError('COLLECTOR_HTTP', 'response', mapErrorToVietnamese('SERVER_ERROR', raw.message || 'Lỗi máy chủ'), true, typeof raw.status === 'number' ? raw.status : 500);
            }
            if (raw.success === false) {
                const is4xx = typeof raw.status === 'number' && raw.status >= 400 && raw.status < 500;
                const errCode = typeof raw.error === 'string' && raw.error ? raw.error : 'COLLECTOR_HTTP';
                const mappedMessage = mapErrorToVietnamese(errCode, raw.message);
                throw new CollectorError(errCode, 'response', mappedMessage, !is4xx && errCode !== 'NOT_OPEN' && errCode !== 'PAST_DUE' && errCode !== 'PAYLOAD_CONFLICT', typeof raw.status === 'number' ? raw.status : undefined);
            }
            const rawStatus = String(raw.status || '').toUpperCase();
            const normalizedStatus = rawStatus === 'ALREADY_RECORDED'
                ? 'already_recorded'
                : 'recorded';
            const receivedAt = typeof raw.recorded_at === 'string' && raw.recorded_at.trim() && !isNaN(Date.parse(raw.recorded_at))
                ? raw.recorded_at.trim()
                : typeof raw.receivedAt === 'string' && raw.receivedAt.trim() && !isNaN(Date.parse(raw.receivedAt))
                    ? raw.receivedAt.trim()
                    : new Date().toISOString();
            const submissionId = typeof raw.submissionId === 'string' && raw.submissionId.trim()
                ? raw.submissionId.trim()
                : typeof raw.submission_id === 'string' && raw.submission_id.trim()
                    ? raw.submission_id.trim()
                    : typeof raw.attempt_id === 'string' && raw.attempt_id.trim()
                        ? raw.attempt_id.trim()
                        : final.attemptId;
            const receipt = {
                examId: final.examId,
                examVersionId: final.examVersionId,
                attemptId: final.attemptId,
                payloadHash: computePayloadHash(final),
                submissionId,
                receivedAt,
                status: normalizedStatus,
            };
            return {
                ...raw,
                ...receipt,
            };
        },
    };
}
