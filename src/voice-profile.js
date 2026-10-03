import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const PRODUCTION_VOICE_PROFILE_ID = 'yokogawa-professor-v1';
export const DEFAULT_VOICE_PROFILE_PATH = path.resolve('config', 'voice-profiles', `${PRODUCTION_VOICE_PROFILE_ID}.json`);

const REQUIRED_PARAMETERS = Object.freeze([
  'speedScale', 'pitchScale', 'intonationScale', 'tempoDynamicsScale', 'volumeScale',
  'prePhonemeLength', 'postPhonemeLength', 'pauseLength', 'pauseLengthScale',
  'outputSamplingRate', 'outputStereo',
]);

export function validateProductionVoiceProfile(profile) {
  const errors = [];
  if (profile?.profileId !== PRODUCTION_VOICE_PROFILE_ID) errors.push('PROFILE_ID_MISMATCH');
  if (!profile?.source?.path || !/^sha256:[a-f0-9]{64}$/.test(profile?.source?.sha256 ?? '')) errors.push('PROFILE_SOURCE_INVALID');
  if (!profile?.model?.name || !profile?.model?.uuid || !profile?.model?.version) errors.push('PROFILE_MODEL_INVALID');
  if (!profile?.speaker?.name || !profile?.speaker?.uuid) errors.push('PROFILE_SPEAKER_INVALID');
  if (profile?.style?.name !== 'Calm') errors.push('PROFILE_STYLE_INVALID');
  for (const key of REQUIRED_PARAMETERS) if (!(key in (profile?.parameters ?? {}))) errors.push(`PROFILE_PARAMETER_MISSING:${key}`);
  if (profile?.output?.sampleRate !== 44100 || profile?.output?.channels !== 1 || profile?.output?.bitsPerSample !== 16) errors.push('PROFILE_OUTPUT_INVALID');
  return { valid: errors.length === 0, errors };
}

export async function loadProductionVoiceProfile(filePath = DEFAULT_VOICE_PROFILE_PATH) {
  const profile = JSON.parse(await readFile(filePath, 'utf8'));
  const result = validateProductionVoiceProfile(profile);
  if (!result.valid) throw new Error(`PRODUCTION_VOICE_PROFILE_INVALID:${result.errors.join(',')}`);
  return Object.freeze(profile);
}

export const PROFILE_PARAMETER_KEYS = REQUIRED_PARAMETERS;
