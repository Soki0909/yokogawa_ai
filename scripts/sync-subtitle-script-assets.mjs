import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AivisSpeechClient } from '../src/tts/aivis-speech-client.js';
import { loadProductionVoiceProfile } from '../src/voice-profile.js';
import { verifyProductionWav } from '../src/audio/wav-analysis.js';
import { sentenceTexts } from '../public/js/subtitle-units.js';

const filename = 'config/production-speech/yokogawa-ai-v2.json';
const manifest = JSON.parse(await fs.readFile(filename, 'utf8'));
const latest = JSON.parse(await fs.readFile('docs/production/latest-script-2026-10-12.json', 'utf8'));
manifest.sourceScript = { ...manifest.sourceScript, revisionId: latest.revisionId, modifiedTime: latest.modifiedTime, tabCount: new Set(latest.paragraphs.map(p => p.tabId)).size };
const error = manifest.speeches.find(s => s.scriptId === '013');
error.scriptText = error.displayText = 'エラー。セキュリティプロテクトの緊急遮断を確認。解錠作業ストップ。エラー。指定されたスタッフへの連絡に失敗';
error.segments.at(-1).displayText = '指定されたスタッフへの連絡に失敗';
// Quiet-boundary review replaces the old 120/150ms first-sentence alignment.
for (const [id, bounds] of [['013', [0,620,3500,4600,5080,7848]], ['014', [0,620,3529]]]) {
  const speech = manifest.speeches.find(s => s.scriptId === id);
  speech.subtitleUnits = sentenceTexts(speech.displayText).map((displayText, index) => ({ displayText, startMs: bounds[index], endMs: bounds[index + 1], alignment: 'reviewed-waveform-boundary; approved WAV unchanged' }));
}
// Spoken punctuation and the approved WAV remain untouched.
if (!manifest.speeches.some(s => s.scriptId === '020')) {
  const profile = await loadProductionVoiceProfile(); const client = new AivisSpeechClient();
  const text = '館内すべての扉の解錠を確認しました';
  const { wav, style } = await client.synthesize(text, profile); const verification = verifyProductionWav(wav);
  if (!verification.pass) throw new Error('NEW_WAV_INVALID');
  const path = 'assets/audio/production-v2-020.wav'; await fs.writeFile(`public/${path}`, wav);
  const sha256 = createHash('sha256').update(wav).digest('hex');
  manifest.speeches.push({ scriptId: '020', assetId: 'prod-voice-020-unlock-confirmed', path, scene: 'scene-7', route: 'main', location: '7・201', tabId: 't.6gopn4tnzuo', scriptText: text, displayText: text, spokenText: text, synthesisText: text,
    voiceProfileId: profile.profileId, profileHash: manifest.profileHash, engineVersion: await client.version(), runtimeStyleId: style.id, effectiveParameters: profile.parameters, generatedAt: new Date().toISOString(), sourceScriptRevision: latest.revisionId,
    sampleRate: verification.wav.sampleRate, channels: verification.wav.channels, bitsPerSample: verification.wav.bitsPerSample, durationSeconds: verification.wav.durationSeconds, bytes: wav.length, sha256, technicalChecks: verification.checks,
    segments: [{ displayText: text, spokenText: text, startMs: 0, endMs: Math.ceil(verification.wav.durationSeconds * 1000), pauseAfterMs: 0, path, sha256 }] });
  console.log(`Generated new 020 only: ${verification.wav.durationSeconds}s / ${sha256}`);
}
await fs.writeFile(filename, JSON.stringify(manifest, null, 2) + '\n');
