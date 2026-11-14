import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const sampleCodePath = path.resolve('apps-script/sample/Code.js');
const sampleCode = fs.readFileSync(sampleCodePath, 'utf8');

function loadSampleContext() {
  const moduleObj: Record<string, any> = { exports: {} };
  const sandbox: Record<string, any> = {
    module: moduleObj,
    exports: moduleObj.exports,
    SpreadsheetApp: {},
    LockService: {},
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (str: string) => ({
        body: str,
        setMimeType: () => ({ body: str }),
      }),
    },
    console,
    Date,
    JSON,
    String,
    Math,
    BigInt,
  };
  vm.createContext(sandbox);
  vm.runInContext(sampleCode, sandbox);
  return moduleObj.exports;
}

const ctx = loadSampleContext();
const {
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
  doGet,
} = ctx;

describe('M4 Apps Script Sample — Simulated VM Tests & Security Safeguards', () => {
  describe('Contract Warnings & Undeployed Markers', () => {
    it('[Simulated] preserves exact Vietnamese undeployed/CORS warning in Code.js and doGet', () => {
      const contractWarning = 'chưa triển khai, chưa kiểm CORS thật';
      assert.ok(
        sampleCode.includes(contractWarning),
        `Code.js must preserve exact contract warning: "${contractWarning}"`
      );

      const getRes = doGet({});
      const parsed = JSON.parse(getRes.body);
      assert.equal(parsed.cors_warning, contractWarning);
      assert.equal(parsed.status, 'HEALTHY');
    });

    it('[Simulated] explains trusted server grading limitations in Code.js comments', () => {
      assert.ok(
        sampleCode.includes('TRUSTED SERVER GRADING LIMITATIONS'),
        'Code.js must document trusted server grading limitations'
      );
      assert.ok(
        sampleCode.includes('Client-Side Trust Boundary'),
        'Code.js must explain client-side trust boundaries'
      );
      assert.ok(
        sampleCode.includes('D04 / D08'),
        'Code.js must reference decisions D04 and D08'
      );
    });

    it('[Simulated] defines 18 standard columns matching tuple + payload_hash schema', () => {
      assert.equal(SAMPLE_HEADERS.length, 18);
      assert.equal(SAMPLE_HEADERS[0], 'attempt_id');
      assert.equal(SAMPLE_HEADERS[1], 'exam_id');
      assert.equal(SAMPLE_HEADERS[2], 'exam_version_id');
      assert.equal(SAMPLE_HEADERS[13], 'total_score');
      assert.equal(SAMPLE_HEADERS[14], 'max_total');
      assert.equal(SAMPLE_HEADERS[16], 'raw_answers_json');
      assert.equal(SAMPLE_HEADERS[17], 'payload_hash');
    });
  });

  describe('CWE-1236 Formula Injection Neutralization', () => {
    it('[Simulated] protects Part III negative answer "-0,5" by prefixing single quote', () => {
      const sanitized = sanitizeSheetCell('-0,5');
      assert.equal(
        sanitized,
        "'-0,5",
        'Negative decimal "-0,5" must be protected against formula evaluation'
      );
    });

    it('[Simulated] neutralizes dangerous spreadsheet formula triggers', () => {
      assert.equal(sanitizeSheetCell('=SUM(A1:B10)'), "'=SUM(A1:B10)");
      assert.equal(sanitizeSheetCell('+12345'), "'+12345");
      assert.equal(sanitizeSheetCell('-12.34'), "'-12.34");
      assert.equal(sanitizeSheetCell('@IMPORTXML("url", "//a")'), "'@IMPORTXML(\"url\", \"//a\")");
      assert.equal(sanitizeSheetCell('|PIPE_COMMAND'), "'|PIPE_COMMAND");
      assert.equal(sanitizeSheetCell('\tmaliciousTab'), "'\tmaliciousTab");
      assert.equal(sanitizeSheetCell('\rnewlineTrigger'), "'\rnewlineTrigger");
      assert.equal(sanitizeSheetCell('\nlineFeedTrigger'), "'\nlineFeedTrigger");
      assert.equal(sanitizeSheetCell('＝FULLWIDTH_EQUAL'), "'＝FULLWIDTH_EQUAL");
      assert.equal(sanitizeSheetCell('＋FULLWIDTH_PLUS'), "'＋FULLWIDTH_PLUS");
      assert.equal(sanitizeSheetCell('－FULLWIDTH_MINUS'), "'－FULLWIDTH_MINUS");
      assert.equal(sanitizeSheetCell('＠FULLWIDTH_AT'), "'＠FULLWIDTH_AT");
      assert.equal(sanitizeSheetCell('｜FULLWIDTH_PIPE'), "'｜FULLWIDTH_PIPE");
    });

    it('[Simulated] leaves safe text and numbers unmodified', () => {
      assert.equal(sanitizeSheetCell('1,5'), '1,5');
      assert.equal(sanitizeSheetCell('Trần Thị B'), 'Trần Thị B');
      assert.equal(sanitizeSheetCell('exam-toan-12'), 'exam-toan-12');
      assert.equal(sanitizeSheetCell(''), '');
      assert.equal(sanitizeSheetCell(null), '');
      assert.equal(sanitizeSheetCell(undefined), '');
      assert.equal(sanitizeSheetCell(250), '250');
    });
  });

  describe('BigInt Rational Arithmetic & Canonical Fractions', () => {
    it('[Simulated] correctly parses integers and fractions into reduced BigInt form', () => {
      const r1 = parseRational('10/4');
      assert.ok(r1);
      assert.equal(r1.num, 5n);
      assert.equal(r1.den, 2n);

      const r2 = parseRational('12');
      assert.ok(r2);
      assert.equal(r2.num, 12n);
      assert.equal(r2.den, 1n);

      const r3 = parseRational('0');
      assert.ok(r3);
      assert.equal(r3.num, 0n);
      assert.equal(r3.den, 1n);

      const r4 = parseRational('-3/6');
      assert.ok(r4);
      assert.equal(r4.num, -1n);
      assert.equal(r4.den, 2n);

      assert.equal(parseRational('invalid'), null);
      assert.equal(parseRational('5/0'), null);
    });

    it('[Simulated] adds and compares rational numbers accurately', () => {
      const a = parseRational('1/2');
      const b = parseRational('1/3');
      const sum = ratAdd(a, b);
      assert.ok(sum);
      assert.equal(sum.num, 5n);
      assert.equal(sum.den, 6n);

      assert.equal(ratCmp(parseRational('5/10'), parseRational('1/2')), 0);
      assert.equal(ratCmp(parseRational('2/3'), parseRational('3/4')), -1);
      assert.equal(ratCmp(parseRational('10/3'), parseRational('3')), 1);
    });

    it('[Simulated] converts canonical rational object to standard fraction string', () => {
      assert.equal(toCanonicalStr({ num: 5n, den: 1n }), '5');
      assert.equal(toCanonicalStr({ num: 10n, den: 3n }), '10/3');
      assert.equal(toCanonicalStr(null), '0');
    });
  });

  describe('Tuple Deduplication & Concurrency (LockService)', () => {
    function createMockEnvironment(options: {
      lockSuccess?: boolean;
      existingRows?: any[][];
    } = {}) {
      const rows: any[][] = options.existingRows ? options.existingRows.map(r => [...r]) : [];
      let lockReleased = false;

      const mockSheet = {
        getLastRow: () => rows.length,
        getRange: (startRow: number, startCol: number, numRows: number, numCols: number) => {
          const sCol = typeof startCol === 'number' && startCol > 0 ? startCol - 1 : 0;
          const nCols = typeof numCols === 'number' && numCols > 0 ? numCols : 1;
          const nRows = typeof numRows === 'number' && numRows > 0 ? numRows : 1;
          return {
            getValues: () =>
              rows.slice(startRow - 1, startRow - 1 + nRows).map(r => r.slice(sCol, sCol + nCols)),
          };
        },
        appendRow: (row: any[]) => {
          rows.push(row);
        },
      };

      const mockLock = {
        tryLock: (_timeout: number) => options.lockSuccess !== false,
        releaseLock: () => {
          lockReleased = true;
        },
      };

      const moduleObj: Record<string, any> = { exports: {} };
      const sandbox: Record<string, any> = {
        module: moduleObj,
        exports: moduleObj.exports,
        SpreadsheetApp: {
          getActiveSpreadsheet: () => ({
            getActiveSheet: () => mockSheet,
          }),
          flush: () => {},
        },
        LockService: {
          getScriptLock: () => mockLock,
        },
        ContentService: {
          MimeType: { JSON: 'application/json' },
          createTextOutput: (str: string) => ({
            body: str,
            setMimeType: () => ({ body: str }),
          }),
        },
        console,
        Date,
        JSON,
        String,
        Math,
        BigInt,
      };

      vm.createContext(sandbox);
      vm.runInContext(sampleCode, sandbox);

      return {
        sandbox: moduleObj.exports,
        rows,
        isLockReleased: () => lockReleased,
      };
    }

    const validPayload = {
      attempt_id: 'att-uuid-001',
      exam_id: 'exam-toan-12',
      exam_version_id: 'v1.0.0',
      candidate_display: 'Thí sinh A',
      started_at: '2026-11-14T08:00:00.000Z',
      submitted_at: '2026-11-14T08:45:00.000Z',
      duration_seconds: 2700,
      total_score: '8',
      max_total: '10',
      sections: {
        I: { score: '2', max: '3' },
        II: { score: '3', max: '4' },
        III: { score: '3', max: '3' },
      },
      policy_version: 'custom-v1',
      raw_answers_json: { q1: 'A', q2: '-0,5' },
      payloadHash: '1a2b3c4d5e6f7089',
    };

    it('[Simulated] doPost records new valid submission and returns Receipt with status recorded', () => {
      const env = createMockEnvironment();
      const res = env.sandbox.doPost({
        postData: { contents: JSON.stringify(validPayload) },
      });
      const data = JSON.parse(res.body);

      assert.equal(data.success, true);
      assert.equal(data.status, 'recorded');
      assert.equal(data.examId, validPayload.exam_id);
      assert.equal(data.examVersionId, validPayload.exam_version_id);
      assert.equal(data.attemptId, validPayload.attempt_id);
      assert.equal(data.payloadHash, validPayload.payloadHash);
      assert.ok(data.submissionId.startsWith('sub-'));
      assert.ok(!isNaN(Date.parse(data.receivedAt)));
      assert.equal(env.isLockReleased(), true);

      // Verify row appended: Header + Data = 2 rows
      assert.equal(env.rows.length, 2);
      const row = env.rows[1]!;
      assert.equal(row[0], validPayload.attempt_id);
      assert.equal(row[1], validPayload.exam_id);
      assert.equal(row[2], validPayload.exam_version_id);
      assert.equal(row[17], validPayload.payloadHash);
    });

    it('[Simulated] doPost preserves idempotency on duplicate submission with matching tuple and hash', () => {
      const env = createMockEnvironment();

      // First submission
      const res1 = env.sandbox.doPost({
        postData: { contents: JSON.stringify(validPayload) },
      });
      assert.equal(JSON.parse(res1.body).status, 'recorded');
      assert.equal(env.rows.length, 2);

      // Duplicate submission: same tuple + same hash
      const res2 = env.sandbox.doPost({
        postData: { contents: JSON.stringify(validPayload) },
      });
      const data2 = JSON.parse(res2.body);

      assert.equal(data2.success, true);
      assert.equal(data2.status, 'already_recorded');
      assert.equal(data2.examId, validPayload.exam_id);
      assert.equal(data2.examVersionId, validPayload.exam_version_id);
      assert.equal(data2.attemptId, validPayload.attempt_id);
      assert.equal(data2.payloadHash, validPayload.payloadHash);

      // No new row created
      assert.equal(env.rows.length, 2, 'Must not append duplicate row on idempotent retry');
    });

    it('[Simulated] doPost rejects payload with same tuple but conflicting payloadHash (PAYLOAD_CONFLICT)', () => {
      const env = createMockEnvironment();

      // First submission
      env.sandbox.doPost({
        postData: { contents: JSON.stringify(validPayload) },
      });
      assert.equal(env.rows.length, 2);

      // Second submission: same tuple, but different score/hash!
      const conflictingPayload = {
        ...validPayload,
        total_score: '9',
        sections: {
          I: { score: '3', max: '3' },
          II: { score: '3', max: '4' },
          III: { score: '3', max: '3' },
        },
        payloadHash: 'ffffffffffffffff',
      };

      const resConflict = env.sandbox.doPost({
        postData: { contents: JSON.stringify(conflictingPayload) },
      });
      const dataConflict = JSON.parse(resConflict.body);

      assert.equal(dataConflict.success, false);
      assert.equal(dataConflict.error, 'PAYLOAD_CONFLICT');
      assert.equal(dataConflict.examId, validPayload.exam_id);
      assert.equal(dataConflict.attemptId, validPayload.attempt_id);

      // Existing row must not be modified or overwritten!
      assert.equal(env.rows.length, 2);
      assert.equal(env.rows[1]![17], validPayload.payloadHash, 'Stored payloadHash must be unchanged');
    });

    it('[Simulated] isolates distinct exams: same attempt_id across different exam_id does NOT collide', () => {
      const env = createMockEnvironment();

      // Submission for Exam A
      env.sandbox.doPost({
        postData: { contents: JSON.stringify(validPayload) },
      });
      assert.equal(env.rows.length, 2);

      // Submission with same attempt_id for Exam B
      const examBPayload = {
        ...validPayload,
        exam_id: 'exam-vatly-12',
        payloadHash: '2b3c4d5e6f70891a',
      };

      const resB = env.sandbox.doPost({
        postData: { contents: JSON.stringify(examBPayload) },
      });
      const dataB = JSON.parse(resB.body);

      assert.equal(dataB.success, true);
      assert.equal(dataB.status, 'recorded');
      assert.equal(env.rows.length, 3, 'Different exam_id must record as separate row');
    });

    it('[Simulated] returns SERVER_BUSY when ScriptLock cannot be acquired', () => {
      const env = createMockEnvironment({ lockSuccess: false });
      const res = env.sandbox.doPost({
        postData: { contents: JSON.stringify(validPayload) },
      });
      const data = JSON.parse(res.body);

      assert.equal(data.success, false);
      assert.equal(data.error, 'SERVER_BUSY');
      assert.equal(env.rows.length, 0, 'No row must be appended when lock fails');
    });

    it('[Simulated] strictly validates section sums and total score consistency', () => {
      const env = createMockEnvironment();

      // Case: Section score sum (1+2+3=6) does not equal total (8)
      const invalidSumPayload = {
        ...validPayload,
        sections: {
          I: { score: '1', max: '3' },
          II: { score: '2', max: '4' },
          III: { score: '3', max: '3' },
        },
      };

      const res = env.sandbox.doPost({
        postData: { contents: JSON.stringify(invalidSumPayload) },
      });
      const data = JSON.parse(res.body);

      assert.equal(data.success, false);
      assert.equal(data.error, 'SECTION_SUM_MISMATCH');
      assert.equal(env.rows.length, 0);
    });

    it('[Simulated] strictly validates section max sums and maxTotal consistency', () => {
      const env = createMockEnvironment();

      // Case: Section max sum (3+4+5=12) does not equal max_total (10)
      const invalidMaxPayload = {
        ...validPayload,
        sections: {
          I: { score: '2', max: '3' },
          II: { score: '3', max: '4' },
          III: { score: '3', max: '5' },
        },
      };

      const res = env.sandbox.doPost({
        postData: { contents: JSON.stringify(invalidMaxPayload) },
      });
      const data = JSON.parse(res.body);

      assert.equal(data.success, false);
      assert.equal(data.error, 'SECTION_MAX_MISMATCH');
      assert.equal(env.rows.length, 0);
    });

    it('[Simulated] rejects submission when total score exceeds maxTotal', () => {
      const env = createMockEnvironment();

      const exceedPayload = {
        ...validPayload,
        total_score: '11',
        max_total: '10',
        sections: {
          I: { score: '4', max: '3' },
          II: { score: '4', max: '4' },
          III: { score: '3', max: '3' },
        },
      };

      const res = env.sandbox.doPost({
        postData: { contents: JSON.stringify(exceedPayload) },
      });
      const data = JSON.parse(res.body);

      assert.equal(data.success, false);
      assert.equal(data.error, 'SCORE_EXCEEDS_MAX');
      assert.equal(env.rows.length, 0);
    });

    it('[Simulated] parses payload from e.parameter.payload (HTML form fallback)', () => {
      const env = createMockEnvironment();
      const res = env.sandbox.doPost({
        parameter: { payload: JSON.stringify(validPayload) },
      });
      const data = JSON.parse(res.body);

      assert.equal(data.success, true);
      assert.equal(data.status, 'recorded');
      assert.equal(env.rows.length, 2);
    });
  });
});
