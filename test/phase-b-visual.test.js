import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('Phase B Visual tokenを一箇所に集約する', async () => {
  const css = await load('public/css/display-phase-b.css');
  for (const token of [
    'state-intensity', 'state-speed', 'glow-normal', 'glow-warning', 'glow-hijacked', 'glow-hostile',
    'warning-intensity', 'hijacked-intensity', 'hostile-intensity', 'warning-speed', 'hijacked-speed', 'hostile-speed',
    'anomaly-duration', 'takeover-duration', 'hostile-enter-duration', 'shutdown-duration', 'recovery-duration',
    'overlay-scale', 'overlay-opacity', 'grid-opacity', 'vignette-strength',
  ]) assert.match(css, new RegExp(`--phaseb-${token}:`));
});

test('Phase B環境geometryを既存layer内かつ字幕より背面へ置く', async () => {
  const html = await load('public/display.html');
  assert.match(html, /display-phase-b\.css/);
  for (const name of ['phaseb-depth', 'phaseb-axis', 'phaseb-orbit-a', 'phaseb-orbit-b', 'phaseb-frame-left', 'phaseb-frame-right', 'phaseb-pressure']) {
    assert.match(html, new RegExp(`class="[^"]*${name}`));
  }
  assert.ok(html.indexOf('phaseb-depth') < html.indexOf('class="caption-shell"'));
  assert.ok(html.indexOf('id="avatar-wrap"') < html.indexOf('id="avatar-foreground"'));
  assert.ok(html.indexOf('id="avatar-foreground"') < html.indexOf('id="scene-visual"'));
  assert.ok(html.indexOf('class="caption-shell"') < html.indexOf('id="operation-overlay"'));
  assert.ok(html.indexOf('id="operation-overlay"') < html.indexOf('id="transition-layer"'));
  assert.ok(html.indexOf('id="transition-layer"') < html.indexOf('id="blackout"'));
});

test('Avatar自身が6状態のsystem effectと人格非依存の差を持つ', async () => {
  const [html, script, css] = await Promise.all([load('public/display.html'), load('public/js/display.js'), load('public/css/display-phase-b.css')]);
  for (const name of ['avatar-system-effects', 'avatar-face-light', 'avatar-eye-left', 'avatar-eye-right', 'avatar-lens-reflection', 'avatar-sync-echo']) {
    assert.match(html, new RegExp(`class="[^"]*${name}`));
  }
  for (const id of ['normal', 'warning', 'hijacked', 'hostile', 'shutdown', 'recovery']) {
    assert.match(css, new RegExp(`data-preset="${id}"[\\s\\S]*avatar-`));
  }
  assert.match(css, /data-preset="hostile"[^\n]*avatar-wrap \.brow \{ transform: none !important/);
  assert.match(css, /data-preset="shutdown"[^\n]*avatar-system-effects \{ opacity: 0/);
  assert.match(script, /dataset\.systemState = systemState/);
});

test('Foreground interferenceはAvatar前面かつ字幕・Show layer・BLACKOUTより背面にある', async () => {
  const [html, phase4, css] = await Promise.all([load('public/display.html'), load('public/css/display-phase4.css'), load('public/css/display-phase-b.css')]);
  for (const name of ['foreground-scan', 'foreground-band-a', 'foreground-band-b', 'foreground-noise', 'foreground-rupture']) {
    assert.match(html, new RegExp(`class="[^"]*${name}`));
  }
  assert.match(css, /\.avatar-foreground \{[\s\S]*z-index: 4;/);
  assert.match(css, /data-preset="hijacked"[^\n]*foreground-band[\s\S]*phaseb-foreground-hijack-band/);
  assert.match(css, /data-preset="hostile"[^\n]*foreground-band[\s\S]*height: 7\.5%/);
  assert.match(css, /data-preset="shutdown"[^\n]*avatar-foreground \{ opacity: 0/);
  assert.match(css, /data-preset="recovery"[^\n]*avatar-foreground[\s\S]*phaseb-foreground-recovery/);
  assert.match(phase4, /\.blackout \{ position:fixed; z-index:999;/);
});

test('6状態を色以外のgeometryとmotionで差別化する', async () => {
  const css = await load('public/css/display-phase-b.css');
  assert.match(css, /data-preset="normal"[\s\S]*phaseb-state-speed: 22s/);
  assert.match(css, /data-preset="warning"[\s\S]*phaseb-warning-orbit/);
  assert.match(css, /data-preset="hijacked"[\s\S]*phaseb-axis[\s\S]*translateX\(2\.2vw\)/);
  assert.match(css, /data-preset="hostile"[\s\S]*phaseb-pressure[\s\S]*phaseb-pressure/);
  assert.match(css, /data-preset="shutdown"[\s\S]*phaseb-orbit[\s\S]*animation: none !important/);
  assert.match(css, /data-preset="recovery"[\s\S]*phaseb-recovery-lock/);
  for (const name of ['phaseb-warning-orbit', 'phaseb-hijack-orbit-a', 'phaseb-hostile-orbit', 'phaseb-recovery-lock']) assert.match(css, new RegExp(`@keyframes ${name}`));
});

test('Transitionは専用wrapperでtransform競合せず主要sequenceを分離する', async () => {
  const [html, css] = await Promise.all([load('public/display.html'), load('public/css/display-phase-b.css')]);
  for (const name of ['transition-flash', 'transition-core', 'transition-sweep', 'transition-fracture']) assert.match(html, new RegExp(`class="${name}"`));
  const transitions = {
    boot: 'phaseb-boot', anomaly: 'phaseb-anomaly', takeover: 'phaseb-takeover',
    'emergency-interrupt': 'phaseb-emergency', 'hostile-enter': 'phaseb-hostile-enter',
    shutdown: 'phaseb-shutdown', recovery: 'phaseb-recovery', normalize: 'phaseb-normalize',
  };
  for (const [id, animation] of Object.entries(transitions)) {
    assert.match(css, new RegExp(`data-transition="${id}"[\\s\\S]*${animation}`));
  }
});

test('reconnect時はTransition経過時間を負delayへ反映し先頭から再生しない', async () => {
  const [script, css] = await Promise.all([load('public/js/display.js'), load('public/css/display-phase-b.css')]);
  assert.match(script, /--phaseb-transition-delay/);
  assert.match(script, /-Math\.min\(elapsed, Number\(transition\.durationMs\)/);
  assert.match(css, /animation-delay: var\(--phaseb-transition-delay, 0ms\)/);
});

test('OverlayとScene Visualは遠距離表示・Final主役・cleanup hookを持つ', async () => {
  const [script, css] = await Promise.all([load('public/js/display.js'), load('public/css/display-phase-b.css')]);
  for (const overlay of ['access-denied', 'authentication-success', 'emergency-protection', 'connection-failed', 'forced-runaway', 'system-shutdown', 'restoring']) {
    assert.match(css, new RegExp(`data-overlay="${overlay}"`));
  }
  assert.match(css, /data-visual="final-challenge"[\s\S]*scene-visual h2/);
  assert.match(css, /data-overlay="final-challenge"[\s\S]*place-items: start center/);
  assert.match(script, /document\.body\.dataset\.visual = visible \? visual\.type : 'none'/);
  assert.match(script, /document\.body\.dataset\.visual = 'none'/);
  assert.match(script, /document\.body\.dataset\.overlay = 'none'; elements\['unlock-gauges'\]\.hidden = true/);
});

test('Unlock Gaugeは3系統のradial進捗と完了・中断状態を表現する', async () => {
  const [script, css] = await Promise.all([load('public/js/display.js'), load('public/css/display-phase-b.css')]);
  assert.match(css, /conic-gradient\(var\(--phase-accent\) calc\(var\(--gauge-progress, 0\) \* 1%\)/);
  assert.match(script, /gauge\.style\.setProperty\('--gauge-progress'/);
  assert.match(script, /meter\.dataset\.progress/);
  assert.match(css, /operation-progress\[data-status="completed"\]/);
  assert.match(css, /operation-progress\[data-status="aborted"\]/);
  assert.match(script, /\['aborted', 'stopped'\]\.includes\(unlock\.status\)/);
  assert.doesNotMatch(script, /'connection-failed'\]\.includes\(elements\['operation-overlay'\]/);
  assert.match(css, /data-unlock-status="aborted"[\s\S]*repeating-conic-gradient/);
});

test('SHUTDOWN・reduced motion・BLACKOUT・viewportの安全契約を保つ', async () => {
  const [base, phase4, phaseB] = await Promise.all([
    load('public/css/display.css'), load('public/css/display-phase4.css'), load('public/css/display-phase-b.css'),
  ]);
  assert.match(base, /html,body\{height:100%;overflow:hidden\}/);
  assert.match(phase4, /\.blackout \{ position:fixed; z-index:999;/);
  assert.match(phaseB, /data-preset="shutdown"[\s\S]*animation: none !important/);
  assert.match(phaseB, /data-preset="shutdown"[^\n]*transition-layer[\s\S]*animation-play-state: running !important/);
  assert.match(phaseB, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(phaseB, /data-reduced-motion="true"[\s\S]*animation: none !important/);
  assert.match(phaseB, /@media \(max-width: 900px\)/);
  assert.match(phaseB, /@media \(max-height: 650px\)/);
});
