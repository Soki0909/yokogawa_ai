import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('AdminはCurrent/Next演出詳細・Cue jump・Phase A編集フィールドを持つ', async () => {
  const [html, script] = await Promise.all([load('public/admin.html'), load('public/js/admin.js')]);
  for (const id of ['show-current-detail', 'show-next-detail', 'cue-transition', 'cue-overlay', 'cue-visual-type', 'cue-visual-asset', 'cue-unlock-duration', 'cue-sync-markers']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(script, /data-action="jump"/); assert.match(script, /performAction\('cue:jump'/);
  assert.match(script, /function cueDetail\(/); assert.match(script, /syncMarkers/);
  assert.match(script, /transition:/); assert.match(script, /overlay:/); assert.match(script, /visual:/); assert.match(script, /timing:/);
});

test('演出またはLocal TTS生成中は音声がなくてもSTOPを有効にする', async () => {
  const script = await load('public/js/admin.js');
  assert.match(script, /presentationActive/);
  assert.match(script, /currentTransition\?\.status === 'active'/);
  assert.match(script, /unlock\?\.status === 'running'/);
  assert.match(script, /localTts\?\.activity === 'synthesizing'/);
  assert.match(script, /!localTtsActive/);
});
