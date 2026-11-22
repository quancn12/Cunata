import type { AttemptRecord, CollectorPort, Receipt } from './types.ts';
import { CollectorError, computePayloadHash } from './index.ts';
import { buildWebResultPayload, resolveScoreDTO } from './export.ts';

/**
 * Cấu hình ứng dụng đọc từ public/config.json.
 * appsScriptUrl: '' nghĩa là chưa cấu hình (chưa triển khai).
 */
export interface AppConfig {
  appsScriptUrl: string;
  apiBase?: string;
}

/** Transport is selected by owner configuration, never by an imported exam. */
export function resolveBackend(config: AppConfig): {
  url: string;
  contentType: 'application/json' | 'text/plain;charset=utf-8';
} {
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
export async function loadAppConfig(fetchImpl?: typeof fetch): Promise<AppConfig> {
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
  } catch {
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
export function getTeacherToken(): string | null {
  try {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(TEACHER_TOKEN_STORAGE_KEY);
    }
  } catch {}
  return null;
}

/** Lưu token giáo viên vào sessionStorage */
export function setTeacherToken(token: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(TEACHER_TOKEN_STORAGE_KEY, token);
    }
  } catch {}
}

/** Xóa token giáo viên khỏi sessionStorage */
export function clearTeacherToken(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(TEACHER_TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(LEGACY_TEACHER_PW_STORAGE_KEY);
    }
  } catch {}
}

/** Lấy token admin từ sessionStorage */
export function getAdminToken(): string | null {
  try {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    }
  } catch {}
  return null;
}

/** Lưu token admin vào sessionStorage */
export function setAdminToken(token: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    }
  } catch {}
}

/** Xóa token admin khỏi sessionStorage */
export function clearAdminToken(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    }
  } catch {}
}

/** Đăng xuất giáo viên (xóa token và mật khẩu tạm khỏi sessionStorage) */
export function teacherLogout(): void {
  clearTeacherToken();
}

/** Đăng xuất admin (xóa token khỏi sessionStorage) */
export function adminLogout(): void {
  clearAdminToken();
}

/**
 * Bảng tra cứu thông báo lỗi người dùng bằng tiếng Việt thân thiện (WEB-contract 11 & 19.2).
 */
export const ERROR_MESSAGES_VI: Record<string, string> = {
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
export function mapErrorToVietnamese(code: string, serverMessage?: string): string {
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
 * Metadata của đề thi đã xuất bản trên Apps Script.
 */
export interface PublishedExamMeta {
  id: string;
  title: string;
  subject: string;
  grade: number | null;
  durationMinutes: number | null;
  questionCount: number;
  group: string;
  revision: number;
  updatedAt: string;
  owner?: string;
}

/**
 * Kiểu kết quả trả về của AppsScriptClient theo hợp đồng WEB mục 18.1.
 */
export type AsResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string; details?: unknown };

export interface TeacherLoginResult {
  token: string;
  name: string;
  expiresAt?: string;
}

export interface AdminLoginResult {
  token: string;
  expiresAt?: string;
}

export interface TeacherAccountInfo {
  username: string;
  name: string;
  active: boolean;
  createdAt: string;
}

export interface AdminStats {
  teachers: number;
  classes: number;
  exams: number;
  results: number;
}

export interface NewTeacherInput {
  name: string;
  username: string;
  password: string;
  token?: string;
}

export interface ResetPasswordInput {
  username: string;
  password: string;
  token?: string;
}

export interface SetTeacherActiveInput {
  username: string;
  active: boolean;
  token?: string;
}

export interface CreateClassInput {
  name: string;
  token?: string;
}

export interface CreateClassResult {
  classId: string;
  code: string;
}

export interface TeacherClassMeta {
  classId: string;
  code: string;
  name: string;
  createdAt: string;
  studentCount: number;
}

export interface AssignExamInput {
  classId: string;
  examId: string;
  openAt: string;
  dueAt: string;
  token?: string;
}

export interface AssignmentMeta {
  assignmentId: string;
  classId: string;
  examId: string;
  openAt: string;
  dueAt: string;
  createdAt: string;
  title: string;
  questionCount: number;
  durationMinutes: number;
  submissionCount?: number;
}

export interface ClassAssignmentMeta {
  assignmentId: string;
  examId: string;
  title: string;
  openAt: string;
  dueAt: string;
  questionCount: number;
  durationMinutes: number;
}

export interface ClassInfo {
  class: {
    code: string;
    name: string;
    teacherName: string;
  };
  assignments: ClassAssignmentMeta[];
}

export interface ClassResultItem {
  attempt_id?: string;
  attemptId?: string;
  candidate_display?: string;
  candidateName?: string;
  started_at?: string;
  submitted_at?: string;
  duration_seconds?: number;
  total?: string;
  maxTotal?: string;
  sections?: Record<string, { score: string; max: string }>;
  class_code?: string;
  assignment_id?: string;
  [key: string]: unknown;
}

/**
 * Giao diện client giao tiếp với Google Apps Script (WEB-contract mục 18.1 & 19.2).
 */
export interface AppsScriptClient {
  readonly configured: boolean;

  // Exams (public GET)
  listExams(): Promise<AsResult<PublishedExamMeta[]>>;
  getExam(id: string): Promise<AsResult<unknown>>;

  // Class (public student GET)
  getClass(code: string): Promise<AsResult<ClassInfo>>;

  // Teacher Auth & Publishing
  teacherLogin(password: string): Promise<AsResult<true>>;
  teacherLogin(username: string, password: string): Promise<AsResult<TeacherLoginResult>>;
  teacherLogin(arg1: string, arg2?: string): Promise<AsResult<any>>;

  publishExam(tokenOrPassword: string, exam: unknown): Promise<AsResult<{ examId: string; revision: number }>>;
  unpublishExam(tokenOrPassword: string, examId: string): Promise<AsResult<true>>;

  // Teacher Classes & Assignments
  createClass(name: string): Promise<AsResult<CreateClassResult>>;
  createClass(token: string, name: string): Promise<AsResult<CreateClassResult>>;
  createClass(tokenOrName: string | CreateClassInput, name?: string): Promise<AsResult<CreateClassResult>>;

  listMyClasses(token?: string): Promise<AsResult<TeacherClassMeta[]>>;

  assignExam(classId: string, examId: string, openAt: string, dueAt: string): Promise<AsResult<{ assignmentId: string }>>;
  assignExam(token: string, classId: string, examId: string, openAt: string, dueAt: string): Promise<AsResult<{ assignmentId: string }>>;
  assignExam(
    tokenOrOpts: string | AssignExamInput,
    classId?: string,
    examId?: string,
    openAt?: string,
    dueAt?: string
  ): Promise<AsResult<{ assignmentId: string }>>;

  listAssignments(classId: string): Promise<AsResult<AssignmentMeta[]>>;
  listAssignments(token: string, classId: string): Promise<AsResult<AssignmentMeta[]>>;
  listAssignments(tokenOrClassId: string, classId?: string): Promise<AsResult<AssignmentMeta[]>>;

  listResults(classId?: string, assignmentId?: string): Promise<AsResult<ClassResultItem[]>>;
  listResults(token: string, classId?: string, assignmentId?: string): Promise<AsResult<ClassResultItem[]>>;
  listResults(
    tokenOrClassId?: string,
    classIdOrAssignmentId?: string,
    assignmentId?: string
  ): Promise<AsResult<ClassResultItem[]>>;

  // Admin Actions
  adminLogin(password: string): Promise<AsResult<AdminLoginResult>>;

  adminCreateTeacher(teacher: NewTeacherInput): Promise<AsResult<true>>;
  adminCreateTeacher(token: string, teacher: NewTeacherInput): Promise<AsResult<true>>;
  adminCreateTeacher(token: string, name: string, username: string, password: string): Promise<AsResult<true>>;
  adminCreateTeacher(
    tokenOrTeacher: string | NewTeacherInput,
    teacherOrName?: NewTeacherInput | string,
    username?: string,
    password?: string
  ): Promise<AsResult<true>>;

  adminListTeachers(token?: string): Promise<AsResult<TeacherAccountInfo[]>>;

  adminResetPassword(username: string, password: string): Promise<AsResult<true>>;
  adminResetPassword(token: string, username: string, password: string): Promise<AsResult<true>>;
  adminResetPassword(
    tokenOrOpts: string | ResetPasswordInput,
    username?: string,
    password?: string
  ): Promise<AsResult<true>>;

  adminSetTeacherActive(username: string, active: boolean): Promise<AsResult<true>>;
  adminSetTeacherActive(token: string, username: string, active: boolean): Promise<AsResult<true>>;
  adminSetTeacherActive(
    tokenOrOpts: string | SetTeacherActiveInput,
    username?: string | boolean,
    active?: boolean
  ): Promise<AsResult<true>>;

  adminStats(token?: string): Promise<AsResult<AdminStats>>;

  // Logout helpers
  teacherLogout(): void;
  adminLogout(): void;
}

/**
 * CollectorPort kết nối tới Apps Script, mở rộng với trường configured.
 */
export interface AppsScriptCollectorPort extends CollectorPort {
  readonly configured: boolean;
}

/**
 * Nối query params vào base URL một cách an toàn.
 */
function buildGetUrl(baseUrl: string, params: Record<string, string>): string {
  const [base, query] = baseUrl.split('?');
  const searchParams = new URLSearchParams(query || '');
  for (const [key, val] of Object.entries(params)) {
    searchParams.set(key, val);
  }
  const qs = searchParams.toString();
  return qs ? `${base}?${qs}` : base!;
}

/**
 * Thực thi một HTTP request tới Apps Script có quản lý timeout 15s và ánh xạ lỗi chuẩn.
 */
/**
 * Bộ nhớ đệm ngắn cho listExams (chậm 2–3 giây mỗi lần qua Apps Script; trang từng gọi 2 lần liền khi mở — đo thật 21/11/2026).
 * Hết hạn sau LIST_TTL_MS và bị xóa ngay khi có bất kỳ yêu cầu POST nào (xuất bản/sửa/gỡ đề) để thư viện luôn mới.
 */
const LIST_TTL_MS = 20000;
const listCache = new Map<string, { at: number; p: Promise<AsResult<PublishedExamMeta[]>> }>();

async function executeAppsScriptRequest<T>(
  url: string,
  init: RequestInit,
  fetchFn: typeof fetch,
  transform: (data: any) => AsResult<T>
): Promise<AsResult<T>> {
  if (String(init.method || 'GET').toUpperCase() !== 'GET') listCache.clear();
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error('TIMEOUT'));
  }, 15000);

  try {
    let res: Response;
    try {
      res = await fetchFn(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (err: any) {
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

    let text: string;
    try {
      text = await res.text();
    } catch (err: any) {
      return {
        ok: false,
        code: 'NETWORK',
        message: `Không thể đọc nội dung phản hồi: ${err?.message || String(err)}`,
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
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
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Khởi tạo client giao tiếp với Apps Script.
 * - url rỗng: configured = false, mọi hàm trả NOT_CONFIGURED ngay, không gọi fetch.
 * - GET: đọc danh sách / đọc chi tiết đề / tra cứu lớp học theo mã.
 * - POST: text/plain;charset=utf-8, token/mật khẩu trong body, redirect: 'follow', timeout: 15s.
 */
export function createAppsScriptClient(
  url: string,
  fetchImpl?: typeof fetch,
  contentType: 'application/json' | 'text/plain;charset=utf-8' = 'text/plain;charset=utf-8'
): AppsScriptClient {
  const trimmedUrl = (url ?? '').trim();
  const configured = trimmedUrl.length > 0;
  const fetchFn = fetchImpl ?? globalThis.fetch;

  if (!configured) {
    const notConfiguredResult = <T>(): AsResult<T> => ({
      ok: false,
      code: 'NOT_CONFIGURED',
      message: mapErrorToVietnamese('NOT_CONFIGURED'),
    });

    return {
      configured: false,
      async listExams(): Promise<AsResult<PublishedExamMeta[]>> {
        return notConfiguredResult();
      },
      async getExam(_id: string): Promise<AsResult<unknown>> {
        return notConfiguredResult();
      },
      async getClass(_code: string): Promise<AsResult<ClassInfo>> {
        return notConfiguredResult();
      },
      async teacherLogin(_arg1: string, _arg2?: string): Promise<AsResult<any>> {
        return notConfiguredResult();
      },
      async publishExam(_tokenOrPassword: string, _exam: unknown): Promise<AsResult<{ examId: string; revision: number }>> {
        return notConfiguredResult();
      },
      async unpublishExam(_tokenOrPassword: string, _examId: string): Promise<AsResult<true>> {
        return notConfiguredResult();
      },
      async createClass(_tokenOrName: string | CreateClassInput, _name?: string): Promise<AsResult<CreateClassResult>> {
        return notConfiguredResult();
      },
      async listMyClasses(_token?: string): Promise<AsResult<TeacherClassMeta[]>> {
        return notConfiguredResult();
      },
      async assignExam(
        _tokenOrOpts: string | AssignExamInput,
        _classId?: string,
        _examId?: string,
        _openAt?: string,
        _dueAt?: string
      ): Promise<AsResult<{ assignmentId: string }>> {
        return notConfiguredResult();
      },
      async listAssignments(_tokenOrClassId: string, _classId?: string): Promise<AsResult<AssignmentMeta[]>> {
        return notConfiguredResult();
      },
      async listResults(
        _tokenOrClassId?: string,
        _classIdOrAssignmentId?: string,
        _assignmentId?: string
      ): Promise<AsResult<ClassResultItem[]>> {
        return notConfiguredResult();
      },
      async adminLogin(_password: string): Promise<AsResult<AdminLoginResult>> {
        return notConfiguredResult();
      },
      async adminCreateTeacher(
        _tokenOrTeacher: string | NewTeacherInput,
        _teacherOrName?: NewTeacherInput | string,
        _username?: string,
        _password?: string
      ): Promise<AsResult<true>> {
        return notConfiguredResult();
      },
      async adminListTeachers(_token?: string): Promise<AsResult<TeacherAccountInfo[]>> {
        return notConfiguredResult();
      },
      async adminResetPassword(
        _tokenOrOpts: string | ResetPasswordInput,
        _username?: string,
        _password?: string
      ): Promise<AsResult<true>> {
        return notConfiguredResult();
      },
      async adminSetTeacherActive(
        _tokenOrOpts: string | SetTeacherActiveInput,
        _username?: string | boolean,
        _active?: boolean
      ): Promise<AsResult<true>> {
        return notConfiguredResult();
      },
      async adminStats(_token?: string): Promise<AsResult<AdminStats>> {
        return notConfiguredResult();
      },
      teacherLogout(): void {
        clearTeacherToken();
      },
      adminLogout(): void {
        clearAdminToken();
      },
    };
  }

  const client: AppsScriptClient = {
    configured: true,

    async listExams(): Promise<AsResult<PublishedExamMeta[]>> {
      const getUrl = buildGetUrl(trimmedUrl, { action: 'listExams' });
      const hit = listCache.get(getUrl);
      if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.p;
      const p = executeAppsScriptRequest(
        getUrl,
        { method: 'GET', redirect: 'follow', cache: 'no-store' },
        fetchFn,
        (data) => {
          const rawList = Array.isArray(data.exams) ? data.exams : [];
          const exams: PublishedExamMeta[] = rawList.map((e: any) => ({
            id: String(e.id ?? ''),
            title: String(e.title ?? ''),
            subject: String(e.subject ?? ''),
            grade: typeof e.grade === 'number' ? e.grade : (e.grade !== null && !isNaN(Number(e.grade)) ? Number(e.grade) : null),
            durationMinutes: typeof e.durationMinutes === 'number' ? e.durationMinutes : (e.durationMinutes !== null && !isNaN(Number(e.durationMinutes)) ? Number(e.durationMinutes) : null),
            questionCount: typeof e.questionCount === 'number' ? e.questionCount : Number(e.questionCount) || 0,
            group: String(e.group ?? ''),
            revision: typeof e.revision === 'number' ? e.revision : Number(e.revision) || 1,
            updatedAt: String(e.updatedAt ?? ''),
            owner: e.owner ? String(e.owner) : undefined,
          }));
          return { ok: true, value: exams };
        }
      );
      listCache.set(getUrl, { at: Date.now(), p });
      p.then((r) => { if (!r.ok) listCache.delete(getUrl); }, () => listCache.delete(getUrl));
      return p;
    },

    async getExam(id: string): Promise<AsResult<unknown>> {
      const getUrl = buildGetUrl(trimmedUrl, { action: 'getExam', id });
      return executeAppsScriptRequest(
        getUrl,
        { method: 'GET', redirect: 'follow', cache: 'no-store' },
        fetchFn,
        (data) => ({
          ok: true,
          value: data.exam !== undefined ? data.exam : data,
        })
      );
    },

    async getClass(code: string): Promise<AsResult<ClassInfo>> {
      const getUrl = buildGetUrl(trimmedUrl, { action: 'getClass', code: String(code || '').trim() });
      return executeAppsScriptRequest(
        getUrl,
        { method: 'GET', redirect: 'follow', cache: 'no-store' },
        fetchFn,
        (data) => {
          const cls = data.class && typeof data.class === 'object' ? data.class : {};
          const rawAssignments = Array.isArray(data.assignments) ? data.assignments : [];
          const assignments: ClassAssignmentMeta[] = rawAssignments.map((a: any) => ({
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
        }
      );
    },

    async teacherLogin(arg1: string, arg2?: string): Promise<AsResult<any>> {
      // Legacy 1-arg call: teacherLogin(password)
      if (arg2 === undefined) {
        return executeAppsScriptRequest(
          trimmedUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': contentType },
            body: JSON.stringify({ action: 'teacherLogin', password: arg1 }),
            redirect: 'follow',
          },
          fetchFn,
          () => {
            try {
              if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(LEGACY_TEACHER_PW_STORAGE_KEY, arg1);
              }
            } catch {}
            return { ok: true, value: true };
          }
        );
      }

      // New 2-arg call: teacherLogin(username, password)
      return executeAppsScriptRequest(
        trimmedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: JSON.stringify({ action: 'teacherLogin', username: arg1, password: arg2 }),
          redirect: 'follow',
        },
        fetchFn,
        (data) => {
          const token = String(data.token ?? '');
          setTeacherToken(token);
          const result: TeacherLoginResult = {
            token,
            name: String(data.name ?? ''),
            ...(data.expiresAt ? { expiresAt: String(data.expiresAt) } : {}),
          };
          return { ok: true, value: result };
        }
      );
    },

    async publishExam(
      tokenOrPassword: string,
      exam: unknown
    ): Promise<AsResult<{ examId: string; revision: number }>> {
      const tok = (tokenOrPassword || getTeacherToken() || '').trim();
      return executeAppsScriptRequest(
        trimmedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: JSON.stringify({ action: 'publishExam', token: tok, password: tok, exam }),
          redirect: 'follow',
        },
        fetchFn,
        (data) => ({
          ok: true,
          value: {
            examId: String(data.examId ?? ''),
            revision: Number(data.revision) || 1,
          },
        })
      );
    },

    async unpublishExam(tokenOrPassword: string, examId: string): Promise<AsResult<true>> {
      const tok = (tokenOrPassword || getTeacherToken() || '').trim();
      return executeAppsScriptRequest(
        trimmedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: JSON.stringify({ action: 'unpublishExam', token: tok, password: tok, examId }),
          redirect: 'follow',
        },
        fetchFn,
        () => ({ ok: true, value: true })
      );
    },

    async createClass(
      tokenOrName: string | CreateClassInput,
      nameArg?: string
    ): Promise<AsResult<CreateClassResult>> {
      let token = '';
      let name = '';
      if (typeof tokenOrName === 'string') {
        if (typeof nameArg === 'string') {
          token = tokenOrName;
          name = nameArg;
        } else {
          token = getTeacherToken() || '';
          name = tokenOrName;
        }
      } else if (typeof tokenOrName === 'object' && tokenOrName !== null) {
        token = tokenOrName.token || getTeacherToken() || '';
        name = tokenOrName.name;
      }
      if (!token) token = getTeacherToken() || '';

      return executeAppsScriptRequest(
        trimmedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: JSON.stringify({ action: 'createClass', token, name }),
          redirect: 'follow',
        },
        fetchFn,
        (data) => ({
          ok: true,
          value: {
            classId: String(data.classId ?? ''),
            code: String(data.code ?? ''),
          },
        })
      );
    },

    async listMyClasses(token?: string): Promise<AsResult<TeacherClassMeta[]>> {
      const tok = (token || getTeacherToken() || '').trim();
      return executeAppsScriptRequest(
        trimmedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: JSON.stringify({ action: 'listMyClasses', token: tok }),
          redirect: 'follow',
        },
        fetchFn,
        (data) => {
          const raw = Array.isArray(data.classes) ? data.classes : [];
          const classes: TeacherClassMeta[] = raw.map((c: any) => ({
            classId: String(c.classId ?? ''),
            code: String(c.code ?? ''),
            name: String(c.name ?? ''),
            createdAt: String(c.createdAt ?? ''),
            studentCount: typeof c.studentCount === 'number' ? c.studentCount : Number(c.studentCount) || 0,
          }));
          return { ok: true, value: classes };
        }
      );
    },

    async assignExam(
      tokenOrOpts: string | AssignExamInput,
      classIdArg?: string,
      examIdArg?: string,
      openAtArg?: string,
      dueAtArg?: string
    ): Promise<AsResult<{ assignmentId: string }>> {
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
        } else if (classIdArg && examIdArg && openAtArg && !dueAtArg) {
          token = getTeacherToken() || '';
          classId = tokenOrOpts;
          examId = classIdArg;
          openAt = examIdArg;
          dueAt = openAtArg;
        }
      } else if (typeof tokenOrOpts === 'object' && tokenOrOpts !== null) {
        token = tokenOrOpts.token || getTeacherToken() || '';
        classId = tokenOrOpts.classId;
        examId = tokenOrOpts.examId;
        openAt = tokenOrOpts.openAt;
        dueAt = tokenOrOpts.dueAt;
      }
      if (!token) token = getTeacherToken() || '';

      return executeAppsScriptRequest(
        trimmedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: JSON.stringify({ action: 'assignExam', token, classId, examId, openAt, dueAt }),
          redirect: 'follow',
        },
        fetchFn,
        (data) => ({
          ok: true,
          value: {
            assignmentId: String(data.assignmentId ?? ''),
          },
        })
      );
    },

    async listAssignments(tokenOrClassId: string, classIdArg?: string): Promise<AsResult<AssignmentMeta[]>> {
      let token = '';
      let classId = '';
      if (classIdArg !== undefined) {
        token = tokenOrClassId;
        classId = classIdArg;
      } else {
        token = getTeacherToken() || '';
        classId = tokenOrClassId;
      }
      if (!token) token = getTeacherToken() || '';

      return executeAppsScriptRequest(
        trimmedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: JSON.stringify({ action: 'listAssignments', token, classId }),
          redirect: 'follow',
        },
        fetchFn,
        (data) => {
          const raw = Array.isArray(data.assignments) ? data.assignments : [];
          const assignments: AssignmentMeta[] = raw.map((a: any) => ({
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
        }
      );
    },

    async listResults(
      tokenOrClassId?: string,
      classIdOrAssignmentId?: string,
      assignmentIdArg?: string
    ): Promise<AsResult<ClassResultItem[]>> {
      let token = '';
      let classId = '';
      let assignmentId: string | undefined = undefined;

      if (assignmentIdArg !== undefined) {
        token = tokenOrClassId || '';
        classId = classIdOrAssignmentId || '';
        assignmentId = assignmentIdArg;
      } else if (classIdOrAssignmentId !== undefined) {
        const stored = getTeacherToken();
        const isArg0Uuid = Boolean(tokenOrClassId && /^[0-9a-f-]{36}$/i.test(tokenOrClassId) && tokenOrClassId.includes('-'));
        if (stored && isArg0Uuid) {
          token = stored;
          classId = tokenOrClassId || '';
          assignmentId = classIdOrAssignmentId;
        } else if (tokenOrClassId && (tokenOrClassId.length >= 32 || tokenOrClassId === stored || !stored)) {
          token = tokenOrClassId;
          classId = classIdOrAssignmentId || '';
        } else {
          token = stored || '';
          classId = tokenOrClassId || '';
          assignmentId = classIdOrAssignmentId;
        }
      } else {
        const stored = getTeacherToken();
        if (tokenOrClassId && tokenOrClassId.length >= 32 && !tokenOrClassId.includes('-')) {
          token = tokenOrClassId;
          classId = '';
        } else {
          token = stored || '';
          classId = tokenOrClassId || '';
        }
      }
      if (!token) token = getTeacherToken() || '';

      // Khi classId rỗng (giáo viên chọn "-- Tất cả lớp --" hoặc không truyền classId):
      // Tra cứu toàn bộ các lớp của giáo viên qua listMyClasses rồi tổng hợp kết quả của từng lớp.
      if (!classId || classId.trim() === '') {
        const classesRes = await client.listMyClasses(token);
        if (!classesRes.ok) {
          return classesRes as AsResult<ClassResultItem[]>;
        }
        const classes = classesRes.value || [];
        if (classes.length === 0) {
          return { ok: true, value: [] };
        }
        const classResultsPromises = classes.map((c) =>
          client.listResults(token, c.classId, assignmentId)
        );
        const settled = await Promise.all(classResultsPromises);
        const seenAttempts = new Set<string>();
        const combined: ClassResultItem[] = [];
        let firstErr: AsResult<ClassResultItem[]> | null = null;
        for (const item of settled) {
          if (item.ok && Array.isArray(item.value)) {
            for (const resItem of item.value) {
              const id = (resItem as any).attempt_id || (resItem as any).attemptId;
              if (id) {
                if (seenAttempts.has(id)) continue;
                seenAttempts.add(id);
              }
              combined.push(resItem);
            }
          } else if (!item.ok && !firstErr) {
            firstErr = item;
          }
        }
        if (combined.length === 0 && firstErr && classes.length > 0) {
          return firstErr;
        }
        return { ok: true, value: combined };
      }

      const body: Record<string, unknown> = {
        action: 'listResults',
        token,
        classId,
        ...(assignmentId ? { assignmentId } : {}),
      };

      return executeAppsScriptRequest(
        trimmedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: JSON.stringify(body),
          redirect: 'follow',
        },
        fetchFn,
        (data) => {
          const results = Array.isArray(data.results) ? data.results : [];
          return { ok: true, value: results };
        }
      );
    },

    async adminLogin(password: string): Promise<AsResult<AdminLoginResult>> {
      return executeAppsScriptRequest(
        trimmedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: JSON.stringify({ action: 'adminLogin', password }),
          redirect: 'follow',
        },
        fetchFn,
        (data) => {
          const token = String(data.token ?? '');
          setAdminToken(token);
          return {
            ok: true,
            value: {
              token,
              ...(data.expiresAt ? { expiresAt: String(data.expiresAt) } : {}),
            },
          };
        }
      );
    },

    async adminCreateTeacher(
      tokenOrTeacher: string | NewTeacherInput,
      teacherOrName?: NewTeacherInput | string,
      usernameArg?: string,
      passwordArg?: string
    ): Promise<AsResult<true>> {
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
        } else if (typeof teacherOrName === 'string') {
          token = tokenOrTeacher;
          name = teacherOrName;
          username = usernameArg ?? '';
          password = passwordArg ?? '';
        }
      } else if (typeof tokenOrTeacher === 'object' && tokenOrTeacher !== null) {
        token = tokenOrTeacher.token || getAdminToken() || '';
        name = tokenOrTeacher.name;
        username = tokenOrTeacher.username;
        password = tokenOrTeacher.password;
      }
      if (!token) token = getAdminToken() || '';

      return executeAppsScriptRequest(
        trimmedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: JSON.stringify({ action: 'adminCreateTeacher', token, name, username, password }),
          redirect: 'follow',
        },
        fetchFn,
        () => ({ ok: true, value: true })
      );
    },

    async adminListTeachers(token?: string): Promise<AsResult<TeacherAccountInfo[]>> {
      const tok = (token || getAdminToken() || '').trim();
      return executeAppsScriptRequest(
        trimmedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: JSON.stringify({ action: 'adminListTeachers', token: tok }),
          redirect: 'follow',
        },
        fetchFn,
        (data) => {
          const raw = Array.isArray(data.teachers) ? data.teachers : [];
          const teachers: TeacherAccountInfo[] = raw.map((t: any) => ({
            username: String(t.username ?? ''),
            name: String(t.name ?? ''),
            active: t.active === true,
            createdAt: String(t.createdAt ?? ''),
          }));
          return { ok: true, value: teachers };
        }
      );
    },

    async adminResetPassword(
      tokenOrOpts: string | ResetPasswordInput,
      usernameArg?: string,
      passwordArg?: string
    ): Promise<AsResult<true>> {
      let token = '';
      let username = '';
      let password = '';

      if (typeof tokenOrOpts === 'string') {
        if (typeof usernameArg === 'string' && typeof passwordArg === 'string') {
          token = tokenOrOpts;
          username = usernameArg;
          password = passwordArg;
        } else if (typeof usernameArg === 'string' && !passwordArg) {
          token = getAdminToken() || '';
          username = tokenOrOpts;
          password = usernameArg;
        }
      } else if (typeof tokenOrOpts === 'object' && tokenOrOpts !== null) {
        token = tokenOrOpts.token || getAdminToken() || '';
        username = tokenOrOpts.username;
        password = tokenOrOpts.password;
      }
      if (!token) token = getAdminToken() || '';

      return executeAppsScriptRequest(
        trimmedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: JSON.stringify({ action: 'adminResetPassword', token, username, password }),
          redirect: 'follow',
        },
        fetchFn,
        () => ({ ok: true, value: true })
      );
    },

    async adminSetTeacherActive(
      tokenOrOpts: string | SetTeacherActiveInput,
      usernameArg?: string | boolean,
      activeArg?: boolean
    ): Promise<AsResult<true>> {
      let token = '';
      let username = '';
      let active = true;

      if (typeof tokenOrOpts === 'string') {
        if (typeof usernameArg === 'string' && typeof activeArg === 'boolean') {
          token = tokenOrOpts;
          username = usernameArg;
          active = activeArg;
        } else if (typeof usernameArg === 'boolean') {
          token = getAdminToken() || '';
          username = tokenOrOpts;
          active = usernameArg;
        }
      } else if (typeof tokenOrOpts === 'object' && tokenOrOpts !== null) {
        token = tokenOrOpts.token || getAdminToken() || '';
        username = tokenOrOpts.username;
        active = tokenOrOpts.active;
      }
      if (!token) token = getAdminToken() || '';

      return executeAppsScriptRequest(
        trimmedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: JSON.stringify({ action: 'adminSetTeacherActive', token, username, active }),
          redirect: 'follow',
        },
        fetchFn,
        () => ({ ok: true, value: true })
      );
    },

    async adminStats(token?: string): Promise<AsResult<AdminStats>> {
      const tok = (token || getAdminToken() || '').trim();
      return executeAppsScriptRequest(
        trimmedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: JSON.stringify({ action: 'adminStats', token: tok }),
          redirect: 'follow',
        },
        fetchFn,
        (data) => {
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
        }
      );
    },

    teacherLogout(): void {
      clearTeacherToken();
    },

    adminLogout(): void {
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
export function createAppsScriptCollectorPort(
  url: string,
  fetchImpl?: typeof fetch,
  contentType: 'application/json' | 'text/plain;charset=utf-8' = 'text/plain;charset=utf-8'
): AppsScriptCollectorPort {
  const trimmedUrl = (url ?? '').trim();
  const configured = trimmedUrl.length > 0;
  const fetchFn = fetchImpl ?? globalThis.fetch;

  return {
    get configured() {
      return configured;
    },

    async send(final: AttemptRecord, signal: AbortSignal): Promise<unknown> {
      if (!configured) {
        const err = new CollectorError(
          'NOT_CONFIGURED',
          'endpointUrl',
          mapErrorToVietnamese('NOT_CONFIGURED'),
          false
        );
        (err as any).notConfigured = true;
        (err as any).code = 'NOT_CONFIGURED';
        throw err;
      }

      if (signal.aborted) {
        throw new CollectorError(
          'COLLECTOR_TIMEOUT',
          'signal',
          mapErrorToVietnamese('COLLECTOR_TIMEOUT'),
          true
        );
      }

      const basePayload = buildWebResultPayload(final);
      const scoreDTO = (basePayload.scoreDTO ?? resolveScoreDTO(final)) as Record<string, unknown> | null;
      const payloadHash = computePayloadHash(final);
      const durationSeconds = basePayload.durationSeconds;

      let classCode =
        (final as any).class_code ??
        (final as any).classCode ??
        (final as any).metadata?.class_code ??
        (final as any).metadata?.classCode ??
        basePayload.class_code;
      let assignmentId =
        (final as any).assignment_id ??
        (final as any).assignmentId ??
        (final as any).metadata?.assignment_id ??
        (final as any).metadata?.assignmentId ??
        basePayload.assignment_id;
      let studentId =
        (final as any).student_id ??
        (final as any).studentId ??
        (final as any).metadata?.student_id ??
        (final as any).metadata?.studentId ??
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

      let response: Response;
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
      } catch (err: any) {
        if (
          signal.aborted ||
          err?.name === 'AbortError' ||
          err?.name === 'TimeoutError' ||
          err?.code === 'COLLECTOR_TIMEOUT'
        ) {
          throw new CollectorError(
            'COLLECTOR_TIMEOUT',
            'transport',
            mapErrorToVietnamese('COLLECTOR_TIMEOUT'),
            true
          );
        }
        throw new CollectorError(
          'COLLECTOR_NETWORK',
          'transport',
          mapErrorToVietnamese('COLLECTOR_NETWORK', `Lỗi mạng khi gửi kết quả: ${err?.message || String(err)}`),
          true
        );
      }

      if (response.type === 'opaque' || response.status === 0) {
        throw new CollectorError(
          'COLLECTOR_HTTP',
          'response',
          'Opaque response nhận được; không thể xác minh receipt',
          false,
          0
        );
      }

      if (!response.ok) {
        const is4xx = response.status >= 400 && response.status < 500;
        throw new CollectorError(
          'COLLECTOR_HTTP',
          'response',
          `Lỗi HTTP ${response.status}: ${response.statusText}`,
          !is4xx,
          response.status
        );
      }

      let text: string;
      try {
        text = await response.text();
      } catch (err: any) {
        throw new CollectorError(
          'COLLECTOR_NETWORK',
          'response',
          `Không thể đọc nội dung phản hồi: ${err?.message || String(err)}`,
          true
        );
      }

      let raw: any;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new CollectorError(
          'BAD_RESPONSE',
          'response',
          mapErrorToVietnamese('BAD_RESPONSE'),
          false
        );
      }

      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new CollectorError(
          'BAD_RESPONSE',
          'response',
          mapErrorToVietnamese('BAD_RESPONSE'),
          false
        );
      }

      if (raw.error === 'SERVER_BUSY' || raw.status === 503) {
        throw new CollectorError(
          'COLLECTOR_HTTP',
          'response',
          mapErrorToVietnamese('SERVER_BUSY', raw.message),
          true,
          503
        );
      }

      if (raw.error === 'PAYLOAD_CONFLICT' || raw.status === 409) {
        throw new CollectorError(
          'PAYLOAD_CONFLICT',
          'response',
          mapErrorToVietnamese('PAYLOAD_CONFLICT', raw.message),
          false,
          409
        );
      }

      if (raw.error === 'NOT_OPEN') {
        throw new CollectorError(
          'NOT_OPEN',
          'response',
          mapErrorToVietnamese('NOT_OPEN', raw.message),
          false
        );
      }

      if (raw.error === 'PAST_DUE') {
        throw new CollectorError(
          'PAST_DUE',
          'response',
          mapErrorToVietnamese('PAST_DUE', raw.message),
          false
        );
      }

      if (raw.error === 'SERVER_ERROR' || (typeof raw.status === 'number' && raw.status >= 500)) {
        throw new CollectorError(
          'COLLECTOR_HTTP',
          'response',
          mapErrorToVietnamese('SERVER_ERROR', raw.message || 'Lỗi máy chủ'),
          true,
          typeof raw.status === 'number' ? raw.status : 500
        );
      }

      if (raw.success === false) {
        const is4xx = typeof raw.status === 'number' && raw.status >= 400 && raw.status < 500;
        const errCode = typeof raw.error === 'string' && raw.error ? raw.error : 'COLLECTOR_HTTP';
        const mappedMessage = mapErrorToVietnamese(errCode, raw.message);
        throw new CollectorError(
          errCode,
          'response',
          mappedMessage,
          !is4xx && errCode !== 'NOT_OPEN' && errCode !== 'PAST_DUE' && errCode !== 'PAYLOAD_CONFLICT',
          typeof raw.status === 'number' ? raw.status : undefined
        );
      }

      if (raw.success !== true) {
        throw new CollectorError(
          'BAD_RESPONSE',
          'response',
          mapErrorToVietnamese('BAD_RESPONSE', typeof raw.message === 'string' ? raw.message : undefined),
          false
        );
      }

      const serverAttemptId =
        typeof raw.attempt_id === 'string' && raw.attempt_id.trim()
          ? raw.attempt_id.trim()
          : typeof raw.attemptId === 'string' && raw.attemptId.trim()
            ? raw.attemptId.trim()
            : null;

      if (!serverAttemptId) {
        throw new CollectorError(
          'RECEIPT_INVALID',
          'attempt_id',
          mapErrorToVietnamese('RECEIPT_INVALID', 'Phản hồi thiếu attempt_id'),
          false
        );
      }

      if (serverAttemptId !== final.attemptId) {
        throw new CollectorError(
          'RECEIPT_INVALID',
          'attempt_id',
          mapErrorToVietnamese('RECEIPT_INVALID', 'attempt_id phản hồi không khớp lượt nộp'),
          false
        );
      }

      const serverExamId =
        typeof raw.exam_id === 'string' && raw.exam_id.trim()
          ? raw.exam_id.trim()
          : typeof raw.examId === 'string' && raw.examId.trim()
            ? raw.examId.trim()
            : null;
      if (serverExamId && serverExamId !== final.examId) {
        throw new CollectorError(
          'RECEIPT_INVALID',
          'exam_id',
          mapErrorToVietnamese('RECEIPT_INVALID', 'exam_id phản hồi không khớp'),
          false
        );
      }

      const serverExamVersionId =
        typeof raw.exam_version_id === 'string' && raw.exam_version_id.trim()
          ? raw.exam_version_id.trim()
          : typeof raw.examVersionId === 'string' && raw.examVersionId.trim()
            ? raw.examVersionId.trim()
            : null;
      if (serverExamVersionId && serverExamVersionId !== final.examVersionId) {
        throw new CollectorError(
          'RECEIPT_INVALID',
          'exam_version_id',
          mapErrorToVietnamese('RECEIPT_INVALID', 'exam_version_id phản hồi không khớp'),
          false
        );
      }

      const expectedPayloadHash = computePayloadHash(final);
      const serverPayloadHash =
        typeof raw.payload_hash === 'string' && raw.payload_hash.trim()
          ? raw.payload_hash.trim()
          : typeof raw.payloadHash === 'string' && raw.payloadHash.trim()
            ? raw.payloadHash.trim()
            : null;
      if (serverPayloadHash && serverPayloadHash !== expectedPayloadHash) {
        throw new CollectorError(
          'PAYLOAD_CONFLICT',
          'payloadHash',
          mapErrorToVietnamese('PAYLOAD_CONFLICT', 'payloadHash phản hồi không khớp'),
          false,
          409
        );
      }

      const rawStatus = typeof raw.status === 'string' ? raw.status.trim().toUpperCase() : '';
      let normalizedStatus: 'recorded' | 'already_recorded';
      if (rawStatus === 'ALREADY_RECORDED') {
        normalizedStatus = 'already_recorded';
      } else if (rawStatus === 'NEWLY_RECORDED' || rawStatus === 'RECORDED') {
        normalizedStatus = 'recorded';
      } else {
        throw new CollectorError(
          'RECEIPT_INVALID',
          'status',
          mapErrorToVietnamese('RECEIPT_INVALID', 'Trạng thái phản hồi không hợp lệ'),
          false
        );
      }

      const receivedAt =
        typeof raw.recorded_at === 'string' && raw.recorded_at.trim() && !isNaN(Date.parse(raw.recorded_at))
          ? raw.recorded_at.trim()
          : typeof raw.receivedAt === 'string' && raw.receivedAt.trim() && !isNaN(Date.parse(raw.receivedAt))
            ? raw.receivedAt.trim()
            : null;

      if (!receivedAt) {
        throw new CollectorError(
          'RECEIPT_INVALID',
          'recorded_at',
          mapErrorToVietnamese('RECEIPT_INVALID', 'Thiếu hoặc sai thời gian máy chủ ghi nhận'),
          false
        );
      }

      const submissionId =
        typeof raw.submissionId === 'string' && raw.submissionId.trim()
          ? raw.submissionId.trim()
          : typeof raw.submission_id === 'string' && raw.submission_id.trim()
            ? raw.submission_id.trim()
            : serverAttemptId;

      const receipt: Receipt = {
        examId: final.examId,
        examVersionId: final.examVersionId,
        attemptId: serverAttemptId,
        payloadHash: serverPayloadHash || expectedPayloadHash,
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
