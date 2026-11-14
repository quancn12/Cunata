/// <reference lib="dom" />

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  renderText,
  renderMath,
  renderImage,
  renderTable,
  renderBlock,
  renderBlocks,
} from '../../../src/ui/blocks.ts';
import type { Block, Cell, Asset } from '../../../src/ui/types.ts';
import { createMockDocument } from './dom-mock.ts';

describe('WEB-W1-UI: Safe DOM & Block Rendering (No innerHTML, No CDN)', () => {
  const doc = createMockDocument();

  describe('renderText: Hostile HTML and script escaping', () => {
    it('escapes script tags and does not evaluate HTML', () => {
      const hostile = '<script>alert("XSS")</script>';
      const el = renderText(hostile, { document: doc as unknown as Document });

      assert.strictEqual(el.tagName, 'DIV');
      assert.strictEqual(el.className, 'cunata-text-block');
      assert.strictEqual(el.textContent, hostile);
      // Ensure no child script element was parsed into DOM tree
      assert.strictEqual(el.childNodes.length, 1);
      assert.strictEqual(el.querySelector('script'), null);
    });

    it('escapes image onerror payload', () => {
      const hostile = '"><img src=x onerror=alert(document.cookie)>';
      const el = renderText(hostile, { document: doc as unknown as Document });

      assert.strictEqual(el.textContent, hostile);
      assert.strictEqual(el.querySelector('img'), null);
    });

    it('renders normal Vietnamese text with accents and math characters', () => {
      const normal = 'Cho hàm số f(x) liên tục trên đoạn [0; 1] và thỏa mãn: ∫ f(x)dx = 2.';
      const el = renderText(normal, { document: doc as unknown as Document });

      assert.strictEqual(el.textContent, normal);
    });
  });

  describe('renderMath: LaTeX and OMML rendering without CDN dependency', () => {
    it('renders verified LaTeX formula with role="math" and escaped source code', () => {
      const block = {
        type: 'math' as const,
        source: '\\int_{0}^{1} x^2 dx = \\frac{1}{3}',
        format: 'latex' as const,
        verified: true,
      };

      const el = renderMath(block, { document: doc as unknown as Document });

      assert.strictEqual(el.tagName, 'SPAN');
      assert.strictEqual(el.className, 'cunata-math');
      assert.strictEqual(el.getAttribute('role'), 'math');
      assert.strictEqual(el.getAttribute('data-format'), 'latex');
      assert.strictEqual(el.getAttribute('data-verified'), 'true');
      assert.ok(el.getAttribute('aria-label')?.includes(block.source));

      const codeEl = el.querySelector('code');
      assert.ok(codeEl !== null);
      assert.strictEqual(codeEl.className, 'cunata-math-source');
      assert.strictEqual(codeEl.textContent, block.source);
    });

    it('renders unverified OMML formula container safely', () => {
      const block = {
        type: 'math' as const,
        source: '<m:oMath><m:r><m:t>x+y</m:t></m:r></m:oMath>',
        format: 'omml' as const,
        verified: false,
      };

      const el = renderMath(block, { document: doc as unknown as Document });

      assert.strictEqual(el.getAttribute('data-format'), 'omml');
      assert.strictEqual(el.getAttribute('data-verified'), 'false');
      assert.strictEqual(el.textContent, block.source);
      // Code is escaped in text node, no XML evaluation
      assert.strictEqual(el.querySelector('m\\:oMath'), null);
    });
  });

  describe('renderImage: URL/MIME checking and overflow protection', () => {
    const assets: readonly Asset[] = [
      {
        assetId: 'valid-diagram',
        mime: 'image/png',
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        alt: 'Sơ đồ mạch điện',
      },
    ];

    it('renders safe image in figure with loading=lazy and responsive class', () => {
      const block = {
        type: 'image' as const,
        assetId: 'valid-diagram',
        alt: 'Sơ đồ mạch điện',
      };

      const el = renderImage(block, { document: doc as unknown as Document, assets });

      assert.strictEqual(el.tagName, 'FIGURE');
      assert.strictEqual(el.className, 'cunata-image-container');

      const img = el.querySelector('img');
      assert.ok(img !== null);
      assert.strictEqual(img.className, 'cunata-image');
      assert.strictEqual(img.alt, 'Sơ đồ mạch điện');
      assert.strictEqual(img.getAttribute('loading'), 'lazy');
      assert.ok(img.src.startsWith('data:image/png;base64,'));
    });

    it('renders safe local relative path image', () => {
      const block = {
        type: 'image' as const,
        assetId: 'public/q01-bbt.svg',
        alt: 'Bảng biến thiên câu 1',
      };

      const el = renderImage(block, { document: doc as unknown as Document });

      assert.strictEqual(el.tagName, 'FIGURE');
      const img = el.querySelector('img');
      assert.ok(img !== null);
      assert.strictEqual(img.src, 'public/q01-bbt.svg');
    });

    it('renders placeholder warning when image asset is unsafe or hostile', () => {
      const hostileBlock = {
        type: 'image' as const,
        assetId: 'javascript:alert(1)',
        alt: 'Hostile asset',
      };

      const el = renderImage(hostileBlock, { document: doc as unknown as Document });

      assert.strictEqual(el.tagName, 'SPAN');
      assert.ok(el.className.includes('cunata-image-placeholder'));
      assert.ok(el.className.includes('cunata-image-unsafe'));
      assert.strictEqual(el.getAttribute('role'), 'img');
      assert.ok(el.textContent.includes('không khả dụng hoặc bị chặn'));
    });
  });

  describe('renderTable: Safe tables with rowSpan, colSpan, and nested blocks', () => {
    it('renders table inside overflow wrapper and clamps negative rowSpan/colSpan', () => {
      const cells: Cell[] = [
        {
          blocks: [{ type: 'text', text: 'Cột 1' }],
          rowSpan: -2, // should clamp to 1
          colSpan: 0,  // should clamp to 1
        },
        {
          blocks: [{ type: 'math', source: 'x > 0', format: 'latex', verified: true }],
          rowSpan: 2,
          colSpan: 1,
        },
      ];

      const tableBlock = {
        type: 'table' as const,
        rows: [cells],
      };

      const el = renderTable(tableBlock, { document: doc as unknown as Document });

      assert.strictEqual(el.tagName, 'DIV');
      assert.strictEqual(el.className, 'cunata-table-wrapper');

      const table = el.querySelector('table');
      assert.ok(table !== null);
      assert.strictEqual(table.className, 'cunata-table');

      const renderedCells = table.querySelectorAll('td, th');
      assert.strictEqual(renderedCells.length, 2);

      // Cell 0: clamped rowSpan/colSpan should not be negative
      assert.strictEqual(renderedCells[0]?.getAttribute('rowspan'), null); // default 1 not set as attribute
      assert.strictEqual(renderedCells[0]?.getAttribute('colspan'), null);

      // Cell 1: rowSpan = 2
      assert.strictEqual(renderedCells[1]?.getAttribute('rowspan'), '2');
      // Contains nested math block
      assert.ok(renderedCells[1]?.querySelector('.cunata-math') !== null);
    });
  });

  describe('renderBlocks: Composite document rendering', () => {
    it('renders multiple mixed blocks into a single container', () => {
      const blocks: Block[] = [
        { type: 'text', text: 'Câu hỏi 1:' },
        { type: 'math', source: 'f\'(x) = 3x^2', format: 'latex', verified: true },
        { type: 'text', text: 'Bảng biến thiên:' },
        { type: 'image', assetId: 'public/q01-bbt.svg', alt: 'BBT' },
      ];

      const container = renderBlocks(blocks, { document: doc as unknown as Document });

      assert.strictEqual(container.tagName, 'DIV');
      assert.strictEqual(container.className, 'cunata-blocks-container');
      assert.strictEqual(container.childNodes.length, 4);
    });
  });
});
