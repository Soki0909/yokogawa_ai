import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeAudioCache } from '../src/tts/runtime-audio-cache.js';
import { LocalTtsService } from '../src/tts/local-tts-service.js';
import { loadProductionVoiceProfile } from '../src/voice-profile.js';

const profile = await loadProductionVoiceProfile();

test('RuntimeAudioCacheはTTL・件数・byte上限を守る', () => {
  let now = 0;
  const cache = new RuntimeAudioCache({ maxEntries: 2, maxBytes: 6, ttlMs: 100, now: () => now });
  const first = cache.put(Buffer.from('aa'));
  cache.put(Buffer.from('bbb'));
  cache.put(Buffer.from('cc'));
  assert.equal(cache.get(first.id), null, '最古entryをevictする');
  assert.equal(cache.stats().entries, 2);
  now = 101;
  assert.equal(cache.stats().entries, 0);
  assert.throws(() => cache.put(Buffer.alloc(7)), /RUNTIME_AUDIO_TOO_LARGE/);
});

test('Local TTSはpreflight・生成・cache URLを返す', async () => {
  const client = {
    version: async () => '1.2.3',
    resolveStyle: async () => ({ id: 42, name: 'Calm' }),
    synthesize: async () => ({ wav: Buffer.from('wav-data'), style: { id: 42, name: 'Calm' } }),
  };
  const service = new LocalTtsService({ client, profile, cache: new RuntimeAudioCache() });
  assert.equal((await service.preflight()).status, 'ready');
  const result = await service.synthesize('緊急発話');
  assert.match(result.runtimeUrl, /^\/api\/runtime-audio\/[0-9a-f-]+$/);
  assert.equal(service.status().runtimeStyleId, 42);
});

test('連続要求は前の生成をcancelしrace再生を防ぐ', async () => {
  let sequence = 0;
  const client = {
    synthesize: (_text, _profile, { signal }) => new Promise((resolve, reject) => {
      const own = ++sequence;
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      if (own === 2) setImmediate(() => resolve({ wav: Buffer.from('second'), style: { id: 42, name: 'Calm' } }));
    }),
  };
  const service = new LocalTtsService({ client, profile, cache: new RuntimeAudioCache() });
  const first = service.synthesize('first');
  const second = service.synthesize('second');
  await assert.rejects(first, /LOCAL_TTS_CANCELLED/);
  assert.ok((await second).runtimeUrl);
});
