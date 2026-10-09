import fs from 'node:fs/promises';
import { AivisSpeechClient } from '../src/tts/aivis-speech-client.js';
import { loadProductionVoiceProfile } from '../src/voice-profile.js';
import { verifyProductionWav } from '../src/audio/wav-analysis.js';
const client = new AivisSpeechClient(); const profile = await loadProductionVoiceProfile();
const speakers = await client.speakers(); const sample = '承知しました。横川AIを起動します。条件の達成を確認。最終問題の回答を入力しなさい。';
await fs.mkdir('public/assets/audio/voice-comparison', { recursive: true });
const candidates = [];
for (const speaker of speakers) {
  const info = await (await client.request(`/speaker_info?speaker_uuid=${speaker.speaker_uuid}`)).json();
  const style = speaker.styles.find(s => s.name === 'Calm') ?? speaker.styles.find(s => /おちつき/.test(s.name)) ?? speaker.styles[0];
  const query = client.applyProfile(await client.audioQuery(sample, style.id), profile);
  const wav = await client.synthesis(query, style.id); const verification = verifyProductionWav(wav);
  if (!verification.pass) throw new Error(`COMPARISON_WAV:${speaker.name}`);
  const filename = `${speaker.speaker_uuid}.wav`; await fs.writeFile(`public/assets/audio/voice-comparison/${filename}`, wav);
  candidates.push({ name: speaker.name, uuid: speaker.speaker_uuid, style: style.name, version: speaker.version, policy: info.policy, default: speaker.speaker_uuid === profile.speaker.uuid, samplePath: `assets/audio/voice-comparison/${filename}`, verification });
}
await fs.writeFile('config/production-speech/voice-comparison.json', JSON.stringify({ sample, defaultProfile: profile.profileId, parameters: profile.parameters, candidates, adoption: 'Human decision required; Production default unchanged' }, null, 2));
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
await fs.writeFile('public/voice-comparison.html', `<!doctype html><html lang="ja"><meta charset="utf-8"><title>Voice comparison</title><link rel="icon" href="/assets/avatar/yokogawa/v1/base.png"><link rel="stylesheet" href="/css/admin.css"><link rel="stylesheet" href="/css/production-tools.css"><main><h1>Voice Model比較</h1><p>同じ文章・同じパラメーター。Production defaultは変更していません。新モデル採用は本人・演出判断を待ちます。</p><p>${escape(sample)}</p>${candidates.map(c => `<section class="panel"><h2>${escape(c.name)} / ${escape(c.style)} ${c.default ? '— 現在のdefault' : '— 比較専用'}</h2><audio controls src="/${c.samplePath}"></audio><details><summary>モデル利用条件（エンジン内の原文）</summary><pre>${escape(c.policy)}</pre></details></section>`).join('')}<a href="/production-tools">編集へ戻る</a></main></html>`);
console.log(`Comparison ready: ${candidates.length} models; default unchanged`);
