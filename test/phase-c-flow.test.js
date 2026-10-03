import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { createTestToneWav } from '../src/local-audio.js';
import { loadProductionVoiceProfile } from '../src/voice-profile.js';

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer(); server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
});
const waitForHealth = async (port) => {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 50)); }
  throw new Error('server did not start');
};
function connect(port, role, display) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`); const queue = []; const waiters = [];
  socket.on('message', (raw) => {
    const event = JSON.parse(raw); const index = waiters.findIndex((item) => item.predicate(event));
    if (index >= 0) waiters.splice(index, 1)[0].resolve(event); else queue.push(event);
  });
  const next = (predicate, timeout = 12_000) => {
    const index = queue.findIndex(predicate); if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => { const waiter = { predicate, resolve }; waiters.push(waiter); setTimeout(() => {
      const position = waiters.indexOf(waiter); if (position >= 0) waiters.splice(position, 1); reject(new Error('timeout'));
    }, timeout).unref(); });
  };
  return new Promise((resolve, reject) => { socket.once('error', reject); socket.once('open', async () => {
    socket.send(JSON.stringify({ type: 'hello', role, ...(display ? { display } : {}) }));
    resolve({ socket, initial: await next((event) => event.type === 'state'), next, send: (event) => socket.send(JSON.stringify(event)) });
  }); });
}
const closeClient = (client) => new Promise((resolve) => {
  if (client.socket.readyState === WebSocket.CLOSED) return resolve(); client.socket.once('close', resolve); client.socket.close();
});

test('Production Free Speakをserver-side Aivis→Audio Masterだけへ配信しDOWN時にfallbackしない', { timeout: 30_000 }, async (t) => {
  const profile = await loadProductionVoiceProfile();
  const enginePort = await freePort();
  const engine = http.createServer(async (request, response) => {
    if (request.url === '/version') return response.end(JSON.stringify('test-engine'));
    if (request.url === '/speakers') return response.end(JSON.stringify([{ name: profile.speaker.name, speaker_uuid: profile.speaker.uuid,
      version: profile.model.version, styles: [{ id: 4242, name: profile.style.name }] }]));
    if (request.url.startsWith('/audio_query?')) {
      response.setHeader('content-type', 'application/json');
      return response.end(JSON.stringify({ accent_phrases: [], kana: 'テスト', speedScale: 1, futureField: 'preserve' }));
    }
    if (request.url.startsWith('/synthesis?')) { response.setHeader('content-type', 'audio/wav'); return response.end(createTestToneWav()); }
    response.statusCode = 404; response.end();
  });
  await new Promise((resolve) => engine.listen(enginePort, '127.0.0.1', resolve));
  let engineOpen = true;
  t.after(() => { if (engineOpen) engine.close(); });

  const port = await freePort(); const directory = await mkdtemp(path.join(os.tmpdir(), 'yokogawa-phase-c-'));
  const child = spawn(process.execPath, ['src/server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), HOST: '127.0.0.1',
    AIVIS_ENGINE_URL: `http://127.0.0.1:${enginePort}`, STATE_FILE: path.join(directory, 'state.json'), LOG_DIRECTORY: path.join(directory, 'logs') }, stdio: 'ignore' });
  t.after(() => child.kill('SIGTERM'));
  await waitForHealth(port);
  const production = JSON.parse(await readFile('shows/production.json', 'utf8'));
  const imported = await fetch(`http://127.0.0.1:${port}/api/show-file/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(production) });
  assert.equal(imported.status, 200);

  const admin = await connect(port, 'admin');
  const displays = await Promise.all(['master', 'subtitle-b', 'subtitle-c'].map((displayId) => connect(port, 'display', { displayId, displayName: displayId, audioEnabled: displayId === 'master' })));
  t.after(async () => Promise.all([admin, ...displays].map(closeClient)));
  await admin.next((event) => event.type === 'state' && event.state.displays.filter((item) => item.online).length === 3);
  displays[0].send({ type: 'audio:ready' });
  await admin.next((event) => event.type === 'state' && event.state.displayAudioReady && event.state.localTts.status === 'ready');

  admin.send({ type: 'speak', text: '緊急のFree Speakです', target: { type: 'all' } });
  const spoken = await Promise.all(displays.map((display) => display.next((event) => event.type === 'speak' && event.message.text === '緊急のFree Speakです')));
  assert.deepEqual(spoken.map((event) => event.shouldSpeak), [true, false, false]);
  assert.ok(spoken.every((event) => event.message.audio.speechMode === 'local-tts'));
  assert.ok(spoken.every((event) => !('audioQuery' in event.message.audio)));
  const runtime = await fetch(`http://127.0.0.1:${port}${spoken[0].message.audio.runtimeUrl}`);
  assert.equal(runtime.status, 200); assert.match(runtime.headers.get('content-type'), /audio\/wav/); assert.ok((await runtime.arrayBuffer()).byteLength > 44);
  displays[0].send({ type: 'playback', id: spoken[0].message.id, status: 'completed' });
  await admin.next((event) => event.type === 'state' && event.state.playbackStatus === 'completed');

  await new Promise((resolve) => engine.close(resolve)); engineOpen = false;
  admin.send({ type: 'speak', text: 'Engine停止中の字幕', target: { type: 'all' } });
  const subtitles = await Promise.all(displays.map((display) => display.next((event) => event.type === 'speak' && event.message.text === 'Engine停止中の字幕')));
  assert.ok(subtitles.every((event) => event.shouldSpeak === false));
  const failure = await admin.next((event) => event.type === 'error' && /Browser TTSへは切り替えません/.test(event.message));
  assert.notEqual(failure.code, 'browser');
});
