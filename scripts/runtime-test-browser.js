import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const browserPath = candidates.find(existsSync);
if (!browserPath) throw new Error('Chrome/Edge not found. Set CHROME_PATH.');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const freePort = () => new Promise((resolve, reject) => {
  const socket = net.createServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => {
    const { port } = socket.address();
    socket.close(() => resolve(port));
  });
});
const waitForHttp = async (url, timeout = 12_000) => {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) { lastError = `${error.message}${error.cause ? `: ${error.cause.code ?? error.cause.message}` : ''}`; }
    await delay(100);
  }
  throw new Error(`HTTP endpoint did not become ready: ${url} (${lastError ?? 'no response'})`);
};
const stopChild = async (child) => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  // Only terminate the process tree spawned by this test, never other browser sessions.
  if (process.platform === 'win32') {
    await new Promise((resolve, reject) => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, (error) => {
      if (error) setTimeout(() => { if (child.exitCode === null && child.signalCode === null) reject(error); else resolve(); }, 250); else resolve();
    }));
  } else child.kill('SIGTERM');
  await Promise.race([new Promise(resolve => child.exitCode !== null || child.signalCode !== null ? resolve() : child.once('exit', resolve)), delay(3000)]);
};

class DevToolsPage {
  constructor(socket, url) {
    this.socket = socket;
    this.url = url;
    this.sequence = 0;
    this.pending = new Map();
    this.errors = [];
    this.requests = [];
    this.responses = new Map();
    socket.on('message', (raw) => this.onMessage(JSON.parse(raw)));
    socket.on('close', () => {
      for (const request of this.pending.values()) { clearTimeout(request.timeout); request.reject(new Error(`DevTools closed: ${url}`)); }
      this.pending.clear();
    });
  }

  onMessage(event) {
    if (event.id && this.pending.has(event.id)) {
      const request = this.pending.get(event.id);
      this.pending.delete(event.id);
      clearTimeout(request.timeout);
      if (event.error) request.reject(new Error(event.error.message)); else request.resolve(event.result);
      return;
    }
    if (event.method === 'Network.requestWillBeSent') this.requests.push({ id: event.params.requestId, url: event.params.request.url });
    if (event.method === 'Network.responseReceived') this.responses.set(event.params.requestId, event.params.response);
    if (event.method === 'Runtime.exceptionThrown') this.errors.push(`exception: ${event.params.exceptionDetails.text}`);
    if (event.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(event.params.type)) this.errors.push(`console.${event.params.type}`);
    if (event.method === 'Log.entryAdded' && ['error', 'warning'].includes(event.params.entry.level)) {
      this.errors.push(`${event.params.entry.level}: ${event.params.entry.text}`);
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timeout=setTimeout(()=>{this.pending.delete(id);reject(new Error(`DevTools timeout: ${method}`));},20000);
      timeout.unref();
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text}`);
    return result.result.value;
  }

  async waitFor(expression, label, timeout = 15_000) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
      try {
        last = await this.evaluate(expression);
        if (last) return last;
      } catch (error) { last = error.message; }
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${label}; last=${JSON.stringify(last)}`);
  }

  click(selector) {
    return this.evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw new Error('missing ${selector}'); element.click(); return true; })()`);
  }

  setViewport(width, height) {
    return this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  }

  async screenshot(file) {
    const result = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    for (let attempt = 0; ; attempt++) {
      try { await writeFile(file, Buffer.from(result.data, 'base64')); break; }
      catch (error) { if (attempt >= 3 || !['UNKNOWN', 'EBUSY', 'EPERM'].includes(error.code)) throw error; await delay(200); }
    }
  }

  close() { this.socket.close(); }
}

const openPage = async (debugPort, url, { display = false } = {}) => {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Could not create browser target: ${response.status}`);
  const target = await response.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`DevTools connection timed out: ${url}`)), 5000);
    socket.once('open', () => { clearTimeout(timeout); resolve(); });
    socket.once('error', reject);
  });
  const page = new DevToolsPage(socket, url);
  await Promise.all([page.send('Runtime.enable'), page.send('Log.enable'), page.send('Network.enable'), page.send('Page.enable')]);
  if (display) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__yokogawaAudioPlays = [];
      window.__yokogawaAudioTimes = [];
      const originalPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (!this.src.includes('prod-sfx-')) {
          window.__yokogawaAudioPlays.push(this.src);
          window.__yokogawaAudioTimes.push(Date.now());
        }
        return originalPlay.call(this);
      };
    ` });
  }
  try { await page.send('Page.navigate', { url }); }
  catch (error) { throw new Error(`${error.message}; errors=${JSON.stringify(page.errors)} requests=${JSON.stringify(page.requests.map(r=>r.url).slice(-8))}`); }
  await page.waitFor(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`, `${url} navigation`);
  return page;
};


export { delay, freePort, waitForHttp, stopChild, openPage, DevToolsPage, browserPath };
