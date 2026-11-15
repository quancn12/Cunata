import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importDocx } from '../../src/import/docx/index.ts';
import { findElementsByTagName } from '../../src/import/docx/xml-parser.ts';

describe('DOCX parser XML tag lookup', () => {
  it('findElementsByTagName matches localName without namespace prefix in native DOM', () => {
    // Test if DOMParser or mock DOM works
    const xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p>hello</w:p></w:body></w:document>';
    // If DOMParser exists
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const bodies = findElementsByTagName(doc, 'body');
      assert.equal(bodies.length, 1);
    }
  });

  it('parses minimal.docx fixture with table and image preservation', async () => {
    const raw = readFileSync('./test/codex-check/fixtures/minimal.docx');
    const bytes = new Uint8Array(raw as any);
    const file = new File([bytes], 'minimal.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const res = await importDocx(file, new AbortController().signal);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.value.drafts.length, 1);
      const draft = res.value.drafts[0]!;
      assert.ok(draft.question.blocks && draft.question.blocks.length > 0);
      const hasTable = draft.question.blocks.some((b: any) => b.type === 'table');
      const hasImage = draft.question.blocks.some((b: any) => b.type === 'image' && b.alt === 'IMAGE-KEEP-42');
      assert.equal(hasTable, true, 'table block preserved');
      assert.equal(hasImage, true, 'image block preserved');
      assert.ok((res.value as any).assets?.some((a: any) => a.alt === 'IMAGE-KEEP-42'), 'asset preserved in job.assets');
    }
  });

  it('retries reading when first read attempts fail or are incomplete', async () => {
    const raw = readFileSync('./test/codex-check/fixtures/minimal.docx');
    const bytes = new Uint8Array(raw as any);
    let callCount = 0;
    const mockFile = {
      name: 'minimal.docx',
      size: bytes.byteLength,
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      async arrayBuffer() {
        callCount++;
        if (callCount < 2) {
          throw new Error('Simulated temporary file read lock');
        }
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      },
    } as unknown as File;

    const res = await importDocx(mockFile, new AbortController().signal);
    assert.equal(res.ok, true);
    assert.ok(callCount >= 2, 'resilient retry invoked');
  });
});
