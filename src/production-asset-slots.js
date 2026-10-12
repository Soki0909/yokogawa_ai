import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { analysePcmWav } from './audio/wav-analysis.js';
import { inflateSync } from 'node:zlib';

function validatePng(bytes) {
  if (bytes.length < 45 || bytes.length > 8 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('8MB以内の有効なPNGが必要');
  const data=[]; let ended=false; let width; let height;
  for(let at=8;at+12<=bytes.length;) {
    const size=bytes.readUInt32BE(at); const end=at+8+size;
    if(end+4>bytes.length) throw new Error('PNG chunk truncated');
    let crc=0xffffffff;
    for(const byte of bytes.subarray(at+4,end)){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    if(((crc^0xffffffff)>>>0)!==bytes.readUInt32BE(end))throw new Error('PNG CRC invalid');
    const kind=bytes.toString('ascii',at+4,at+8);
    if(at===8){if(kind!=='IHDR'||size!==13)throw new Error('PNG IHDR missing');width=bytes.readUInt32BE(at+8);height=bytes.readUInt32BE(at+12);if(!width||!height||width*height>40_000_000)throw new Error('PNG dimensions invalid');}
    if(kind==='IDAT')data.push(bytes.subarray(at+8,end));
    if(kind==='IEND'){ended=true;break;}at=end+4;
  }
  if(!ended||!data.length||!inflateSync(Buffer.concat(data),{maxOutputLength:160_000_000}).length)throw new Error('PNG image data missing');
}

export const PRODUCTION_SLOTS = [
  { id: 'startup', assetId: 'prod-sfx-boot', label: 'startup', path: 'assets/audio/production-startup.wav', fallback: 'assets/audio/production-sfx-boot.wav', mimeType: 'audio/wav' },
  { id: 'hack-noise', assetId: 'prod-sfx-glitch', label: 'hack-noise', path: 'assets/audio/production-hack-noise.wav', fallback: 'assets/audio/production-sfx-glitch.wav', mimeType: 'audio/wav' },
  { id: 'warning', assetId: 'prod-sfx-warning', label: 'warning', path: 'assets/audio/production-warning.wav', fallback: 'assets/audio/production-sfx-warning.wav', mimeType: 'audio/wav' },
  ...[['01', 'first'], ['06', 'final'], ['07', 'emergency']].map(([number, name]) => ({ id: `puzzle-${number}`, assetId: `puzzle-${name}`, label: `Puzzle ${Number(number)}`, path: `assets/visual/production-puzzle-${number}.png`, fallback: 'assets/visual/puzzle-image-pending.svg', mimeType: 'image/png' })),
];

export async function resolveProductionSlots(publicDirectory) {
  return Promise.all(PRODUCTION_SLOTS.map(async slot => {
    let bytes; let status = 'MISSING'; let detail = '本番素材未配置。代替素材を使用'; let durationMs;
    try {
      bytes = await fs.readFile(path.join(publicDirectory, slot.path));
      if (slot.mimeType === 'audio/wav') {
        const info = analysePcmWav(bytes);
        if (info.durationSeconds <= 0 || info.durationSeconds > 180 || info.bitsPerSample !== 16 || ![1, 2].includes(info.channels)) throw new Error('16-bit PCM mono/stereo、180秒以内が必要');
        durationMs = Math.ceil(info.durationSeconds * 1000);
      } else {
        validatePng(bytes);
      }
      status = 'READY'; detail = '本番素材を使用';
    } catch (error) {
      if (error.code !== 'ENOENT') { status = 'INVALID'; detail = `${error.message}。代替素材を使用`; }
      bytes = await fs.readFile(path.join(publicDirectory, slot.fallback));
      if (slot.mimeType === 'audio/wav') durationMs = Math.ceil(analysePcmWav(bytes).durationSeconds * 1000);
    }
    return { ...slot, status, detail, durationMs, sha256: createHash('sha256').update(bytes).digest('hex'), resolvedPath: status === 'READY' ? slot.path : slot.fallback, resolvedMimeType: status === 'READY' ? slot.mimeType : slot.mimeType === 'audio/wav' ? 'audio/wav' : 'image/svg+xml' };
  }));
}

export function applyProductionSlots(store, slots) {
  store.productionAssetSlots = slots;
  for (const slot of slots) {
    const asset = store.state.assets.find(a => a.id === slot.assetId);
    if (!asset) continue;
    Object.assign(asset, { slot: slot.id, path: slot.resolvedPath, mimeType: slot.resolvedMimeType, sha256: slot.sha256, ...(slot.durationMs ? { durationMs: slot.durationMs } : {}) });
    const update = visual => { if (visual?.assetId === slot.assetId) { visual.assetVersion = slot.sha256; visual.message = slot.status === 'READY' ? '' : '問題画像を準備しています'; } };
    for (const cue of store.state.cues) {
      update(cue.visual); for (const phase of cue.sequence ?? []) update(phase.visual);
      for (const effect of cue.sfx ?? []) if (effect.assetId === slot.assetId) effect.durationMs = slot.durationMs;
      if (['prod-013', 'prod-014'].includes(cue.cueId) && slot.id === 'warning') cue.timing.speechDelayMs = slot.durationMs;
    }
    update(store.state.currentVisual); for (const display of store.state.displays) update(display.currentVisual);
  }
}
