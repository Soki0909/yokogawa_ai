import test from 'node:test';
import assert from 'node:assert/strict';
import { StateStore } from '../src/state-store.js';

const memoryStorage = (initial = null) => {
  let value = structuredClone(initial);
  return {
    load: async () => structuredClone(value),
    save: async (next) => { value = structuredClone(next); },
    value: () => structuredClone(value),
  };
};

test('Phase 2 stateをrequired既定値と空の配信先セットで移行する', async () => {
  const storage = memoryStorage({
    settings: { rate: 1 },
    displays: [{ displayId: 'legacy-main', displayName: 'Legacy Main', audioEnabled: true }],
    cues: [{ cueId: 'legacy-cue', cueNumber: '001', cueName: 'Legacy', text: '旧Cue', target: { type: 'display', id: 'legacy-main' }, enabled: true, order: 0 }],
    scenes: [{ sceneId: 'legacy-scene', sceneName: 'Legacy Scene', order: 0 }],
    history: [], audioMasterId: 'legacy-main',
  });
  const store = new StateStore({ storage });
  await store.load();

  assert.equal(store.state.displays[0].required, false);
  assert.deepEqual(store.state.targetGroups, []);
  assert.equal(store.state.adminMode, 'show');
  assert.deepEqual(store.state.cues[0].target, { type: 'display', id: 'legacy-main' });
});

test('PreflightがREADY・任意Offline警告・必須Offlineエラーを判定する', () => {
  const store = new StateStore({ storage: memoryStorage() });
  const required = store.connectDisplay({ displayId: 'display-201', displayName: '201', audioEnabled: true });
  store.setDisplayRequired(required.displayId, true);
  store.connectDisplay({ displayId: 'display-hall', displayName: 'Hall', audioEnabled: false });
  store.setDisplayAudioReady(required.displayId, true);
  assert.equal(store.preflight().status, 'ready');
  assert.equal(store.preflight().canStart, true);

  store.markOffline('display-hall');
  assert.equal(store.preflight().status, 'warning');
  assert.equal(store.preflight().items.find((item) => item.id === 'display:display-hall').status, 'warning');

  store.markOffline('display-201');
  assert.equal(store.preflight().status, 'not-ready');
  assert.equal(store.preflight().canStart, false);
  assert.equal(store.preflight().items.find((item) => item.id === 'display:display-201').status, 'error');
});

test('Audio Ready falseを接続状態と分けて警告する', () => {
  const store = new StateStore({ storage: memoryStorage() });
  store.connectDisplay({ displayId: 'display-201', displayName: '201', audioEnabled: true });
  const audio = store.preflight().items.find((item) => item.id === 'audio-ready');
  assert.equal(audio.status, 'warning');
  assert.equal(audio.detail, '音声未有効');
});

test('PreflightがCueなし・Audio Masterなし・Master Offlineを開始不可にする', () => {
  const noMaster = new StateStore({ storage: memoryStorage() });
  assert.equal(noMaster.preflight().items.find((item) => item.id === 'audio-master').status, 'error');
  assert.equal(noMaster.preflight().canStart, false);

  const noCues = new StateStore({ storage: memoryStorage() });
  noCues.connectDisplay({ displayId: 'display-201', displayName: '201', audioEnabled: true });
  noCues.setDisplayAudioReady('display-201', true);
  noCues.state.cues = [];
  assert.equal(noCues.preflight().items.find((item) => item.id === 'cues').status, 'error');
  assert.equal(noCues.preflight().canStart, false);

  const masterOffline = new StateStore({ storage: memoryStorage() });
  masterOffline.connectDisplay({ displayId: 'display-201', displayName: '201', audioEnabled: true });
  masterOffline.markOffline('display-201');
  const audioMaster = masterOffline.preflight().items.find((item) => item.id === 'audio-master');
  assert.equal(audioMaster.status, 'error');
  assert.match(audioMaster.detail, /OFFLINE/);
  assert.equal(masterOffline.preflight().canStart, false);
});

test('配信先セットを作成・編集・削除しDisplay IDで参照する', () => {
  const store = new StateStore({ storage: memoryStorage() });
  store.connectDisplay({ displayId: 'display-a', displayName: '201' });
  store.connectDisplay({ displayId: 'display-b', displayName: '2階' });
  store.connectDisplay({ displayId: 'display-c', displayName: '3階' });
  const group = store.saveTargetGroup({ id: 'main-floor2', name: '201 + 2階', displayIds: ['display-a', 'display-b'], notes: '主系統' });
  assert.deepEqual(group.displayIds, ['display-a', 'display-b']);
  assert.equal(store.matchesTarget(store.getDisplay('display-a'), { type: 'group', id: group.id }), true);
  assert.equal(store.matchesTarget(store.getDisplay('display-c'), { type: 'group', id: group.id }), false);

  store.registerDisplay({ displayId: 'display-a', displayName: '201 Main' });
  assert.equal(store.matchesTarget(store.getDisplay('display-a'), { type: 'group', id: group.id }), true, '名称変更後もID参照を維持');
  store.saveTargetGroup({ ...group, name: 'Main + Floor 2', displayIds: ['display-a'] });
  assert.equal(store.getTargetGroup(group.id).name, 'Main + Floor 2');

  store.markOffline('display-a');
  store.deleteDisplay('display-a');
  assert.deepEqual(store.getTargetGroup(group.id).displayIds, [], 'Display削除時に参照を除去');
  store.deleteTargetGroup(group.id);
  assert.equal(store.getTargetGroup(group.id), undefined);
});

test('Cueから使用中の配信先セット削除を安全にブロックする', () => {
  const store = new StateStore({ storage: memoryStorage() });
  store.connectDisplay({ displayId: 'display-a', displayName: '201' });
  store.saveTargetGroup({ id: 'main', name: 'Main', displayIds: ['display-a'] });
  store.saveCue({ ...store.state.cues[0], target: { type: 'group', id: 'main' } });
  assert.throws(() => store.deleteTargetGroup('main'), /GROUP_IN_USE/);
});

test('本番モード切替はCue位置を変更しない', () => {
  const store = new StateStore({ storage: memoryStorage() });
  store.executeCue('cue-002');
  const cueIndex = store.state.currentCueIndex;
  store.setAdminMode('advanced');
  assert.equal(store.state.adminMode, 'advanced');
  assert.equal(store.state.currentCueIndex, cueIndex);
});
