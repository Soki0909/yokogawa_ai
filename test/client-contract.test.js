import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ブラウザClientが同一ホストWS・永続Display ID・Heartbeat・Audio Master境界を持つ', async () => {
  const socket = await readFile('public/js/socket-client.js', 'utf8');
  const display = await readFile('public/js/display.js', 'utf8');
  const admin = await readFile('public/admin.html', 'utf8');
  assert.match(socket, /location\.protocol === 'https:' \? 'wss:' : 'ws:'/);
  assert.match(socket, /location\.host/);
  assert.doesNotMatch(socket, /localhost/);
  assert.match(socket, /heartbeatMs/);
  assert.match(display, /localStorage/);
  assert.match(display, /shouldSpeak/);
  assert.match(display, /createSpeechProvider\('browser'/);
  for (const control of ['next-button', 'back-button', 'cue-replay-button', 'target-select', 'audio-master-select', 'reset-button', 'cue-dialog']) {
    assert.match(admin, new RegExp(`id=["']${control}["']`));
  }
});
