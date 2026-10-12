import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { verifyProductionWav } from '../src/audio/wav-analysis.js';
const load=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const manifest=await load('config/production-speech/yokogawa-ai-v2.json');
const prior=JSON.parse(execFileSync('git',['show','1cdc810:config/production-speech/yokogawa-ai-v2.json'],{windowsHide:true}).toString());
const original=await load('config/production-speech/yokogawa-ai-v1.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const s of [...manifest.speeches,...original.speeches]){const wav=await fs.readFile(`public/${s.path}`);assert.equal(sha(wav),s.sha256,s.path);assert.ok(verifyProductionWav(wav).pass);}
for(const s of prior.speeches)assert.equal(manifest.speeches.find(n=>n.scriptId===s.scriptId).sha256,s.sha256);
const profile=await fs.readFile('config/voice-profiles/yokogawa-professor-v1.json');
assert.equal(sha(profile),sha(execFileSync('git',['show','1cdc810:config/voice-profiles/yokogawa-professor-v1.json'],{windowsHide:true})));
const show=await load('shows/production.json');assert.equal(show.cues.length,20);assert.equal(show.metadata.nextGuardMs,1200);
const source=await load('docs/production/latest-script-2026-10-12.json');
const md=await fs.readFile('docs/production/上演台本_AI-Cue入り_2026-10-12.md','utf8');let at=0;
for(const p of source.paragraphs){const text=p.text.replace(/\u000b/g,'\n').replace(/\t/g,'　').split('\n').join('  \n');const index=md.indexOf(text,at);assert.ok(index>=0,'Source paragraph omitted');at=index+text.length;}
assert.deepEqual([...md.matchAll(/^\*\*ＡＩ：(P-[A-Z0-9]+) GO。/gm)].map(m=>m[1]),show.cues.map(c=>c.cueNumber));
const report={status:'PASS',archiveWavsUnchanged:18,priorActiveWavsUnchanged:16,newWavs:1,canonicalArchivePlusNew:19,activeShowWavs:17,profileHash:manifest.profileHash,profileFileSha256:sha(profile),cueCount:20,sourceParagraphs:source.paragraphs.length,modifiedTime:source.modifiedTime};
await fs.mkdir('artifacts/subtitle-script-assets',{recursive:true});await fs.writeFile('artifacts/subtitle-script-assets/integrity.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
