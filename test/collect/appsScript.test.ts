import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type {
  AttemptKey,
  AttemptRecord,
  OutboxRecord,
  StoragePort,
  WebExam,
  Result,
} from '../../src/collect/types.ts';

import {
  loadAppConfig,
  createAppsScriptClient,
  createAppsScriptCollectorPort,
  TEACHER_TOKEN_STORAGE_KEY,
  ADMIN_TOKEN_STORAGE_KEY,
  LEGACY_TEACHER_PW_STORAGE_KEY,
  getTeacherToken,
  setTeacherToken,
  clearTeacherToken,
  getAdminToken,
  setAdminToken,
  clearAdminToken,
  teacherLogout,
  adminLogout,
  ERROR_MESSAGES_VI,
  mapErrorToVietnamese,
  enqueue,
  drainOutbox,
  validateReceipt,
  CollectorError,
  type AsResult,
} from '../../src/collect/index.ts';

class MockSessionStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const mockSession = new MockSessionStorage();
(globalThis as any).sessionStorage = mockSession;

function assertAsOk<T>(res: AsResult<T>): T {
  assert.equal(res.ok, true, !res.ok ? res.message : '');
  if (!res.ok) throw new Error('Expected AsResult ok: true');
  return res.value;
}

function assertAsErr<T>(res: AsResult<T>, expectedCode?: string): { code: string; message: string; details?: unknown } {
  assert.equal(res.ok, false, res.ok ? 'Expected AsResult ok: false' : '');
  if (res.ok) throw new Error('Expected AsResult ok: false');
  if (expectedCode) {
    assert.equal(res.code, expectedCode);
  }
  return res;
}

function assertResultOk<T>(res: Result<T>): T {
  assert.equal(res.ok, true, !res.ok ? (res as any).error?.message : '');
  if (!res.ok) throw new Error('Expected Result ok: true');
  return res.value;
}

function createDummyExam(): WebExam {
  return {
    schemaVersion: 'web-exam-v1',
    examId: 'exam-sample-01',
    examVersionId: 'v1.0.0',
    title: 'Đề thi thử nghiệm',
    subject: 'Vật lí',
    grade: 12,
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
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
        questionVersionId: 'q-01',
        title: 'Câu 1',
        content: 'Nội dung câu 1',
        options: [
          { optionId: 'opt-a', text: 'A' },
          { optionId: 'opt-b', text: 'B' },
          { optionId: 'opt-c', text: 'C' },
          { optionId: 'opt-d', text: 'D' },
        ],
        correctOptionId: 'opt-a',
      },
    ],
    assets: [],
  };
}

function createSampleAttempt(attemptId = 'att-gas-01'): AttemptRecord {
  return {
    schemaVersion: 'web-attempt-v1',
    examId: 'exam-sample-01',
    examVersionId: 'v1.0.0',
    attemptId,
    revision: 1,
    candidateName: 'Trần Văn Thi',
    examSnapshot: createDummyExam(),
    presentationOrder: {
      seed: 'seed-01',
      questionOrder: ['q-01'],
      optionOrder: [{ questionVersionId: 'q-01', optionIds: ['opt-a', 'opt-b', 'opt-c', 'opt-d'] }],
    },
    responses: {
      attemptId,
      examVersionId: 'v1.0.0',
      responses: [{ kind: 'I', questionVersionId: 'q-01', selectedOptionId: 'opt-a' }],
    },
    startedAt: 1700000000000,
    deadline: 1700003000000,
    phase: 'final',
    submittedAt: 1700002500000,
    scoreDTO: {
      ruleSetId: 'custom-v1',
      total: '1/4',
      maxTotal: '1/4',
      sections: {
        I: { score: '1/4', max: '1/4' },
        II: { score: '0', max: '0' },
        III: { score: '0', max: '0' },
      },
    },
  };
}

class InMemoryStorage implements StoragePort {
  attempts = new Map<string, AttemptRecord>();
  outbox = new Map<string, OutboxRecord>();

  private keyStr(k: AttemptKey): string {
    return `${k.examId}::${k.examVersionId}::${k.attemptId}`;
  }

  async load(key: AttemptKey): Promise<Result<AttemptRecord | null>> {
    const rec = this.attempts.get(this.keyStr(key)) ?? null;
    return { ok: true, value: rec ? JSON.parse(JSON.stringify(rec)) : null };
  }

  async create(record: AttemptRecord): Promise<Result<AttemptRecord>> {
    this.attempts.set(this.keyStr(record), JSON.parse(JSON.stringify(record)));
    return { ok: true, value: record };
  }

  async saveDraft(record: AttemptRecord): Promise<Result<AttemptRecord>> {
    this.attempts.set(this.keyStr(record), JSON.parse(JSON.stringify(record)));
    return { ok: true, value: record };
  }

  async finalize(record: AttemptRecord): Promise<Result<AttemptRecord>> {
    this.attempts.set(this.keyStr(record), JSON.parse(JSON.stringify(record)));
    return { ok: true, value: record };
  }

  async listAttempts(): Promise<Result<readonly AttemptRecord[]>> {
    return { ok: true, value: Array.from(this.attempts.values()) };
  }

  async getObject(): Promise<Result<unknown | null>> {
    return { ok: true, value: null };
  }

  async putObject(): Promise<Result<number>> {
    return { ok: true, value: 1 };
  }

  async deleteObject(): Promise<Result<void>> {
    return { ok: true, value: undefined };
  }

  async getOutbox(key: AttemptKey): Promise<Result<OutboxRecord | null>> {
    const ob = this.outbox.get(this.keyStr(key)) ?? null;
    return { ok: true, value: ob ? JSON.parse(JSON.stringify(ob)) : null };
  }

  async updateOutbox(value: OutboxRecord): Promise<Result<OutboxRecord>> {
    this.outbox.set(this.keyStr(value), JSON.parse(JSON.stringify(value)));
    return { ok: true, value };
  }

  async exportBackup(): Promise<Result<Blob>> {
    return { ok: true, value: new Blob([]) };
  }

  async importBackup(): Promise<Result<void>> {
    return { ok: true, value: undefined };
  }

  async clearAll(): Promise<Result<void>> {
    this.attempts.clear();
    this.outbox.clear();
    return { ok: true, value: undefined };
  }
}

describe('Apps Script Client & Collector Port (src/collect/appsScript.ts)', () => {
  describe('loadAppConfig', () => {
    it('returns appsScriptUrl when public/config.json is successfully fetched and valid', async () => {
      let passedInit: RequestInit | undefined;
      const fakeFetch: typeof fetch = async (input, init) => {
        assert.equal(String(input), 'public/config.json');
        passedInit = init;
        return new Response(JSON.stringify({ appsScriptUrl: 'https://script.google.com/macros/s/xyz/exec' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const cfg = await loadAppConfig(fakeFetch);
      assert.deepEqual(cfg, { appsScriptUrl: 'https://script.google.com/macros/s/xyz/exec' });
      assert.equal(passedInit?.cache, 'no-store', 'loadAppConfig must fetch with cache: "no-store" (17.6)');
    });

    it('trims whitespace in appsScriptUrl', async () => {
      const fakeFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ appsScriptUrl: '  https://script.google.com/macros/s/xyz/exec  ' }), {
          status: 200,
        });
      };

      const cfg = await loadAppConfig(fakeFetch);
      assert.equal(cfg.appsScriptUrl, 'https://script.google.com/macros/s/xyz/exec');
    });

    it('returns empty string when config file is missing (404) or fetch throws network error', async () => {
      const notFoundFetch: typeof fetch = async () => new Response('Not found', { status: 404 });
      assert.deepEqual(await loadAppConfig(notFoundFetch), { appsScriptUrl: '' });

      const netErrorFetch: typeof fetch = async () => {
        throw new TypeError('Failed to fetch');
      };
      assert.deepEqual(await loadAppConfig(netErrorFetch), { appsScriptUrl: '' });
    });

    it('returns empty string when json is malformed or appsScriptUrl is not a string', async () => {
      const badJsonFetch: typeof fetch = async () => new Response('{invalid json', { status: 200 });
      assert.deepEqual(await loadAppConfig(badJsonFetch), { appsScriptUrl: '' });

      const notStringFetch: typeof fetch = async () => new Response(JSON.stringify({ appsScriptUrl: 12345 }), { status: 200 });
      assert.deepEqual(await loadAppConfig(notStringFetch), { appsScriptUrl: '' });

      const emptyObjFetch: typeof fetch = async () => new Response(JSON.stringify({}), { status: 200 });
      assert.deepEqual(await loadAppConfig(emptyObjFetch), { appsScriptUrl: '' });
    });
  });

  describe('createAppsScriptClient — Unconfigured State', () => {
    it('sets configured=false and returns NOT_CONFIGURED immediately for all methods without calling fetch', async () => {
      let fetchCalled = false;
      const fakeFetch: typeof fetch = async () => {
        fetchCalled = true;
        throw new Error('Should not be called');
      };

      for (const emptyUrl of ['', '   ', undefined as any, null as any]) {
        const client = createAppsScriptClient(emptyUrl, fakeFetch);
        assert.equal(client.configured, false);

        const rList = await client.listExams();
        assertAsErr(rList, 'NOT_CONFIGURED');

        const rGet = await client.getExam('some-id');
        assertAsErr(rGet, 'NOT_CONFIGURED');

        const rClass = await client.getClass('12A1');
        assertAsErr(rClass, 'NOT_CONFIGURED');

        const rLogin1 = await client.teacherLogin('pass');
        assertAsErr(rLogin1, 'NOT_CONFIGURED');

        const rLogin2 = await client.teacherLogin('teacher1', 'pass');
        assertAsErr(rLogin2, 'NOT_CONFIGURED');

        const rPub = await client.publishExam('pass', {});
        assertAsErr(rPub, 'NOT_CONFIGURED');

        const rUnpub = await client.unpublishExam('pass', 'some-id');
        assertAsErr(rUnpub, 'NOT_CONFIGURED');

        const rCreateCls = await client.createClass('12A1');
        assertAsErr(rCreateCls, 'NOT_CONFIGURED');

        const rMyClasses = await client.listMyClasses();
        assertAsErr(rMyClasses, 'NOT_CONFIGURED');

        const rAssign = await client.assignExam('cls-1', 'ex-1', '2026-11-16T10:00:00Z', '2026-11-16T12:00:00Z');
        assertAsErr(rAssign, 'NOT_CONFIGURED');

        const rListAssign = await client.listAssignments('cls-1');
        assertAsErr(rListAssign, 'NOT_CONFIGURED');

        const rListRes = await client.listResults('cls-1');
        assertAsErr(rListRes, 'NOT_CONFIGURED');

        const rAdminLogin = await client.adminLogin('adminpass');
        assertAsErr(rAdminLogin, 'NOT_CONFIGURED');

        const rAdminCreate = await client.adminCreateTeacher('tok', 'Teacher Name', 'teacher_user', 'password123');
        assertAsErr(rAdminCreate, 'NOT_CONFIGURED');

        const rAdminList = await client.adminListTeachers();
        assertAsErr(rAdminList, 'NOT_CONFIGURED');

        const rAdminReset = await client.adminResetPassword('teacher_user', 'newpassword123');
        assertAsErr(rAdminReset, 'NOT_CONFIGURED');

        const rAdminActive = await client.adminSetTeacherActive('teacher_user', false);
        assertAsErr(rAdminActive, 'NOT_CONFIGURED');

        const rAdminStats = await client.adminStats();
        assertAsErr(rAdminStats, 'NOT_CONFIGURED');

        // Logout helpers must run safely without throwing
        client.teacherLogout();
        client.adminLogout();

        assert.equal(fetchCalled, false, 'Fetch must never be called when unconfigured');
      }
    });
  });

  describe('createAppsScriptClient — Configured State (GET & POST)', () => {
    const BASE_URL = 'https://script.google.com/macros/s/xyz/exec';

    it('listExams performs GET ?action=listExams with redirect:follow and maps PublishedExamMeta[]', async () => {
      const recordedCalls: { url: string; init?: RequestInit }[] = [];
      const fakeFetch: typeof fetch = async (url, init) => {
        recordedCalls.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            success: true,
            exams: [
              {
                id: 'exam-gv-01',
                title: 'Đề kiểm tra 15 phút',
                subject: 'Vật lí',
                grade: 12,
                durationMinutes: 15,
                questionCount: 10,
                group: 'Vật lí 12',
                revision: 1,
                updatedAt: '2026-11-16T08:00:00.000Z',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      assert.equal(client.configured, true);

      const res = await client.listExams();
      const list = assertAsOk(res);
      assert.equal(list.length, 1);
      assert.equal(list[0]?.id, 'exam-gv-01');
      assert.equal(list[0]?.title, 'Đề kiểm tra 15 phút');
      assert.equal(list[0]?.revision, 1);

      assert.equal(recordedCalls.length, 1);
      assert.equal(recordedCalls[0]?.url, `${BASE_URL}?action=listExams`);
      assert.equal(recordedCalls[0]?.init?.method, 'GET');
      assert.equal(recordedCalls[0]?.init?.redirect, 'follow');
    });

    it('listExams handles URLs that already contain query parameters properly', async () => {
      let requestUrl = '';
      const fakeFetch: typeof fetch = async (url) => {
        requestUrl = String(url);
        return new Response(JSON.stringify({ success: true, exams: [] }), { status: 200 });
      };

      const client = createAppsScriptClient('https://script.google.com/exec?env=test', fakeFetch);
      await client.listExams();
      assert.equal(requestUrl, 'https://script.google.com/exec?env=test&action=listExams');
    });

    it('getExam performs GET ?action=getExam&id=<id> and returns exam payload', async () => {
      const recordedCalls: { url: string; init?: RequestInit }[] = [];
      const dummyExam = createDummyExam();
      const fakeFetch: typeof fetch = async (url, init) => {
        recordedCalls.push({ url: String(url), init });
        return new Response(JSON.stringify({ success: true, exam: dummyExam }), { status: 200 });
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.getExam('exam-sample-01');
      const examVal = assertAsOk(res);
      assert.deepEqual(examVal, dummyExam);

      assert.equal(recordedCalls[0]?.url, `${BASE_URL}?action=getExam&id=exam-sample-01`);
      assert.equal(recordedCalls[0]?.init?.method, 'GET');
    });

    it('getExam maps NOT_FOUND error when exam does not exist', async () => {
      const fakeFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Không tìm thấy đề' }), {
          status: 200,
        });
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.getExam('non-existent');
      const err = assertAsErr(res, 'NOT_FOUND');
      assert.equal(err.message, 'Không tìm thấy đề');
    });

    it('getExam preserves server error and does NOT fall back to static exam manifest (CK32-F03 regression)', async () => {
      let staticManifestRequested = false;
      const fakeFetch: typeof fetch = async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('action=getExam')) {
          return new Response(JSON.stringify({ success: false, error: 'INTERNAL_ERROR', message: 'temporary outage' }), { status: 200 });
        }
        if (urlStr.includes('public/exams/index.json')) {
          staticManifestRequested = true;
          return new Response(JSON.stringify({
            version: 1,
            exams: [
              { id: 'shared-static-exam-01', url: 'public/exams/shared-static.json' },
            ],
          }), { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.getExam('shared-static-exam-01');
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.code, 'INTERNAL_ERROR');
        assert.equal(res.message, 'temporary outage');
      }
      assert.equal(staticManifestRequested, false, 'client.getExam must not silently fetch public/exams/index.json on server error');
    });

    it('teacherLogin performs POST with text/plain, password in body, never in URL', async () => {
      const PW = 'SecretTeacherPassword#123';
      const recordedCalls: { url: string; init?: RequestInit }[] = [];
      const fakeFetch: typeof fetch = async (url, init) => {
        recordedCalls.push({ url: String(url), init });
        const body = JSON.parse(String(init?.body));
        if (body.password === PW) {
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Sai mật khẩu' }), {
          status: 200,
        });
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);

      // Successful login
      const okRes = await client.teacherLogin(PW);
      const val = assertAsOk(okRes);
      assert.equal(val, true);

      assert.equal(recordedCalls.length, 1);
      assert.equal(recordedCalls[0]?.init?.method, 'POST');
      assert.equal(
        (recordedCalls[0]?.init?.headers as Record<string, string>)['Content-Type'],
        'text/plain;charset=utf-8'
      );
      assert.equal(recordedCalls[0]?.url.includes(PW), false, 'Password must NEVER be in URL');
      assert.equal(String(recordedCalls[0]?.init?.body).includes(PW), true, 'Password must be in POST body');

      // Failed login
      const failRes = await client.teacherLogin('wrong-password');
      assertAsErr(failRes, 'UNAUTHORIZED');
      assert.ok(!JSON.stringify(failRes).includes('wrong-password'), 'Password must not be in error object');
    });

    it('publishExam sends POST text/plain with exam and returns { examId, revision }', async () => {
      const exam = createDummyExam();
      const recordedCalls: { url: string; init?: RequestInit }[] = [];
      const fakeFetch: typeof fetch = async (url, init) => {
        recordedCalls.push({ url: String(url), init });
        return new Response(JSON.stringify({ success: true, examId: 'exam-sample-01', revision: 3 }), {
          status: 200,
        });
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.publishExam('mypass', exam);
      const val = assertAsOk(res);
      assert.deepEqual(val, { examId: 'exam-sample-01', revision: 3 });

      assert.equal(recordedCalls[0]?.init?.method, 'POST');
      const body = JSON.parse(String(recordedCalls[0]?.init?.body));
      assert.equal(body.action, 'publishExam');
      assert.equal(body.password, 'mypass');
      assert.deepEqual(body.exam, exam);
    });

    it('publishExam captures validation errors details (INVALID_EXAM)', async () => {
      const fakeFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'INVALID_EXAM',
            message: 'Đề thi không hợp lệ',
            errors: ['Câu 1 thiếu đáp án'],
          }),
          { status: 200 }
        );
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.publishExam('mypass', {});
      const err = assertAsErr(res, 'INVALID_EXAM');
      assert.deepEqual(err.details, ['Câu 1 thiếu đáp án']);
    });

    it('unpublishExam sends POST text/plain with examId and returns true', async () => {
      const recordedCalls: { url: string; init?: RequestInit }[] = [];
      const fakeFetch: typeof fetch = async (url, init) => {
        recordedCalls.push({ url: String(url), init });
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.unpublishExam('mypass', 'exam-sample-01');
      const val = assertAsOk(res);
      assert.equal(val, true);
      const body = JSON.parse(String(recordedCalls[0]?.init?.body));
      assert.equal(body.action, 'unpublishExam');
      assert.equal(body.examId, 'exam-sample-01');
    });
  });

  describe('createAppsScriptClient — Error Mapping & Network Safeguards', () => {
    const BASE_URL = 'https://script.google.com/macros/s/xyz/exec';

    it('maps network fetch failure to NETWORK', async () => {
      const fakeFetch: typeof fetch = async () => {
        throw new TypeError('Failed to fetch');
      };
      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.listExams();
      const err = assertAsErr(res, 'NETWORK');
      assert.match(err.message, /kết nối mạng/i);
    });

    it('maps timeout / abort to NETWORK', async () => {
      const fakeFetch: typeof fetch = async () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      };
      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.getExam('ex-1');
      assertAsErr(res, 'NETWORK');
    });

    it('maps HTTP errors to HTTP_<status>', async () => {
      const fakeFetch500: typeof fetch = async () => new Response('Internal error', { status: 500, statusText: 'Internal Server Error' });
      const client500 = createAppsScriptClient(BASE_URL, fakeFetch500);
      const res500 = await client500.listExams();
      assertAsErr(res500, 'HTTP_500');

      const fakeFetch404: typeof fetch = async () => new Response('Not found', { status: 404, statusText: 'Not Found' });
      const client404 = createAppsScriptClient(BASE_URL, fakeFetch404);
      const res404 = await client404.listExams();
      assertAsErr(res404, 'HTTP_404');
    });

    it('maps non-JSON or HTML response to BAD_RESPONSE', async () => {
      const fakeFetch: typeof fetch = async () => new Response('<html><body>Error</body></html>', { status: 200 });
      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.listExams();
      assertAsErr(res, 'BAD_RESPONSE');
    });

    it('maps responses missing success boolean to BAD_RESPONSE', async () => {
      const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({ exams: [] }), { status: 200 });
      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.listExams();
      assertAsErr(res, 'BAD_RESPONSE');
    });
  });

  describe('createAppsScriptClient — 19.2 Account, Class, and Admin Actions', () => {
    const BASE_URL = 'https://script.google.com/macros/s/xyz/exec';

    it('getClass performs GET ?action=getClass&code=<code> with cache:no-store and maps ClassInfo', async () => {
      const recordedCalls: { url: string; init?: RequestInit }[] = [];
      const fakeFetch: typeof fetch = async (url, init) => {
        recordedCalls.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            success: true,
            class: { code: '12A1OK', name: '12A1 Chuyên Lý', teacherName: 'Cô Lan' },
            assignments: [
              {
                assignmentId: 'asn-01',
                examId: 'exam-ly-12',
                title: 'Đề kiểm tra 1 tiết',
                openAt: '2026-11-16T08:00:00Z',
                dueAt: '2026-11-16T10:00:00Z',
                questionCount: 28,
                durationMinutes: 50,
              },
            ],
          }),
          { status: 200 }
        );
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.getClass('12A1OK');
      const val = assertAsOk(res);
      assert.equal(val.class.code, '12A1OK');
      assert.equal(val.class.name, '12A1 Chuyên Lý');
      assert.equal(val.class.teacherName, 'Cô Lan');
      assert.equal(val.assignments.length, 1);
      assert.equal(val.assignments[0]?.assignmentId, 'asn-01');
      assert.equal(val.assignments[0]?.title, 'Đề kiểm tra 1 tiết');
      assert.match(recordedCalls[0]?.url ?? '', /action=getClass&code=12A1OK/);
      assert.equal(recordedCalls[0]?.init?.cache, 'no-store');
    });

    it('getClass maps NOT_FOUND error when class does not exist', async () => {
      const fakeFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'NOT_FOUND',
            message: 'Không tìm thấy lớp học',
          }),
          { status: 200 }
        );
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.getClass('ZZZZZZ');
      const err = assertAsErr(res, 'NOT_FOUND');
      assert.match(err.message, /Không tìm thấy lớp học/i);
    });

    it('teacherLogin with (username, password) returns token and stores in sessionStorage', async () => {
      mockSession.clear();
      const recordedCalls: { url: string; init?: RequestInit }[] = [];
      const fakeFetch: typeof fetch = async (url, init) => {
        recordedCalls.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            success: true,
            token: 'token-teacher-32-bytes-long-string-value',
            name: 'Cô Lan',
            expiresAt: '2026-11-16T18:00:00Z',
          }),
          { status: 200 }
        );
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.teacherLogin('colan', 'MatKhau-Lan-01');
      const val = assertAsOk(res);
      assert.equal(val.token, 'token-teacher-32-bytes-long-string-value');
      assert.equal(val.name, 'Cô Lan');
      assert.equal(getTeacherToken(), 'token-teacher-32-bytes-long-string-value');

      const body = JSON.parse(String(recordedCalls[0]?.init?.body));
      assert.equal(body.action, 'teacherLogin');
      assert.equal(body.username, 'colan');
      assert.equal(body.password, 'MatKhau-Lan-01');

      // Logout clears token
      client.teacherLogout();
      assert.equal(getTeacherToken(), null);
    });

    it('teacherLogin maps UNAUTHORIZED to Vietnamese "Sai tên đăng nhập hoặc mật khẩu"', async () => {
      const fakeFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Sai mật khẩu',
          }),
          { status: 200 }
        );
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.teacherLogin('colan', 'wrong-pass');
      const err = assertAsErr(res, 'UNAUTHORIZED');
      assert.equal(err.message, 'Sai tên đăng nhập hoặc mật khẩu');
    });

    it('createClass sends POST and returns classId and 6-char code; falls back to stored token', async () => {
      setTeacherToken('my-saved-teacher-token');
      const recordedCalls: { url: string; init?: RequestInit }[] = [];
      const fakeFetch: typeof fetch = async (url, init) => {
        recordedCalls.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            success: true,
            classId: 'cls-12a1',
            code: 'ABCDEF',
          }),
          { status: 200 }
        );
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      // Call with name only (token from sessionStorage)
      const res = await client.createClass('12A1');
      const val = assertAsOk(res);
      assert.equal(val.classId, 'cls-12a1');
      assert.equal(val.code, 'ABCDEF');

      const body = JSON.parse(String(recordedCalls[0]?.init?.body));
      assert.equal(body.action, 'createClass');
      assert.equal(body.token, 'my-saved-teacher-token');
      assert.equal(body.name, '12A1');
      clearTeacherToken();
    });

    it('listMyClasses sends POST and returns TeacherClassMeta[]', async () => {
      const fakeFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            success: true,
            classes: [
              { classId: 'cls-1', code: 'ABCDEF', name: '12A1', createdAt: '2026-11-16T08:00:00Z', studentCount: 25 },
              { classId: 'cls-2', code: 'GHJKLM', name: '12A2', createdAt: '2026-11-16T09:00:00Z', studentCount: 30 },
            ],
          }),
          { status: 200 }
        );
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.listMyClasses('explicit-token');
      const val = assertAsOk(res);
      assert.equal(val.length, 2);
      assert.equal(val[0]?.name, '12A1');
      assert.equal(val[0]?.studentCount, 25);
    });

    it('assignExam sends POST and maps assignmentId; maps INVALID_DATES error', async () => {
      const recordedCalls: { url: string; init?: RequestInit }[] = [];
      const fakeFetch: typeof fetch = async (url, init) => {
        recordedCalls.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            success: true,
            assignmentId: 'assign-xyz-99',
          }),
          { status: 200 }
        );
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.assignExam('tok', 'cls-1', 'exam-01', '2026-11-16T08:00:00Z', '2026-11-16T10:00:00Z');
      const val = assertAsOk(res);
      assert.equal(val.assignmentId, 'assign-xyz-99');

      const body = JSON.parse(String(recordedCalls[0]?.init?.body));
      assert.equal(body.action, 'assignExam');
      assert.equal(body.classId, 'cls-1');
      assert.equal(body.examId, 'exam-01');

      // Test error mapping
      const errorFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'INVALID_DATES',
            message: 'Hạn nộp phải sau giờ mở, theo ISO 8601',
          }),
          { status: 200 }
        );
      };
      const clientErr = createAppsScriptClient(BASE_URL, errorFetch);
      const errRes = await clientErr.assignExam('tok', 'cls-1', 'exam-01', '2026-11-16T12:00:00Z', '2026-11-16T10:00:00Z');
      const err = assertAsErr(errRes, 'INVALID_DATES');
      assert.match(err.message, /Hạn nộp phải sau giờ mở/i);
    });

    it('listAssignments sends POST and returns AssignmentMeta[]', async () => {
      const fakeFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            success: true,
            assignments: [
              {
                assignmentId: 'a1',
                classId: 'c1',
                examId: 'e1',
                openAt: '2026-11-16T08:00:00Z',
                dueAt: '2026-11-16T12:00:00Z',
                createdAt: '2026-11-16T07:00:00Z',
                title: 'Đề 1',
                questionCount: 20,
                durationMinutes: 45,
                submissionCount: 5,
              },
            ],
          }),
          { status: 200 }
        );
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.listAssignments('tok', 'c1');
      const val = assertAsOk(res);
      assert.equal(val.length, 1);
      assert.equal(val[0]?.title, 'Đề 1');
      assert.equal(val[0]?.submissionCount, 5);
    });

    it('listResults sends POST and maps results; maps FORBIDDEN error', async () => {
      const fakeFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            success: true,
            results: [
              { candidate_display: 'Nguyễn An', total: '19/4', maxTotal: '10' },
            ],
          }),
          { status: 200 }
        );
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.listResults('tok', 'cls-1');
      const val = assertAsOk(res);
      assert.equal(val.length, 1);
      assert.equal(val[0]?.candidate_display, 'Nguyễn An');

      // FORBIDDEN error
      const forbiddenFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'FORBIDDEN',
            message: 'Lớp thuộc giáo viên khác',
          }),
          { status: 200 }
        );
      };
      const clientForbidden = createAppsScriptClient(BASE_URL, forbiddenFetch);
      const errRes = await clientForbidden.listResults('tok', 'cls-other');
      const err = assertAsErr(errRes, 'FORBIDDEN');
      assert.match(err.message, /Lớp thuộc giáo viên khác|không có quyền/i);
    });

    it('listResults queries all teacher classes and combines results when classId is empty', async () => {
      const calls: any[] = [];
      const multiClassFetch: typeof fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body || '{}'));
        calls.push(body);
        if (body.action === 'listMyClasses') {
          return new Response(
            JSON.stringify({
              success: true,
              classes: [
                { classId: 'cls-1', code: 'ABCDEF', name: 'Lớp 12A1', createdAt: '2026-11-17T00:00:00Z', studentCount: 1 },
                { classId: 'cls-2', code: 'XYZ123', name: 'Lớp 12A2', createdAt: '2026-11-17T00:00:00Z', studentCount: 1 },
              ],
            }),
            { status: 200 }
          );
        }
        if (body.action === 'listResults' && body.classId === 'cls-1') {
          return new Response(
            JSON.stringify({
              success: true,
              results: [
                { attempt_id: 'att-1', candidate_display: 'Học sinh 1', total: '10/10' },
              ],
            }),
            { status: 200 }
          );
        }
        if (body.action === 'listResults' && body.classId === 'cls-2') {
          return new Response(
            JSON.stringify({
              success: true,
              results: [
                { attempt_id: 'att-2', candidate_display: 'Học sinh 2', total: '8/10' },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ success: false, error: 'BAD_REQUEST' }), { status: 400 });
      };

      const client = createAppsScriptClient(BASE_URL, multiClassFetch);
      // Call with empty classId
      const res = await client.listResults('tok_test', '');
      const val = assertAsOk(res);
      assert.equal(val.length, 2);
      assert.equal(val[0]?.candidate_display, 'Học sinh 1');
      assert.equal(val[1]?.candidate_display, 'Học sinh 2');
      assert.equal(calls.length, 3);
      assert.equal(calls[0].action, 'listMyClasses');
    });

    it('adminLogin sends POST and stores admin token in sessionStorage', async () => {
      mockSession.clear();
      const fakeFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            success: true,
            token: 'admin-token-secure-32-bytes-long',
            expiresAt: '2026-11-16T20:00:00Z',
          }),
          { status: 200 }
        );
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.adminLogin('Admin-Cunata-2026');
      const val = assertAsOk(res);
      assert.equal(val.token, 'admin-token-secure-32-bytes-long');
      assert.equal(getAdminToken(), 'admin-token-secure-32-bytes-long');

      client.adminLogout();
      assert.equal(getAdminToken(), null);
    });

    it('adminCreateTeacher sends POST, handles USERNAME_TAKEN', async () => {
      setAdminToken('admin-tok-stored');
      const recordedCalls: { url: string; init?: RequestInit }[] = [];
      const fakeFetch: typeof fetch = async (url, init) => {
        recordedCalls.push({ url: String(url), init });
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.adminCreateTeacher({
        name: 'Thầy Hùng',
        username: 'thayhung',
        password: 'MatKhau-Hung-01',
      });
      assert.equal(assertAsOk(res), true);

      const body = JSON.parse(String(recordedCalls[0]?.init?.body));
      assert.equal(body.action, 'adminCreateTeacher');
      assert.equal(body.token, 'admin-tok-stored');
      assert.equal(body.username, 'thayhung');

      // USERNAME_TAKEN mapping
      const dupFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'USERNAME_TAKEN',
            message: 'Tên đăng nhập đã được dùng',
          }),
          { status: 200 }
        );
      };
      const clientDup = createAppsScriptClient(BASE_URL, dupFetch);
      const dupRes = await clientDup.adminCreateTeacher('tok', 'Thầy Hùng', 'thayhung', 'MatKhau-Hung-01');
      const err = assertAsErr(dupRes, 'USERNAME_TAKEN');
      assert.equal(err.message, 'Tên đăng nhập đã được dùng');
      clearAdminToken();
    });

    it('adminListTeachers sends POST and maps TeacherAccountInfo[]', async () => {
      const fakeFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            success: true,
            teachers: [
              { username: 'colan', name: 'Cô Lan', active: true, createdAt: '2026-11-16T08:00:00Z' },
              { username: 'thayminh', name: 'Thầy Minh', active: false, createdAt: '2026-11-16T09:00:00Z' },
            ],
          }),
          { status: 200 }
        );
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.adminListTeachers('admin-tok');
      const val = assertAsOk(res);
      assert.equal(val.length, 2);
      assert.equal(val[0]?.username, 'colan');
      assert.equal(val[0]?.active, true);
      assert.equal(val[1]?.active, false);
    });

    it('adminResetPassword and adminSetTeacherActive send POST', async () => {
      const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });
      const client = createAppsScriptClient(BASE_URL, fakeFetch);

      const r1 = await client.adminResetPassword('admin-tok', 'colan', 'NewPassword-99');
      assert.equal(assertAsOk(r1), true);

      const r2 = await client.adminSetTeacherActive('admin-tok', 'colan', false);
      assert.equal(assertAsOk(r2), true);
    });

    it('adminStats sends POST and maps AdminStats counters', async () => {
      const fakeFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            success: true,
            stats: { teachers: 5, classes: 12, exams: 25, results: 140 },
          }),
          { status: 200 }
        );
      };

      const client = createAppsScriptClient(BASE_URL, fakeFetch);
      const res = await client.adminStats('admin-tok');
      const val = assertAsOk(res);
      assert.equal(val.teachers, 5);
      assert.equal(val.classes, 12);
      assert.equal(val.exams, 25);
      assert.equal(val.results, 140);
    });
  });

  describe('Vietnamese Error Mapping & sessionStorage Helpers', () => {
    it('mapErrorToVietnamese maps standard error codes accurately', () => {
      assert.equal(mapErrorToVietnamese('UNAUTHORIZED'), 'Sai tên đăng nhập hoặc mật khẩu');
      assert.equal(mapErrorToVietnamese('UNAUTHORIZED', 'Mật khẩu sai'), 'Sai tên đăng nhập hoặc mật khẩu');
      assert.equal(mapErrorToVietnamese('FORBIDDEN'), 'Bạn không có quyền thực hiện thao tác này');
      assert.equal(mapErrorToVietnamese('FORBIDDEN', 'Lớp thuộc giáo viên khác'), 'Lớp thuộc giáo viên khác');
      assert.equal(mapErrorToVietnamese('NOT_OPEN'), 'Bài thi chưa đến giờ mở');
      assert.equal(mapErrorToVietnamese('PAST_DUE'), 'Nộp sau hạn — giáo viên chưa nhận');
      assert.equal(mapErrorToVietnamese('USERNAME_TAKEN'), 'Tên đăng nhập đã được dùng');
      assert.equal(mapErrorToVietnamese('NOT_FOUND'), 'Không tìm thấy dữ liệu yêu cầu');
      assert.equal(mapErrorToVietnamese('TIMEOUT'), 'Hết thời gian chờ kết nối máy chủ Apps Script (15s)');
      assert.equal(mapErrorToVietnamese('CUSTOM_ERR', 'Thông báo tiếng Việt tùy chỉnh'), 'Thông báo tiếng Việt tùy chỉnh');
    });

    it('sessionStorage token helpers store and clear tokens properly', () => {
      clearTeacherToken();
      clearAdminToken();

      assert.equal(getTeacherToken(), null);
      assert.equal(getAdminToken(), null);

      setTeacherToken('test-teacher-tok');
      assert.equal(getTeacherToken(), 'test-teacher-tok');

      setAdminToken('test-admin-tok');
      assert.equal(getAdminToken(), 'test-admin-tok');

      teacherLogout();
      assert.equal(getTeacherToken(), null);
      assert.equal(getAdminToken(), 'test-admin-tok');

      adminLogout();
      assert.equal(getAdminToken(), null);
    });
  });

  describe('createAppsScriptCollectorPort — Interface & Outbox Integration', () => {
    const BASE_URL = 'https://script.google.com/macros/s/xyz/exec';

    it('sets configured=false and throws NOT_CONFIGURED when url is empty without calling fetch', async () => {
      let fetchCalled = false;
      const fakeFetch: typeof fetch = async () => {
        fetchCalled = true;
        throw new Error('Should not be called');
      };

      const port = createAppsScriptCollectorPort('', fakeFetch);
      assert.equal(port.configured, false);

      const final = createSampleAttempt();
      const ac = new AbortController();

      await assert.rejects(
        async () => {
          await port.send(final, ac.signal);
        },
        (err: any) => {
          assert.equal(err.code, 'NOT_CONFIGURED');
          return true;
        }
      );
      assert.equal(fetchCalled, false, 'Fetch must not be called when unconfigured');
    });

    it('sends POST text/plain with canonical buildWebResultPayload and maps NEWLY_RECORDED to receipt', async () => {
      const recordedCalls: { url: string; init?: RequestInit }[] = [];
      const fakeFetch: typeof fetch = async (url, init) => {
        recordedCalls.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            success: true,
            attempt_id: 'att-gas-01',
            status: 'NEWLY_RECORDED',
            message: 'Ghi nhận kết quả bài thi thành công',
            recorded_at: '2026-11-16T08:30:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const port = createAppsScriptCollectorPort(BASE_URL, fakeFetch);
      assert.equal(port.configured, true);

      const final = createSampleAttempt('att-gas-01');
      const ac = new AbortController();
      const rawReceipt: any = await port.send(final, ac.signal);

      assert.equal(recordedCalls.length, 1);
      assert.equal(recordedCalls[0]?.init?.method, 'POST');
      assert.equal(
        (recordedCalls[0]?.init?.headers as Record<string, string>)['Content-Type'],
        'text/plain;charset=utf-8'
      );
      const body = JSON.parse(String(recordedCalls[0]?.init?.body));
      assert.equal(body.action, 'submitResult');
      assert.equal(body.attemptId, 'att-gas-01');
      assert.equal(body.candidateName, 'Trần Văn Thi');
      assert.equal(body.schemaVersion, 'web-result-v1');
      assert.equal(body.total, '1/4');
      assert.equal(body.maxTotal, '1/4');

      // Validate receipt satisfaction
      assert.equal(rawReceipt.examId, final.examId);
      assert.equal(rawReceipt.attemptId, final.attemptId);
      assert.equal(rawReceipt.status, 'recorded');
      assert.equal(rawReceipt.receivedAt, '2026-11-16T08:30:00.000Z');

      const expectedOutbox: OutboxRecord = {
        examId: final.examId,
        examVersionId: final.examVersionId,
        attemptId: final.attemptId,
        state: 'queued',
        finalRevision: 1,
        payloadHash: rawReceipt.payloadHash,
        endpointId: BASE_URL,
        retryCount: 0,
        nextRetryAt: null,
        generation: 1,
        receipt: null,
        lastError: null,
      };

      const valRes = validateReceipt(rawReceipt, expectedOutbox);
      const validReceipt = assertResultOk(valRes);
      assert.equal(validReceipt.status, 'recorded');
    });

    it('maps ALREADY_RECORDED to receipt status already_recorded', async () => {
      const fakeFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            success: true,
            attempt_id: 'att-gas-01',
            status: 'ALREADY_RECORDED',
            message: 'Đã ghi nhận trước đó',
            recorded_at: '2026-11-16T08:30:00.000Z',
          }),
          { status: 200 }
        );
      };

      const port = createAppsScriptCollectorPort(BASE_URL, fakeFetch);
      const final = createSampleAttempt('att-gas-01');
      const ac = new AbortController();
      const rawReceipt: any = await port.send(final, ac.signal);

      assert.equal(rawReceipt.status, 'already_recorded');

      const expectedOutbox: OutboxRecord = {
        examId: final.examId,
        examVersionId: final.examVersionId,
        attemptId: final.attemptId,
        state: 'queued',
        finalRevision: 1,
        payloadHash: rawReceipt.payloadHash,
        endpointId: BASE_URL,
        retryCount: 0,
        nextRetryAt: null,
        generation: 1,
        receipt: null,
        lastError: null,
      };

      const valRes = validateReceipt(rawReceipt, expectedOutbox);
      const validReceipt = assertResultOk(valRes);
      assert.equal(validReceipt.status, 'already_recorded');
    });

    it('integrates seamlessly with drainOutbox state machine: transitions from queued to server_confirmed', async () => {
      const storage = new InMemoryStorage();
      const final = createSampleAttempt('att-gas-integrate');
      await storage.create(final);

      // Enqueue into outbox
      const enqRes = await enqueue(final, storage, BASE_URL);
      const enqRecord = assertResultOk(enqRes);
      assert.equal(enqRecord.state, 'queued');

      const fakeFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            success: true,
            attempt_id: 'att-gas-integrate',
            status: 'NEWLY_RECORDED',
            message: 'OK',
            recorded_at: new Date().toISOString(),
          }),
          { status: 200 }
        );
      };

      const transport = createAppsScriptCollectorPort(BASE_URL, fakeFetch);
      const key: AttemptKey = { examId: final.examId, examVersionId: final.examVersionId, attemptId: final.attemptId };

      const drainRes = await drainOutbox(key, { storage, transport, now: () => 1700000000000 });
      const confirmedRecord = assertResultOk(drainRes);
      assert.equal(confirmedRecord.state, 'server_confirmed');
      assert.equal(confirmedRecord.receipt?.status, 'recorded');
      assert.equal(confirmedRecord.receipt?.attemptId, 'att-gas-integrate');

      const durableRes = await storage.getOutbox(key);
      const durable = assertResultOk(durableRes)!;
      assert.equal(durable.state, 'server_confirmed');
    });

    it('throws COLLECTOR_TIMEOUT on AbortSignal trigger', async () => {
      const fakeFetch: typeof fetch = async (_url, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };

      const port = createAppsScriptCollectorPort(BASE_URL, fakeFetch);
      const final = createSampleAttempt();
      const ac = new AbortController();

      setTimeout(() => ac.abort(), 10);

      await assert.rejects(
        async () => {
          await port.send(final, ac.signal);
        },
        (err: any) => {
          assert.equal(err.code, 'COLLECTOR_TIMEOUT');
          return true;
        }
      );
    });

    it('throws COLLECTOR_HTTP on HTTP 500 status', async () => {
      const fakeFetch: typeof fetch = async () => new Response('Internal error', { status: 500, statusText: 'Internal Error' });
      const port = createAppsScriptCollectorPort(BASE_URL, fakeFetch);
      const final = createSampleAttempt();
      const ac = new AbortController();

      await assert.rejects(
        async () => {
          await port.send(final, ac.signal);
        },
        (err: any) => {
          assert.equal(err.code, 'COLLECTOR_HTTP');
          assert.equal(err.status, 500);
          assert.equal(err.recoverable, true);
          return true;
        }
      );
    });

    it('throws PAYLOAD_CONFLICT on server conflict response', async () => {
      const fakeFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ success: false, error: 'PAYLOAD_CONFLICT', message: 'Xung đột kết quả' }), {
          status: 200,
        });
      };

      const port = createAppsScriptCollectorPort(BASE_URL, fakeFetch);
      const final = createSampleAttempt();
      const ac = new AbortController();

      await assert.rejects(
        async () => {
          await port.send(final, ac.signal);
        },
        (err: any) => {
          assert.equal(err.code, 'PAYLOAD_CONFLICT');
          assert.equal(err.recoverable, false);
          return true;
        }
      );
    });

    it('throws COLLECTOR_HTTP with 503 on SERVER_BUSY response', async () => {
      const fakeFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ success: false, error: 'SERVER_BUSY', message: 'Máy chủ bận' }), {
          status: 200,
        });
      };

      const port = createAppsScriptCollectorPort(BASE_URL, fakeFetch);
      const final = createSampleAttempt();
      const ac = new AbortController();

      await assert.rejects(
        async () => {
          await port.send(final, ac.signal);
        },
        (err: any) => {
          assert.equal(err.code, 'COLLECTOR_HTTP');
          assert.equal(err.status, 503);
          assert.equal(err.recoverable, true);
          return true;
        }
      );
    });

    it('throws BAD_RESPONSE on non-JSON response body', async () => {
      const fakeFetch: typeof fetch = async () => new Response('<html>502 Bad Gateway</html>', { status: 200 });
      const port = createAppsScriptCollectorPort(BASE_URL, fakeFetch);
      const final = createSampleAttempt();
      const ac = new AbortController();

      await assert.rejects(
        async () => {
          await port.send(final, ac.signal);
        },
        (err: any) => {
          assert.equal(err.code, 'BAD_RESPONSE');
          return true;
        }
      );
    });

    it('attaches class_code and assignment_id to submitResult payload when present on final', async () => {
      const recordedCalls: { url: string; init?: RequestInit }[] = [];
      const fakeFetch: typeof fetch = async (url, init) => {
        recordedCalls.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            success: true,
            status: 'NEWLY_RECORDED',
            attempt_id: 'att-with-class',
            recorded_at: '2026-11-16T08:30:00.000Z',
          }),
          { status: 200 }
        );
      };

      const port = createAppsScriptCollectorPort(BASE_URL, fakeFetch);
      const final: any = {
        ...createSampleAttempt('att-with-class'),
        class_code: '12a1ok',
        assignment_id: 'assign-uuid-456',
      };
      const ac = new AbortController();
      const res = await port.send(final, ac.signal);
      assert.ok(res && typeof res === 'object');

      const body = JSON.parse(String(recordedCalls[0]?.init?.body));
      assert.equal(body.action, 'submitResult');
      assert.equal(body.class_code, '12A1OK', 'class_code must be trimmed and uppercase');
      assert.equal(body.assignment_id, 'assign-uuid-456');
    });

    it('attaches class_code and assignment_id from metadata when present', async () => {
      const recordedCalls: { url: string; init?: RequestInit }[] = [];
      const fakeFetch: typeof fetch = async (url, init) => {
        recordedCalls.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            success: true,
            status: 'NEWLY_RECORDED',
            attempt_id: 'att-meta',
            recorded_at: '2026-11-16T08:30:00.000Z',
          }),
          { status: 200 }
        );
      };

      const port = createAppsScriptCollectorPort(BASE_URL, fakeFetch);
      const final: any = {
        ...createSampleAttempt('att-meta'),
        metadata: {
          classCode: 'ABCDEF',
          assignmentId: 'assign-789',
        },
      };
      const ac = new AbortController();
      await port.send(final, ac.signal);

      const body = JSON.parse(String(recordedCalls[0]?.init?.body));
      assert.equal(body.class_code, 'ABCDEF');
      assert.equal(body.assignment_id, 'assign-789');
    });

    it('attaches all-numeric class_code (e.g. 222222 or "222222") as string and preserves literal apostrophe name', async () => {
      const recordedCalls: { url: string; init?: RequestInit }[] = [];
      const fakeFetch: typeof fetch = async (url, init) => {
        recordedCalls.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            success: true,
            status: 'NEWLY_RECORDED',
            attempt_id: 'att-num-class',
            recorded_at: new Date().toISOString(),
          }),
          { status: 200 }
        );
      };

      const port = createAppsScriptCollectorPort(BASE_URL, fakeFetch);
      const final: any = {
        ...createSampleAttempt('att-num-class'),
        candidateName: "'Nguyễn An",
        class_code: '222222',
        assignment_id: 'assign-num-123',
      };
      const ac = new AbortController();
      const res = await port.send(final, ac.signal);
      assert.ok(res && typeof res === 'object');

      const body = JSON.parse(String(recordedCalls[0]?.init?.body));
      assert.equal(body.class_code, '222222');
      assert.equal(body.candidate_display, "'Nguyễn An");
      assert.equal(body.candidateName, "'Nguyễn An");
    });

    it('throws non-recoverable CollectorError for NOT_OPEN and PAST_DUE responses with Vietnamese messages', async () => {
      // NOT_OPEN test
      const notOpenFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'NOT_OPEN',
            message: 'Đề thi chưa đến giờ mở',
          }),
          { status: 200 }
        );
      };

      const portNotOpen = createAppsScriptCollectorPort(BASE_URL, notOpenFetch);
      const final1 = createSampleAttempt('att-not-open');
      const ac1 = new AbortController();

      await assert.rejects(
        async () => {
          await portNotOpen.send(final1, ac1.signal);
        },
        (err: any) => {
          assert.equal(err.code, 'NOT_OPEN');
          assert.equal(err.recoverable, false, 'NOT_OPEN must be non-recoverable');
          assert.match(err.message, /Bài thi chưa đến giờ mở|Đề thi chưa đến giờ mở/i);
          return true;
        }
      );

      // PAST_DUE test
      const pastDueFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'PAST_DUE',
            message: 'Đã quá hạn nộp bài',
          }),
          { status: 200 }
        );
      };

      const portPastDue = createAppsScriptCollectorPort(BASE_URL, pastDueFetch);
      const final2 = createSampleAttempt('att-past-due');
      const ac2 = new AbortController();

      await assert.rejects(
        async () => {
          await portPastDue.send(final2, ac2.signal);
        },
        (err: any) => {
          assert.equal(err.code, 'PAST_DUE');
          assert.equal(err.recoverable, false, 'PAST_DUE must be non-recoverable');
          assert.match(err.message, /Nộp sau hạn — giáo viên chưa nhận|Đã quá hạn/i);
          return true;
        }
      );
    });
  });
});
