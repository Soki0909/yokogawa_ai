import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('本番モードが主要Cue情報と安全操作を独立表示する', async () => {
  const [html, script, css] = await Promise.all([read('public/admin.html'), read('public/js/admin.js'), read('public/css/admin-phase3.css')]);
  for (const id of ['show-console', 'show-current-scene', 'show-current-cue', 'show-current-text', 'show-next-cue', 'show-next-text', 'show-next-button', 'show-back-button', 'show-replay-button', 'show-stop-button']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /class="[^"]*advanced-only/);
  assert.match(script, /actionLocked/);
  assert.match(script, /actionId:/);
  assert.match(css, /body\[data-mode=show\] \.advanced-only/);
  assert.match(css, /@media\(max-width:600px\)/);
  assert.doesNotMatch(css, /min-width:\s*[7-9]\d{2}px/);
});

test('本番前チェック・配信先セット・接続QRのUI契約を持つ', async () => {
  const [html, script] = await Promise.all([read('public/admin.html'), read('public/js/admin.js')]);
  for (const id of ['preflight-panel', 'preflight-result', 'preflight-list', 'audio-test-button', 'connection-list', 'group-list', 'group-dialog', 'group-display-options']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(script, /\/api\/qr\?url=/);
  assert.match(script, /target-group:save/);
  assert.match(script, /display:required/);
  assert.match(script, /source === 'test'/);
});

test('Display識別表示は一時表示で管理操作を露出しない', async () => {
  const [html, script, css] = await Promise.all([read('public/display.html'), read('public/js/display.js'), read('public/css/display-phase3.css')]);
  assert.match(html, /id="identify-overlay"[^>]*hidden/);
  assert.match(script, /event\.type === 'identify'/);
  assert.match(script, /identifyTimer/);
  assert.match(css, /\.identify-overlay\[hidden\]/);
  assert.doesNotMatch(html, /show-next-button|target-group:save|audio-master-select/);
});
