import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const baseUrl = process.env.BROWSER_BASE_URL ?? 'http://127.0.0.1:3000';
const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const browserPath = candidates.find(existsSync);
if (!browserPath) throw new Error('Chrome/Edge not found. Set CHROME_PATH.');

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

const port = await freePort();
const profile = await mkdtemp(path.join(os.tmpdir(), 'yokogawa-console-check-'));
const browser = spawn(browserPath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore', windowsHide: true });

const waitForEndpoint = async () => {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Browser DevTools endpoint did not start');
};

const inspect = async (url) => {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Could not create browser target: ${response.status}`);
  const target = await response.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const errors = [];
  let sequence = 0;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.on('message', (raw) => {
    const event = JSON.parse(raw);
    if (event.id && pending.has(event.id)) {
      const request = pending.get(event.id);
      pending.delete(event.id);
      if (event.error) request.reject(new Error(event.error.message)); else request.resolve(event.result);
      return;
    }
    if (event.method === 'Runtime.exceptionThrown') errors.push(`exception: ${event.params.exceptionDetails.text}`);
    if (event.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(event.params.type)) errors.push(`console.${event.params.type}`);
    if (event.method === 'Log.entryAdded' && ['error', 'warning'].includes(event.params.entry.level)) errors.push(`${event.params.entry.level}: ${event.params.entry.url ?? ''} ${event.params.entry.text}`);
  });
  await Promise.all([send('Runtime.enable'), send('Log.enable'), send('Page.enable')]);
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const result = await send('Runtime.evaluate', {
    expression: `({ title: document.title, ready: document.readyState, connection: document.querySelector('#connection')?.textContent ?? null })`,
    returnByValue: true,
  });
  socket.close();
  if (errors.length) throw new Error(`${url}: ${errors.join(' | ')}`);
  return result.result.value;
};

try {
  await waitForEndpoint();
  const results = [];
  results.push(await inspect(new URL('/admin', baseUrl).href));
  results.push(await inspect(new URL('/display?id=console-check&name=Console-Check', baseUrl).href));
  if (results.some((result) => result.ready !== 'complete')) throw new Error('Browser page did not complete');
  console.log(`BROWSER CONSOLE PASS: 2 pages / 0 warning / 0 error / ${JSON.stringify(results)}`);
} finally {
  browser.kill();
  await new Promise((resolve) => { browser.once('exit', resolve); setTimeout(resolve, 3000).unref(); });
  await rm(profile, { recursive: true, force: true });
}
