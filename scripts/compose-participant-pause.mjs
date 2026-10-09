import fs from 'node:fs/promises';
import { AivisSpeechClient } from '../src/tts/aivis-speech-client.js';
import { loadProductionVoiceProfile } from '../src/voice-profile.js';
import { composeSpeech } from '../src/audio/speech-composer.js';
const profile = await loadProductionVoiceProfile(); const client = new AivisSpeechClient();
const segments = [
  { displayText: 'はい。', spokenText: 'はい。', pauseAfterMs: 350 },
  { displayText: '例えば、そちらに', spokenText: '例えば、そちらに', pauseAfterMs: 450 },
  { displayText: '久安光さんが参加しています', spokenText: 'ヒサヤス ヒカルさんが参加しています', pauseAfterMs: 0 },
];
const buffers = [];
for (const [i, segment] of segments.entries()) {
  const result = await client.synthesize(segment.spokenText, profile); buffers.push(result.wav);
  segment.path = `assets/audio/segments/002-composed-${i + 1}.wav`;
  await fs.writeFile(`public/${segment.path}`, result.wav);
}
const composed = composeSpeech(segments, buffers);
const manifest = JSON.parse(await fs.readFile('config/production-speech/yokogawa-ai-v2.json', 'utf8'));
const speech = manifest.speeches.find(s => s.scriptId === '002');
Object.assign(speech, { path: 'assets/audio/production-v2-002.wav', spokenText: segments.map(s => s.spokenText).join(''), segments: composed.timeline, sha256: composed.verification.wav.sha256, durationSeconds: composed.verification.wav.durationSeconds, bytes: composed.wav.length, generatedAt: new Date().toISOString(), sourceScriptRevision: manifest.sourceScript.revisionId, reusedApprovedTake: false,
  technicalChecks: composed.verification.checks, composition: 'Approved Calm profile; explicit sentence chunks; exact 450ms gap after そちらに. Original WAV retained in v1 archive.' });
await fs.writeFile(`public/${speech.path}`, composed.wav);
await fs.writeFile('config/production-speech/yokogawa-ai-v2.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('P-002 exact explicit segments composed; original WAV preserved');
