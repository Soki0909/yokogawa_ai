import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {analysePcmWav} from '../src/audio/wav-analysis.js';
import {StateStore} from '../src/state-store.js';
import {resolveProductionSlots,applyProductionSlots} from '../src/production-asset-slots.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const pcm=b=>{let at=12;while(b.toString('ascii',at,at+4)!=='data')at+=8+b.readUInt32LE(at+4)+(b.readUInt32LE(at+4)%2);return b.subarray(at+8,at+8+b.readUInt32LE(at+4));};
test('only audited Cue first WAVs have exactly one 700ms prefix; original mono/stereo PCM and later gauge retained',async()=>{
 const report=JSON.parse(await fs.readFile('config/production-speech/first-wav-leadin-20261017.json')),show=JSON.parse(await fs.readFile('shows/production.json'));
 const store=new StateStore({storage:{async save(){}}});store.importShowFile(show,{apply:true});applyProductionSlots(store,await resolveProductionSlots('public'));
 assert.deepEqual(report.results.map(r=>r.cue),['P-001','P-005','P-019','P-011','P-012','P-013','P-015','P-V06','P-V07','P-020','P-021']);
 assert.equal(report.results.length,11);assert.equal(report.silentCues.length,5);assert.equal(store.state.assets.filter(a=>a.mimeType==='audio/wav').length,25);
 for(const r of report.results){
  const before=execFileSync('git',['show',r.sourceCommit+':public/'+(r.sourcePath??r.path)],{maxBuffer:8*1024*1024}),after=await fs.readFile('public/'+r.path),info=analysePcmWav(after),prefixBytes=r.frames*info.channels*2,data=pcm(after);
  assert.equal(r.frames/info.sampleRate,.7);assert.equal(data.length,pcm(before).length+prefixBytes);assert.ok(data.subarray(prefixBytes).equals(pcm(before)),r.cue+' exact PCM suffix');assert.equal(hash(after),r.sha256);assert.equal(hash(pcm(before)),r.sourcePcmSha256);
  let energy=0;for(let i=0;i<prefixBytes;i+=2){const sample=data.readInt16LE(i);assert.ok(Math.abs(sample)<=32);energy+=sample*sample;}assert.ok(energy>0);
  const cue=store.state.cues.find(c=>c.cueNumber===r.cue),events=[...(cue.audio.speechMode==='audio-file'?[{assetId:cue.audio.assetId,atMs:cue.timing.speechDelayMs}]:[]),...cue.sfx].sort((a,b)=>a.atMs-b.atMs);assert.equal(events[0].assetId,r.assetId,r.cue+' actual first WAV');
 }
 for(const entry of report.excludedCues){
  const before=JSON.parse(execFileSync('git',['show',entry.sourceCommit+':shows/production.json']));const original=before.cues.find(c=>c.cueNumber===entry.cue);assert.deepEqual(show.cues.find(c=>c.cueNumber===entry.cue),original,entry.cue+' original timing and subtitles');
  const asset=before.assets.find(a=>a.id===entry.assetId);assert.ok((await fs.readFile('public/'+asset.path)).equals(execFileSync('git',['show',entry.sourceCommit+':public/'+asset.path],{maxBuffer:8*1024*1024})),entry.cue+' original WAV');
 }
 const p13=store.state.cues.find(c=>c.cueNumber==='P-013'),p14=store.state.cues.find(c=>c.cueNumber==='P-014');assert.notEqual(p13.sfx[0].assetId,p14.sfx[0].assetId);assert.equal(p13.timing.speechDelayMs-p14.timing.speechDelayMs,700);
 for(const number of report.silentCues){const cue=store.state.cues.find(c=>c.cueNumber===number);assert.equal(cue.audio.speechMode,'none');assert.equal(cue.sfx.length,0);}
 const unlock=store.state.cues.find(c=>c.cueNumber==='P-012'),recovery=store.state.cues.find(c=>c.cueNumber==='P-V07');assert.equal(unlock.gaugeSfx.atMs,5219);assert.equal(unlock.gaugeSfx.maxDurationMs,5000);assert.equal(recovery.sfx.find(s=>s.assetId==='prod-sfx-gauge-recovery-leadin').maxDurationMs,4500);assert.equal(recovery.recoverySfx.atMs,5300);
 const originalWarning=execFileSync('git',['show',report.sourceCommit+':public/assets/audio/production-warning.wav'],{maxBuffer:4*1024*1024});assert.ok((await fs.readFile('public/assets/audio/production-warning.wav')).equals(originalWarning),'P014 warning PCM unchanged');
 const originalGauge=execFileSync('git',['show',report.sourceCommit+':public/assets/audio/production-gauge.wav'],{maxBuffer:4*1024*1024});assert.equal(hash(await fs.readFile('public/assets/audio/production-gauge.wav')),hash(originalGauge));
 assert.equal(show.cues.length,24);assert.equal(show.metadata.nextGuardMs,1500);
});
