import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { StateStore } from '../src/state-store.js';

const loadProduction = async () => JSON.parse(await readFile('shows/production.json', 'utf8'));
const memory = () => ({ value: null, async load() { return this.value; }, async save(value) { this.value = structuredClone(value); } });
const projection = (state) => ({
  currentSubtitle: state.currentSubtitle, displayMode: state.displayMode, currentPresetId: state.currentPresetId,
  currentAvatar: state.currentAvatar, blackout: state.blackout, previousVisualState: state.previousVisualState,
  currentOverlay: state.currentOverlay, currentVisual: state.currentVisual,
  currentTransition: { ...state.currentTransition, startedAt: null, completedAt: null },
  unlock: { ...state.unlock, startedAt: null, completedAt: null },
});
const readyStore = async ({ storage = memory(), now } = {}) => {
  const store = new StateStore({ storage, ...(now ? { now } : {}) });
  await store.load();
  store.importShowFile(await loadProduction(), { apply: true });
  store.registerDisplay({ displayId: 'display-201', displayName: '7・201', audioEnabled: true });
  store.setAudioMaster('display-201'); store.setDisplayAudioReady('display-201', true); store.startRehearsal();
  return store;
};

test('Production Scene metadataは最新台本のScene 1〜7を順番通り表現する', async () => {
  const production = await loadProduction();
  assert.deepEqual(production.scenes.map(({ sceneId, order, scriptTabId }) => [sceneId, order, scriptTabId]), [
    ['scene-1', 1, 't.tyup3idqskfk'], ['scene-2', 2, 't.7im6uhbfkk6m'], ['scene-3', 3, 't.vl6lnjb0yh3q'],
    ['scene-4', 4, 't.e7k2svyhnomc'], ['scene-5', 5, 't.qexxsordbvdd'], ['scene-6', 6, 't.lquo4bdx2m2q'],
    ['scene-7', 7, 't.6gopn4tnzuo'],
  ]);
  assert.notEqual(production.cues.find((cue) => cue.id === 'prod-010').enabled, false, '現行台本Scene 5の館内放送を通常Cueに含める');
  assert.equal(production.cues.find((cue) => cue.id === 'prod-017').enabled, false, '現行台本にない調整済みWAVは保全したまま隔離する');
  assert.match(production.metadata.sceneStructureSource.revisionId, /^ANLCKQn2/);
});

test('Scene Startは稽古セッション外ではfail-closedする', async () => {
  const store = new StateStore({ storage: memory() }); await store.load();
  store.importShowFile(await loadProduction(), { apply: true });
  assert.throws(() => store.startSceneRehearsal('scene-1'), /REHEARSAL_NOT_ACTIVE/);
  assert.equal(store.state.currentSceneId, null);
});

test('Scene 1 Startは真のShow Reset境界へ戻しCueも音声も実行しない', async () => {
  const store = await readyStore();
  const first = store.createMessage('再生中'); const queued = store.createMessage('待機中');
  store.enqueue(first); store.enqueue(queued); store.reportPlayback(first.id, 'speaking');
  const historyLength = store.state.history.length; const logLength = store.state.rehearsalLog.length;
  const result = store.startSceneRehearsal('scene-1'); const snapshot = store.snapshot();
  assert.equal(result.nextCueId, 'prod-001'); assert.equal(snapshot.currentCue, null); assert.equal(snapshot.nextCue.cueId, 'prod-001');
  assert.equal(snapshot.currentAvatar.visible, false); assert.equal(snapshot.currentPresetId, 'normal'); assert.equal(snapshot.currentSubtitle, null);
  assert.equal(store.state.currentMessage, null); assert.deepEqual(store.state.queue, []); assert.equal(store.state.playbackStatus, 'idle');
  assert.equal(store.state.audioMasterId, 'display-201'); assert.equal(store.state.displayAudioReady, true);
  assert.equal(store.state.displays[0].online, true); assert.equal(store.state.displays[0].displayName, '7・201');
  assert.equal(store.state.history.length, historyLength); assert.ok(store.state.history.every((item) => item.status === 'stopped'));
  assert.equal(store.state.rehearsalLog.length, logLength + 1); assert.equal(store.state.rehearsalLog.at(-1).type, 'scene-rehearsal-start');
});

test('AI CueなしSceneは同じ開始stateを復元し他Scene CueをNEXTへ漏らさない', async () => {
  const store = await readyStore();
  const baseline = [];
  for (const sceneId of ['scene-2', 'scene-3', 'scene-4']) {
    store.startSceneRehearsal(sceneId); const snapshot = store.snapshot();
    baseline.push(projection(snapshot));
    assert.equal(snapshot.sceneRehearsal.sceneId, sceneId); assert.equal(snapshot.currentCue, null); assert.equal(snapshot.nextCue, null);
    assert.equal(snapshot.currentPresetId, 'hijacked'); assert.equal(snapshot.currentSubtitle, '第一の謎は、この201にあります');
    assert.throws(() => store.nextCue(), /NO_SCENE_CUE/); assert.throws(() => store.replayCue(), /NO_CURRENT_CUE/);
  }
  assert.deepEqual(baseline[0], baseline[1]); assert.deepEqual(baseline[1], baseline[2]);
});

test('同一Scene反復とA→B→C→Aでstate driftが発生しない', async () => {
  const store = await readyStore();
  store.startSceneRehearsal('scene-2'); const sceneA = projection(store.snapshot());
  for (let index = 0; index < 5; index += 1) { store.startSceneRehearsal('scene-2'); assert.deepEqual(projection(store.snapshot()), sceneA); }
  store.startSceneRehearsal('scene-6');
  assert.equal(store.snapshot().nextCue.cueId, 'prod-011'); assert.equal(store.snapshot().currentPresetId, 'warning');
  store.startSceneRehearsal('scene-7');
  assert.equal(store.snapshot().nextCue.cueId, 'prod-v-recovery'); assert.equal(store.snapshot().currentPresetId, 'shutdown');
  store.startSceneRehearsal('scene-2'); assert.deepEqual(projection(store.snapshot()), sceneA);
});

test('reconstructionは通常Cue state progressionのScene境界projectionと一致する', async () => {
  let clock = Date.parse('2026-10-05T00:00:00.000Z');
  const reference = await readyStore({ now: () => new Date(clock) });
  const production = await loadProduction();
  for (const cue of production.cues.filter((item) => item.enabled !== false && item.scene === 'scene-1')) reference.executeCue(cue.id);
  clock += 700_000; reference.settleTimedPresentation();
  const expected = projection(reference.snapshot());
  const reconstructed = await readyStore(); reconstructed.startSceneRehearsal('scene-2');
  assert.deepEqual(projection(reconstructed.snapshot()), expected);
});

test('Scene Start stateはDisplay reload相当snapshotとserver再起動後に副作用なく復元される', async () => {
  const storage = memory(); const store = await readyStore({ storage });
  store.startSceneRehearsal('scene-7'); await store.persist();
  const displayProjection = projection(store.displaySnapshot('display-201'));
  const stateProjection = projection(store.snapshot());
  delete displayProjection.previousVisualState; delete stateProjection.previousVisualState;
  assert.deepEqual(displayProjection, stateProjection);
  const restored = new StateStore({ storage }); await restored.load();
  const snapshot = restored.snapshot();
  assert.equal(snapshot.sceneRehearsal.sceneId, 'scene-7'); assert.equal(snapshot.nextCue.cueId, 'prod-v-recovery');
  assert.equal(snapshot.currentPresetId, 'shutdown'); assert.equal(snapshot.currentMessage, null); assert.deepEqual(snapshot.queue, []);
  assert.notEqual(snapshot.currentTransition.status, 'active'); assert.notEqual(snapshot.unlock.status, 'running');
});
