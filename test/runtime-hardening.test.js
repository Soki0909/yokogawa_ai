import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { StateStore } from '../src/state-store.js';
import { CueScheduler } from '../src/cue-scheduler.js';
test('canonical NEXT accepts once per 1200ms burst; failed validation and clock jumps cannot advance', async () => {
  let tick = 0;
  const store = new StateStore({ storage: { async save() {} }, monotonic: () => tick });
  store.importShowFile(JSON.parse(await readFile('shows/production.json')), { apply: true });
  store.state.metadata.reliableAudio=false; // Isolate the 1200ms guard; completion barrier has its own integration tests.
  assert.equal(store.nextCue({ validate: () => false }), null); assert.equal(store.state.currentCueIndex, -1);
  store.nextCue();
  for (let i=0;i<5;i++) assert.throws(() => store.nextCue(), /NEXT_GUARDED/);
  tick = 1199; assert.throws(() => store.nextCue(), /NEXT_GUARDED/);
  assert.equal(store.state.currentCueIndex, 0); tick=1200; assert.equal(store.nextCue().cue.cueId, 'prod-002');
  store.showReset(); assert.equal(store.nextCue().cue.cueId, 'prod-001');
});
test('scheduler suppresses a suspended process catch-up burst', () => {
  let tick=0; const pending=[]; const played=[];
  const scheduler=new CueScheduler({ now:()=>tick, setTimer:cb=>{pending.push(cb);return pending.length;},clearTimer(){} });
  scheduler.onStall=()=>played.push('recovery');
  scheduler.schedule(1000,()=>played.push('speech')); scheduler.schedule(2000,()=>played.push('sfx'));
  tick=3600000; pending.forEach(cb=>cb()); assert.deepEqual(played,['recovery']); assert.equal(scheduler.timers.size,0);
});
test('merged current Cue can restore stable final state after freeze without live speech', async () => {
  const store=new StateStore({storage:{async save(){}}}); const show=JSON.parse(await readFile('shows/production.json'));
  store.importShowFile(show,{apply:true}); assert.equal(show.cues.length,20);
  assert.ok(!show.cues.some(c=>['prod-v-incident','prod-v-unlock'].includes(c.id)));
  store.executeCue('prod-012'); store.stabilizePresentation();
  assert.equal(store.state.currentOverlay.variant,'anomaly'); assert.equal(store.state.unlock.status,'completed');
  assert.equal(store.state.currentTransition.status,'completed'); assert.equal(store.state.currentTransition.effect.status,'completed');
  assert.equal(store.state.currentSubtitle,null); assert.equal(store.state.currentMessage,null);
});
test('wall clock jump before a pending callback cancels it before watchdog tick', () => {
  let tick=0;let wall=0;let callback;let fired=false;let recovered=false;
  const scheduler=new CueScheduler({now:()=>tick,wall:()=>wall,setTimer:cb=>{callback=cb;return 1;},clearTimer(){}});
  scheduler.onStall=()=>{recovered=true;};scheduler.schedule(1000,()=>{fired=true;});tick=1000;wall=7201000;callback();
  assert.equal(fired,false);assert.equal(recovered,true);
});
test('recovery sanitizes the BLACKOUT restore cache so RESTORE cannot resurrect speech captions', async () => {
  const store=new StateStore({storage:{async save(){}}});
  store.importShowFile(JSON.parse(await readFile('shows/production.json')),{apply:true});
  store.executeCue('prod-003');
  store.state.previousVisualState={currentSubtitle:store.state.currentSubtitle,currentPresetId:'normal',currentAvatar:structuredClone(store.state.currentAvatar)};
  store.state.blackout=true;store.stabilizePresentation();store.clearBlackout();
  assert.equal(store.state.currentSubtitle,null);assert.equal(store.state.blackout,false);
});
