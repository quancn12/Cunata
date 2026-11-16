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
  enqueue,
  drainOutbox,
  validateReceipt,
  CollectorError,
  type AsResult,
} from '../../src/collect/index.ts';

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
      const fakeFetch: typeof fetch = async (input) => {
        assert.equal(String(input), 'public/config.json');
        return new Response(JSON.stringify({ appsScriptUrl: 'https://script.google.com/macros/s/xyz/exec' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const cfg = await loadAppConfig(fakeFetch);
      assert.deepEqual(cfg, { appsScriptUrl: 'https://script.google.com/macros/s/xyz/exec' });
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

        const rLogin = await client.teacherLogin('pass');
        assertAsErr(rLogin, 'NOT_CONFIGURED');

        const rPub = await client.publishExam('pass', {});
        assertAsErr(rPub, 'NOT_CONFIGURED');

        const rUnpub = await client.unpublishExam('pass', 'some-id');
        assertAsErr(rUnpub, 'NOT_CONFIGURED');

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
  });
});
