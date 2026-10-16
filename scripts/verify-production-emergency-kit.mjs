import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {analysePcmWav} from '../src/audio/wav-analysis.js';
import {playbackDurationSeconds} from '../public/js/audio-playback-effects.js';
const root=path.resolve(process.argv[2]||'production-backup'),m=JSON.parse(await fs.readFile(root+'/manifest.json'));
const labels=JSON.parse(await fs.readFile('config/production-backup-cue-labels.json'));
assert.equal(m.cues.length,labels.labels.length);assert.deepEqual(m.cues.map(c=>c.scriptLine),labels.labels);
const hash=b=>createHash('sha256').update(b).digest('hex'),results=[];
for(const cue of m.cues){
 assert.equal(cue.audioFile,cue.scriptLine.replace(/^AI[：:]\s*/,'')+'.wav');
 const bytes=await fs.readFile(path.join(root,'audio',cue.audioFile)),wav=analysePcmWav(bytes);
 assert.equal(wav.sha256,cue.sha256);assert.equal(wav.sampleRate,48000);assert.equal(wav.channels,2);assert.equal(wav.bitsPerSample,16);assert.equal(wav.fullScaleSamples,0);
 assert.ok(Math.abs(wav.durationSeconds-cue.durationSeconds)<1/48000);
 if(cue.hasSound)assert.ok(wav.rms>0.0001);else assert.equal(wav.peak,0);
 let expectedEnd=cue.hasSound?0:1;
 for(const part of cue.parts){const source=await fs.readFile('public/'+part.path);assert.equal(hash(source),part.sha256);expectedEnd=Math.max(expectedEnd,part.atMs/1000+playbackDurationSeconds(analysePcmWav(source).durationSeconds,part.maxDurationMs)+(part.effect==='none'?0:.15));}
 assert.ok(Math.abs(wav.durationSeconds-expectedEnd)<=1/48000+1e-8,'Configured playback window including delayed SE/effect tail retained');
 if(cue.parts.length){const samplesBefore=Math.floor(Math.min(...cue.parts.map(p=>p.atMs))*48)*4;assert.ok(bytes.subarray(44,44+samplesBefore).every(v=>v===0),'Leading Cue delay must be exact digital silence');}
 const image=await fs.readFile(path.join(root,'visual',cue.visualFile));assert.equal(image.readUInt32BE(16),1920);assert.equal(image.readUInt32BE(20),1080);
 results.push({cue:cue.cueNumber,durationSeconds:wav.durationSeconds,peak:wav.peak,hasSound:cue.hasSound,audioSha256:wav.sha256,visualSha256:hash(image)});
}
for(const n of ['01','06','07'])assert.equal(hash(await fs.readFile(`${root}/puzzles/production-puzzle-${n}.png`)),hash(await fs.readFile(`public/assets/visual/production-puzzle-${n}.png`)));
const report={status:'FILE VALIDATION PASS',cues:m.cues.length,audibleCues:results.filter(r=>r.hasSound).length,silentCues:results.filter(r=>!r.hasSound).length,clippedSamples:0,commonExportGainDb:-3,physicalAudio:'NOT VERIFIED',candidateOnly:labels.candidateOnly===true,method:'PCM headers/energy/full-scale check; exact filename/order against label manifest (existing twenty from read-only Docs, four new candidate labels are not yet written to Docs); whole input duration and source SHA; exact leading delay; PNG dimensions and original puzzle SHA. Does not claim physical speaker or perceptual equivalence.',results};
await fs.writeFile(root+'/validation.json',JSON.stringify(report,null,2));
const entries=[];async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())await walk(file);else if(item.name!=='SHA256SUMS.tsv')entries.push({file:file.replaceAll('\\','/').slice(root.length+1),sha:hash(await fs.readFile(file))});}}await walk(root);
await fs.writeFile(root+'/SHA256SUMS.tsv','SHA256\tfile\n'+entries.sort((a,b)=>a.file.localeCompare(b.file)).map(e=>e.sha+'\t'+e.file).join('\n')+'\n');console.log(JSON.stringify({status:report.status,cues:m.cues.length,audible:report.audibleCues,silent:report.silentCues}));
