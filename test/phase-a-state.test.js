import test from 'node:test';
import assert from 'node:assert/strict';
import { StateStore } from '../src/state-store.js';

const memory = () => ({ async load() { return null; }, async save() {} });

test('target別演出state・Unlock進捗・再接続snapshot・STOPをserver authoritativeに扱う', async () => {
  let tick = 0; const store = new StateStore({ storage: memory(), now: () => new Date(1_900_000_000_000 + tick) }); await store.load();
  store.registerDisplay({ displayId: 'a' }); store.registerDisplay({ displayId: 'b' });
  const cue = store.saveCue({ cueId: 'unlock', cueName: 'Unlock', kind: 'display-only', displayText: '解除中', presentationPreset: 'warning', target: { type: 'display', id: 'a' }, audio: { speechMode: 'none' }, transition: { id: 'unlock-start', durationMs: 800 }, overlay: { id: 'unlocking', visible: true, title: 'UNLOCK' }, visual: { id: 'unlock-core', type: 'text-card', visible: true }, timing: { unlockDurationMs: 5000 }, syncMarkers: [{ department: 'LX', id: 'LX-100', note: 'start' }] });
  store.executeCue(cue.cueId); tick = 2500;
  assert.equal(Math.round(store.displaySnapshot('a').unlock.progress), 50);
  assert.equal(store.displaySnapshot('b').unlock.status, 'idle');
  assert.equal(JSON.stringify(store.displaySnapshot('a')).includes('LX-100'), false);
  store.stopPresentation({ type: 'display', id: 'a' });
  assert.equal(store.displaySnapshot('a').unlock.status, 'stopped');
  assert.equal(Math.round(store.displaySnapshot('a').unlock.progress), 50);
});

test('Cue jumpは位置だけを変え、execute時だけ演出を適用する', async () => {
  const store = new StateStore({ storage: memory() }); await store.load(); store.registerDisplay({ displayId: 'a' });
  const cue = store.saveCue({ cueId: 'jump-target', cueName: 'Jump', kind: 'display-only', displayText: '実行された', presentationPreset: 'hostile', target: { type: 'all' }, audio: { speechMode: 'none' }, overlay: { id: 'access-denied', visible: true } });
  store.jumpCue(cue.cueId); assert.equal(store.state.currentSubtitle, null); assert.equal(store.state.currentOverlay.visible, false);
  store.executeCue(cue.cueId); assert.equal(store.state.currentSubtitle, '実行された'); assert.equal(store.state.currentOverlay.id, 'access-denied');
});

test('OverlayとVisualの自動消去期限をsnapshotで確定する', async () => {
  let tick = 0; const store = new StateStore({ storage: memory(), now: () => new Date(1_900_100_000_000 + tick) }); await store.load(); store.registerDisplay({ displayId: 'a' });
  const cue = store.saveCue({ cueId: 'timed', cueName: 'Timed', kind: 'display-only', displayText: 'timed', target: { type: 'all' }, audio: { speechMode: 'none' }, overlay: { id: 'booting', visible: true }, visual: { id: 'card', type: 'text-card', visible: true }, timing: { autoClearOverlayMs: 500, autoHideVisualMs: 800 } });
  store.executeCue(cue.cueId); tick = 600; assert.equal(store.displaySnapshot('a').currentOverlay.visible, false); assert.equal(store.displaySnapshot('a').currentVisual.visible, true);
  tick = 900; assert.equal(store.displaySnapshot('a').currentVisual.visible, false);
});
