import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { renderRecordingReview } from './recording-review.js';

// Isolated review recording: never opens or overwrites the operator's persisted Show.
const outputDirectory = path.resolve(process.argv[2] ?? `artifacts/recordings/${new Date().toISOString().replaceAll(':', '-')}`);
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';

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
      const originalPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        window.__yokogawaAudioPlays.push(this.src);
        window.__yokogawaAudioTimes.push(Date.now());
        return originalPlay.call(this);
      };
    ` });
  }
  await page.send('Page.navigate', { url });
  await page.waitFor(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`, `${url} navigation`);
  return page;
};

await mkdir(outputDirectory, { recursive: true });
const temporary = await mkdtemp(path.join(os.tmpdir(), 'yokogawa-display-recording-'));
const framesDirectory = path.join(temporary, 'frames');
await mkdir(framesDirectory);
const serverPort = await freePort(); const debugPort = await freePort();
const baseUrl = `http://127.0.0.1:${serverPort}`;
const production = JSON.parse(await readFile('shows/production.json', 'utf8'));
const cues = production.cues.filter(cue => cue.enabled !== false && cue.route === 'main').sort((a, b) => a.order - b.order);
let server; let browser; let display; let admin; let state; let failure;
const frames = []; const audioClips = []; const timeline = [];
let writes = Promise.resolve(); let recording = false; let videoStart;
const audioHook = `
  window.__recordAudioCount = 0;
  const nativeConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function(destination, ...args) {
    const result = nativeConnect.call(this, destination, ...args);
    if (destination instanceof AudioDestinationNode) {
      const context = this.context;
      if (!context.__recording) {
        const stream = context.createMediaStreamDestination();
        const recorder = new MediaRecorder(stream.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
        const chunks = []; const index = window.__recordAudioCount++; const at = Date.now();
        recorder.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };
        const done = new Promise(resolve => recorder.onstop = async () => {
          const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
          let binary = ''; for(let i=0; i<bytes.length; i+=32768) binary += String.fromCharCode(...bytes.subarray(i,i+32768));
          window.recordAudio(JSON.stringify({ index, at, data: btoa(binary) })); resolve();
        });
        context.__recording = { stream, recorder, done }; recorder.start();
        const close = context.close.bind(context);
        context.close = async () => { recorder.stop(); await done; return close(); };
      }
      nativeConnect.call(this, context.__recording.stream);
    }
    return result;
  };
`;
const runFfmpeg = (args) => new Promise((resolve, reject) => {
  const process = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'warning', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let log = ''; process.stderr.on('data', chunk => { log += chunk; });
  process.on('error', reject); process.on('exit', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${log}`)));
});
const waitState = async (predicate, label, timeout = 90_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (failure) throw new Error(failure);
    if (predicate(state)) return state;
    await delay(50);
  }
  throw new Error(`Timed out: ${label}`);
};

try {
  await runFfmpeg(['-version']);
  server = spawn(process.execPath, ['src/server.js'], { cwd: process.cwd(), env: {
    ...process.env, HOST: '127.0.0.1', PORT: String(serverPort), STATE_FILE: path.join(temporary, 'state.json'),
    LOG_DIRECTORY: path.join(temporary, 'logs'), AIVIS_ENGINE_URL: 'http://127.0.0.1:9',
  }, stdio: 'ignore', windowsHide: true });
  await waitForHttp(`${baseUrl}/health`);
  const response = await fetch(`${baseUrl}/api/show-file/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(production) });
  if (!response.ok) throw new Error(`Show import: ${response.status}`);
  browser = spawn(browserPath, ['--headless=new', '--no-proxy-server', '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temporary, 'browser')}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
  display = await openPage(debugPort, `${baseUrl}/display?id=recording&name=Review`, { display: true });
  await display.send('Runtime.addBinding', { name: 'recordAudio' });
  await display.evaluate(audioHook);
  display.socket.on('message', raw => {
    const event = JSON.parse(raw);
    if (event.method === 'Runtime.bindingCalled' && event.params.name === 'recordAudio') {
      const clip = JSON.parse(event.params.payload); const file = path.join(temporary, `audio-${clip.index}.webm`);
      audioClips.push({ index: clip.index, at: clip.at, file });
      writes = writes.then(() => writeFile(file, Buffer.from(clip.data, 'base64')));
    }
    if (event.method === 'Page.screencastFrame') {
      void display.send('Page.screencastFrameAck', { sessionId: event.params.sessionId });
      if (!recording) return;
      const at = event.params.metadata.timestamp * 1000;
      const file = path.join(framesDirectory, `${String(frames.length).padStart(6, '0')}.jpg`);
      frames.push({ at, file });
      writes = writes.then(() => writeFile(file, Buffer.from(event.params.data, 'base64')));
    }
  });
  admin = new WebSocket(`ws://127.0.0.1:${serverPort}/ws`);
  admin.on('message', raw => { const event = JSON.parse(raw); if (event.type === 'state') state = event.state; if(event.type === 'error') failure = event.message ?? JSON.stringify(event); });
  await new Promise((resolve, reject) => { admin.once('open', resolve); admin.once('error', reject); });
  const send = event => admin.send(JSON.stringify(event));
  send({ type: 'hello', role: 'admin' }); await waitState(s => s?.displays?.some(d => d.displayId === 'recording'), 'Display registered');
  send({ type: 'audio-master:set', displayId: 'recording' });
  const preloadCount = production.assets.filter(asset => asset.mimeType === 'audio/wav').length;
  await display.waitFor(`document.querySelector('#audio-help').textContent.includes('${preloadCount} / ${preloadCount} READY')`, 'Production audio preload');
  await display.click('#enable-audio'); await waitState(s => s?.displayAudioReady, 'Audio Ready');
  send({ type: 'rehearsal:start' }); await waitState(s => s?.rehearsalSession?.active, 'rehearsal');
  await display.send('Page.bringToFront');
  // Suppress only review chrome, preserving all actual Production effects/captions.
  await display.evaluate(`document.querySelector('#open-setup').style.visibility = 'hidden'`);
  recording = true; videoStart = Date.now();
  await display.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await waitState(() => frames.length > 0, 'first recorded frame');
  videoStart = frames[0].at;
  await delay(500);
  for (const cue of cues) {
    const started = Date.now();
    console.log(`Recording ${cue.cueNumber}: ${cue.name}`);
    send({ type: 'cue:execute', cueId: cue.id });
    await waitState(s => s?.currentCue?.cueId === cue.id, `${cue.id} accepted`);
    const message = cue.audio?.speechMode === 'audio-file'
      ? await waitState(s => s.history.some(h => h.cueId === cue.id && Date.parse(h.createdAt) >= started - 1000 && h.status === 'completed'), `${cue.id} complete audio`)
      : null;
    const audioEnded = message ? Date.now() : started;
    await waitState(s => s.currentTransition?.status !== 'active' && s.unlock?.status !== 'running'
      && !s.currentOverlay?.expiresAt && !s.currentVisual?.expiresAt, `${cue.id} complete visuals`);
    // CSS entrance animations have a short tail even when transition.id is none.
    const minimumVisualEnd = started + Math.max(cue.transition?.durationMs ?? 0, cue.visual?.visible ? 1600 : 0, ...(cue.sfx ?? []).map(effect => effect.atMs + effect.durationMs));
    await delay(Math.max(0, minimumVisualEnd - Date.now()));
    const completed = Date.now();
    await delay(2000);
    timeline.push({ cueId: cue.id, cueNumber: cue.cueNumber, name: cue.name, startedSeconds: (started-videoStart)/1000,
      audioEndedSeconds: (audioEnded-videoStart)/1000, completedSeconds: (completed-videoStart)/1000, nextSeconds: (Date.now()-videoStart)/1000 });
  }
  const videoEnd = Date.now(); recording = false;
  await display.send('Page.stopScreencast'); await delay(500); await writes;
  if (display.errors.length) throw new Error(`Browser errors: ${display.errors.join(' | ')}`);
  const expectedClips = cues.filter(c => c.audio?.speechMode === 'audio-file').length + cues.reduce((sum, cue) => sum + (cue.sfx?.length ?? 0), 0);
  if (audioClips.length !== expectedClips) throw new Error(`Missing audio clips: expected ${expectedClips}, got ${audioClips.length}`);
  if (frames.length < 100) throw new Error(`Missing video frames: ${frames.length}`);
  frames.sort((a,b) => a.at-b.at); audioClips.sort((a,b) => a.at-b.at);
  const duration = (videoEnd - frames[0].at)/1000;
  const escapeConcat = file => file.replaceAll('\\', '/').replaceAll("'", "'\\''");
  const concat = frames.map((frame,index) => `file '${escapeConcat(frame.file)}'\nduration ${Math.max(.001, ((frames[index+1]?.at ?? videoEnd)-frame.at)/1000)}`).join('\n') + `\nfile '${escapeConcat(frames.at(-1).file)}'\n`;
  const concatFile = path.join(temporary, 'frames.txt'); await writeFile(concatFile, concat);
  const filters = audioClips.map((clip,index) => `[${index+1}:a]adelay=${Math.max(0,Math.round(clip.at-frames[0].at))}:all=1[a${index}]`);
  filters.push(`${audioClips.map((_,index)=>`[a${index}]`).join('')}amix=inputs=${audioClips.length}:normalize=0,apad[audio]`);
  const filterFile = path.join(temporary, 'filter.txt'); await writeFile(filterFile, filters.join(';\n'));
  console.log(`Encoding ${frames.length} frames / ${audioClips.length} speech clips / ${duration.toFixed(1)}s`);
  await runFfmpeg(['-f','concat','-safe','0','-i',concatFile,...audioClips.flatMap(clip=>['-i',clip.file]),
    '-filter_complex_script',filterFile,'-map','0:v','-map','[audio]','-t',String(duration),'-r','30','-fps_mode','cfr',
    '-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',
    path.join(outputDirectory,'production-display-1920x1080.mp4')]);
  await writeFile(path.join(outputDirectory,'cue-timeline.json'), JSON.stringify({ width:1920,height:1080, fps:30, gapSeconds:2,
    durationSeconds:duration, frames:frames.length, audioClips:audioClips.length, cues:timeline, excludedCues:production.cues.filter(c=>c.enabled===false).map(c=>c.id) }, null, 2));
  await writeFile(path.join(outputDirectory,'review.html'), renderRecordingReview({ cues: timeline }));
  console.log(`PASS: ${path.join(outputDirectory,'production-display-1920x1080.mp4')}`);
} finally {
  admin?.close(); display?.close(); await stopChild(browser); await stopChild(server);
  // temporary is created by this invocation with mkdtemp, never a supplied directory.
  if (!temporary.startsWith(path.join(os.tmpdir(), 'yokogawa-display-recording-'))) throw Error('Unexpected temporary path');
  await rm(temporary, { recursive:true, force:true, maxRetries:10, retryDelay:500 });
}
