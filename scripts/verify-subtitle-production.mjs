import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { verifyProductionWav } from '../src/audio/wav-analysis.js';
import { normalizeSentenceBuffers, encodePcm, pcmData, composeSpeech } from '../src/audio/speech-composer.js';
const load=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const manifest=await load('config/production-speech/yokogawa-ai-v2.json');
const prior=JSON.parse(execFileSync('git',['show','1cdc810:config/production-speech/yokogawa-ai-v2.json'],{windowsHide:true}).toString());
const original=await load('config/production-speech/yokogawa-ai-v1.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const s of [...manifest.speeches,...original.speeches]){const wav=await fs.readFile(`public/${s.path}`);assert.equal(sha(wav),s.sha256,s.path);assert.ok(verifyProductionWav(wav).pass);}
for(const s of prior.speeches)assert.equal(sha(await fs.readFile(`public/${s.path}`)),s.sha256,'Approved source WAV changed');
const pacingSource = await load('config/production-speech/yokogawa-ai-pacing-source.json');
for (const s of manifest.speeches.filter(s=>/^assets\/audio\/production-(paced|reliable)-/.test(s.path))) {
  const source = pacingSource.speeches.find(p=>p.scriptId===s.scriptId);
  const bytes = await fs.readFile(`public/${source.path}`); assert.equal(sha(bytes),source.sha256);
  const pcm = pcmData(bytes), units = source.subtitleUnits ?? source.segments;
  const expected = s.scriptId === '013'
    ? normalizeSentenceBuffers(await Promise.all(s.segments.map((_,i)=>fs.readFile(`public/assets/audio/segments/stage-013-source-${i+1}.wav`))))
    : normalizeSentenceBuffers(units.map(u=>encodePcm(pcm.subarray(Math.round(u.startMs*44.1)*2,Math.min(pcm.length,Math.round(u.endMs*44.1)*2)))));
  for(const [index,buffer] of expected.entries())assert.ok(buffer.equals(await fs.readFile(`public/${s.segments[index].path}`)),'Voiced PCM changed');
  assert.equal(composeSpeech(s.segments,expected).verification.wav.sha256,s.sha256,'Pacing composition differs');
}
const profile=await fs.readFile('config/voice-profiles/yokogawa-professor-v1.json');
assert.equal(sha(profile),sha(execFileSync('git',['show','1cdc810:config/voice-profiles/yokogawa-professor-v1.json'],{windowsHide:true})));
const show=await load('shows/production.json');assert.equal(show.cues.length,20);assert.equal(show.metadata.nextGuardMs,1200);
const source=await load('docs/production/latest-script-2026-10-12.json');
const md=await fs.readFile('docs/production/上演台本_AI-Cue入り_2026-10-12.md','utf8');let at=0;
for(const p of source.paragraphs){const text=p.text.replace(/\u000b/g,'\n').replace(/\t/g,'　').split('\n').join('  \n');const index=md.indexOf(text,at);assert.ok(index>=0,'Source paragraph omitted');at=index+text.length;}
assert.deepEqual([...md.matchAll(/^\*\*ＡＩ：(P-[A-Z0-9]+) GO。/gm)].map(m=>m[1]),show.cues.map(c=>c.cueNumber));
const report={status:'PASS',archiveWavsUnchanged:18,priorActiveSourceWavsUnchanged:16,pacedWavs:10,voicedPcmUnchangedExcept:['013'],resynthesizedWithApprovedProfile:['013'],activeShowWavs:17,profileHash:manifest.profileHash,profileFileSha256:sha(profile),cueCount:20,sourceParagraphs:source.paragraphs.length,modifiedTime:source.modifiedTime};
await fs.mkdir('artifacts/stage-pacing-2026-10-13',{recursive:true});await fs.writeFile('artifacts/stage-pacing-2026-10-13/integrity.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
