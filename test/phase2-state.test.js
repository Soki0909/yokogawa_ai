import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StateStore } from '../src/state-store.js';

const logger = { info() {}, error() {} };

test('Cue進行・編集・並び替え・Scene・Free Speak・Resetを一貫して管理する', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yokogawa-phase2-state-'));
  const stateFile = path.join(directory, 'state.json');
  const store = new StateStore({ stateFile, logger });
  store.registerDisplay({ displayId: 'display-a', displayName: 'Main', audioEnabled: true });
  store.setAudioMaster('display-a');
  store.setDisplayAudioReady('display-a', true);

  const first = store.nextCue();
  assert.equal(first.cue.cueId, 'cue-001');
  store.enqueue(first.message);
  store.reportPlayback(first.message.id, 'completed');
  const second = store.nextCue();
  assert.equal(second.cue.cueId, 'cue-002');
  store.enqueue(second.message);
  store.reportPlayback(second.message.id, 'completed');

  const historyBeforeFree = store.state.history.length;
  const free = store.createMessage('即興対応', { source: 'free', target: { type: 'display', id: 'display-a' } });
  store.enqueue(free); store.reportPlayback(free.id, 'completed');
  assert.equal(store.snapshot().currentCue.cueId, 'cue-002', 'Free SpeakはCue位置を変えない');
  assert.equal(store.state.history.length, historyBeforeFree + 1);
  assert.equal(store.state.history[0].source, 'free');

  store.backCue();
  assert.equal(store.snapshot().currentCue.cueId, 'cue-001');
  assert.equal(store.state.history.length, historyBeforeFree + 1, 'BACKは発話しない');
  const replay = store.replayCue();
  assert.equal(replay.message.source, 'cue');
  assert.equal(replay.message.cueId, 'cue-001');

  const cue = store.saveCue({ cueNumber: '007', cueName: '追加Cue', text: '追加本文', sceneId: 'scene-incident', target: { type: 'all' }, enabled: false });
  assert.equal(cue.enabled, false);
  store.saveCue({ ...cue, cueName: '編集済み', text: '編集本文', enabled: true });
  const order = store.orderedCues().map((item) => item.cueId);
  store.reorderCues([cue.cueId, ...order.filter((id) => id !== cue.cueId)]);
  assert.equal(store.orderedCues()[0].cueName, '編集済み');
  store.jumpScene('scene-incident');
  assert.equal(store.state.currentSceneId, 'scene-incident');

  store.applyDisplayState(store.createMessage('Reset前字幕', { target: { type: 'all' } }));
  store.showReset();
  assert.equal(store.state.currentCueIndex, -1);
  assert.equal(store.state.currentSubtitle, null);
  assert.equal(store.state.queue.length, 0);
  assert.ok(store.state.cues.some((item) => item.cueId === cue.cueId));
  assert.ok(store.getDisplay('display-a'));
  await store.persist();

  const restored = new StateStore({ stateFile, logger });
  await restored.load();
  assert.equal(restored.state.cues[0].cueId, cue.cueId);
  assert.equal(restored.state.displays[0].displayId, 'display-a');
  assert.equal(restored.state.displays[0].online, false);
});

test('Display識別・Groupを含むtarget・Audio Masterを管理する', () => {
  const store = new StateStore({ logger });
  const a = store.registerDisplay({ displayId: 'a', displayName: 'A', groups: ['MAIN'], audioEnabled: true });
  const b = store.registerDisplay({ displayId: 'b', displayName: 'B', groups: ['UPSTAIRS'], audioEnabled: false });
  store.setAudioMaster('a'); store.setDisplayAudioReady('a', true);
  assert.equal(store.state.displayAudioReady, true);
  assert.equal(store.matchesTarget(a, { type: 'all' }), true);
  assert.equal(store.matchesTarget(b, { type: 'display', id: 'a' }), false);
  assert.equal(store.matchesTarget(b, { type: 'group', id: 'UPSTAIRS' }), true);
  store.disconnectDisplay('b');
  assert.equal(store.getDisplay('a').online, true);
  assert.equal(store.getDisplay('b').online, false);
});
