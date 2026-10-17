import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {StateStore} from '../src/state-store.js';
import {analysePcmWav} from '../src/audio/wav-analysis.js';
import {ShowCurtain} from '../public/js/display-show-curtain.js';
const baseline='da09d3bbcfed8d3d9a2568dd7be621359160ddc7';
const oldFile=p=>execFileSync('git',['show',baseline+':'+p],{maxBuffer:8*1024*1024});
const stable=JSON.parse(oldFile('shows/production.json')),show=JSON.parse(await fs.readFile('shows/production.json','utf8'));
const leadin=JSON.parse(await fs.readFile('config/production-speech/pcm-leadin-20261017.json'));
const allFirst=JSON.parse(await fs.readFile('config/production-speech/first-wav-leadin-20261017.json'));
const affected=new Set(allFirst.results.map(r=>r.cue));
const affectedAssets=new Set(allFirst.results.map(r=>r.assetId));
const sha=b=>createHash('sha256').update(b).digest('hex');
test('candidate has 24 ordered Cues; all twenty existing Cue objects and seventeen voices are unchanged',async()=>{
 assert.equal(show.cues.length,24);assert.equal(new Set(show.cues.map(c=>c.id)).size,24);
 assert.deepEqual(show.cues.filter(c=>stable.cues.some(o=>o.id===c.id)&&!affected.has(c.cueNumber)),stable.cues.filter(c=>!affected.has(c.cueNumber)));
 assert.deepEqual(show.cues.map(c=>c.cueNumber),['P-V00',...stable.cues.slice(0,10).map(c=>c.cueNumber),'P-V03',...stable.cues.slice(10).map(c=>c.cueNumber),'P-V08','P-021']);
 for(const a of stable.assets.filter(a=>a.mimeType==='audio/wav'&&!affectedAssets.has(a.id)))assert.equal(sha(await fs.readFile('public/'+a.path)),sha(oldFile('public/'+a.path)),a.id);
 for(const p of ['public/assets/audio/production-recovery.wav',...['01','06','07'].map(n=>'public/assets/visual/production-puzzle-'+n+'.png')])assert.equal(sha(await fs.readFile(p)),sha(oldFile(p)),p);
 for(const p of ['config/voice-profiles/yokogawa-professor-v1.json','public/js/production-audio-engine.js','public/js/audio-playback-effects.js','src/server.js','src/cue-scheduler.js'])assert.equal((await fs.readFile(p,'utf8')).replaceAll('\r\n','\n'),oldFile(p).toString().replaceAll('\r\n','\n'),p+' is outside this change scope');
 assert.equal(show.metadata.nextGuardMs,1500);
});
test('gauge alone is exactly -3dB relative to the stable take with fixed length, no clipping and unchanged cutoff metadata',async()=>{
 const old=analysePcmWav(oldFile('public/assets/audio/production-gauge.wav')),now=analysePcmWav(await fs.readFile('public/assets/audio/production-gauge.wav'));
 assert.ok(Math.abs(20*Math.log10(now.rms/old.rms)+3)<.001);assert.equal(now.dataBytes,old.dataBytes);assert.equal(now.fullScaleSamples,0);
 for(const id of ['prod-012'])assert.deepEqual(show.cues.find(c=>c.id===id).gaugeSfx,{...stable.cues.find(c=>c.id===id).gaugeSfx,atMs:stable.cues.find(c=>c.id===id).gaugeSfx.atMs+(id==='prod-012'?700:0)});
});
test('Reset and Scene 1 are dark; new Cue transitions do not latch emergency blackout or auto advance',()=>{
 let clock=Date.parse('2026-10-17T00:00:00Z');const store=new StateStore({storage:{async save(){}},now:()=>new Date(clock)});store.importShowFile(show,{apply:true});store.registerDisplay({displayId:'stage'});
 assert.equal(store.snapshot().currentOutputFade.to,0);assert.equal(store.displaySnapshot('stage').currentOutputFade.to,0);assert.equal(store.snapshot().nextCue.cueNumber,'P-V00');
 const prelude=store.executeCue('prod-v-prelude');assert.equal(prelude.message,null);assert.equal(store.state.currentOutputFade.status,'active');clock+=2501;assert.equal(store.snapshot().currentOutputFade.status,'completed');
 store.executeCue('prod-v-riddle-close');assert.equal(store.state.currentVisual.visible,false);assert.equal(store.state.currentSubtitle,null);assert.equal(store.state.currentPresetId,'hijacked');assert.equal(store.snapshot().nextCue.cueNumber,'P-011');clock+=60000;assert.equal(store.snapshot().currentCue.cueNumber,'P-V03');
 store.executeCue('prod-v-curtain-black');store.stopPresentation();assert.equal(store.state.blackout,false);assert.equal(store.state.currentOutputFade.to,0);assert.equal(store.state.currentOutputFade.status,'stopped');
 const exit=store.executeCue('prod-021');assert.equal(exit.cue.timing.speechDelayMs,2200);assert.equal(store.state.blackout,false);assert.equal(store.state.currentOutputFade.to,1);assert.equal(store.state.currentSubtitle,null);
 store.stabilizePresentation();assert.equal(store.state.currentOutputFade.status,'completed');assert.equal(store.state.currentOutputFade.startedAt,null);
 store.startRehearsal();store.startSceneRehearsal('scene-1');assert.equal(store.state.currentOutputFade.to,0);store.showReset();assert.equal(store.state.currentOutputFade.to,0);
});
test('P021 reuses the exact approved Profile and six sentence units, with existing boundary composition',async()=>{
 const m=JSON.parse(await fs.readFile('config/production-speech/post-show-021.json')),profile=JSON.parse(oldFile('config/voice-profiles/yokogawa-professor-v1.json'));
 assert.deepEqual(m.effectiveParameters,profile.parameters);assert.equal(m.profileHash,profile.source.sha256);assert.equal(m.segments.length,6);
 const wav=analysePcmWav(await fs.readFile('public/'+m.path));assert.equal(wav.sha256,m.sha256);assert.equal(wav.bitsPerSample,16);assert.equal(wav.fullScaleSamples,0);
 assert.deepEqual(m.pacing.pauseAfterMs,[450,650,350,650,350,0]);assert.equal(m.subtitleUnits.map(s=>s.displayText).join(''),m.displayText);
 assert.ok(m.subtitleUnits.every(s=>s.displayText.endsWith('。')&&!/[…⋯]/.test(s.displayText)));assert.equal(m.subtitleUnits[0].startMs,700);
});
test('curtain renderer ignores state echoes, catches up only current visual time, and cancels without deferred callbacks',()=>{
 const animations=[],element={style:{},animate(frames,options){const a={frames,options,cancelled:false,cancel(){this.cancelled=true;}};animations.push(a);return a;}};
 const renderer=new ShowCurtain(element,{now:()=>1000}),fade={from:0,to:1,durationMs:2500,startedAt:new Date(0).toISOString(),status:'active'};
 renderer.render(fade);assert.equal(animations[0].currentTime,1000);renderer.render({...fade});assert.equal(animations.length,1);
 renderer.stop();assert.equal(animations[0].cancelled,true);assert.equal(element.style.opacity,'0');renderer.reset(true);assert.equal(element.style.opacity,'1');
 renderer.render({...fade,status:'completed'});assert.equal(animations.length,1);assert.equal(element.style.opacity,'0');
});
