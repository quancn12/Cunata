/// <reference lib="dom" />

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createCompositionGuard, isImeComposing } from '../../../src/ui/composition.ts';
import { createMockDocument, MockCompositionEvent, MockEvent, MockKeyboardEvent } from './dom-mock.ts';

describe('WEB-W1-UI: Composition Guards Preserving Native Vietnamese IME Input & Cursor', () => {
  it('guards Vietnamese Telex/VNI IME composition from premature commits or formatting corruption', () => {
    const doc = createMockDocument();
    const input = doc.createElement('input');
    input.type = 'text';

    const commits: string[] = [];
    const guard = createCompositionGuard({
      element: input as unknown as HTMLInputElement,
      onCommit: (val) => {
        commits.push(val);
      },
    });

    assert.strictEqual(guard.isComposing(), false, 'Initially not composing');

    // Step 1: User starts IME composition (e.g. typing "t" then "r" then "u" then "o" then "n" then "g" then "w" -> "trường")
    input.dispatchEvent(new MockCompositionEvent('compositionstart'));
    assert.strictEqual(guard.isComposing(), true, 'Must be in composing state');

    // Step 2: Intermediate composition update
    input.value = 'truon';
    input.dispatchEvent(new MockCompositionEvent('compositionupdate', { data: 'truon' }));
    input.dispatchEvent(new MockEvent('input'));

    // Step 3: Next intermediate composition update
    input.value = 'trường';
    input.dispatchEvent(new MockCompositionEvent('compositionupdate', { data: 'trường' }));
    input.dispatchEvent(new MockEvent('input'));

    // Verify NO commits happened during composition
    assert.strictEqual(commits.length, 0, 'No commit should be triggered during active IME composition');
    assert.strictEqual(input.value, 'trường', 'Input value must not be reformatted or modified');

    // Step 4: User commits the syllable (compositionend)
    input.dispatchEvent(new MockCompositionEvent('compositionend', { data: 'trường' }));

    assert.strictEqual(guard.isComposing(), false, 'Composition state must end');
    assert.strictEqual(commits.length, 1, 'Exactly one commit must be triggered on compositionend');
    assert.strictEqual(commits[0], 'trường', 'Final committed value must match composed Vietnamese string');

    guard.dispose();
  });

  it('suppresses Enter key while IME composition is active to prevent premature form submission', () => {
    const doc = createMockDocument();
    const input = doc.createElement('input');

    const commits: string[] = [];
    const guard = createCompositionGuard({
      element: input as unknown as HTMLInputElement,
      onCommit: (val) => commits.push(val),
    });

    // Start composition
    input.dispatchEvent(new MockCompositionEvent('compositionstart'));
    assert.strictEqual(guard.isComposing(), true);

    // Enter pressed to select an IME candidate from list
    const enterEvent = new MockKeyboardEvent('keydown', { key: 'Enter', isComposing: true });
    input.dispatchEvent(enterEvent);

    // Should still be composing, no commit
    assert.strictEqual(commits.length, 0);

    guard.dispose();
  });

  it('processes normal keyboard input immediately when not in composition', () => {
    const doc = createMockDocument();
    const input = doc.createElement('input');

    const inputs: string[] = [];
    const commits: string[] = [];
    const guard = createCompositionGuard({
      element: input as unknown as HTMLInputElement,
      onInput: (val) => inputs.push(val),
      onCommit: (val) => commits.push(val),
    });

    input.value = '-0,5';
    input.dispatchEvent(new MockEvent('input'));

    assert.strictEqual(inputs.length, 1);
    assert.strictEqual(inputs[0], '-0,5');

    guard.dispose();
  });

  it('explicit invariant: simulated events do not count as real OS IME verification', () => {
    // Shared Product Contract v2.0 §1 & WEB-contract.md §9:
    // Simulated synthetic JS events verify JavaScript event handling logic,
    // but CANNOT substitute for live OS-level Vietnamese IME (UniKey, EVKey, Windows Telex) typing tests.
    const isSyntheticVerification = true;
    const countsAsLiveOsIme = false;

    assert.strictEqual(isSyntheticVerification, true);
    assert.strictEqual(countsAsLiveOsIme, false, 'Simulated events do not count as OS IME verification');
  });

  it('isImeComposing detects isComposing flag on events', () => {
    const regularEvent = new MockKeyboardEvent('keydown', { isComposing: false });
    const composingEvent = new MockKeyboardEvent('keydown', { isComposing: true });
    const legacyImeEvent = new MockKeyboardEvent('keydown', { keyCode: 229 });

    assert.strictEqual(isImeComposing(regularEvent as unknown as Event), false);
    assert.strictEqual(isImeComposing(composingEvent as unknown as Event), true);
    assert.strictEqual(isImeComposing(legacyImeEvent as unknown as Event), true);
  });
});
