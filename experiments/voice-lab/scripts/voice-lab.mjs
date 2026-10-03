import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const labDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configDir = path.join(labDir, "config");
const baseOutputDir = path.join(labDir, "output");
let outputDir = baseOutputDir;

async function readJson(file) {
  return JSON.parse(await readFile(path.join(configDir, file), "utf8"));
}

async function engineFetch(engine, route, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), engine.requestTimeoutMs);
  try {
    const response = await fetch(`${engine.baseUrl}${route}`, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${options.method ?? "GET"} ${route} -> ${response.status}: ${body.slice(0, 500)}`);
    }
    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`AivisSpeech request timed out after ${engine.requestTimeoutMs} ms: ${route}`);
    }
    if (error.cause?.code === "ECONNREFUSED") {
      throw new Error(`AivisSpeech Engine is not running at ${engine.baseUrl}. Production code was not contacted.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function inspectEngine(engine) {
  const [version, manifest, speakers] = await Promise.all([
    engineFetch(engine, "/version").then((response) => response.text()),
    engineFetch(engine, "/engine_manifest").then((response) => response.json()),
    engineFetch(engine, "/speakers").then((response) => response.json()),
  ]);
  const info = {
    capturedAt: new Date().toISOString(),
    baseUrl: engine.baseUrl,
    version: version.replace(/^"|"$/g, ""),
    manifest,
    speakers,
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "engine-info.json"), `${JSON.stringify(info, null, 2)}\n`);
  return info;
}

function validateCandidates(candidateConfig, speakers) {
  if (!candidateConfig.candidates?.length) throw new Error("No candidates are configured.");
  const styles = new Map();
  for (const speaker of speakers) {
    for (const style of speaker.styles ?? []) {
      styles.set(style.id, {
        model: speaker.name,
        modelVersion: speaker.version,
        speakerUuid: speaker.speaker_uuid,
        style: style.name,
      });
    }
  }
  for (const candidate of candidateConfig.candidates) {
    const actual = styles.get(candidate.styleId);
    if (!actual) throw new Error(`${candidate.id}: styleId ${candidate.styleId} is not installed in AivisSpeech.`);
    if (candidate.model !== actual.model || candidate.style !== actual.style) {
      throw new Error(`${candidate.id}: configured model/style does not match /speakers (${actual.model} / ${actual.style}).`);
    }
    if (candidate.speakerUuid !== actual.speakerUuid || candidate.modelVersion !== actual.modelVersion) {
      throw new Error(`${candidate.id}: configured speaker UUID/version does not match /speakers.`);
    }
  }
}

function applyParameters(query, parameters) {
  const editable = [
    "speedScale",
    "pitchScale",
    "intonationScale",
    "tempoDynamicsScale",
    "volumeScale",
    "prePhonemeLength",
    "postPhonemeLength",
    "pauseLength",
    "pauseLengthScale",
    "outputSamplingRate",
    "outputStereo",
  ];
  for (const key of editable) {
    if (parameters[key] !== undefined) query[key] = parameters[key];
  }
  return query;
}

async function generate(engine, candidateConfig, samples, engineInfo) {
  validateCandidates(candidateConfig, engineInfo.speakers);
  const run = {
    generatedAt: new Date().toISOString(),
    engine: { name: engine.name, version: engineInfo.version, baseUrl: engine.baseUrl },
    files: [],
  };

  for (const candidate of candidateConfig.candidates) {
    const candidateDir = path.join(outputDir, candidate.id);
    await mkdir(candidateDir, { recursive: true });
    for (const sample of samples.samples) {
      const params = new URLSearchParams({ text: sample.text, speaker: String(candidate.styleId) });
      const query = await engineFetch(engine, `/audio_query?${params}`, { method: "POST" }).then((response) => response.json());
      applyParameters(query, candidate.parameters);
      const wav = Buffer.from(await engineFetch(engine, `/synthesis?speaker=${candidate.styleId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(query),
      }).then((response) => response.arrayBuffer()));
      const relativeFile = path.join(candidate.id, `${sample.id}.wav`).replaceAll("\\", "/");
      await writeFile(path.join(outputDir, relativeFile), wav);
      run.files.push({ candidate: candidate.id, sample: sample.id, text: sample.text, file: relativeFile, bytes: wav.length });
      console.log(`generated ${relativeFile}`);
    }
    await writeFile(path.join(candidateDir, "generation-metadata.json"), `${JSON.stringify({
      candidate,
      engine: run.engine,
      samples: run.files.filter((entry) => entry.candidate === candidate.id),
    }, null, 2)}\n`);
  }
  await writeFile(path.join(outputDir, "generation-run.json"), `${JSON.stringify(run, null, 2)}\n`);
  return run;
}

function parseWav(buffer) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Not a RIFF/WAVE file");
  }
  let offset = 12;
  let format;
  let data;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buffer.length) throw new Error(`Truncated ${id} chunk`);
    if (id === "fmt ") {
      format = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        byteRate: buffer.readUInt32LE(start + 8),
        blockAlign: buffer.readUInt16LE(start + 12),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    }
    if (id === "data") data = buffer.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!format || !data) throw new Error("Missing fmt or data chunk");
  if (format.audioFormat !== 1 || format.bitsPerSample !== 16) throw new Error("QA supports PCM 16-bit WAV only");
  const sampleCount = data.length / 2;
  let peak = 0;
  let sumSquares = 0;
  let fullScaleSamples = 0;
  const silenceThreshold = Math.round(32767 * 0.001);
  let firstAudible = sampleCount;
  let lastAudible = -1;
  for (let index = 0; index < sampleCount; index += 1) {
    const value = data.readInt16LE(index * 2);
    const absolute = Math.abs(value);
    peak = Math.max(peak, absolute);
    sumSquares += value * value;
    if (absolute >= 32767) fullScaleSamples += 1;
    if (absolute > silenceThreshold) {
      firstAudible = Math.min(firstAudible, index);
      lastAudible = index;
    }
  }
  const frames = sampleCount / format.channels;
  const durationSeconds = frames / format.sampleRate;
  const leadingSilenceSeconds = firstAudible === sampleCount ? durationSeconds : firstAudible / format.channels / format.sampleRate;
  const trailingSilenceSeconds = lastAudible < 0 ? durationSeconds : (sampleCount - 1 - lastAudible) / format.channels / format.sampleRate;
  return {
    ...format,
    dataBytes: data.length,
    durationSeconds,
    peak: peak / 32768,
    rms: Math.sqrt(sumSquares / Math.max(sampleCount, 1)) / 32768,
    fullScaleSamples,
    leadingSilenceSeconds,
    trailingSilenceSeconds,
  };
}

async function verify(candidateConfig, samples) {
  const report = { verifiedAt: new Date().toISOString(), pass: true, candidates: [] };
  for (const candidate of candidateConfig.candidates) {
    const result = { id: candidate.id, pass: true, files: [], consistentFormat: true, consistentVoiceConfig: true };
    let expectedFormat;
    for (const sample of samples.samples) {
      const relativeFile = path.join(candidate.id, `${sample.id}.wav`).replaceAll("\\", "/");
      try {
        const wav = parseWav(await readFile(path.join(outputDir, relativeFile)));
        const formatKey = `${wav.audioFormat}/${wav.channels}/${wav.sampleRate}/${wav.bitsPerSample}`;
        expectedFormat ??= formatKey;
        const checks = {
          validWav: true,
          nonSilent: wav.rms > 0.0001 && wav.peak > 0.001,
          noClipping: wav.fullScaleSamples === 0,
          silenceWithinLimit: wav.leadingSilenceSeconds <= 1 && wav.trailingSilenceSeconds <= 1.5,
          durationReasonable: wav.durationSeconds > 0.2 && wav.durationSeconds < 120,
          formatMatchesCandidate: formatKey === expectedFormat,
        };
        const pass = Object.values(checks).every(Boolean);
        result.pass &&= pass;
        result.consistentFormat &&= checks.formatMatchesCandidate;
        result.files.push({ file: relativeFile, pass, checks, wav });
      } catch (error) {
        result.pass = false;
        result.files.push({ file: relativeFile, pass: false, error: error.message });
      }
    }
    result.allTenGenerated = result.files.length === 10 && result.files.every((file) => file.checks?.validWav);
    result.longSamplePassed = result.files.find((file) => file.file.endsWith("03-normal-long.wav"))?.pass === true;
    result.pass &&= result.allTenGenerated && result.longSamplePassed && result.consistentFormat;
    report.pass &&= result.pass;
    report.candidates.push(result);
  }
  await writeFile(path.join(outputDir, "qa-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function printSummary(report) {
  for (const candidate of report.candidates) {
    const passed = candidate.files.filter((file) => file.pass).length;
    const first = candidate.files.find((file) => file.wav)?.wav;
    console.log(`${candidate.id}: ${passed}/10 pass; ${first?.sampleRate ?? "?"} Hz, ${first?.channels ?? "?"} ch, ${first?.bitsPerSample ?? "?"}-bit`);
  }
  console.log(`Voice Lab QA: ${report.pass ? "PASS" : "FAIL"}`);
}

async function main() {
  const command = process.argv[2] ?? "all";
  const option = (name) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
  };
  const candidateFile = option("--candidates") ?? "candidates.json";
  const outputSubdirectory = option("--output");
  if (outputSubdirectory) {
    if (path.isAbsolute(outputSubdirectory) || outputSubdirectory.includes("..")) {
      throw new Error("--output must be a safe relative directory below output/.");
    }
    outputDir = path.join(baseOutputDir, outputSubdirectory);
  }
  const engine = await readJson("engine.json");
  if (command === "inspect") {
    const info = await inspectEngine(engine);
    console.log(JSON.stringify({ version: info.version, speakers: info.speakers }, null, 2));
    return;
  }
  const candidates = await readJson(candidateFile);
  const samples = await readJson("samples.json");
  if (command === "generate" || command === "all") {
    const info = await inspectEngine(engine);
    await generate(engine, candidates, samples, info);
  }
  if (command === "verify" || command === "all") {
    printSummary(await verify(candidates, samples));
    return;
  }
  if (command !== "generate") throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`Voice Lab failed: ${error.message}`);
  process.exitCode = 1;
});
