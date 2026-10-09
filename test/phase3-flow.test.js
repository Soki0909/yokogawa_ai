import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer(); server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
});
const waitForHealth = async (port) => {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('server did not start');
};
function connect(port, role, display) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const queue = []; const waiters = [];
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
      const waiter = { predicate, resolve }; waiters.push(waiter);
      setTimeout(() => {
        const current = waiters.indexOf(waiter); if (current >= 0) waiters.splice(current, 1);
        reject(new Error(`${role}/${display?.displayId ?? ''} timeout`));
      }, timeout).unref();
    });
  };
  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.once('open', async () => {
      socket.send(JSON.stringify({ type: 'hello', role, ...(display ? { display } : {}) }));
      const initial = await next((event) => event.type === 'state');
      resolve({ socket, initial, next, send: (event) => socket.send(JSON.stringify(event)) });
    });
  });
}
const close = (client) => new Promise((resolve) => {
  if (client.socket.readyState === WebSocket.CLOSED) return resolve();
  client.socket.once('close', resolve); client.socket.close();
});

test('Phase 3 group・preflight・音声テスト・接続支援をAdmin 1 + Display 3で処理する', { timeout: 30_000 }, async (t) => {
  const port = await freePort();
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yokogawa-phase3-flow-'));
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, SHOW_STARTUP_MODE: 'saved', PORT: String(port), HOST: '127.0.0.1', STATE_FILE: path.join(directory, 'state.json'), LOG_DIRECTORY: path.join(directory, 'logs') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; child.stdout.on('data', (data) => { output += data; }); child.stderr.on('data', (data) => { output += data; });
  t.after(() => child.kill('SIGTERM'));
  await waitForHealth(port);

  const connectionResponse = await fetch(`http://127.0.0.1:${port}/api/connection-info`);
  assert.equal(connectionResponse.ok, true);
  const connectionInfo = await connectionResponse.json();
  assert.equal(connectionInfo.local.admin, `http://localhost:${port}/admin`);
  assert.deepEqual(connectionInfo.candidates, [], 'loopback bindではLAN候補を公開しない');
  const qrResponse = await fetch(`http://127.0.0.1:${port}/api/qr?url=${encodeURIComponent(`http://localhost:${port}/admin`)}`);
  assert.equal(qrResponse.ok, true);
  assert.match(qrResponse.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(await qrResponse.text(), /<svg/);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/qr?url=${encodeURIComponent('https://invalid.example')}`)).status, 400);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/qr?url=${encodeURIComponent(`http://192.168.1.23:${port}/admin`)}`)).status, 400, 'loopback bindではLAN URLのQRを生成しない');

  const admin = await connect(port, 'admin');
  const a = await connect(port, 'display', { displayId: 'display-a', displayName: '201', audioEnabled: true });
  const b = await connect(port, 'display', { displayId: 'display-b', displayName: 'Location B', audioEnabled: false });
  const c = await connect(port, 'display', { displayId: 'display-c', displayName: 'Location C', audioEnabled: false });
  t.after(async () => { await Promise.all([a, b, c, admin].map(close)); });
  await admin.next((event) => event.type === 'state' && event.state.displays.filter((display) => display.online).length === 3);
  a.send({ type: 'audio:ready' });
  admin.send({ type: 'display:required', displayId: 'display-a', required: true });
  await admin.next((event) => event.type === 'state' && event.state.preflight.status === 'ready' && event.state.displays.find((display) => display.displayId === 'display-a')?.required);

  admin.send({ type: 'target-group:save', group: { id: 'main-b', name: '201 + B', displayIds: ['display-a', 'display-b'], enabled: true, notes: '本番系統' } });
  await admin.next((event) => event.type === 'state' && event.state.targetGroups.some((group) => group.id === 'main-b'));
  const cue = { ...admin.initial.state.cues[0], target: { type: 'group', id: 'main-b' } };
  admin.send({ type: 'cue:save', cue });
  await admin.next((event) => event.type === 'state' && event.state.cues.find((item) => item.cueId === cue.cueId)?.target.type === 'group');

  admin.send({ type: 'cue:execute', cueId: cue.cueId });
  const [groupA, groupB] = await Promise.all([a, b].map((client) => client.next((event) => event.type === 'speak' && event.message.cueId === cue.cueId)));
  assert.equal(groupA.shouldSpeak, true); assert.equal(groupB.shouldSpeak, false);
  await assert.rejects(c.next((event) => event.type === 'speak' && event.message.cueId === cue.cueId, 250), /timeout/);
  a.send({ type: 'playback', id: groupA.message.id, status: 'completed' });
  const cueCompleted = await admin.next((event) => event.type === 'state' && event.state.history.find((item) => item.id === groupA.message.id)?.status === 'completed');

  const cueIndex = cueCompleted.state.currentCueIndex;
  admin.send({ type: 'audio:test' });
  const audioTest = await a.next((event) => event.type === 'speak' && event.message.source === 'test');
  assert.equal(audioTest.message.target.id, 'display-a');
  a.send({ type: 'playback', id: audioTest.message.id, status: 'completed' });
  const testCompleted = await admin.next((event) => event.type === 'state' && event.state.history.find((item) => item.id === audioTest.message.id)?.status === 'completed');
  assert.equal(testCompleted.state.currentCueIndex, cueIndex, '音声テストはCue位置を変更しない');

  admin.send({ type: 'admin-mode:set', mode: 'advanced' });
  const advanced = await admin.next((event) => event.type === 'state' && event.state.adminMode === 'advanced');
  assert.equal(advanced.state.currentCueIndex, cueIndex);

  admin.send({ type: 'admin-mode:set', mode: 'show', actionId: 'duplicate-operation-check' });
  await admin.next((event) => event.type === 'state' && event.state.adminMode === 'show');
  admin.send({ type: 'admin-mode:set', mode: 'advanced', actionId: 'duplicate-operation-check' });
  assert.equal((await admin.next((event) => event.type === 'error' && event.code === 'DUPLICATE_ACTION')).message, '同じ操作の二重送信を防止しました。');

  admin.send({ type: 'display:identify', displayId: 'display-c' });
  assert.equal((await c.next((event) => event.type === 'identify')).durationMs, 5000);

  await close(b);
  await admin.next((event) => event.type === 'state' && event.state.displays.find((display) => display.displayId === 'display-b')?.online === false);
  admin.send({ type: 'cue:execute', cueId: cue.cueId });
  const partial = await a.next((event) => event.type === 'speak' && event.message.cueId === cue.cueId && event.message.id !== groupA.message.id);
  assert.equal(partial.shouldSpeak, true);
  a.send({ type: 'playback', id: partial.message.id, status: 'completed' });
  await admin.next((event) => event.type === 'state' && event.state.history.find((item) => item.id === partial.message.id)?.status === 'completed');
  admin.send({ type: 'display:delete', displayId: 'display-b' });
  const deleted = await admin.next((event) => event.type === 'state'
    && event.state.targetGroups.some((group) => group.id === 'main-b')
    && !event.state.displays.some((display) => display.displayId === 'display-b'));
  assert.deepEqual(deleted.state.targetGroups.find((group) => group.id === 'main-b').displayIds, ['display-a']);

  admin.send({ type: 'speak', text: 'unknown group', target: { type: 'group', id: 'missing' } });
  assert.equal((await admin.next((event) => event.type === 'error' && event.code === 'GROUP_NOT_FOUND')).message, '配信先セットが見つかりません。');
  assert.doesNotMatch(output, /Unhandled|uncaught/i);
});
