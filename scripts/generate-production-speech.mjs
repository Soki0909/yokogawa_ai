import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AivisSpeechClient } from '../src/tts/aivis-speech-client.js';
import { verifyProductionWav } from '../src/audio/wav-analysis.js';
import { loadProductionVoiceProfile } from '../src/voice-profile.js';

const manifestPath = path.resolve('config', 'production-speech', 'yokogawa-ai-v1.json');
const publicDirectory = path.resolve('public');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const profile = await loadProductionVoiceProfile();
if (manifest.profileHash !== profile.source.sha256) throw new Error('Production speech manifest profile hash is stale.');
if (manifest.speeches.length !== 18) throw new Error(`Expected 18 production speeches, found ${manifest.speeches.length}.`);

const client = new AivisSpeechClient();
const [engineVersion, style] = await Promise.all([client.version(), client.resolveStyle(profile)]);
const generatedAt = new Date().toISOString();
for (const speech of manifest.speeches) {
  if (speech.scriptText !== speech.synthesisText) console.warn(`${speech.scriptId}: synthesisText differs from the current script text.`);
  const { wav } = await client.synthesize(speech.synthesisText, profile, { style });
  const technical = verifyProductionWav(wav);
  if (!technical.pass) throw new Error(`${speech.scriptId}: WAV technical verification failed: ${JSON.stringify(technical.checks)}`);
  const outputPath = path.resolve(publicDirectory, speech.path);
  if (!outputPath.startsWith(`${path.resolve(publicDirectory, 'assets', 'audio')}${path.sep}`)) throw new Error(`${speech.scriptId}: unsafe output path`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, wav);
  Object.assign(speech, {
    voiceProfileId: profile.profileId,
    profileHash: profile.source.sha256,
    engineVersion,
    speakerUuid: profile.speaker.uuid,
    styleName: profile.style.name,
    runtimeStyleId: style.id,
    effectiveParameters: profile.parameters,
    generatedAt,
    durationSeconds: technical.wav.durationSeconds,
    sampleRate: technical.wav.sampleRate,
    channels: technical.wav.channels,
    bitsPerSample: technical.wav.bitsPerSample,
    bytes: wav.length,
    sha256: createHash('sha256').update(wav).digest('hex'),
    technicalChecks: technical.checks,
    sourceScriptRevision: manifest.sourceScript.revisionId,
  });
  console.log(`generated ${speech.scriptId}/018 ${speech.path}`);
}
manifest.status = 'generated-and-verified';
manifest.generatedAt = generatedAt;
manifest.engine = { name: 'AivisSpeech', version: engineVersion, runtimeStyleId: style.id, baseUrl: client.baseUrl };
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Production speech: ${manifest.speeches.length}/18 generated and technically verified.`);
