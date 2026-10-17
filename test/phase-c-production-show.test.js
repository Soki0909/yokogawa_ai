import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateShowFile } from '../src/show-schema.js';
import { StateStore } from '../src/state-store.js';

const load = async (name) => JSON.parse(await readFile(`shows/${name}`, 'utf8'));

test('Production Showは最新17 speech・3 SFX・3 puzzle slotsを登録する', async () => {
  const [main, route, manifest] = await Promise.all([
    load('production.json'), load('production-yokogawa-route.json'),
    readFile('config/production-speech/yokogawa-ai-v2.json', 'utf8').then(JSON.parse),
  ]);
  assert.equal(validateShowFile(main).valid, true);
  assert.equal(validateShowFile(route).valid, true);
  assert.equal(main.assets.length, 25);
  assert.equal(route.assets.length, 23);
  const speech = [...main.cues, ...route.cues].filter((cue) => cue.kind.startsWith('speech'));
  assert.equal(speech.length, 18);
  assert.equal(speech.filter((cue) => cue.audio.speechMode === 'audio-file').length, 18);
  assert.equal(speech.filter((cue) => cue.audio.speechMode === 'browser').length, 0);
  assert.deepEqual(speech.map((cue) => cue.displayText).sort(), [...manifest.speeches.map((item) => item.displayText),main.cues.find(c=>c.id==='prod-021').displayText].sort());
  assert.equal(main.settings.freeSpeakMode, 'local-tts');
  assert.equal(route.metadata.description.includes('UNRESOLVED ROUTE MAPPING'), true);
});

test('Production Showは台本alignment順序・外部同期境界・未確定Cue隔離を固定する', async () => {
  const main = await load('production.json');
  const ids = main.cues.map((cue) => cue.id);
  assert.deepEqual(ids, [
    'prod-v-prelude', 'prod-001', 'prod-002', 'prod-003', 'prod-004',
    'prod-005', 'prod-006', 'prod-007', 'prod-008', 'prod-019', 'prod-v-riddle-enter',
    'prod-v-riddle-close', 'prod-011', 'prod-012', 'prod-013', 'prod-014',
    'prod-v-hostile-enter', 'prod-015', 'prod-v-emergency-riddle', 'prod-v-stop-code',
    'prod-v-recovery', 'prod-020', 'prod-v-curtain-black', 'prod-021',
  ]);
  assert.equal(main.avatar.visible, false);
  assert.equal(main.cues.find((cue) => cue.id === 'prod-001').transition.id, 'boot');
  assert.equal(main.cues.find((cue) => cue.id === 'prod-005').transition.id, 'takeover');
  assert.equal(ids.includes('prod-v-hijack'), false);
  assert.equal(main.cues.find((cue) => cue.id === 'prod-v-hostile-enter').order < main.cues.find((cue) => cue.id === 'prod-015').order, true);
  assert.equal(main.cues.find((cue) => cue.id === 'prod-v-stop-code').audio.assetId, 'prod-voice-016-shutdown');
  assert.equal(main.cues.some(cue => ['prod-010', 'prod-017', 'prod-018'].includes(cue.id)), false);
  assert.match(main.cues.find((cue) => cue.id === 'prod-v-emergency-riddle').visual.message, /未提供/);
  assert.ok(main.cues.flatMap((cue) => cue.syncMarkers ?? []).every((marker) => marker.id.startsWith('ALIGN-')));
});

test('HIJACKED voice effectはWAV005〜009だけへ適用しraw Assetを維持する', async () => {
  const main = await load('production.json');
  const speech = new Map(main.cues.filter((cue) => /^prod-\d{3}$/.test(cue.id)).map((cue) => [cue.id, cue]));
  speech.set('prod-009', main.cues.find((cue) => cue.id === 'prod-v-riddle-enter'));
  speech.set('prod-016', main.cues.find((cue) => cue.id === 'prod-v-stop-code'));
  for (const id of ['005', '006', '007', '008', '009']) {
    const cue = speech.get(`prod-${id}`);
    assert.equal(cue.audio.playbackEffect, 'hijacked-subtle-v1');
    assert.equal(cue.audio.assetId, `prod-voice-${id}-${({ '005': 'communication-lock', '006': 'reject', '007': 'auth-failed', '008': 'five-riddles', '009': 'first-riddle' })[id]}`);
  }
  for (const id of ['001', '002', '003', '004', '011', '012', '013', '014', '015', '016', '019']) {
    assert.equal(speech.get(`prod-${id}`).audio.playbackEffect ?? 'none', 'none');
  }
});

test('Production import/resetは非BLACKOUTのSTANDBYへ戻りPhase Aの初期Avatarを変えない', async () => {
  const memory = { async load() { return null; }, async save() {} };
  const store = new StateStore({ storage: memory }); await store.load();
  const production = await load('production.json');
  assert.equal(store.importShowFile(production, { apply: true }).applied, true);
  assert.equal(store.state.currentAvatar.visible, false);
  assert.equal(store.state.blackout, false);
  store.executeCue('prod-001'); assert.equal(store.state.currentAvatar.visible, true);
  store.showReset(); assert.equal(store.state.currentAvatar.visible, false);
  const phaseA = await load('phase-a-demo.json');
  assert.equal(store.importShowFile(phaseA, { apply: true }).applied, true);
  assert.equal(store.state.currentAvatar.visible, true);
});

test('AivisSpeech停止中でも固定WAV運用を開始でき、Local TTS Cueがある場合は開始を止める', async () => {
  const memory = { async load() { return null; }, async save() {} };
  const store = new StateStore({ storage: memory }); await store.load();
  store.importShowFile(await load('production.json'), { apply: true });
  const display = store.connectDisplay({ displayId: 'display-201', displayName: '7・201', audioEnabled: true });
  store.setAudioMaster(display.displayId);
  store.setDisplayAudioReady(display.displayId, true);
  store.setLocalTtsStatus({ status: 'error', profileId: 'yokogawa-professor-v1', error: 'AIVIS_UNREACHABLE' });

  const fixedWavPreflight = store.preflight();
  assert.equal(fixedWavPreflight.canStart, true);
  assert.equal(fixedWavPreflight.items.find((item) => item.id === 'local-tts').status, 'warning');

  store.state.cues[0].audio.speechMode = 'local-tts';
  const localTtsCuePreflight = store.preflight();
  assert.equal(localTtsCuePreflight.canStart, false);
  assert.equal(localTtsCuePreflight.items.find((item) => item.id === 'local-tts').status, 'error');
});

test('途中参加の新規Displayも現在字幕とPresentation stateを初回接続で同期する', async () => {
  const memory = { async load() { return null; }, async save() {} };
  const store = new StateStore({ storage: memory }); await store.load();
  const production = await load('production.json'); store.importShowFile(production, { apply: true });
  store.executeCue('prod-v-riddle-enter');
  const display = store.registerDisplay({ displayId: 'late-display', displayName: 'Late Display' });
  assert.equal(display.currentSubtitle, null, 'Actual voice/subtitle timeline has not started; no whole-line flash');
  assert.equal(display.currentPresetId, 'hijacked');
  assert.equal(display.currentOverlay.id, 'none');
  assert.equal(display.currentVisual.id, 'none');
});

test('server再起動後も現在字幕とCue位置を復元し途中参加Displayへ同期する', async () => {
  const persisted = { value: null, async load() { return this.value; }, async save(value) { this.value = structuredClone(value); } };
  const first = new StateStore({ storage: persisted }); await first.load();
  const production = await load('production.json'); first.importShowFile(production, { apply: true });
  first.executeCue('prod-v-riddle-enter'); await first.persist();
  const restored = new StateStore({ storage: persisted }); await restored.load();
  assert.equal(restored.state.currentSubtitle, null, 'A never-started speech must not be restored as a subtitle');
  assert.equal(restored.snapshot().currentCue.cueId, 'prod-v-riddle-enter');
  const display = restored.registerDisplay({ displayId: 'post-restart-display' });
  assert.equal(display.currentSubtitle, null);
});
