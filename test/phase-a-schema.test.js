import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRESETS, OVERLAY_IDS, SHOW_SCHEMA_VERSION, TRANSITION_IDS, VISUAL_TYPES,
  normalizeCue, validateShowFile,
} from '../src/show-schema.js';

const v2Show = () => ({
  schemaVersion: 2, metadata: { title: 'v2 show' }, routes: [{ id: 'main', name: 'Main' }],
  scenes: [{ sceneId: 'main', sceneName: 'Main', order: 0 }], groups: [],
  presets: structuredClone(DEFAULT_PRESETS), assets: [], settings: {}, avatar: {},
  cues: [{ id: 'legacy', name: 'Legacy', scene: 'main', kind: 'display-only', displayText: 'legacy', presentationPreset: 'normal', target: { type: 'all' }, audio: { speechMode: 'none' } }],
});

test('Schema v2 Showを検証しoptional Phase Aフィールド付きv3 Cueへ移行する', () => {
  const result = validateShowFile(v2Show());
  assert.equal(result.valid, true);
  assert.equal(result.normalized.cues[0].schemaVersion, SHOW_SCHEMA_VERSION);
  assert.equal(result.normalized.cues[0].transition.id, 'none');
  assert.equal(result.normalized.cues[0].overlay.visible, false);
  assert.equal(result.normalized.cues[0].visual.type, 'none');
  assert.deepEqual(result.normalized.cues[0].syncMarkers, []);
});

test('Phase A ID集合・期間・同期マーカーを正規化し未知IDを拒否する', () => {
  assert.equal(TRANSITION_IDS.length, 13); assert.equal(OVERLAY_IDS.length, 17);
  assert.deepEqual(VISUAL_TYPES, ['none', 'text-card', 'image', 'final-challenge', 'riddle-status']);
  const cue = normalizeCue({ id: 'phase-a', transition: { id: 'unlock-start', durationMs: 1200, intensity: 4 }, overlay: { id: 'unlocking', visible: true, progress: 130 }, visual: { id: 'challenge', type: 'final-challenge', visible: true }, timing: { unlockDurationMs: 100 }, syncMarkers: [{ department: 'LX', id: 'LX-001', note: 'GO' }] });
  assert.equal(cue.transition.durationMs, 1200); assert.equal(cue.transition.intensity, 1);
  assert.equal(cue.overlay.progress, 100); assert.equal(cue.timing.unlockDurationMs, 3000);
  assert.deepEqual(cue.syncMarkers, [{ department: 'LX', id: 'LX-001', note: 'GO' }]);
  const invalid = v2Show(); invalid.schemaVersion = 3; invalid.cues[0].transition = { id: 'unknown' };
  invalid.cues[0].overlay = { id: 'unknown' }; invalid.cues[0].visual = { type: 'video' };
  const checked = validateShowFile(invalid); assert.equal(checked.valid, false);
  assert.ok(checked.errors.includes('INVALID_TRANSITION:legacy'));
  assert.ok(checked.errors.includes('INVALID_OVERLAY:legacy'));
  assert.ok(checked.errors.includes('INVALID_VISUAL_TYPE:legacy'));
});
