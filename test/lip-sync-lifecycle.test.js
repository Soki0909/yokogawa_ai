import test from 'node:test';
import assert from 'node:assert/strict';
import { LipSyncController } from '../public/js/lip-sync.js';

test('WAVs reuse prepared output but detach every source; STOP disposes the device', async () => {
  const saved={Context:globalThis.AudioContext,request:globalThis.requestAnimationFrame,cancel:globalThis.cancelAnimationFrame};
  let created=0,closed=0,connected=0,disconnected=0;
  class Node { connect(){connected++;} disconnect(){disconnected++;} }
  class Context { constructor(){created++;this.state='running';this.destination={};}async resume(){}async close(){closed++;this.state='closed';}createMediaElementSource(){return new Node();}createAnalyser(){const n=new Node();n.getByteTimeDomainData=data=>data.fill(128);return n;} }
  globalThis.AudioContext=Context;globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  try {
    const controller=new LipSyncController({dataset:{}});
    await controller.prepare();assert.equal(created,1);
    controller.analyse({});controller.finish();assert.equal(closed,0);assert.equal(disconnected,2);
    controller.analyse({});controller.finish();assert.equal(created,1);assert.equal(disconnected,4);assert.equal(connected,4);
    controller.stop();assert.equal(closed,1);assert.equal(controller.context,null);assert.equal(controller.nodes.length,0);
    await controller.prepare();assert.equal(created,2);controller.stop();assert.equal(closed,2);
  } finally {globalThis.AudioContext=saved.Context;globalThis.requestAnimationFrame=saved.request;globalThis.cancelAnimationFrame=saved.cancel;}
});

test('STOP during output preparation cannot retain a stale resumed context', async () => {
  const Context=globalThis.AudioContext,cancel=globalThis.cancelAnimationFrame;let resume,closed=0;
  globalThis.cancelAnimationFrame=()=>{};
  globalThis.AudioContext=class {resume(){return new Promise(resolve=>{resume=resolve;});}async close(){closed++;}};
  try {const controller=new LipSyncController({dataset:{}});const pending=controller.prepare();controller.stop();resume();await pending;assert.equal(controller.context,null);assert.equal(closed,1);}finally{globalThis.AudioContext=Context;globalThis.cancelAnimationFrame=cancel;}
});
