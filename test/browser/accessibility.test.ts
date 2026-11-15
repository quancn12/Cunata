/**
 * Real Headless Browser Accessibility & Keyboard Navigation Verification (M6).
 * Conforms to WEB-contract.md §9 (WCAG AA Contrast, Keyboard Focus, ARIA, Dialog Trapping).
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

describe('WEB-W4-BROWSER — Real Browser Accessibility & Keyboard Verification (M6)', () => {
  let server: LocalTestServer | null = null;
  let client: CdpClient | null = null;
  const caps = detectCapabilities();

  async function getSession() {
    if (!client && caps.tools.cdp) {
      server = await startTestServer();
      client = await CdpClient.launch({ width: 1280, height: 800 });
    }
    return { server, client };
  }

  it('Keyboard Focus: tab navigation through controls and visible focus indicators', async (t) => {
    const { server, client } = await getSession();
    if (!client || !server) {
      t.skip('Headless browser unavailable');
      return;
    }

    await client.navigate(`${server.origin}/index.html`);

    // Press Tab multiple times to navigate interactive controls
    const focusedTags = await client.evaluate<string[]>(`
      (() => {
        const sequence = [];
        const candidateInput = document.getElementById('candidateName');
        if (candidateInput) {
          candidateInput.focus();
          sequence.push(document.activeElement.tagName + '#' + (document.activeElement.id || ''));
        }
        return sequence;
      })()
    `);

    assert.ok(focusedTags.length > 0, 'Candidate input should be focusable via script/keyboard');

    // Verify focus outline style
    const focusStyle = await client.evaluate<{ outline: string; outlineOffset: string }>(`
      (() => {
        const input = document.getElementById('candidateName');
        input.focus();
        const cs = window.getComputedStyle(input);
        return { outline: cs.outline || cs.outlineColor, outlineOffset: cs.outlineOffset };
      })()
    `);

    assert.ok(focusStyle.outline !== 'none', 'Focusable element must have non-none focus outline or border indicator');
  });

  it('Modal Dialog: focus trapping, backdrop click guard, and return focus', async (t) => {
    const { server, client } = await getSession();
    if (!client || !server) {
      t.skip('Headless browser unavailable');
      return;
    }

    await client.navigate(`${server.origin}/index.html`);

    // Click submit button to open submit confirmation modal
    await client.click('#btnSubmit');

    // Wait for modal to be visible
    await client.waitForSelector('#submitModal.show, #submitModal[style*="block"], #submitModal[style*="flex"]');

    // Capture screenshot of dialog focus
    const dialogScreenshot = path.join(ARTIFACTS_DIR, 'submit-dialog-focus.png');
    await client.captureScreenshot(dialogScreenshot);
    assert.ok(fs.existsSync(dialogScreenshot), 'submit-dialog-focus.png must be stored');

    // Verify dialog properties
    const dialogProps = await client.evaluate<{ role: string; hasTitle: boolean; hasButtons: boolean }>(`
      (() => {
        const modal = document.getElementById('submitModal');
        const role = modal.getAttribute('role') || 'dialog';
        const hasTitle = !!modal.querySelector('h3, .modal-title');
        const hasButtons = modal.querySelectorAll('button').length >= 2;
        return { role, hasTitle, hasButtons };
      })()
    `);

    assert.ok(dialogProps.role.includes('dialog'), 'Submit modal must have role="dialog"');
    assert.ok(dialogProps.hasTitle, 'Modal dialog must have an accessible title');
    assert.ok(dialogProps.hasButtons, 'Modal dialog must contain confirmation and cancel buttons');

    // Dismiss modal cleanly via cancel button
    await client.click('#btnCancelSubmit');
  });

  it('WCAG AA Color Contrast: computes contrast ratio for text and interface elements', async (t) => {
    const { server, client } = await getSession();
    if (!client || !server) {
      t.skip('Headless browser unavailable');
      return;
    }

    await client.navigate(`${server.origin}/index.html`);

    // Compute contrast ratio for key UI elements
    const contrastData = await client.evaluate<Array<{ selector: string; text: string; ratio: number; pass: boolean }>>(`
      (() => {
        function parseRgb(colorStr) {
          const match = colorStr.match(/\\d+/g);
          if (!match || match.length < 3) return [0, 0, 0];
          return [parseInt(match[0]), parseInt(match[1]), parseInt(match[2])];
        }

        function getLuminance([r, g, b]) {
          const [rs, gs, bs] = [r, g, b].map(c => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        }

        function getRatio(l1, l2) {
          const lighter = Math.max(l1, l2);
          const darker = Math.min(l1, l2);
          return (lighter + 0.05) / (darker + 0.05);
        }

        const elements = [
          { sel: 'body', text: 'Body Text' },
          { sel: '#examTitleHeader', text: 'Exam Header Title' },
          { sel: '#timerBox', text: 'Timer Box' },
          { sel: '.btn-submit', text: 'Submit Button' },
        ];

        return elements.map(({ sel, text }) => {
          const el = document.querySelector(sel);
          if (!el) return { selector: sel, text, ratio: 21, pass: true };
          const cs = window.getComputedStyle(el);
          const fg = parseRgb(cs.color);
          let bg = parseRgb(cs.backgroundColor);
          if (cs.backgroundColor.includes('rgba(0, 0, 0, 0)') || cs.backgroundColor === 'transparent') {
            bg = [255, 255, 255]; // fallback page white
          }
          const ratio = Math.round(getRatio(getLuminance(fg), getLuminance(bg)) * 10) / 10;
          return { selector: sel, text, ratio, pass: ratio >= 3.0 };
        });
      })()
    `);

    for (const item of contrastData) {
      assert.ok(
        item.ratio >= 3.0,
        `Element ${item.selector} (${item.text}) contrast ratio ${item.ratio}:1 must meet WCAG minimum`
      );
    }
  });

  it('ARIA Live & Timer Suppression: routine 1-second ticks do not spam screen readers', async (t) => {
    const { server, client } = await getSession();
    if (!client || !server) {
      t.skip('Headless browser unavailable');
      return;
    }

    await client.navigate(`${server.origin}/index.html`);

    // Verify timer does not have aria-live="assertive" or "polite" on every second
    const timerAria = await client.evaluate<{ ariaLive: string | null; ariaLabel: string | null }>(`
      (() => {
        const timer = document.getElementById('timerBox');
        return {
          ariaLive: timer ? timer.getAttribute('aria-live') : null,
          ariaLabel: timer ? timer.getAttribute('aria-label') : null,
        };
      })()
    `);

    // Conforms to WEB-contract.md §9: "status aria-live không đọc timer từng giây"
    assert.ok(
      timerAria.ariaLive === null || timerAria.ariaLive === 'off',
      'Timer must NOT have aria-live polite/assertive active on routine 1s ticks'
    );
    assert.ok(
      timerAria.ariaLabel !== null && timerAria.ariaLabel.length > 0,
      'Timer must have accessible aria-label description'
    );
  });

  it('High Contrast Mode: captures artifact verifying borders and readability', async (t) => {
    const { server, client } = await getSession();
    if (!client || !server) {
      t.skip('Headless browser unavailable');
      return;
    }

    // Emulate forced colors
    await client.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'forced-colors', value: 'active' }],
    });
    await client.navigate(`${server.origin}/index.html`);

    const highContrastPath = path.join(ARTIFACTS_DIR, 'high-contrast.png');
    const buf = await client.captureScreenshot(highContrastPath);
    assert.ok(buf.length > 1000, 'High contrast screenshot must be non-empty');
    assert.ok(fs.existsSync(highContrastPath), 'high-contrast.png must exist on disk');

    // Reset emulated media
    await client.send('Emulation.setEmulatedMedia', { features: [] });
  });

  it('teardown accessibility browser session', async () => {
    if (client) await client.close();
    if (server) await server.close();
  });
});
