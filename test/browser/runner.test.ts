/**
 * Capability-aware runner and evidence taxonomy test.
 * Conforms to WEB-contract.md §9–§10, §12 and internal-profile profile.
 * Distinguishes BROWSER_REAL, BROWSER_VM, MANUAL_CHECKLIST, and NOT_RUN.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectCapabilities, type CapabilityReport, type TestEvidenceRecord } from './capabilities.ts';

describe('WEB-W4-BROWSER — Capability-Aware Runner & Evidence Taxonomy', () => {
  const caps: CapabilityReport = detectCapabilities();

  it('detects host operating system and Node version', () => {
    assert.ok(caps.os.length > 0, 'OS string must be non-empty');
    assert.ok(caps.nodeVersion.startsWith('v24'), `Node version must be >= 24, got ${caps.nodeVersion}`);
  });

  it('detects installed browser binaries without crashing', () => {
    // Chrome or Edge must be detected on this machine
    const hasAnyBrowser = caps.browsers.chrome.available || caps.browsers.edge.available || caps.browsers.firefox.available;
    assert.ok(hasAnyBrowser, 'At least one browser executable must be detected on this host');
    if (caps.browsers.chrome.available) {
      assert.ok(caps.browsers.chrome.path !== null, 'Chrome path must not be null when available');
      assert.ok(caps.browsers.chrome.version !== null, 'Chrome version must be detected');
    }
  });

  it('identifies CDP capability when Chrome or Edge is present', () => {
    if (caps.browsers.chrome.available || caps.browsers.edge.available) {
      assert.strictEqual(caps.tools.cdp, true, 'CDP must be available when Chrome/Edge and Node WebSocket exist');
      assert.ok(caps.preferredBrowserPath !== null, 'Preferred browser path must be resolved');
    }
  });

  it('strictly reports NOT_RUN for uninstalled tools (axe-core, Lighthouse) without fake pass', () => {
    if (!caps.tools.axeCore.available) {
      assert.ok(caps.tools.axeCore.reason.startsWith('NOT_RUN'), 'axeCore must explicitly state NOT_RUN when uninstalled');
    }
    if (!caps.tools.lighthouse.available) {
      assert.ok(caps.tools.lighthouse.reason.startsWith('NOT_RUN'), 'lighthouse must explicitly state NOT_RUN when uninstalled');
    }
  });

  it('strictly reports NOT_RUN for OS-level IME automation and provides manual checklist', () => {
    assert.strictEqual(caps.tools.osImeDriver.available, false, 'OS IME driver hook cannot be claimed in headless runner');
    assert.ok(caps.tools.osImeDriver.reason.startsWith('NOT_RUN'), 'OS IME must state NOT_RUN');
    assert.ok(caps.tools.osImeDriver.reason.includes('manual checklist'), 'OS IME must refer to manual checklist');
  });

  it('strictly reports NOT_RUN for Live Google Apps Script/Drive service pending Decision D04', () => {
    assert.strictEqual(caps.tools.liveGoogleEndpoint.available, false, 'Live Google Apps Script must remain disabled under D04');
    assert.ok(caps.tools.liveGoogleEndpoint.reason.startsWith('NOT_RUN'), 'Live Google must state NOT_RUN');
    assert.ok(caps.tools.liveGoogleEndpoint.reason.includes('D04'), 'Reason must reference Decision D04');
  });

  it('constructs well-typed test evidence records distinguishing evidence categories', () => {
    const records: TestEvidenceRecord[] = [
      {
        testId: 'E2E-BROWSER-VIEWPORT-01',
        description: 'Real Chrome headless execution across 4 viewports',
        classification: 'BROWSER_REAL',
        status: 'PASS',
        artifactPath: 'test/browser/artifacts/desktop-1280.png',
      },
      {
        testId: 'E2E-BROWSER-VM-01',
        description: 'Node VM simulated DOM events for unit coverage',
        classification: 'BROWSER_VM',
        status: 'PASS',
      },
      {
        testId: 'E2E-MANUAL-IME-01',
        description: 'OS Vietnamese IME Telex/VNI manual checklist',
        classification: 'MANUAL_CHECKLIST',
        status: 'NOT_RUN',
        reason: 'Requires human typing with Unikey/EVKey on physical OS',
      },
      {
        testId: 'E2E-LIVE-CORS-01',
        description: 'Live Google Apps Script write & receipt verification',
        classification: 'NOT_RUN',
        status: 'NOT_RUN',
        reason: 'D04 pending owner approval; mock isolated',
      },
    ];

    assert.strictEqual(records.length, 4);
    assert.strictEqual(records[0]?.classification, 'BROWSER_REAL');
    assert.strictEqual(records[1]?.classification, 'BROWSER_VM');
    assert.strictEqual(records[2]?.classification, 'MANUAL_CHECKLIST');
    assert.strictEqual(records[3]?.classification, 'NOT_RUN');
  });
});
