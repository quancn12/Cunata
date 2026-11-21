import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSyntheticDocx, createMockDocxFile } from '../import-docx/docx-builder.ts';
import { importDocx } from '../../src/import/docx/index.ts';
import { getDraftWarnings, confirmAllValidDrafts, confirmImport, editImport } from '../../src/import/preview/index.ts';
import { createDraft, publishDraft } from '../../src/teacher/index.ts';
import { parseExam } from '../../src/schema/index.ts';
import { openStorage, MemoryTransactionAdapter } from '../../src/storage/index.ts';
import type { WebQuestionII } from '../../src/import/preview/types.ts';

describe('WEB-F08 Regression: Missing DOCX Part II keys remain unresolved and cannot be published as false', () => {
  it('preserves undefined answers and KEY_MISSING warning, blocking automatic confirmation and publication until teacher explicitly resolves each statement', async () => {
    const text = [
      'PHẦN II. Trắc nghiệm Đúng/Sai',
      'Câu 1: Xét các mệnh đề sau:',
      'a) Mệnh đề 1',
      'b) Mệnh đề 2',
      'c) Mệnh đề 3',
      'd) Mệnh đề 4'
    ];
    const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
      + text.map(t => '<w:p><w:r><w:t>' + t + '</w:t></w:r></w:p>').join('')
      + '</w:body></w:document>';

    const imported = await importDocx(createMockDocxFile(await buildSyntheticDocx({ documentXml })), new AbortController().signal);
    assert.equal(imported.ok, true);
    if (!imported.ok) return;

    const job = imported.value;
    const d0 = job.drafts[0]!;

    // 1. Initial parse must NOT guess statement answers as false
    assert.ok(d0.provenance.flags.includes('KEY_MISSING'), 'provenance flags must include KEY_MISSING');
    const q2 = d0.question as Partial<WebQuestionII>;
    assert.ok(q2.statements, 'statements must be present');
    for (const stmt of q2.statements!) {
      assert.strictEqual(stmt.answer, undefined, 'statement answer must remain unresolved (undefined), not false');
    }

    const warnings = getDraftWarnings(d0);
    assert.ok(warnings.includes('KEY_MISSING') || warnings.includes('IMPORT_KEY_MISSING'), 'warnings must reflect missing key');

    // 2. confirmAllValidDrafts must NOT confirm draft with unresolved keys
    const markedUnresolved = confirmAllValidDrafts(job);
    assert.equal(markedUnresolved.ok, true);
    if (markedUnresolved.ok) {
      assert.strictEqual(markedUnresolved.value.drafts[0]?.confirmed, false, 'unresolved draft must NOT be auto-confirmed');
    }

    // 3. confirmImport must reject confirmation of draft with missing keys
    const parsed = parseExam(JSON.parse(fs.readFileSync('public/exams/hoa-repeating.json', 'utf8')));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const target = createDraft(parsed.value, 'test-draft-f08');

    const forceConfirmedJob = {
      ...job,
      drafts: [{ ...d0, confirmed: true }]
    };
    const forceResult = confirmImport(forceConfirmedJob, target);
    assert.strictEqual(forceResult.ok, false, 'force confirmation of draft with missing key must be rejected');
    if (!forceResult.ok) {
      assert.strictEqual(forceResult.error.code, 'IMPORT_KEY_MISSING');
    }

    // 4. Partial resolution (2 of 4 statements) still leaves draft invalid
    const partialStmts = [
      { statementId: 'stmt-1-a', label: 'a', text: 'Mệnh đề 1', answer: true },
      { statementId: 'stmt-1-b', label: 'b', text: 'Mệnh đề 2', answer: false },
      { statementId: 'stmt-1-c', label: 'c', text: 'Mệnh đề 3' },
      { statementId: 'stmt-1-d', label: 'd', text: 'Mệnh đề 4' }
    ];
    const editPartial = editImport(job, d0.draftId, { statements: partialStmts });
    assert.equal(editPartial.ok, true);
    if (!editPartial.ok) return;

    assert.ok(getDraftWarnings(editPartial.value.drafts[0]!).length > 0, 'partial draft must still have warnings');
    const markedPartial = confirmAllValidDrafts(editPartial.value);
    assert.equal(markedPartial.ok, true);
    if (markedPartial.ok) {
      assert.strictEqual(markedPartial.value.drafts[0]?.confirmed, false, 'partial draft must NOT be auto-confirmed');
    }

    // 5. Full resolution by teacher allows confirmation and publication
    const fullStmts = [
      { statementId: 'stmt-1-a', label: 'a', text: 'Mệnh đề 1', answer: true },
      { statementId: 'stmt-1-b', label: 'b', text: 'Mệnh đề 2', answer: false },
      { statementId: 'stmt-1-c', label: 'c', text: 'Mệnh đề 3', answer: true },
      { statementId: 'stmt-1-d', label: 'd', text: 'Mệnh đề 4', answer: false }
    ];
    const editFull = editImport(job, d0.draftId, { statements: fullStmts });
    assert.equal(editFull.ok, true);
    if (!editFull.ok) return;

    assert.deepEqual(getDraftWarnings(editFull.value.drafts[0]!), [], 'warnings must be cleared once all statements are resolved');

    const markedValid = confirmAllValidDrafts(editFull.value);
    assert.equal(markedValid.ok, true);
    if (!markedValid.ok) return;
    assert.strictEqual(markedValid.value.drafts[0]?.confirmed, true, 'fully resolved draft can be confirmed');

    const finalConfirm = confirmImport(markedValid.value, target);
    assert.strictEqual(finalConfirm.ok, true, 'confirmImport must succeed for fully resolved draft');
    if (!finalConfirm.ok) return;

    const store = await openStorage(new MemoryTransactionAdapter());
    assert.equal(store.ok, true);
    if (!store.ok) return;

    const pub = await publishDraft(finalConfirm.value, 'v2-f08', store.value);
    assert.strictEqual(pub.ok, true, 'publication succeeds with teacher-verified answers');
    if (pub.ok) {
      const addedQ = pub.value.questions.find(q => q.title === 'Câu 1');
      assert.ok(addedQ, 'question must exist in published exam');
      if (addedQ && addedQ.kind === 'II') {
        assert.deepEqual(
          addedQ.statements.map(s => s.answer),
          [true, false, true, false],
          'published statements must have exact teacher-verified boolean answers'
        );
      }
    }
  });
});
