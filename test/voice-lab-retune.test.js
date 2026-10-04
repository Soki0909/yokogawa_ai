import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { applyCandidateSynthesisText, applyRetuneParameters, loadRetuneModel, retuneOutputRoot, validateRetuneConfig } from '../experiments/voice-lab/scripts/retune-voice-lab.mjs';
import { PLAYBACK_EFFECTS } from '../public/js/audio-playback-effects.js';

const json = async (file) => JSON.parse(await readFile(file, 'utf8'));

test('Voice Retuneはselected-profileの2Aと新規2B〜2Dを分離する', async () => {
  const [selected, config, samples, production] = await Promise.all([
    json('experiments/voice-lab/config/selected-profile.json'), json('experiments/voice-lab/config/candidates-retune.json'),
    json('experiments/voice-lab/config/samples-retune.json'), json('config/production-speech/yokogawa-ai-v1.json'),
  ]);
  assert.equal(validateRetuneConfig(selected, config, samples, production), true);
  const model = await loadRetuneModel();
  assert.deepEqual(model.candidates.map((candidate) => candidate.displayName), ['2A', '2B', '2C', '2D']);
  assert.equal(model.candidates[0].parameters.speedScale, 1.2);
  assert.equal(model.candidates[0].source, 'selected-profile.json + existing Production WAV');
  assert.deepEqual(model.candidates.slice(1).map((candidate) => [candidate.id, candidate.parameters.speedScale, candidate.parameters.intonationScale, candidate.parameters.tempoDynamicsScale, candidate.parameters.pauseLengthScale]), [
    ['2b', 1.12, .35, .15, 1.2], ['2c', 1.10, .30, .10, 1.3], ['2d', 1.08, .25, .08, 1.35],
  ]);
});

test('Voice Retuneは指定7台詞だけを比較し#002の表示と読みを分離する', async () => {
  const model = await loadRetuneModel();
  assert.deepEqual(model.samples.map((sample) => sample.scriptId), ['001', '002', '003', '004', '008', '013', '016']);
  const sample = model.samples.find((item) => item.scriptId === '002');
  assert.equal(sample.scriptText, 'はい。例えば、そちらに久安光さんが参加しています');
  assert.equal(sample.synthesisText, 'はい。例えば、そちらにヒサヤス ヒカルさんが参加しています');
  assert.equal(sample.pronunciationOverride.note, '久安 光 = ヒサヤス ヒカル');
  assert.deepEqual(model.samples.filter((item) => item.scriptText !== item.synthesisText).map((item) => item.scriptId), ['002']);
  const production = await json('config/production-speech/yokogawa-ai-v1.json');
  assert.ok(production.speeches.every((speech) => speech.scriptText === speech.synthesisText));
});

test('AudioQuery overrideは既知8項目だけを上書きしunknown fieldを保持する', () => {
  const query = { speedScale: .9, pitchScale: .1, intonationScale: .9, tempoDynamicsScale: .9, volumeScale: 1,
    pauseLengthScale: 1, outputSamplingRate: 24000, outputStereo: true, unknownFutureField: { keep: true }, accent_phrases: [{ moras: [] }] };
  const parameters = { speedScale: 1.1, pitchScale: 0, intonationScale: .3, tempoDynamicsScale: .1, volumeScale: .95,
    pauseLengthScale: 1.3, outputSamplingRate: 44100, outputStereo: false };
  const result = applyRetuneParameters(query, parameters);
  assert.equal(result, query);
  assert.deepEqual(result.unknownFutureField, { keep: true });
  assert.deepEqual(result.accent_phrases, [{ moras: [] }]);
  for (const [key, value] of Object.entries(parameters)) assert.equal(result[key], value);
});

test('句点比較は2Dを固定し「。…」と「。……」だけを切り替える', async () => {
  const [pauseConfig, candidates] = await Promise.all([
    json('experiments/voice-lab/config/sentence-pause-test.json'), json('experiments/voice-lab/config/candidates-retune.json'),
  ]);
  assert.equal(pauseConfig.baseCandidateId, '2d'); assert.equal(pauseConfig.sampleId, '013');
  assert.deepEqual(pauseConfig.variants.map((variant) => variant.suffix), ['…', '……']);
  const base = candidates.candidates.find((candidate) => candidate.id === pauseConfig.baseCandidateId);
  assert.deepEqual([base.parameters.speedScale, base.parameters.intonationScale, base.parameters.tempoDynamicsScale, base.parameters.pauseLengthScale], [1.08, .25, .08, 1.35]);
  const text = 'エラー。指定されたスタッフへの連絡に失敗。';
  assert.equal(applyCandidateSynthesisText(text, { id: 'full-stop-ellipsis-v1', suffix: '…' }), 'エラー。…指定されたスタッフへの連絡に失敗。');
  assert.equal(applyCandidateSynthesisText(text, { id: 'full-stop-ellipsis-v1', suffix: '……' }), 'エラー。……指定されたスタッフへの連絡に失敗。');
});

test('Retune生成物はProduction WAVから分離されHIJACKED effect値を変更しない', async () => {
  assert.equal(path.relative(process.cwd(), retuneOutputRoot).replaceAll('\\', '/'), 'experiments/voice-lab/output/retune-2026-10');
  assert.deepEqual(PLAYBACK_EFFECTS['hijacked-subtle-v1'], {
    id: 'hijacked-subtle-v1', highpassHz: 115, highpassQ: .55, lowpassHz: 5600, lowpassQ: .45,
    dryGain: .94, delaySeconds: .011, wetGain: .085,
  });
  const model = await loadRetuneModel();
  assert.equal(model.samples.find((sample) => sample.scriptId === '008').playbackEffect, 'hijacked-subtle-v1');
  assert.ok(model.samples.filter((sample) => sample.scriptId !== '008').every((sample) => sample.playbackEffect === 'none'));
});

test('Voice Retune UIはProduction defaultを維持し個別・連続・RAW/本番比較を持つ', async () => {
  const [productionHtml, reviewHtml, reviewApp, server, gate] = await Promise.all([
    readFile('experiments/voice-lab/production-site/index.html', 'utf8'), readFile('experiments/voice-lab/review/index.html', 'utf8'),
    readFile('experiments/voice-lab/review/app.js', 'utf8'), readFile('experiments/voice-lab/scripts/review-server.mjs', 'utf8'),
    readFile('netlify/edge-functions/password-gate.js', 'utf8'),
  ]);
  assert.match(productionHtml, /PRODUCTION SAMPLES/); assert.match(productionHtml, /href="\/\?logout=1"/);
  assert.match(reviewHtml, /VOICE RETUNE/); assert.match(reviewHtml, /data-mode="production"/); assert.match(reviewHtml, /data-mode="raw"/);
  assert.match(reviewHtml, /句点の間/); assert.match(reviewApp, /pause-test/); assert.match(server, /pathname === "\/pause-test"/);
  assert.match(reviewHtml, /href="\/sandbox"/); assert.match(server, /\/api\/sandbox\/synthesize/); assert.match(server, /Text must contain 1 to 500 characters/);
  assert.match(reviewApp, /4候補を順番に再生|\$\{count\}候補を順番に再生/);
  assert.match(reviewApp, /connectPlaybackEffect/); assert.match(server, /pathname === "\/retune"/);
  assert.match(gate, /path: '\/\*'/);
});
