import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyProductionWav } from '../src/audio/wav-analysis.js';
import { loadProductionVoiceProfile } from '../src/voice-profile.js';

const manifest = JSON.parse(await readFile(path.resolve('config', 'production-speech', 'yokogawa-ai-v1.json'), 'utf8'));
const profile = await loadProductionVoiceProfile();
assert.equal(manifest.speeches.length, 18);
assert.equal(manifest.profileHash, profile.source.sha256);
assert.equal(new Set(manifest.speeches.map((speech) => speech.scriptId)).size, 18);
assert.ok(manifest.speeches.every((speech) => speech.scriptText && speech.scriptText === speech.synthesisText));
assert.ok(manifest.speeches.every((speech) => speech.voiceProfileId === profile.profileId));
for (const speech of manifest.speeches) {
  const file = await readFile(path.resolve('public', speech.path));
  assert.equal(createHash('sha256').update(file).digest('hex'), speech.sha256, `${speech.scriptId}: SHA-256 mismatch`);
  const result = verifyProductionWav(file);
  assert.equal(result.pass, true, `${speech.scriptId}: technical WAV check failed`);
  assert.equal(result.wav.sampleRate, 44100); assert.equal(result.wav.channels, 1); assert.equal(result.wav.bitsPerSample, 16);
  assert.equal(speech.sourceScriptRevision, manifest.sourceScript.revisionId);
}
console.log(`Production speech verified: 18/18 / ${manifest.sourceScript.revisionId}`);
