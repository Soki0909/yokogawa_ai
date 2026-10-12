import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('DisplayはPreset・Avatar・Scene Visual・Subtitle・Operation Overlay・Blackoutを独立した層で持つ', async () => {
  const [html, css] = await Promise.all([load('public/display.html'), load('public/css/display-phase-a.css')]);
  for (const id of ['scene-visual', 'scene-visual-image', 'operation-overlay', 'transition-layer', 'unlock-gauges', 'blackout']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /display-phase-a\.css/);
  assert.match(css, /\.scene-visual[\s\S]*z-index:\s*22/);
  assert.match(css, /\.operation-overlay[\s\S]*z-index:\s*35/);
  assert.match(css, /\.transition-layer[\s\S]*z-index:\s*42/);
  assert.match(css, /\.unlock-gauges\[hidden\]\s*\{\s*display:\s*none/);
});

test('長いOperation Overlay見出しを1920x1080でもframe内へ収める', async () => {
  const css = await readFile('public/css/display-phase-a.css', 'utf8');
  assert.match(css, /operation-overlay-frame[^}]*width: min\(82rem, 88vw\)/);
  assert.match(css, /operation-overlay h2[^}]*clamp\(1\.7rem, 3\.5vw, 3\.4rem\)/);
  assert.match(css, /operation-overlay h2[^}]*overflow-wrap: anywhere/);
});

test('Display clientはtransition・overlay・visual・unlockをsnapshotとイベント双方から描画する', async () => {
  const script = await load('public/js/display.js');
  for (const name of ['renderTransition', 'renderOverlay', 'renderVisual', 'renderUnlock']) assert.match(script, new RegExp(`function ${name}\\(`));
  for (const field of ['currentTransition', 'currentOverlay', 'currentVisual', 'unlock']) assert.match(script, new RegExp(`event\\.state\\.${field}`));
  assert.match(script, /requestAnimationFrame\(draw\)/);
  assert.match(script, /cancelAnimationFrame\(unlockFrame\)/);
  assert.match(script, /relevantOverlay/);
  assert.match(script, /Date\.parse\(overlay\.expiresAt\) - Date\.now\(\)/);
  assert.match(script, /Date\.parse\(visual\.expiresAt\) - Date\.now\(\)/);
  assert.match(script, /\/api\/assets\/\$\{encodeURIComponent\(visual\.assetId\)\}/);
});

test('長いproduction字幕を文字数別に縮小して固定枠のclippingを防ぐ', async () => {
  const [script, css] = await Promise.all([
    load('public/js/display.js'),
    load('public/css/display-phase42.css'),
  ]);
  assert.match(script, /dataset\.length = fullText\.length > 100 \? 'extra-long'/);
  for (const size of ['medium', 'long', 'extra-long']) assert.match(css, new RegExp(`caption\\[data-length="${size}"\\]`));
});
