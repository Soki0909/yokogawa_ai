import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {PRODUCTION_SLOTS,resolveProductionSlots,applyProductionSlots} from '../src/production-asset-slots.js';
import {StateStore} from '../src/state-store.js';

test('5.3s gauge slot binds only the two gauge starts, survives import, and removes stale effects safely',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'gauge-slot-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const slot of PRODUCTION_SLOTS.filter(s=>!s.optional)){await fs.mkdir(path.dirname(path.join(root,slot.fallback)),{recursive:true});await fs.copyFile(path.join('public',slot.fallback),path.join(root,slot.fallback));}
 const show=JSON.parse(await fs.readFile('shows/production.json','utf8')),store=new StateStore({storage:{async save(){}}});store.importShowFile(show,{apply:true});
 applyProductionSlots(store,await resolveProductionSlots(root));
 assert.equal(store.preflight().items.find(i=>i.id==='asset-slot:gauge').status,'warning');
 assert.ok(store.state.cues.every(c=>!c.sfx.some(s=>s.assetId==='prod-sfx-gauge')));
 const dataSize=48000*5.3*2,wav=Buffer.alloc(44+dataSize);wav.write('RIFF');wav.writeUInt32LE(36+dataSize,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(dataSize,40);
 await fs.writeFile(path.join(root,'assets/audio/production-gauge.wav'),wav);
 await fs.copyFile('public/assets/audio/production-recovery.wav',path.join(root,'assets/audio/production-recovery.wav'));
 const ready=await resolveProductionSlots(root);assert.equal(ready.find(s=>s.id==='gauge').durationMs,5300);
 applyProductionSlots(store,ready);applyProductionSlots(store,ready);
 for(const [id,atMs,maxDurationMs] of [['prod-012',5219,5000],['prod-v-recovery',0,3800]]){
  const cue=store.state.cues.find(c=>c.cueId===id),effects=cue.sfx.filter(s=>s.assetId==='prod-sfx-gauge');
  assert.deepEqual(effects,[{assetId:'prod-sfx-gauge',atMs,volume:.8,maxDurationMs,fadeOutMs:40,durationMs:maxDurationMs}]);
 }
 assert.equal(store.state.assets.filter(a=>a.id==='prod-sfx-gauge').length,1);
 assert.equal(store.state.cues.filter(c=>c.sfx.some(s=>s.assetId==='prod-sfx-gauge')).length,2);
 assert.equal(store.state.cues.find(c=>c.cueId==='prod-v-recovery').sfx.find(s=>s.assetId==='prod-sfx-recovery').atMs,4600);
 const imported=new StateStore({storage:{async save(){}}});imported.importShowFile(store.exportShowFile(),{apply:true});assert.deepEqual(imported.state.cues.find(c=>c.cueId==='prod-012').gaugeSfx,{atMs:5219,volume:.8,maxDurationMs:5000,fadeOutMs:40});assert.equal(imported.state.cues.find(c=>c.cueId==='prod-012').sfx.find(s=>s.assetId==='prod-sfx-gauge').maxDurationMs,5000);
 await fs.writeFile(path.join(root,'assets/audio/production-gauge.wav'),'invalid');applyProductionSlots(store,await resolveProductionSlots(root));
 assert.equal(store.productionAssetSlots.find(s=>s.id==='gauge').status,'INVALID');assert.ok(store.state.cues.every(c=>!c.sfx.some(s=>s.assetId==='prod-sfx-gauge')));
 assert.ok(store.state.cues.find(c=>c.cueId==='prod-v-recovery').sfx.some(s=>s.assetId==='prod-sfx-recovery'));
 await fs.unlink(path.join(root,'assets/audio/production-gauge.wav'));applyProductionSlots(store,await resolveProductionSlots(root));assert.equal(store.productionAssetSlots.find(s=>s.id==='gauge').status,'MISSING');
 assert.equal(store.state.assets.some(a=>a.id==='prod-sfx-gauge'),false);
});
