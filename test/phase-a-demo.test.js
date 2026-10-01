import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateShowFile } from '../src/show-schema.js';

const show = JSON.parse(await readFile(new URL('../shows/phase-a-demo.json', import.meta.url), 'utf8'));

test('Phase A demo ShowはSchema v3準拠の27 Cueを順序通り提供する', () => {
  const result = validateShowFile(show); assert.equal(result.valid, true, result.errors.join(', '));
  assert.equal(show.cues.length, 27); assert.equal(show.cues[0].id, 'pa-001'); assert.equal(show.cues.at(-1).id, 'pa-027');
  assert.equal(show.cues.at(-1).enabled, false);
  assert.equal(show.cues.find((cue) => cue.id === 'pa-012').speechText, 'すべての条件が満たされました。五つの答えを携え、ただちに201へ集合しなさい');
});

test('Phase A demoは主要状態をoperator-controlledな独立Cueとして網羅する', () => {
  const transitions = new Set(show.cues.map((cue) => cue.transition?.id).filter(Boolean));
  const overlays = new Set(show.cues.map((cue) => cue.overlay?.id).filter(Boolean));
  for (const id of ['boot', 'anomaly', 'takeover', 'riddle-enter', 'final-challenge-enter', 'auth-success', 'unlock-start', 'emergency-interrupt', 'hostile-enter', 'shutdown', 'recovery', 'normalize']) assert.ok(transitions.has(id), id);
  for (const id of ['communication-locked', 'access-denied', 'riddle-active', 'all-conditions-met', 'final-challenge', 'authenticating', 'authentication-success', 'unlocking', 'emergency-protection', 'unlock-aborted', 'connection-failed', 'forced-runaway', 'system-shutdown', 'restoring']) assert.ok(overlays.has(id), id);
  const unlock = show.cues.find((cue) => cue.transition?.id === 'unlock-start'); assert.equal(unlock.timing.unlockDurationMs, 5000);
  assert.ok(show.cues.findIndex((cue) => cue.id === 'pa-017') < show.cues.findIndex((cue) => cue.id === 'pa-018'));
  assert.ok(show.cues.findIndex((cue) => cue.id === 'pa-023') < show.cues.findIndex((cue) => cue.id === 'pa-025'));
});
