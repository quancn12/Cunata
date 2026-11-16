import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// FEAT-appsscript: mocks select KetQua by name per WEB-contract 17.3; regression assertions unchanged.
const appsScriptPath = path.resolve('apps-script/Code.js');
const code = fs.readFileSync(appsScriptPath, 'utf8');

function loadAppsScriptContext() {
  const sandbox: Record<string, any> = {
    SpreadsheetApp: {},
    LockService: {},
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (str: string) => ({
        setMimeType: () => ({ body: str })
      })
    },
    console: console,
    Date: Date,
    JSON: JSON,
    String: String,
    Math: Math
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

const ctx = loadAppsScriptContext();
const {
  sanitizeSheetCell,
  findRowByAttemptId,
  ensureHeaderRow,
  formatRecordRow,
  doPost,
  doGet,
  DANGEROUS_TRIGGERS
} = ctx;

describe('Apps Script Collector — CWE-1236 Formula Injection & Idempotency', () => {
  describe('sanitizeSheetCell', () => {
    it('protects Part III negative answer "-0,5" by prefixing single quote', () => {
      const sanitized = sanitizeSheetCell('-0,5');
      assert.equal(sanitized, "'-0,5", 'Negative decimal -0,5 must be prefixed with single quote to prevent formula calculation');
    });

    it('protects formula injection attempts starting with dangerous triggers', () => {
      assert.equal(sanitizeSheetCell('=SUM(A1:B10)'), "'=SUM(A1:B10)");
      assert.equal(sanitizeSheetCell('+12345'), "'+12345");
      assert.equal(sanitizeSheetCell('@IMPORTXML("url", "//a")'), "'@IMPORTXML(\"url\", \"//a\")");
      assert.equal(sanitizeSheetCell('\tmaliciousTab'), "'\tmaliciousTab");
      assert.equal(sanitizeSheetCell('\rnewlineTrigger'), "'\rnewlineTrigger");
      assert.equal(sanitizeSheetCell('\nlineFeedTrigger'), "'\nlineFeedTrigger");
      assert.equal(sanitizeSheetCell('＝FULLWIDTH_EQUAL'), "'＝FULLWIDTH_EQUAL");
      assert.equal(sanitizeSheetCell('＋FULLWIDTH_PLUS'), "'＋FULLWIDTH_PLUS");
      assert.equal(sanitizeSheetCell('－FULLWIDTH_MINUS'), "'－FULLWIDTH_MINUS");
      assert.equal(sanitizeSheetCell('＠FULLWIDTH_AT'), "'＠FULLWIDTH_AT");
    });

    it('leaves safe values untouched', () => {
      assert.equal(sanitizeSheetCell('1,5'), '1,5');
      assert.equal(sanitizeSheetCell('Nguyen Van A'), 'Nguyen Van A');
      assert.equal(sanitizeSheetCell('Toán 12 — GDPT 2018'), 'Toán 12 — GDPT 2018');
      assert.equal(sanitizeSheetCell(''), '');
      assert.equal(sanitizeSheetCell(null), '');
      assert.equal(sanitizeSheetCell(undefined), '');
      assert.equal(sanitizeSheetCell(100), '100');
    });
  });

  describe('formatRecordRow', () => {
    it('correctly maps 17 standard columns (A–Q) with sanitized entries', () => {
      const payload = {
        attempt_id: 'att-12345-uuid',
        exam_id: 'exam-toan-12',
        exam_version_id: 'v1.0',
        candidate_display: '-0,5 Candidate',
        started_at: '2026-11-14T08:00:00.000Z',
        submitted_at: '2026-11-14T08:45:00.000Z',
        duration_seconds: 2700,
        score_p1: '1/2',
        max_p1: '1',
        score_p2: '1',
        max_p2: '2',
        score_p3: '-0,5',
        max_p3: '7',
        total_score: '8',
        max_total: '10',
        policy_version: 'custom-v1',
        raw_answers_json: { q1: 'A', q8: '-0,5' }
      };

      const row = formatRecordRow(payload);
      assert.equal(row.length, 17, 'Row must match the 17 formatted fields (A–Q) of the record schema');
      assert.equal(row[0], 'att-12345-uuid', 'Col A: attempt_id');
      assert.equal(row[1], 'exam-toan-12', 'Col B: exam_id');
      assert.equal(row[2], 'v1.0', 'Col C: exam_version_id');
      assert.equal(row[3], "'-0,5 Candidate", 'Col D: candidate_display sanitized');
      assert.equal(row[4], '2026-11-14T08:00:00.000Z', 'Col E: started_at');
      assert.equal(row[5], '2026-11-14T08:45:00.000Z', 'Col F: submitted_at');
      assert.equal(row[6], 2700, 'Col G: duration_seconds');
      assert.equal(row[7], '1/2', 'Col H: score_p1');
      assert.equal(row[8], '1', 'Col I: max_p1');
      assert.equal(row[9], '1', 'Col J: score_p2');
      assert.equal(row[10], '2', 'Col K: max_p2');
      assert.equal(row[11], "'-0,5", 'Col L: score_p3 sanitized');
      assert.equal(row[12], '7', 'Col M: max_p3');
      assert.equal(row[13], '8', 'Col N: total_score');
      assert.equal(row[14], '10', 'Col O: max_total');
      assert.equal(row[15], 'custom-v1', 'Col P: policy_version');
    });
  });

  describe('findRowByAttemptId & ensureHeaderRow (Mock Google Sheet)', () => {
    it('detects existing attempt_id to enforce idempotency and prevents duplicate rows', () => {
      const rows: any[][] = [];
      const mockSheet = {
        getLastRow: () => rows.length,
        getRange: (startRow: number, startCol: number, numRows: number, numCols: number) => {
          const sCol = (typeof startCol === 'number' && startCol > 0) ? startCol - 1 : 0;
          const nCols = (typeof numCols === 'number' && numCols > 0) ? numCols : 1;
          const nRows = (typeof numRows === 'number' && numRows > 0) ? numRows : 1;
          return {
            getValues: () => rows.slice(startRow - 1, startRow - 1 + nRows).map(r => r.slice(sCol, sCol + nCols))
          };
        },
        appendRow: (row: any[]) => {
          rows.push(row);
        }
      };

      // Empty sheet
      assert.equal(findRowByAttemptId(mockSheet, 'att-01'), -1);

      // Header row
      rows.push(['attempt_id', 'exam_id', 'exam_version_id']);
      assert.equal(findRowByAttemptId(mockSheet, 'att-01'), -1);

      // Add attempt
      rows.push(['att-01', 'exam-1', 'v1']);
      rows.push(['att-02', 'exam-1', 'v1']);

      assert.equal(findRowByAttemptId(mockSheet, 'att-01'), 2);
      assert.equal(findRowByAttemptId(mockSheet, 'att-02'), 3);
      assert.equal(findRowByAttemptId(mockSheet, 'att-03'), -1);
    });
  });

  describe('doPost & doGet Request Handlers & Concurrency Control', () => {
    function createMockEnvironment(options: { lockSuccess?: boolean; existingRows?: any[][] } = {}) {
      const rows: any[][] = options.existingRows ? [...options.existingRows] : [];
      let lockReleased = false;

      const mockSheet = {
        getLastRow: () => rows.length,
        getRange: (startRow: number, startCol: number, numRows: number, numCols: number) => {
          const sCol = (typeof startCol === 'number' && startCol > 0) ? startCol - 1 : 0;
          const nCols = (typeof numCols === 'number' && numCols > 0) ? numCols : 1;
          const nRows = (typeof numRows === 'number' && numRows > 0) ? numRows : 1;
          return {
            getValues: () => rows.slice(startRow - 1, startRow - 1 + nRows).map(r => r.slice(sCol, sCol + nCols))
          };
        },
        appendRow: (row: any[]) => {
          rows.push(row);
        }
      };

      const mockLock = {
        tryLock: (_timeout: number) => options.lockSuccess !== false,
        releaseLock: () => { lockReleased = true; }
      };

      const sandbox: Record<string, any> = {
        SpreadsheetApp: {
          getActiveSpreadsheet: () => ({
            getSheetByName: (name: string) => { assert.equal(name, 'KetQua'); return mockSheet; }
          }),
          flush: () => {}
        },
        LockService: {
          getScriptLock: () => mockLock
        },
        ContentService: {
          MimeType: { JSON: 'application/json' },
          createTextOutput: (str: string) => ({
            body: str,
            setMimeType: () => ({ body: str })
          })
        },
        console: console,
        Date: Date,
        JSON: JSON,
        String: String,
        Math: Math
      };

      vm.createContext(sandbox);
      vm.runInContext(code, sandbox);
      return { sandbox, rows, mockSheet, mockLock, getLockReleased: () => lockReleased };
    }

    it('doPost records new valid submission and releases ScriptLock (status: NEWLY_RECORDED)', () => {
      const env = createMockEnvironment();
      const payload = {
        attempt_id: 'att-round17-new',
        exam_id: 'exam-thpt-toan-01',
        exam_version_id: 'v1.0.0',
        candidate_display: 'Trần Văn Thi',
        duration_seconds: 2400,
        sections: {
          I: { score: '2', max: '2' },
          II: { score: '2', max: '2' },
          III: { score: '4', max: '6' }
        },
        total: '8',
        maxTotal: '10'
      };

      const postEvent = { postData: { contents: JSON.stringify(payload) } };
      const output = env.sandbox.doPost(postEvent);
      const res = JSON.parse(output.body);

      assert.equal(res.success, true);
      assert.equal(res.status, 'NEWLY_RECORDED');
      assert.equal(res.attempt_id, 'att-round17-new');
      assert.ok(res.recorded_at, 'Must contain ISO timestamp');

      // Sheet must now have header row (idx 0) and data row (idx 1)
      assert.equal(env.rows.length, 2);
      const dataRow = env.rows[1]!;
      assert.equal(dataRow[0], 'att-round17-new');
      assert.equal(dataRow[3], 'Trần Văn Thi');
      assert.equal(env.getLockReleased(), true, 'Lock must be released');
    });

    it('doPost preserves idempotency on duplicate attempt_id and returns ALREADY_RECORDED', () => {
      const env = createMockEnvironment();
      const payload = {
        attempt_id: 'att-idempotent-01',
        exam_id: 'exam-thpt-toan-01',
        exam_version_id: 'v1.0.0',
        candidate_display: 'Học sinh kiểm tra idempotency',
        sections: {
          I: { score: '1', max: '2' },
          II: { score: '1', max: '2' },
          III: { score: '3', max: '6' }
        },
        total: '5',
        maxTotal: '10'
      };

      const postEvent = { postData: { contents: JSON.stringify(payload) } };

      // 1. First submission
      const out1 = env.sandbox.doPost(postEvent);
      const res1 = JSON.parse(out1.body);
      assert.equal(res1.success, true);
      assert.equal(res1.status, 'NEWLY_RECORDED');
      assert.equal(env.rows.length, 2);

      // 2. Retry / duplicate submission with same attempt_id
      const out2 = env.sandbox.doPost(postEvent);
      const res2 = JSON.parse(out2.body);
      assert.equal(res2.success, true);
      assert.equal(res2.status, 'ALREADY_RECORDED');
      assert.equal(res2.attempt_id, 'att-idempotent-01');

      // Row count must NOT increase
      assert.equal(env.rows.length, 2, 'No duplicate row must be inserted');
      assert.equal(env.getLockReleased(), true, 'Lock must be released after duplicate check');
    });

    it('doPost parses parameter.payload for form fallback', () => {
      const env = createMockEnvironment();
      const payload = {
        attempt_id: 'att-param-fallback',
        exam_id: 'exam-thpt-toan-01',
        exam_version_id: 'v1.0.0',
        candidate_display: 'Thí sinh gửi qua form',
        sections: {
          I: { score: '2', max: '2' },
          II: { score: '2', max: '2' },
          III: { score: '4', max: '6' }
        },
        total: '8',
        maxTotal: '10'
      };

      const postEvent = { parameter: { payload: JSON.stringify(payload) } };
      const out = env.sandbox.doPost(postEvent);
      const res = JSON.parse(out.body);

      assert.equal(res.success, true);
      assert.equal(res.status, 'NEWLY_RECORDED');
      assert.equal(env.rows.length, 2);
      const dataRow = env.rows[1]!;
      assert.equal(dataRow[0], 'att-param-fallback');
    });

    it('doPost returns error on missing or malformed payload', () => {
      const env = createMockEnvironment();

      // Malformed json
      const outBadJson = env.sandbox.doPost({ postData: { contents: '{bad json' } });
      const resBad = JSON.parse(outBadJson.body);
      assert.equal(resBad.success, false);
      assert.equal(resBad.error, 'SERVER_ERROR');

      // Empty payload
      const outEmpty = env.sandbox.doPost({});
      const resEmpty = JSON.parse(outEmpty.body);
      assert.equal(resEmpty.success, false);
      assert.equal(resEmpty.error, 'INVALID_PAYLOAD');

      // Missing attempt_id
      const outNoId = env.sandbox.doPost({ postData: { contents: JSON.stringify({ exam_id: '1' }) } });
      const resNoId = JSON.parse(outNoId.body);
      assert.equal(resNoId.success, false);
      assert.equal(resNoId.error, 'MISSING_ATTEMPT_ID');
    });

    it('doPost returns SERVER_BUSY when ScriptLock cannot be acquired', () => {
      const env = createMockEnvironment({ lockSuccess: false });
      const payload = {
        attempt_id: 'att-lock-fail',
        exam_id: 'exam-thpt-toan-01',
        exam_version_id: 'v1.0.0',
        sections: {
          I: { score: '2', max: '2' },
          II: { score: '2', max: '2' },
          III: { score: '4', max: '6' }
        },
        total: '8',
        maxTotal: '10'
      };

      const out = env.sandbox.doPost({ postData: { contents: JSON.stringify(payload) } });
      const res = JSON.parse(out.body);

      assert.equal(res.success, false);
      assert.equal(res.error, 'SERVER_BUSY');
    });

    it('LC33-F01 regression: rejects payloads missing exam_id or sections and detects same-ID payload conflict', () => {
      const env = createMockEnvironment();

      // 1. Missing exam_id and sections
      const outMissing = env.sandbox.doPost({
        postData: { contents: JSON.stringify({ attempt_id: 'missing', total: '1', maxTotal: '10' }) }
      });
      const resMissing = JSON.parse(outMissing.body);
      assert.equal(resMissing.success, false);
      assert.equal(resMissing.error, 'MISSING_EXAM_ID');

      // 2. Unvalidated section aliases with score exceeding max
      const outAliases = env.sandbox.doPost({
        postData: { contents: JSON.stringify({
          attempt_id: 'aliases',
          exam_id: 'exam-1',
          exam_version_id: 'v1',
          total: '1',
          maxTotal: '10',
          score_p1: '999',
          max_p1: '1'
        }) }
      });
      const resAliases = JSON.parse(outAliases.body);
      assert.equal(resAliases.success, false);
      assert.ok(resAliases.error === 'INCOMPLETE_SECTIONS' || resAliases.error === 'SECTION_SCORE_EXCEEDS_MAX');

      // 3. Positive recording of attempt
      const basePayload = {
        attempt_id: 'same-id-att',
        exam_id: 'exam-A',
        exam_version_id: 'v1.0.0',
        sections: {
          I: { score: '1', max: '1' },
          II: { score: '0', max: '4' },
          III: { score: '0', max: '5' }
        },
        total: '1',
        maxTotal: '10',
        raw_answers_json: { q: '1' }
      };
      const outBase = env.sandbox.doPost({ postData: { contents: JSON.stringify(basePayload) } });
      assert.equal(JSON.parse(outBase.body).status, 'NEWLY_RECORDED');

      // 4. Retry with SAME attempt_id and totals, but changed exam_id or raw_answers
      const conflictingPayload = {
        ...basePayload,
        exam_id: 'exam-B',
        raw_answers_json: { q: '2' }
      };
      const outConflict = env.sandbox.doPost({ postData: { contents: JSON.stringify(conflictingPayload) } });
      const resConflict = JSON.parse(outConflict.body);
      assert.equal(resConflict.success, false);
      assert.equal(resConflict.error, 'PAYLOAD_CONFLICT', 'Conflicting payload with changed exam/raw must be rejected');

      // 5. Retry with exact duplicate payload
      const outRetry = env.sandbox.doPost({ postData: { contents: JSON.stringify(basePayload) } });
      assert.equal(JSON.parse(outRetry.body).status, 'ALREADY_RECORDED');
    });

    it('LC34-F02 regression: detects payload conflict without bypass when attempt_id equals total score string', () => {
      const env = createMockEnvironment();
      const p1 = {
        attempt_id: '1',
        exam_id: 'exam-1',
        exam_version_id: 'v1.0.0',
        total: '1',
        maxTotal: '10',
        sections: {
          I: { score: '1', max: '1' },
          II: { score: '0', max: '0' },
          III: { score: '0', max: '9' }
        }
      };
      const res1 = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(p1) } }).body);
      assert.equal(res1.status, 'NEWLY_RECORDED');

      // Retry same attempt_id ('1') but with changed total ('2')
      const p2 = {
        ...p1,
        total: '2',
        sections: {
          I: { score: '1', max: '1' },
          II: { score: '1', max: '1' },
          III: { score: '0', max: '8' }
        }
      };
      const res2 = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(p2) } }).body);
      assert.equal(res2.success, false);
      assert.equal(res2.error, 'PAYLOAD_CONFLICT', 'Must detect payload conflict even when attempt_id equals total score');
    });

    it('LC33-F06 regression: header row is never written outside lock and not created on invalid request', () => {
      let lockedDuringAppend = false;
      let appendCalls = 0;
      let currentLocked = false;
      const rows: any[][] = [];

      const mockSheet = {
        getLastRow: () => rows.length,
        getRange: (startRow: number, startCol: number, numRows: number, numCols: number) => {
          const sCol = (typeof startCol === 'number' && startCol > 0) ? startCol - 1 : 0;
          const nCols = (typeof numCols === 'number' && numCols > 0) ? numCols : 1;
          const nRows = (typeof numRows === 'number' && numRows > 0) ? numRows : 1;
          return {
            getValues: () => rows.slice(startRow - 1, startRow - 1 + nRows).map(r => r.slice(sCol, sCol + nCols))
          };
        },
        appendRow: (row: any[]) => {
          appendCalls++;
          lockedDuringAppend = currentLocked;
          rows.push(row);
        }
      };

      const mockLock = {
        tryLock: () => { currentLocked = true; return true; },
        releaseLock: () => { currentLocked = false; }
      };

      const sandbox: Record<string, any> = {
        SpreadsheetApp: {
          getActiveSpreadsheet: () => ({ getSheetByName: (name: string) => { assert.equal(name, 'KetQua'); return mockSheet; } }),
          flush: () => {}
        },
        LockService: { getScriptLock: () => mockLock },
        ContentService: {
          MimeType: { JSON: 'application/json' },
          createTextOutput: (str: string) => ({ body: str, setMimeType: () => ({ body: str }) })
        },
        console: console,
        Date: Date,
        JSON: JSON,
        String: String,
        Math: Math
      };

      vm.createContext(sandbox);
      vm.runInContext(code, sandbox);

      // Invalid request on cold sheet must NOT write headers
      sandbox.doPost({ postData: { contents: '{bad json' } });
      assert.equal(rows.length, 0, 'No header row must be written when payload is invalid');
      assert.equal(appendCalls, 0);

      // Valid request on cold sheet writes header while holding lock
      sandbox.doPost({
        postData: { contents: JSON.stringify({
          attempt_id: 'cold-att-01',
          exam_id: 'exam-1',
          exam_version_id: 'v1',
          sections: {
            I: { score: '10/3', max: '10/3' },
            II: { score: '0', max: '0' },
            III: { score: '0', max: '20/3' }
          },
          total: '10/3',
          maxTotal: '10'
        }) }
      });
      assert.equal(rows.length, 2, 'Must have header row (idx 0) and data row (idx 1)');
      assert.equal(rows[0]![0], 'attempt_id');
      assert.equal(rows[1]![0], 'cold-att-01');
      assert.equal(rows[1]![7], '10/3');
      assert.equal(lockedDuringAppend, true, 'appendRow must always be executed under ScriptLock');
    });

    it('LC34-F02 regression: fails closed with STORAGE_READ_ERROR if reading existing record throws error', () => {
      const rows: any[][] = [
        ['attempt_id', 'exam_id', 'exam_version_id'],
        ['att-throw-01', 'exam-1', 'v1']
      ];
      const mockSheet = {
        getLastRow: () => rows.length,
        getRange: (startRow: number, startCol: number, numRows: number, numCols: number) => {
          if (startCol === 1 && numCols === 1) {
            // findRowByAttemptId uses column 1
            return {
              getValues: () => rows.slice(startRow - 1, startRow - 1 + (numRows || 1)).map(r => [r[0]])
            };
          }
          // Any other read throws storage error
          throw new Error('Google Spreadsheet Service Unavailable');
        },
        appendRow: (row: any[]) => { rows.push(row); }
      };
      const mockLock = {
        tryLock: () => true,
        releaseLock: () => {}
      };
      const sandbox: Record<string, any> = {
        SpreadsheetApp: {
          getActiveSpreadsheet: () => ({ getSheetByName: (name: string) => { assert.equal(name, 'KetQua'); return mockSheet; } }),
          flush: () => {}
        },
        LockService: { getScriptLock: () => mockLock },
        ContentService: {
          MimeType: { JSON: 'application/json' },
          createTextOutput: (str: string) => ({ body: str, setMimeType: () => ({ body: str }) })
        },
        console: console,
        Date: Date,
        JSON: JSON,
        String: String,
        Math: Math
      };
      vm.createContext(sandbox);
      vm.runInContext(code, sandbox);

      const p = {
        attempt_id: 'att-throw-01',
        exam_id: 'exam-1',
        exam_version_id: 'v1',
        total: '10',
        maxTotal: '10',
        sections: {
          I: { score: '10', max: '10' },
          II: { score: '0', max: '0' },
          III: { score: '0', max: '0' }
        }
      };
      const out = JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(p) } }).body);
      assert.equal(out.success, false);
      assert.equal(out.error, 'STORAGE_READ_ERROR', 'Must fail closed when existing row cannot be verified');
    });

    it('LC34-F03 regression: strictly rejects incomplete payloads (score-only, exam-only, missing-version, omitted-sections, missing-total)', () => {
      const env = createMockEnvironment();

      // 1. score-only: missing exam_id and exam_version_id and sections
      const rScoreOnly = JSON.parse(env.sandbox.doPost({
        postData: { contents: JSON.stringify({ attempt_id: 'score-only', total: '1', maxTotal: '10' }) }
      }).body);
      assert.equal(rScoreOnly.success, false);
      assert.equal(rScoreOnly.error, 'MISSING_EXAM_ID');

      // 2. exam-only: missing total and maxTotal
      const rExamOnly = JSON.parse(env.sandbox.doPost({
        postData: { contents: JSON.stringify({ attempt_id: 'exam-only', exam_id: 'E' }) }
      }).body);
      assert.equal(rExamOnly.success, false);
      assert.equal(rExamOnly.error, 'MISSING_SCORE');

      // 3. missing-version: has exam_id, score, sections, but missing exam_version_id
      const rMissingVer = JSON.parse(env.sandbox.doPost({
        postData: { contents: JSON.stringify({
          attempt_id: 'mv-01',
          exam_id: 'E',
          total: '1',
          maxTotal: '10',
          sections: {
            I: { score: '1', max: '1' },
            II: { score: '0', max: '0' },
            III: { score: '0', max: '9' }
          }
        }) }
      }).body);
      assert.equal(rMissingVer.success, false);
      assert.equal(rMissingVer.error, 'MISSING_EXAM_VERSION_ID');

      // 4. omitted-sections: has attempt_id, exam_id, exam_version_id, total, maxTotal, but no sections or section aliases
      const rOmittedSec = JSON.parse(env.sandbox.doPost({
        postData: { contents: JSON.stringify({
          attempt_id: 'os-01',
          exam_id: 'E',
          exam_version_id: 'v1',
          total: '1',
          maxTotal: '10'
        }) }
      }).body);
      assert.equal(rOmittedSec.success, false);
      assert.equal(rOmittedSec.error, 'INCOMPLETE_SECTIONS');

      // 5. Positive controls: single-part exam (N1=20, max=5), repeating fractions (10/3), and max 16
      const rPosPart1 = JSON.parse(env.sandbox.doPost({
        postData: { contents: JSON.stringify({
          attempt_id: 'pos-p1-01',
          exam_id: 'exam-math-12',
          exam_version_id: 'v1.0.0',
          total: '5',
          maxTotal: '5',
          sections: {
            I: { score: '5', max: '5' },
            II: { score: '0', max: '0' },
            III: { score: '0', max: '0' }
          }
        }) }
      }).body);
      assert.equal(rPosPart1.success, true);
      assert.equal(rPosPart1.status, 'NEWLY_RECORDED');

      const rPosRepeating = JSON.parse(env.sandbox.doPost({
        postData: { contents: JSON.stringify({
          attempt_id: 'pos-rep-01',
          exam_id: 'exam-rep',
          exam_version_id: 'v1',
          total: '10/3',
          maxTotal: '10',
          sections: {
            I: { score: '0', max: '0' },
            II: { score: '0', max: '0' },
            III: { score: '10/3', max: '10' }
          }
        }) }
      }).body);
      assert.equal(rPosRepeating.success, true);
      assert.equal(rPosRepeating.status, 'NEWLY_RECORDED');

      // Exact duplicate of repeating fraction -> ALREADY_RECORDED
      const rPosRepeatingDup = JSON.parse(env.sandbox.doPost({
        postData: { contents: JSON.stringify({
          attempt_id: 'pos-rep-01',
          exam_id: 'exam-rep',
          exam_version_id: 'v1',
          total: '10/3',
          maxTotal: '10',
          sections: {
            I: { score: '0', max: '0' },
            II: { score: '0', max: '0' },
            III: { score: '10/3', max: '10' }
          }
        }) }
      }).body);
      assert.equal(rPosRepeatingDup.success, true);
      assert.equal(rPosRepeatingDup.status, 'ALREADY_RECORDED');
    });

    it('LC35-F02 regression: detects conflict when raw_answers_json is omitted/changed, or policy_version changed', () => {
      const env = createMockEnvironment();
      const base = {
        attempt_id: 'att-lc35-f02',
        exam_id: 'exam-1',
        exam_version_id: 'v1.0.0',
        total: '1',
        maxTotal: '10',
        sections: {
          I: { score: '1', max: '1' },
          II: { score: '0', max: '0' },
          III: { score: '0', max: '9' }
        },
        raw_answers_json: { q: '1' },
        policy_version: 'custom-v1'
      };
      const r1 = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(base) } }).body);
      assert.equal(r1.status, 'NEWLY_RECORDED');

      // 1. Omit raw_answers_json -> must conflict
      const pOmitRaw = { ...base, raw_answers_json: undefined };
      const rOmit = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(pOmitRaw) } }).body);
      assert.equal(rOmit.success, false);
      assert.equal(rOmit.error, 'PAYLOAD_CONFLICT', 'Must detect conflict when raw_answers_json is omitted');

      // 2. Change policy_version -> must conflict
      const pDiffPolicy = { ...base, policy_version: 'policy-different' };
      const rPolicy = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(pDiffPolicy) } }).body);
      assert.equal(rPolicy.success, false);
      assert.equal(rPolicy.error, 'PAYLOAD_CONFLICT', 'Must detect conflict when policy_version differs');
    });

    it('LC35-F05 regression: canonical raw JSON sorting and rational reduction prevent false conflicts', () => {
      const env = createMockEnvironment();
      const pOrder1 = {
        attempt_id: 'att-lc35-order',
        exam_id: 'exam-order',
        exam_version_id: 'v1.0.0',
        total: '1',
        maxTotal: '10',
        sections: {
          I: { score: '1', max: '1' },
          II: { score: '0', max: '0' },
          III: { score: '0', max: '9' }
        },
        raw_answers_json: { q: '1', r: '2' }
      };
      const r1 = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(pOrder1) } }).body);
      assert.equal(r1.status, 'NEWLY_RECORDED');

      // Retry with same answers but reversed object keys insertion order -> ALREADY_RECORDED, NOT conflict!
      const pOrder2 = {
        ...pOrder1,
        raw_answers_json: { r: '2', q: '1' }
      };
      const r2 = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(pOrder2) } }).body);
      assert.equal(r2.success, true);
      assert.equal(r2.status, 'ALREADY_RECORDED', 'Reordered raw JSON keys must not trigger false conflict');

      // Rational reduction: 2/2 stored as canonical '1', retry with '1' -> ALREADY_RECORDED
      const pFraction = {
        attempt_id: 'att-lc35-fraction',
        exam_id: 'exam-frac',
        exam_version_id: 'v1.0.0',
        total: '2/2',
        maxTotal: '10',
        sections: {
          I: { score: '2/2', max: '1' },
          II: { score: '0', max: '0' },
          III: { score: '0', max: '9' }
        }
      };
      const rFrac1 = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(pFraction) } }).body);
      assert.equal(rFrac1.status, 'NEWLY_RECORDED');

      const pFracCanonical = {
        ...pFraction,
        total: '1',
        sections: {
          I: { score: '1', max: '1' },
          II: { score: '0', max: '0' },
          III: { score: '0', max: '9' }
        }
      };
      const rFrac2 = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(pFracCanonical) } }).body);
      assert.equal(rFrac2.success, true);
      assert.equal(rFrac2.status, 'ALREADY_RECORDED', '2/2 and 1 must be treated as identical rational numbers');
    });

    it('LC36-F02 regression: canonical raw JSON strictly preserves literal string characters, types, and distinguishes null from empty string', () => {
      // 1. '1' vs '1 ' (trailing space must trigger conflict, not collision)
      {
        const env = createMockEnvironment();
        const p1 = {
          attempt_id: 'att-lc36-space',
          exam_id: 'exam-e',
          exam_version_id: 'v1.0.0',
          total: '1',
          maxTotal: '10',
          sections: { I: { score: '0', max: '0' }, II: { score: '0', max: '0' }, III: { score: '1', max: '10' } },
          raw_answers_json: { q: '1' },
          policy_version: 'custom-v1'
        };
        const r1 = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(p1) } }).body);
        assert.equal(r1.status, 'NEWLY_RECORDED');

        const pRetry = { ...p1, raw_answers_json: { q: '1 ' } };
        const r2 = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(pRetry) } }).body);
        assert.equal(r2.success, false);
        assert.equal(r2.error, 'PAYLOAD_CONFLICT', "'1' and '1 ' must be recognized as distinct raw strings");
      }

      // 2. '-0' vs '0' (negative zero string must not collide with unsigned zero)
      {
        const env = createMockEnvironment();
        const p1 = {
          attempt_id: 'att-lc36-negzero',
          exam_id: 'exam-e',
          exam_version_id: 'v1.0.0',
          total: '1',
          maxTotal: '10',
          sections: { I: { score: '0', max: '0' }, II: { score: '0', max: '0' }, III: { score: '1', max: '10' } },
          raw_answers_json: { q: '-0' },
          policy_version: 'custom-v1'
        };
        const r1 = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(p1) } }).body);
        assert.equal(r1.status, 'NEWLY_RECORDED');

        const pRetry = { ...p1, raw_answers_json: { q: '0' } };
        const r2 = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(pRetry) } }).body);
        assert.equal(r2.success, false);
        assert.equal(r2.error, 'PAYLOAD_CONFLICT', "'-0' and '0' must be recognized as distinct raw strings");
      }

      // 3. '1,5' vs '1,50' (exact string representation of decimals)
      {
        const env = createMockEnvironment();
        const p1 = {
          attempt_id: 'att-lc36-decimal',
          exam_id: 'exam-e',
          exam_version_id: 'v1.0.0',
          total: '1',
          maxTotal: '10',
          sections: { I: { score: '0', max: '0' }, II: { score: '0', max: '0' }, III: { score: '1', max: '10' } },
          raw_answers_json: { q: '1,5' },
          policy_version: 'custom-v1'
        };
        const r1 = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(p1) } }).body);
        assert.equal(r1.status, 'NEWLY_RECORDED');

        const pRetry = { ...p1, raw_answers_json: { q: '1,50' } };
        const r2 = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(pRetry) } }).body);
        assert.equal(r2.success, false);
        assert.equal(r2.error, 'PAYLOAD_CONFLICT', "'1,5' and '1,50' must not collide");
      }

      // 4. string '1' vs number 1 (string vs number type fidelity)
      {
        const env = createMockEnvironment();
        const p1 = {
          attempt_id: 'att-lc36-types',
          exam_id: 'exam-e',
          exam_version_id: 'v1.0.0',
          total: '1',
          maxTotal: '10',
          sections: { I: { score: '0', max: '0' }, II: { score: '0', max: '0' }, III: { score: '1', max: '10' } },
          raw_answers_json: { q: '1' },
          policy_version: 'custom-v1'
        };
        const r1 = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(p1) } }).body);
        assert.equal(r1.status, 'NEWLY_RECORDED');

        const pRetry = { ...p1, raw_answers_json: { q: 1 } };
        const r2 = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(pRetry) } }).body);
        assert.equal(r2.success, false);
        assert.equal(r2.error, 'PAYLOAD_CONFLICT', "string '1' and number 1 must conflict");
      }

      // 5. null vs empty string '' (null and empty string are distinct)
      {
        const env = createMockEnvironment();
        const p1 = {
          attempt_id: 'att-lc36-null-empty',
          exam_id: 'exam-e',
          exam_version_id: 'v1.0.0',
          total: '1',
          maxTotal: '10',
          sections: { I: { score: '0', max: '0' }, II: { score: '0', max: '0' }, III: { score: '1', max: '10' } },
          raw_answers_json: { q: null },
          policy_version: 'custom-v1'
        };
        const r1 = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(p1) } }).body);
        assert.equal(r1.status, 'NEWLY_RECORDED');

        const pRetry = { ...p1, raw_answers_json: { q: '' } };
        const r2 = JSON.parse(env.sandbox.doPost({ postData: { contents: JSON.stringify(pRetry) } }).body);
        assert.equal(r2.success, false);
        assert.equal(r2.error, 'PAYLOAD_CONFLICT', "null and empty string must conflict");
      }
    });

    it('doGet returns HEALTHY service status and metadata', () => {
      const env = createMockEnvironment();
      const out = env.sandbox.doGet({});
      const res = JSON.parse(out.body);

      assert.equal(res.status, 'HEALTHY');
      assert.equal(res.version, '1.0.0');
      assert.ok(res.service.includes('Cunata'));
      assert.ok(res.time);
    });
  });
});
