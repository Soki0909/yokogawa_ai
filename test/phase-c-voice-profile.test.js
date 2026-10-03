import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadProductionVoiceProfile, validateProductionVoiceProfile } from '../src/voice-profile.js';

test('選定Profileをhash付きproduction snapshotへ固定しspeedScale 1.20を保持する', async () => {
  const selectedBuffer = await readFile('experiments/voice-lab/config/selected-profile.json');
  const profile = await loadProductionVoiceProfile();
  assert.equal(profile.parameters.speedScale, 1.2);
  assert.equal(profile.source.sha256, `sha256:${createHash('sha256').update(selectedBuffer).digest('hex')}`);
  assert.equal(profile.speaker.uuid, '561e4e59-3bc9-4726-9028-44a3c12a6f1d');
  assert.equal(profile.style.name, 'Calm');
  assert.equal(profile.output.sampleRate, 44100);
  assert.equal(profile.output.channels, 1);
  assert.doesNotThrow(() => validateProductionVoiceProfile(profile));
});

test('不正なproduction profileを拒否する', () => {
  const result = validateProductionVoiceProfile({ profileId: 'bad' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('PROFILE_ID_MISMATCH'));
});
