import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AivisSpeechClient } from '../src/tts/aivis-speech-client.js';
import { loadProductionVoiceProfile } from '../src/voice-profile.js';
import { segmentSpeech, alignExistingSpeech, composeSpeech, encodePcm } from '../src/audio/speech-composer.js';
import { analysePcmWav } from '../src/audio/wav-analysis.js';

const archive = JSON.parse(await fs.readFile('config/production-speech/yokogawa-ai-v1.json', 'utf8'));
const profile = await loadProductionVoiceProfile(); const client = new AivisSpeechClient();
const output = 'public/assets/audio'; const segmentDirectory = `${output}/segments`;
await fs.mkdir(segmentDirectory, { recursive: true });
const sourceScript = { ...archive.sourceScript, modifiedTime: '2026-10-09T11:28:22.972Z', tabCount: 14,
  revisionId: 'AHj4eMTF3GAE2k0pcd07306ILZNIodlcZc1PnSRVHSXTuskJrA7erDopIzUkVP3duD9nc_art0rO2eWUw22T4DXfj_t4CjiA1SwcoXtqlj4' };
const speeches = [];
for (const old of archive.speeches.filter(s => !['009', '010', '017', '018'].includes(s.scriptId))) {
  const wav = await fs.readFile(`public/${old.path}`);
  if (analysePcmWav(wav).sha256 !== old.sha256) throw new Error(`ARCHIVE_HASH_CHANGED:${old.scriptId}`);
  const spokenText = old.synthesisText.replaceAll('。…', '。');
  const aligned = alignExistingSpeech(wav, segmentSpeech(old.scriptText, spokenText));
  const segments = [];
  for (const [index, segment] of aligned.entries()) {
    const filename = `${old.scriptId}-${index + 1}.wav`;
    await fs.writeFile(`${segmentDirectory}/${filename}`, segment.wav);
    const { wav: _wav, ...metadata } = segment;
    segments.push({ ...metadata, path: `assets/audio/segments/${filename}`, sha256: analysePcmWav(segment.wav).sha256 });
  }
  speeches.push({ ...old, displayText: old.scriptText, spokenText, reusedApprovedTake: true, segments });
}
// P-002 is composed by compose-participant-pause.mjs with explicit boundaries.
for (const [scriptId, scriptText, name] of [
  ['019', '皆さんにお渡しした袋に謎を記入する紙が入ってます。謎はそちらに記入してください', 'answer-sheet'],
  ['009', '第一の謎は、こちらです', 'first-riddle'],
]) {
  const segments = segmentSpeech(scriptText); const buffers = [];
  for (const [index, segment] of segments.entries()) {
    const result = await client.synthesize(segment.spokenText, profile);
    await fs.writeFile(`${segmentDirectory}/${scriptId}-${index + 1}.wav`, result.wav); buffers.push(result.wav);
    segment.path = `assets/audio/segments/${scriptId}-${index + 1}.wav`;
  }
  const composed = composeSpeech(segments, buffers); const audioPath = `assets/audio/production-v2-${scriptId}.wav`;
  await fs.writeFile(`public/${audioPath}`, composed.wav);
  speeches.push({ scriptId, assetId: `prod-voice-${scriptId}-${name}`, path: audioPath, scriptText, displayText: scriptText, spokenText: scriptText,
    scene: 'scene-1', location: '7・201', route: 'main', tabId: 't.tyup3idqskfk', voiceProfileId: profile.profileId, profileHash: archive.profileHash,
    reusedApprovedTake: false, segments: composed.timeline, durationSeconds: composed.verification.wav.durationSeconds, bytes: composed.wav.length, generatedAt: new Date().toISOString(), sampleRate: 44100, channels: 1, bitsPerSample: 16, engineVersion: await client.version(), segmentsProfile: profile.profileId, sha256: composed.verification.wav.sha256,
    technicalChecks: composed.verification.checks, sourceScriptRevision: sourceScript.revisionId });
}
// Original procedural sounds, generated locally; no third-party recordings or licenses.
const sfx = [];
for (const [name, durationMs, frequencies] of [ ['boot', 1600, [180, 270, 540]], ['glitch', 900, [73, 151, 307]], ['puzzle', 650, [330, 440]],
  ['integrate', 1800, [220, 330, 440]], ['auth', 650, [660, 880]], ['unlock', 900, [180, 360]],
  ['warning', 900, [180, 240]], ['hostile', 1600, [65, 98]], ['rumble', 1400, [48, 71]], ['shutdown', 850, [170, 85]], ['recovery', 1600, [220, 440, 660]] ]) {
  const samples = Math.round(durationMs * 44.1); const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const t = i / 44100; const envelope = Math.min(1, t / .08, (durationMs / 1000 - t) / .3);
    const signal = frequencies.reduce((sum, f) => sum + Math.sin(2 * Math.PI * f * t), 0) / frequencies.length;
    data.writeInt16LE(Math.round(signal * Math.max(0, envelope) * 4500), i * 2);
  }
  const wav = encodePcm(data); const audioPath = `assets/audio/production-sfx-${name}.wav`;
  await fs.writeFile(`public/${audioPath}`, wav);
  sfx.push({ id: `prod-sfx-${name}`, name: `SFX ${name}`, path: audioPath, mimeType: 'audio/wav', durationMs, sha256: createHash('sha256').update(wav).digest('hex'), attribution: 'Original procedural audio; project authors; no third-party sample' });
}
await fs.writeFile('config/production-speech/yokogawa-ai-v2.json', `${JSON.stringify({ schemaVersion: 2, manifestId: 'yokogawa-ai-v2', sourceScript, voiceProfileId: profile.profileId,
  profileHash: archive.profileHash, archiveManifest: 'yokogawa-ai-v1.json', speeches: speeches.sort((a, b) => a.scriptId.localeCompare(b.scriptId)), sfx }, null, 2)}\n`);
console.log(`${speeches.length} active speeches; 18 original WAVs preserved; ${sfx.length} original SFX`);
