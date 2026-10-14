import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {StateStore} from '../src/state-store.js';
const show=JSON.parse(await fs.readFile('shows/production.json'));
test('old Production import cannot opt out of decoded/complete gate; missing recovery remains unselected',()=>{
 const input=structuredClone(show);delete input.metadata.reliableAudio;const store=new StateStore({storage:{async save(){}}});store.importShowFile(input,{apply:true});assert.equal(store.state.metadata.reliableAudio,true);assert.throws(()=>store.nextCue(),/CUE_NOT_COMPLETE/);assert.equal(show.cues.find(c=>c.id==='prod-v-recovery').recoverySfx.atMs,4600);
});
test('P-001 maps three approved audio chunks to TWO full typewriter sentences; all 17 displays have no ellipsis',()=>{
 const first=show.cues[0];assert.equal(first.speech.segments.length,3);assert.deepEqual(first.speech.subtitleUnits.map(u=>u.displayText),['承知しました、横川教授。','横川AIを起動します。']);assert.equal(first.speech.subtitleUnits[0].endMs,first.speech.segments[1].endMs);
 for(const cue of show.cues.filter(c=>c.audio.speechMode==='audio-file')){assert.ok(!/[…⋯]/.test(cue.displayText));assert.ok(cue.speech.subtitleUnits.every(u=>u.displayText.endsWith('。')));}
});
