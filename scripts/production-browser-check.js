import { spawn } from 'node:child_process';
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

  setViewport(width, height) {
    return this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  }

  async screenshot(file) {
    const result = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(file, Buffer.from(result.data, 'base64'));
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
const artifactDirectory = path.resolve('artifacts/scene-rehearsal-start');
await mkdir(artifactDirectory, { recursive: true });
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

  await admin.click('#scene-rehearsal-session-toggle');
  await admin.waitFor(`document.querySelector('#scene-rehearsal-session-toggle')?.textContent === 'リハーサル終了'`, 'rehearsal safety gate active');
  const selectScene = (sceneId) => admin.evaluate(`(() => { const select = document.querySelector('#rehearsal-scene-select'); select.value = ${JSON.stringify(sceneId)}; select.dispatchEvent(new Event('change', { bubbles: true })); return select.value; })()`);
  const startScene = async (sceneId) => {
    await selectScene(sceneId);
    await admin.waitFor(`document.querySelector('#scene-rehearsal-start')?.disabled === false`, `${sceneId} rehearsal start enabled`);
    await admin.click('#scene-rehearsal-start');
    await admin.waitFor(`document.querySelector('#scene-rehearsal-ready-scene')?.textContent.includes(${JSON.stringify(`Scene ${sceneId.split('-')[1]}`)})`, `${sceneId} ready`);
  };

  const noCuePlayCount = await display.evaluate('window.__yokogawaAudioPlays.length');
  await startScene('scene-2');
  await admin.waitFor(`document.querySelector('#scene-rehearsal-ready-next')?.textContent.includes('このScene内に横川AI Cueはありません')`, 'no-AI-Cue ready message');
  await admin.waitFor(`document.querySelector('#show-next-button')?.disabled === true`, 'no-AI-Cue NEXT blocked');
  await display.waitFor(`document.body.dataset.preset === 'hijacked' && document.querySelector('#caption')?.textContent.includes('第一の謎')`, 'Scene 2 start state');
  if (await display.evaluate('window.__yokogawaAudioPlays.length') !== noCuePlayCount) throw new Error('Scene 2 start unexpectedly played audio');
  const scene2State = await display.evaluate(`({ preset: document.body.dataset.preset, caption: document.querySelector('#caption')?.textContent, overlay: document.body.dataset.overlay, visual: document.body.dataset.visual, transition: document.body.dataset.transitionStatus, unlock: document.body.dataset.unlockStatus })`);
  await admin.setViewport(1920, 1080); await admin.screenshot(path.join(artifactDirectory, 'admin-1920x1080-no-ai-cue.png'));

  await startScene('scene-6');
  await admin.waitFor(`document.querySelector('#scene-rehearsal-ready-next')?.textContent.includes('P-011')`, 'Scene 6 first Cue');
  await display.waitFor(`document.body.dataset.preset === 'warning'`, 'Scene 6 start state');
  await admin.screenshot(path.join(artifactDirectory, 'admin-1920x1080-ai-cue.png'));
  await admin.setViewport(1280, 720); await admin.screenshot(path.join(artifactDirectory, 'admin-1280x720-ai-cue.png'));
  await startScene('scene-2');
  await admin.screenshot(path.join(artifactDirectory, 'admin-1280x720-no-ai-cue.png'));
  const scene2Again = await display.evaluate(`({ preset: document.body.dataset.preset, caption: document.querySelector('#caption')?.textContent, overlay: document.body.dataset.overlay, visual: document.body.dataset.visual, transition: document.body.dataset.transitionStatus, unlock: document.body.dataset.unlockStatus })`);
  if (JSON.stringify(scene2Again) !== JSON.stringify(scene2State)) throw new Error(`Scene state drift: ${JSON.stringify({ scene2State, scene2Again })}`);
  await admin.setViewport(1920, 1080);

  await display.send('Page.reload', { ignoreCache: false });
  await display.waitFor(`document.readyState === 'complete' && document.querySelector('#connection')?.textContent === 'ONLINE'`, 'Scene 2 Display reload');
  await display.waitFor(`document.body.dataset.preset === 'hijacked' && document.querySelector('#caption')?.textContent.includes('第一の謎') && document.body.dataset.transitionStatus !== 'active' && document.body.dataset.unlockStatus !== 'running'`, 'Scene 2 reload final state only');
  if (await display.evaluate('window.__yokogawaAudioPlays.length') !== 0) throw new Error('Scene 2 Display reload replayed historical audio');
  await display.waitFor(`document.querySelector('#audio-help')?.textContent.includes('18 / 18 READY') && document.querySelector('#audio-gate')?.hidden === false`, 'Scene 2 reload preload gate');
  await display.click('#enable-audio');
  await admin.waitFor(`document.querySelector('#display-list')?.textContent.includes('AUDIO MASTER READY')`, 'READY after Scene 2 reload');

  const playsBeforeSceneNext = await display.evaluate('window.__yokogawaAudioPlays.length');
  await startScene('scene-6'); await admin.waitFor(`document.querySelector('#show-next-button')?.disabled === false`, 'Scene 6 NEXT enabled'); await admin.click('#show-next-button');
  await display.waitFor(`window.__yokogawaAudioPlays.length > ${playsBeforeSceneNext} && window.__yokogawaAudioPlays.at(-1).includes('prod-voice-011-')`, 'Scene 6 NEXT uses tuned P-011');
  await admin.waitFor(`document.querySelector('#show-stop-button')?.disabled === false`, 'Scene 6 NEXT STOP'); await admin.click('#show-stop-button'); await delay(700);

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

  await startScene('scene-7');
  await display.waitFor(`document.body.dataset.preset === 'shutdown' && document.body.dataset.transitionStatus !== 'active'`, 'Scene 7 settled state before restart');
  const errorsBeforeRestart = [admin.errors.length, display.errors.length];
  await stopChild(server);
  await display.waitFor(`document.querySelector('#connection')?.textContent !== 'ONLINE'`, 'Display disconnect');
  await startServer();
  await display.waitFor(`document.querySelector('#connection')?.textContent === 'ONLINE'`, 'Display reconnect', 20_000);
  await display.waitFor(`document.body.dataset.preset === 'shutdown' && document.body.dataset.transitionStatus !== 'active' && document.body.dataset.unlockStatus !== 'running'`, 'Scene 7 state restored after reconnect', 20_000);
  await admin.waitFor(`document.querySelector('#scene-rehearsal-ready-scene')?.textContent.includes('Scene 7')`, 'Scene 7 ready after reconnect', 20_000);
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
    sceneRehearsal: ['scene-2:no-cue', 'scene-6:P-011', 'scene-7:reconnect'], screenshots: 4,
    controls: ['NEXT', 'STOP', 'REPLAY', 'BLACKOUT', 'RESTORE'], reconnectReady: true, reloadReady: true,
    productionAssetRequests: assetRequests.length, externalBrowserRequests: 0, browserErrors: 0,
  }));
} finally {
  admin?.close(); display?.close();
  await stopChild(server);
  await stopChild(browser);
  await rm(temporary, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
