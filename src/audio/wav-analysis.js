import { createHash } from 'node:crypto';

export function analysePcmWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('WAV_INVALID_RIFF');
  let offset = 12; let format; let data;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4); const size = buffer.readUInt32LE(offset + 4); const start = offset + 8;
    if (start + size > buffer.length) throw new Error(`WAV_TRUNCATED:${id}`);
    if (id === 'fmt ') format = { audioFormat: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2), sampleRate: buffer.readUInt32LE(start + 4), bitsPerSample: buffer.readUInt16LE(start + 14) };
    if (id === 'data') data = buffer.subarray(start, start + size);
    offset = start + size + size % 2;
  }
  if (!format || !data || format.audioFormat !== 1 || format.bitsPerSample !== 16) throw new Error('WAV_UNSUPPORTED_FORMAT');
  let peak = 0; let sumSquares = 0; let fullScaleSamples = 0;
  for (let index = 0; index < data.length; index += 2) {
    const value = data.readInt16LE(index); const absolute = Math.abs(value);
    peak = Math.max(peak, absolute); sumSquares += value * value; if (absolute >= 32767) fullScaleSamples += 1;
  }
  const sampleCount = data.length / 2; const frames = sampleCount / format.channels;
  return { ...format, dataBytes: data.length, durationSeconds: frames / format.sampleRate, peak: peak / 32768,
    rms: Math.sqrt(sumSquares / Math.max(sampleCount, 1)) / 32768, fullScaleSamples,
    sha256: createHash('sha256').update(buffer).digest('hex') };
}

export function verifyProductionWav(buffer) {
  const wav = analysePcmWav(buffer);
  const checks = { sampleRate: wav.sampleRate === 44100, channels: wav.channels === 1, bitDepth: wav.bitsPerSample === 16,
    duration: wav.durationSeconds > 0 && wav.durationSeconds < 180, nonSilent: wav.peak > .001 && wav.rms > .0001, noFullScaleClipping: wav.fullScaleSamples === 0 };
  return { pass: Object.values(checks).every(Boolean), checks, wav };
}
