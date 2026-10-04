import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { analysePcmWav } from '../../../src/audio/wav-analysis.js';
import { analyseSilence, applyCandidateSynthesisText, applyRetuneParameters } from './retune-voice-lab.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const labRoot = path.join(root, 'experiments', 'voice-lab');
const configRoot = path.join(labRoot, 'config');
const retuneRoot = path.join(labRoot, 'output', 'retune-2026-10');
const outputRoot = path.join(labRoot, 'output', 'provisional-profile-2026-10');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

function applyTextOverrides(text, sampleId, overrides) {
  let result = text;
  for (const override of overrides.filter((item) => item.scriptId === sampleId)) {
    if (!result.includes(override.from)) throw new Error(`#${sampleId}: override source text was not found: ${override.from}`);
    result = result.replace(override.from, override.to);
  }
  return result;
}

function applyGlobalReplacements(text, replacements) {
  return replacements.reduce((result, replacement) => result.replaceAll(replacement.from, replacement.to), text);
}

async function engineFetch(engine, route, options = {}) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), engine.requestTimeoutMs ?? 120000);
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
  const [engine, provisional, candidatesConfig, samplesConfig] = await Promise.all([
    readJson(path.join(configRoot, 'engine.json')), readJson(path.join(configRoot, 'provisional-profile.json')),
    readJson(path.join(configRoot, 'candidates-retune.json')), readJson(path.join(configRoot, 'samples-retune.json')),
  ]);
  const base = candidatesConfig.candidates.find((candidate) => candidate.id === provisional.baseCandidateId);
  if (!base || base.id !== '2d') throw new Error('Provisional profile must be based on 2D.');
  if (provisional.synthesisTextTransform?.suffix !== '…') throw new Error('Provisional profile must use one ellipsis after full stops.');
  const textOverride = provisional.textOverrides?.find((override) => override.scriptId === '003');
  if (textOverride?.to !== "貴重書、『プリンキピア』") throw new Error('Provisional #003 comma override is missing.');

  const version = (await engineFetch(engine, '/version').then((response) => response.text())).replace(/^"|"$/g, '');
  await mkdir(path.join(outputRoot, '2d'), { recursive: true }); await mkdir(path.join(outputRoot, provisional.id), { recursive: true });
  await mkdir(path.join(outputRoot, 'metadata', provisional.id), { recursive: true });
  const files = []; const baselineDurations = {}; const provisionalDurations = {};
  for (const sample of samplesConfig.samples) {
    await cp(path.join(retuneRoot, '2d', `${sample.scriptId}.wav`), path.join(outputRoot, '2d', `${sample.scriptId}.wav`));
    const baseText = sample.synthesisText ?? sample.scriptText;
    const globallyReplacedText = applyGlobalReplacements(baseText, provisional.globalTextReplacements ?? []);
    const overriddenText = applyTextOverrides(globallyReplacedText, sample.scriptId, provisional.textOverrides ?? []);
    const synthesisText = applyCandidateSynthesisText(overriddenText, provisional.synthesisTextTransform);
    const params = new URLSearchParams({ text: synthesisText, speaker: String(base.styleId) });
    const query = await engineFetch(engine, `/audio_query?${params}`, { method: 'POST' }).then((response) => response.json());
    applyRetuneParameters(query, base.parameters); const queryJson = `${JSON.stringify(query, null, 2)}\n`;
    const wav = Buffer.from(await engineFetch(engine, `/synthesis?speaker=${base.styleId}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(query),
    }).then((response) => response.arrayBuffer()));
    await writeFile(path.join(outputRoot, provisional.id, `${sample.scriptId}.wav`), wav);
    await writeFile(path.join(outputRoot, 'metadata', provisional.id, `${sample.scriptId}.audio-query.json`), queryJson);
    const baseline = analysePcmWav(await readFile(path.join(outputRoot, '2d', `${sample.scriptId}.wav`)));
    const analysis = analysePcmWav(wav); const silence = analyseSilence(wav);
    const pass = analysis.sampleRate === 44100 && analysis.channels === 1 && analysis.bitsPerSample === 16 && analysis.rms > .0001 && analysis.fullScaleSamples === 0;
    baselineDurations[sample.scriptId] = baseline.durationSeconds; provisionalDurations[sample.scriptId] = analysis.durationSeconds;
    files.push({ scriptId: sample.scriptId, scriptText: sample.scriptText, synthesisText, textOverrides: (provisional.textOverrides ?? []).filter((item) => item.scriptId === sample.scriptId), pass, wav: analysis, silence });
    console.log(`generated ${provisional.id}/${sample.scriptId}.wav (${analysis.durationSeconds.toFixed(2)}s)`);
  }
  const samples = samplesConfig.samples.map((sample) => ({ ...sample, synthesisText: sample.synthesisText ?? sample.scriptText, audioFile: `${sample.scriptId}.wav`, playbackEffect: 'none' }));
  const candidates = [
    { ...base, displayName: '2D', direction: '比較元', description: '声質・速度・抑揚の基準', durations: baselineDurations },
    { ...base, id: provisional.id, displayName: provisional.displayName, direction: '正式採用', description: provisional.description,
      note: '「セキュリティー」読み・#003読点・文中「。…」を適用', synthesisTextTransform: provisional.synthesisTextTransform,
      globalTextReplacements: provisional.globalTextReplacements,
      textOverrides: provisional.textOverrides, status: provisional.status, durations: provisionalDurations },
  ];
  const manifest = { schemaVersion: 1, round: 'provisional-profile-2026-10', generatedAt: new Date().toISOString(), engine: { name: engine.name, version, baseUrl: engine.baseUrl },
    qa: { pass: files.every((file) => file.pass), generatedWavCount: files.length }, candidates, samples };
  await writeFile(path.join(outputRoot, 'comparison-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(outputRoot, 'qa-report.json'), `${JSON.stringify({ schemaVersion: 1, generatedAt: manifest.generatedAt, pass: manifest.qa.pass, files }, null, 2)}\n`);
  if (!manifest.qa.pass || files.length !== 7) throw new Error('Provisional profile QA failed.');
  console.log('Provisional profile QA: PASS / generated 7/7');
}

main().catch((error) => { console.error(`Provisional profile failed: ${error.message}`); process.exitCode = 1; });
