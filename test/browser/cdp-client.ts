/**
 * Lightweight, zero-dependency Chrome/Edge DevTools Protocol (CDP) client.
 * Uses Node.js native child_process, http, and global WebSocket (Node 24).
 * Conforms to WEB-contract.md §9–§10.
 */

// @ts-ignore
import rawCp from 'node:child_process';
// @ts-ignore
import rawHttp from 'node:http';
// @ts-ignore
import rawNet from 'node:net';
// @ts-ignore
import rawOs from 'node:os';
import rawPath from 'node:path';
import rawFs from 'node:fs';
import { detectCapabilities } from './capabilities.ts';

const cp = rawCp as any;
const http = rawHttp as any;
const net = rawNet as any;
const os = rawOs as any;
const path = rawPath as any;
const fs = rawFs as any;

declare const Buffer: any;

export interface ViewportOptions {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor?: number;
  readonly mobile?: boolean;
}

export interface CdpLaunchOptions {
  readonly browserPath?: string;
  readonly headless?: boolean;
  readonly width?: number;
  readonly height?: number;
}

export class CdpClient {
  private proc: any = null;
  private ws: WebSocket | null = null;
  private tempDir: string | null = null;
  private port: number = 0;
  private nextId: number = 1;
  private pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: Error) => void }>();
  private eventHandlers = new Map<string, Array<(params: any) => void>>();

  private constructor() {}

  public static async launch(options: CdpLaunchOptions = {}): Promise<CdpClient> {
    const caps = detectCapabilities();
    const browserExe = options.browserPath || caps.preferredBrowserPath;
    if (!browserExe) {
      throw new Error('No supported browser executable (Chrome/Edge) found on this machine');
    }

    const client = new CdpClient();
    client.port = await client.findFreePort();
    client.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cunata_cdp_'));

    const args = [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--no-first-run',
      `--remote-debugging-port=${client.port}`,
      `--user-data-dir=${client.tempDir}`,
      `--window-size=${options.width || 1280},${options.height || 800}`,
      'about:blank',
    ];

    client.proc = cp.spawn(browserExe, args, { stdio: 'ignore', windowsHide: true });
    let launchError: Error | undefined;
    client.proc.once('error', (error: Error) => { launchError = error; });

    try {
      // Poll for CDP readiness; a failed launch must still dispose its process.
      const pageWsUrl = await client.pollForPageTarget(client.port, 15000);
      if (launchError) throw launchError;
      await client.connectWebSocket(pageWsUrl);

      // Enable essential domains
      await client.send('Page.enable');
      await client.send('DOM.enable');
      await client.send('Runtime.enable');
      await client.send('Network.enable');

      if (options.width && options.height) {
        await client.setViewport({ width: options.width, height: options.height });
      }

      return client;
    } catch (error) {
      await client.close();
      throw launchError ?? error;
    }
  }

  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.listen(0, '127.0.0.1', () => {
        const port = srv.address().port;
        srv.close((err: any) => (err ? reject(err) : resolve(port)));
      });
      srv.on('error', reject);
    });
  }

  private async pollForPageTarget(port: number, timeoutMs: number): Promise<string> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.proc && (this.proc.exitCode !== null || this.proc.signalCode !== null)) {
        throw new Error('Browser exited before DevTools became ready');
      }
      try {
        const list = await this.httpGetJson<any[]>(`http://127.0.0.1:${port}/json/list`);
        const page = list.find((item: any) => item.type === 'page' && item.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      } catch {
        // Wait and retry
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(`Timeout waiting for browser DevTools on port ${port} after ${timeoutMs}ms`);
  }

  private httpGetJson<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const request = http.get(url, (res: any) => {
        let body = '';
        res.on('data', (chunk: any) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body) as T);
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
      request.setTimeout(2000, () => request.destroy(new Error('CDP discovery request timed out')));
    });
  }

  private connectWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      const timer = setTimeout(() => {
        reject(new Error('CDP WebSocket connection timed out'));
        ws.close();
      }, 6000);
      ws.onopen = () => { clearTimeout(timer); resolve(); };
      ws.onerror = (err) => {
        clearTimeout(timer);
        reject(new Error(`WebSocket error: ${String(err)}`));
      };
      ws.onclose = () => {
        clearTimeout(timer);
        reject(new Error('CDP WebSocket closed'));
        for (const request of this.pendingRequests.values()) {
          request.reject(new Error('CDP WebSocket closed'));
        }
        this.pendingRequests.clear();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.method === 'Runtime.consoleAPICalled') {
            console.log('[BROWSER]', ...msg.params.args.map((a: any) => a.value ?? a.description ?? ''));
          }
          if (msg.id && this.pendingRequests.has(msg.id)) {
            const req = this.pendingRequests.get(msg.id)!;
            this.pendingRequests.delete(msg.id);
            if (msg.error) {
              req.reject(new Error(`CDP Error (${msg.error.code}): ${msg.error.message}`));
            } else {
              req.resolve(msg.result);
            }
          } else if (msg.method) {
            const handlers = this.eventHandlers.get(msg.method) || [];
            for (const h of handlers) h(msg.params);
          }
        } catch {}
      };
    });
  }

  public send<T = any>(method: string, params: Record<string, any> = {}, timeoutMs = 15000): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket is not open'));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        const details = params?.expression ? ` expression: ${params.expression.slice(0, 100)}` : '';
        reject(new Error(`CDP request timed out: ${method}${details}`));
      }, timeoutMs);
      const request = {
        resolve: (value: T) => { clearTimeout(timer); resolve(value); },
        reject: (error: Error) => { clearTimeout(timer); reject(error); },
      };
      this.pendingRequests.set(id, request);
      try {
        this.ws!.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        this.pendingRequests.delete(id);
        request.reject(error as Error);
      }
    });
  }

  public on(event: string, handler: (params: any) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
    return () => {
      const arr = this.eventHandlers.get(event) || [];
      const idx = arr.indexOf(handler);
      if (idx >= 0) arr.splice(idx, 1);
    };
  }

  public async navigate(url: string): Promise<void> {
    await new Promise<void>((resolve) => {
      let resolved = false;
      let timer: ReturnType<typeof setTimeout>;
      const off = this.on('Page.loadEventFired', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          off();
          resolve();
        }
      });
      // Fallback timeout in case loadEvent already fired or doesn't fire
      timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          off();
          resolve();
        }
      }, 5000);
      this.send('Page.navigate', { url }).catch(() => {});
    });
    // Extra grace tick for DOM hydration
    await new Promise((r) => setTimeout(r, 250));
  }

  public async setViewport(options: ViewportOptions): Promise<void> {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: options.width,
      height: options.height,
      deviceScaleFactor: options.deviceScaleFactor ?? 1,
      mobile: options.mobile ?? false,
    });
  }

  public async captureScreenshot(filePath: string): Promise<any> {
    const res = await this.send<{ data: string }>('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(res.data, 'base64');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buf);
    return buf;
  }

  public async evaluate<T>(expression: string, timeoutMs?: number): Promise<T> {
    const res = await this.send<{
      result: { type: string; value?: any; description?: string };
      exceptionDetails?: {
        text: string;
        lineNumber: number;
        columnNumber: number;
        exception?: { description?: string };
      };
    }>(
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
        awaitPromise: true,
      },
      timeoutMs
    );
    if (res.exceptionDetails) {
      const msg = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(
        `Runtime.evaluate failed: ${msg} (at line ${res.exceptionDetails.lineNumber}:${res.exceptionDetails.columnNumber})`
      );
    }
    return res.result.value as T;
  }

  public async createTab(url: string = 'about:blank'): Promise<CdpClient> {
    const res = await this.send<{ targetId: string }>('Target.createTarget', { url });
    const targetId = res.targetId;
    const list = await this.httpGetJson<any[]>(`http://127.0.0.1:${this.port}/json/list`);
    const page = list.find((item: any) => item.id === targetId && item.webSocketDebuggerUrl);
    if (!page) {
      throw new Error(`Target ${targetId} not found in json/list`);
    }
    const tabClient = new (this.constructor as typeof CdpClient)();
    tabClient.port = this.port;
    tabClient.proc = null;
    tabClient.tempDir = null;
    try {
      await tabClient.connectWebSocket(page.webSocketDebuggerUrl);
      await tabClient.send('Page.enable');
      await tabClient.send('DOM.enable');
      await tabClient.send('Runtime.enable');
      await tabClient.send('Network.enable');
      return tabClient;
    } catch (error) {
      await tabClient.close();
      await this.send('Target.closeTarget', { targetId }).catch(() => {});
      throw error;
    }
  }

  public async waitForSelector(selector: string, timeoutMs: number = 5000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const exists = await this.evaluate<boolean>(`!!document.querySelector(${JSON.stringify(selector)})`);
      if (exists) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  public async waitForVisible(selector: string, timeoutMs: number = 5000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const isVis = await this.evaluate<boolean>(`(() => {
        const els = document.querySelectorAll(${JSON.stringify(selector)});
        for (const el of els) {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') return true;
        }
        return false;
      })()`);
      if (isVis) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  public async waitForFunction(fnBody: string, timeoutMs: number = 5000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await this.evaluate<boolean>(`Boolean(${fnBody})`);
        if (res) return true;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  public async click(selector: string): Promise<void> {
    const found = await this.waitForSelector(selector);
    if (!found) throw new Error(`Cannot click: element not found: ${selector}`);
    await this.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) {
          el.scrollIntoView({ block: 'center' });
          el.click();
        }
      })()
    `);
    await new Promise((r) => setTimeout(r, 100));
  }

  public async type(selector: string, text: string): Promise<void> {
    const found = await this.waitForSelector(selector);
    if (!found) throw new Error(`Cannot type: element not found: ${selector}`);
    await this.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) {
          el.focus();
          el.value = ${JSON.stringify(text)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await new Promise((r) => setTimeout(r, 50));
  }

  public async getPerformanceMetrics(): Promise<Record<string, number>> {
    await this.send('Performance.enable');
    const res = await this.send<{ metrics: Array<{ name: string; value: number }> }>('Performance.getMetrics');
    const map: Record<string, number> = {};
    for (const m of res.metrics) {
      map[m.name] = m.value;
    }
    return map;
  }

  public async getHeapUsage(): Promise<{ usedSize: number; totalSize: number }> {
    const res = await this.send<{ usedSize: number; totalSize: number }>('Runtime.getHeapUsage');
    return res;
  }

  public async emulateNetworkOffline(offline: boolean): Promise<void> {
    await this.send('Network.emulateNetworkConditions', {
      offline,
      latency: offline ? 0 : 20,
      downloadThroughput: offline ? 0 : 50000000,
      uploadThroughput: offline ? 0 : 50000000,
    });
  }

  public async close(): Promise<void> {
    for (const request of this.pendingRequests.values()) {
      request.reject(new Error('CDP client closed'));
    }
    this.pendingRequests.clear();
    this.eventHandlers.clear();
    try {
      if (this.ws && this.ws.readyState < WebSocket.CLOSING) {
        this.ws.close();
      }
    } catch {}

    try {
      if (this.proc && !this.proc.killed) {
        this.proc.kill('SIGTERM');
        await new Promise<void>((resolve) => {
          if (this.proc.exitCode !== null || this.proc.signalCode !== null) return resolve();
          const timer = setTimeout(resolve, 3000);
          this.proc.once('exit', () => { clearTimeout(timer); resolve(); });
        });
        this.proc.unref();
      }
    } catch {}

    if (this.tempDir) {
      try {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      } catch {}
    }
  }
}
