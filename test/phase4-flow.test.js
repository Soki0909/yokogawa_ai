import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
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

test('Phase 4をAdmin 1 + Display 3で表示・音声Master・Blackout・再接続まで処理する', { timeout: 30_000 }, async (t) => {
  const port = await freePort(); const directory = await mkdtemp(path.join(os.tmpdir(), 'yokogawa-phase4-'));
  const child = spawn(process.execPath, ['src/server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', STATE_FILE: path.join(directory, 'state.json'), LOG_DIRECTORY: path.join(directory, 'logs') }, stdio: 'ignore' }); t.after(() => child.kill('SIGTERM')); await waitForHealth(port);
  const admin = await connect(port, 'admin'); const a = await connect(port, 'display', { displayId: 'a', displayName: 'A', audioEnabled: true }); const b = await connect(port, 'display', { displayId: 'b', displayName: 'B', audioEnabled: false }); const c = await connect(port, 'display', { displayId: 'c', displayName: 'C', audioEnabled: false });
  t.after(async () => Promise.all([admin, a, b, c].map(close))); await admin.next((event) => event.type === 'state' && event.state.displays.filter((item) => item.online).length === 3); a.send({ type: 'audio:ready' });

  const displayCue = { cueId: 'p4-display', cueNumber: 'P4-1', cueName: '表示のみ', kind: 'display-only', speechText: '', displayText: '警告字幕', presentationPreset: 'warning', avatar: { visible: true, state: 'warning' }, audio: { speechMode: 'none', assetId: null, lipSyncMode: 'none' }, operatorNote: 'Displayへ送らない', triggerNote: '秘密', target: { type: 'all' }, enabled: true };
  admin.send({ type: 'cue:save', cue: displayCue }); await admin.next((event) => event.type === 'state' && event.state.cues.some((cue) => cue.cueId === displayCue.cueId));
  admin.send({ type: 'cue:execute', cueId: displayCue.cueId }); const presentations = await Promise.all([a, b, c].map((client) => client.next((event) => event.type === 'presentation' && event.presentation.displayText === '警告字幕'))); assert.ok(presentations.every((event) => event.presentation.kind === 'display-only'));
  await assert.rejects(a.next((event) => event.type === 'speak' && event.message.cueId === displayCue.cueId, 200), /timeout/);

  const audioCue = { ...displayCue, cueId: 'p4-audio', cueName: '音声Asset', kind: 'speech-display', speechText: 'fallback', displayText: '音声字幕', presentationPreset: 'hijacked', audio: { speechMode: 'audio-file', assetId: 'test-tone', lipSyncMode: 'audio-reactive' } };
  admin.send({ type: 'cue:save', cue: audioCue }); await admin.next((event) => event.type === 'state' && event.state.cues.some((cue) => cue.cueId === audioCue.cueId)); admin.send({ type: 'cue:execute', cueId: audioCue.cueId });
  await Promise.all([a, b, c].map((client) => client.next((event) => event.type === 'presentation' && event.presentation.displayText === '音声字幕')));
  const speech = await Promise.all([a, b, c].map((client) => client.next((event) => event.type === 'speak' && event.message.cueId === audioCue.cueId))); assert.deepEqual(speech.map((event) => event.shouldSpeak), [true, false, false]);
  const tone = await fetch(`http://127.0.0.1:${port}/api/assets/test-tone`); assert.equal(tone.status, 200); assert.match(tone.headers.get('content-type'), /audio\/wav/); assert.ok((await tone.arrayBuffer()).byteLength > 44); a.send({ type: 'playback', id: speech[0].message.id, status: 'completed' });

  admin.send({ type: 'blackout' }); await Promise.all([a, b, c].map((client) => client.next((event) => event.type === 'presentation' && event.presentation.blackout)));
  await close(c); const reconnect = await connect(port, 'display', { displayId: 'c', displayName: 'C', audioEnabled: false }); assert.equal(reconnect.initial.state.blackout, true); assert.doesNotMatch(JSON.stringify(reconnect.initial), /Displayへ送らない|秘密/); t.after(() => close(reconnect));
  admin.send({ type: 'blackout:clear' }); const restored = await reconnect.next((event) => event.type === 'state' && event.state.blackout === false); assert.equal(restored.state.currentSubtitle, '音声字幕');

  const exported = await fetch(`http://127.0.0.1:${port}/api/show-file`).then((response) => response.json()); assert.equal(exported.schemaVersion, 3); assert.equal('history' in exported, false);
  admin.send({ type: 'rehearsal:start' }); await admin.next((event) => event.type === 'state' && event.state.rehearsalSession?.active); admin.send({ type: 'clear' }); await a.next((event) => event.type === 'presentation' && event.presentation.kind === 'clear'); admin.send({ type: 'rehearsal:stop' }); await admin.next((event) => event.type === 'state' && event.state.rehearsalSession?.active === false);
  const jsonLog = await fetch(`http://127.0.0.1:${port}/api/rehearsal.json`).then((response) => response.json()); assert.ok(jsonLog.events.some((item) => item.type === 'clear'));
  const csvLog = await fetch(`http://127.0.0.1:${port}/api/rehearsal.csv`).then((response) => response.text()); assert.match(csvLog, /elapsedMs/); assert.match(csvLog, /CLEAR/);
  const invalid = structuredClone(exported); invalid.assets[0].path = '../escape.wav'; const check = await fetch(`http://127.0.0.1:${port}/api/show-file/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(invalid) }).then((response) => response.json()); assert.equal(check.valid, false);
});
