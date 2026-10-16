import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { sentenceTexts, subtitleUnits, TypewriterCaption } from '../public/js/subtitle-units.js';
import { PRODUCTION_SLOTS, resolveProductionSlots, applyProductionSlots } from '../src/production-asset-slots.js';
import { normalizeCue, validateShowFile } from '../src/show-schema.js';
import { StateStore } from '../src/state-store.js';
const show = JSON.parse(await fs.readFile('shows/production.json','utf8'));

test('STOP clears canonical caption and BLACKOUT cache; RESTORE cannot bring stopped speech back', () => {
  const store=new StateStore({storage:{async load(){},async save(){}}});store.importShowFile(show,{apply:true});store.registerDisplay({displayId:'stage'});store.executeCue('prod-003');
  store.state.previousVisualState={currentSubtitle:store.state.currentSubtitle,currentPresetId:'normal',currentAvatar:store.state.currentAvatar};store.state.blackout=true;
  store.stopPresentation();assert.equal(store.state.currentSubtitle,null);assert.equal(store.state.displays[0].currentSubtitle,null);store.clearBlackout();assert.equal(store.state.currentSubtitle,null);
});

test('all Production speech uses typewriter and one grammatical sentence per display', () => {
  for (const cue of show.cues.filter(c => c.kind === 'speech-display')) {
    assert.equal(cue.speech.subtitleMode,'typewriter'); assert.equal(normalizeCue(cue).speech.subtitleMode,'typewriter');
    const units = subtitleUnits(cue.speech, cue.displayText);
    assert.deepEqual(units.map(u => u.displayText), sentenceTexts(cue.displayText));
    assert.equal(units.map(u => u.displayText).join(''),cue.displayText);
    assert.ok(units.every((u,i) => u.endMs > u.startMs && (!i || u.startMs >= units[i-1].endMs)));
  }
  const cue = show.cues.find(c => c.id === 'prod-002'); const units = subtitleUnits(cue.speech,cue.displayText);
  assert.equal(cue.speech.segments.length,3); assert.equal(units.length,2);
  assert.equal(units[1].displayText,'例えば、そちらに久安光さんが参加しています。');
  assert.equal(units[1].startMs,cue.speech.segments[1].startMs); assert.equal(units[1].endMs,cue.speech.segments[2].endMs);
  assert.match(cue.speech.spokenText,/ヒサヤス ヒカル/);
  assert.equal(sentenceTexts('……待機。数字1.2、AIの"ready"です！？次です').length,3);
  assert.equal(subtitleUnits({segments:[{displayText:'長'.repeat(200),startMs:0,endMs:10000}]},'長'.repeat(200)).length,1);
  assert.ok(subtitleUnits({},'自由発話。次の文。').every(unit=>unit.endMs-unit.startMs>=400));
});

test('typewriter starts empty, short/long reveal progressively; state echo and cancelled callbacks cannot mutate', () => {
  let clock=0; const callbacks=[]; const renders=[];
  const writer = new TypewriterCaption((text,full) => renders.push({text,full}),{now:()=>clock,request:fn=>{callbacks.push(fn);return callbacks.length;},cancel:()=>{}});
  writer.reveal('認証できません',1000); assert.equal(renders.at(-1).text,'');
  clock=300; callbacks.shift()(); assert.ok(renders.at(-1).text.length>0 && renders.at(-1).text.length<7);
  const before=renders.length; writer.stable('認証できません'); assert.equal(renders.length,before);
  const stale=callbacks.shift(); writer.stop();writer.stable('');clock=1000;stale();assert.equal(renders.at(-1).text,'');
  writer.reveal('新しい文',1000);const old=callbacks.shift();writer.reveal('次の文',1000);old();assert.equal(renders.at(-1).full,'次の文');assert.equal(renders.at(-1).text,'');
  clock=2000;callbacks.shift()();assert.equal(renders.at(-1).text,'次の文');
});

test('latest script diffs preserve recovery and add separate Scene7 confirmation; no AI gathering cue', () => {
  const invalid=structuredClone(show);invalid.cues.find(c=>c.id==='prod-001').speech.subtitleUnits=[null];assert.equal(validateShowFile(invalid).valid,false);
  assert.equal(show.cues.length,24);assert.equal(show.metadata.nextGuardMs,1500);
  assert.deepEqual(show.cues.filter(c=>c.scene==='scene-5').map(c=>[c.id,c.audio.speechMode]),[['prod-v-riddle-close','none']]);
  const recovery=show.cues.find(c=>c.id==='prod-v-recovery'); const confirmation=show.cues.find(c=>c.id==='prod-020');
  assert.equal(recovery.sequence.at(-1).presentationPreset,'normal');assert.equal(recovery.audio.speechMode,'none');
  assert.equal(confirmation.id,'prod-020');assert.equal(confirmation.scene,'scene-7');assert.equal(confirmation.displayText,'館内すべての安全を確認しました。');assert.equal(confirmation.presentationPreset,'normal');
  assert.match(confirmation.triggerNote,/夢野・押野・三馬/);assert.match(show.cues.find(c=>c.id==='prod-v-emergency-riddle').triggerNote,/USB/);
  assert.ok(show.cues.find(c=>c.id==='prod-013').displayText.endsWith('。'));
  const first=show.cues.find(c=>c.id==='prod-013'), second=show.cues.find(c=>c.id==='prod-014');assert.equal(first.sfx[0].assetId,second.sfx[0].assetId);
  assert.ok(show.cues.every(c=>(c.sfx??[]).every(s=>!['prod-sfx-auth','prod-sfx-unlock','prod-sfx-hostile','prod-sfx-rumble'].includes(s.assetId))));
});

test('slots missing/present/invalid resolve safely, share warning and validate bytes', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'subtitle-slots-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  for(const slot of PRODUCTION_SLOTS.filter(s=>!s.optional)){await fs.mkdir(path.dirname(path.join(root,slot.fallback)),{recursive:true});await fs.copyFile(path.join('public',slot.fallback),path.join(root,slot.fallback));}
  assert.ok((await resolveProductionSlots(root)).every(s=>s.status==='MISSING'));
  for(const slot of PRODUCTION_SLOTS.filter(s=>s.mimeType==='audio/wav'&&!s.optional))await fs.copyFile(path.join('public',slot.fallback),path.join(root,slot.path));
  let slots=await resolveProductionSlots(root);assert.equal(slots.filter(s=>s.status==='READY').length,3);
  for(const slot of slots.filter(s=>s.status==='READY')) assert.equal(slot.sha256,createHash('sha256').update(await fs.readFile(path.join(root,slot.path))).digest('hex'));
  for(const slot of PRODUCTION_SLOTS.filter(s=>s.mimeType==='image/png')) await fs.copyFile('public/assets/avatar/yokogawa/v1/base.png',path.join(root,slot.path));
  slots=await resolveProductionSlots(root);assert.equal(slots.filter(s=>s.status==='READY').length,6);
  const store=new StateStore({storage:{async load(){},async save(){}}});store.importShowFile(show,{apply:true});
  applyProductionSlots(store,slots.map(s=>s.id==='warning'?{...s,durationMs:300}:s));
  assert.equal(store.state.cues.find(c=>c.cueId==='prod-013').timing.speechDelayMs,300);
  assert.ok(store.preflight().items.filter(i=>i.id.startsWith('asset-slot:') && !['asset-slot:recovery','asset-slot:gauge'].includes(i.id)).every(i=>i.status==='ok'));
  assert.equal(store.state.cues.find(c=>c.cueId==='prod-v-recovery').sfx.length,0);
  assert.equal(store.productionAssetSlots.find(s=>s.id==='recovery').status,'MISSING');
  const missingRecovery = store.preflight().items.find(i=>i.id==='asset-slot:recovery');
  assert.equal(missingRecovery.status,'warning');assert.match(missingRecovery.detail,/MISSING/);
  await fs.copyFile('public/assets/audio/production-sfx-boot.wav',path.join(root,'assets/audio/production-recovery.wav'));
  applyProductionSlots(store,await resolveProductionSlots(root));
  const recovery=store.state.cues.find(c=>c.cueId==='prod-v-recovery');assert.equal(recovery.sfx[0].atMs,4600);assert.equal(recovery.sfx[0].assetId,'prod-sfx-recovery');
  assert.equal(store.state.assets.filter(a=>a.id==='prod-sfx-recovery').length,1);
  await fs.writeFile(path.join(root,PRODUCTION_SLOTS[3].path),Buffer.from([137,80,78,71,13,10,26,10]));assert.equal((await resolveProductionSlots(root))[3].status,'INVALID');
  await fs.writeFile(path.join(root,PRODUCTION_SLOTS[0].path),'invalid');slots=await resolveProductionSlots(root);assert.equal(slots[0].status,'INVALID');assert.equal(slots[0].resolvedPath,slots[0].fallback);
});
