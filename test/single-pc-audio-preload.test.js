import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { productionAudioPreloadManifest } from '../src/local-audio.js';
import { loadProductionAudioManifest, preloadProductionAudioAssets, prepareProductionAudio } from '../public/js/audio-preload.js';

test('Production audio manifestは固定WAVだけを安全なURLへ公開する', () => {
  const assets = [
    { id: 'prod-voice-002-b', path: 'assets/audio/b.wav', mimeType: 'audio/wav', sha256: 'b' },
    { id: 'test-tone', path: 'assets/audio/test.wav', mimeType: 'audio/wav' },
    { id: 'prod-voice-001-a', path: 'assets/audio/a.wav', mimeType: 'audio/wav', sha256: 'a' },
    { id: 'prod-voice-003-c', path: '../outside.wav', mimeType: 'audio/wav' },
  ];
  assert.deepEqual(productionAudioPreloadManifest(assets), [
    { id: 'prod-voice-001-a', url: '/api/assets/prod-voice-001-a', sha256: 'a' },
    { id: 'prod-voice-002-b', url: '/api/assets/prod-voice-002-b', sha256: 'b' },
  ]);
});

test('Production audio preloadはmanifestをno-store、WAVをforce-cacheで取得する', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push([url, options.cache]);
    if (url === '/api/audio-assets') return {
      ok: true,
      json: async () => ({ assets: [{ id: '001', url: '/api/assets/001' }, { id: '002', url: '/api/assets/002' }] }),
    };
    return { ok: true, arrayBuffer: async () => new Uint8Array(64).buffer };
  };
  const assets = await loadProductionAudioManifest(fetchImpl);
  const result = await preloadProductionAudioAssets(assets, { fetchImpl, concurrency: 4 });
  assert.deepEqual(result, { ready: 2, total: 2 });
  assert.deepEqual(calls, [
    ['/api/audio-assets', 'no-store'],
    ['/api/assets/001', 'force-cache'],
    ['/api/assets/002', 'force-cache'],
  ]);
});

test('Production audio preloadの同時fetchは指定concurrencyを超えない', async () => {
  const assets = Array.from({ length: 9 }, (_, index) => ({ id: String(index), url: `/audio/${index}.wav` }));
  let active = 0;
  let maxActive = 0;
  const fetchImpl = async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    return {
      ok: true,
      arrayBuffer: async () => {
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return new Uint8Array(64).buffer;
      },
    };
  };
  const progress = [];
  const result = await preloadProductionAudioAssets(assets, {
    fetchImpl,
    concurrency: 4,
    onProgress: ({ ready }) => progress.push(ready),
  });
  assert.equal(maxActive, 4);
  assert.deepEqual(result, { ready: 9, total: 9 });
  assert.equal(progress.at(-1), 9);
});

test('Production audio prepareは18本未満をAudio Ready相当にしない', async () => {
  await assert.rejects(
    () => prepareProductionAudio({
      assets: Array.from({ length: 17 }, (_, index) => ({ id: String(index), url: `/audio/${index}.wav` })),
      fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new Uint8Array(64).buffer }),
    }),
    /expected 18, got 17/,
  );
});

test('Single-PC launcherはServerをloopbackだけへbindする', async () => {
  const command = await readFile('start-yokogawa-ai-single-pc.cmd', 'utf8');
  assert.match(command, /HOST=127\.0\.0\.1/);
  assert.match(command, /npm start/);
  const server = await readFile('src/server.js', 'utf8');
  assert.match(server, /singlePcMode/);
  assert.match(server, /runtimeConnectionInfo/);
  assert.match(server, /\/api\/audio-assets/);
});
