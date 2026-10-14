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
      if (error) setTimeout(() => { if (child.exitCode === null && child.signalCode === null) reject(error); else resolve(); }, 3000); else resolve();
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
      window.__yokogawaAudioTimes = [];
      const originalBufferStart = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function(...args) {
        if(this.__yokogawaAssetId && !this.__yokogawaAssetId.includes('prod-sfx-')) {
          window.__yokogawaAudioPlays.push('/api/assets/'+this.__yokogawaAssetId);
          window.__yokogawaAudioTimes.push(Date.now());
        }
        return originalBufferStart.call(this,...args);
      };
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
  await page.send('Page.navigate', { url });
  await page.waitFor(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`, `${url} navigation`);
  return page;
};

const temporary = await mkdtemp(path.join(os.tmpdir(), 'yokogawa-production-browser-'));
const artifactDirectory = path.resolve(process.argv[2] ?? process.env.PRODUCTION_BROWSER_ARTIFACTS ?? 'artifacts/subtitle-script-assets/browser');
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
    '--headless=new', '--no-proxy-server', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temporary, 'browser')}`, 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);

  display = await openPage(debugPort, `${baseUrl}/display?id=production-check&name=7-201`, { display: true });
  admin = await openPage(debugPort, `${baseUrl}/admin`);
  await display.waitFor(`document.querySelector('#connection')?.textContent === 'ONLINE'`, 'Display ONLINE');
  await display.send('Page.bringToFront');
  await admin.waitFor(`document.querySelector('#display-list')?.textContent.includes('production-check')`, 'Display registration');

  await admin.evaluate(`(() => { const select = document.querySelector('#audio-master-select'); select.value = 'production-check'; select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await display.waitFor(`document.querySelector('#audio-help')?.textContent.includes('20 / 20 READY')`, 'Production preload');
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
    try {
      await admin.waitFor(`document.querySelector('#scene-rehearsal-ready-scene')?.textContent.includes(${JSON.stringify(`Scene ${sceneId.split('-')[1]}`)}) && !document.querySelector('#scene-rehearsal-ready').hidden`, `${sceneId} ready`);
    } catch (error) {
      throw new Error(`${error.message}; admin=${JSON.stringify(await admin.evaluate(`({ notice: document.querySelector('#notice').textContent, selection: document.querySelector('#rehearsal-scene-select').value, session: document.querySelector('#scene-rehearsal-session-toggle').textContent, ready: document.querySelector('#scene-rehearsal-ready-scene').textContent })`))}`);
    }
  };

  const noCuePlayCount = await display.evaluate('window.__yokogawaAudioPlays.length');
  await startScene('scene-2');
  await admin.waitFor(`document.querySelector('#scene-rehearsal-ready-next')?.textContent.includes('このScene内に横川AI Cueはありません')`, 'no-AI-Cue ready message');
  await admin.waitFor(`document.querySelector('#show-next-button')?.disabled === true`, 'no-AI-Cue NEXT blocked');
  await display.waitFor(`document.body.dataset.preset === 'hijacked' && document.querySelector('#caption')?.textContent === ''`, 'Scene 2 start state');
  if (await display.evaluate('window.__yokogawaAudioPlays.length') !== noCuePlayCount) throw new Error('Scene 2 start unexpectedly played audio');
  const scene2State = await display.evaluate(`({ preset: document.body.dataset.preset, caption: document.querySelector('#caption')?.textContent, overlay: document.body.dataset.overlay, visual: document.body.dataset.visual, transition: document.body.dataset.transitionStatus, unlock: document.body.dataset.unlockStatus })`);
  await admin.setViewport(1920, 1080); await admin.screenshot(path.join(artifactDirectory, 'admin-1920x1080-no-ai-cue.png'));

  await startScene('scene-6');
  await admin.waitFor(`document.querySelector('#scene-rehearsal-ready-next')?.textContent.includes('P-011')`, 'Scene 6 first Cue');
  await display.waitFor(`document.body.dataset.preset === 'hijacked'`, 'Scene 6 start state');
  await admin.screenshot(path.join(artifactDirectory, 'admin-1920x1080-ai-cue.png'));
  await admin.setViewport(1280, 720); await admin.screenshot(path.join(artifactDirectory, 'admin-1280x720-ai-cue.png'));
  await startScene('scene-2');
  await admin.screenshot(path.join(artifactDirectory, 'admin-1280x720-no-ai-cue.png'));
  const scene2Again = await display.evaluate(`({ preset: document.body.dataset.preset, caption: document.querySelector('#caption')?.textContent, overlay: document.body.dataset.overlay, visual: document.body.dataset.visual, transition: document.body.dataset.transitionStatus, unlock: document.body.dataset.unlockStatus })`);
  if (JSON.stringify(scene2Again) !== JSON.stringify(scene2State)) throw new Error(`Scene state drift: ${JSON.stringify({ scene2State, scene2Again })}`);
  await admin.setViewport(1920, 1080);

  await display.evaluate('window.__beforeSceneReload = true');
  await display.send('Page.reload', { ignoreCache: false });
  await display.waitFor(`window.__beforeSceneReload === undefined && document.readyState === 'complete'`, 'Scene 2 new document');
  await display.waitFor(`document.readyState === 'complete' && document.querySelector('#connection')?.textContent === 'ONLINE'`, 'Scene 2 Display reload');
  await display.waitFor(`document.body.dataset.preset === 'hijacked' && document.querySelector('#caption')?.textContent === '' && document.body.dataset.transitionStatus !== 'active' && document.body.dataset.unlockStatus !== 'running'`, 'Scene 2 reload final state only');
  if (await display.evaluate('window.__yokogawaAudioPlays.length') !== 0) throw new Error('Scene 2 Display reload replayed historical audio');
  await display.waitFor(`document.querySelector('#audio-help')?.textContent.includes('20 / 20 READY') && document.querySelector('#audio-gate')?.hidden === false`, 'Scene 2 reload preload gate');
  await display.click('#enable-audio');
  await admin.waitFor(`document.querySelector('#display-list')?.textContent.includes('AUDIO MASTER READY')`, 'READY after Scene 2 reload');

  const playsBeforeSceneNext = await display.evaluate('window.__yokogawaAudioPlays.length');
  await startScene('scene-6'); await admin.waitFor(`document.querySelector('#show-next-button')?.disabled === false`, 'Scene 6 NEXT enabled'); await admin.click('#show-next-button');
  await display.waitFor(`window.__yokogawaAudioPlays.length > ${playsBeforeSceneNext} && window.__yokogawaAudioPlays.at(-1).includes('prod-voice-011-')`, 'Scene 6 NEXT uses tuned P-011');
  await admin.waitFor(`document.querySelector('#show-stop-button')?.disabled === false`, 'Scene 6 NEXT STOP'); await admin.click('#show-stop-button'); await delay(700);

  const representative = ['prod-001', 'prod-004', 'prod-008', 'prod-013', 'prod-015', 'prod-v-stop-code', 'prod-020'];
  for (const cueId of representative) {
    const cue = production.cues.find((item) => item.id === cueId);
    const selector = `.cue-item[data-cue-id="${cueId}"] [data-action="run"]`;
    const playCount = await display.evaluate('window.__yokogawaAudioPlays.length');
    await admin.waitFor(`document.querySelector(${JSON.stringify(selector)})?.disabled === false`, `${cueId} run enabled`);
    await display.send('Page.bringToFront');
    await admin.click(selector);
    if (cueId === 'prod-001') {
      await delay(300);
      const opacity = await display.evaluate(`Number(getComputedStyle(document.querySelector('#avatar-wrap')).opacity)`);
      if (opacity > .1) throw new Error(`Startup Avatar must appear from darkness: ${opacity}`);
      await display.screenshot(path.join(artifactDirectory,'startup-appearance.png'));
    }
    try {
      await display.waitFor(`document.querySelector('#caption')?.textContent?.length > 0`, `${cueId} caption`);
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

  const runCue = async (id) => {
    const selector = `.cue-item[data-cue-id="${id}"] [data-action="run"]`;
    await admin.waitFor(`document.querySelector(${JSON.stringify(selector)})?.disabled === false`, `${id} enabled`);
    await display.send('Page.bringToFront');
    await admin.click(selector);
  };
  const stopCue = async () => {
    await admin.waitFor(`document.querySelector('#show-stop-button')?.disabled === false`, 'STOP available');
    await admin.click('#show-stop-button'); await delay(650);
  };
  // Real browser frames, at both auditorium output sizes; retain each phase for visual review.
  let visualFrames = 0;
  const visualFrameStates = [];
  for (const [width, height] of [[1920, 1080], [1280, 720]]) {
    await display.send('Page.bringToFront');
    await display.setViewport(width, height);
    const frame = async (name) => {
      const state = await display.evaluate(`({ preset: document.body.dataset.preset, transition: document.body.dataset.transitionStatus, visual: document.querySelector('#scene-visual').dataset.mode, variant: document.body.dataset.operationVariant, caption: document.querySelector('#caption').textContent, at: Date.now() })`);
      const capture = await display.send('Page.captureScreenshot', { format: 'jpeg', quality: 85, optimizeForSpeed: true, captureBeyondViewport: false });
      await writeFile(path.join(artifactDirectory, `${width}x${height}-${name}.jpg`), Buffer.from(capture.data, 'base64'));
      visualFrameStates.push({ width, height, name, ...state }); visualFrames++;
    };
    await runCue('prod-004'); await display.waitFor(`document.body.dataset.transition === 'anomaly'`, 'lecture ends before incident', 25000); await delay(400); await frame('hijack-tear-1');
    if (await display.evaluate(`document.querySelector('#caption').textContent !== ''`)) throw new Error('Hijack has stale subtitle');
    await delay(700); await frame('hijack-tear-2'); await delay(1500); await frame('hijack-settled');
    await display.waitFor(`document.body.dataset.preset === 'hijacked' && document.body.dataset.transitionStatus === 'completed'`, 'purple HACK settled');

    // One NEXT: prior Cue position -> merged riddle visual -> one WAV009.
    await admin.click('.cue-item[data-cue-id="prod-019"] [data-action="jump"]'); await delay(650);
    const riddleBefore = await display.evaluate('window.__yokogawaAudioPlays.length');
    const riddleStart = await display.evaluate('Date.now()');
    await admin.click('#show-next-button'); await delay(700);
    if (await display.evaluate('window.__yokogawaAudioPlays.length') !== riddleBefore + 1) throw new Error('P-V02 should announce then reveal puzzle');
    await frame('riddle-wait');
    await display.waitFor(`window.__yokogawaAudioPlays.length === ${riddleBefore + 1} && window.__yokogawaAudioPlays.at(-1).includes('009-first-riddle')`, 'P-V02 WAV once');
    await display.waitFor(`document.querySelector('#scene-visual').dataset.type === 'image'`, 'first puzzle after speech');
    await frame('riddle-speech'); await stopCue();

    await runCue('prod-011'); await delay(650); await frame('five-verified');
    await display.waitFor(`document.querySelector('#scene-visual').dataset.mode === 'integration'`, 'five integration'); await delay(650); await frame('five-integrating');
    await display.waitFor(`document.querySelector('#scene-visual').dataset.type === 'image'`, 'final reveal'); await delay(400); await frame('final-problem'); await stopCue();
    await runCue('prod-012'); await delay(650); await frame('authentication');
    if (await display.evaluate(`!document.querySelector('#operation-progress').hidden || !document.querySelector('#unlock-gauges').hidden`)) throw new Error('Authentication uses percentage');
    await stopCue();
    await runCue('prod-012'); await display.waitFor(`document.body.dataset.transition === 'unlock-start'`, 'authentication ends before unlock'); await delay(1600); await frame('six-gauges-running');
    const count = await display.evaluate(`document.querySelector('#unlock-gauges').children.length`);
    if (count !== 6) throw new Error(`Expected six gauges: ${count}`);
    await display.waitFor(`[...document.querySelectorAll('#unlock-gauges i')].every(g => g.dataset.progress === '100%')`, 'all six at 100'); await frame('six-gauges-100');
    await display.waitFor(`document.body.dataset.operationVariant === 'collapse'`, 'completion collapse'); await delay(300); await frame('unlock-collapse');
    await display.waitFor(`document.body.dataset.operationVariant === 'anomaly'`, 'success anomaly'); await frame('unlock-anomaly');
    if (await display.evaluate(`!document.querySelector('#unlock-gauges').hidden`)) throw new Error('100% gauges persisted');
    await runCue('prod-013'); await delay(650); await frame('emergency-error'); await stopCue();
    await runCue('prod-014'); await delay(650); await frame('contact-error'); await stopCue();

    await runCue('prod-v-hostile-enter'); await delay(1400);
    await admin.click('.cue-item[data-cue-id="prod-v-emergency-riddle"] [data-action="jump"]'); await delay(650);
    const stopBefore = await display.evaluate('window.__yokogawaAudioPlays.length');
    const stopStart = await display.evaluate('Date.now()');
    await admin.click('#show-next-button'); await delay(600);
    if (await display.evaluate('window.__yokogawaAudioPlays.length') !== stopBefore) throw new Error('P-V06 missed silence');
    await frame('stop-silence');
    try { await display.waitFor(`window.__yokogawaAudioPlays.length === ${stopBefore + 1} && window.__yokogawaAudioPlays.at(-1).includes('016-shutdown')`, 'P-V06 speech once'); }
    catch (error) { throw new Error(`${error.message}; before=${stopBefore}; display=${JSON.stringify(await display.evaluate('({plays:window.__yokogawaAudioPlays,caption:document.querySelector("#caption").textContent})'))}; admin=${JSON.stringify(await admin.evaluate('({cue:document.querySelector("#show-current-cue").textContent,notice:document.querySelector("#notice").textContent,next:document.querySelector("#show-next-button").disabled})'))}`); }
    if (await display.evaluate('window.__yokogawaAudioTimes.at(-1)') - stopStart < 1750) throw new Error('P-V06 delay too short');
    await frame('stop-speech'); await delay(4400); await frame('shutdown-settled');
    await startScene('scene-7');
    if (await display.evaluate(`document.querySelector('#caption').textContent !== ''`)) throw new Error('Scene 7 stale subtitle');
    await runCue('prod-v-recovery'); await delay(1800); await frame('recovery-progress');
    await display.waitFor(`document.querySelector('#operation-progress-label').textContent === '100%'`, 'recovery 100'); await frame('recovery-100');
    await display.waitFor(`document.body.dataset.preset === 'normal' && document.querySelector('#operation-overlay').hidden`, 'recovery NORMAL'); await delay(1600); await frame('recovery-normal');
    await display.send('Page.reload', {});
    await display.waitFor(`document.querySelector('#connection').textContent === 'ONLINE' && document.body.dataset.preset === 'normal' && document.querySelector('#operation-overlay').hidden`, 'recovery reload NORMAL');
    if (await display.evaluate('window.__yokogawaAudioPlays.length') !== 0) throw new Error('Reload duplicated audio');
    await display.waitFor(`document.querySelector('#audio-help').textContent.includes('20 / 20 READY')`, 'visual reload preload');
    await display.click('#enable-audio'); await delay(650);
  }
  await writeFile(path.join(artifactDirectory, 'visual-frame-states.json'), JSON.stringify(visualFrameStates, null, 2));

  // Cancel during the silence, then wait past the old deadline: no orphan WAV.
  for (const cueId of ['prod-001', 'prod-v-stop-code']) {
    for (const operation of ['stop', 'rehearsal', 'reset']) {
      const before = await display.evaluate('window.__yokogawaAudioPlays.length');
      await runCue(cueId); await delay(650);
      if (operation === 'stop') await stopCue();
      if (operation === 'rehearsal') await startScene('scene-6');
      if (operation === 'reset') {
        await admin.evaluate(`(() => { window.confirm = () => true; document.querySelector('#reset-button').click(); })()`);
      }
      await delay(2400);
      if (await display.evaluate('window.__yokogawaAudioPlays.length') !== before) throw new Error(`${cueId} stale WAV after ${operation}`);
    }
    await runCue(cueId); await delay(650);
    const before = await display.evaluate('window.__yokogawaAudioPlays.length');
    await admin.click('#show-replay-button');
    await display.waitFor(`window.__yokogawaAudioPlays.length === ${before + 1}`, `${cueId} REPLAY once`);
    await delay(800);
    if (await display.evaluate('window.__yokogawaAudioPlays.length') !== before + 1) throw new Error(`${cueId} REPLAY double WAV`);
    await stopCue();
  }
  await admin.click('#show-back-button'); await delay(650);

  await startScene('scene-7');
  await display.waitFor(`document.body.dataset.preset === 'shutdown' && document.body.dataset.transitionStatus !== 'active'`, 'Scene 7 settled state before restart');
  const errorsBeforeRestart = [admin.errors.length, display.errors.length];
  await stopChild(server);
  await display.waitFor(`document.querySelector('#connection')?.textContent !== 'ONLINE'`, 'Display disconnect');
  await startServer();
  await display.waitFor(`document.querySelector('#connection')?.textContent === 'ONLINE'`, 'Display reconnect', 20_000);
  await display.waitFor(`document.body.dataset.preset === 'normal' && document.querySelector('#avatar-wrap').hidden && document.querySelector('#caption').textContent === ''`, 'bundled latest startup after reconnect', 20_000);
  await admin.waitFor(`document.querySelector('#production-version').textContent.includes('rehearsal-revision-20261014')`, 'latest version after reconnect', 20_000);
  await admin.waitFor(`document.querySelector('#display-list')?.textContent.includes('AUDIO MASTER READY')`, 'READY restored after reconnect', 20_000);
  for (const [index, page] of [admin, display].entries()) {
    const restartErrors = page.errors.splice(errorsBeforeRestart[index]);
    const unexpected = restartErrors.filter((message) => !message.includes('WebSocket connection') || !message.includes('ERR_CONNECTION_REFUSED'));
    if (unexpected.length) throw new Error(`Unexpected errors during planned restart: ${unexpected.join(' | ')}`);
  }

  await display.send('Page.reload', { ignoreCache: false });
  await display.waitFor(`document.readyState === 'complete' && document.querySelector('#connection')?.textContent === 'ONLINE'`, 'Display reload');
  await display.waitFor(`document.querySelector('#audio-help')?.textContent.includes('20 / 20 READY') && document.querySelector('#audio-gate')?.hidden === false`, 'reload preload gate');
  await display.click('#enable-audio');
  await admin.waitFor(`document.querySelector('#display-list')?.textContent.includes('AUDIO MASTER READY')`, 'READY after reload');

  const layoutReviews = [];
  for (const [width, height] of [[1920,1080],[1280,720],[1600,1000],[1024,768]]) {
    await display.setViewport(width, height);
    await runCue('prod-004'); await delay(1000);
    const geometry = await display.evaluate(`(() => { const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right }; }; return { stage:rect('.identity'),avatar:rect('#avatar-wrap'),caption:rect('.caption-shell'),text:rect('#caption') }; })()`);
    if (Math.abs(geometry.avatar.bottom - geometry.caption.y) > 3 || geometry.avatar.right > width + 2 || geometry.avatar.x < -2) throw new Error('Avatar stage anchoring: ' + JSON.stringify(geometry));
    await display.screenshot(path.join(artifactDirectory, `${width}x${height}-avatar-bottom.png`));
    layoutReviews.push({ width, height, geometry }); await stopCue();
  }
  await writeFile(path.join(artifactDirectory, 'layout-review.json'), JSON.stringify(layoutReviews, null, 2));

  for (const [imageWidth,imageHeight,width,height] of [[320,900,1920,1080],[1500,300,1280,720]]) {
    await display.setViewport(width,height);
    await admin.evaluate(`(async () => { const canvas = document.createElement('canvas'); canvas.width=${imageWidth};canvas.height=${imageHeight};const context=canvas.getContext('2d');context.fillStyle='#112941';context.fillRect(0,0,canvas.width,canvas.height);context.strokeStyle='#80e8ff';context.lineWidth=12;context.strokeRect(6,6,canvas.width-12,canvas.height-12);const response=await fetch('/api/production-tools/puzzle',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slot:'first',image:canvas.toDataURL('image/png')})});if(!response.ok) throw new Error('image upload failed'); })()`);
    await runCue('prod-v-riddle-enter');
    await delay(3000); // The merged Cue announces before revealing the image; do not accept the previous frame.
    await display.waitFor(`document.querySelector('#scene-visual-image').naturalWidth === ${imageWidth} && document.querySelector('#scene-visual').hidden === false`, 'arbitrary puzzle ratio');
    if (await display.evaluate(`getComputedStyle(document.querySelector('#scene-visual-image')).objectFit !== 'contain'`)) throw new Error('Puzzle image crop');
    await delay(750);
    await display.screenshot(path.join(artifactDirectory, `${width}x${height}-puzzle-${imageWidth}x${imageHeight}.png`));
    await stopCue();
  }

  const toolsPage = await openPage(debugPort, `${baseUrl}/production-tools`);
  await toolsPage.setViewport(1280, 900);
  await toolsPage.waitFor(`document.querySelectorAll('.segment').length > 0`, 'Composer initial draft');
  await toolsPage.click('#compose');
  await toolsPage.waitFor(`document.querySelector('#export').disabled === false && !document.querySelector('main').inert`, 'Composer reused WAV preview');
  await toolsPage.click('#export');
  await toolsPage.waitFor(`document.querySelector('#status').textContent.includes('SHA256')`, 'explicit final PCM export');
  await toolsPage.screenshot(path.join(artifactDirectory, 'speech-composer.png'));
  await toolsPage.waitFor(`document.querySelector('#avatar-preview')`, 'Avatar Preview control');
  await toolsPage.click('#avatar-preview'); await toolsPage.waitFor(`document.querySelector('#status').textContent.includes('Avatarを適用')`, 'Avatar swap preview');
  if (toolsPage.errors.length) throw new Error(`Composer console: ${toolsPage.errors.join(' | ')}`);
  toolsPage.close();

  await admin.click('#production-reset'); await delay(650);
  await display.waitFor(`document.querySelector('#avatar-wrap').hidden && document.querySelector('#scene-visual').hidden && document.querySelector('#caption').textContent === ''`, 'Production Reset canonical display');
  await admin.waitFor(`document.querySelector('#display-list').textContent.includes('AUDIO MASTER READY')`, 'Production Reset retains Audio Ready');

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
  if (assetRequests.length < 16) throw new Error(`Expected at least 16 production voice asset requests, got ${assetRequests.length}`);

  console.log(JSON.stringify({
    status: 'PASS', viewport: [1920, 1080], preload: '20/20', cues: representative,
    sceneRehearsal: ['scene-2:empty-reload', 'scene-6:P-011', 'scene-7:shutdown-reconnect'], screenshots: visualFrames + 4,
    visualViewports: [[1920,1080],[1280,720]], mergedCancellation: ['STOP','REPLAY','Rehearsal','Reset'],
    controls: ['NEXT', 'BACK', 'STOP', 'REPLAY', 'BLACKOUT', 'RESTORE'], reconnectReady: true, reloadReady: true,
    productionAssetRequests: assetRequests.length, externalBrowserRequests: 0, browserErrors: 0,
  }));
} finally {
  admin?.close(); display?.close();
  await stopChild(server);
  await stopChild(browser);
  await rm(temporary, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
