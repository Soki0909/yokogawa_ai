import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {composeSpeech} from '../src/audio/speech-composer.js';import {sentenceTexts} from '../public/js/subtitle-units.js';import {finiteCueDuration} from '../src/cue-completion.js';import {normalizeCue} from '../src/show-schema.js';
const baseline='a90176c1e8297f49ac660d851511ad2dda723656';
const read=async p=>JSON.parse(await fs.readFile(p));const git=p=>execFileSync('git',['show',`${baseline}:${p}`],{windowsHide:true});const sha=b=>createHash('sha256').update(b).digest('hex');
const before=JSON.parse(git('config/production-speech/yokogawa-ai-v2.json'));const after=await read('config/production-speech/yokogawa-ai-v2.json');const show=await read('shows/production.json');const oldShow=JSON.parse(git('shows/production.json'));const report=[];
assert.equal(show.metadata.nextGuardMs,1200);assert.equal(show.metadata.reliableAudio,true);assert.deepEqual(show.cues.map(c=>c.id),oldShow.cues.map(c=>c.id));
assert.equal(after.speeches.length,17);
for(const speech of after.speeches){
 const old=before.speeches.find(s=>s.scriptId===speech.scriptId);
 assert.equal(speech.spokenText,old.spokenText);assert.equal(speech.scriptText,old.scriptText);
 assert.deepEqual(speech.segments.map(s=>s.spokenText),old.segments.map(s=>s.spokenText));
 assert.equal(sha(await fs.readFile(`public/${old.path}`)),old.sha256,'Approved active/source WAV was overwritten');
 assert.equal(sha(await fs.readFile(`public/${speech.path}`)),speech.sha256);
 if(['003','004','011'].includes(speech.scriptId)){
  for(const [i,s] of speech.segments.entries())assert.equal(sha(await fs.readFile(`public/${s.path}`)),old.segments[i].sha256,'Approved sentence PCM changed');
  const composed=composeSpeech(speech.segments,await Promise.all(speech.segments.map(s=>fs.readFile(`public/${s.path}`))));assert.equal(composed.verification.wav.sha256,speech.sha256);
 }else assert.equal(speech.sha256,old.sha256,'Unexpected WAV change');
 const cue=show.cues.find(c=>c.audio?.assetId===speech.assetId);assert.equal(cue.displayText,speech.displayText);
 const units=cue.speech.subtitleUnits;assert.deepEqual(units.map(u=>u.displayText),sentenceTexts(cue.displayText));assert.ok(units.every(u=>u.displayText.endsWith('。')&&!/[…⋯]/.test(u.displayText)));assert.equal(units.map(u=>u.displayText).join(''),cue.displayText);
 report.push({cue:cue.cueNumber,speech:speech.scriptId,wavUnchanged:speech.sha256===old.sha256,pauseBefore:old.segments.map(s=>s.pauseAfterMs),pauseAfter:speech.segments.map(s=>s.pauseAfterMs),durationDeltaMs:Math.round((speech.durationSeconds-old.durationSeconds)*1000),displayBefore:old.displayText,displayAfter:speech.displayText});
}
assert.equal(show.cues[0].speech.subtitleUnits.length,2);assert.equal(show.cues[0].speech.subtitleUnits[0].displayText,'承知しました、横川教授。');
assert.equal(sha(await fs.readFile('config/voice-profiles/yokogawa-professor-v1.json')),sha(git('config/voice-profiles/yokogawa-professor-v1.json')));
const boundaries=show.cues.map(raw=>{const cue=normalizeCue(raw);return {cue:cue.cueNumber,speechActualEnd:cue.audio.speechMode==='audio-file',sfxActualEnd:cue.sfx.map(e=>e.assetId),finiteMs:finiteCueDuration(cue),persistentVisual:cue.visual.visible||cue.sequence.some(p=>p.visual?.visible),optionalRecovery:cue.recoverySfx||null};});
await fs.mkdir('artifacts/audio-reliability-20261014',{recursive:true});await fs.writeFile('artifacts/audio-reliability-20261014/integrity.json',JSON.stringify({status:'PASS',baseline,voiceProfileUnchanged:true,sourceWavsUnchanged:17,speeches:report,cues:boundaries},null,2));console.log(JSON.stringify({status:'PASS',cues:20,speeches:17,unchangedSourceWavs:17,newPauseCompositions:3,voiceProfileUnchanged:true}));
