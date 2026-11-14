import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type {
  AttemptRecord,
  OutboxRecord,
  Receipt,
  Result,
  StoragePort,
  WebExam,
  WebError,
} from '../../../src/collect/types.ts';
import {
  CollectorError,
  drainOutbox,
  enqueue,
} from '../../../src/collect/index.ts';
import {
  HttpCollectorTransport,
  createHttpTransport,
} from '../../../src/collect/transport.ts';

function assertOk<T>(res: Result<T>, message?: string): T {
  assert.equal(res.ok, true, message || (res.ok ? '' : (res as any).error?.message));
  if (!res.ok) throw new Error('Expected ok');
  return res.value;
}

function assertErr<T>(res: Result<T>, expectedCode?: string, message?: string): WebError {
  assert.equal(res.ok, false, message || 'Expected error');
  if (res.ok) throw new Error('Expected error');
  if (expectedCode) {
    assert.equal(res.error.code, expectedCode);
  }
  return res.error;
}

function createDummyExam(): WebExam {
  return {
    schemaVersion: 'web-exam-v1',
    examId: 'exam-01',
    examVersionId: 'v1.0.0',
    title: 'Đề kiểm tra vận chuyển',
    subject: 'Vật lý',
    grade: 12,
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    settings: {
      durationMinutes: 45,
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
        content: 'Nội dung',
        options: [
          { optionId: 'opt-a', label: 'A', text: 'A' },
          { optionId: 'opt-b', label: 'B', text: 'B' },
          { optionId: 'opt-c', label: 'C', text: 'C' },
          { optionId: 'opt-d', label: 'D', text: 'D' },
        ],
        correctOptionId: 'opt-a',
      },
    ],
    assets: [],
  };
}

function createSampleAttempt(
  attemptId: string,
  overrides?: Partial<AttemptRecord>
): AttemptRecord {
  return {
    schemaVersion: 'web-attempt-v1',
    examId: 'exam-01',
    examVersionId: 'v1.0.0',
    attemptId,
    revision: 1,
    candidateName: 'Trần Thị B',
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
    startedAt: 1731571200000,
    deadline: 1731573900000,
    phase: 'final',
    submittedAt: 1731573800000,
    scoreDTO: null,
    ...overrides,
  };
}

class InMemoryStorage implements StoragePort {
  attempts = new Map<string, AttemptRecord>();
  outbox = new Map<string, OutboxRecord>();

  private keyStr(k: { examId: string; examVersionId: string; attemptId: string }): string {
    return `${k.examId}::${k.examVersionId}::${k.attemptId}`;
  }

  async load(key: { examId: string; examVersionId: string; attemptId: string }): Promise<Result<AttemptRecord | null>> {
    return { ok: true, value: this.attempts.get(this.keyStr(key)) ?? null };
  }

  async create(record: AttemptRecord): Promise<Result<AttemptRecord>> {
    this.attempts.set(this.keyStr(record), JSON.parse(JSON.stringify(record)));
    return { ok: true, value: record };
  }

  async saveDraft(record: AttemptRecord, _rev: number): Promise<Result<AttemptRecord>> {
    this.attempts.set(this.keyStr(record), JSON.parse(JSON.stringify(record)));
    return { ok: true, value: record };
  }

  async finalize(record: AttemptRecord, _rev: number): Promise<Result<AttemptRecord>> {
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

  async getOutbox(key: { examId: string; examVersionId: string; attemptId: string }): Promise<Result<OutboxRecord | null>> {
    return { ok: true, value: this.outbox.get(this.keyStr(key)) ?? null };
  }

  async updateOutbox(value: OutboxRecord, expectedGen: number | null): Promise<Result<OutboxRecord>> {
    const k = this.keyStr(value);
    const existing = this.outbox.get(k);

    if (!existing) {
      if (expectedGen !== null) {
        return { ok: false, error: { code: 'STORAGE_CONFLICT', path: 'gen', message: 'Not found', recoverable: false } };
      }
      this.outbox.set(k, JSON.parse(JSON.stringify(value)));
      return { ok: true, value };
    }

    if (expectedGen !== null && existing.generation !== expectedGen) {
      return { ok: false, error: { code: 'STORAGE_CONFLICT', path: 'gen', message: 'Gen conflict', recoverable: false } };
    }

    const next: OutboxRecord = { ...JSON.parse(JSON.stringify(value)), generation: existing.generation + 1 };
    this.outbox.set(k, next);
    return { ok: true, value: next };
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

describe('M4 Native Transport: Injected Allowlist & Gated Endpoints', () => {
  const APPROVED_URL = 'https://script.google.com/macros/s/approved-deploy-id/exec';
  const OTHER_APPROVED_URL = 'https://collector.school.edu.vn/api/submit';
  const UNAPPROVED_URL = 'https://attacker.evil.com/steal';

  it('rejects dispatch when endpoint is empty or not configured (COLLECTOR_DISABLED)', async () => {
    const transport = new HttpCollectorTransport({
      endpointUrl: '',
      approvedEndpoints: [APPROVED_URL],
    });

    const attempt = createSampleAttempt('att-01');
    const signal = new AbortController().signal;

    await assert.rejects(
      async () => transport.send(attempt, signal),
      (err: any) => {
        assert.ok(err instanceof CollectorError);
        assert.equal(err.code, 'COLLECTOR_DISABLED');
        assert.equal(err.recoverable, false);
        return true;
      }
    );
  });

  it('rejects dispatch when endpoint is not in approved allowlist (COLLECTOR_DISABLED)', async () => {
    const transport = new HttpCollectorTransport({
      endpointUrl: UNAPPROVED_URL,
      approvedEndpoints: [APPROVED_URL, OTHER_APPROVED_URL],
    });

    const attempt = createSampleAttempt('att-01');
    const signal = new AbortController().signal;

    await assert.rejects(
      async () => transport.send(attempt, signal),
      (err: any) => {
        assert.ok(err instanceof CollectorError);
        assert.equal(err.code, 'COLLECTOR_DISABLED');
        assert.match(err.message, /not in the approved endpoint allowlist/);
        return true;
      }
    );
  });

  it('strictly ignores any collectorUrl embedded in examSnapshot (defense against untrusted exam files)', async () => {
    let capturedUrl = '';
    const mockFetch: typeof fetch = async (url) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({ status: 'recorded' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const transport = createHttpTransport({
      endpointUrl: APPROVED_URL,
      approvedEndpoints: [APPROVED_URL],
      fetchFn: mockFetch,
    });

    // Malicious exam snapshot containing a fake collector URL
    const examWithMaliciousUrl = createDummyExam();
    (examWithMaliciousUrl as any).collectorUrl = 'https://malicious.evil.com/hack';
    (examWithMaliciousUrl.settings as any).collectorUrl = 'https://malicious.evil.com/hack';

    const attempt = createSampleAttempt('att-defense', {
      examSnapshot: examWithMaliciousUrl,
    });

    const signal = new AbortController().signal;
    await transport.send(attempt, signal);

    // Transport must strictly send to APPROVED_URL, never the malicious URL in exam
    assert.equal(capturedUrl, APPROVED_URL);
  });
});

describe('M4 Native Transport: AbortSignal & Timeout Handling', () => {
  const APPROVED_URL = 'https://collector.example.com/api/submit';

  it('rejects immediately when AbortSignal is already aborted (COLLECTOR_TIMEOUT)', async () => {
    const transport = new HttpCollectorTransport({
      endpointUrl: APPROVED_URL,
      approvedEndpoints: [APPROVED_URL],
    });

    const attempt = createSampleAttempt('att-pre-aborted');
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      async () => transport.send(attempt, controller.signal),
      (err: any) => {
        assert.ok(err instanceof CollectorError);
        assert.equal(err.code, 'COLLECTOR_TIMEOUT');
        assert.equal(err.recoverable, true);
        return true;
      }
    );
  });

  it('catches and maps fetch abort errors to COLLECTOR_TIMEOUT', async () => {
    const mockFetch: typeof fetch = async (_url, init) => {
      return new Promise((_resolve, reject) => {
        const sig = init?.signal;
        if (sig) {
          sig.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        }
      });
    };

    const transport = new HttpCollectorTransport({
      endpointUrl: APPROVED_URL,
      approvedEndpoints: [APPROVED_URL],
      fetchFn: mockFetch,
    });

    const attempt = createSampleAttempt('att-abort-midflight');
    const controller = new AbortController();

    const sendPromise = transport.send(attempt, controller.signal);
    // Abort after small delay
    setTimeout(() => controller.abort(), 10);

    await assert.rejects(
      sendPromise,
      (err: any) => {
        assert.ok(err instanceof CollectorError);
        assert.equal(err.code, 'COLLECTOR_TIMEOUT');
        assert.equal(err.recoverable, true);
        return true;
      }
    );
  });
});

describe('M4 Native Transport: no-cors Prohibition & Opaque Responses', () => {
  const APPROVED_URL = 'https://collector.example.com/api/submit';

  it('rejects opaque response from no-cors with COLLECTOR_HTTP', async () => {
    const mockFetch: typeof fetch = async () => {
      // Simulating a browser opaque response (status: 0, type: 'opaque')
      const resp = new Response(null, { status: 200 });
      Object.defineProperty(resp, 'type', { value: 'opaque', writable: false });
      Object.defineProperty(resp, 'status', { value: 0, writable: false });
      return resp;
    };

    const transport = new HttpCollectorTransport({
      endpointUrl: APPROVED_URL,
      approvedEndpoints: [APPROVED_URL],
      fetchFn: mockFetch,
    });

    const attempt = createSampleAttempt('att-opaque');
    const signal = new AbortController().signal;

    await assert.rejects(
      async () => transport.send(attempt, signal),
      (err: any) => {
        assert.ok(err instanceof CollectorError);
        assert.equal(err.code, 'COLLECTOR_HTTP');
        assert.equal(err.recoverable, false);
        assert.match(err.message, /Opaque response received/);
        return true;
      }
    );
  });
});

describe('M4 Native Transport: HTTP Status & Redirect Handling', () => {
  const APPROVED_URL = 'https://collector.example.com/api/submit';
  const APPROVED_REDIRECT_TARGET = 'https://collector.example.com/api/confirmed';
  const UNAPPROVED_REDIRECT_TARGET = 'https://phishing.attacker.com/sink';

  it('differentiates HTTP 4xx (non-retryable client error)', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ error: 'BAD_REQUEST' }), {
        status: 400,
        statusText: 'Bad Request',
      });
    };

    const transport = new HttpCollectorTransport({
      endpointUrl: APPROVED_URL,
      approvedEndpoints: [APPROVED_URL],
      fetchFn: mockFetch,
    });

    const attempt = createSampleAttempt('att-400');
    const signal = new AbortController().signal;

    await assert.rejects(
      async () => transport.send(attempt, signal),
      (err: any) => {
        assert.ok(err instanceof CollectorError);
        assert.equal(err.code, 'COLLECTOR_HTTP');
        assert.equal(err.recoverable, false, '4xx error must be non-retryable');
        assert.equal(err.status, 400);
        return true;
      }
    );
  });

  it('differentiates HTTP 5xx (retryable server error)', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response('Server Error', {
        status: 503,
        statusText: 'Service Unavailable',
      });
    };

    const transport = new HttpCollectorTransport({
      endpointUrl: APPROVED_URL,
      approvedEndpoints: [APPROVED_URL],
      fetchFn: mockFetch,
    });

    const attempt = createSampleAttempt('att-503');
    const signal = new AbortController().signal;

    await assert.rejects(
      async () => transport.send(attempt, signal),
      (err: any) => {
        assert.ok(err instanceof CollectorError);
        assert.equal(err.code, 'COLLECTOR_HTTP');
        assert.equal(err.recoverable, true, '5xx error must be retryable');
        assert.equal(err.status, 503);
        return true;
      }
    );
  });

  it('rejects redirects to unapproved targets (COLLECTOR_HTTP)', async () => {
    const mockFetch: typeof fetch = async () => {
      const resp = new Response(JSON.stringify({ success: true }), { status: 200 });
      Object.defineProperty(resp, 'redirected', { value: true, writable: false });
      Object.defineProperty(resp, 'url', { value: UNAPPROVED_REDIRECT_TARGET, writable: false });
      return resp;
    };

    const transport = new HttpCollectorTransport({
      endpointUrl: APPROVED_URL,
      approvedEndpoints: [APPROVED_URL],
      fetchFn: mockFetch,
    });

    const attempt = createSampleAttempt('att-redirect-unapproved');
    const signal = new AbortController().signal;

    await assert.rejects(
      async () => transport.send(attempt, signal),
      (err: any) => {
        assert.ok(err instanceof CollectorError);
        assert.equal(err.code, 'COLLECTOR_HTTP');
        assert.match(err.message, /Redirected to unapproved endpoint/);
        return true;
      }
    );
  });

  it('accepts redirects when target URL is in approved allowlist', async () => {
    const mockFetch: typeof fetch = async () => {
      const resp = new Response(JSON.stringify({
        status: 'recorded',
        submissionId: 'sub-001',
      }), { status: 200 });
      Object.defineProperty(resp, 'redirected', { value: true, writable: false });
      Object.defineProperty(resp, 'url', { value: APPROVED_REDIRECT_TARGET, writable: false });
      return resp;
    };

    const transport = new HttpCollectorTransport({
      endpointUrl: APPROVED_URL,
      approvedEndpoints: [APPROVED_URL, APPROVED_REDIRECT_TARGET],
      fetchFn: mockFetch,
    });

    const attempt = createSampleAttempt('att-redirect-approved');
    const signal = new AbortController().signal;
    const result = await transport.send(attempt, signal);

    assert.equal((result as any).status, 'recorded');
    assert.equal((result as any).submissionId, 'sub-001');
  });

  it('rejects responses with non-JSON body (RECEIPT_INVALID)', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response('<html><body>Error</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    };

    const transport = new HttpCollectorTransport({
      endpointUrl: APPROVED_URL,
      approvedEndpoints: [APPROVED_URL],
      fetchFn: mockFetch,
    });

    const attempt = createSampleAttempt('att-bad-body');
    const signal = new AbortController().signal;

    await assert.rejects(
      async () => transport.send(attempt, signal),
      (err: any) => {
        assert.ok(err instanceof CollectorError);
        assert.equal(err.code, 'RECEIPT_INVALID');
        assert.equal(err.recoverable, false);
        return true;
      }
    );
  });
});

describe('M4 Native Transport: Integration with drainOutbox', () => {
  const APPROVED_URL = 'https://collector.example.com/api/submit';

  it('successfully transitions outbox from queued to server_confirmed on valid receipt', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleFinal();
    await storage.finalize(final, 1);

    const enqueueRes = await enqueue(final, storage, APPROVED_URL);
    const enqueued = assertOk(enqueueRes);
    const payloadHash = enqueued.payloadHash;

    const mockFetch: typeof fetch = async () => {
      const validReceipt: Receipt = {
        examId: final.examId,
        examVersionId: final.examVersionId,
        attemptId: final.attemptId,
        submissionId: 'sub-test-01',
        payloadHash,
        receivedAt: new Date().toISOString(),
        status: 'recorded',
      };
      return new Response(JSON.stringify(validReceipt), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const transport = createHttpTransport({
      endpointUrl: APPROVED_URL,
      approvedEndpoints: [APPROVED_URL],
      fetchFn: mockFetch,
    });

    const drainRes = await drainOutbox(
      { examId: final.examId, examVersionId: final.examVersionId, attemptId: final.attemptId },
      { storage, transport, now: () => Date.now(), timeoutMs: 5000 }
    );

    const drained = assertOk(drainRes);
    assert.equal(drained.state, 'server_confirmed');
    assert.ok(drained.receipt);
    assert.equal(drained.receipt?.submissionId, 'sub-test-01');
  });

  it('transitions outbox to failed state on 4xx HTTP client error', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleFinal('att-fail-404');
    await storage.finalize(final, 1);

    await enqueue(final, storage, APPROVED_URL);

    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
        status: 404,
        statusText: 'Not Found',
      });
    };

    const transport = createHttpTransport({
      endpointUrl: APPROVED_URL,
      approvedEndpoints: [APPROVED_URL],
      fetchFn: mockFetch,
    });

    const drainRes = await drainOutbox(
      { examId: final.examId, examVersionId: final.examVersionId, attemptId: final.attemptId },
      { storage, transport, now: () => Date.now(), timeoutMs: 5000 }
    );

    const drainErr = assertErr(drainRes, 'COLLECTOR_HTTP');
    assert.equal(drainErr.code, 'COLLECTOR_HTTP');

    const outboxAfter = await storage.getOutbox({
      examId: final.examId,
      examVersionId: final.examVersionId,
      attemptId: final.attemptId,
    });
    const finalOutbox = assertOk(outboxAfter);
    assert.equal(finalOutbox?.state, 'failed');
  });
});

function createSampleFinal(attemptId: string = 'att-final-01'): AttemptRecord {
  const exam = createDummyExam();
  return {
    schemaVersion: 'web-attempt-v1',
    examId: exam.examId,
    examVersionId: exam.examVersionId,
    attemptId,
    revision: 1,
    candidateName: 'Lê Văn C',
    examSnapshot: exam,
    presentationOrder: {
      seed: 'seed-01',
      questionOrder: ['q-01'],
      optionOrder: [{ questionVersionId: 'q-01', optionIds: ['opt-a', 'opt-b', 'opt-c', 'opt-d'] }],
    },
    responses: {
      attemptId,
      examVersionId: exam.examVersionId,
      responses: [{ kind: 'I', questionVersionId: 'q-01', selectedOptionId: 'opt-a' }],
    },
    startedAt: 1731571200000,
    deadline: 1731573900000,
    phase: 'final',
    submittedAt: 1731573800000,
    scoreDTO: null,
  };
}
