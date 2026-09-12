import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

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
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error('server did not start');
}

function client(port, role) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const queued = [];
  const waiters = [];
  ws.on('message', (buffer) => {
    const event = JSON.parse(buffer.toString());
    const waiterIndex = waiters.findIndex(({ predicate }) => predicate(event));
    if (waiterIndex >= 0) waiters.splice(waiterIndex, 1)[0].resolve(event);
    else queued.push(event);
  });
  const next = (predicate = () => true, timeout = 2500) => {
    const index = queued.findIndex(predicate);
    if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve };
      waiters.push(waiter);
      setTimeout(() => {
        const position = waiters.indexOf(waiter);
        if (position >= 0) waiters.splice(position, 1);
        reject(new Error(`event timeout for ${role}`));
      }, timeout).unref();
    });
  };
  return new Promise((resolve, reject) => {
    ws.once('error', reject);
    ws.once('open', async () => {
      ws.send(JSON.stringify({ type: 'hello', role }));
      const initial = await next((event) => event.type === 'state');
      resolve({ ws, next, initial, send: (event) => ws.send(JSON.stringify(event)) });
    });
  });
}

test('HTTP画面・双方向状態・キュー・停止・再接続を実通信で処理する', { timeout: 20_000 }, async (t) => {
  const port = await freePort();
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yokogawa-server-'));
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), STATE_FILE: path.join(directory, 'state.json'), LOG_DIRECTORY: path.join(directory, 'logs') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  t.after(() => child.kill('SIGTERM'));
  await waitForHealth(port);

  for (const route of ['admin', 'display']) {
    const response = await fetch(`http://127.0.0.1:${port}/${route}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), route === 'admin' ? /横川AI CONTROL/ : /YOKOGAWA/);
  }

  const admin = await client(port, 'admin');
  admin.send({ type: 'speak', text: '未接続では送信しない' });
  assert.equal((await admin.next((event) => event.type === 'error')).code, 'DISPLAY_UNAVAILABLE');
  const display = await client(port, 'display');
  assert.equal((await admin.next((event) => event.type === 'state' && event.state.displayConnectionStatus === 'connected')).state.displayConnectionStatus, 'connected');

  admin.send({ type: 'speak', text: 'こんにちは、横川AIです。' });
  const first = (await display.next((event) => event.type === 'speak')).message;
  display.send({ type: 'playback', id: first.id, status: 'received' });
  display.send({ type: 'playback', id: first.id, status: 'speaking' });
  assert.equal((await admin.next((event) => event.type === 'state' && event.state.playbackStatus === 'speaking')).state.currentMessage.text, first.text);

  admin.send({ type: 'speak', text: 'これは次の発話です。' });
  assert.equal((await admin.next((event) => event.type === 'accepted' && event.queued === true)).queued, true);
  display.send({ type: 'playback', id: first.id, status: 'completed' });
  const second = (await display.next((event) => event.type === 'speak')).message;
  assert.equal(second.text, 'これは次の発話です。');
  display.send({ type: 'playback', id: second.id, status: 'speaking' });
  admin.send({ type: 'stop' });
  assert.equal((await display.next((event) => event.type === 'stop')).id, second.id);
  display.send({ type: 'playback', id: second.id, status: 'stopped' });
  await admin.next((event) => event.type === 'state' && event.state.playbackStatus === 'stopped');

  admin.send({ type: 'replay', id: first.id });
  const replay = (await display.next((event) => event.type === 'speak')).message;
  assert.equal(replay.replayOf, first.id);
  display.send({ type: 'playback', id: replay.id, status: 'error', error: 'テスト用音声エラー' });
  const errorState = await admin.next((event) => event.type === 'state' && event.state.playbackStatus === 'error');
  assert.match(errorState.state.history[0].error, /テスト用音声エラー/);

  display.ws.close();
  await admin.next((event) => event.type === 'state' && event.state.displayConnectionStatus === 'disconnected');
  const reloaded = await client(port, 'display');
  assert.equal(reloaded.initial.restoreOnly, true);
  await assert.rejects(reloaded.next((event) => event.type === 'speak', 300), /timeout/);
  reloaded.ws.close(); admin.ws.close();
  assert.doesNotMatch(output, /Unhandled|uncaught/i);
});

