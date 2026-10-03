import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const minutes = Number(process.env.SOAK_MINUTES ?? 30);
const intervalMs = Number(process.env.SOAK_INTERVAL_MS ?? 4000);
const eventTimeoutMs = Number(process.env.SOAK_EVENT_TIMEOUT_MS ?? 60_000);
const reportPath = process.env.SOAK_REPORT_FILE?.trim();
if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('SOAK_MINUTES must be positive');
if (!Number.isFinite(eventTimeoutMs) || eventTimeoutMs < 5000) throw new Error('SOAK_EVENT_TIMEOUT_MS must be at least 5000');

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

async function health(port) {
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(response.ok, true);
  return response.json();
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
  const queue = [];
  const waiters = [];
  socket.on('message', (raw) => {
    const event = JSON.parse(raw.toString());
    const index = waiters.findIndex((waiter) => waiter.predicate(event));
    if (index >= 0) {
      const waiter = waiters.splice(index, 1)[0];
      clearTimeout(waiter.timer);
      waiter.resolve(event);
    }
    else {
      queue.push(event);
      if (queue.length > 1000) queue.shift();
    }
  });
  const next = (predicate, timeout = eventTimeoutMs) => {
    const index = queue.findIndex(predicate);
    if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: null };
      waiters.push(waiter);
      waiter.timer = setTimeout(() => {
        const current = waiters.indexOf(waiter);
        if (current >= 0) waiters.splice(current, 1);
        reject(new Error(`${role}/${display?.displayId ?? ''} event timeout`));
      }, timeout).unref();
    });
  };
  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.once('open', async () => {
      socket.send(JSON.stringify({ type: 'hello', role, ...(display ? { display } : {}) }));
      const initial = await next((event) => event.type === 'state');
      resolve({ socket, initial, send: (event) => socket.send(JSON.stringify(event)), next });
    });
  });
}

const close = (client) => new Promise((resolve) => {
  if (!client || client.socket.readyState === WebSocket.CLOSED) return resolve();
  client.socket.once('close', resolve);
  client.socket.close();
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const port = await freePort();
const temporary = await mkdtemp(path.join(os.tmpdir(), 'yokogawa-phase-c-soak-'));
const server = spawn(process.execPath, ['src/server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    HEARTBEAT_TIMEOUT_MS: '7000',
    STATE_FILE: path.join(temporary, 'state.json'),
    LOG_DIRECTORY: path.join(temporary, 'logs'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
let serverErrors = '';
server.stdout.on('data', (chunk) => { serverOutput = (serverOutput + chunk).slice(-30_000); });
server.stderr.on('data', (chunk) => { serverErrors += chunk; });

let admin;
const displays = new Map();
const heartbeats = new Map();
const metrics = {
  totalEvents: 0, succeeded: 0, failed: 0, groupEvents: 0, cueEvents: 0,
  replayEvents: 0, stopEvents: 0, reconnects: 0, adminReconnects: 0,
  offlineDetections: 0, requiredOfflineDetections: 0, masterReconnects: 0,
  masterChanges: 0, preflightChecks: 0,
  presentationEvents: 0, blackoutEvents: 0, localAudioEvents: 0,
  phaseAEvents: 0, unlockEvents: 0, emergencyEvents: 0,
  shutdownEvents: 0, recoveryEvents: 0, normalizationEvents: 0, stateCleanupChecks: 0,
  localTtsEvents: 0, scriptedWavEvents: 0, aivisHealthChecks: 0,
};
const processedMessageIds = new Set();
const durationMs = minutes * 60 * 1000;
let initialHealth;
let startedAt = Date.now();
let currentMaster = 'display-a';
const productionCueIds = [
  'prod-001', 'prod-002', 'prod-003', 'prod-004', 'prod-005', 'prod-006',
  'prod-007', 'prod-008', 'prod-009', 'prod-010', 'prod-011', 'prod-012',
  'prod-013', 'prod-014', 'prod-015', 'prod-016', 'prod-017',
];

async function addDisplay(id, name) {
  const client = await connect(port, 'display', { displayId: id, displayName: name, audioEnabled: true });
  displays.set(id, client);
  heartbeats.set(id, setInterval(() => {
    if (client.socket.readyState === WebSocket.OPEN) client.send({ type: 'heartbeat' });
  }, 1000));
  return client;
}

async function removeDisplay(id) {
  clearInterval(heartbeats.get(id));
  heartbeats.delete(id);
  await close(displays.get(id));
  displays.delete(id);
}

async function finishSpeech(event) {
  if (!event.shouldSpeak) return;
  const client = displays.get(currentMaster);
  assert.ok(client, `Audio Master ${currentMaster} must be connected`);
  client.send({ type: 'playback', id: event.message.id, status: 'speaking' });
  client.send({ type: 'playback', id: event.message.id, status: 'completed' });
}

async function awaitCompleted(id) {
  return admin.next((message) => message.type === 'state'
    && message.state.currentMessage === null
    && message.state.history.find((item) => item.id === id)?.status === 'completed');
}

async function exerciseSpeech(iteration) {
  const kind = iteration % 18;
  let event;
  if (kind === 8) {
    admin.send({ type: 'cue:execute', cueId: 'soak-display' });
    await Promise.all([...displays.values()].map((client) => client.next((item) => item.type === 'presentation' && item.presentation.displayText === 'Phase 4 display-only')));
    metrics.presentationEvents += 1; return;
  }
  if (kind === 12) {
    admin.send({ type: 'cue:execute', cueId: 'soak-unlock' });
    const events = await Promise.all([...displays.values()].map((client) => client.next((item) => item.type === 'presentation' && item.presentation.transition?.id === 'unlock-start')));
    assert.ok(events.every((item) => item.presentation.unlock.status === 'running'));
    metrics.phaseAEvents += 1; metrics.unlockEvents += 1; return;
  }
  if (kind === 13) {
    admin.send({ type: 'cue:execute', cueId: 'soak-emergency' });
    const events = await Promise.all([...displays.values()].map((client) => client.next((item) => item.type === 'presentation' && item.presentation.overlay?.id === 'emergency-protection')));
    assert.ok(events.every((item) => item.presentation.unlock.status === 'aborted'));
    metrics.phaseAEvents += 1; metrics.emergencyEvents += 1; return;
  }
  if (kind === 14) {
    admin.send({ type: 'cue:execute', cueId: 'soak-hostile' });
    await Promise.all([...displays.values()].map((client) => client.next((item) => item.type === 'presentation' && item.presentation.transition?.id === 'hostile-enter')));
    metrics.phaseAEvents += 1; return;
  }
  if (kind === 15) {
    admin.send({ type: 'cue:execute', cueId: 'soak-shutdown' });
    const events = await Promise.all([...displays.values()].map((client) => client.next((item) => item.type === 'presentation' && item.presentation.transition?.id === 'shutdown')));
    assert.ok(events.every((item) => item.presentation.overlay?.id === 'system-shutdown'));
    metrics.phaseAEvents += 1; metrics.shutdownEvents += 1; return;
  }
  if (kind === 16) {
    admin.send({ type: 'cue:execute', cueId: 'soak-recovery' });
    const events = await Promise.all([...displays.values()].map((client) => client.next((item) => item.type === 'presentation' && item.presentation.transition?.id === 'recovery')));
    assert.ok(events.every((item) => item.preset?.id === 'recovery'));
    metrics.phaseAEvents += 1; metrics.recoveryEvents += 1; return;
  }
  if (kind === 17) {
    admin.send({ type: 'cue:execute', cueId: 'soak-normalize' });
    const events = await Promise.all([...displays.values()].map((client) => client.next((item) => item.type === 'presentation' && item.presentation.transition?.id === 'normalize')));
    assert.ok(events.every((item) => item.preset?.id === 'normal'
      && item.presentation.overlay?.visible === false
      && item.presentation.visual?.visible === false
      && item.presentation.unlock?.status === 'idle'));
    metrics.phaseAEvents += 1; metrics.normalizationEvents += 1; metrics.stateCleanupChecks += events.length; return;
  }
  if (kind === 9) {
    admin.send({ type: 'cue:execute', cueId: 'soak-audio' });
    event = await displays.get(currentMaster).next((item) => item.type === 'speak' && item.message.cueId === 'soak-audio' && !processedMessageIds.has(item.message.id));
    assert.equal(event.message.audio.speechMode, 'audio-file'); metrics.localAudioEvents += 1;
  } else if (kind === 10) {
    admin.send({ type: 'clear' }); await Promise.all([...displays.values()].map((client) => client.next((item) => item.type === 'presentation' && item.presentation.kind === 'clear'))); metrics.presentationEvents += 1; return;
  } else if (kind === 11) {
    admin.send({ type: 'blackout' }); await Promise.all([...displays.values()].map((client) => client.next((item) => item.type === 'presentation' && item.presentation.blackout))); admin.send({ type: 'blackout:clear' }); await admin.next((item) => item.type === 'state' && item.state.blackout === false); metrics.blackoutEvents += 1; return;
  }
  else if (kind === 0) {
    const text = `Phase C Free Speak ${iteration}: 緊急案内テストです`;
    admin.send({ type: 'speak', text, target: { type: 'all' } });
    event = await displays.get(currentMaster).next((item) => item.type === 'speak' && item.message.text === text && !processedMessageIds.has(item.message.id));
  } else if (kind === 1) {
    const text = `Phase C individual ${iteration}`;
    admin.send({ type: 'speak', text, target: { type: 'display', id: 'display-b' } });
    event = await displays.get('display-b').next((item) => item.type === 'speak' && item.message.text === text && !processedMessageIds.has(item.message.id));
    assert.equal(event.shouldSpeak, currentMaster === 'display-b');
  } else if (kind === 2) {
    const text = `Phase C group A+B ${iteration}`;
    admin.send({ type: 'speak', text, target: { type: 'group', id: 'front-pair' } });
    event = await displays.get('display-a').next((item) => item.type === 'speak' && item.message.text === text && !processedMessageIds.has(item.message.id));
    assert.equal(event.shouldSpeak, currentMaster === 'display-a');
    metrics.groupEvents += 1;
  } else if (kind === 3) {
    const cueId = productionCueIds[iteration % productionCueIds.length];
    admin.send({ type: 'cue:execute', cueId });
    event = await displays.get(currentMaster).next((item) => item.type === 'speak' && item.message.cueId === cueId && !processedMessageIds.has(item.message.id));
    metrics.cueEvents += 1;
  } else if (kind === 4) {
    admin.send({ type: 'audio:test' });
    event = await displays.get(currentMaster).next((item) => item.type === 'speak' && item.message.source === 'test' && !processedMessageIds.has(item.message.id));
  } else if (kind === 5) {
    const cueId = productionCueIds[(iteration + 1) % productionCueIds.length];
    admin.send({ type: 'cue:execute', cueId });
    const first = await displays.get(currentMaster).next((item) => item.type === 'speak' && item.message.cueId === cueId && !processedMessageIds.has(item.message.id));
    processedMessageIds.add(first.message.id);
    await finishSpeech(first);
    await awaitCompleted(first.message.id);
    admin.send({ type: 'cue:back' });
    await admin.next((item) => item.type === 'state' && item.state.currentCue?.cueId !== cueId);
    admin.send({ type: 'cue:next' });
    event = await displays.get(currentMaster).next((item) => item.type === 'speak' && item.message.cueId === cueId && !processedMessageIds.has(item.message.id));
    metrics.cueEvents += 2;
  } else if (kind === 6) {
    const cueId = productionCueIds[(iteration + 2) % productionCueIds.length];
    admin.send({ type: 'cue:execute', cueId });
    const first = await displays.get(currentMaster).next((item) => item.type === 'speak' && item.message.cueId === cueId && !processedMessageIds.has(item.message.id));
    processedMessageIds.add(first.message.id);
    await finishSpeech(first);
    await awaitCompleted(first.message.id);
    admin.send({ type: 'cue:replay' });
    event = await displays.get(currentMaster).next((item) => item.type === 'speak' && item.message.cueId === cueId && item.message.replayOf && !processedMessageIds.has(item.message.id));
    metrics.replayEvents += 1;
  } else {
    const text = `Phase C STOP ${iteration}`;
    admin.send({ type: 'speak', text, target: { type: 'all' } });
    event = await displays.get(currentMaster).next((item) => item.type === 'speak' && item.message.text === text && !processedMessageIds.has(item.message.id));
    assert.equal(event.shouldSpeak, true);
    displays.get(currentMaster).send({ type: 'playback', id: event.message.id, status: 'speaking' });
    admin.send({ type: 'stop' });
    const stopped = await displays.get(currentMaster).next((item) => item.type === 'stop' && item.id === event.message.id);
    displays.get(currentMaster).send({ type: 'playback', id: stopped.id, status: 'stopped' });
    await admin.next((item) => item.type === 'state' && item.state.history.find((history) => history.id === stopped.id)?.status === 'stopped');
    if (event.message.audio?.speechMode === 'local-tts') metrics.localTtsEvents += 1;
    processedMessageIds.add(event.message.id);
    metrics.stopEvents += 1;
    return;
  }

  if (event.message.audio?.speechMode === 'local-tts') metrics.localTtsEvents += 1;
  if (event.message.audio?.speechMode === 'audio-file') metrics.scriptedWavEvents += 1;
  processedMessageIds.add(event.message.id);
  await finishSpeech(event);
  await awaitCompleted(event.message.id);
}

try {
  await waitForHealth(port);
  const productionShow = JSON.parse(await readFile('shows/production.json', 'utf8'));
  const importResponse = await fetch(`http://127.0.0.1:${port}/api/show-file/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(productionShow),
  });
  assert.equal(importResponse.status, 200, `Production Show import: ${await importResponse.text()}`);
  admin = await connect(port, 'admin');
  await addDisplay('display-a', 'Main');
  await addDisplay('display-b', 'East');
  await addDisplay('display-c', 'West');
  await admin.next((event) => event.type === 'state' && event.state.displays.filter((display) => display.online).length === 3);
  displays.get(currentMaster).send({ type: 'audio:ready' });
  await admin.next((event) => event.type === 'state' && event.state.displayAudioReady);
  admin.send({ type: 'display:required', displayId: 'display-a', required: true });
  admin.send({ type: 'display:required', displayId: 'display-c', required: true });
  admin.send({ type: 'target-group:save', group: { id: 'front-pair', name: 'Main + East', displayIds: ['display-a', 'display-b'], enabled: true, notes: 'Phase C soak' } });
  admin.send({ type: 'admin-mode:set', mode: 'show' });
  admin.send({ type: 'cue:save', cue: { cueId: 'soak-display', cueNumber: 'P4-D', cueName: 'Display only', kind: 'display-only', displayText: 'Phase 4 display-only', speechText: '', presentationPreset: 'warning', target: { type: 'all' }, avatar: { visible: true, state: 'warning' }, audio: { speechMode: 'none', lipSyncMode: 'none' }, enabled: true } });
  admin.send({ type: 'cue:save', cue: { cueId: 'soak-audio', cueNumber: 'PC-A', cueName: 'Production fixed WAV', kind: 'speech-display', displayText: 'Phase C production fixed WAV', speechText: 'fallback', presentationPreset: 'hijacked', target: { type: 'all' }, avatar: { visible: true, state: 'speaking' }, audio: { speechMode: 'audio-file', assetId: 'prod-voice-001-boot', lipSyncMode: 'audio-reactive' }, enabled: true } });
  admin.send({ type: 'cue:save', cue: { cueId: 'soak-unlock', cueNumber: 'PA-U', cueName: 'Unlock', kind: 'display-only', displayText: 'UNLOCKING', presentationPreset: 'recovery', target: { type: 'all' }, audio: { speechMode: 'none' }, transition: { id: 'unlock-start', durationMs: 800 }, overlay: { id: 'unlocking', visible: true, title: 'UNLOCKING' }, timing: { unlockDurationMs: 3000 }, enabled: true } });
  admin.send({ type: 'cue:save', cue: { cueId: 'soak-emergency', cueNumber: 'PA-E', cueName: 'Emergency', kind: 'display-only', displayText: 'EMERGENCY', presentationPreset: 'warning', target: { type: 'all' }, audio: { speechMode: 'none' }, transition: { id: 'emergency-interrupt', durationMs: 500 }, overlay: { id: 'emergency-protection', visible: true, title: 'EMERGENCY' }, enabled: true } });
  admin.send({ type: 'cue:save', cue: { cueId: 'soak-hostile', cueNumber: 'PA-H', cueName: 'Hostile', kind: 'display-only', displayText: 'HOSTILE', presentationPreset: 'hostile', target: { type: 'all' }, audio: { speechMode: 'none' }, transition: { id: 'hostile-enter', durationMs: 600 }, enabled: true } });
  admin.send({ type: 'cue:save', cue: { cueId: 'soak-shutdown', cueNumber: 'PB-S', cueName: 'Shutdown', kind: 'display-only', displayText: 'SHUTDOWN', presentationPreset: 'shutdown', target: { type: 'all' }, audio: { speechMode: 'none' }, transition: { id: 'shutdown', durationMs: 700 }, overlay: { id: 'system-shutdown', visible: true, title: 'SYSTEM SHUTDOWN' }, enabled: true } });
  admin.send({ type: 'cue:save', cue: { cueId: 'soak-recovery', cueNumber: 'PB-R', cueName: 'Recovery', kind: 'display-only', displayText: 'RESTORING', presentationPreset: 'recovery', target: { type: 'all' }, audio: { speechMode: 'none' }, transition: { id: 'recovery', durationMs: 800 }, overlay: { id: 'restoring', visible: true, title: 'RESTORING' }, enabled: true } });
  admin.send({ type: 'cue:save', cue: { cueId: 'soak-normalize', cueNumber: 'PB-N', cueName: 'Normalize', kind: 'display-only', displayText: 'SYSTEM NORMAL', presentationPreset: 'normal', target: { type: 'all' }, audio: { speechMode: 'none' }, transition: { id: 'normalize', durationMs: 600 }, overlay: { id: 'none', visible: false }, visual: { id: 'none', type: 'none', visible: false }, enabled: true } });
  const ready = await admin.next((event) => event.type === 'state'
    && event.state.targetGroups.some((group) => group.id === 'front-pair')
    && event.state.displays.filter((display) => display.required).length === 2
    && event.state.preflight.status === 'ready');
  assert.equal(ready.state.preflight.canStart, true);
  metrics.preflightChecks += 1;
  initialHealth = await health(port);
  startedAt = Date.now();

  let iteration = 0;
  const milestones = { optional: false, admin: false, required: false, master: false, changedMaster: false };
  while (Date.now() - startedAt < durationMs) {
    iteration += 1;
    const elapsed = Date.now() - startedAt;
    try {
      if (!milestones.optional && elapsed >= durationMs * 0.2) {
        await removeDisplay('display-b');
        const offline = await admin.next((event) => event.type === 'state' && event.state.displays.find((display) => display.displayId === 'display-b')?.online === false);
        assert.equal(offline.state.preflight.canStart, true, 'optional offline remains startable');
        metrics.offlineDetections += 1;
        metrics.preflightChecks += 1;
        await addDisplay('display-b', 'East');
        await admin.next((event) => event.type === 'state' && event.state.displays.find((display) => display.displayId === 'display-b')?.online === true);
        metrics.reconnects += 1;
        milestones.optional = true;
      }
      if (!milestones.admin && elapsed >= durationMs * 0.35) {
        await close(admin);
        admin = await connect(port, 'admin');
        assert.equal(admin.initial.state.displays.filter((display) => display.online).length, 3);
        assert.equal(admin.initial.state.targetGroups.some((group) => group.id === 'front-pair'), true);
        metrics.adminReconnects += 1;
        milestones.admin = true;
      }
      if (!milestones.required && elapsed >= durationMs * 0.5) {
        await removeDisplay('display-c');
        const offline = await admin.next((event) => event.type === 'state' && event.state.displays.find((display) => display.displayId === 'display-c')?.online === false);
        assert.equal(offline.state.preflight.canStart, false, 'required offline blocks start');
        metrics.requiredOfflineDetections += 1;
        metrics.preflightChecks += 1;
        await addDisplay('display-c', 'West');
        await admin.next((event) => event.type === 'state' && event.state.displays.find((display) => display.displayId === 'display-c')?.online === true);
        metrics.reconnects += 1;
        milestones.required = true;
      }
      if (!milestones.master && elapsed >= durationMs * 0.65) {
        await removeDisplay('display-a');
        const offline = await admin.next((event) => event.type === 'state' && event.state.displays.find((display) => display.displayId === 'display-a')?.online === false);
        assert.equal(offline.state.preflight.canStart, false, 'required Audio Master offline blocks start');
        metrics.requiredOfflineDetections += 1;
        metrics.preflightChecks += 1;
        await addDisplay('display-a', 'Main');
        const notReady = await admin.next((event) => event.type === 'state'
          && event.state.displays.find((display) => display.displayId === 'display-a')?.online === true
          && event.state.displayAudioReady === false
          && event.state.preflight.status === 'warning');
        assert.equal(notReady.state.preflight.status, 'warning');
        displays.get('display-a').send({ type: 'audio:ready' });
        await admin.next((event) => event.type === 'state' && event.state.displayAudioReady);
        metrics.reconnects += 1;
        metrics.masterReconnects += 1;
        metrics.preflightChecks += 1;
        milestones.master = true;
      }
      if (!milestones.changedMaster && elapsed >= durationMs * 0.8) {
        currentMaster = 'display-c';
        admin.send({ type: 'audio-master:set', displayId: currentMaster });
        displays.get(currentMaster).send({ type: 'audio:ready' });
        await admin.next((event) => event.type === 'state' && event.state.audioMasterId === currentMaster && event.state.displayAudioReady);
        metrics.masterChanges += 1;
        metrics.preflightChecks += 1;
        milestones.changedMaster = true;
      }

      metrics.totalEvents += 1;
      if (iteration === 1 || iteration % 15 === 0) {
        const response = await fetch(`http://127.0.0.1:${port}/api/local-tts/status`);
        assert.equal(response.ok, true);
        const localTts = await response.json();
        assert.equal(localTts.status, 'ready');
        metrics.aivisHealthChecks += 1;
      }
      await exerciseSpeech(iteration);
      metrics.succeeded += 1;
    } catch (error) {
      metrics.failed += 1;
      console.error(`SOAK FAILURE: iteration=${iteration} master=${currentMaster} elapsedMs=${Date.now() - startedAt}`);
      console.error(serverOutput);
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
  assert.ok(metrics.aivisHealthChecks > 0);
  if (minutes >= 30) {
    assert.equal(metrics.reconnects, 3);
    assert.equal(metrics.adminReconnects, 1);
    assert.equal(metrics.offlineDetections, 1);
    assert.equal(metrics.requiredOfflineDetections, 2);
    assert.equal(metrics.masterReconnects, 1);
    assert.equal(metrics.masterChanges, 1);
    assert.ok(metrics.groupEvents > 0);
    assert.ok(metrics.cueEvents > 0);
    assert.ok(metrics.replayEvents > 0);
    assert.ok(metrics.stopEvents > 0);
    assert.ok(metrics.presentationEvents > 0); assert.ok(metrics.blackoutEvents > 0); assert.ok(metrics.localAudioEvents > 0);
    assert.ok(metrics.phaseAEvents > 0); assert.ok(metrics.unlockEvents > 0); assert.ok(metrics.emergencyEvents > 0);
    assert.ok(metrics.shutdownEvents > 0); assert.ok(metrics.recoveryEvents > 0); assert.ok(metrics.normalizationEvents > 0); assert.ok(metrics.stateCleanupChecks > 0);
    assert.ok(metrics.localTtsEvents > 0); assert.ok(metrics.scriptedWavEvents > 0);
  }
  assert.doesNotMatch(serverErrors, /Unhandled|uncaught/i);
  assert.ok(memoryGrowthBytes < 128 * 1024 * 1024, `RSS増加が128MiB未満: ${memoryGrowthBytes}`);
  const report = {
    result: 'PASS', minutes, startedAt: new Date(startedAt).toISOString(), endedAt: new Date().toISOString(),
    ...metrics,
    memoryStartBytes: initialHealth.memoryRssBytes,
    memoryEndBytes: finalHealth.memoryRssBytes,
    memoryGrowthBytes,
    abnormalExit: false,
  };
  if (reportPath) {
    const absoluteReportPath = path.resolve(reportPath);
    await mkdir(path.dirname(absoluteReportPath), { recursive: true });
    await writeFile(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  console.log(`SOAK PASS: ${minutes}分 / ${JSON.stringify(report)}`);
} finally {
  for (const timer of heartbeats.values()) clearInterval(timer);
  for (const client of displays.values()) await close(client);
  if (admin) await close(admin);
  server.kill('SIGTERM');
}
