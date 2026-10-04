import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { analysePcmWav } from '../../../src/audio/wav-analysis.js';
import { analyseSilence, applyCandidateSynthesisText, applyRetuneParameters } from './retune-voice-lab.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const labRoot = path.join(root, 'experiments', 'voice-lab');
const configRoot = path.join(labRoot, 'config');
const outputRoot = path.join(labRoot, 'output', 'sentence-pause-test-2026-10');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

async function engineFetch(engine, route, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), engine.requestTimeoutMs ?? 120000);
  try {
    const response = await fetch(`${engine.baseUrl}${route}`, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${route} -> ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return response;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`AivisSpeech request timed out: ${route}`);
    if (error.cause?.code === 'ECONNREFUSED') throw new Error(`AivisSpeech Engine is not running at ${engine.baseUrl}.`);
    throw error;
  } finally { clearTimeout(timeout); }
}

async function main() {
  const [engine, testConfig, candidatesConfig, samplesConfig] = await Promise.all([
    readJson(path.join(configRoot, 'engine.json')),
    readJson(path.join(configRoot, 'sentence-pause-test.json')),
    readJson(path.join(configRoot, 'candidates-retune.json')),
    readJson(path.join(configRoot, 'samples-retune.json')),
  ]);
  const base = candidatesConfig.candidates.find((candidate) => candidate.id === testConfig.baseCandidateId);
  const sample = samplesConfig.samples.find((item) => item.scriptId === testConfig.sampleId);
  if (!base || !sample) throw new Error('Sentence pause test base candidate or sample is missing.');
  if (base.id !== '2d') throw new Error('Sentence pause test must retain 2D as its base.');
  if (JSON.stringify(testConfig.variants.map((variant) => variant.suffix)) !== JSON.stringify(['…', '……'])) throw new Error('Sentence pause test variants must be 。… and 。…….');

  const version = (await engineFetch(engine, '/version').then((response) => response.text())).replace(/^"|"$/g, '');
  const generatedAt = new Date().toISOString(); const candidates = []; const files = [];
  for (const variant of testConfig.variants) {
    const transform = { id: 'full-stop-ellipsis-v1', suffix: variant.suffix };
    const synthesisText = applyCandidateSynthesisText(sample.synthesisText ?? sample.scriptText, transform);
    const params = new URLSearchParams({ text: synthesisText, speaker: String(base.styleId) });
    const query = await engineFetch(engine, `/audio_query?${params}`, { method: 'POST' }).then((response) => response.json());
    applyRetuneParameters(query, base.parameters);
    const queryJson = `${JSON.stringify(query, null, 2)}\n`;
    const wav = Buffer.from(await engineFetch(engine, `/synthesis?speaker=${base.styleId}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(query),
    }).then((response) => response.arrayBuffer()));
    const candidateRoot = path.join(outputRoot, variant.id); const metadataRoot = path.join(outputRoot, 'metadata', variant.id);
    await mkdir(candidateRoot, { recursive: true }); await mkdir(metadataRoot, { recursive: true });
    await writeFile(path.join(candidateRoot, `${sample.scriptId}.wav`), wav);
    await writeFile(path.join(metadataRoot, `${sample.scriptId}.audio-query.json`), queryJson);
    const analysis = analysePcmWav(wav); const silence = analyseSilence(wav);
    const pass = analysis.sampleRate === 44100 && analysis.channels === 1 && analysis.bitsPerSample === 16 && analysis.rms > .0001 && analysis.fullScaleSamples === 0;
    files.push({ candidate: variant.id, scriptId: sample.scriptId, scriptText: sample.scriptText, synthesisText, transform, pass, wav: analysis, silence });
    candidates.push({ ...variant, model: base.model, speaker: base.speaker, style: base.style, styleId: base.styleId, parameters: base.parameters,
      synthesisTextTransform: transform, durations: { [sample.scriptId]: analysis.durationSeconds } });
    console.log(`generated ${variant.id}/${sample.scriptId}.wav (${analysis.durationSeconds.toFixed(2)}s)`);
  }
  const manifest = { schemaVersion: 1, round: testConfig.round, generatedAt, engine: { name: engine.name, version, baseUrl: engine.baseUrl },
    qa: { pass: files.every((file) => file.pass), generatedWavCount: files.length }, candidates,
    samples: [{ ...sample, synthesisText: sample.synthesisText ?? sample.scriptText, audioFile: `${sample.scriptId}.wav`, playbackEffect: 'none' }] };
  await writeFile(path.join(outputRoot, 'comparison-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(outputRoot, 'qa-report.json'), `${JSON.stringify({ schemaVersion: 1, generatedAt, pass: manifest.qa.pass, files }, null, 2)}\n`);
  const lines = ['# Sentence pause comparison', '', `Base: 2D / ${base.model} / ${base.style}`, '', `Display text: ${sample.scriptText}`, ''];
  for (const file of files) lines.push(`- ${file.candidate}: ${file.wav.durationSeconds.toFixed(2)}s / longest internal silence ${Math.max(0, ...file.silence.internalSilences.map((item) => item.durationSeconds)).toFixed(2)}s / synthesis: ${file.synthesisText}`);
  await writeFile(path.join(outputRoot, 'comparison-report.md'), `${lines.join('\n')}\n`);
  if (!manifest.qa.pass || files.length !== 2) throw new Error('Sentence pause test QA failed.');
  console.log('Sentence pause test QA: PASS / generated 2/2');
}

main().catch((error) => { console.error(`Sentence pause test failed: ${error.message}`); process.exitCode = 1; });
