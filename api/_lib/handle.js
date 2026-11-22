import { randomUUID } from './_node.js';
import { hashPassword, verifyPassword, generateToken, hashToken, generateClassCode, } from './auth.js';
import { validatePublishedExam } from './examValidation.js';
import { parseRational, ratCmp, ratAdd, toCanonicalStr } from './rational.js';
function json(status, body) {
    return { status, body };
}
function failure(error, message, extra = {}) {
    return json(200, { success: false, error, message, ...extra });
}
function success(data = {}) {
    return json(200, { success: true, ...data });
}
function isoDate(s) {
    return (typeof s === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(s) &&
        Number.isFinite(Date.parse(s)));
}
async function authenticate(token, requiredRole, ctx) {
    if (typeof token !== 'string' || !token.trim()) {
        return { ok: false, response: failure('UNAUTHORIZED', 'Thiếu token xác thực') };
    }
    const tokenHash = hashToken(token.trim());
    const session = await ctx.store.getSession(tokenHash);
    if (!session) {
        return { ok: false, response: failure('UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn') };
    }
    if (session.expiresAt <= ctx.now()) {
        await ctx.store.deleteSession(tokenHash);
        return { ok: false, response: failure('UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn') };
    }
    if (requiredRole === 'admin' && session.role !== 'admin') {
        return { ok: false, response: failure('FORBIDDEN', 'Yêu cầu quyền Admin') };
    }
    if (session.role === 'teacher') {
        const teacher = await ctx.store.getTeacher(session.username);
        if (!teacher || !teacher.active) {
            await ctx.store.deleteSession(tokenHash);
            return { ok: false, response: failure('UNAUTHORIZED', 'Tài khoản đã bị khóa') };
        }
        if ((session.authGen ?? 1) !== (teacher.authGen ?? 1)) {
            await ctx.store.deleteSession(tokenHash);
            return { ok: false, response: failure('UNAUTHORIZED', 'Phiên đăng nhập đã bị thu hồi') };
        }
    }
    return { ok: true, session };
}
async function findExamMeta(examId, store, catalog) {
    const published = await store.getExam(examId);
    if (published) {
        return {
            title: published.title,
            questionCount: published.questionCount,
            durationMinutes: published.durationMinutes ?? 50,
        };
    }
    if (catalog) {
        const found = catalog.find(e => e.id === examId);
        if (found) {
            return {
                title: found.title,
                questionCount: typeof found.questionCount === 'number' ? found.questionCount : 0,
                durationMinutes: typeof found.durationMinutes === 'number' ? found.durationMinutes : 50,
            };
        }
    }
    return null;
}
export async function handle(request, ctx) {
    try {
        const method = (request.method || 'GET').toUpperCase();
        let action = '';
        let payload = {};
        if (method === 'GET') {
            payload = request.query ? { ...request.query } : {};
            action = typeof payload.action === 'string' ? payload.action.trim() : '';
            const allowedGet = ['getClass', 'listExams', 'getExam'];
            if (!allowedGet.includes(action)) {
                return failure('METHOD_NOT_ALLOWED', 'GET chỉ dùng cho hành động đọc công khai');
            }
        }
        else if (method === 'POST') {
            if (request.body && typeof request.body === 'object') {
                payload = request.body;
                action = typeof payload.action === 'string' ? payload.action.trim() : '';
            }
        }
        else {
            return failure('METHOD_NOT_ALLOWED', `Phương thức ${method} không được hỗ trợ`);
        }
        if (method === 'POST' && (!action || action === 'submitResult')) {
            return await handleSubmitResult(payload, ctx);
        }
        switch (action) {
            case 'adminLogin': {
                const configured = ctx.adminPassword ?? ctx.env?.ADMIN_PASSWORD;
                if (!configured) {
                    return failure('ADMIN_PASSWORD_NOT_SET', 'Chưa đặt ADMIN_PASSWORD trong Script Properties');
                }
                if (typeof payload.password !== 'string' || payload.password !== configured) {
                    return failure('UNAUTHORIZED', 'Sai mật khẩu');
                }
                const token = generateToken();
                const tokenHash = hashToken(token);
                const expiresAt = ctx.now() + 8 * 60 * 60 * 1000;
                await ctx.store.createSession({
                    tokenHash,
                    role: 'admin',
                    username: 'admin',
                    name: 'Admin',
                    expiresAt,
                });
                return success({
                    token,
                    name: 'Admin',
                    expiresAt: new Date(expiresAt).toISOString(),
                });
            }
            case 'adminCreateTeacher': {
                const auth = await authenticate(payload.token, 'admin', ctx);
                if (!auth.ok)
                    return auth.response;
                const username = payload.username;
                if (typeof username !== 'string' ||
                    username.length < 3 ||
                    username.length > 32 ||
                    /[^a-z0-9._-]/.test(username)) {
                    return failure('INVALID_USERNAME', 'Tên đăng nhập phải có 3–32 ký tự a-z0-9._-');
                }
                if (typeof payload.password !== 'string' || payload.password.length < 8) {
                    return failure('INVALID_PASSWORD', 'Mật khẩu cần ít nhất 8 ký tự');
                }
                if (typeof payload.name !== 'string' || !payload.name.trim()) {
                    return failure('INVALID_NAME', 'Cần nhập tên giáo viên');
                }
                const salt = generateToken().slice(0, 32);
                const hash = hashPassword(payload.password, salt);
                const created = await ctx.store.createTeacher({
                    username,
                    name: payload.name.trim(),
                    salt,
                    hash,
                    active: true,
                    createdAt: new Date(ctx.now()).toISOString(),
                    authGen: 1,
                });
                if (!created) {
                    return failure('USERNAME_TAKEN', 'Tên đăng nhập đã được dùng');
                }
                return success();
            }
            case 'adminListTeachers': {
                const auth = await authenticate(payload.token, 'admin', ctx);
                if (!auth.ok)
                    return auth.response;
                const teachers = await ctx.store.listTeachers();
                return success({
                    teachers: teachers.map(t => ({
                        username: t.username,
                        name: t.name,
                        active: t.active,
                        createdAt: t.createdAt,
                    })),
                });
            }
            case 'adminStats': {
                const auth = await authenticate(payload.token, 'admin', ctx);
                if (!auth.ok)
                    return auth.response;
                const teachers = await ctx.store.listTeachers();
                const classesCount = await ctx.store.countClasses();
                const examsCount = await ctx.store.countExams();
                const resultsCount = await ctx.store.countResults();
                return success({
                    stats: {
                        teachers: teachers.length,
                        classes: classesCount,
                        exams: examsCount,
                        results: resultsCount,
                    },
                });
            }
            case 'adminResetPassword': {
                const auth = await authenticate(payload.token, 'admin', ctx);
                if (!auth.ok)
                    return auth.response;
                const username = typeof payload.username === 'string' ? payload.username : '';
                if (typeof payload.password !== 'string' || payload.password.length < 8) {
                    return failure('INVALID_PASSWORD', 'Mật khẩu cần ít nhất 8 ký tự');
                }
                const salt = generateToken().slice(0, 32);
                const hash = hashPassword(payload.password, salt);
                const updated = await ctx.store.updateTeacherPassword(username, salt, hash);
                if (!updated) {
                    return failure('NOT_FOUND', 'Không tìm thấy giáo viên');
                }
                await ctx.store.deleteTeacherSessions(username);
                return success();
            }
            case 'adminSetTeacherActive': {
                const auth = await authenticate(payload.token, 'admin', ctx);
                if (!auth.ok)
                    return auth.response;
                const username = typeof payload.username === 'string' ? payload.username : '';
                if (typeof payload.active !== 'boolean') {
                    return failure('INVALID_ACTIVE', 'Trạng thái không hợp lệ');
                }
                const updated = await ctx.store.setTeacherActive(username, payload.active);
                if (!updated) {
                    return failure('NOT_FOUND', 'Không tìm thấy giáo viên');
                }
                await ctx.store.deleteTeacherSessions(username);
                return success();
            }
            case 'teacherLogin': {
                const username = typeof payload.username === 'string' ? payload.username : '';
                const teacher = await ctx.store.getTeacher(username);
                if (!teacher || !teacher.active) {
                    return failure('UNAUTHORIZED', 'Sai tên đăng nhập hoặc mật khẩu');
                }
                if (typeof payload.password !== 'string' || !verifyPassword(payload.password, teacher.salt, teacher.hash)) {
                    return failure('UNAUTHORIZED', 'Sai tên đăng nhập hoặc mật khẩu');
                }
                const token = generateToken();
                const tokenHash = hashToken(token);
                const expiresAt = ctx.now() + 8 * 60 * 60 * 1000;
                await ctx.store.createSession({
                    tokenHash,
                    role: 'teacher',
                    username: teacher.username,
                    name: teacher.name,
                    expiresAt,
                    authGen: teacher.authGen ?? 1,
                });
                return success({
                    token,
                    name: teacher.name,
                    expiresAt: new Date(expiresAt).toISOString(),
                });
            }
            case 'createClass': {
                const auth = await authenticate(payload.token, 'teacher', ctx);
                if (!auth.ok)
                    return auth.response;
                if (typeof payload.name !== 'string' || !payload.name.trim()) {
                    return failure('INVALID_NAME', 'Cần nhập tên lớp');
                }
                const existingClasses = await ctx.store.listClassesByTeacher(auth.session.username);
                const existingCodes = new Set(existingClasses.map(c => c.code.toUpperCase()));
                const code = generateClassCode(c => existingCodes.has(c.toUpperCase()));
                const classId = randomUUID();
                await ctx.store.saveClass({
                    classId,
                    code,
                    name: payload.name.trim(),
                    username: auth.session.username,
                    createdAt: new Date(ctx.now()).toISOString(),
                });
                return success({ classId, code });
            }
            case 'listMyClasses': {
                const auth = await authenticate(payload.token, 'teacher', ctx);
                if (!auth.ok)
                    return auth.response;
                const classes = await ctx.store.listClassesByTeacher(auth.session.username);
                const list = await Promise.all(classes.map(async (c) => {
                    const results = await ctx.store.listResultsByClass(c.code);
                    const studentCount = new Set(results.map(r => r.candidate_display)).size;
                    return {
                        classId: c.classId,
                        code: c.code,
                        name: c.name,
                        createdAt: c.createdAt,
                        studentCount,
                    };
                }));
                return success({ classes: list });
            }
            case 'getClass': {
                const code = typeof payload.code === 'string' ? payload.code.trim().toUpperCase() : '';
                if (!code) {
                    return failure('NOT_FOUND', 'Không tìm thấy lớp');
                }
                const cls = await ctx.store.getClassByCode(code);
                if (!cls) {
                    return failure('NOT_FOUND', 'Không tìm thấy lớp');
                }
                const teacher = await ctx.store.getTeacher(cls.username);
                const teacherName = teacher ? teacher.name : '';
                const assignments = await ctx.store.listAssignmentsByClass(cls.classId);
                const assignmentList = await Promise.all(assignments.map(async (a) => {
                    const meta = await findExamMeta(a.examId, ctx.store, ctx.catalog);
                    return {
                        assignmentId: a.assignmentId,
                        examId: a.examId,
                        title: meta ? meta.title : a.examId,
                        openAt: a.openAt,
                        dueAt: a.dueAt,
                        questionCount: meta ? meta.questionCount : 0,
                        durationMinutes: meta ? meta.durationMinutes : 50,
                    };
                }));
                return success({
                    class: {
                        code: cls.code,
                        name: cls.name,
                        teacherName,
                    },
                    assignments: assignmentList,
                });
            }
            case 'assignExam': {
                const auth = await authenticate(payload.token, 'teacher', ctx);
                if (!auth.ok)
                    return auth.response;
                const classId = typeof payload.classId === 'string' ? payload.classId : '';
                const cls = await ctx.store.getClassById(classId);
                if (!cls) {
                    return failure('NOT_FOUND', 'Không tìm thấy lớp');
                }
                if (cls.username !== auth.session.username) {
                    return failure('FORBIDDEN', 'Lớp thuộc giáo viên khác');
                }
                if (!isoDate(payload.openAt) || (payload.dueAt !== '' && (!isoDate(payload.dueAt) || Date.parse(payload.dueAt) <= Date.parse(payload.openAt)))) {
                    return failure('INVALID_DATES', 'Hạn nộp phải sau giờ mở, theo ISO 8601');
                }
                const examId = typeof payload.examId === 'string' ? payload.examId.trim() : '';
                if (!examId) {
                    return failure('INVALID_EXAM', 'Thiếu mã đề');
                }
                const published = await ctx.store.getExam(examId);
                if (published && published.owner !== auth.session.username && published.owner !== '') {
                    return failure('FORBIDDEN', 'Đề thuộc giáo viên khác');
                }
                const assignmentId = randomUUID();
                await ctx.store.saveAssignment({
                    assignmentId,
                    classId: cls.classId,
                    examId,
                    openAt: new Date(payload.openAt).toISOString(),
                    dueAt: payload.dueAt === '' ? '' : new Date(payload.dueAt).toISOString(),
                    createdAt: new Date(ctx.now()).toISOString(),
                });
                return success({ assignmentId });
            }
            case 'listAssignments': {
                const auth = await authenticate(payload.token, 'teacher', ctx);
                if (!auth.ok)
                    return auth.response;
                const classId = typeof payload.classId === 'string' ? payload.classId : '';
                const cls = await ctx.store.getClassById(classId);
                if (!cls) {
                    return failure('NOT_FOUND', 'Không tìm thấy lớp');
                }
                if (cls.username !== auth.session.username) {
                    return failure('FORBIDDEN', 'Lớp thuộc giáo viên khác');
                }
                const assignments = await ctx.store.listAssignmentsByClass(cls.classId);
                const list = await Promise.all(assignments.map(async (a) => {
                    const meta = await findExamMeta(a.examId, ctx.store, ctx.catalog);
                    const results = await ctx.store.listResultsByClass(cls.code, a.assignmentId);
                    return {
                        assignmentId: a.assignmentId,
                        classId: a.classId,
                        examId: a.examId,
                        openAt: a.openAt,
                        dueAt: a.dueAt,
                        createdAt: a.createdAt,
                        title: meta ? meta.title : a.examId,
                        questionCount: meta ? meta.questionCount : 0,
                        durationMinutes: meta ? meta.durationMinutes : 50,
                        submissionCount: results.length,
                    };
                }));
                return success({ assignments: list });
            }
            case 'publishExam': {
                const auth = await authenticate(payload.token, 'teacher', ctx);
                if (!auth.ok)
                    return auth.response;
                const exam = payload.exam;
                const validationErrors = validatePublishedExam(exam);
                if (validationErrors.length > 0) {
                    return failure('INVALID_EXAM', 'Đề thi không hợp lệ: ' + validationErrors.join('; '), {
                        errors: validationErrors,
                    });
                }
                const e = exam;
                const pubExamId = String(e.examId);
                const existing = await ctx.store.getExam(pubExamId);
                if (existing && existing.owner !== auth.session.username) {
                    return failure('FORBIDDEN', 'Đề thi thuộc giáo viên khác');
                }
                const rawDuration = e.settings?.durationMinutes ?? e.durationMinutes;
                const durationMinutes = typeof rawDuration === 'number' && Number.isFinite(rawDuration) ? rawDuration : null;
                const grade = typeof e.grade === 'number' && Number.isFinite(e.grade) ? e.grade : null;
                const group = String(e.group || e.settings?.group || 'Đề giáo viên xuất bản');
                const saveRes = await ctx.store.saveExam({
                    id: pubExamId,
                    title: String(e.title || ''),
                    subject: String(e.subject || ''),
                    grade,
                    durationMinutes,
                    questionCount: Array.isArray(e.questions) ? e.questions.length : 0,
                    group,
                    revision: 1,
                    updatedAt: new Date(ctx.now()).toISOString(),
                    owner: auth.session.username,
                    examJson: JSON.stringify(exam),
                });
                if (!saveRes.ok) {
                    return failure('FORBIDDEN', 'Đề thi thuộc giáo viên khác');
                }
                return success({
                    examId: pubExamId,
                    revision: saveRes.revision,
                });
            }
            case 'unpublishExam': {
                const auth = await authenticate(payload.token, 'teacher', ctx);
                if (!auth.ok)
                    return auth.response;
                const examId = typeof payload.examId === 'string' ? payload.examId.trim() : '';
                if (!examId) {
                    return failure('MISSING_EXAM_ID', 'Thiếu examId cần gỡ xuất bản');
                }
                const outcome = await ctx.store.deleteExam(examId, auth.session.username);
                if (!outcome.ok) {
                    if (outcome.error === 'FORBIDDEN') {
                        return failure('FORBIDDEN', 'Đề thi thuộc giáo viên khác');
                    }
                    return failure('NOT_FOUND', 'Không tìm thấy đề thi');
                }
                return success();
            }
            case 'getExam': {
                const examId = typeof payload.id === 'string' ? payload.id.trim() : '';
                if (!examId) {
                    return failure('NOT_FOUND', 'Không tìm thấy đề thi');
                }
                const existing = await ctx.store.getExam(examId);
                if (!existing) {
                    return failure('NOT_FOUND', 'Không tìm thấy đề thi');
                }
                try {
                    return success({ exam: JSON.parse(existing.examJson) });
                }
                catch {
                    return failure('NOT_FOUND', 'Không thể đọc dữ liệu đề thi');
                }
            }
            case 'listExams': {
                const exams = await ctx.store.listExams();
                return success({
                    exams: exams.map(e => ({
                        id: e.id,
                        title: e.title,
                        subject: e.subject,
                        grade: e.grade,
                        durationMinutes: e.durationMinutes,
                        questionCount: e.questionCount,
                        group: e.group,
                        revision: e.revision,
                        updatedAt: e.updatedAt,
                        owner: e.owner,
                    })),
                });
            }
            case 'listResults': {
                const auth = await authenticate(payload.token, 'teacher', ctx);
                if (!auth.ok)
                    return auth.response;
                const classId = typeof payload.classId === 'string' ? payload.classId : '';
                const cls = await ctx.store.getClassById(classId);
                if (!cls) {
                    return failure('NOT_FOUND', 'Không tìm thấy lớp');
                }
                if (cls.username !== auth.session.username) {
                    return failure('FORBIDDEN', 'Lớp thuộc giáo viên khác');
                }
                const assignmentId = typeof payload.assignmentId === 'string' ? payload.assignmentId : undefined;
                const results = await ctx.store.listResultsByClass(cls.code, assignmentId);
                return success({
                    results: results.map(r => ({
                        attempt_id: r.attempt_id,
                        exam_id: r.exam_id,
                        exam_version_id: r.exam_version_id,
                        candidate_display: r.candidate_display,
                        started_at: r.started_at,
                        submitted_at: r.submitted_at,
                        duration_seconds: r.duration_seconds,
                        sections: {
                            I: { score: r.score_p1, max: r.max_p1 },
                            II: { score: r.score_p2, max: r.max_p2 },
                            III: { score: r.score_p3, max: r.max_p3 },
                        },
                        score_p1: r.score_p1,
                        max_p1: r.max_p1,
                        score_p2: r.score_p2,
                        max_p2: r.max_p2,
                        score_p3: r.score_p3,
                        max_p3: r.max_p3,
                        total: r.total,
                        maxTotal: r.maxTotal,
                        policy_version: r.policy_version,
                        class_code: r.class_code,
                        assignment_id: r.assignment_id,
                    })),
                });
            }
            default:
                return failure('UNKNOWN_ACTION', 'Thao tác không hợp lệ');
        }
    }
    catch (err) {
        return json(500, {
            success: false,
            error: 'SERVER_ERROR',
            message: err?.message || 'Không thể xử lý yêu cầu, vui lòng thử lại sau',
        });
    }
}
function canonicalizeValue(val) {
    if (val === undefined || val === null)
        return 'null';
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        return JSON.stringify(val);
    }
    if (Array.isArray(val)) {
        return '[' + val.map(canonicalizeValue).join(',') + ']';
    }
    if (typeof val === 'object') {
        const keys = Object.keys(val).sort();
        return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalizeValue(val[k])).join(',') + '}';
    }
    return JSON.stringify(val);
}
function canonicalAnswersJson(raw) {
    if (raw === undefined || raw === null || raw === '')
        return '';
    let obj = raw;
    if (typeof raw === 'string') {
        try {
            obj = JSON.parse(raw);
        }
        catch {
            return raw;
        }
    }
    return canonicalizeValue(obj);
}
function isPayloadConflict(existing, candidate, payload) {
    if (existing.candidate_display !== candidate.candidate_display)
        return true;
    if (existing.exam_id !== candidate.exam_id)
        return true;
    if (existing.exam_version_id !== candidate.exam_version_id)
        return true;
    if (existing.policy_version !== candidate.policy_version)
        return true;
    if ((existing.class_code || '') !== (candidate.class_code || ''))
        return true;
    if ((existing.assignment_id || '') !== (candidate.assignment_id || ''))
        return true;
    if (payload) {
        if ((payload.started_at !== undefined || payload.startedAt !== undefined) && existing.started_at !== candidate.started_at) {
            return true;
        }
        if ((payload.submitted_at !== undefined || payload.submittedAt !== undefined) && existing.submitted_at !== candidate.submitted_at) {
            return true;
        }
        if (payload.duration_seconds !== undefined && existing.duration_seconds !== candidate.duration_seconds) {
            return true;
        }
    }
    const exTotal = parseRational(existing.total);
    const candTotal = parseRational(candidate.total);
    if (!exTotal || !candTotal || ratCmp(exTotal, candTotal) !== 0)
        return true;
    const exMax = parseRational(existing.maxTotal);
    const candMax = parseRational(candidate.maxTotal);
    if (!exMax || !candMax || ratCmp(exMax, candMax) !== 0)
        return true;
    const exS1 = parseRational(existing.score_p1);
    const candS1 = parseRational(candidate.score_p1);
    if (!exS1 || !candS1 || ratCmp(exS1, candS1) !== 0)
        return true;
    const exM1 = parseRational(existing.max_p1);
    const candM1 = parseRational(candidate.max_p1);
    if (!exM1 || !candM1 || ratCmp(exM1, candM1) !== 0)
        return true;
    const exS2 = parseRational(existing.score_p2);
    const candS2 = parseRational(candidate.score_p2);
    if (!exS2 || !candS2 || ratCmp(exS2, candS2) !== 0)
        return true;
    const exM2 = parseRational(existing.max_p2);
    const candM2 = parseRational(candidate.max_p2);
    if (!exM2 || !candM2 || ratCmp(exM2, candM2) !== 0)
        return true;
    const exS3 = parseRational(existing.score_p3);
    const candS3 = parseRational(candidate.score_p3);
    if (!exS3 || !candS3 || ratCmp(exS3, candS3) !== 0)
        return true;
    const exM3 = parseRational(existing.max_p3);
    const candM3 = parseRational(candidate.max_p3);
    if (!exM3 || !candM3 || ratCmp(exM3, candM3) !== 0)
        return true;
    if (canonicalAnswersJson(existing.raw_answers_json) !== canonicalAnswersJson(candidate.raw_answers_json)) {
        return true;
    }
    return false;
}
async function handleSubmitResult(payload, ctx) {
    const rawAttemptId = payload.attempt_id !== undefined ? payload.attempt_id : payload.attemptId;
    if (rawAttemptId === undefined || rawAttemptId === null) {
        return failure('MISSING_ATTEMPT_ID', 'Thiếu trường attempt_id bắt buộc');
    }
    if (typeof rawAttemptId !== 'string' || !rawAttemptId.trim()) {
        return failure('INVALID_ATTEMPT_ID', 'Trường attempt_id phải là chuỗi không rỗng');
    }
    if (payload.attempt_id !== undefined &&
        payload.attemptId !== undefined &&
        String(payload.attempt_id).trim() !== String(payload.attemptId).trim()) {
        return failure('CONFLICTING_ATTEMPT_ALIASES', 'Trường attempt_id và attemptId xung đột giá trị');
    }
    const attemptId = rawAttemptId.trim();
    return await doSubmitResult(payload, attemptId, ctx);
}
async function doSubmitResult(payload, attemptId, ctx) {
    const rawTotal = payload.total !== undefined ? payload.total : payload.total_score;
    const rawMaxTotal = payload.maxTotal !== undefined ? payload.maxTotal : payload.max_total;
    if (rawTotal === undefined || rawTotal === null || rawMaxTotal === undefined || rawMaxTotal === null) {
        return failure('MISSING_SCORE', 'Thiếu điểm tổng hoặc điểm tối đa bài thi');
    }
    if (payload.total !== undefined &&
        payload.total_score !== undefined &&
        String(payload.total).trim() !== String(payload.total_score).trim()) {
        return failure('CONFLICTING_SCORE_ALIASES', 'Trường total và total_score xung đột giá trị');
    }
    if (payload.maxTotal !== undefined &&
        payload.max_total !== undefined &&
        String(payload.maxTotal).trim() !== String(payload.max_total).trim()) {
        return failure('CONFLICTING_MAX_ALIASES', 'Trường maxTotal và max_total xung đột giá trị');
    }
    const totalRat = parseRational(rawTotal);
    const maxTotalRat = parseRational(rawMaxTotal);
    if (!totalRat || !maxTotalRat) {
        return failure('INVALID_SCORE', 'Điểm tổng hoặc điểm tối đa không đúng định dạng phân số hợp lệ');
    }
    if (totalRat.num < 0n || maxTotalRat.num <= 0n) {
        return failure('INVALID_SCORE_RANGE', 'Điểm tổng không được âm và điểm tối đa phải lớn hơn 0');
    }
    if (ratCmp(totalRat, maxTotalRat) > 0) {
        return failure('SCORE_EXCEEDS_MAX', 'Điểm tổng không được vượt quá điểm tối đa');
    }
    const rawExamId = payload.exam_id !== undefined ? payload.exam_id : payload.examId;
    if (rawExamId === undefined || rawExamId === null) {
        return failure('MISSING_EXAM_ID', 'Thiếu trường exam_id bắt buộc');
    }
    if (typeof rawExamId !== 'string' || !rawExamId.trim()) {
        return failure('INVALID_EXAM_ID', 'Trường exam_id phải là chuỗi không rỗng');
    }
    if (payload.exam_id !== undefined &&
        payload.examId !== undefined &&
        String(payload.exam_id).trim() !== String(payload.examId).trim()) {
        return failure('CONFLICTING_EXAM_ALIASES', 'Trường exam_id và examId xung đột giá trị');
    }
    const examId = rawExamId.trim();
    const rawExamVersionId = payload.exam_version_id !== undefined ? payload.exam_version_id : payload.examVersionId;
    if (rawExamVersionId === undefined || rawExamVersionId === null) {
        return failure('MISSING_EXAM_VERSION_ID', 'Thiếu trường exam_version_id bắt buộc');
    }
    if (typeof rawExamVersionId !== 'string' || !rawExamVersionId.trim()) {
        return failure('INVALID_EXAM_VERSION_ID', 'Trường exam_version_id phải là chuỗi không rỗng');
    }
    if (payload.exam_version_id !== undefined &&
        payload.examVersionId !== undefined &&
        String(payload.exam_version_id).trim() !== String(payload.examVersionId).trim()) {
        return failure('CONFLICTING_VERSION_ALIASES', 'Trường exam_version_id và examVersionId xung đột giá trị');
    }
    const examVersionId = rawExamVersionId.trim();
    if (payload.candidate_display !== undefined &&
        payload.candidateName !== undefined &&
        String(payload.candidate_display).trim() !== String(payload.candidateName).trim()) {
        return failure('CONFLICTING_CANDIDATE_ALIASES', 'Trường candidate_display và candidateName xung đột giá trị');
    }
    const candidateDisplay = String(payload.candidate_display || payload.candidateName || 'Thí sinh tự do').trim();
    if (payload.policy_version !== undefined &&
        payload.ruleSetId !== undefined &&
        String(payload.policy_version).trim() !== String(payload.ruleSetId).trim()) {
        return failure('CONFLICTING_POLICY_ALIASES', 'Trường policy_version và ruleSetId xung đột giá trị');
    }
    const policyVersion = String(payload.policy_version || payload.ruleSetId || 'custom-v1').trim();
    let secI = null;
    let secII = null;
    let secIII = null;
    if (payload.sections !== undefined && payload.sections !== null) {
        if (typeof payload.sections !== 'object' || Array.isArray(payload.sections)) {
            return failure('INVALID_SECTIONS', 'Trường sections phải là một đối tượng hợp lệ');
        }
        const sec = payload.sections;
        if (!sec.I ||
            !sec.II ||
            !sec.III ||
            sec.I.score === undefined ||
            sec.I.max === undefined ||
            sec.II.score === undefined ||
            sec.II.max === undefined ||
            sec.III.score === undefined ||
            sec.III.max === undefined) {
            return failure('INCOMPLETE_SECTIONS', 'Trường sections phải có đầy đủ 3 phần I, II, III với score và max');
        }
        secI = { score: sec.I.score, max: sec.I.max };
        secII = { score: sec.II.score, max: sec.II.max };
        secIII = { score: sec.III.score, max: sec.III.max };
    }
    else if (payload.score_p1 !== undefined &&
        payload.max_p1 !== undefined &&
        payload.score_p2 !== undefined &&
        payload.max_p2 !== undefined &&
        payload.score_p3 !== undefined &&
        payload.max_p3 !== undefined) {
        secI = { score: payload.score_p1, max: payload.max_p1 };
        secII = { score: payload.score_p2, max: payload.max_p2 };
        secIII = { score: payload.score_p3, max: payload.max_p3 };
    }
    else {
        return failure('INCOMPLETE_SECTIONS', 'Yêu cầu đầy đủ thông tin điểm 3 phần I, II, III (qua sections hoặc alias)');
    }
    const s1 = parseRational(secI.score);
    const m1 = parseRational(secI.max);
    const s2 = parseRational(secII.score);
    const m2 = parseRational(secII.max);
    const s3 = parseRational(secIII.score);
    const m3 = parseRational(secIII.max);
    if (!s1 || !m1 || !s2 || !m2 || !s3 || !m3) {
        return failure('INVALID_SECTION_SCORES', 'Điểm từng phần không đúng định dạng phân số hợp lệ');
    }
    if (s1.num < 0n || s2.num < 0n || s3.num < 0n || m1.num < 0n || m2.num < 0n || m3.num < 0n) {
        return failure('NEGATIVE_SECTION_SCORE', 'Điểm các phần không được âm');
    }
    if (ratCmp(s1, m1) > 0 || ratCmp(s2, m2) > 0 || ratCmp(s3, m3) > 0) {
        return failure('SECTION_SCORE_EXCEEDS_MAX', 'Điểm từng phần không được vượt quá điểm tối đa của phần đó');
    }
    const sumScores = ratAdd(ratAdd(s1, s2), s3);
    const sumMax = ratAdd(ratAdd(m1, m2), m3);
    if (ratCmp(sumScores, totalRat) !== 0) {
        return failure('SECTION_SUM_MISMATCH', 'Tổng điểm các phần không khớp với điểm tổng');
    }
    if (ratCmp(sumMax, maxTotalRat) !== 0) {
        return failure('SECTION_MAX_MISMATCH', 'Tổng điểm tối đa các phần không khớp với điểm tối đa của đề');
    }
    const classCode = typeof payload.class_code === 'string' ? payload.class_code.trim().toUpperCase() : '';
    const assignmentId = typeof payload.assignment_id === 'string' ? payload.assignment_id.trim() : '';
    if ((payload.class_code !== undefined && typeof payload.class_code !== 'string') ||
        (payload.assignment_id !== undefined && typeof payload.assignment_id !== 'string') ||
        Boolean(classCode) !== Boolean(assignmentId)) {
        return failure('INVALID_ASSIGNMENT', 'Thiếu thông tin lớp hoặc bài giao');
    }
    const recordedAt = new Date(ctx.now()).toISOString();
    const rawAnswers = payload.raw_answers_json || payload.raw_answers || payload.responses || '';
    const rawAnswersStr = typeof rawAnswers === 'string' ? rawAnswers : JSON.stringify(rawAnswers);
    const newResult = {
        attempt_id: attemptId,
        exam_id: examId,
        exam_version_id: examVersionId,
        candidate_display: candidateDisplay,
        started_at: String(payload.started_at || payload.startedAt || ''),
        submitted_at: String(payload.submitted_at || payload.submittedAt || recordedAt),
        duration_seconds: typeof payload.duration_seconds === 'number' && Number.isFinite(payload.duration_seconds) && payload.duration_seconds >= 0
            ? payload.duration_seconds
            : 0,
        score_p1: toCanonicalStr(s1),
        max_p1: toCanonicalStr(m1),
        score_p2: toCanonicalStr(s2),
        max_p2: toCanonicalStr(m2),
        score_p3: toCanonicalStr(s3),
        max_p3: toCanonicalStr(m3),
        total: toCanonicalStr(totalRat),
        maxTotal: toCanonicalStr(maxTotalRat),
        policy_version: policyVersion,
        raw_answers_json: rawAnswersStr,
        class_code: classCode,
        assignment_id: assignmentId,
        recorded_at: recordedAt,
    };
    const existing = await ctx.store.getResult(attemptId);
    if (existing) {
        if (isPayloadConflict(existing, newResult, payload)) {
            return failure('PAYLOAD_CONFLICT', 'Lượt thi đã tồn tại với kết quả hoặc nội dung đề thi khác, không thể ghi đè');
        }
        return success({
            attempt_id: attemptId,
            status: 'ALREADY_RECORDED',
            message: 'Kết quả bài thi đã được ghi nhận trước đó',
            recorded_at: existing.recorded_at,
        });
    }
    if (classCode && assignmentId) {
        const cls = await ctx.store.getClassByCode(classCode);
        const assignment = await ctx.store.getAssignment(assignmentId);
        if (!cls || !assignment || assignment.classId !== cls.classId || assignment.examId !== examId) {
            return failure('INVALID_ASSIGNMENT', 'Bài giao không thuộc lớp hoặc đề đã chọn');
        }
        if (ctx.now() < Date.parse(assignment.openAt)) {
            return failure('NOT_OPEN', 'Bài giao chưa mở');
        }
        if (assignment.dueAt !== '' && ctx.now() > Date.parse(assignment.dueAt) + 120000) {
            return failure('PAST_DUE', 'Nộp sau hạn — giáo viên chưa nhận');
        }
    }
    const outcome = await ctx.store.saveResult(newResult);
    if (outcome.inserted) {
        return success({
            attempt_id: attemptId,
            status: 'NEWLY_RECORDED',
            message: 'Ghi nhận kết quả bài thi thành công',
            recorded_at: outcome.record.recorded_at,
        });
    }
    if (isPayloadConflict(outcome.record, newResult, payload)) {
        return failure('PAYLOAD_CONFLICT', 'Lượt thi đã tồn tại với kết quả hoặc nội dung đề thi khác, không thể ghi đè');
    }
    return success({
        attempt_id: attemptId,
        status: 'ALREADY_RECORDED',
        message: 'Kết quả bài thi đã được ghi nhận trước đó',
        recorded_at: outcome.record.recorded_at,
    });
}
