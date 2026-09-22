import test from 'node:test';
import assert from 'node:assert/strict';
import { StateStore } from '../src/state-store.js';

const memory = (initial = null) => ({ value: initial, async load() { return this.value; }, async save(value) { this.value = structuredClone(value); } });

test('6種Cueが発話有無と表示状態を正しく分離する', async () => {
  const store = new StateStore({ storage: memory() }); await store.load(); store.registerDisplay({ displayId: 'd1' });
  const add = (cueId, kind, extra = {}) => store.saveCue({ cueId, cueName: cueId, cueNumber: cueId, kind, sceneId: 'scene-opening', presentationPreset: 'warning', target: { type: 'all' }, speechText: '音声', displayText: '字幕', audio: { speechMode: kind.includes('speech') ? 'browser' : 'none', lipSyncMode: 'simulated' }, ...extra });
  assert.ok(store.executeCue(add('sd', 'speech-display').cueId).message);
  assert.ok(store.executeCue(add('so', 'speech-only').cueId).message);
  assert.equal(store.executeCue(add('do', 'display-only').cueId).message, null);
  assert.equal(store.state.currentSubtitle, '字幕');
  assert.equal(store.executeCue(add('clear', 'clear', { speechText: '', displayText: '' }).cueId).message, null); assert.equal(store.state.currentSubtitle, null);
  assert.equal(store.executeCue(add('preset', 'preset-only', { speechText: '', displayText: '' }).cueId).message, null); assert.equal(store.state.currentPresetId, 'warning');
  assert.equal(store.executeCue(add('black', 'blackout', { speechText: '', displayText: '' }).cueId).message, null); assert.equal(store.state.blackout, true);
  store.clearBlackout(); assert.equal(store.state.blackout, false);
});

test('Display snapshotから運用メモ・履歴・他Display情報を除外する', async () => {
  const store = new StateStore({ storage: memory() }); await store.load(); store.registerDisplay({ displayId: 'd1' });
  const cue = store.saveCue({ cueId: 'secret-cue', cueName: 'Secret', kind: 'display-only', displayText: '公開字幕', operatorNote: '役者だけのメモ', triggerNote: '秘密トリガー', target: { type: 'all' } }); store.executeCue(cue.cueId);
  const snapshot = store.displaySnapshot('d1'); const serialized = JSON.stringify(snapshot);
  assert.equal(snapshot.currentSubtitle, '公開字幕'); assert.doesNotMatch(serialized, /役者だけ|秘密トリガー/);
  for (const key of ['rehearsalLog', 'history', 'displays']) assert.equal(key in snapshot, false);
});

test('Show File exportはruntimeを含まずimport失敗時は状態を変更しない', async () => {
  const store = new StateStore({ storage: memory() }); await store.load(); const exported = store.exportShowFile();
  for (const key of ['displays', 'history', 'currentMessage', 'rehearsalLog', 'audioMasterId']) assert.equal(key in exported, false);
  const before = JSON.stringify(store.state.cues); const invalid = structuredClone(exported); invalid.cues[0].presentationPreset = 'missing';
  const rejected = store.importShowFile(invalid, { apply: true }); assert.equal(rejected.valid, false); assert.equal(JSON.stringify(store.state.cues), before);
  const accepted = store.importShowFile(exported, { apply: true }); assert.equal(accepted.applied, true);
});

test('Preset CRUD・Rehearsal経過ログ・拡張Preflightを管理する', async () => {
  let tick = 0; const now = () => new Date(1_800_000_000_000 + tick);
  const store = new StateStore({ storage: memory(), now }); await store.load();
  store.savePreset({ id: 'custom', name: 'Custom', background: '#112233', accent: '#445566', text: '#ffffff' }); assert.equal(store.getPreset('custom').name, 'Custom'); store.deletePreset('custom'); assert.equal(store.getPreset('custom').id, 'normal');
  store.startRehearsal(); tick = 1250; store.logRehearsal('clear', 'CLEAR'); store.stopRehearsal(); assert.equal(store.state.rehearsalLog[1].elapsedMs, 1250);
  const ids = store.preflight().items.map((item) => item.id); for (const id of ['show-schema', 'presets', 'avatar', 'audio-assets']) assert.ok(ids.includes(id));
});
