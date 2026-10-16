import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {CueCompletion,finiteCueDuration} from '../src/cue-completion.js';import {StateStore} from '../src/state-store.js';
test('completion diagnostics track actual speech/SE/motion but are not the operator gate',()=>{
 const cue={cueId:'cue',transition:{durationMs:2000},sequence:[{atMs:2500,visual:{type:'image',visible:true}}],sfx:[{}]};const run=new CueCompletion(cue,{id:'voice'},0);
 assert.equal(finiteCueDuration(cue),3100);assert.match(run.reason(5000),/音声/);run.receipt('speech','voice','completed');assert.match(run.reason(5000),/SE/);
 run.receipt('sfx',0,'completed');assert.equal(run.reason(3099),'演出中');assert.equal(run.reason(3100),'');run.speechStarted({speech:{subtitleUnits:[{endMs:4000}]}},0);assert.equal(run.reason(3200),'字幕表示中');
 run.receipt('speech','voice','error','stale');assert.equal(run.error,null);
 const failed=new CueCompletion(cue,{id:'new'},0);failed.receipt('speech','new','error','failed');assert.match(failed.reason(1000000),/異常停止/);
});
test('NEXT after 1500ms remains available with missing ended/error receipts; true output/preparation failure still blocks',async()=>{
 let now=0;const store=new StateStore({storage:{async save(){}},monotonic:()=>now});store.importShowFile(JSON.parse(await fs.readFile('shows/production.json')),{apply:true});
 assert.throws(()=>store.nextCue(),/AUDIO_NOT_READY/);store.registerDisplay({displayId:'stage'});store.setAudioMaster('stage');store.setDisplayAudioReady('stage',true);store.readyCue('prod-001'); // Exercise a speech Cue, not the new silent prelude.
 const first=store.nextCue();now=1499;assert.throws(()=>store.nextCue(),/NEXT_GUARDED/);now=1500;
 store.cueRun.receipt('speech','old','completed');store.cueRun.error='ended receipt lost';assert.equal(store.cueRun.speech,true);assert.equal(store.nextBlock(),'');
 assert.equal(store.nextCue().cue.cueId,'prod-002');now=3000;
 store.pendingCueRequest=true;assert.throws(()=>store.nextCue(),/AUDIO_NOT_READY/);store.pendingCueRequest=false;
 store.setDisplayAudioReady('stage',false);assert.throws(()=>store.nextCue(),/AUDIO_NOT_READY/);
 assert.equal(first.cue.cueId,'prod-001');store.showReset();assert.equal(store.cueRun,null);
});
