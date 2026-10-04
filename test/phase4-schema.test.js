import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PRESETS, CUE_KINDS, isSafeAssetPath, normalizeCue, validateShowFile } from '../src/show-schema.js';

const showFile = () => ({
  schemaVersion: 2, metadata: { title: 'test' }, routes: [{ id: 'main', name: 'Main' }],
  scenes: [{ sceneId: 's1', sceneName: 'Scene', order: 0 }], groups: [],
  presets: structuredClone(DEFAULT_PRESETS), assets: [{ id: 'tone', name: 'Tone', path: 'assets/audio/tone.wav', mimeType: 'audio/wav' }],
  avatar: { visible: true, state: 'normal' }, settings: {},
  cues: [{ id: 'c1', name: 'Cue', scene: 's1', kind: 'speech-display', speechText: '話す', displayText: '表示', presentationPreset: 'normal', target: { type: 'all' }, audio: { speechMode: 'browser', lipSyncMode: 'simulated' } }],
});

test('旧CueをSchema v3へ後方互換移行する', () => {
  const cue = normalizeCue({ cueId: 'legacy', cueName: '旧Cue', text: '旧本文', sceneId: 's1' }, 3);
  assert.equal(cue.schemaVersion, 3); assert.equal(cue.id, 'legacy'); assert.equal(cue.cueId, 'legacy');
  assert.equal(cue.speechText, '旧本文'); assert.equal(cue.displayText, '旧本文'); assert.equal(cue.kind, 'speech-display');
  assert.equal(validateShowFile(showFile()).valid, true);
});

test('speech/display本文とroute/scene/locationを独立保持する', () => {
  const cue = normalizeCue({ id: 'split', name: 'Split', route: 'route-b', scene: 'scene-b', location: '7号館', speechText: '話す内容', displayText: '表示する内容' });
  assert.equal(cue.speechText, '話す内容'); assert.equal(cue.displayText, '表示する内容'); assert.equal(cue.route, 'route-b'); assert.equal(cue.scene, 'scene-b'); assert.equal(cue.location, '7号館');
});

test('全6 Cue種別と6標準Presetを提供する', () => {
  assert.deepEqual(CUE_KINDS, ['speech-display', 'speech-only', 'display-only', 'clear', 'blackout', 'preset-only']);
  assert.deepEqual(DEFAULT_PRESETS.map((item) => item.id), ['normal', 'warning', 'hijacked', 'hostile', 'shutdown', 'recovery']);
});

test('Show Fileをdry-run検証し不正参照を原子的に拒否する', () => {
  assert.equal(validateShowFile(showFile()).valid, true);
  const invalid = showFile(); invalid.cues[0].presentationPreset = 'missing'; invalid.assets[0].path = '../secret.mp3';
  invalid.cues[0].kind = 'unknown-kind'; invalid.cues[0].avatar = { state: 'invalid-avatar' };
  const result = validateShowFile(invalid); assert.equal(result.valid, false);
  assert.ok(result.errors.includes('CUE_PRESET_NOT_FOUND:c1')); assert.ok(result.errors.includes('UNSAFE_ASSET_PATH:tone'));
  assert.ok(result.errors.includes('INVALID_CUE_KIND:c1')); assert.ok(result.errors.includes('INVALID_AVATAR_STATE:c1'));
});

test('音声playback effectは既知profileだけを許可する', () => {
  const valid = showFile(); valid.cues[0].audio.playbackEffect = 'hijacked-subtle-v1';
  assert.equal(validateShowFile(valid).valid, true);
  const invalid = showFile(); invalid.cues[0].audio.playbackEffect = 'villain-random';
  assert.deepEqual(validateShowFile(invalid).errors, [`INVALID_PLAYBACK_EFFECT:${invalid.cues[0].id}`]);
});

test('音声Asset pathはローカルaudio配下のwav/mp3だけを許可する', () => {
  assert.equal(isSafeAssetPath('assets/audio/cue-01.wav'), true); assert.equal(isSafeAssetPath('assets/audio/cue.mp3'), true);
  for (const unsafe of ['../secret.wav', '/etc/passwd', 'C:\\secret.wav', 'assets/audio/../../secret.mp3', 'assets/video/a.wav']) assert.equal(isSafeAssetPath(unsafe), false);
});
