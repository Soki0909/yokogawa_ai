import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const minutes = Number(process.env.SOAK_MINUTES ?? 30);
const intervalMs = Number(process.env.SOAK_INTERVAL_MS ?? 5000);
if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('SOAK_MINUTES must be positive');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('server did not start');
}

function connect(port, role) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const queue = [];
  const waiters = [];
  socket.on('message', (raw) => {
    const event = JSON.parse(raw.toString());
    const index = waiters.findIndex((waiter) => waiter.predicate(event));
    if (index >= 0) waiters.splice(index, 1)[0].resolve(event);
    else queue.push(event);
  });
  const next = (predicate, timeout = 3000) => {
    const index = queue.findIndex(predicate);
    if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve };
      waiters.push(waiter);
      setTimeout(() => {
        const current = waiters.indexOf(waiter);
        if (current >= 0) waiters.splice(current, 1);
        reject(new Error(`${role} event timeout`));
      }, timeout).unref();
    });
  };
  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.once('open', async () => {
      socket.send(JSON.stringify({ type: 'hello', role }));
      await next((event) => event.type === 'state');
      resolve({ socket, next, send: (event) => socket.send(JSON.stringify(event)) });
    });
  });
}

const port = await freePort();
const temporary = await mkdtemp(path.join(os.tmpdir(), 'yokogawa-soak-'));
const server = spawn(process.execPath, ['src/server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), STATE_FILE: path.join(temporary, 'state.json'), LOG_DIRECTORY: path.join(temporary, 'logs') },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let serverErrors = '';
server.stderr.on('data', (chunk) => { serverErrors += chunk; });

let admin;
let display;
let completed = 0;
const startedAt = Date.now();
const durationMs = minutes * 60 * 1000;

try {
  await waitForHealth(port);
  admin = await connect(port, 'admin');
  display = await connect(port, 'display');
  await admin.next((event) => event.type === 'state' && event.state.displayConnectionStatus === 'connected');
  display.send({ type: 'audio:ready' });
  await admin.next((event) => event.type === 'state' && event.state.displayAudioReady);

  while (Date.now() - startedAt < durationMs) {
    const text = `連続稼働テスト ${completed + 1}: 日本語 English 123 !?`;
    admin.send({ type: 'speak', text });
    const message = (await display.next((event) => event.type === 'speak')).message;
    assert.equal(message.text, text);
    display.send({ type: 'playback', id: message.id, status: 'speaking' });
    display.send({ type: 'playback', id: message.id, status: 'completed' });
    await admin.next((event) => event.type === 'state' && event.state.playbackStatus === 'completed');
    completed += 1;
    const remaining = intervalMs - (Date.now() - startedAt) % intervalMs;
    await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, Math.max(0, durationMs - (Date.now() - startedAt)))));
  }
  assert.equal(server.exitCode, null);
  assert.doesNotMatch(serverErrors, /Unhandled|uncaught/i);
  console.log(`SOAK PASS: ${minutes}分間、${completed}件の発話フローを処理しました。`);
} finally {
  admin?.socket.close();
  display?.socket.close();
  server.kill('SIGTERM');
}

