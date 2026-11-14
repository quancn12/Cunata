/// <reference lib="dom" />

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isSafeUrl,
  isSafeMimeType,
  isSafeSvg,
  sanitizeUrl,
  resolveAssetUrl,
  ALLOWED_IMAGE_MIMES,
} from '../../../src/ui/security.ts';
import type { Asset } from '../../../src/ui/types.ts';

describe('WEB-W1-UI: Security, URL, MIME, and SVG Sanitization', () => {
  describe('isSafeUrl: Hostile URL filtering (WEB-contract.md §4.1)', () => {
    it('rejects javascript: protocol variants', () => {
      assert.strictEqual(isSafeUrl('javascript:alert(1)'), false);
      assert.strictEqual(isSafeUrl('JAVASCRIPT:alert(1)'), false);
      assert.strictEqual(isSafeUrl('javascript:/*comment*/alert(1)'), false);
      assert.strictEqual(isSafeUrl('  javascript:void(0)'), false);
    });

    it('rejects other dangerous scripting protocols', () => {
      assert.strictEqual(isSafeUrl('vbscript:msgbox(1)'), false);
      assert.strictEqual(isSafeUrl('file:///etc/passwd'), false);
      assert.strictEqual(isSafeUrl('about:blank'), false);
      assert.strictEqual(isSafeUrl('blob:http://localhost/uuid'), false);
    });

    it('rejects external HTTP/HTTPS and protocol-relative URLs (blocks automatic external fetch)', () => {
      assert.strictEqual(isSafeUrl('http://evil.com/malicious.png'), false);
      assert.strictEqual(isSafeUrl('https://tracker.com/beacon.gif'), false);
      assert.strictEqual(isSafeUrl('//cdn.untrusted.com/image.webp'), false);
      assert.strictEqual(isSafeUrl('ftp://files.example.com/data.png'), false);
    });

    it('rejects path traversal vectors', () => {
      assert.strictEqual(isSafeUrl('../secret.json'), false);
      assert.strictEqual(isSafeUrl('../../etc/shadow'), false);
      assert.strictEqual(isSafeUrl('images/../../config.env'), false);
      assert.strictEqual(isSafeUrl('public/%2e%2e/passwd'), false);
      assert.strictEqual(isSafeUrl('public/%2E%2E/passwd'), false);
      assert.strictEqual(isSafeUrl('images\\backslashes.png'), false);
    });

    it('rejects control characters and null bytes', () => {
      assert.strictEqual(isSafeUrl('public/image\u0000.png'), false);
      assert.strictEqual(isSafeUrl('public/image\r\n.png'), false);
    });

    it('rejects unsafe data URLs (HTML, script, SVG with potential code)', () => {
      assert.strictEqual(isSafeUrl('data:text/html,<script>alert(1)</script>'), false);
      assert.strictEqual(isSafeUrl('data:application/javascript,alert(1)'), false);
      assert.strictEqual(isSafeUrl('data:image/svg+xml;utf8,<svg onload=alert(1)>'), false);
    });

    it('permits safe raster base64 data URLs', () => {
      const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const validJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
      const validWebp = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAD8D+JaQAA3AA/ua1AAA=';

      assert.strictEqual(isSafeUrl(validPng), true);
      assert.strictEqual(isSafeUrl(validJpeg), true);
      assert.strictEqual(isSafeUrl(validWebp), true);
    });

    it('permits safe local relative paths', () => {
      assert.strictEqual(isSafeUrl('public/q01-bbt.svg'), true);
      assert.strictEqual(isSafeUrl('./images/diagram.png'), true);
      assert.strictEqual(isSafeUrl('assets/figures/figure1.webp'), true);
      assert.strictEqual(isSafeUrl('sample-exam.json'), true);
    });
  });

  describe('sanitizeUrl', () => {
    it('returns original safe url or fallback when unsafe', () => {
      assert.strictEqual(sanitizeUrl('public/q01-bbt.svg'), 'public/q01-bbt.svg');
      assert.strictEqual(sanitizeUrl('javascript:alert(1)', 'fallback.png'), 'fallback.png');
      assert.strictEqual(sanitizeUrl('https://evil.com/x.png', ''), '');
    });
  });

  describe('isSafeMimeType: Approved raster image MIME whitelist', () => {
    it('accepts whitelisted image MIME types', () => {
      assert.strictEqual(isSafeMimeType('image/png'), true);
      assert.strictEqual(isSafeMimeType('IMAGE/PNG'), true);
      assert.strictEqual(isSafeMimeType('image/jpeg'), true);
      assert.strictEqual(isSafeMimeType('image/webp'), true);
    });

    it('rejects executable and unsafe MIME types', () => {
      assert.strictEqual(isSafeMimeType('text/html'), false);
      assert.strictEqual(isSafeMimeType('application/javascript'), false);
      assert.strictEqual(isSafeMimeType('image/svg+xml'), false); // handled by dedicated SVG checker
      assert.strictEqual(isSafeMimeType('application/octet-stream'), false);
      assert.strictEqual(isSafeMimeType('application/x-msdownload'), false);
    });
  });

  describe('isSafeSvg: Hostile SVG vector detection', () => {
    it('detects and rejects script tags in SVG', () => {
      const hostile1 = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
      const hostile2 = '<svg><SCRIPT type="text/javascript">fetch("/steal")</SCRIPT></svg>';
      assert.strictEqual(isSafeSvg(hostile1), false);
      assert.strictEqual(isSafeSvg(hostile2), false);
    });

    it('detects and rejects inline event handlers in SVG', () => {
      const hostileOnload = '<svg onload="alert(1)"><circle r="10"/></svg>';
      const hostileOnerror = '<svg><image href="x" onerror="alert(document.cookie)"/></svg>';
      const hostileOnclick = '<svg><rect onclick="alert(1)"/></svg>';
      assert.strictEqual(isSafeSvg(hostileOnload), false);
      assert.strictEqual(isSafeSvg(hostileOnerror), false);
      assert.strictEqual(isSafeSvg(hostileOnclick), false);
    });

    it('detects and rejects foreignObject tags', () => {
      const hostileForeign = '<svg><foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject></svg>';
      assert.strictEqual(isSafeSvg(hostileForeign), false);
    });

    it('detects and rejects javascript: in href or xlink:href attributes', () => {
      const hostileHref = '<svg><a href="javascript:alert(1)"><text>Click</text></a></svg>';
      const hostileXlink = '<svg><a xlink:href="javascript:alert(1)"><text>Click</text></a></svg>';
      assert.strictEqual(isSafeSvg(hostileHref), false);
      assert.strictEqual(isSafeSvg(hostileXlink), false);
    });

    it('detects and rejects external URLs in href attributes', () => {
      const hostileExternal = '<svg><image href="https://tracker.com/img.png"/></svg>';
      assert.strictEqual(isSafeSvg(hostileExternal), false);
    });

    it('detects and rejects XXE entity definitions', () => {
      const hostileDtd = '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>';
      assert.strictEqual(isSafeSvg(hostileDtd), false);
    });

    it('approves clean static SVG geometric content', () => {
      const cleanSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" />
        <text x="50" y="55" font-size="12" text-anchor="middle">f(x)</text>
      </svg>`;
      assert.strictEqual(isSafeSvg(cleanSvg), true);
    });
  });

  describe('resolveAssetUrl: Asset dictionary lookup and resolution', () => {
    const assets: readonly Asset[] = [
      {
        assetId: 'fig-01',
        mime: 'image/png',
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        alt: 'Bảng biến thiên',
      },
      {
        assetId: 'fig-unsafe-mime',
        mime: 'text/html',
        data: '<script>alert(1)</script>',
        alt: 'Hostile asset',
      },
      {
        assetId: 'fig-external',
        mime: 'image/png',
        data: 'https://evil.com/exploit.png',
        alt: 'External asset',
      },
    ];

    it('resolves safe internal base64 raster asset to data URL', () => {
      const resolved = resolveAssetUrl('fig-01', assets);
      assert.ok(resolved !== null);
      assert.ok(resolved.startsWith('data:image/png;base64,'));
    });

    it('rejects asset with non-whitelisted MIME type', () => {
      const resolved = resolveAssetUrl('fig-unsafe-mime', assets);
      assert.strictEqual(resolved, null);
    });

    it('resolves safe relative local path when assetId is a path', () => {
      const resolved = resolveAssetUrl('public/q01-bbt.svg', assets);
      assert.strictEqual(resolved, 'public/q01-bbt.svg');
    });

    it('rejects path traversal assetId', () => {
      const resolved = resolveAssetUrl('../../etc/passwd', assets);
      assert.strictEqual(resolved, null);
    });
  });
});
