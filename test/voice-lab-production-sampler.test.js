import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { buildVoiceLabSite, outputRoot, resolveAudioSource, sanitizeSamples } from '../scripts/build-voice-lab-site.mjs';
import { parseLineId } from '../experiments/voice-lab/production-site/line-selection.js';
import { PLAYBACK_EFFECTS } from '../public/js/audio-playback-effects.js';
import passwordGate, { config as passwordGateConfig } from '../netlify/edge-functions/password-gate.js';

const load = async (relative) => JSON.parse(await readFile(relative, 'utf8'));

test('Production Sampler manifestは正本から18件をsanitizeする', async () => {
  const [manifest, main, route] = await Promise.all([
    load('config/production-speech/yokogawa-ai-v1.json'), load('shows/production.json'), load('shows/production-yokogawa-route.json'),
  ]);
  const samples = sanitizeSamples(manifest, main, route);
  assert.equal(samples.length, 18);
  assert.deepEqual(samples.map((item) => item.scriptId), Array.from({ length: 18 }, (_, index) => String(index + 1).padStart(3, '0')));
  assert.equal(new Set(samples.map((item) => item.audio)).size, 18);
  for (const sample of samples) {
    assert.match(sample.audio, /^audio\/\d{3}\.wav$/);
    assert.doesNotMatch(JSON.stringify(sample), /[A-Z]:\\|docs\.google|127\.0\.0\.1|operatorNote|triggerNote|syncMarkers|WebSocket|Admin/i);
  }
  assert.deepEqual(samples.filter((item) => item.playbackEffect === 'hijacked-subtle-v1').map((item) => item.scriptId), ['005', '006', '007', '008', '009']);
  assert.ok(samples.filter((item) => !['005', '006', '007', '008', '009'].includes(item.scriptId)).every((item) => item.playbackEffect === 'none'));
  assert.equal(samples.find((item) => item.scriptId === '010').status.label, '配置未確定');
  assert.equal(samples.find((item) => item.scriptId === '017').status.label, '台本採否未確定');
  const routeSample = samples.find((item) => item.scriptId === '018');
  assert.equal(routeSample.status.label, '横ルート');
  assert.equal(routeSample.routeScene, '横シーン5');
  assert.doesNotMatch(JSON.stringify(routeSample), /302|303/);
});

test('Production Sampler deep link parserは001〜018だけを許可する', () => {
  assert.equal(parseLineId('?line=013'), '013');
  for (const value of ['', '13', '000', '019', '../013', '013x']) assert.equal(parseLineId(`?line=${encodeURIComponent(value)}`), null);
});

test('audio source resolverはpath traversalと非WAVを拒否する', () => {
  const publicRoot = path.resolve('public');
  assert.match(resolveAudioSource(publicRoot, 'assets/audio/yokogawa-professor-v1_001_boot.wav'), /yokogawa-professor-v1_001_boot\.wav$/);
  for (const unsafe of ['../package.json', 'assets/audio/../../admin.html', 'assets/audio/not-audio.json']) assert.throws(() => resolveAudioSource(publicRoot, unsafe), /Unsafe audio path/);
});

test('HIJACKED effectはProductionとSamplerの共通定義を保持する', async () => {
  assert.deepEqual(PLAYBACK_EFFECTS['hijacked-subtle-v1'], {
    id: 'hijacked-subtle-v1', highpassHz: 115, highpassQ: .55, lowpassHz: 5600, lowpassQ: .45,
    dryGain: .94, delaySeconds: .011, wetGain: .085,
  });
  const lipSync = await readFile('public/js/lip-sync.js', 'utf8');
  assert.match(lipSync, /connectPlaybackEffect\(context, source, analyser, playbackEffect\)/);
  assert.doesNotMatch(lipSync, /frequency\.value = 115|delayTime\.value = \.011/);
});

test('static buildは音声18件と公開用最小assetだけを生成する', async () => {
  const result = await buildVoiceLabSite();
  assert.equal(result.sampleCount, 18);
  const audio = (await readdir(path.join(outputRoot, 'audio'))).sort();
  assert.deepEqual(audio, Array.from({ length: 18 }, (_, index) => `${String(index + 1).padStart(3, '0')}.wav`));
  for (const file of audio) await access(path.join(outputRoot, 'audio', file));
  const top = (await readdir(outputRoot)).sort();
  assert.deepEqual(top, ['app.js', 'audio', 'audio-playback-effects.js', 'data', 'index.html', 'line-selection.js', 'styles.css']);
  const deployed = await readFile(path.join(outputRoot, 'data', 'production-samples.json'), 'utf8');
  for (const forbidden of ['operatorNote', 'triggerNote', 'syncMarkers', 'revisionId', 'baseUrl', '127.0.0.1', 'docs.google', 'speakerUuid']) assert.doesNotMatch(deployed, new RegExp(forbidden, 'i'));
});

test('Netlify password gateは全pathをfail-closedで保護しcredentialを埋め込まない', async () => {
  const [config, gate] = await Promise.all([readFile('netlify.toml', 'utf8'), readFile('netlify/edge-functions/password-gate.js', 'utf8')]);
  assert.match(config, /publish = "dist\/voice-lab"/);
  assert.deepEqual(passwordGateConfig, { path: '/*' });
  assert.match(gate, /PROTECTED_PAGE_PASSWORD/);
  assert.match(gate, /if \(!password\).*503/);
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict']) assert.match(gate, new RegExp(attribute));
  assert.match(gate, /crypto\.subtle/);
  assert.doesNotMatch(gate, /localStorage|sessionStorage/);
  assert.doesNotMatch(gate, /password\s*=\s*['"][^'"]+['"]/i);
});

test('Netlify password gateはHTML・WAV・JSONを同一認証で保護する', async () => {
  const previous = globalThis.Netlify;
  try {
    delete globalThis.Netlify;
    assert.equal((await passwordGate(new Request('https://example.test/'))).status, 503);
    const secret = crypto.randomUUID();
    globalThis.Netlify = { env: { get: (name) => name === 'PROTECTED_PAGE_PASSWORD' ? secret : undefined } };
    for (const url of ['https://example.test/', 'https://example.test/audio/001.wav', 'https://example.test/data/production-samples.json']) {
      assert.equal((await passwordGate(new Request(url))).status, 401);
    }
    const wrong = await passwordGate(new Request('https://example.test/?line=013', { method: 'POST', body: new URLSearchParams({ password: 'incorrect' }) }));
    assert.equal(wrong.status, 401);
    const accepted = await passwordGate(new Request('https://example.test/?line=013', { method: 'POST', body: new URLSearchParams({ password: secret }) }));
    assert.equal(accepted.status, 303);
    assert.equal(accepted.headers.get('location'), 'https://example.test/?line=013');
    const cookieHeader = accepted.headers.get('set-cookie');
    assert.ok(cookieHeader);
    assert.doesNotMatch(cookieHeader, new RegExp(secret));
    const cookie = cookieHeader.split(';')[0];
    assert.equal(await passwordGate(new Request('https://example.test/audio/001.wav', { headers: { cookie } })), undefined);
    const logout = await passwordGate(new Request('https://example.test/?logout=1', { headers: { cookie } }));
    assert.equal(logout.status, 401);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  } finally {
    if (previous === undefined) delete globalThis.Netlify; else globalThis.Netlify = previous;
  }
});
