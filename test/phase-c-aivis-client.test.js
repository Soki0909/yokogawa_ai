import test from 'node:test';
import assert from 'node:assert/strict';
import { AivisSpeechClient } from '../src/tts/aivis-speech-client.js';
import { loadProductionVoiceProfile, PROFILE_PARAMETER_KEYS } from '../src/voice-profile.js';

const profile = await loadProductionVoiceProfile();
const speaker = { name: profile.speaker.name, speaker_uuid: profile.speaker.uuid, version: profile.model.version,
  styles: [{ id: 987654321, name: profile.style.name }, { id: 1, name: 'Normal' }] };

test('runtimeでUUID+style名を厳密解決しAudioQuery未知fieldを保持する', async () => {
  const calls = [];
  const raw = { speedScale: 1, kana: 'テスト', accent_phrases: [{ moras: [{ text: 'テ' }] }], futureField: { preserved: true } };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/speakers')) return new Response(JSON.stringify([speaker]), { status: 200 });
    if (String(url).includes('/audio_query?')) return new Response(JSON.stringify(raw), { status: 200 });
    if (String(url).includes('/synthesis?')) return new Response(Buffer.from('RIFFmock'), { status: 200 });
    throw new Error(`unexpected ${url}`);
  };
  const client = new AivisSpeechClient({ baseUrl: 'http://127.0.0.1:10101', fetchImpl });
  const result = await client.synthesize('確認', profile);
  assert.equal(result.style.id, 987654321);
  assert.deepEqual(result.finalQuery.accent_phrases, raw.accent_phrases);
  assert.deepEqual(result.finalQuery.futureField, raw.futureField);
  assert.equal(result.finalQuery.kana, raw.kana);
  for (const key of PROFILE_PARAMETER_KEYS) assert.deepEqual(result.finalQuery[key], profile.parameters[key]);
  const body = JSON.parse(calls.find((call) => call.url.includes('/synthesis?')).options.body);
  assert.deepEqual(body.futureField, raw.futureField);
});

test('speaker/style不一致でfallbackしない', async () => {
  const client = new AivisSpeechClient({ fetchImpl: async () => new Response(JSON.stringify([{ ...speaker, speaker_uuid: 'other' }])) });
  await assert.rejects(client.resolveStyle(profile), /AIVIS_SPEAKER_NOT_FOUND/);
  const noStyle = new AivisSpeechClient({ fetchImpl: async () => new Response(JSON.stringify([{ ...speaker, styles: [{ id: 1, name: 'Normal' }] }])) });
  await assert.rejects(noStyle.resolveStyle(profile), /AIVIS_STYLE_NOT_FOUND/);
});

test('外部AbortをAIVIS_ABORTEDとして返す', async () => {
  const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  const client = new AivisSpeechClient({ fetchImpl, timeoutMs: 1000 });
  const controller = new AbortController();
  const pending = client.version({ signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /AIVIS_ABORTED/);
});
