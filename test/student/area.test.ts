import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatScoreD02, mountStudentArea } from '../../src/student/area.ts';
import { createEnhancedMockDocument } from './view/testDom.ts';

describe('Student Area & D02 Scoring Specification Tests', () => {
  describe('D02 Scoring Policy (WEB-contract §19.1 & Shared Product Contract v2.0)', () => {
    test('formats integer scores as clean integers without decimal part', () => {
      assert.equal(formatScoreD02('10'), '10');
      assert.equal(formatScoreD02('5'), '5');
      assert.equal(formatScoreD02('12/1'), '12');
      assert.equal(formatScoreD02(10), '10');
      assert.equal(formatScoreD02(0), '0');
    });

    test('formats non-integer scores to exactly 2 decimal places with Vietnamese comma and half-up rounding', () => {
      // 0.5 -> 0,50
      assert.equal(formatScoreD02('1/2'), '0,50');
      assert.equal(formatScoreD02('0.5'), '0,50');

      // 0.75 -> 0,75
      assert.equal(formatScoreD02('3/4'), '0,75');
      assert.equal(formatScoreD02('0.75'), '0,75');

      // 3.5 -> 3,50
      assert.equal(formatScoreD02('7/2'), '3,50');
      assert.equal(formatScoreD02('3.5'), '3,50');

      // 4.75 -> 4,75
      assert.equal(formatScoreD02('19/4'), '4,75');

      // 4.6666... -> 4,67
      assert.equal(formatScoreD02('14/3'), '4,67');

      // 7.25 -> 7,25
      assert.equal(formatScoreD02('29/4'), '7,25');
      assert.equal(formatScoreD02('7.25'), '7,25');
    });

    test('handles empty, null, and undefined values safely', () => {
      assert.equal(formatScoreD02(null), '0');
      assert.equal(formatScoreD02(undefined), '0');
      assert.equal(formatScoreD02(''), '0');
    });
  });

  describe('Student Area Controller Contract Interface', () => {
    test('exports expected controller methods', () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
      });

      assert.equal(typeof ctrl.refreshList, 'function');
      assert.equal(typeof ctrl.selectExamId, 'function');
      assert.equal(typeof ctrl.joinClass, 'function');
      assert.equal(typeof ctrl.setCandidateName, 'function');
      assert.equal(typeof ctrl.getCandidateName, 'function');
      assert.equal(typeof ctrl.dispose, 'function');

      ctrl.setCandidateName('Nguyễn Văn An');
      assert.equal(ctrl.getCandidateName(), 'Nguyễn Văn An');

      ctrl.dispose();
    });

    test('studentNameGate: verifies input#startName and button#btnNameContinue interaction', () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
      });

      const nameGate = root.querySelector('#studentNameGate');
      assert.ok(nameGate, '#studentNameGate must be rendered in Student Area');

      const nameInput = root.querySelector('#startName') as any;
      assert.ok(nameInput, 'input#startName must be rendered');

      const btnContinue = root.querySelector('#btnNameContinue') as any;
      assert.ok(btnContinue, 'button#btnNameContinue must be rendered');

      // Initially empty: btnNameContinue must be disabled
      assert.equal(btnContinue.disabled, true, 'btnNameContinue must be disabled when name is empty');

      // Entering name
      nameInput.value = 'Trần Thị Mai';
      nameInput.dispatchEvent({ type: 'input' });
      assert.equal(btnContinue.disabled, false, 'btnNameContinue must be enabled after entering non-empty name');

      // Clicking continue
      btnContinue.click();
      assert.equal(ctrl.getCandidateName(), 'Trần Thị Mai');

      ctrl.dispose();
    });

    test('classCodeInput: verifies join button and error message for empty input', async () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
      });

      const classCodeInput = root.querySelector('#classCodeInput') as any;
      assert.ok(classCodeInput, 'input#classCodeInput must be rendered');

      const btnJoinClass = root.querySelector('#btnJoinClass') as any;
      assert.ok(btnJoinClass, 'button#btnJoinClass must be rendered');

      const classCodeError = root.querySelector('#classCodeError') as any;
      assert.ok(classCodeError, 'div#classCodeError must be rendered');

      // Clicking join without entering code
      classCodeInput.value = '';
      btnJoinClass.click();
      assert.ok(classCodeError.textContent.includes('Vui lòng nhập mã lớp'), 'Displays error for empty class code');

      ctrl.dispose();
    });

    test('examPreview: verifies dialog structure and #btnStartExam', () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
      });

      const examPreview = root.querySelector('#examPreview') as any;
      assert.ok(examPreview, 'dialog#examPreview must be rendered');

      const btnStartExam = root.querySelector('#btnStartExam') as any;
      assert.ok(btnStartExam, 'button#btnStartExam must be rendered');

      ctrl.dispose();
    });

    test('typography tokens: injects cunata-student-typography style into doc.head', () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
      });

      const styleTag = doc.getElementById('cunata-student-typography');
      assert.ok(styleTag, '#cunata-student-typography must be injected into doc.head');
      assert.ok(styleTag.textContent.includes('--fs-xs'), 'Typography style should reference --fs-xs');
      assert.ok(styleTag.textContent.includes('--fs-md'), 'Typography style should reference --fs-md');

      ctrl.dispose();
    });

    test('ensureCandidateInputEditable: keeps #candidateName editable and syncs with controller', () => {
      const doc = createEnhancedMockDocument();
      const candidateInput = doc.createElement('input');
      candidateInput.id = 'candidateName';
      doc.body.appendChild(candidateInput);

      const root = doc.createElement('div');
      (root as any).ownerDocument = doc;
      doc.body.appendChild(root);

      const ctrl = mountStudentArea(root as unknown as HTMLElement, {
        now: () => 1700000000000,
      });

      // Attempting to set candidateInput.readOnly to true must not lock the input
      (candidateInput as any).readOnly = true;
      assert.equal((candidateInput as any).readOnly, false, '#candidateName must remain editable');

      // Dispatching input event on #candidateName should update controller's candidate name
      (candidateInput as any).value = 'Nguyễn An 0123';
      candidateInput.dispatchEvent({ type: 'input', target: candidateInput } as any);
      assert.equal(ctrl.getCandidateName(), 'Nguyễn An 0123', 'Controller name should sync with #candidateName');

      ctrl.dispose();
    });
  });
});

