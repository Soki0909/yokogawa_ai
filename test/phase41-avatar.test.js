import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { AVATAR_ASSET_SETS, DEFAULT_AVATAR, DEFAULT_PRESETS, normalizeAvatar, validateShowFile } from '../src/show-schema.js';
import { BLINK_PROFILES, BlinkController, randomBlinkTiming } from '../public/js/blink-controller.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('横川AI v1の4画像を意味あるIDとローカルpathで登録する', async () => {
  const assets = AVATAR_ASSET_SETS['yokogawa-v1'];
  assert.deepEqual(Object.keys(assets), ['base', 'mouthHalf', 'mouthOpen', 'eyesClosed']);
  assert.equal(new Set(Object.values(assets).map(({ id }) => id)).size, 4);
  for (const asset of Object.values(assets)) {
    assert.match(asset.path, /^assets\/avatar\/yokogawa\/v1\/.+\.png$/);
    await access(path.join(root, 'public', asset.path));
  }
  assert.equal(DEFAULT_AVATAR.mode, 'image-yokogawa-v1');
  assert.equal(DEFAULT_AVATAR.assetSetId, 'yokogawa-v1');
});

test('Displayは固定base上に局所口差分と局所まばたき差分を独立配置する', async () => {
  const html = await readFile(path.join(root, 'public/display.html'), 'utf8');
  const css = await readFile(path.join(root, 'public/css/display-phase4.css'), 'utf8');
  assert.match(html, /class="avatar-image avatar-base"/);
  assert.match(html, /class="avatar-image avatar-mouth avatar-mouth-half"/);
  assert.match(html, /class="avatar-image avatar-mouth avatar-mouth-open"/);
  assert.match(html, /class="avatar-image avatar-eyes-closed"/);
  assert.match(css, /avatar-mouth-half,.avatar-mouth-open \{ clip-path:/);
  assert.match(css, /avatar-eyes-closed \{ clip-path:/);
  assert.match(css, /data-mouth="half".*avatar-mouth-half/);
  assert.match(css, /data-blink="closed".*avatar-eyes-closed/);
});

test('Avatar modeは旧Show File互換を保ち不明なmodeとasset setを拒否する', () => {
  const base = { schemaVersion: 2, scenes: [], cues: [], presets: DEFAULT_PRESETS, assets: [] };
  assert.equal(validateShowFile({ ...base, avatar: { visible: true } }).valid, true);
  assert.deepEqual(validateShowFile({ ...base, avatar: { mode: 'unknown' } }).errors, ['INVALID_AVATAR_MODE']);
  assert.deepEqual(validateShowFile({ ...base, avatar: { assetSetId: 'missing' } }).errors, ['AVATAR_ASSET_SET_NOT_FOUND']);
  assert.deepEqual(normalizeAvatar({ mode: 'unknown', assetSetId: 'missing' }), DEFAULT_AVATAR);
});

test('まばたきは3〜6秒間隔・100〜180ms表示時間の範囲に収まる', () => {
  assert.deepEqual(randomBlinkTiming(() => 0), { delayMs: 3000, durationMs: 100 });
  assert.deepEqual(randomBlinkTiming(() => 1), { delayMs: 6000, durationMs: 180 });
});

test('まばたき中も口状態を変更せず次回を予約する', () => {
  const element = { dataset: { mouth: 'open' } };
  const pending = [];
  const controller = new BlinkController(element, {
    random: () => 0,
    setTimer: (callback, delay) => { const timer = { callback, delay }; pending.push(timer); return timer; },
    clearTimer: () => {},
  });
  controller.start();
  assert.equal(pending.shift().delay, 3000);
  controller.blink();
  assert.equal(element.dataset.blink, 'closed');
  assert.equal(element.dataset.mouth, 'open');
  const close = pending.shift();
  assert.equal(close.delay, 100);
  close.callback();
  assert.equal(element.dataset.blink, 'open');
  assert.equal(element.dataset.mouth, 'open');
  assert.equal(pending.shift().delay, 3000);
});

test('shutdownは目を閉じてまばたきを停止しrecoveryで再開する', () => {
  const element = { dataset: {} };
  const pending = [];
  const controller = new BlinkController(element, {
    random: () => .5,
    setTimer: (callback, delay) => { const timer = { callback, delay }; pending.push(timer); return timer; },
    clearTimer: () => {},
  });
  controller.update({ state: 'normal' });
  assert.equal(controller.running, true);
  controller.update({ state: 'shutdown' });
  assert.equal(controller.running, false);
  assert.equal(element.dataset.blink, 'closed');
  controller.update({ state: 'recovery' });
  assert.equal(controller.running, true);
  assert.equal(element.dataset.blink, 'open');
});

test('6状態のblink profileは異常度を表情変更なしの時間差で示す', () => {
  assert.ok(BLINK_PROFILES.warning.maxDelayMs < BLINK_PROFILES.normal.maxDelayMs);
  assert.ok(BLINK_PROFILES.hijacked.minDelayMs < BLINK_PROFILES.warning.minDelayMs);
  assert.ok(BLINK_PROFILES.hostile.minDelayMs > BLINK_PROFILES.normal.maxDelayMs);
  assert.ok(BLINK_PROFILES.recovery.minDelayMs > BLINK_PROFILES.warning.minDelayMs);
  const element = { dataset: {} };
  const pending = [];
  const controller = new BlinkController(element, {
    random: () => 0,
    setTimer: (callback, delay) => { const timer = { callback, delay }; pending.push(timer); return timer; },
    clearTimer: () => {},
  });
  controller.update({ state: 'warning' });
  assert.equal(element.dataset.blinkProfile, 'warning');
  assert.equal(pending.at(-1).delay, BLINK_PROFILES.warning.minDelayMs);
  controller.update({ state: 'hostile' });
  assert.equal(element.dataset.blinkProfile, 'hostile');
  assert.equal(pending.at(-1).delay, BLINK_PROFILES.hostile.minDelayMs);
});

test('6 Presetは同じ画像AvatarへCSS effectとして適用される', async () => {
  assert.deepEqual(DEFAULT_PRESETS.map(({ id }) => id), ['normal', 'warning', 'hijacked', 'hostile', 'shutdown', 'recovery']);
  const css = await readFile(path.join(root, 'public/css/display-phase4.css'), 'utf8');
  for (const id of ['warning', 'hijacked', 'hostile', 'shutdown', 'recovery']) assert.match(css, new RegExp(`data-preset="${id}"`));
});
