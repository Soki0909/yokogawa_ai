import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StateStore } from '../src/state-store.js';

const silentLogger = { info() {}, error() {} };

test('発話を順番にキュー処理し、停止後も次へ進める', () => {
  const store = new StateStore({ logger: silentLogger });
  const first = store.createMessage('最初の発話');
  const second = store.createMessage('次の発話');
  assert.equal(store.enqueue(first).queued, false);
  assert.equal(store.enqueue(second).queued, true);
  assert.equal(store.state.queue.length, 1);
  store.reportPlayback(first.id, 'speaking');
  const result = store.reportPlayback(first.id, 'stopped');
  assert.equal(result.next.id, second.id);
  assert.equal(store.state.currentMessage.id, second.id);
  assert.equal(store.state.history.find((item) => item.id === first.id).status, 'stopped');
});

test('空文字と5000文字超過を拒否する', () => {
  const store = new StateStore({ logger: silentLogger });
  assert.throws(() => store.createMessage('  '), /EMPTY_TEXT/);
  assert.throws(() => store.createMessage('あ'.repeat(5001)), /TEXT_TOO_LONG/);
  assert.equal(store.createMessage('日本語 English 123 !?').text, '日本語 English 123 !?');
});

test('投影切断時は再生中とキューを安全にエラー終了する', () => {
  const store = new StateStore({ logger: silentLogger });
  store.connectDisplay();
  store.setDisplayAudioReady(true);
  const first = store.createMessage('再生中');
  const second = store.createMessage('待機中');
  store.enqueue(first); store.enqueue(second);
  store.disconnectDisplay();
  assert.equal(store.state.displayConnectionStatus, 'disconnected');
  assert.equal(store.state.displayAudioReady, false);
  assert.equal(store.state.currentMessage, null);
  assert.equal(store.state.queue.length, 0);
  assert.equal(store.state.history[0].status, 'error');
  assert.equal(store.state.history[1].status, 'error');
});

test('設定と履歴をローカルファイルへ保存・復元する', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yokogawa-state-'));
  const stateFile = path.join(directory, 'state.json');
  const store = new StateStore({ stateFile, logger: silentLogger });
  store.setSettings({ rate: 9, volume: -1, subtitlesEnabled: false, historyLimit: 20 });
  store.createMessage('保存される履歴');
  await store.persist();
  const raw = JSON.parse(await readFile(stateFile, 'utf8'));
  assert.equal(raw.settings.rate, 2);
  assert.equal(raw.settings.volume, 0);
  const restored = new StateStore({ stateFile, logger: silentLogger });
  await restored.load();
  assert.equal(restored.state.settings.subtitlesEnabled, false);
  assert.equal(restored.state.history[0].text, '保存される履歴');
});
