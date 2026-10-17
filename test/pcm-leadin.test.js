import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pcmData} from '../src/audio/speech-composer.js';
import {analysePcmWav} from '../src/audio/wav-analysis.js';
const report=JSON.parse(await fs.readFile('config/production-speech/pcm-leadin-20261017.json'));
const fromGit=p=>execFileSync('git',['show',report.sourceCommit+':'+p],{maxBuffer:8*1024*1024});
const show=JSON.parse(await fs.readFile('shows/production.json')),old=JSON.parse(fromGit('shows/production.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');
test('only seven embedded 700ms prefixes; original PCM, pauses, unaffected Cues and runtime engine preserved',async()=>{
 assert.deepEqual(report.targets,['P-019','P-011','P-012','P-015','P-V06','P-020','P-021']);
 for(const r of report.results){
  const before=fromGit('public/'+r.path),after=await fs.readFile('public/'+r.path),pcm=pcmData(after),original=pcmData(before),info=analysePcmWav(after),prefix=pcm.subarray(0,r.frames*info.channels*2);
  assert.equal(r.frames/info.sampleRate,.7);assert.ok(prefix.some(v=>v!==0));
  for(let i=0;i<prefix.length;i+=2)assert.ok(Math.abs(prefix.readInt16LE(i))<=32);
  assert.ok(pcm.subarray(prefix.length).equals(original),r.cue+' exact original PCM');assert.equal(hash(original),r.sourcePcmSha256);assert.equal(hash(after),r.sha256);assert.equal(info.fullScaleSamples,0);
  const cue=show.cues.find(c=>c.cueNumber===r.cue),previous=old.cues.find(c=>c.cueNumber===r.cue),expected=structuredClone(previous);
  expected.speech.segments=expected.speech.segments.map(s=>({...s,startMs:s.startMs+700,endMs:s.endMs+700,...(s.path===r.path?{sha256:r.sha256}:{})}));expected.speech.subtitleUnits=expected.speech.subtitleUnits.map(s=>({...s,startMs:s.startMs+700,endMs:s.endMs+700}));
  if(['P-011','P-012'].includes(r.cue)){expected.sequence=expected.sequence.map(p=>({...p,atMs:p.atMs>0?p.atMs+700:0}));expected.transition.durationMs+=700;if(expected.gaugeSfx)expected.gaugeSfx.atMs+=700;}
  expected.operatorNote=cue.operatorNote;assert.deepEqual(cue,expected);assert.deepEqual(cue.timing,previous.timing,'no JavaScript or Cue-delay workaround');
 }
 const expanded=JSON.parse(await fs.readFile('config/production-speech/first-wav-leadin-20261017.json'));
 const selected=new Set(expanded.results.map(r=>r.cue)),ids=new Set(expanded.results.map(r=>r.path));
 for(const cue of show.cues.filter(c=>!selected.has(c.cueNumber)))assert.deepEqual(cue,old.cues.find(c=>c.id===cue.id));
 for(const a of old.assets.filter(a=>a.mimeType==='audio/wav'&&!ids.has(a.path)))assert.equal(hash(await fs.readFile('public/'+a.path)),hash(fromGit('public/'+a.path)));
 for(const p of ['public/js/production-audio-engine.js','src/server.js','src/cue-scheduler.js','config/voice-profiles/yokogawa-professor-v1.json'])assert.equal((await fs.readFile(p,'utf8')).replaceAll('\r\n','\n'),fromGit(p).toString().replaceAll('\r\n','\n'));
 assert.equal(show.cues.length,24);assert.equal(show.metadata.nextGuardMs,1500);
});
