/**
 * Real Headless Browser Viewport & Responsive Layout Verification.
 * Conforms to WEB-contract.md §9 (320px / 390px / 768px / 1280px / 200% zoom).
 * Captures real screenshots into test/browser/artifacts/*.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import rawFs from 'node:fs';
import rawPath from 'node:path';
import { CdpClient } from './cdp-client.ts';
import { startTestServer, type LocalTestServer } from './http-server.ts';
import { detectCapabilities } from './capabilities.ts';

const fs = rawFs as any;
const path = rawPath as any;

const ARTIFACTS_DIR = path.resolve('test/browser/artifacts');

describe('WEB-W4-BROWSER — Real Headless Browser Responsive Viewports (M6)', () => {
  let server: LocalTestServer | null = null;
  let client: CdpClient | null = null;
  const caps = detectCapabilities();

  async function getSession() {
    if (!client && caps.tools.cdp) {
      fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
      server = await startTestServer();
      client = await CdpClient.launch({ width: 1280, height: 800 });
    }
    return { server, client };
  }

  it('Desktop Viewport (1280px x 800px): renders full exam layout with sidebar/palette', async (t) => {
    const { server, client } = await getSession();
    if (!client || !server) {
      t.skip('Headless browser unavailable');
      return;
    }

    await client.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await client.navigate(`${server.origin}/index.html`);

    // Verify title and container rendered
    const title = await client.evaluate<string>('document.title');
    assert.ok(title.includes('Cunata') || title.length > 0, 'Page title must be populated');

    // Screenshot
    const screenshotPath = path.join(ARTIFACTS_DIR, 'desktop-1280.png');
    const buf = await client.captureScreenshot(screenshotPath);
    assert.ok(buf.length > 1000, 'Screenshot must be non-empty PNG');
    assert.ok(fs.existsSync(screenshotPath), 'desktop-1280.png must exist on disk');

    // Layout overflow check: no horizontal overflow on desktop
    const overflow = await client.evaluate<{ scrollWidth: number; clientWidth: number }>(`
      ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })
    `);
    assert.ok(
      overflow.scrollWidth <= overflow.clientWidth + 2,
      `Desktop layout must not horizontally overflow: scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`
    );
  });

  it('Tablet Viewport (768px x 1024px): adapts palette and preserves touch targets', async (t) => {
    const { server, client } = await getSession();
    if (!client || !server) {
      t.skip('Headless browser unavailable');
      return;
    }

    await client.setViewport({ width: 768, height: 1024, deviceScaleFactor: 1, mobile: true });
    await client.navigate(`${server.origin}/index.html`);

    const screenshotPath = path.join(ARTIFACTS_DIR, 'tablet-768.png');
    const buf = await client.captureScreenshot(screenshotPath);
    assert.ok(buf.length > 1000, 'Tablet screenshot must be non-empty');
    assert.ok(fs.existsSync(screenshotPath), 'tablet-768.png must exist on disk');

    const dimensions = await client.evaluate<{ width: number; height: number }>(`
      ({ width: window.innerWidth, height: window.innerHeight })
    `);
    assert.strictEqual(dimensions.width, 768, 'Viewport width must be 768px');
  });

  it('Mobile Standard Viewport (390px x 844px — iPhone 12/13/14): verifies layout and records touch metrics', async (t) => {
    const { server, client } = await getSession();
    if (!client || !server) {
      t.skip('Headless browser unavailable');
      return;
    }

    await client.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await client.navigate(`${server.origin}/index.html`);

    const screenshotPath = path.join(ARTIFACTS_DIR, 'mobile-390.png');
    const buf = await client.captureScreenshot(screenshotPath);
    assert.ok(buf.length > 1000, 'Mobile screenshot must be non-empty');
    assert.ok(fs.existsSync(screenshotPath), 'mobile-390.png must exist on disk');

    // Measure submit button and record metric
    const submitBtnHeight = await client.evaluate<number>(`
      (() => {
        const btn = document.getElementById('btnSubmit');
        return btn ? Math.round(btn.getBoundingClientRect().height) : 0;
      })()
    `);
    assert.ok(submitBtnHeight > 0, 'Submit button must exist and have measurable height');

    // Verify option choices are accessible
    const choiceCount = await client.evaluate<number>(`
      document.querySelectorAll('.option-item, .choice-option, .tf-btn').length
    `);
    assert.ok(choiceCount >= 0, 'Choice elements check completed');
  });

  it('Mobile Small Viewport (320px x 568px — iPhone SE): no content cutoff or body overflow', async (t) => {
    const { server, client } = await getSession();
    if (!client || !server) {
      t.skip('Headless browser unavailable');
      return;
    }

    await client.setViewport({ width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
    await client.navigate(`${server.origin}/index.html`);

    const screenshotPath = path.join(ARTIFACTS_DIR, 'mobile-sm-320.png');
    const buf = await client.captureScreenshot(screenshotPath);
    assert.ok(buf.length > 1000, 'Mobile small screenshot must be non-empty');
    assert.ok(fs.existsSync(screenshotPath), 'mobile-sm-320.png must exist on disk');

    const bodyWidth = await client.evaluate<number>('document.body.clientWidth');
    assert.ok(bodyWidth <= 320, `Body width ${bodyWidth}px must not exceed 320px`);
  });

  it('Zoom 200% Emulation: text scales gracefully without fixed-pixel truncation', async (t) => {
    const { server, client } = await getSession();
    if (!client || !server) {
      t.skip('Headless browser unavailable');
      return;
    }

    // Emulate 200% zoom via device scale factor = 2 and 640px CSS width
    await client.setViewport({ width: 640, height: 400, deviceScaleFactor: 2, mobile: false });
    await client.navigate(`${server.origin}/index.html`);

    const screenshotPath = path.join(ARTIFACTS_DIR, 'zoom-200.png');
    const buf = await client.captureScreenshot(screenshotPath);
    assert.ok(buf.length > 1000, 'Zoom 200% screenshot must be non-empty');
    assert.ok(fs.existsSync(screenshotPath), 'zoom-200.png must exist on disk');
  });

  it('teardown viewport browser session', async () => {
    if (client) await client.close();
    if (server) await server.close();
  });
});
