import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url));
const text = async (file) => (await read(file)).toString('utf8');

test('6 Preset用の共有Environment visual layerを字幕より背面に持つ', async () => {
  const html = await text('public/display.html');
  for (const layer of [
    'preset-environment', 'preset-grid', 'preset-core', 'ring-outer', 'ring-inner',
    'preset-sector', 'preset-scan', 'intrusion-one', 'preset-rupture', 'preset-repair',
  ]) assert.match(html, new RegExp(`class="[^"]*${layer}`));
  assert.ok(html.indexOf('class="preset-environment"') < html.indexOf('class="caption-shell"'));
  assert.doesNotMatch(html.match(/<div class="preset-environment"[\s\S]*?<\/div>\s*<aside/)?.[0] ?? '', /id="caption"/);
});

test('Presetは色だけでなくgeometry・scan・侵食・rupture・repairを分離する', async () => {
  const css = await text('public/css/display-phase42.css');
  for (const id of ['normal', 'warning', 'hijacked', 'hostile', 'shutdown', 'recovery']) {
    assert.match(css, new RegExp(`body\\[data-preset="${id}"\\]`));
  }
  assert.match(css, /data-preset="warning".*preset-sector/s);
  assert.match(css, /data-preset="hijacked".*preset-intrusion/s);
  assert.match(css, /data-preset="hostile".*preset-rupture/s);
  assert.match(css, /data-preset="recovery".*preset-repair/s);
  assert.match(css, /--preset-ring-opacity/);
  assert.match(css, /--preset-glitch-strength/);
});

test('SHUTDOWNとreducedMotionは主要animationを停止し静止画の状態差を残す', async () => {
  const css = await text('public/css/display-phase42.css');
  assert.match(css, /body\[data-preset="shutdown"\] \.preset-core,[\s\S]*animation: none !important/);
  assert.match(css, /body\[data-reduced-motion="true"\] \*/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /body\[data-preset="shutdown"\][\s\S]*--preset-ring-opacity: \.08/);
});

test('BLACKOUTはvisual layerと字幕より上位のまま維持する', async () => {
  const [phase4, phase42] = await Promise.all([
    text('public/css/display-phase4.css'), text('public/css/display-phase42.css'),
  ]);
  assert.match(phase4, /\.blackout \{ position:fixed; z-index:999;/);
  assert.match(phase42, /\.preset-environment[\s\S]*z-index: 0;/);
  assert.match(phase42, /\.caption-shell[\s\S]*z-index: 8 !important;/);
});

test('v0.4.1 Avatar元画像4点はbyte単位で不変', async () => {
  const expected = {
    'base.png': '3bfa2ef3f50d879d0c68011d5d88f3c93a9d090347e9a4371c09c6a9742ae57b',
    'mouth-half.png': 'e0c899ec001fc50ca1a07411a61963709bcd8568c99dad264ff8ea75452c94b8',
    'mouth-open.png': '713be72e51d1512f77ab18e5d406ea84dd1acab6c2016cdad7dd56d0d8e4bc30',
    'eyes-closed.png': 'f3f03fa5b268492724d6bb4754642380e475d931bc8bf87d1840f7cec574bf02',
  };
  for (const [file, hash] of Object.entries(expected)) {
    const bytes = await read(`public/assets/avatar/yokogawa/v1/${file}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
  }
});

test('Preset statusは既知6状態を表示し未知Presetを安全に扱う', async () => {
  const script = await text('public/js/display.js');
  for (const label of ['SECURITY ACTIVE', 'ANOMALY DETECTED', 'CONTROL OVERRIDDEN', 'CONTAINMENT FAILED', 'SYSTEM OFFLINE', 'SYNC RESTORING']) {
    assert.match(script, new RegExp(label));
  }
  assert.match(script, /\?\? 'CUSTOM PROFILE'/);
});

test('NORMALはPhase 4.2デザインイメージの舞台構図をコードで固定する', async () => {
  const [html, css] = await Promise.all([
    text('public/display.html'), text('public/css/display-phase42.css'),
  ]);
  assert.match(html, /class="system-brand">YOKOGAWA <b>AI<\/b>/);
  assert.match(html, /class="connection-row"[\s\S]*id="connection"/);
  assert.match(html, /system-rail-right" aria-label="Display status"/);
  assert.match(css, /reference composition — docs\/phase-4-2\/デザインイメージ\.png/);
  assert.match(css, /\.avatar-wrap,[\s\S]*width: min\(52vw, 680px\)/);
  assert.match(css, /\.orb \{[\s\S]*top: 64%/);
  assert.match(css, /\.system-rail \{[\s\S]*top: 22\.5%/);
  assert.match(css, /\.caption-shell \{[\s\S]*left: 3vw;[\s\S]*right: 3vw;[\s\S]*bottom: 7vh/);
  assert.match(css, /clip-path: polygon\(2\.4% 0, 97\.6% 0/);
  assert.match(css, /\.identity \.designation,[\s\S]*\.identity h1 \{ display: none; \}/);
});
