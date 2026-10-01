import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('DisplayはPreset・Avatar・Scene Visual・Subtitle・Operation Overlay・Blackoutを独立した層で持つ', async () => {
  const [html, css] = await Promise.all([load('public/display.html'), load('public/css/display-phase-a.css')]);
  for (const id of ['scene-visual', 'operation-overlay', 'transition-layer', 'unlock-gauges', 'blackout']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /display-phase-a\.css/);
  assert.match(css, /\.scene-visual[\s\S]*z-index:\s*22/);
  assert.match(css, /\.operation-overlay[\s\S]*z-index:\s*35/);
  assert.match(css, /\.transition-layer[\s\S]*z-index:\s*42/);
  assert.match(css, /\.unlock-gauges\[hidden\]\s*\{\s*display:\s*none/);
});

test('Display clientはtransition・overlay・visual・unlockをsnapshotとイベント双方から描画する', async () => {
  const script = await load('public/js/display.js');
  for (const name of ['renderTransition', 'renderOverlay', 'renderVisual', 'renderUnlock']) assert.match(script, new RegExp(`function ${name}\\(`));
  for (const field of ['currentTransition', 'currentOverlay', 'currentVisual', 'unlock']) assert.match(script, new RegExp(`event\\.state\\.${field}`));
  assert.match(script, /requestAnimationFrame\(draw\)/);
  assert.match(script, /cancelAnimationFrame\(unlockFrame\)/);
  assert.match(script, /relevantOverlay/);
});
