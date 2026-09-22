import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LipSyncStateMachine } from '../public/js/lip-sync.js';
import { LocalAudioProvider } from '../public/js/tts-adapter.js';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('低ポリゴンAvatar・Blackout・Phase4操作UIをローカル配信する', async () => {
  const [display, admin, script] = await Promise.all([read('public/display.html'), read('public/admin.html'), read('public/js/admin.js')]);
  for (const token of ['id="avatar-wrap"', '<svg', 'id="blackout"']) assert.match(display, new RegExp(token));
  for (const id of ['show-clear-button', 'show-blackout-button', 'show-file-input', 'rehearsal-toggle', 'cue-kind', 'cue-preset', 'cue-operator-note']) assert.match(admin, new RegExp(`id="${id}"`));
  assert.match(script, /event\.repeat/); assert.match(script, /contenteditable=true/); assert.match(script, /\/api\/show-file\/validate/);
});

test('Lip Syncは平滑化・閾値差・最小holdでチャタリングを抑える', () => {
  const machine = new LipSyncStateMachine({ holdMs: 100 });
  assert.equal(machine.update(.5, 0), 'closed'); assert.equal(machine.update(.5, 120), 'open');
  assert.equal(machine.update(.13, 150), 'open'); assert.equal(machine.update(0, 260), 'open');
  for (let now = 380; now <= 1100; now += 120) machine.update(0, now);
  assert.equal(machine.state, 'half'); for (let now = 1220; now <= 2000; now += 120) machine.update(0, now);
  assert.equal(machine.state, 'closed'); assert.equal(machine.reset(), 'closed');
});

test('ローカル音声Providerが再生・停止を同じ境界で通知する', async () => {
  const calls = []; class AudioMock { play() { this.onplay(); return Promise.resolve(); } pause() { calls.push('pause'); } set currentTime(value) { calls.push(value); } }
  const provider = new LocalAudioProvider({ onStart: (id) => calls.push(`start:${id}`), onStop: (id) => calls.push(`stop:${id}`) }, AudioMock);
  provider.speak({ id: 'm1', audio: { assetId: 'tone' } }); provider.stop();
  assert.deepEqual(calls, ['start:m1', 'pause', 0, 'stop:m1']);
});
