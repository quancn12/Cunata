/**
 * Unit and integration tests for WEB-W2-GLUE — Composition Root & Bootstrap Lifecycle
 * Conforms to WEB-contract.md §2, §3, §5, §10.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap } from '../../../src/app/main.ts';
import { createMockDocument, MockElement } from '../../ui/core/dom-mock.ts';
import type { StoragePort, AttemptRecord, Result } from '../../../src/storage/index.ts';
import type { WebExam } from '../../../src/schema/index.ts';

function createMockStoragePort(): StoragePort {
  const objects = new Map<string, unknown>();
  return {
    async load() {
      return { ok: true, value: null };
    },
    async create(record: AttemptRecord) {
      return { ok: true, value: record };
    },
    async saveDraft(record: AttemptRecord) {
      return { ok: true, value: record };
    },
    async finalize(record: AttemptRecord) {
      return { ok: true, value: record };
    },
    async listAttempts() {
      return { ok: true, value: [] };
    },
    async getObject(store, id) {
      return { ok: true, value: objects.get(`${store}:${id}`) ?? null };
    },
    async putObject(store, id, val) {
      objects.set(`${store}:${id}`, val);
      return { ok: true, value: 1 };
    },
    async deleteObject(store, id) {
      objects.delete(`${store}:${id}`);
      return { ok: true, value: undefined };
    },
    async getOutbox() {
      return { ok: true, value: null };
    },
    async updateOutbox(val) {
      return { ok: true, value: val };
    },
    async exportBackup() {
      return { ok: true, value: new Blob([]) };
    },
    async importBackup() {
      return { ok: true, value: undefined };
    },
    async clearAll() {
      objects.clear();
      return { ok: true, value: undefined };
    },
  };
}

describe('WEB-W2-GLUE — Composition Root & Bootstrap Lifecycle', () => {
  it('bootstrap throws an error when called with an invalid root element', async () => {
    await assert.rejects(
      async () => {
        // @ts-ignore
        await bootstrap(null);
      },
      {
        message: 'Root element must be a valid HTMLElement',
      }
    );

    await assert.rejects(
      async () => {
        // @ts-ignore
        await bootstrap({} as HTMLElement);
      },
      {
        message: 'Root element must be a valid HTMLElement',
      }
    );
  });

  it('bootstrap injects semantic shell slots and initializes default views', async () => {
    const doc = createMockDocument();
    const root = doc.createElement('div') as unknown as HTMLElement;
    doc.body.appendChild(root as unknown as MockElement);

    const cleanup = await bootstrap(root);

    // Verify injected semantic elements
    const examTitle = root.querySelector('#examTitle');
    assert.ok(examTitle, '#examTitle element must be present');
    assert.ok(
      examTitle.textContent.includes('Toán') || examTitle.textContent.includes('Minh Họa'),
      'Title should reflect default or provided exam title'
    );

    const examPane = root.querySelector('#examPane');
    assert.ok(examPane, '#examPane element must be present');

    const paletteGrid = root.querySelector('#paletteGrid');
    assert.ok(paletteGrid, '#paletteGrid element must be present');

    const candInput = root.querySelector('#candidateName') as HTMLInputElement | null;
    assert.ok(candInput, '#candidateName input must be present');
    assert.equal(candInput.value, 'Thí sinh tự do');

    // Clean up
    cleanup();
  });

  it('bootstrap manages route transitions and modal displays cleanly', async () => {
    const doc = createMockDocument();
    const root = doc.createElement('div') as unknown as HTMLElement;
    doc.body.appendChild(root as unknown as MockElement);

    const cleanup = await bootstrap(root, { initialRoute: 'exam' });

    const examWrapper = root.querySelector('#examWrapper') as HTMLElement;
    const reportWrapper = root.querySelector('#reportWrapper') as HTMLElement;
    const builderModal = root.querySelector('#builderModal') as HTMLElement;
    const bankModal = root.querySelector('#bankModal') as HTMLElement;

    assert.equal(examWrapper.style.display, '', 'Exam wrapper must be visible initially');
    assert.equal(reportWrapper.style.display, 'none', 'Report wrapper must be hidden initially');
    assert.equal(builderModal.style.display, 'none', 'Builder modal must be hidden initially');
    assert.equal(bankModal.style.display, 'none', 'Bank modal must be hidden initially');

    cleanup();
  });

  it('bootstrap coordinates submit modal confirmation workflow', async () => {
    const doc = createMockDocument();
    const root = doc.createElement('div') as unknown as HTMLElement;
    doc.body.appendChild(root as unknown as MockElement);

    const cleanup = await bootstrap(root);

    const btnSubmit = root.querySelector('#btnSubmit') as MockElement;
    const submitModal = root.querySelector('#submitModal') as MockElement;
    const btnCancelSubmit = root.querySelector('#btnCancelSubmit') as MockElement;

    assert.equal(submitModal.style.display, 'none');

    // User clicks submit button
    btnSubmit.click();
    assert.equal(submitModal.style.display, 'flex', 'Submit modal must be displayed upon click');

    // User cancels submit
    btnCancelSubmit.click();
    assert.equal(submitModal.style.display, 'none', 'Submit modal must close on cancel');

    cleanup();
  });

  it('bootstrap disposes cleanly and unsubscribes all listeners without memory leaks', async () => {
    const doc = createMockDocument();
    const root = doc.createElement('div') as unknown as HTMLElement;
    doc.body.appendChild(root as unknown as MockElement);

    const cleanup = await bootstrap(root);

    // Call cleanup
    assert.doesNotThrow(() => {
      cleanup();
    });

    // Clicking submit after disposal must not crash or trigger handlers
    const btnSubmit = root.querySelector('#btnSubmit') as MockElement;
    const submitModal = root.querySelector('#submitModal') as MockElement;
    btnSubmit.click();
    assert.equal(submitModal.style.display, 'none', 'Handlers should be detached after cleanup');
  });
});
