import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, createMemoryStore, createNeonStore } from '../../src/api/index.ts';
import type { RequestContext, ResultRecord } from '../../src/api/types.ts';

const epoch = Date.parse('2026-11-22T08:00:00Z');
function payload() {
  return {
    attempt_id: 'attempt-68', exam_id: 'exam', exam_version_id: 'v1',
    candidate_display: 'Nguyễn An', started_at: new Date(epoch - 30000).toISOString(),
    submitted_at: new Date(epoch).toISOString(), duration_seconds: 30,
    policy_version: 'custom-v1', total: '1', maxTotal: '10',
    sections: { I: { score: '1', max: '1' }, II: { score: '0', max: '2' }, III: { score: '0', max: '7' } },
    raw_answers: { q1: 'A', q3: '1,5' },
  };
}
function context(store = createMemoryStore()): RequestContext {
  return { store, now: () => epoch, catalog: [] };
}
const post = (ctx: RequestContext, body: unknown) => handle({ method: 'POST', body }, ctx);

test('CK68-F01: concurrent submissions compare the stored payload, including across contexts', async () => {
  for (const extra of [{ candidate_display: 'B' }, { raw_answers: { q1: 'B', q3: '1,5' } },
    { total: '0', sections: { I: { score: '0', max: '1' }, II: { score: '0', max: '2' }, III: { score: '0', max: '7' } } }]) {
    const ctx = context();
    const results = await Promise.all([post(ctx, payload()), post({ ...ctx }, { ...payload(), ...extra })]);
    assert.equal(results.filter(r => r.body.success).length, 1);
    assert.equal(results.find(r => !r.body.success)?.body.error, 'PAYLOAD_CONFLICT');
    assert.equal(await ctx.store.countResults(), 1);
  }
  const ctx = context();
  const identical = await Promise.all([post(ctx, payload()), post(ctx, payload())]);
  assert.deepEqual(identical.map(r => r.body.status).sort(), ['ALREADY_RECORDED', 'NEWLY_RECORDED']);
});

test('CK68-F02: retries preserve answers, timestamps, policy and class context', async () => {
  const ctx = context();
  assert.equal((await post(ctx, payload())).body.success, true);
  for (const extra of [{ raw_answers: { q1: 'B', q3: '1,5' } },
    { raw_answers: { q1: 'A', q3: '1,50' } }, { started_at: new Date(epoch - 60000).toISOString() },
    { submitted_at: new Date(epoch + 1000).toISOString() }, { duration_seconds: 31 }, { policy_version: 'other' }]) {
    assert.equal((await post(ctx, { ...payload(), ...extra })).body.error, 'PAYLOAD_CONFLICT');
  }
  assert.equal((await post(ctx, { ...payload(), raw_answers: { q3: '1,5', q1: 'A' } })).body.status, 'ALREADY_RECORDED');
  assert.equal((await ctx.store.getResult('attempt-68'))?.raw_answers_json, JSON.stringify(payload().raw_answers));
});

test('CK68-F02: canonical JSON preserves raw answer strings without numeric or whitespace normalization', async () => {
  for (const [first, second] of [['1', 1], ['-0', '0'], [' 1,5', '1,5'], ['true', true]]) {
    const ctx = context();
    assert.equal((await post(ctx, { ...payload(), raw_answers: { q3: first } })).body.success, true);
    assert.equal((await post(ctx, { ...payload(), raw_answers: { q3: second } })).body.error, 'PAYLOAD_CONFLICT');
  }
});

test('CK68-F02: legacy retries without submitted_at retain the first server timestamp', async () => {
  const ctx = context();
  const { submitted_at, ...body } = payload();
  const first = await post(ctx, body);
  assert.equal(first.body.success, true);
  const second = await post({ ...ctx, now: () => epoch + 1000 }, body);
  assert.equal(second.body.status, 'ALREADY_RECORDED');
  assert.equal(second.body.recorded_at, first.body.recorded_at);
});

test('CK68-F01: separate Neon instances acknowledge only the winning persisted row', async () => {
  let persisted: ResultRecord | undefined;
  const columns = ['attempt_id', 'exam_id', 'exam_version_id', 'candidate_display', 'started_at', 'submitted_at',
    'duration_seconds', 'score_p1', 'max_p1', 'score_p2', 'max_p2', 'score_p3', 'max_p3', 'total', 'maxTotal',
    'policy_version', 'raw_answers_json', 'class_code', 'assignment_id', 'recorded_at'];
  const fetchImpl: typeof fetch = async (_url, init) => {
    const { query, params } = JSON.parse(String(init?.body));
    let rows: unknown[] = [];
    if (query.startsWith('INSERT INTO results')) {
      assert.match(query, /ON CONFLICT \(attempt_id\) DO NOTHING RETURNING/);
      if (!persisted) {
        persisted = Object.fromEntries(columns.map((name, i) => [name, params[i]])) as unknown as ResultRecord;
        rows = [persisted];
      }
    } else if (query.startsWith('SELECT')) rows = persisted ? [persisted] : [];
    return new Response(JSON.stringify({ rows }));
  };
  const make = (): RequestContext => ({ ...context(), store: createNeonStore({ connectionString: 'postgres://user:pass@example.invalid/db', fetch: fetchImpl }) });
  const results = await Promise.all([post(make(), payload()), post(make(), { ...payload(), candidate_display: 'B' })]);
  assert.equal(results.filter(r => r.body.success).length, 1);
  assert.equal(results.find(r => !r.body.success)?.body.error, 'PAYLOAD_CONFLICT');
  assert.equal((await post(make(), payload())).body.status, 'ALREADY_RECORDED');
});

test('CK68-F03: Neon republish updates every mutable metadata column', async () => {
  const store = createNeonStore({ connectionString: 'postgres://user:pass@example.invalid/db', fetch: async (_url, init) => {
    const { query } = JSON.parse(String(init?.body));
    if (query.startsWith('INSERT INTO exams')) {
      const update = query.split('DO UPDATE SET')[1];
      for (const column of ['title', 'subject', 'grade', 'duration_minutes', 'question_count', '"group"', 'exam_json']) {
        assert.ok(update.includes(`${column} = EXCLUDED.${column}`), column);
      }
      return new Response(JSON.stringify({ rows: [{ revision: 2 }] }));
    }
    return new Response(JSON.stringify({ rows: [] }));
  } });
  assert.deepEqual(await store.saveExam({ id: 'exam', title: 'Updated', subject: 'Lý', grade: 12,
    durationMinutes: 30, questionCount: 8, group: 'B', revision: 2, updatedAt: new Date(epoch).toISOString(),
    owner: 'teacher', examJson: '{}' }), { ok: true, revision: 2 });
});
