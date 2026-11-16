import type { AttemptRecord, CollectorPort, Receipt } from './types.ts';
import { CollectorError, computePayloadHash } from './index.ts';
import { buildWebResultPayload, resolveScoreDTO } from './export.ts';

/**
 * Cấu hình ứng dụng đọc từ public/config.json.
 * appsScriptUrl: '' nghĩa là chưa cấu hình (chưa triển khai).
 */
export interface AppConfig {
  appsScriptUrl: string;
}

/**
 * Nạp cấu hình ứng dụng từ đường dẫn tương đối 'public/config.json'.
 * Nếu có lỗi mạng, mã HTTP lỗi, JSON hỏng hoặc thiếu trường -> trả về { appsScriptUrl: '' }.
 */
export async function loadAppConfig(fetchImpl?: typeof fetch): Promise<AppConfig> {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    return { appsScriptUrl: '' };
  }
  try {
    const res = await fetchFn('public/config.json');
    if (!res || !res.ok) {
      return { appsScriptUrl: '' };
    }
    const data = await res.json();
    if (data && typeof data === 'object' && typeof (data as any).appsScriptUrl === 'string') {
      return { appsScriptUrl: (data as any).appsScriptUrl.trim() };
    }
    return { appsScriptUrl: '' };
  } catch {
    return { appsScriptUrl: '' };
  }
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
}

/**
 * Kiểu kết quả trả về của AppsScriptClient theo hợp đồng WEB mục 18.1.
 */
export type AsResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string; details?: unknown };

/**
 * Giao diện client giao tiếp với Google Apps Script.
 */
export interface AppsScriptClient {
  readonly configured: boolean;
  listExams(): Promise<AsResult<PublishedExamMeta[]>>;
  getExam(id: string): Promise<AsResult<unknown>>;
  teacherLogin(password: string): Promise<AsResult<true>>;
  publishExam(password: string, exam: unknown): Promise<AsResult<{ examId: string; revision: number }>>;
  unpublishExam(password: string, examId: string): Promise<AsResult<true>>;
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
async function executeAppsScriptRequest<T>(
  url: string,
  init: RequestInit,
  fetchFn: typeof fetch,
  transform: (data: any) => AsResult<T>
): Promise<AsResult<T>> {
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
          message: 'Hết thời gian chờ kết nối máy chủ Apps Script (15s)',
        };
      }
      return {
        ok: false,
        code: 'NETWORK',
        message: `Lỗi kết nối mạng: ${err?.message || String(err)}`,
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
        message: 'Phản hồi từ máy chủ không phải JSON hợp lệ',
      };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        code: 'BAD_RESPONSE',
        message: 'Phản hồi từ máy chủ không đúng định dạng',
      };
    }

    if (parsed.success === false) {
      const code = typeof parsed.error === 'string' && parsed.error ? parsed.error : 'SERVER_ERROR';
      const message = typeof parsed.message === 'string' && parsed.message ? parsed.message : 'Yêu cầu không thành công';
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
        message: 'Phản hồi thiếu trường success hợp lệ',
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
 * - GET: đọc danh sách / đọc chi tiết đề.
 * - POST: text/plain;charset=utf-8, mật khẩu trong body, redirect: 'follow', timeout: 15s.
 */
export function createAppsScriptClient(
  url: string,
  fetchImpl?: typeof fetch
): AppsScriptClient {
  const trimmedUrl = (url ?? '').trim();
  const configured = trimmedUrl.length > 0;
  const fetchFn = fetchImpl ?? globalThis.fetch;

  if (!configured) {
    const notConfiguredResult = <T>(): AsResult<T> => ({
      ok: false,
      code: 'NOT_CONFIGURED',
      message: 'Apps Script URL chưa được cấu hình',
    });

    return {
      configured: false,
      async listExams(): Promise<AsResult<PublishedExamMeta[]>> {
        return notConfiguredResult();
      },
      async getExam(_id: string): Promise<AsResult<unknown>> {
        return notConfiguredResult();
      },
      async teacherLogin(_password: string): Promise<AsResult<true>> {
        return notConfiguredResult();
      },
      async publishExam(_password: string, _exam: unknown): Promise<AsResult<{ examId: string; revision: number }>> {
        return notConfiguredResult();
      },
      async unpublishExam(_password: string, _examId: string): Promise<AsResult<true>> {
        return notConfiguredResult();
      },
    };
  }

  return {
    configured: true,

    async listExams(): Promise<AsResult<PublishedExamMeta[]>> {
      const getUrl = buildGetUrl(trimmedUrl, { action: 'listExams' });
      return executeAppsScriptRequest(
        getUrl,
        { method: 'GET', redirect: 'follow' },
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
          }));
          return { ok: true, value: exams };
        }
      );
    },

    async getExam(id: string): Promise<AsResult<unknown>> {
      const getUrl = buildGetUrl(trimmedUrl, { action: 'getExam', id });
      return executeAppsScriptRequest(
        getUrl,
        { method: 'GET', redirect: 'follow' },
        fetchFn,
        (data) => ({
          ok: true,
          value: data.exam !== undefined ? data.exam : data,
        })
      );
    },

    async teacherLogin(password: string): Promise<AsResult<true>> {
      return executeAppsScriptRequest(
        trimmedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'teacherLogin', password }),
          redirect: 'follow',
        },
        fetchFn,
        () => ({ ok: true, value: true })
      );
    },

    async publishExam(
      password: string,
      exam: unknown
    ): Promise<AsResult<{ examId: string; revision: number }>> {
      return executeAppsScriptRequest(
        trimmedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'publishExam', password, exam }),
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

    async unpublishExam(password: string, examId: string): Promise<AsResult<true>> {
      return executeAppsScriptRequest(
        trimmedUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'unpublishExam', password, examId }),
          redirect: 'follow',
        },
        fetchFn,
        () => ({ ok: true, value: true })
      );
    },
  };
}

/**
 * Khởi tạo CollectorPort nộp kết quả bài thi tới Apps Script, tương thích với Outbox hiện có.
 * - url rỗng: configured = false, ném lỗi NOT_CONFIGURED ngay khi send được gọi mà không gọi fetch.
 * - POST text/plain;charset=utf-8, payload chuẩn buildWebResultPayload kèm các trường bắt buộc của Code.js.
 * - Khi server trả success: true (NEWLY_RECORDED hoặc ALREADY_RECORDED), trả về receipt hợp lệ
 *   khớp với validateReceipt trong outbox state machine.
 */
export function createAppsScriptCollectorPort(
  url: string,
  fetchImpl?: typeof fetch
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
          'Apps Script URL chưa được cấu hình',
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
          'Yêu cầu gửi kết quả bị hủy hoặc hết thời gian chờ',
          true
        );
      }

      const basePayload = buildWebResultPayload(final);
      const scoreDTO = (basePayload.scoreDTO ?? resolveScoreDTO(final)) as Record<string, unknown> | null;
      const payloadHash = computePayloadHash(final);
      const durationSeconds = basePayload.durationSeconds;

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
      };

      let response: Response;
      try {
        response = await fetchFn(trimmedUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
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
            'Yêu cầu gửi kết quả bị hủy hoặc hết thời gian chờ',
            true
          );
        }
        throw new CollectorError(
          'COLLECTOR_NETWORK',
          'transport',
          `Lỗi mạng khi gửi kết quả: ${err?.message || String(err)}`,
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
          'Phản hồi từ máy chủ không phải JSON hợp lệ',
          false
        );
      }

      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new CollectorError(
          'BAD_RESPONSE',
          'response',
          'Phản hồi từ máy chủ không đúng định dạng',
          false
        );
      }

      if (raw.error === 'SERVER_BUSY' || raw.status === 503) {
        throw new CollectorError(
          'COLLECTOR_HTTP',
          'response',
          String(raw.message || 'Máy chủ bận, thử lại sau'),
          true,
          503
        );
      }

      if (raw.error === 'PAYLOAD_CONFLICT' || raw.status === 409) {
        throw new CollectorError(
          'PAYLOAD_CONFLICT',
          'response',
          String(raw.message || 'Xung đột dữ liệu kết quả'),
          false,
          409
        );
      }

      if (raw.error === 'SERVER_ERROR' || (typeof raw.status === 'number' && raw.status >= 500)) {
        throw new CollectorError(
          'COLLECTOR_HTTP',
          'response',
          String(raw.message || 'Lỗi máy chủ'),
          true,
          typeof raw.status === 'number' ? raw.status : 500
        );
      }

      if (raw.success === false) {
        const is4xx = typeof raw.status === 'number' && raw.status >= 400 && raw.status < 500;
        const errCode = typeof raw.error === 'string' && raw.error ? raw.error : 'COLLECTOR_HTTP';
        throw new CollectorError(
          errCode,
          'response',
          String(raw.message || 'Lỗi từ máy chủ Apps Script'),
          !is4xx,
          typeof raw.status === 'number' ? raw.status : undefined
        );
      }

      const rawStatus = String(raw.status || '').toUpperCase();
      const normalizedStatus: 'recorded' | 'already_recorded' =
        rawStatus === 'ALREADY_RECORDED'
          ? 'already_recorded'
          : 'recorded';

      const receivedAt =
        typeof raw.recorded_at === 'string' && raw.recorded_at.trim() && !isNaN(Date.parse(raw.recorded_at))
          ? raw.recorded_at.trim()
          : typeof raw.receivedAt === 'string' && raw.receivedAt.trim() && !isNaN(Date.parse(raw.receivedAt))
            ? raw.receivedAt.trim()
            : new Date().toISOString();

      const submissionId =
        typeof raw.submissionId === 'string' && raw.submissionId.trim()
          ? raw.submissionId.trim()
          : typeof raw.submission_id === 'string' && raw.submission_id.trim()
            ? raw.submission_id.trim()
            : typeof raw.attempt_id === 'string' && raw.attempt_id.trim()
              ? raw.attempt_id.trim()
              : final.attemptId;

      const receipt: Receipt = {
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
