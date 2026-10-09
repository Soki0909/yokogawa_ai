import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { segmentSpeech, encodePcm, composeSpeech, pcmData } from '../src/audio/speech-composer.js';
import { verifyProductionWav } from '../src/audio/wav-analysis.js';
import { validateShowFile } from '../src/show-schema.js';
import { StateStore } from '../src/state-store.js';

const tone = (frames = 4410) => { const data = Buffer.alloc(frames * 2); for (let i = 0; i < frames; i++) data.writeInt16LE(Math.round(Math.sin(i * .1) * 4000), i * 2); return encodePcm(data); };
test('sentence boundaries preserve display text separately from reading and reject unequal topology', () => {
  assert.deepEqual(segmentSpeech('はい。そちらに久安光さん！', 'はい。そちらにヒサヤスヒカルさん！').map(s => s.displayText), ['はい。', 'そちらに久安光さん！']);
  assert.throws(() => segmentSpeech('文。次。', '一文'), /COUNT_MISMATCH/);
});
test('final PCM export inserts exact silence and subtitle offsets deterministically', () => {
  const segments = [{ displayText: '一文', spokenText: 'イチブン', pauseAfterMs: 450 }, { displayText: '次', spokenText: 'ツギ', pauseAfterMs: 0 }];
  const first = composeSpeech(segments, [tone(), tone()]); const second = composeSpeech(segments, [tone(), tone()]);
  assert.equal(first.verification.pass, true); assert.equal(first.verification.wav.sha256, second.verification.wav.sha256);
  assert.equal(first.timeline[0].endMs, 100); assert.equal(first.timeline[1].startMs, 550);
  assert.equal(pcmData(first.wav).subarray(8820, 48510).every(b => b === 0), true);
});
test('latest Production speech, archives and original SFX pass format/hash checks', async () => {
  const manifest = JSON.parse(await fs.readFile('config/production-speech/yokogawa-ai-v2.json', 'utf8'));
  assert.equal(manifest.speeches.length, 16); assert.equal(manifest.sfx.length, 11);
  for (const asset of [...manifest.speeches, ...manifest.sfx]) {
    const verification = verifyProductionWav(await fs.readFile(`public/${asset.path}`));
    assert.equal(verification.pass, true, asset.path); assert.equal(verification.wav.sha256, asset.sha256);
  }
  assert.ok(manifest.speeches.find(s => s.scriptId === '002').segments.some(s => s.pauseAfterMs === 450));
  assert.equal(manifest.speeches.find(s => s.scriptId === '009').displayText, '第一の謎は、こちらです');
});
test('SFX references are validated and all three puzzle images remain safe explicit placeholders', async () => {
  const show = JSON.parse(await fs.readFile('shows/production.json', 'utf8'));
  assert.equal(validateShowFile(show).valid, true);
  show.cues[0].sfx[0].assetId = 'missing'; assert.ok(validateShowFile(show).errors.some(e => e.startsWith('CUE_SFX_NOT_FOUND')));
  assert.equal(show.assets.filter(a => a.id.startsWith('puzzle-')).length, 3);
});
test('route with no current AI speech stays empty on import', async () => {
  const show = JSON.parse(await fs.readFile('shows/production-yokogawa-route.json', 'utf8'));
  const store = new StateStore({ storage: { async load() {}, async save() {} } });
  store.importShowFile(show, { apply: true }); assert.deepEqual(store.state.cues, []); assert.equal(store.snapshot().nextCue, null);
});
