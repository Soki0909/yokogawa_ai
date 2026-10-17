import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {analysePcmWav} from '../src/audio/wav-analysis.js';
import {retimeCueSpeech} from '../src/audio/production-cue-timing.js';
import {PRODUCTION_SLOTS} from '../src/production-asset-slots.js';
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceCommit=execFileSync('git',['rev-parse','HEAD']).toString().trim();
const show=JSON.parse(await fs.readFile('shows/production.json')),mainPath='config/production-speech/yokogawa-ai-v2.json',exitPath='config/production-speech/post-show-021.json';
const manifest=JSON.parse(await fs.readFile(mainPath)),exit=JSON.parse(await fs.readFile(exitPath)),results=[],processed=new Map();
if(show.metadata.firstWavLeadIn)throw Error('Already expanded; refusing double processing');
async function prefix(sourcePath,outputPath=sourcePath){
 if(processed.has(outputPath))return processed.get(outputPath);
 const old=await fs.readFile('public/'+sourcePath),info=analysePcmWav(old);if(info.audioFormat!==1||info.bitsPerSample!==16)throw Error('PCM16 required');
 let at=12;while(old.toString('ascii',at,at+4)!=='data')at+=8+old.readUInt32LE(at+4)+(old.readUInt32LE(at+4)%2);
 const dataAt=at+8,size=old.readUInt32LE(at+4),frames=Math.round(info.sampleRate*.7),head=Buffer.alloc(frames*info.channels*2);
 for(let i=0;i<frames;i++){const envelope=Math.min(1,i/(info.sampleRate*.005),(frames-1-i)/(info.sampleRate*.005));const sample=Math.round(32*envelope*Math.sin(2*Math.PI*997*i/info.sampleRate));for(let ch=0;ch<info.channels;ch++)head.writeInt16LE(sample,(i*info.channels+ch)*2);}
 const wav=Buffer.concat([old.subarray(0,dataAt),head,old.subarray(dataAt)]);wav.writeUInt32LE(wav.length-8,4);wav.writeUInt32LE(size+head.length,at+4);
 if(!wav.subarray(dataAt+head.length,dataAt+head.length+size).equals(old.subarray(dataAt,dataAt+size)))throw Error('Original PCM changed');
 const now=analysePcmWav(wav);if(now.fullScaleSamples>info.fullScaleSamples)throw Error('New clipping');await fs.writeFile('public/'+outputPath,wav);
 const result={path:outputPath,sourcePath,sourceCommit,sourceWavSha256:hash(old),sourcePcmSha256:hash(old.subarray(dataAt,dataAt+size)),durationMs:700,frames,frequencyHz:997,peakPcm16:32,sha256:hash(wav),durationSeconds:now.durationSeconds,bytes:wav.length};processed.set(outputPath,result);return result;
}
function retimeSpeech(cue,speech,r){
 speech.pcmLeadIn=r;speech.sha256=r.sha256;speech.durationSeconds=r.durationSeconds;speech.bytes=r.bytes;
 speech.segments=speech.segments.map(s=>({...s,startMs:s.startMs+700,endMs:s.endMs+700,...(s.path===speech.path?{sha256:r.sha256}:{})}));speech.subtitleUnits=speech.subtitleUnits.map(s=>({...s,startMs:s.startMs+700,endMs:s.endMs+700}));
 cue.speech.segments=structuredClone(speech.segments);cue.speech.subtitleUnits=structuredClone(speech.subtitleUnits);
 const asset=show.assets.find(a=>a.id===cue.audio.assetId);Object.assign(asset,{sha256:r.sha256,durationMs:Math.ceil(r.durationSeconds*1000)});
 if(['prod-004','prod-v-riddle-enter'].includes(cue.id))retimeCueSpeech(cue,0,700,speech.segments);
}
for(const cue of show.cues){
 const events=[...(cue.audio.speechMode==='audio-file'?[{kind:'speech',atMs:cue.timing?.speechDelayMs??0,assetId:cue.audio.assetId}]:[]),...(cue.sfx??[]).map(e=>({...e,kind:'sfx'})),...(cue.gaugeSfx?[{...cue.gaugeSfx,kind:'gauge',assetId:'prod-sfx-gauge'}]:[])].sort((a,b)=>a.atMs-b.atMs);
 if(!events.length)continue;const first=events[0];let r;
 if(first.kind==='speech'){
  const speech=cue.cueNumber==='P-021'?exit:manifest.speeches.find(s=>s.assetId===first.assetId);
  if(speech.pcmLeadIn)r={...speech.pcmLeadIn,path:speech.path,sha256:speech.sha256,durationSeconds:speech.durationSeconds,alreadyPresent:true};
  else{r=await prefix(speech.path);retimeSpeech(cue,speech,r);}
 }else if(first.kind==='gauge'){
  r=await prefix('assets/audio/production-gauge.wav','assets/audio/production-gauge-recovery-leadin.wav');
  const assetId='prod-sfx-gauge-recovery-leadin';show.assets.push({id:assetId,name:'復旧ゲージ音・700ms前置信号',path:r.path,mimeType:'audio/wav',sha256:r.sha256,durationMs:Math.ceil(r.durationSeconds*1000)});
  cue.sfx.push({assetId,atMs:0,volume:cue.gaugeSfx.volume,maxDurationMs:4500,fadeOutMs:40,durationMs:4500});delete cue.gaugeSfx;
  const overlay=structuredClone(cue.overlay);cue.overlay={id:'none',visible:false};cue.transition={id:'timeline',durationMs:6700};cue.sequence=cue.sequence.map(p=>({...p,atMs:p.atMs+700}));cue.sequence.unshift({atMs:700,transition:{id:'recovery',durationMs:6000,intensity:1},overlay});cue.recoverySfx.atMs+=700;
  first.assetId=assetId;
 }else{
  const slot=PRODUCTION_SLOTS.find(s=>s.assetId===first.assetId);r=await prefix(slot.path);
  const asset=show.assets.find(a=>a.id===first.assetId);Object.assign(asset,{path:r.path,sha256:r.sha256,durationMs:Math.ceil(r.durationSeconds*1000)});
  cue.sfx=cue.sfx.map(e=>e.assetId===first.assetId?{...e,durationMs:e.durationMs+700}:e);
  cue.timing={...cue.timing,speechDelayMs:cue.timing.speechDelayMs+700};
  if(cue.id==='prod-001')cue.transition.durationMs+=700;
 }
 results.push({cue:cue.cueNumber,assetId:first.assetId,kind:first.kind,...r});
}
show.metadata.firstWavLeadIn=true;show.metadata.pcmLeadInCues=results.map(r=>r.cue);show.metadata.showHash=hash(JSON.stringify(show.cues));
await fs.writeFile(mainPath,JSON.stringify(manifest,null,2)+'\n');await fs.writeFile(exitPath,JSON.stringify(exit,null,2)+'\n');await fs.writeFile('shows/production.json',JSON.stringify(show,null,2)+'\n');
await fs.writeFile('config/production-speech/first-wav-leadin-20261017.json',JSON.stringify({sourceCommit,results,silentCues:show.cues.filter(c=>!results.some(r=>r.cue===c.cueNumber)).map(c=>c.cueNumber),physicalAudio:'NOT VERIFIED; prefix does not fix loading/decoding delay'},null,2)+'\n');
console.log(JSON.stringify({firstWavCues:results.length,newFiles:processed.size,alreadyPrefixed:results.filter(r=>r.alreadyPresent).length,silentCues:show.cues.length-results.length}));
