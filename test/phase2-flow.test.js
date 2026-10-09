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
      const { port } = server.address(); server.close(() => resolve(port));
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
function connect(port, role, display) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const queue = []; const waiters = [];
  socket.on('message', (raw) => {
    const event = JSON.parse(raw.toString());
    const index = waiters.findIndex((waiter) => waiter.predicate(event));
    if (index >= 0) waiters.splice(index, 1)[0].resolve(event); else queue.push(event);
  });
  const next = (predicate = () => true, timeout = 3000) => {
    const index = queue.findIndex(predicate);
    if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve }; waiters.push(waiter);
      setTimeout(() => {
        const current = waiters.indexOf(waiter); if (current >= 0) waiters.splice(current, 1);
        reject(new Error(`${role}/${display?.displayId ?? ''} event timeout`));
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

test('Admin 1台 + Display 3台でtarget・Audio Master・Cue・再接続・Resetを処理する', { timeout: 25_000 }, async (t) => {
  const port = await freePort();
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yokogawa-phase2-flow-'));
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, SHOW_STARTUP_MODE: 'saved', NODE_ENV: 'phase2-test', PORT: String(port), HOST: '127.0.0.1', HEARTBEAT_TIMEOUT_MS: '900', STATE_FILE: path.join(directory, 'state.json'), LOG_DIRECTORY: path.join(directory, 'logs') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; child.stdout.on('data', (data) => { output += data; }); child.stderr.on('data', (data) => { output += data; });
  t.after(() => child.kill('SIGTERM'));
  await waitForHealth(port);
  assert.equal((await (await fetch(`http://127.0.0.1:${port}/health`)).json()).environment, 'phase2-test');

  let admin = await connect(port, 'admin');
  const a = await connect(port, 'display', { displayId: 'display-a', displayName: 'Main', audioEnabled: true });
  const b = await connect(port, 'display', { displayId: 'display-b', displayName: 'East', audioEnabled: true });
  const c = await connect(port, 'display', { displayId: 'display-c', displayName: 'West', audioEnabled: true });
  const heartbeat = (client) => setInterval(() => {
    if (client.socket.readyState === WebSocket.OPEN) client.send({ type: 'heartbeat' });
  }, 200);
  const heartbeatA = heartbeat(a);
  const heartbeatB = heartbeat(b);
  const heartbeatC = heartbeat(c);
  t.after(() => { clearInterval(heartbeatA); clearInterval(heartbeatB); clearInterval(heartbeatC); });
  await admin.next((event) => event.type === 'state' && event.state.displays.filter((item) => item.online).length === 3);
  b.send({ type: 'audio:ready' });
  admin.send({ type: 'audio-master:set', displayId: 'display-b' });
  const unpreparedB = await admin.next((event) => event.type === 'state' && event.state.audioMasterId === 'display-b');
  assert.equal(unpreparedB.state.displayAudioReady, false, '非Audio Master時のaudio:readyは受理しない');
  admin.send({ type: 'audio-master:set', displayId: 'display-a' });
  await admin.next((event) => event.type === 'state' && event.state.audioMasterId === 'display-a');
  a.send({ type: 'audio:ready' });
  await admin.next((event) => event.type === 'state' && event.state.displayAudioReady);

  admin.send({ type: 'speak', text: 'Broadcast', target: { type: 'all' } });
  const broadcast = await Promise.all([a, b, c].map((client) => client.next((event) => event.type === 'speak')));
  assert.deepEqual(broadcast.map((event) => event.shouldSpeak), [true, false, false]);
  assert.ok(broadcast.every((event) => event.message.text === 'Broadcast'));
  a.send({ type: 'playback', id: broadcast[0].message.id, status: 'completed' });
  await admin.next((event) => event.type === 'state' && event.state.playbackStatus === 'completed');

  admin.send({ type: 'speak', text: 'B only', target: { type: 'display', id: 'display-b' } });
  const targeted = await b.next((event) => event.type === 'speak' && event.message.text === 'B only');
  assert.equal(targeted.shouldSpeak, false);
  await assert.rejects(a.next((event) => event.type === 'speak' && event.message.text === 'B only', 250), /timeout/);
  await assert.rejects(c.next((event) => event.type === 'speak' && event.message.text === 'B only', 250), /timeout/);
  const targetedState = await admin.next((event) => event.type === 'state' && event.state.history[0]?.text === 'B only' && event.state.history[0].status === 'completed');
  assert.deepEqual(targetedState.state.history[0].target, { type: 'display', id: 'display-b' });

  admin.send({ type: 'audio-master:set', displayId: 'display-c' });
  await admin.next((event) => event.type === 'state' && event.state.audioMasterId === 'display-c');
  c.send({ type: 'audio:ready' });
  await admin.next((event) => event.type === 'state' && event.state.displayAudioReady);
  admin.send({ type: 'cue:next' });
  const cueEvents = await Promise.all([a, b, c].map((client) => client.next((event) => event.type === 'speak' && event.message.source === 'cue')));
  assert.deepEqual(cueEvents.map((event) => event.shouldSpeak), [false, false, true]);
  c.send({ type: 'playback', id: cueEvents[2].message.id, status: 'completed' });
  const cueOne = await admin.next((event) => event.type === 'state' && event.state.currentCue?.cueId === 'cue-001' && event.state.playbackStatus === 'completed');
  const historyLength = cueOne.state.history.length;
  admin.send({ type: 'cue:back' });
  const backed = await admin.next((event) => event.type === 'state' && event.state.currentCue === null && event.state.history.length === historyLength);
  assert.equal(backed.state.history.length, historyLength, 'BACKだけでは再発話しない');

  admin.send({ type: 'cue:execute', cueId: 'cue-003' });
  const direct = await c.next((event) => event.type === 'speak' && event.message.cueId === 'cue-003');
  c.send({ type: 'playback', id: direct.message.id, status: 'completed' });
  await admin.next((event) => event.type === 'state' && event.state.currentCue?.cueId === 'cue-003' && event.state.playbackStatus === 'completed');
  admin.send({ type: 'cue:replay' });
  const replayed = await c.next((event) => event.type === 'speak' && event.message.cueId === 'cue-003' && event.message.replayOf);
  c.send({ type: 'playback', id: replayed.message.id, status: 'completed' });
  await admin.next((event) => event.type === 'state' && event.state.history[0]?.id === replayed.message.id && event.state.playbackStatus === 'completed');
  admin.send({ type: 'speak', text: 'Cue中のFree Speak', target: { type: 'all' } });
  const free = await c.next((event) => event.type === 'speak' && event.message.source === 'free');
  c.send({ type: 'playback', id: free.message.id, status: 'completed' });
  const afterFree = await admin.next((event) => event.type === 'state' && event.state.history[0]?.text === 'Cue中のFree Speak' && event.state.playbackStatus === 'completed');
  assert.equal(afterFree.state.currentCue.cueId, 'cue-003');
  admin.send({ type: 'cue:next' });
  const afterFreeNext = await c.next((event) => event.type === 'speak' && event.message.cueId === 'cue-004');
  c.send({ type: 'playback', id: afterFreeNext.message.id, status: 'completed' });
  await admin.next((event) => event.type === 'state' && event.state.currentCue?.cueId === 'cue-004' && event.state.playbackStatus === 'completed');

  admin.socket.close();
  await new Promise((resolve) => setTimeout(resolve, 100));
  a.send({ type: 'heartbeat' }); b.send({ type: 'heartbeat' }); c.send({ type: 'heartbeat' });
  admin = await connect(port, 'admin');
  assert.equal(admin.initial.state.displays.filter((item) => item.online).length, 3);
  assert.equal(admin.initial.state.currentCue.cueId, 'cue-004');

  await close(c);
  clearInterval(heartbeatC);
  const masterOffline = await admin.next((event) => event.type === 'state' && event.state.displays.find((item) => item.displayId === 'display-c')?.online === false);
  assert.equal(masterOffline.state.audioMasterId, 'display-c');
  assert.equal(masterOffline.state.displays.find((item) => item.displayId === 'display-a').online, true);
  admin.send({ type: 'speak', text: 'Master不在でも字幕継続', target: { type: 'all' } });
  const subtitleOnly = await Promise.all([a, b].map((client) => client.next((event) => event.type === 'speak' && event.message.text === 'Master不在でも字幕継続')));
  assert.ok(subtitleOnly.every((event) => event.shouldSpeak === false));
  await admin.next((event) => event.type === 'state' && event.state.history[0]?.text === 'Master不在でも字幕継続' && event.state.history[0].status === 'completed');
  admin.send({ type: 'audio-master:set', displayId: 'display-a' });
  a.send({ type: 'audio:ready' });
  await admin.next((event) => event.type === 'state' && event.state.audioMasterId === 'display-a' && event.state.displayAudioReady);

  const reconnectedC = await connect(port, 'display', { displayId: 'display-c', displayName: 'West', audioEnabled: true });
  const heartbeatReconnectedC = heartbeat(reconnectedC);
  t.after(() => clearInterval(heartbeatReconnectedC));
  assert.equal(reconnectedC.initial.self.displayId, 'display-c');
  assert.equal(reconnectedC.initial.self.currentSubtitle, 'Master不在でも字幕継続');
  await assert.rejects(reconnectedC.next((event) => event.type === 'speak', 250), /timeout/, '再接続だけでは過去発話を再送しない');

  admin.send({ type: 'show:reset' });
  await Promise.all([a, b, reconnectedC].map((client) => client.next((event) => event.type === 'show:reset')));
  const reset = await admin.next((event) => event.type === 'state' && event.state.currentCue === null && event.state.currentSubtitle === null);
  assert.equal(reset.state.cues.length >= 5, true);
  assert.equal(reset.state.displays.length, 3);

  clearInterval(heartbeatB);
  a.send({ type: 'heartbeat' }); reconnectedC.send({ type: 'heartbeat' });
  const timeout = await admin.next((event) => event.type === 'state' && event.state.displays.find((item) => item.displayId === 'display-b')?.online === false, 3000);
  assert.equal(timeout.state.displays.find((item) => item.displayId === 'display-a').online, true);

  await Promise.all([close(a), close(b), close(reconnectedC), close(admin)]);
  assert.doesNotMatch(output, /Unhandled|uncaught/i);
});

test('同一Display IDの連続connect/disconnect/reconnectで登録が増殖しない', { timeout: 20_000 }, async (t) => {
  const port = await freePort();
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yokogawa-phase2-stress-'));
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, SHOW_STARTUP_MODE: 'saved', PORT: String(port), HOST: '127.0.0.1', STATE_FILE: path.join(directory, 'state.json'), LOG_DIRECTORY: path.join(directory, 'logs') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; child.stdout.on('data', (data) => { output += data; }); child.stderr.on('data', (data) => { output += data; });
  t.after(() => child.kill('SIGTERM'));
  await waitForHealth(port);
  const admin = await connect(port, 'admin');
  let display;
  for (let index = 0; index < 20; index += 1) {
    display = await connect(port, 'display', { displayId: 'stress-display', displayName: `Stress ${index}`, audioEnabled: true });
    display.send({ type: 'heartbeat' });
    await admin.next((event) => event.type === 'state' && event.state.displays.length === 1 && event.state.displays[0].online);
    await close(display);
    await admin.next((event) => event.type === 'state' && event.state.displays.length === 1 && !event.state.displays[0].online);
  }
  const first = await connect(port, 'display', { displayId: 'stress-display', displayName: 'Old', audioEnabled: true });
  const replacement = await connect(port, 'display', { displayId: 'stress-display', displayName: 'New', audioEnabled: true });
  await close(first);
  const final = await admin.next((event) => event.type === 'state' && event.state.displays.length === 1 && event.state.displays[0].displayName === 'New');
  assert.equal(final.state.displays[0].online, true);
  await Promise.all([close(replacement), close(admin)]);
  assert.doesNotMatch(output, /Unhandled|uncaught/i);
});
