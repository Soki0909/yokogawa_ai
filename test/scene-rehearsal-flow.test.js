import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import net from 'node:net'; import os from 'node:os'; import path from 'node:path';
import { spawn } from 'node:child_process'; import { WebSocket } from 'ws';

const freePort = () => new Promise((resolve, reject) => { const server = net.createServer(); server.on('error', reject); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
const waitForHealth = async (port) => { const deadline = Date.now() + 8000; while (Date.now() < deadline) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 50)); } throw new Error('server did not start'); };
function connect(port, role, display) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`); const queue = []; const waiters = [];
  socket.on('message', (raw) => { const event = JSON.parse(raw); const index = waiters.findIndex((item) => item.predicate(event)); if (index >= 0) waiters.splice(index, 1)[0].resolve(event); else queue.push(event); });
  const next = (predicate, timeout = 3000) => { const index = queue.findIndex(predicate); if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]); return new Promise((resolve, reject) => { const waiter = { predicate, resolve }; waiters.push(waiter); setTimeout(() => { const current = waiters.indexOf(waiter); if (current >= 0) waiters.splice(current, 1); reject(new Error('timeout')); }, timeout).unref(); }); };
  return new Promise((resolve, reject) => { socket.once('error', reject); socket.once('open', async () => { socket.send(JSON.stringify({ type: 'hello', role, ...(display ? { display } : {}) })); resolve({ socket, initial: await next((event) => event.type === 'state'), next, send: (event) => socket.send(JSON.stringify(event)) }); }); });
}
const close = (client) => new Promise((resolve) => { if (client.socket.readyState === WebSocket.CLOSED) return resolve(); client.socket.once('close', resolve); client.socket.close(); });

test('scene:rehearsal-startは最終snapshotだけを同期し通常NEXTへ安全に接続する', { timeout: 30_000 }, async (t) => {
  const port = await freePort(); const directory = await mkdtemp(path.join(os.tmpdir(), 'yokogawa-scene-rehearsal-'));
  const child = spawn(process.execPath, ['src/server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', STATE_FILE: path.join(directory, 'state.json'), LOG_DIRECTORY: path.join(directory, 'logs'), AIVIS_ENGINE_URL: 'http://127.0.0.1:9' }, stdio: 'ignore' });
  t.after(() => child.kill('SIGTERM')); await waitForHealth(port);
  const production = JSON.parse(await readFile('shows/production.json', 'utf8'));
  const imported = await fetch(`http://127.0.0.1:${port}/api/show-file/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(production) });
  assert.equal(imported.ok, true);
  const admin = await connect(port, 'admin'); let display = await connect(port, 'display', { displayId: 'display-201', displayName: '7・201', audioEnabled: true });
  t.after(async () => Promise.all([admin, display].map(close)));
  await admin.next((event) => event.type === 'state' && event.state.displays.some((item) => item.displayId === 'display-201'));
  display.send({ type: 'audio:ready' }); await admin.next((event) => event.type === 'state' && event.state.displayAudioReady);
  admin.send({ type: 'rehearsal:start' }); await admin.next((event) => event.type === 'state' && event.state.rehearsalSession?.active);

  admin.send({ type: 'scene:rehearsal-start', sceneId: 'scene-2', actionId: 'scene-2-once' });
  await display.next((event) => event.type === 'stop');
  const restored = await display.next((event) => event.type === 'state' && event.state.currentPresetId === 'hijacked');
  assert.equal(restored.state.currentSubtitle, '第一の謎は、この201にあります');
  const ready = await admin.next((event) => event.type === 'state' && event.state.sceneRehearsal?.sceneId === 'scene-2');
  assert.equal(ready.state.currentCue, null); assert.equal(ready.state.nextCue, null);
  await assert.rejects(display.next((event) => ['presentation', 'speak'].includes(event.type), 250), /timeout/);

  admin.send({ type: 'scene:rehearsal-start', sceneId: 'scene-2', actionId: 'scene-2-once' });
  assert.equal((await admin.next((event) => event.type === 'error')).code, 'DUPLICATE_ACTION');
  const log = await fetch(`http://127.0.0.1:${port}/api/rehearsal.json`).then((response) => response.json());
  assert.equal(log.events.filter((item) => item.type === 'scene-rehearsal-start').length, 1);

  admin.send({ type: 'scene:rehearsal-start', sceneId: 'scene-6', actionId: 'scene-6-once' });
  await display.next((event) => event.type === 'stop'); await display.next((event) => event.type === 'state' && event.state.currentPresetId === 'warning');
  const scene6 = await admin.next((event) => event.type === 'state' && event.state.sceneRehearsal?.sceneId === 'scene-6');
  assert.equal(scene6.state.nextCue.cueId, 'prod-011');
  admin.send({ type: 'cue:next', actionId: 'scene-6-next' });
  await display.next((event) => event.type === 'presentation' && event.presentation.displayText === production.cues.find((cue) => cue.id === 'prod-011').displayText);
  const speech = await display.next((event) => event.type === 'speak' && event.message.cueId === 'prod-011');
  assert.equal(speech.shouldSpeak, true); assert.equal(speech.message.audio.assetId, 'prod-voice-011-final-challenge');

  await close(display); display = await connect(port, 'display', { displayId: 'display-201', displayName: '7・201', audioEnabled: true });
  assert.equal(display.initial.state.currentPresetId, 'hijacked');
  await assert.rejects(display.next((event) => ['presentation', 'speak'].includes(event.type), 250), /timeout/);
});
