import { createHash } from 'node:crypto';

export const SELECTED_PROFILE_PATH = 'experiments/voice-lab/config/selected-profile.json';
export const PRODUCTION_PROFILE_PATH = 'config/voice-profiles/yokogawa-professor-v1.json';

export function deriveProductionProfile(sourceText, generatedAt = new Date().toISOString()) {
  const selected = JSON.parse(sourceText);
  if (selected.sourceCandidate !== '2d' || selected.displayName !== '2D') {
    throw new Error('Selected profile is not approved Candidate 2D.');
  }
  const parameters = structuredClone(selected.parameters);
  return {
    schemaVersion: 1,
    profileId: 'yokogawa-professor-v1',
    generatedAt,
    source: {
      path: SELECTED_PROFILE_PATH,
      sha256: `sha256:${createHash('sha256').update(sourceText).digest('hex')}`,
      selectedAt: selected.selectedAt,
      sourceRound: selected.sourceRound,
      sourceCandidate: selected.sourceCandidate,
      displayName: selected.displayName,
    },
    model: { name: selected.model, uuid: selected.modelUuid, version: selected.modelVersion },
    speaker: { name: selected.speaker, uuid: selected.speakerUuid },
    style: { name: selected.style, selectedStyleId: selected.styleId },
    parameters,
    synthesisTextPolicy: structuredClone(selected.synthesisTextPolicy),
    output: {
      sampleRate: parameters.outputSamplingRate,
      channels: parameters.outputStereo ? 2 : 1,
      bitsPerSample: 16,
      mimeType: 'audio/wav',
    },
    attribution: {
      engine: 'AivisSpeech',
      voiceModel: `${selected.model}（Aivis Common Model License 1.0）`,
      modelBinaryBundled: false,
    },
  };
}

export function comparableProfile(profile) {
  const copy = structuredClone(profile);
  delete copy.generatedAt;
  return copy;
}
