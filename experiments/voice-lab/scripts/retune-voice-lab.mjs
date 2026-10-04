import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { analysePcmWav } from '../../../src/audio/wav-analysis.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const labRoot = path.join(root, 'experiments', 'voice-lab');
const configRoot = path.join(labRoot, 'config');
export const retuneOutputRoot = path.join(labRoot, 'output', 'retune-2026-10');
const engineConfigPath = path.join(configRoot, 'engine.json');
const candidateConfigPath = path.join(configRoot, 'candidates-retune.json');
const sampleConfigPath = path.join(configRoot, 'samples-retune.json');
const selectedProfilePath = path.join(configRoot, 'selected-profile.json');
const productionManifestPath = path.join(root, 'config', 'production-speech', 'yokogawa-ai-v1.json');

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function applyRetuneParameters(query, parameters) {
  for (const key of ['speedScale', 'pitchScale', 'intonationScale', 'tempoDynamicsScale', 'volumeScale', 'pauseLengthScale', 'outputSamplingRate', 'outputStereo']) {
    if (parameters[key] !== undefined) query[key] = parameters[key];
  }
  return query;
}

export function applyCandidateSynthesisText(text, transform) {
  if (!transform) return text;
  if (transform.id !== 'full-stop-ellipsis-v1' || !['…', '……'].includes(transform.suffix)) throw new Error(`Unknown synthesis text transform: ${transform.id}`);
  return text.replace(/。(?=.)/gu, `。${transform.suffix}`);
}

export function validateRetuneConfig(selected, config, sampleConfig, productionManifest) {
  if (selected.displayName !== '2A' || selected.style !== 'Calm' || selected.parameters.speedScale !== 1.2) throw new Error('2A baseline does not match the selected profile.');
  const expectedCandidates = {
    '2b': [1.12, 0.35, 0.15, 1.20],
    '2c': [1.10, 0.30, 0.10, 1.30],
    '2d': [1.08, 0.25, 0.08, 1.35],
  };
  if (config.candidates?.length !== 3) throw new Error('Retune config must contain 2B, 2C and 2D.');
  for (const candidate of config.candidates) {
    const expected = expectedCandidates[candidate.id];
    if (!expected) throw new Error(`Unknown retune candidate: ${candidate.id}`);
    const actual = [candidate.parameters.speedScale, candidate.parameters.intonationScale, candidate.parameters.tempoDynamicsScale, candidate.parameters.pauseLengthScale];
    if (JSON.stringify(actual) !== JSON.stringify(expected) || candidate.parameters.pitchScale !== 0 || candidate.parameters.volumeScale !== .95) throw new Error(`${candidate.displayName} parameters do not match the retune specification.`);
    if (candidate.styleId !== selected.styleId || candidate.speakerUuid !== selected.speakerUuid) throw new Error(`${candidate.displayName} must retain the 2A voice and Calm style.`);
  }
  const expectedIds = ['001', '002', '003', '004', '008', '013', '016'];
  const ids = sampleConfig.samples?.map((sample) => sample.scriptId);
  if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) throw new Error('Retune samples must be 001, 002, 003, 004, 008, 013 and 016.');
  const productionById = new Map(productionManifest.speeches.map((speech) => [speech.scriptId, speech]));
  for (const sample of sampleConfig.samples) {
    const production = productionById.get(sample.scriptId);
    if (!production || production.scriptText !== sample.scriptText) throw new Error(`#${sample.scriptId} scriptText does not match Production.`);
  }
  const overrides = sampleConfig.samples.filter((sample) => sample.synthesisText && sample.synthesisText !== sample.scriptText);
  if (overrides.length !== 1 || overrides[0].scriptId !== '002' || overrides[0].synthesisText !== 'はい。例えば、そちらにヒサヤス ヒカルさんが参加しています') throw new Error('Only #002 may carry the pronunciation override.');
  if (!overrides[0].pronunciationOverride?.note) throw new Error('#002 pronunciation override must be traceable.');
  return true;
}

export function buildComparisonModel(selected, config, sampleConfig, productionManifest) {
  validateRetuneConfig(selected, config, sampleConfig, productionManifest);
  const productionById = new Map(productionManifest.speeches.map((speech) => [speech.scriptId, speech]));
  const samples = sampleConfig.samples.map((sample) => {
    const production = productionById.get(sample.scriptId);
    return {
      ...sample,
      synthesisText: sample.synthesisText ?? sample.scriptText,
      audioFile: `${sample.scriptId}.wav`,
      playbackEffect: sample.playbackEffect ?? 'none',
      productionPath: production.path,
    };
  });
  const baseline = {
    id: '2a', displayName: '2A', direction: config.baseline.direction,
    description: '現在のProduction基準音声', note: config.baseline.note,
    model: selected.model, speaker: selected.speaker, style: selected.style, styleId: selected.styleId,
    source: 'selected-profile.json + existing Production WAV', parameters: selected.parameters,
  };
  return { schemaVersion: 1, round: config.round, candidates: [baseline, ...config.candidates], samples };
}

async function engineFetch(engine, route, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), engine.requestTimeoutMs ?? 120000);
  try {
    const response = await fetch(`${engine.baseUrl}${route}`, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${route} -> ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return response;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`AivisSpeech request timed out: ${route}`);
    if (error.cause?.code === 'ECONNREFUSED') throw new Error(`AivisSpeech Engine is not running at ${engine.baseUrl}. Start it, then rerun npm run voice:lab:retune.`);
    throw error;
  } finally { clearTimeout(timeout); }
}

async function inspectEngine(engine, candidates) {
  const [version, speakers] = await Promise.all([
    engineFetch(engine, '/version').then((response) => response.text()),
    engineFetch(engine, '/speakers').then((response) => response.json()),
  ]);
  const styles = new Map(speakers.flatMap((speaker) => (speaker.styles ?? []).map((style) => [style.id, { speaker, style }])));
  for (const candidate of candidates) {
    const installed = styles.get(candidate.styleId);
    if (!installed || installed.speaker.name !== candidate.model || installed.style.name !== candidate.style || installed.speaker.speaker_uuid !== candidate.speakerUuid) throw new Error(`${candidate.displayName}: configured voice is not installed in AivisSpeech.`);
  }
  return { name: engine.name, version: version.replace(/^"|"$/g, ''), baseUrl: engine.baseUrl };
}

export async function prepareRetuneBaseline(model) {
  await mkdir(path.join(retuneOutputRoot, '2a'), { recursive: true });
  for (const sample of model.samples) {
    const source = path.resolve(root, 'public', sample.productionPath);
    const audioRoot = path.resolve(root, 'public', 'assets', 'audio');
    if (!source.startsWith(`${audioRoot}${path.sep}`) || path.extname(source).toLowerCase() !== '.wav') throw new Error(`Unsafe Production audio path: ${sample.productionPath}`);
    await cp(source, path.join(retuneOutputRoot, '2a', sample.audioFile));
  }
}

async function generateCandidates(engine, model) {
  const generatedAt = new Date().toISOString();
  const generatedCandidates = model.candidates.filter((candidate) => candidate.id !== '2a');
  const engineInfo = await inspectEngine(engine, generatedCandidates);
  const run = { schemaVersion: 1, generatedAt, engine: engineInfo, files: [] };
  for (const candidate of generatedCandidates) {
    const candidateRoot = path.join(retuneOutputRoot, candidate.id);
    const queryRoot = path.join(retuneOutputRoot, 'metadata', candidate.id);
    await mkdir(candidateRoot, { recursive: true }); await mkdir(queryRoot, { recursive: true });
    for (const sample of model.samples) {
      const synthesisText = applyCandidateSynthesisText(sample.synthesisText, candidate.synthesisTextTransform);
      const params = new URLSearchParams({ text: synthesisText, speaker: String(candidate.styleId) });
      const query = await engineFetch(engine, `/audio_query?${params}`, { method: 'POST' }).then((response) => response.json());
      applyRetuneParameters(query, candidate.parameters);
      const queryJson = `${JSON.stringify(query, null, 2)}\n`;
      await writeFile(path.join(queryRoot, `${sample.scriptId}.audio-query.json`), queryJson);
      const wav = Buffer.from(await engineFetch(engine, `/synthesis?speaker=${candidate.styleId}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(query),
      }).then((response) => response.arrayBuffer()));
      await writeFile(path.join(candidateRoot, sample.audioFile), wav);
      run.files.push({ candidate: candidate.id, sample: sample.scriptId, scriptText: sample.scriptText, synthesisText,
        pronunciationOverride: sample.pronunciationOverride ?? null, synthesisTextTransform: candidate.synthesisTextTransform ?? null,
        audioQuerySha256: sha256(queryJson), wavSha256: sha256(wav), bytes: wav.length });
      console.log(`generated ${candidate.id}/${sample.audioFile}`);
    }
  }
  await writeFile(path.join(retuneOutputRoot, 'generation-run.json'), `${JSON.stringify(run, null, 2)}\n`);
  return run;
}

function pcmData(buffer) {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4); const size = buffer.readUInt32LE(offset + 4); const start = offset + 8;
    if (id === 'data') return buffer.subarray(start, start + size);
    offset = start + size + size % 2;
  }
  throw new Error('WAV data chunk missing.');
}

export function analyseSilence(buffer) {
  const wav = analysePcmWav(buffer); const data = pcmData(buffer); const frames = data.length / 2 / wav.channels;
  const windowFrames = Math.max(1, Math.round(wav.sampleRate * .01)); const threshold = .003; const quiet = [];
  for (let start = 0; start < frames; start += windowFrames) {
    const end = Math.min(frames, start + windowFrames); let squares = 0; let count = 0;
    for (let frame = start; frame < end; frame += 1) {
      for (let channel = 0; channel < wav.channels; channel += 1) {
        const value = data.readInt16LE((frame * wav.channels + channel) * 2) / 32768; squares += value * value; count += 1;
      }
    }
    quiet.push(Math.sqrt(squares / count) <= threshold);
  }
  const firstAudible = quiet.findIndex((value) => !value); const lastAudible = quiet.findLastIndex((value) => !value);
  if (firstAudible < 0) return { leadingSilenceSeconds: wav.durationSeconds, trailingSilenceSeconds: wav.durationSeconds, internalSilences: [] };
  const runs = []; let startWindow = null;
  for (let window = firstAudible; window <= lastAudible; window += 1) {
    if (quiet[window] && startWindow === null) startWindow = window;
    if ((!quiet[window] || window === lastAudible) && startWindow !== null) {
      const endWindow = quiet[window] ? window + 1 : window; const durationSeconds = (endWindow - startWindow) * windowFrames / wav.sampleRate;
      if (durationSeconds >= .06) runs.push({ startSeconds: startWindow * windowFrames / wav.sampleRate, durationSeconds });
      startWindow = null;
    }
  }
  const lastAudibleEnd = Math.min(frames, (lastAudible + 1) * windowFrames);
  return { leadingSilenceSeconds: firstAudible * windowFrames / wav.sampleRate, trailingSilenceSeconds: (frames - lastAudibleEnd) / wav.sampleRate, internalSilences: runs };
}

async function verifyAndReport(model) {
  const expectedGeneratedWavCount = (model.candidates.length - 1) * model.samples.length;
  const report = { schemaVersion: 1, verifiedAt: new Date().toISOString(), pass: true, generatedWavCount: 0, candidates: [], durationComparison: [], pauseComparison: [] };
  const durationBySample = new Map(model.samples.map((sample) => [sample.scriptId, {}]));
  for (const candidate of model.candidates) {
    const candidateReport = { id: candidate.id, displayName: candidate.displayName, pass: true, files: [] };
    for (const sample of model.samples) {
      const file = path.join(retuneOutputRoot, candidate.id, sample.audioFile); const buffer = await readFile(file);
      const wav = analysePcmWav(buffer); const silence = analyseSilence(buffer);
      const checks = { sampleRate: wav.sampleRate === 44100, channels: wav.channels === 1, bitDepth: wav.bitsPerSample === 16,
        nonSilent: wav.rms > .0001 && wav.peak > .001, noClipping: wav.fullScaleSamples === 0,
        frontSilence: silence.leadingSilenceSeconds <= 1, tailSilence: silence.trailingSilenceSeconds <= 1.5 };
      const pass = Object.values(checks).every(Boolean); candidateReport.pass &&= pass;
      candidateReport.files.push({ scriptId: sample.scriptId, file: `${candidate.id}/${sample.audioFile}`, pass, checks, wav, silence });
      durationBySample.get(sample.scriptId)[candidate.id] = wav.durationSeconds;
      if (candidate.id !== '2a') report.generatedWavCount += 1;
    }
    report.pass &&= candidateReport.pass; report.candidates.push(candidateReport);
  }
  for (const sample of model.samples) {
    const durations = durationBySample.get(sample.scriptId); const baseline = durations['2a'];
    report.durationComparison.push({ scriptId: sample.scriptId, label: sample.label, ...Object.fromEntries(model.candidates.map((candidate) => [candidate.id, {
      durationSeconds: durations[candidate.id], differencePercentFrom2A: Number(((durations[candidate.id] / baseline - 1) * 100).toFixed(1)),
    }])) });
  }
  for (const scriptId of ['004', '013']) {
    report.pauseComparison.push({ scriptId, candidates: Object.fromEntries(report.candidates.map((candidate) => {
      const file = candidate.files.find((entry) => entry.scriptId === scriptId); const longest = Math.max(0, ...file.silence.internalSilences.map((item) => item.durationSeconds));
      return [candidate.id, { durationSeconds: file.wav.durationSeconds, longestInternalSilenceSeconds: longest, internalSilenceCount: file.silence.internalSilences.length }];
    })) });
  }
  report.pass &&= report.generatedWavCount === expectedGeneratedWavCount;
  const manifest = { ...model, generatedAt: report.verifiedAt, qa: { pass: report.pass, generatedWavCount: report.generatedWavCount },
    candidates: model.candidates.map((candidate) => ({ ...candidate, durations: Object.fromEntries(report.durationComparison.map((row) => [row.scriptId, row[candidate.id].durationSeconds])) })) };
  await writeFile(path.join(retuneOutputRoot, 'qa-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(retuneOutputRoot, 'comparison-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const lines = ['# Voice Retune comparison', '', `| Line | ${model.candidates.map((candidate) => candidate.displayName).join(' | ')} |`, `| --- | ${model.candidates.map(() => '---:').join(' | ')} |`];
  for (const row of report.durationComparison) lines.push(`| #${row.scriptId} ${row.label} | ${model.candidates.map((candidate) => `${row[candidate.id].durationSeconds.toFixed(2)}s${candidate.id === '2a' ? '' : ` (${row[candidate.id].differencePercentFrom2A}%)`}`).join(' | ')} |`);
  lines.push('', '## Pause proxy', '', '10ms窓のRMS振幅から60ms以上の内部無音区間を検出。詳細はqa-report.json。', '', '| Line | Candidate | Longest internal silence | Count |', '| --- | --- | ---: | ---: |');
  for (const row of report.pauseComparison) for (const candidate of model.candidates) {
    const pause = row.candidates[candidate.id]; lines.push(`| #${row.scriptId} | ${candidate.displayName} | ${pause.longestInternalSilenceSeconds.toFixed(2)}s | ${pause.internalSilenceCount} |`);
  }
  lines.push('');
  await writeFile(path.join(retuneOutputRoot, 'comparison-report.md'), `${lines.join('\n')}\n`);
  return report;
}

export async function loadRetuneModel() {
  const [selected, config, samples, production] = await Promise.all([readJson(selectedProfilePath), readJson(candidateConfigPath), readJson(sampleConfigPath), readJson(productionManifestPath)]);
  return buildComparisonModel(selected, config, samples, production);
}

async function main() {
  const command = process.argv[2] ?? 'all'; const model = await loadRetuneModel(); const engine = await readJson(engineConfigPath);
  await mkdir(retuneOutputRoot, { recursive: true });
  if (['prepare', 'generate', 'all'].includes(command)) await prepareRetuneBaseline(model);
  if (['generate', 'all'].includes(command)) await generateCandidates(engine, model);
  if (['verify', 'all'].includes(command)) {
    const report = await verifyAndReport(model);
    const expected = (model.candidates.length - 1) * model.samples.length;
    console.log(`Voice Retune QA: ${report.pass ? 'PASS' : 'FAIL'} / generated ${report.generatedWavCount}/${expected}`);
    if (!report.pass) process.exitCode = 1;
  }
  if (!['prepare', 'generate', 'verify', 'all'].includes(command)) throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(`Voice Retune failed: ${error.message}`); process.exitCode = 1; });
