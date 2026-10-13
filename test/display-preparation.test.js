import test from 'node:test';
import assert from 'node:assert/strict';
import { warmAudioOutput, prepareDisplayImages, PresentationRenderCache } from '../public/js/display-preparation.js';

test('silent preparation never connects a source, waits for device resume, and closes on failure', async () => {
  let closed=0, resumed=0;
  class Context { async resume(){resumed++;} async close(){closed++;} createOscillator(){throw Error('must never produce a tone');} }
  await warmAudioOutput({Context});assert.equal(resumed,1);assert.equal(closed,1);
  class Failing extends Context { async resume(){throw Error('device unavailable');} }
  await assert.rejects(warmAudioOutput({Context:Failing}),/device unavailable/);assert.equal(closed,2);
  class Suspended extends Context { resume(){return new Promise(()=>{});} }
  await assert.rejects(warmAudioOutput({Context:Suspended,timeoutMs:5}),/タイムアウト/);assert.equal(closed,3);
  const retained=await warmAudioOutput({Context,retain:true});assert.equal(closed,3);await retained.close();assert.equal(closed,4);
});

test('mouth/eye/puzzle decoding completes before readiness, deduplicates, and exposes missing images', async () => {
  const decoded=[];
  class Image { async decode(){decoded.push(this.src);if(this.src==='/missing')throw Error('missing');} }
  const images=await prepareDisplayImages(['/mouth','/eyes','/puzzle','/mouth'],{ImageClass:Image});
  assert.equal(images.length,3);assert.deepEqual(decoded,['/mouth','/eyes','/puzzle']);
  await assert.rejects(prepareDisplayImages(['/missing'],{ImageClass:Image}),/missing/);
});

test('duplicate snapshot cannot rewind animation; replay time, phase, version and reset still render', () => {
  const cache=new PresentationRenderCache();
  const a={id:'anomaly',startedAt:'2026-10-13T00:00:00Z',status:'active',durationMs:2200};
  assert.equal(cache.changed('transition',a),true);assert.equal(cache.changed('transition',{...a}),false);
  assert.equal(cache.changed('transition',{...a,startedAt:'2026-10-13T00:00:03Z'}),true);
  assert.equal(cache.changed('transition',{...a,status:'completed'}),true);
  const v={id:'puzzle-first',assetVersion:'a',visible:true};cache.changed('visual',v);
  assert.equal(cache.changed('visual',{...v,assetVersion:'b'}),true);assert.equal(cache.changed('visual',{...v,visible:false}),true);
  cache.clear();assert.equal(cache.changed('transition',{...a,status:'completed'}),true);
});
