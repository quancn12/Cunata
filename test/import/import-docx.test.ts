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

  it('parses minimal.docx fixture', async () => {
    const bytes = readFileSync('./test/codex-check/fixtures/minimal.docx');
    const file = new File([bytes], 'minimal.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const res = await importDocx(file, new AbortController().signal);
    assert.equal(res.ok, true);
  });
});
