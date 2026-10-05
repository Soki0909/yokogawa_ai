import path from 'node:path';
import { isSafeAssetPath } from './show-schema.js';

export function resolveLocalAsset(publicDirectory, asset) {
  if (!asset || !isSafeAssetPath(asset.path)) throw new Error('UNSAFE_ASSET_PATH');
  const root = path.resolve(publicDirectory, 'assets');
  const resolved = path.resolve(publicDirectory, asset.path);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('UNSAFE_ASSET_PATH');
  return resolved;
}

export const resolveAudioAsset = resolveLocalAsset;

export function productionAudioPreloadManifest(assets = []) {
  return assets
    .filter((asset) => asset?.mimeType === 'audio/wav'
      && /^prod-voice-\d{3}-/.test(asset.id ?? '')
      && isSafeAssetPath(asset.path))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((asset) => ({
      id: asset.id,
      url: `/api/assets/${encodeURIComponent(asset.id)}`,
      sha256: asset.sha256 ?? null,
    }));
}

// Short local WAV fixture used for preflight and offline demonstrations.
export function createTestToneWav({ frequency = 440, durationMs = 420, sampleRate = 16000 } = {}) {
  const samples = Math.floor(sampleRate * durationMs / 1000);
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + samples * 2, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.min(1, index / 400, (samples - index) / 800);
    bytes.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * index / sampleRate) * 7500 * envelope), 44 + index * 2);
  }
  return bytes;
}
