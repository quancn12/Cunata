/**
 * Capability-aware runner and environment detection for Cunata Browser E2E.
 * Conforms to WEB-contract.md §9–§10, §12 and Shared Product Contract v2.0.
 * Zero external npm dependencies.
 */

import rawFs from 'node:fs';
import rawPath from 'node:path';
// @ts-ignore
import rawOs from 'node:os';
// @ts-ignore
import { execSync } from 'node:child_process';

const fs = rawFs as any;
const path = rawPath as any;
const os = rawOs as any;

export type EvidenceClassification =
  | 'BROWSER_REAL'      // Real headless browser execution via CDP
  | 'BROWSER_VM'        // Node VM / DOM mock environment
  | 'MANUAL_CHECKLIST'  // Manual physical/OS check required
  | 'NOT_RUN';          // Tool or approval unavailable, explicitly skipped with reason

export interface CapabilityReport {
  readonly timestamp: string;
  readonly os: string;
  readonly nodeVersion: string;
  readonly browsers: {
    readonly chrome: { readonly available: boolean; readonly path: string | null; readonly version: string | null };
    readonly edge: { readonly available: boolean; readonly path: string | null; readonly version: string | null };
    readonly firefox: { readonly available: boolean; readonly path: string | null; readonly version: string | null };
  };
  readonly tools: {
    readonly cdp: boolean;
    readonly axeCore: { readonly available: boolean; readonly reason: string };
    readonly lighthouse: { readonly available: boolean; readonly reason: string };
    readonly osImeDriver: { readonly available: boolean; readonly reason: string };
    readonly liveGoogleEndpoint: { readonly available: boolean; readonly reason: string };
  };
  readonly preferredBrowser: 'chrome' | 'edge' | 'firefox' | null;
  readonly preferredBrowserPath: string | null;
}

export interface TestEvidenceRecord {
  readonly testId: string;
  readonly description: string;
  readonly classification: EvidenceClassification;
  readonly status: 'PASS' | 'NOT_RUN' | 'SKIP' | 'FAIL';
  readonly reason?: string;
  readonly artifactPath?: string;
  readonly metrics?: Record<string, number | string>;
}

const COMMON_CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
];

const COMMON_EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  path.join(os.homedir(), 'AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe'),
];

const COMMON_FIREFOX_PATHS = [
  'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
  'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
];

function findExecutable(paths: readonly string[], envCommand?: string): string | null {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  if (envCommand) {
    try {
      const out = execSync(`where.exe ${envCommand}`, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
      const first = out.split('\r\n')[0]?.trim();
      if (first && fs.existsSync(first)) return first;
    } catch {}
  }
  return null;
}

function getProductVersion(exePath: string | null): string | null {
  if (!exePath) return null;
  try {
    const cmd = `powershell -NoProfile -Command "(Get-Item '${exePath.replace(/'/g, "''")}').VersionInfo.ProductVersion"`;
    const ver = execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    return ver || null;
  } catch {
    return 'detected';
  }
}

let cachedCapabilities: CapabilityReport | null = null;

export function detectCapabilities(): CapabilityReport {
  if (cachedCapabilities) return cachedCapabilities;

  const chromePath = findExecutable(COMMON_CHROME_PATHS, 'chrome');
  const edgePath = findExecutable(COMMON_EDGE_PATHS, 'msedge');
  const firefoxPath = findExecutable(COMMON_FIREFOX_PATHS, 'firefox');

  const chromeVer = getProductVersion(chromePath);
  const edgeVer = getProductVersion(edgePath);
  const firefoxVer = getProductVersion(firefoxPath);

  // Check axe-core
  let hasAxe = false;
  let axeReason = 'NOT_RUN: axe-core package is not installed in package.json or node_modules';
  try {
    const req = (import.meta as any).resolve ? (import.meta as any).resolve('axe-core') : null;
    if (req) {
      hasAxe = true;
      axeReason = 'available';
    }
  } catch {}

  // Check lighthouse
  let hasLighthouse = false;
  let lighthouseReason = 'NOT_RUN: lighthouse CLI is not installed in global PATH or node_modules';
  try {
    const lhOut = execSync('where.exe lighthouse', { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    if (lhOut) {
      hasLighthouse = true;
      lighthouseReason = 'available';
    }
  } catch {}

  // Check OS IME automation driver
  const hasOsIme = false;
  const osImeReason = 'NOT_RUN: OS-level Vietnamese IME driver hook (Unikey/EVKey automation) not available in headless CLI runner; manual checklist provided';

  // Check Live Google Endpoint (D04)
  const hasLiveGoogle = false;
  const liveGoogleReason = 'NOT_RUN: Live Google Apps Script/Drive service not approved by Product Owner (Decision D04 pending)';

  let preferredBrowser: 'chrome' | 'edge' | 'firefox' | null = null;
  let preferredBrowserPath: string | null = null;

  if (chromePath) {
    preferredBrowser = 'chrome';
    preferredBrowserPath = chromePath;
  } else if (edgePath) {
    preferredBrowser = 'edge';
    preferredBrowserPath = edgePath;
  } else if (firefoxPath) {
    preferredBrowser = 'firefox';
    preferredBrowserPath = firefoxPath;
  }

  cachedCapabilities = {
    timestamp: new Date().toISOString(),
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    nodeVersion: (process as any).version || 'v24',
    browsers: {
      chrome: { available: !!chromePath, path: chromePath, version: chromeVer },
      edge: { available: !!edgePath, path: edgePath, version: edgeVer },
      firefox: { available: !!firefoxPath, path: firefoxPath, version: firefoxVer },
    },
    tools: {
      cdp: typeof WebSocket !== 'undefined' && (!!chromePath || !!edgePath),
      axeCore: { available: hasAxe, reason: axeReason },
      lighthouse: { available: hasLighthouse, reason: lighthouseReason },
      osImeDriver: { available: hasOsIme, reason: osImeReason },
      liveGoogleEndpoint: { available: hasLiveGoogle, reason: liveGoogleReason },
    },
    preferredBrowser,
    preferredBrowserPath,
  };

  return cachedCapabilities;
}
