import { createHash } from 'node:crypto';
import { analysePcmWav, verifyProductionWav } from './wav-analysis.js';

export function segmentSpeech(displayText, spokenText = displayText) {
  const split = value => String(value ?? '').match(/[^。！？!?]+[。！？!?]*|[。！？!?]+/gu)?.map(s => s.trim()).filter(Boolean) ?? [];
  const display = split(displayText); const spoken = split(spokenText);
  if (!display.length || display.length !== spoken.length) throw new Error('SEGMENT_TEXT_COUNT_MISMATCH');
  return display.map((text, index) => ({ displayText: text, spokenText: spoken[index], pauseAfterMs: index < display.length - 1 ? 350 : 0 }));
}

export function pcmData(wav) {
  const info = analysePcmWav(wav);
  if (info.sampleRate !== 44100 || info.channels !== 1) throw new Error('COMPOSER_PCM_FORMAT');
  for (let at = 12; at + 8 <= wav.length;) {
    const size = wav.readUInt32LE(at + 4);
    if (wav.toString('ascii', at, at + 4) === 'data') return wav.subarray(at + 8, at + 8 + size);
    at += 8 + size + size % 2;
  }
  throw new Error('COMPOSER_DATA_MISSING');
}

export function encodePcm(data) {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(44100, 24); header.writeUInt32LE(88200, 28); header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// Reuse the approved take. Locate quiet boundaries near sentence positions; never resynthesize it.
export function alignExistingSpeech(wav, segments) {
  const pcm = pcmData(wav); const frames = pcm.length / 2; const boundaries = [0];
  const totalWeight = segments.reduce((sum, s) => sum + s.spokenText.length, 0);
  let weight = 0;
  for (let index = 0; index < segments.length - 1; index++) {
    weight += segments[index].spokenText.length;
    const estimate = frames * weight / totalWeight; let best = Math.round(estimate); let score = Infinity;
    const radius = Math.min(44100, frames / segments.length / 2);
    const lo = Math.max(boundaries.at(-1) + 4410, Math.round(estimate - radius));
    const hi = Math.min(frames - (segments.length - index - 1) * 4410, Math.round(estimate + radius));
    for (let at = lo; at < hi; at += 441) {
      let energy = 0; for (let p = at; p < Math.min(frames, at + 2205); p += 10) energy += Math.abs(pcm.readInt16LE(p * 2));
      const candidate = energy + Math.abs(at - estimate) * .03;
      if (candidate < score) { score = candidate; best = at; }
    }
    boundaries.push(best);
  }
  boundaries.push(frames);
  return segments.map((segment, index) => ({ ...segment, startMs: Math.round(boundaries[index] / 44.1), endMs: Math.round(boundaries[index + 1] / 44.1), pauseAfterMs: 0, alignment: 'approved-take-quiet-boundary', wav: encodePcm(pcm.subarray(boundaries[index] * 2, boundaries[index + 1] * 2)) }));
}

export function composeSpeech(segments, buffers) {
  if (!segments.length || segments.length !== buffers.length) throw new Error('COMPOSER_SEGMENT_COUNT');
  let samples = 0; const parts = []; const timeline = [];
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]; const pcm = pcmData(buffers[index]);
    const pause = index === segments.length - 1 ? 0 : Math.round(Math.min(10000, Math.max(0, Number(segment.pauseAfterMs) || 0)) * 44.1);
    timeline.push({ ...segment, startMs: Math.round(samples / 44.1), endMs: Math.round((samples + pcm.length / 2) / 44.1), sha256: createHash('sha256').update(buffers[index]).digest('hex') });
    parts.push(pcm, Buffer.alloc(pause * 2)); samples += pcm.length / 2 + pause;
  }
  const wav = encodePcm(Buffer.concat(parts)); const verification = verifyProductionWav(wav);
  if (!verification.pass) throw new Error(`COMPOSER_WAV_INVALID:${JSON.stringify(verification.checks)}`);
  return { wav, timeline, verification };
}
