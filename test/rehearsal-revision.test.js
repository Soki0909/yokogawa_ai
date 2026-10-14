import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {StateStore} from '../src/state-store.js';
const show=JSON.parse(await fs.readFile('shows/production.json'));
test('emergency readyCue selects the exact next GO without execution, tracks skipped positions, and rejects invalid targets',()=>{
 let tick=0;const store=new StateStore({storage:{async save(){}},monotonic:()=>tick});store.importShowFile(show,{apply:true});
 store.registerDisplay({displayId:'stage'});store.setAudioMaster('stage');store.setDisplayAudioReady('stage',true);
 store.nextCue();const history=store.state.history.length;
 store.readyCue('prod-011');assert.equal(store.snapshot().nextCue.cueId,'prod-011');assert.equal(store.state.history.length,history);assert.equal(store.state.cueMove.ready,true);
 assert.ok(store.state.cueMove.skipped.includes('P-V02'));assert.equal(store.nextCue().cue.cueId,'prod-011');assert.equal(store.state.cueMove.ready,false);
 const index=store.state.currentCueIndex;assert.throws(()=>store.readyCue('missing'),/CUE_NOT_FOUND/);assert.equal(store.state.currentCueIndex,index);
 store.readyCue('prod-001');assert.equal(store.state.currentCueIndex,-1);assert.equal(store.snapshot().nextCue.cueId,'prod-001');
 store.showReset();assert.equal(store.state.cueMove,null);
});
test('P020 is a newly generated safety statement with matching SHA and preserved approved profile',async()=>{
 const manifest=JSON.parse(await fs.readFile('config/production-speech/yokogawa-ai-v2.json'));const speech=manifest.speeches.find(s=>s.scriptId==='020');
 assert.equal(show.cues.length,20);assert.equal(manifest.speeches.length,17);assert.equal(speech.spokenText,'館内すべての安全を確認しました');assert.equal(speech.displayText,speech.spokenText+'。');
 assert.match(speech.path,/production-rehearsal-020-safety.wav/);assert.equal(show.cues.at(-1).displayText,speech.displayText);assert.equal(show.cues.at(-2).cueNumber,'P-V07');
 const {createHash}=await import('node:crypto');assert.equal(createHash('sha256').update(await fs.readFile('public/'+speech.path)).digest('hex'),speech.sha256);
 assert.equal(speech.effectiveParameters.prePhonemeLength,.1);
});
