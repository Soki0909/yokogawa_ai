import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {CueCompletion,finiteCueDuration} from '../src/cue-completion.js';import {StateStore} from '../src/state-store.js';
test('NEXT requires actual speech/SE completion AND finite motion/subtitle completion; persistent puzzle does not lock',()=>{
 const cue={cueId:'cue',transition:{durationMs:2000},sequence:[{atMs:2500,visual:{type:'image',visible:true}}],sfx:[{}]};const run=new CueCompletion(cue,{id:'voice'},0);
 assert.equal(finiteCueDuration(cue),3100);assert.match(run.reason(5000),/音声/);run.receipt('speech','voice','completed');assert.match(run.reason(5000),/SE/);
 run.receipt('sfx',0,'completed');assert.equal(run.reason(3099),'演出中');assert.equal(run.reason(3100),'');run.speechStarted({speech:{subtitleUnits:[{endMs:4000}]}},0);assert.equal(run.reason(3200),'字幕表示中');
 run.receipt('speech','voice','error','stale');assert.equal(run.error,null);
 const failed=new CueCompletion(cue,{id:'new'},0);failed.receipt('speech','new','error','failed');assert.match(failed.reason(1000000),/異常停止/);
});
test('canonical NEXT cannot be bypassed by a second Admin, elapsed time, pending prep, or stale audio receipt',async()=>{
 let now=0;const store=new StateStore({storage:{async save(){}},monotonic:()=>now});store.importShowFile(JSON.parse(await fs.readFile('shows/production.json')),{apply:true});
 assert.throws(()=>store.nextCue(),/CUE_NOT_COMPLETE/);store.registerDisplay({displayId:'stage'});store.setAudioMaster('stage');store.setDisplayAudioReady('stage',true);
 const first=store.nextCue();now=100000;assert.throws(()=>store.nextCue(),/CUE_NOT_COMPLETE/);store.cueRun.receipt('speech','old','completed');assert.throws(()=>store.nextCue(),/CUE_NOT_COMPLETE/);
 store.cueRun.receipt('speech',first.message.id,'completed');store.cueRun.receipt('sfx',0,'completed');store.pendingCueRequest=true;assert.throws(()=>store.nextCue(),/CUE_NOT_COMPLETE/);store.pendingCueRequest=false;
 assert.equal(store.nextCue().cue.cueId,'prod-002');store.showReset();assert.equal(store.cueRun,null);
});
