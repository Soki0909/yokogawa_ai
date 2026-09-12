import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const minutes = Number(process.env.SOAK_MINUTES ?? 30);
const intervalMs = Number(process.env.SOAK_INTERVAL_MS ?? 2000);
if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('SOAK_MINUTES must be positive');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
}
async function health(port) {
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(response.ok, true); return response.json();
}
async function waitForHealth(port) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { return await health(port); } catch {}
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
    if (index >= 0) waiters.splice(index, 1)[0].resolve(event);
    else {
      queue.push(event);
      if (queue.length > 500) queue.shift();
    }
  });
  const next = (predicate, timeout = 4000) => {
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
      await next((event) => event.type === 'state');
      resolve({ socket, send: (event) => socket.send(JSON.stringify(event)), next });
    });
  });
}
const close = (client) => new Promise((resolve) => {
  if (client.socket.readyState === WebSocket.CLOSED) return resolve();
  client.socket.once('close', resolve); client.socket.close();
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const port = await freePort();
const temporary = await mkdtemp(path.join(os.tmpdir(), 'yokogawa-phase2-soak-'));
const server = spawn(process.execPath, ['src/server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', HEARTBEAT_TIMEOUT_MS: '3500', STATE_FILE: path.join(temporary, 'state.json'), LOG_DIRECTORY: path.join(temporary, 'logs') },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let serverErrors = ''; server.stderr.on('data', (chunk) => { serverErrors += chunk; });

let admin;
const displays = new Map();
const heartbeats = new Map();
const metrics = { totalEvents: 0, succeeded: 0, failed: 0, reconnects: 0, offlineDetections: 0, masterChanges: 0 };
const startedAt = Date.now();
const durationMs = minutes * 60 * 1000;
let initialHealth;
let currentMaster = 'display-a';

async function addDisplay(id, name) {
  const client = await connect(port, 'display', { displayId: id, displayName: name, audioEnabled: true });
  displays.set(id, client);
  heartbeats.set(id, setInterval(() => {
    if (client.socket.readyState === WebSocket.OPEN) client.send({ type: 'heartbeat' });
  }, 1000));
  return client;
}
async function removeDisplay(id) {
  clearInterval(heartbeats.get(id)); heartbeats.delete(id);
  await close(displays.get(id)); displays.delete(id);
}
async function completeSpeech(event) {
  if (!event.shouldSpeak) return;
  const client = displays.get(currentMaster);
  client.send({ type: 'playback', id: event.message.id, status: 'speaking' });
  client.send({ type: 'playback', id: event.message.id, status: 'completed' });
}

try {
  initialHealth = await waitForHealth(port);
  admin = await connect(port, 'admin');
  await addDisplay('display-a', 'Main');
  await addDisplay('display-b', 'East');
  await addDisplay('display-c', 'West');
  await admin.next((event) => event.type === 'state' && event.state.displays.filter((display) => display.online).length === 3);
  displays.get(currentMaster).send({ type: 'audio:ready' });
  await admin.next((event) => event.type === 'state' && event.state.displayAudioReady);

  let iteration = 0;
  let disconnectedOnce = false;
  let changedMaster = false;
  while (Date.now() - startedAt < durationMs) {
    iteration += 1;
    try {
      if (!disconnectedOnce && Date.now() - startedAt >= durationMs / 3) {
        await removeDisplay('display-b');
        await admin.next((event) => event.type === 'state' && event.state.displays.find((display) => display.displayId === 'display-b')?.online === false);
        metrics.offlineDetections += 1;
        await addDisplay('display-b', 'East');
        await admin.next((event) => event.type === 'state' && event.state.displays.find((display) => display.displayId === 'display-b')?.online === true);
        metrics.reconnects += 1; disconnectedOnce = true;
      }
      if (!changedMaster && Date.now() - startedAt >= durationMs / 2) {
        currentMaster = 'display-c';
        admin.send({ type: 'audio-master:set', displayId: currentMaster });
        displays.get(currentMaster).send({ type: 'audio:ready' });
        await admin.next((event) => event.type === 'state' && event.state.audioMasterId === currentMaster && event.state.displayAudioReady);
        metrics.masterChanges += 1; changedMaster = true;
      }

      const kind = iteration % 5;
      if (kind === 0) {
        const cueId = `cue-00${(iteration % 6) + 1}`;
        admin.send({ type: 'cue:execute', cueId }); metrics.totalEvents += 1;
        const event = await displays.get(currentMaster).next((message) => message.type === 'speak' && message.message.cueId === cueId);
        await completeSpeech(event);
      } else {
        const targeted = kind === 1;
        const text = `Phase 2 soak ${iteration}: 日本語 English 123 !?`;
        admin.send({ type: 'speak', text, target: targeted ? { type: 'display', id: 'display-b' } : { type: 'all' } });
        metrics.totalEvents += 1;
        const receiver = targeted ? displays.get('display-b') : displays.get(currentMaster);
        const event = await receiver.next((message) => message.type === 'speak' && message.message.text === text);
        await completeSpeech(event);
      }
      await admin.next((event) => event.type === 'state' && event.state.history[0]?.status === 'completed');
      metrics.succeeded += 1;
    } catch (error) {
      metrics.failed += 1;
      throw error;
    }
    if (iteration % Math.max(1, Math.round(300_000 / intervalMs)) === 0) {
      console.log(`SOAK PROGRESS: ${Math.floor((Date.now() - startedAt) / 60_000)}分 / ${metrics.succeeded}件成功`);
    }
    await wait(Math.min(intervalMs, Math.max(0, durationMs - (Date.now() - startedAt))));
  }

  const finalHealth = await health(port);
  const memoryGrowthBytes = finalHealth.memoryRssBytes - initialHealth.memoryRssBytes;
  assert.equal(server.exitCode, null);
  assert.equal(metrics.failed, 0);
  assert.equal(metrics.reconnects, 1);
  assert.equal(metrics.offlineDetections, 1);
  assert.equal(metrics.masterChanges, 1);
  assert.doesNotMatch(serverErrors, /Unhandled|uncaught/i);
  assert.ok(memoryGrowthBytes < 128 * 1024 * 1024, `RSS増加が128MiB未満: ${memoryGrowthBytes}`);
  console.log(`SOAK PASS: ${minutes}分 / ${JSON.stringify({ ...metrics, memoryStartBytes: initialHealth.memoryRssBytes, memoryEndBytes: finalHealth.memoryRssBytes, memoryGrowthBytes, abnormalExit: false })}`);
} finally {
  for (const timer of heartbeats.values()) clearInterval(timer);
  for (const client of displays.values()) await close(client);
  if (admin) await close(admin);
  server.kill('SIGTERM');
}
