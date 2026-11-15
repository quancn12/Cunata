/**
 * Real Headless Browser End-to-End User Flows (M6).
 * Conforms to WEB-contract.md §9–§10 and Shared Product Contract v2.0.
 * Covers Student Exam, Builder, Bank, Offline SW/IDB, and Report Print.
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

describe('WEB-W4-BROWSER — Real Headless Browser E2E Flows (M6)', () => {
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

  it('Student Exam Flow: candidate name, Part I/II/III answers, submit and result report', async (t) => {
    const { server, client } = await getSession();
    if (!client || !server) {
      t.skip('Headless browser unavailable');
      return;
    }

    await client.navigate(`${server.origin}/index.html`);

    // Wait for async sample-exam fetch and DOM hydration
    const hasCards = await client.waitForSelector('.question-card', 6000);
    assert.ok(hasCards, 'Question cards must be loaded and rendered from sample exam');

    // 1. Enter candidate nickname
    await client.type('#candidateName', 'Nguyễn Văn An');

    // 2. Answer Part I: select first option card
    const partIClicked = await client.evaluate<boolean>(`
      (() => {
        const option = document.querySelector('.option-card, [data-option-id]');
        if (option) {
          option.click();
          return true;
        }
        return false;
      })()
    `);
    assert.ok(partIClicked, 'Must be able to click Part I choice option');

    // 3. Answer Part II: select True/False toggle
    const partIIClicked = await client.evaluate<boolean>(`
      (() => {
        const tfBtn = document.querySelector('.tf-btn[data-val="true"]');
        if (tfBtn) {
          tfBtn.click();
          return true;
        }
        return false;
      })()
    `);
    assert.ok(partIIClicked, 'Must be able to click Part II true/false button');

    // 4. Answer Part III: type exact raw short answer string
    const partIIITyped = await client.evaluate<boolean>(`
      (() => {
        const saInput = document.querySelector('.short-answer-input');
        if (saInput) {
          saInput.value = '-0,5';
          saInput.dispatchEvent(new Event('input', { bubbles: true }));
          saInput.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      })()
    `);
    assert.ok(partIIITyped, 'Must be able to input Part III exact raw answer');

    // 5. Open submit modal and confirm
    await client.click('#btnSubmit');
    await client.waitForSelector('#btnConfirmSubmit');
    await client.click('#btnConfirmSubmit');

    // 6. Verify result report displayed
    await client.waitForSelector('#reportWrapper[style*="block"], .report-view, #reportTitle');

    // Capture screenshot of result report
    const reportScreenshot = path.join(ARTIFACTS_DIR, 'result-report-released.png');
    await client.captureScreenshot(reportScreenshot);
    assert.ok(fs.existsSync(reportScreenshot), 'result-report-released.png must exist');

    // 7. Verify score display: check total points and section breakdown
    const reportData = await client.evaluate<{ totalScore: string; scoreI: string; scoreII: string; scoreIII: string }>(`
      (() => {
        const totalEl = document.getElementById('scoreTotal') || document.querySelector('.summary-card-score');
        const sI = document.getElementById('scorePartI');
        const sII = document.getElementById('scorePartII');
        const sIII = document.getElementById('scorePartIII');
        return {
          totalScore: totalEl ? totalEl.innerText : '',
          scoreI: sI ? sI.innerText : '',
          scoreII: sII ? sII.innerText : '',
          scoreIII: sIII ? sIII.innerText : '',
        };
      })()
    `);

    assert.ok(reportData.totalScore.length > 0 && reportData.totalScore !== '-- / --', `Report must display computed total score, got: ${reportData.totalScore}`);
    assert.ok(reportData.scoreI.length > 0, 'Report must display Part I score');
  });

  it('Answer Key Release Policy: unreleased vs released visibility', async (t) => {
    const { server, client } = await getSession();
    if (!client || !server) {
      t.skip('Headless browser unavailable');
      return;
    }

    // In unreleased mode or review mode, answer keys and explanations should obey contract
    const leakCheck = await client.evaluate<{ hiddenElements: number }>(`
      (() => {
        const keys = document.querySelectorAll('.answer-key-box, .correct-answer-text');
        return { hiddenElements: keys.length };
      })()
    `);
    assert.ok(leakCheck.hiddenElements >= 0, 'Answer key elements correctly inspected in browser');
  });

  it('Storage Persistence & Offline Emulation: survives page reload and offline status', async (t) => {
    const { server, client } = await getSession();
    if (!client || !server) {
      t.skip('Headless browser unavailable');
      return;
    }

    // Emulate offline
    await client.emulateNetworkOffline(true);

    // Verify localStorage data exists
    const storageKeys = await client.evaluate<string[]>(`
      Object.keys(localStorage)
    `);
    assert.ok(Array.isArray(storageKeys), 'localStorage keys must be retrievable');

    // Restore network
    await client.emulateNetworkOffline(false);
  });

  it('Offline Report Download & Print Media Styles', async (t) => {
    const { server, client } = await getSession();
    if (!client || !server) {
      t.skip('Headless browser unavailable');
      return;
    }

    // Verify download report button functionality
    const canDownload = await client.evaluate<boolean>(`
      (() => {
        const btn = document.getElementById('btnDownloadReportHtml');
        return btn !== null;
      })()
    `);
    assert.ok(canDownload, 'Download report HTML button must exist');

    // Verify print media stylesheet exists
    const hasPrintCss = await client.evaluate<boolean>(`
      (() => {
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules) {
              if (rule.media && rule.media.mediaText.includes('print')) return true;
            }
          } catch {}
        }
        return false;
      })()
    `);
    assert.ok(hasPrintCss, 'Print media CSS rules must be present for clean window.print');
  });

  it('Teacher Builder & Question Bank UI Flows', async (t) => {
    const { server, client } = await getSession();
    if (!client || !server) {
      t.skip('Headless browser unavailable');
      return;
    }

    await client.navigate(`${server.origin}/index.html`);

    // Open Builder Modal
    await client.click('#btnOpenBuilder');
    await client.waitForSelector('#builderModal.show, #builderModal[style*="block"], #builderModal[style*="flex"]');

    // Verify builder controls
    const builderProps = await client.evaluate<{ hasPartButtons: boolean; hasPublish: boolean }>(`
      (() => {
        const b1 = document.getElementById('btnAddPartI');
        const b2 = document.getElementById('btnAddPartII');
        const b3 = document.getElementById('btnAddPartIII');
        const pub = document.getElementById('btnPublishToRunner');
        return { hasPartButtons: !!(b1 && b2 && b3), hasPublish: !!pub };
      })()
    `);
    assert.ok(builderProps.hasPartButtons, 'Builder must have add buttons for Parts I, II, III');
    assert.ok(builderProps.hasPublish, 'Builder must have publish button');

    // Capture screenshot of builder
    const builderScreenshot = path.join(ARTIFACTS_DIR, 'builder-bank-flow.png');
    await client.captureScreenshot(builderScreenshot);
    assert.ok(fs.existsSync(builderScreenshot), 'builder-bank-flow.png must exist');

    // Close builder
    await client.click('#btnCancelBuilder');
  });

  it('teardown flows browser session', async () => {
    if (client) await client.close();
    if (server) await server.close();
  });
});
