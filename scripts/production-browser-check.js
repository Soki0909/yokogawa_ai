import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
const stopChild = (child) => new Promise((resolve) => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return resolve();
  child.once('exit', resolve);
  child.kill('SIGTERM');
  setTimeout(resolve, 3000).unref();
});

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
      for (const request of this.pending.values()) request.reject(new Error(`DevTools closed: ${url}`));
      this.pending.clear();
    });
  }

  onMessage(event) {
    if (event.id && this.pending.has(event.id)) {
      const request = this.pending.get(event.id);
      this.pending.delete(event.id);
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
      this.pending.set(id, { resolve, reject });
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
      const originalPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        window.__yokogawaAudioPlays.push(this.src);
        return originalPlay.call(this);
      };
    ` });
  }
  await page.send('Page.navigate', { url });
  await page.waitFor(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`, `${url} navigation`);
  return page;
};

const temporary = await mkdtemp(path.join(os.tmpdir(), 'yokogawa-production-browser-'));
const serverPort = await freePort();
const debugPort = await freePort();
const baseUrl = `http://127.0.0.1:${serverPort}`;
const serverEnvironment = {
  ...process.env,
  HOST: '127.0.0.1',
  PORT: String(serverPort),
  AIVIS_ENGINE_URL: 'http://127.0.0.1:9',
  STATE_FILE: path.join(temporary, 'state.json'),
  LOG_DIRECTORY: path.join(temporary, 'logs'),
};
let server;
let browser;
let admin;
let display;
let serverOutput = '';
const startServer = async () => {
  serverOutput = '';
  server = spawn(process.execPath, ['src/server.js'], { cwd: process.cwd(), env: serverEnvironment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  server.stdout.on('data', (chunk) => { serverOutput += chunk; });
  server.stderr.on('data', (chunk) => { serverOutput += chunk; });
  try { await waitForHttp(`${baseUrl}/health`); }
  catch (error) { throw new Error(`${error.message}; server=${serverOutput.trim() || `exit ${server.exitCode}`}`); }
};

try {
  await startServer();
  const production = JSON.parse(await readFile('shows/production.json', 'utf8'));
  const imported = await fetch(`${baseUrl}/api/show-file/import`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(production),
  });
  if (!imported.ok) throw new Error(`Production Show import failed: ${imported.status}`);

  browser = spawn(browserPath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temporary, 'browser')}`, 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);

  display = await openPage(debugPort, `${baseUrl}/display?id=production-check&name=7-201`, { display: true });
  admin = await openPage(debugPort, `${baseUrl}/admin`);
  await display.waitFor(`document.querySelector('#connection')?.textContent === 'ONLINE'`, 'Display ONLINE');
  await admin.waitFor(`document.querySelector('#display-list')?.textContent.includes('production-check')`, 'Display registration');

  await admin.evaluate(`(() => { const select = document.querySelector('#audio-master-select'); select.value = 'production-check'; select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await display.waitFor(`document.querySelector('#audio-help')?.textContent.includes('18 / 18 READY')`, '18/18 preload');
  await display.click('#enable-audio');
  await admin.waitFor(`document.querySelector('#display-list')?.textContent.includes('AUDIO MASTER READY')`, 'Audio Master READY');
  await admin.evaluate(`(() => { const input = document.querySelector('.display-item[data-display-id="production-check"] [data-action="required"]'); input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await admin.waitFor(`document.querySelector('#display-list')?.textContent.includes('REQUIRED')`, 'Required Display');

  const representative = ['prod-001', 'prod-004', 'prod-008', 'prod-013', 'prod-015', 'prod-016'];
  for (const cueId of representative) {
    const cue = production.cues.find((item) => item.id === cueId);
    const selector = `.cue-item[data-cue-id="${cueId}"] [data-action="run"]`;
    const playCount = await display.evaluate('window.__yokogawaAudioPlays.length');
    await admin.waitFor(`document.querySelector(${JSON.stringify(selector)})?.disabled === false`, `${cueId} run enabled`);
    await admin.click(selector);
    try {
      await display.waitFor(`document.querySelector('#caption')?.textContent === ${JSON.stringify(cue.displayText)}`, `${cueId} caption`);
    } catch (error) {
      const browserState = await Promise.all([
        display.evaluate(`({ caption: document.querySelector('#caption')?.textContent, mode: document.querySelector('#mode-label')?.textContent, plays: window.__yokogawaAudioPlays })`),
        admin.evaluate(`({ currentCue: document.querySelector('#show-current-cue')?.textContent, voice: document.querySelector('#voice-status')?.textContent, notice: document.querySelector('#notice')?.textContent })`),
      ]);
      throw new Error(`${error.message}; browserState=${JSON.stringify(browserState)}`);
    }
    await display.waitFor(`window.__yokogawaAudioPlays.length > ${playCount} && window.__yokogawaAudioPlays.at(-1).includes(${JSON.stringify(cue.audio.assetId)})`, `${cueId} local WAV playback`);
    if (cueId === 'prod-008') await display.waitFor(`document.body.dataset.preset === 'hijacked'`, 'HIJACKED preset');
    await admin.waitFor(`document.querySelector('#show-stop-button')?.disabled === false`, `${cueId} STOP enabled`);
    await admin.click('#show-stop-button');
    await admin.waitFor(`['停止', '完了'].includes(document.querySelector('#voice-status')?.textContent)`, `${cueId} STOP`);
    await delay(700);
  }

  await admin.waitFor(`document.querySelector('.cue-item[data-cue-id="prod-001"] [data-action="run"]')?.disabled === false`, 'replay source enabled');
  await admin.click('.cue-item[data-cue-id="prod-001"] [data-action="run"]');
  await display.waitFor(`window.__yokogawaAudioPlays.at(-1)?.includes('prod-voice-001-')`, 'replay source cue');
  await admin.waitFor(`document.querySelector('#show-stop-button')?.disabled === false`, 'replay source STOP enabled');
  await admin.click('#show-stop-button');
  await delay(700);
  const beforeReplay = await display.evaluate('window.__yokogawaAudioPlays.length');
  await admin.waitFor(`document.querySelector('#show-replay-button')?.disabled === false`, 'REPLAY enabled');
  await admin.click('#show-replay-button');
  await display.waitFor(`window.__yokogawaAudioPlays.length > ${beforeReplay} && window.__yokogawaAudioPlays.at(-1).includes('prod-voice-001-')`, 'REPLAY');
  await admin.waitFor(`document.querySelector('#show-stop-button')?.disabled === false`, 'replay STOP enabled');
  await admin.click('#show-stop-button');
  await delay(700);

  await admin.waitFor(`document.querySelector('#show-blackout-button')?.disabled === false`, 'BLACKOUT enabled');
  await admin.click('#show-blackout-button');
  await display.waitFor(`document.querySelector('#blackout')?.hidden === false`, 'BLACKOUT');
  await delay(700);
  await admin.waitFor(`document.querySelector('#show-blackout-clear-button')?.disabled === false`, 'RESTORE enabled');
  await admin.click('#show-blackout-clear-button');
  await display.waitFor(`document.querySelector('#blackout')?.hidden === true`, 'RESTORE');

  const errorsBeforeRestart = [admin.errors.length, display.errors.length];
  await stopChild(server);
  await display.waitFor(`document.querySelector('#connection')?.textContent !== 'ONLINE'`, 'Display disconnect');
  await startServer();
  await display.waitFor(`document.querySelector('#connection')?.textContent === 'ONLINE'`, 'Display reconnect', 20_000);
  await admin.waitFor(`document.querySelector('#display-list')?.textContent.includes('AUDIO MASTER READY')`, 'READY restored after reconnect', 20_000);
  for (const [index, page] of [admin, display].entries()) {
    const restartErrors = page.errors.splice(errorsBeforeRestart[index]);
    const unexpected = restartErrors.filter((message) => !message.includes('WebSocket connection') || !message.includes('ERR_CONNECTION_REFUSED'));
    if (unexpected.length) throw new Error(`Unexpected errors during planned restart: ${unexpected.join(' | ')}`);
  }

  await display.send('Page.reload', { ignoreCache: false });
  await display.waitFor(`document.readyState === 'complete' && document.querySelector('#connection')?.textContent === 'ONLINE'`, 'Display reload');
  await display.waitFor(`document.querySelector('#audio-help')?.textContent.includes('18 / 18 READY') && document.querySelector('#audio-gate')?.hidden === false`, 'reload preload gate');
  await display.click('#enable-audio');
  await admin.waitFor(`document.querySelector('#display-list')?.textContent.includes('AUDIO MASTER READY')`, 'READY after reload');

  const pages = [admin, display];
  const offOrigin = pages.flatMap((page) => page.requests.map((item) => item.url)).filter((url) => {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol) && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost';
    } catch { return false; }
  });
  if (offOrigin.length) throw new Error(`External browser requests detected: ${[...new Set(offOrigin)].join(', ')}`);
  const browserErrors = pages.flatMap((page) => page.errors);
  if (browserErrors.length) throw new Error(`Browser errors: ${browserErrors.join(' | ')}`);
  const assetRequests = display.requests.filter((item) => item.url.includes('/api/assets/prod-voice-'));
  if (assetRequests.length < 18) throw new Error(`Expected at least 18 production asset requests, got ${assetRequests.length}`);

  console.log(JSON.stringify({
    status: 'PASS', viewport: [1920, 1080], preload: '18/18', cues: representative,
    controls: ['STOP', 'REPLAY', 'BLACKOUT', 'RESTORE'], reconnectReady: true, reloadReady: true,
    productionAssetRequests: assetRequests.length, externalBrowserRequests: 0, browserErrors: 0,
  }));
} finally {
  admin?.close(); display?.close();
  await stopChild(server);
  await stopChild(browser);
  await rm(temporary, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
