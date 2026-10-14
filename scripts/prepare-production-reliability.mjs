import fs from 'node:fs/promises';
import {composeSpeech} from '../src/audio/speech-composer.js';
import {subtitleUnits} from '../public/js/subtitle-units.js';
const file='config/production-speech/yokogawa-ai-v2.json';
const manifest=JSON.parse(await fs.readFile(file));
const pauses={'003':[350,450],'004':[450],'011':[450,650]};
const clean=value=>String(value).replace(/[…⋯]+/gu,'').replace(/[。]+$/u,'')+'。';
for(const speech of manifest.speeches){
 if(pauses[speech.scriptId]){
  const segments=speech.segments.map((segment,index)=>({...segment,pauseAfterMs:pauses[speech.scriptId][index]??0}));
  const bytes=await Promise.all(segments.map(s=>fs.readFile(`public/${s.path}`)));
  const composed=composeSpeech(segments,bytes);
  speech.path=`assets/audio/production-reliable-${speech.scriptId}.wav`;await fs.writeFile(`public/${speech.path}`,composed.wav);
  Object.assign(speech,{segments:composed.timeline,sha256:composed.verification.wav.sha256,durationSeconds:composed.verification.wav.durationSeconds,bytes:composed.wav.length});
  speech.pacing.pauseAfterMs=pauses[speech.scriptId];
  speech.pacing.direction=({'003':'情報照合→セキュリティ応用→プリンキピアへ、説明の流れを350/450msで接続。','004':'歴史的価値と所蔵情報を450msで接続。説明後HACKまでの間は維持。','011':'達成確認450ms→統合→次の命令650ms。全停止の静寂は短縮しない。'})[speech.scriptId];
 }
 const units=subtitleUnits({...speech,subtitleUnits:undefined},speech.segments.map(s=>s.displayText).join(''));
 speech.segments=speech.segments.map((s,i)=>({...s,displayText:i===speech.segments.length-1?clean(s.displayText):s.displayText.replace(/[…⋯]+/gu,'')}));
 if(speech.scriptId==='001'){
  speech.segments[0].displayText='承知しました、';
  speech.subtitleUnits=[{displayText:'承知しました、横川教授。',startMs:speech.segments[0].startMs,endMs:speech.segments[1].endMs},{displayText:'横川AIを起動します。',startMs:speech.segments[2].startMs,endMs:speech.segments[2].endMs}];
 }else speech.subtitleUnits=units.map(u=>({...u,displayText:clean(u.displayText)}));
 speech.displayText=speech.subtitleUnits.map(u=>u.displayText).join('');
}
manifest.reliabilityRevision='production-reliability-20261014';
manifest.scriptObservedModifiedTime='2026-10-14T06:06:16.917Z';
await fs.writeFile(file,JSON.stringify(manifest,null,2)+'\n');
console.log('17 display texts; 3 PCM-preserving pause compositions');
