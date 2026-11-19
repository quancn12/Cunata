import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CdpClient } from './cdp-client.ts';

function disconnectedPeer(): CdpClient {
  const client = new (CdpClient as any)();
  client.ws = { readyState: WebSocket.OPEN, send() {}, close() {} };
  return client;
}

test('CDP close rejects pending requests instead of leaving an awaited test hanging', { timeout: 2000 }, async () => {
  const client = disconnectedPeer();
  const rejected = assert.rejects(client.send('Runtime.evaluate'), /CDP client closed/);
  await client.close();
  await rejected;
});

test('CDP request has a deadline when the browser never responds', { timeout: 20000 }, async () => {
  const client = disconnectedPeer();
  try {
    await assert.rejects(client.send('Runtime.evaluate'), /CDP request timed out: Runtime.evaluate/);
  } finally {
    await client.close();
  }
});

test('CDP synchronous send failure rejects immediately and clears pending requests', { timeout: 2000 }, async () => {
  const client = disconnectedPeer();
  (client as any).ws.send = () => { throw new Error('Connection lost'); };
  try {
    await assert.rejects(client.send('Page.enable'), /Connection lost/);
    assert.equal((client as any).pendingRequests.size, 0);
  } finally {
    await client.close();
  }
});

test('CDP launch cleans up when the executable exits before opening DevTools', { timeout: 20000 }, async () => {
  // Node exits on Chrome-only flags, exercising the actual spawn failure path.
  await assert.rejects(
    CdpClient.launch({ browserPath: (globalThis as any).process.execPath }),
    /Browser exited before DevTools became ready/,
  );
});
