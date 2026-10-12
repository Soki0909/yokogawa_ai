import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { delay, freePort, waitForHttp, stopChild, openPage, browserPath } from './runtime-test-browser.js';

const directory = path.resolve(process.argv[2] ?? 'artifacts/puzzle-layout-2026-10-13');
await fs.mkdir(directory, { recursive: true });
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'yokogawa-puzzle-layout-'));
const port = await freePort(), debugPort = await freePort(), base = `http://127.0.0.1:${port}`;
let server, browser, display, observer;
const results = [];
try {
  server = spawn(process.execPath, ['src/server.js'], { windowsHide: true, stdio: 'ignore', env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), STATE_FILE: path.join(temporary, 'state.json'), LOG_DIRECTORY: path.join(temporary, 'logs'), AIVIS_ENGINE_URL: 'http://127.0.0.1:9' } });
  await waitForHttp(`${base}/health`);
  browser = spawn(browserPath, ['--headless=new', '--no-proxy-server', '--no-first-run', '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temporary, 'browser')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
  display = await openPage(debugPort, `${base}/display?id=puzzle-review`, { display: true });
  observer = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((resolve, reject) => { observer.once('open', resolve); observer.once('error', reject); });
  observer.send(JSON.stringify({ type: 'hello', role: 'admin' }));
  observer.send(JSON.stringify({ type: 'audio-master:set', displayId: 'puzzle-review' }));
  await display.waitFor(`document.querySelector('#audio-help').textContent.includes('20 / 20 READY')`, 'audio preload');
  await display.click('#enable-audio');
  for (const [width, height] of [[1920,1080], [1280,720]]) {
    await display.setViewport(width, height);
    for (const [cueId, assetId] of [['prod-v-riddle-enter','puzzle-first'], ['prod-011','puzzle-final'], ['prod-v-emergency-riddle','puzzle-emergency']]) {
      observer.send(JSON.stringify({ type: 'production:reset' })); await delay(300);
      observer.send(JSON.stringify({ type: 'cue:execute', cueId }));
      await display.waitFor(`!document.querySelector('#scene-visual').hidden && document.querySelector('#scene-visual-image').src.includes('/${assetId}') && document.querySelector('#scene-visual-image').complete && document.querySelector('#scene-visual-image').naturalWidth > 0`, `${cueId} image`);
      await delay(800);
      const layout = await display.evaluate(`(() => {
        const image = document.querySelector('#scene-visual-image'), rect = image.getBoundingClientRect();
        const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
        return { titleDisplay: getComputedStyle(document.querySelector('#scene-visual-title')).display, fit: getComputedStyle(image).objectFit,
          width: rect.width, height: rect.height, projectedWidth: image.naturalWidth * scale, projectedHeight: image.naturalHeight * scale,
          top: rect.top, bottom: rect.bottom, captionTop: document.querySelector('.caption-shell').getBoundingClientRect().top };
      })()`);
      assert.equal(layout.titleDisplay, 'none'); assert.equal(layout.fit, 'contain');
      assert.ok(layout.bottom <= layout.captionTop, 'image must stay above speech');
      assert.ok(layout.top >= 0 && layout.width <= width && layout.height > height * .65);
      assert.ok(layout.projectedWidth > width * .65, '16:9 Production puzzle should fill the available stage');
      await display.screenshot(path.join(directory, `${width}x${height}-${assetId}.png`));
      results.push({ viewportWidth: width, viewportHeight: height, cueId, ...layout });
    }
  }
  assert.deepEqual(display.errors, []);
  await fs.writeFile(path.join(directory, 'verification.json'), JSON.stringify({ status: 'PASS', results, browserErrors: display.errors }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', cases: results.length, directory }));
} finally {
  observer?.close(); display?.close(); await stopChild(browser); await stopChild(server);
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
}
