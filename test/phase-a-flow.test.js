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
  const next = (predicate, timeout = 4000) => { const index = queue.findIndex(predicate); if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]); return new Promise((resolve, reject) => { const waiter = { predicate, resolve }; waiters.push(waiter); setTimeout(() => { const current = waiters.indexOf(waiter); if (current >= 0) waiters.splice(current, 1); reject(new Error('timeout')); }, timeout).unref(); }); };
  return new Promise((resolve, reject) => { socket.once('error', reject); socket.once('open', async () => { socket.send(JSON.stringify({ type: 'hello', role, ...(display ? { display } : {}) })); resolve({ socket, initial: await next((event) => event.type === 'state'), next, send: (event) => socket.send(JSON.stringify(event)) }); }); });
}
const close = (client) => new Promise((resolve) => { if (client.socket.readyState === WebSocket.CLOSED) return resolve(); client.socket.once('close', resolve); client.socket.close(); });

test('Phase AをAdmin 1 + Display 3でimport・target・unlock・再接続・安全操作まで処理する', { timeout: 35_000 }, async (t) => {
  const port = await freePort(); const directory = await mkdtemp(path.join(os.tmpdir(), 'yokogawa-phase-a-'));
  const child = spawn(process.execPath, ['src/server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', STATE_FILE: path.join(directory, 'state.json'), LOG_DIRECTORY: path.join(directory, 'logs') }, stdio: 'ignore' }); t.after(() => child.kill('SIGTERM')); await waitForHealth(port);
  const show = JSON.parse(await readFile(new URL('../shows/phase-a-demo.json', import.meta.url), 'utf8'));
  const imported = await fetch(`http://127.0.0.1:${port}/api/show-file/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(show) }).then((response) => response.json()); assert.equal(imported.valid, true); assert.equal(imported.summary.cues, 27);
  const admin = await connect(port, 'admin'); const a = await connect(port, 'display', { displayId: 'a', displayName: 'A', audioEnabled: true }); const b = await connect(port, 'display', { displayId: 'b', displayName: 'B', audioEnabled: false }); const c = await connect(port, 'display', { displayId: 'c', displayName: 'C', audioEnabled: false });
  t.after(async () => Promise.all([admin, a, b, c].map(close))); await admin.next((event) => event.type === 'state' && event.state.displays.filter((item) => item.online).length === 3); a.send({ type: 'audio:ready' });

  admin.send({ type: 'cue:execute', cueId: 'pa-016' });
  const unlocks = await Promise.all([a, b, c].map((client) => client.next((event) => event.type === 'presentation' && event.presentation.transition?.id === 'unlock-start')));
  assert.ok(unlocks.every((event) => event.presentation.unlock.status === 'running' && event.presentation.overlay.id === 'unlocking'));
  await new Promise((resolve) => setTimeout(resolve, 2600)); await close(c);
  const reconnected = await connect(port, 'display', { displayId: 'c', displayName: 'C', audioEnabled: false }); t.after(() => close(reconnected));
  assert.equal(reconnected.initial.state.unlock.status, 'running'); assert.ok(reconnected.initial.state.unlock.progress >= 45 && reconnected.initial.state.unlock.progress < 100); assert.equal(reconnected.initial.state.currentOverlay.id, 'unlocking');

  const targeted = { ...show.cues.find((cue) => cue.id === 'pa-009'), id: 'pa-target-b', cueId: 'pa-target-b', cueNumber: 'A-T', name: 'B only', cueName: 'B only', target: { type: 'display', id: 'b' } };
  admin.send({ type: 'cue:save', cue: targeted }); await admin.next((event) => event.type === 'state' && event.state.cues.some((cue) => cue.cueId === 'pa-target-b'));
  admin.send({ type: 'cue:execute', cueId: 'pa-target-b' }); await b.next((event) => event.type === 'presentation' && event.presentation.overlay?.id === 'access-denied');
  await assert.rejects(a.next((event) => event.type === 'presentation' && event.presentation.overlay?.id === 'access-denied', 250), /timeout/);

  admin.send({ type: 'cue:jump', cueId: 'pa-023' }); const jumped = await admin.next((event) => event.type === 'state' && event.state.currentCue?.cueId === 'pa-023'); assert.notEqual(jumped.state.currentPresetId, 'shutdown');
  admin.send({ type: 'cue:execute', cueId: 'pa-018' }); await a.next((event) => event.type === 'presentation' && event.presentation.overlay?.id === 'emergency-protection');
  const emergency = await admin.next((event) => event.type === 'state' && event.state.currentCue?.cueId === 'pa-018'); assert.equal(emergency.state.unlock.status, 'aborted');

  admin.send({ type: 'blackout' }); await a.next((event) => event.type === 'presentation' && event.presentation.blackout); admin.send({ type: 'blackout:clear' }); await admin.next((event) => event.type === 'state' && event.state.blackout === false);
  admin.send({ type: 'show:reset' }); const reset = await admin.next((event) => event.type === 'state' && event.state.currentCueIndex === -1); assert.equal(reset.state.currentOverlay.visible, false); assert.equal(reset.state.unlock.status, 'idle');

  const before = await fetch(`http://127.0.0.1:${port}/api/show-file`).then((response) => response.json()); const invalid = structuredClone(before); invalid.cues[0].transition = { id: 'not-valid' };
  const rejected = await fetch(`http://127.0.0.1:${port}/api/show-file/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(invalid) }); assert.equal(rejected.status, 422);
  const after = await fetch(`http://127.0.0.1:${port}/api/show-file`).then((response) => response.json()); assert.equal(after.cues.length, before.cues.length); assert.equal(after.cues[0].id, before.cues[0].id);
});
