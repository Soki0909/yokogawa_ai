import test from 'node:test';
import assert from 'node:assert/strict';
import {ProductionAudioEngine,BufferedSpeechProvider,BufferedSfxPlayer,outputLeadMs} from '../public/js/production-audio-engine.js';

function fixture(){
 const calls=[];const contexts=[];let requests=0,decodes=0;
 class Node{constructor(type){this.type=type;this.gain={value:1};this.offset={value:1};}connect(){calls.push('connect:'+this.type);}disconnect(){calls.push('disconnect:'+this.type);}start(){calls.push('start:'+this.type);}stop(){calls.push('stop:'+this.type);}}
 class Context{
  constructor(){this.state='suspended';this.clock=0;this.destination={};contexts.push(this);}
  get currentTime(){return this.state==='running'?(this.clock+=.01):this.clock;}
  addEventListener(_,fn){this.change=fn;}async resume(){this.state='running';this.change?.();}async close(){this.state='closed';this.change?.();}
  async decodeAudioData(){decodes++;return {length:44100,numberOfChannels:1,duration:1};}
  createConstantSource(){return new Node('clock');}createGain(){return new Node('gain');}createAnalyser(){return new Node('analyser');}createBufferSource(){const node=new Node('buffer');this.source=node;return node;}
 }
 const statuses=[];const engine=new ProductionAudioEngine({Context,fetchImpl:async()=>{requests++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(44)};},onStatus:s=>statuses.push(s)});
 const assets=[{id:'voice',url:'/voice',sha256:'version1'},{id:'sfx',url:'/sfx'}];
 return {engine,assets,calls,contexts,statuses,counts:()=>({requests,decodes})};
}
test('real decoding is retained and reused for the FIRST and repeated GO, graph connects before start',async()=>{
 const f=fixture();await f.engine.load(f.assets);assert.equal(f.engine.ready,false);await f.engine.verify();
 const marker=f.calls.length;const first=f.engine.play('voice');assert.ok(f.calls.slice(marker,-1).every(c=>c.startsWith('connect:')));assert.equal(f.calls.at(-1),'start:buffer');
 first.source.onended();f.engine.play('voice').stop();await f.engine.load(f.assets);
 assert.deepEqual(f.counts(),{requests:2,decodes:2});assert.equal(f.engine.active.size,0);assert.equal(f.engine.stats().decodedBytes,352800);await f.engine.close();
});
test('Reset cancellation of an in-flight verify cannot downgrade an already healthy output',async()=>{
 const f=fixture();await f.engine.load(f.assets);await f.engine.verify();
 let release;f.engine.context.resume=()=>new Promise(resolve=>{release=resolve;});
 const pending=f.engine.verify();f.engine.stopAll();release();
 await assert.rejects(pending,/取り消し/);assert.equal(f.engine.ready,true);assert.equal(f.engine.context.state,'running');
 await f.engine.close();
});

test('suspend invalidates READY and cancels sound; recovery resumes/render-checks but NEVER replays',async()=>{
 const f=fixture();await f.engine.load(f.assets);await f.engine.verify();let ended=0;const item=f.engine.play('voice',{onEnd:()=>ended++});const oldEnded=item.source.onended;
 f.engine.context.state='suspended';f.engine.context.change();assert.equal(f.engine.ready,false);assert.equal(f.engine.active.size,0);assert.throws(()=>f.engine.play('voice'),/NOT READY/);
 oldEnded();assert.equal(ended,0);const count=f.calls.filter(c=>c==='start:buffer').length;await f.engine.verify();assert.equal(f.calls.filter(c=>c==='start:buffer').length,count);f.engine.play('voice').stop();await f.engine.close();
});
test('closed output creates a new Context while retaining PCM; STOP during resume never arms a source',async()=>{
 const f=fixture();await f.engine.load(f.assets);await f.engine.verify();await f.engine.close();await f.engine.verify();assert.equal(f.contexts.length,2);assert.deepEqual(f.counts(),{requests:2,decodes:2});
 let resume;f.engine.context.state='suspended';f.engine.context.resume=()=>new Promise(r=>resume=r);const pending=f.engine.verify();f.engine.stopAll();resume();await assert.rejects(pending,/取り消し/);assert.equal(f.engine.active.size,0);await f.engine.close();
});
test('failed/late decode and memory limits fail closed; missing/failed sound cannot play',async()=>{
 const f=fixture();let finish;f.engine.fetchImpl=()=>new Promise(r=>finish=r);const loading=f.engine.load(f.assets);f.engine.stopAll();finish({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});await assert.rejects(loading,/取り消し/);assert.equal(f.engine.ready,false);
 const limited=fixture();limited.engine.maxBytes=1;await assert.rejects(limited.engine.load(limited.assets),/上限/);assert.throws(()=>limited.engine.play('voice'),/NOT READY/);await limited.engine.close();await f.engine.close();
});
test('speech and SFX use one output, actual ended receipts; old end after STOP cannot complete/replay',async()=>{
 const f=fixture();await f.engine.load(f.assets);await f.engine.verify();const ends=[];const speech=new BufferedSpeechProvider(f.engine,{onEnd:id=>ends.push(id)});const receipts=[];const sfx=new BufferedSfxPlayer(f.engine,(...args)=>receipts.push(args));
 const old=speech.speak({id:'old',audio:{assetId:'voice'}},{volume:.6});const stale=old.source.onended;speech.stop();stale();assert.deepEqual(ends,[]);
 await sfx.play({assetId:'sfx',volume:.8,index:0},1,'run');const source=f.engine.context.source;source.onended();assert.equal(await sfx.whenIdle('sfx'),true);assert.equal(receipts[0][2],'completed');assert.equal(f.contexts.length,1);await f.engine.close();
});
test('browser output lead is explicit; excessive output latency fails READY instead of silently desynchronizing',async()=>{
 assert.equal(outputLeadMs({baseLatency:.02,outputLatency:.056}),76);
 const f=fixture();await f.engine.load(f.assets);f.engine.context.outputLatency=.5;
 await assert.rejects(f.engine.verify(),/300ms/);assert.equal(f.engine.ready,false);assert.throws(()=>f.engine.play('voice'),/NOT READY/);await f.engine.close();
});
