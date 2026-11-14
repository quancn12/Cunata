import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLegacyStorageKey,
  buildDraftKey,
  buildFinalKey,
  buildPointerKey,
  buildHistoryKey,
  buildSnapshotKey,
} from '../../../src/storage/migrate.ts';

describe('Migration — Key parsing and identity encoding', () => {
  it('parses legacy root and fixed storage keys', () => {
    assert.deepEqual(parseLegacyStorageKey('cunata_exam_attempt_v1'), {
      key: 'cunata_exam_attempt_v1',
      type: 'legacy_root',
    });

    assert.deepEqual(parseLegacyStorageKey('cunata:active_exam_snapshot'), {
      key: 'cunata:active_exam_snapshot',
      type: 'active_snapshot',
    });

    assert.deepEqual(parseLegacyStorageKey('cunata:active_exam_id'), {
      key: 'cunata:active_exam_id',
      type: 'active_exam_id',
    });

    assert.deepEqual(parseLegacyStorageKey('cunata:question_bank'), {
      key: 'cunata:question_bank',
      type: 'bank',
    });
  });

  it('correctly builds and parses draft keys with standard IDs', () => {
    const draftKey = buildDraftKey('exam-toan-01', 'v1.0.0', 'att-uuid-001');
    assert.equal(draftKey, 'cunata:attempt:exam-toan-01:v1.0.0:att-uuid-001');

    const parsed = parseLegacyStorageKey(draftKey);
    assert.equal(parsed.type, 'draft_attempt');
    assert.equal(parsed.examId, 'exam-toan-01');
    assert.equal(parsed.examVersionId, 'v1.0.0');
    assert.equal(parsed.attemptId, 'att-uuid-001');
  });

  it('correctly builds and parses final keys with standard IDs', () => {
    const finalKey = buildFinalKey('exam-toan-01', 'v1.0.0', 'att-uuid-001');
    assert.equal(finalKey, 'cunata:final:exam-toan-01:v1.0.0:att-uuid-001');

    const parsed = parseLegacyStorageKey(finalKey);
    assert.equal(parsed.type, 'final_attempt');
    assert.equal(parsed.examId, 'exam-toan-01');
    assert.equal(parsed.examVersionId, 'v1.0.0');
    assert.equal(parsed.attemptId, 'att-uuid-001');
  });

  it('preserves colons and special characters in IDs without delimiter confusion', () => {
    // When IDs contain colons, spaces, Unicode, or slashes, encodeURIComponent converts colons to %3A
    const examId = 'exam:math:complex:2025';
    const version = 'v1:beta/patch 1';
    const attemptId = 'attempt:user:123#special';

    const draftKey = buildDraftKey(examId, version, attemptId);
    assert.ok(draftKey.includes('exam%3Amath%3Acomplex%3A2025'));
    assert.ok(draftKey.includes('attempt%3Auser%3A123%23special'));

    const parsed = parseLegacyStorageKey(draftKey);
    assert.equal(parsed.type, 'draft_attempt');
    assert.equal(parsed.examId, examId);
    assert.equal(parsed.examVersionId, version);
    assert.equal(parsed.attemptId, attemptId);

    const finalKey = buildFinalKey(examId, version, attemptId);
    const parsedFinal = parseLegacyStorageKey(finalKey);
    assert.equal(parsedFinal.type, 'final_attempt');
    assert.equal(parsedFinal.examId, examId);
    assert.equal(parsedFinal.examVersionId, version);
    assert.equal(parsedFinal.attemptId, attemptId);
  });

  it('correctly builds and parses pointer, history, and snapshot keys', () => {
    const pKey = buildPointerKey('exam-01', 'v2');
    assert.equal(pKey, 'cunata:active_attempt:exam-01:v2');
    const parsedP = parseLegacyStorageKey(pKey);
    assert.equal(parsedP.type, 'active_pointer');
    assert.equal(parsedP.examId, 'exam-01');
    assert.equal(parsedP.examVersionId, 'v2');

    const hKey = buildHistoryKey('exam-01', 'v2');
    assert.equal(hKey, 'cunata:history:exam-01:v2');
    const parsedH = parseLegacyStorageKey(hKey);
    assert.equal(parsedH.type, 'history');
    assert.equal(parsedH.examId, 'exam-01');
    assert.equal(parsedH.examVersionId, 'v2');

    const sKey = buildSnapshotKey('exam-01', 'v2');
    assert.equal(sKey, 'cunata:snapshot:exam-01:v2');
    const parsedS = parseLegacyStorageKey(sKey);
    assert.equal(parsedS.type, 'snapshot');
    assert.equal(parsedS.examId, 'exam-01');
    assert.equal(parsedS.examVersionId, 'v2');
  });

  it('marks unknown or malformed keys as unknown', () => {
    assert.equal(parseLegacyStorageKey('some_random_key').type, 'unknown');
    assert.equal(parseLegacyStorageKey('cunata:attempt:only-one-part').type, 'unknown');
    assert.equal(parseLegacyStorageKey('cunata:final:part1:part2').type, 'unknown');
    assert.equal(parseLegacyStorageKey('cunata:active_attempt:one').type, 'unknown');
    assert.equal(parseLegacyStorageKey('cunata:history:one:two:three').type, 'unknown');
  });
});
