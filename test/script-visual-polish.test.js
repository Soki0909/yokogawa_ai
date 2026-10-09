import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { StateStore } from '../src/state-store.js';
import { CueScheduler } from '../src/cue-scheduler.js';

async function setup() {
  let clock = Date.parse('2026-10-09T00:00:00Z');
  const storage = { value: null, async load() { return this.value; }, async save(v) { this.value = structuredClone(v); } };
  const store = new StateStore({ storage, now: () => new Date(clock) });
  const show = JSON.parse(await readFile('shows/production.json', 'utf8'));
  store.importShowFile(show, { apply: true }); store.registerDisplay({ displayId: 'stage' }); store.startRehearsal();
  return { store, storage, show, advance(ms) { clock += ms; return store.snapshot(); } };
}

test('Scene 1/2/6/7 reconstruction clears live speech and persisted reload subtitle', async () => {
  const { store, storage } = await setup();
  for (const sceneId of ['scene-1', 'scene-2', 'scene-6', 'scene-7']) {
    const { message } = store.executeCue('prod-004'); store.enqueue(message); store.applyDisplayState(message);
    assert.ok(store.state.currentSubtitle);
    store.startSceneRehearsal(sceneId); await store.persist();
    assert.equal(store.displaySnapshot('stage').currentSubtitle, null);
    assert.equal(store.state.currentMessage, null);
    const restored = new StateStore({ storage }); await restored.load();
    assert.equal(restored.displaySnapshot('stage').currentSubtitle, null);
    assert.notEqual(restored.state.currentTransition.status, 'active');
    if (sceneId === 'scene-7') assert.equal(restored.state.currentPresetId, 'shutdown');
  }
});

test('P-V02 and P-V06 are canonical single NEXT Cues using unchanged 009/016 assets', async () => {
  const { store, show } = await setup();
  assert.ok(!show.cues.some(c => ['prod-009', 'prod-016'].includes(c.id)));
  for (const [previous, merged, asset, following] of [
    ['prod-008', 'prod-v-riddle-enter', 'prod-voice-009-first-riddle', 'prod-010'],
    ['prod-v-emergency-riddle', 'prod-v-stop-code', 'prod-voice-016-shutdown', 'prod-v-recovery'],
  ]) {
    store.jumpCue(previous); const result = store.nextCue();
    assert.equal(result.cue.cueId, merged); assert.equal(result.message.audio.assetId, asset);
    assert.ok(result.cue.timing.speechDelayMs >= 1900);
    assert.equal(result.action.currentSubtitle, null);
    assert.equal(store.snapshot().nextCue.cueId, following);
    const replay = store.replayCue(); assert.equal(replay.cue.cueId, merged);
    assert.notEqual(replay.message.id, result.message.id);
  }
});

test('Hijack transition removes old subtitle and settles in HACK', async () => {
  const { store, advance } = await setup(); store.executeCue('prod-004');
  store.executeCue('prod-v-incident'); assert.equal(store.state.currentSubtitle, null);
  assert.equal(advance(2400).currentPresetId, 'hijacked');
  assert.equal(store.state.currentTransition.status, 'completed');
});

test('Five solved modules integrate before final problem; STOP freezes phase', async () => {
  const { store, advance } = await setup(); store.executeCue('prod-011');
  assert.equal(store.state.currentVisual.mode, 'five-complete');
  assert.equal(store.state.currentVisual.items.length, 5);
  assert.equal(advance(2000).currentVisual.mode, 'integration');
  assert.equal(advance(2200).currentVisual.type, 'final-challenge');
  store.executeCue('prod-011'); advance(1000); store.stopPresentation();
  assert.equal(advance(5000).currentVisual.mode, 'five-complete');
});

test('Authentication has no percentage; unlock completes then removes gauges for anomaly', async () => {
  const { store, advance } = await setup(); store.executeCue('prod-012');
  assert.equal(store.state.currentOverlay.progress, null); assert.equal(store.state.unlock.status, 'idle');
  store.executeCue('prod-v-unlock'); assert.equal(advance(5000).unlock.progress, 100);
  assert.equal(store.state.currentOverlay.variant, 'default');
  assert.equal(advance(900).currentOverlay.variant, 'collapse');
  assert.equal(advance(900).currentOverlay.variant, 'anomaly');
  assert.equal(store.state.currentOverlay.progress, null);
  assert.equal(advance(20000).currentOverlay.variant, 'anomaly');
});

test('Emergency and contact failure share P-014 grammar and clear unlock UI', async () => {
  const { store } = await setup(); store.executeCue('prod-v-unlock'); store.executeCue('prod-013');
  assert.equal(store.state.currentOverlay.id, 'connection-failed');
  assert.equal(store.state.unlock.status, 'aborted');
  store.executeCue('prod-014'); assert.equal(store.state.currentOverlay.id, 'connection-failed');
});

test('P-V07 reaches 100%, clears transient UI and persists complete NORMAL snapshot', async () => {
  const { store, storage, advance } = await setup(); store.startSceneRehearsal('scene-7');
  assert.equal(store.state.currentPresetId, 'shutdown'); store.nextCue();
  assert.equal(advance(3800).currentOverlay.progress, 100);
  const final = advance(2200); assert.equal(final.currentOverlay.visible, false);
  assert.equal(final.currentPresetId, 'normal'); assert.equal(final.currentAvatar.state, 'normal');
  assert.equal(final.currentTransition.status, 'completed'); assert.equal(final.currentSubtitle, null);
  await store.persist(); const restored = new StateStore({ storage }); await restored.load();
  assert.equal(restored.displaySnapshot('stage').currentPresetId, 'normal');
});

test('Scheduler cancellation rejects already queued callbacks and replay fires once', () => {
  const callbacks = []; const cleared = []; const fired = [];
  const scheduler = new CueScheduler({ setTimer: cb => { callbacks.push(cb); return callbacks.length; }, clearTimer: id => cleared.push(id) });
  scheduler.onCancel = () => fired.push('cancelled');
  scheduler.schedule(1900, () => fired.push('stale')); scheduler.cancel();
  scheduler.schedule(1900, () => fired.push('replay'));
  callbacks.forEach(cb => cb()); assert.deepEqual(fired, ['cancelled', 'replay']);
  assert.deepEqual(cleared, [1]); assert.equal(scheduler.timers.size, 0);
});
