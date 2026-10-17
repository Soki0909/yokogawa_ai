// Offline authoring only. No runtime pre-roll player, delay, or audio-route changes.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {analysePcmWav,verifyProductionWav} from '../src/audio/wav-analysis.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const targets=['P-019','P-011','P-012','P-015','P-V06','P-020','P-021'];
const show=JSON.parse(await fs.readFile('shows/production.json'));
const mainPath='config/production-speech/yokogawa-ai-v2.json',exitPath='config/production-speech/post-show-021.json';
const manifest=JSON.parse(await fs.readFile(mainPath)),exit=JSON.parse(await fs.readFile(exitPath));
const sourceCommit=execFileSync('git',['rev-parse','HEAD']).toString().trim(),results=[];
for(const number of targets){
 const cue=show.cues.find(c=>c.cueNumber===number),asset=show.assets.find(a=>a.id===cue.audio.assetId);
 const speech=number==='P-021'?exit:manifest.speeches.find(s=>s.assetId===asset.id);
 if(speech.pcmLeadIn)throw Error('Already processed; refusing double prefix: '+number);
 const file='public/'+asset.path,old=await fs.readFile(file),info=analysePcmWav(old);
 if(info.audioFormat!==1||info.bitsPerSample!==16)throw Error('PCM16 required');
 let at=12;while(old.toString('ascii',at,at+4)!=='data')at+=8+old.readUInt32LE(at+4)+(old.readUInt32LE(at+4)%2);
 const dataAt=at+8,oldSize=old.readUInt32LE(at+4),frames=Math.round(info.sampleRate*.7),prefix=Buffer.alloc(frames*info.channels*2);
 for(let i=0;i<frames;i++){
  const envelope=Math.min(1,i/(info.sampleRate*.005),(frames-1-i)/(info.sampleRate*.005));
  const sample=Math.round(32*envelope*Math.sin(2*Math.PI*997*i/info.sampleRate));
  for(let ch=0;ch<info.channels;ch++)prefix.writeInt16LE(sample,(i*info.channels+ch)*2);
 }
 const wav=Buffer.concat([old.subarray(0,dataAt),prefix,old.subarray(dataAt)]);
 wav.writeUInt32LE(wav.length-8,4);wav.writeUInt32LE(oldSize+prefix.length,at+4);
 if(!wav.subarray(dataAt+prefix.length,dataAt+prefix.length+oldSize).equals(old.subarray(dataAt,dataAt+oldSize)))throw Error('Original PCM changed');
 const verification=verifyProductionWav(wav);if(!verification.pass)throw Error(JSON.stringify(verification.checks));
 await fs.writeFile(file,wav);
 const lead={durationMs:700,frames,frequencyHz:997,peakPcm16:32,peakDbFS:20*Math.log10(32/32768),edgeFadeMs:5,sourceCommit,sourceWavSha256:hash(old),sourcePcmSha256:hash(old.subarray(dataAt,dataAt+oldSize)),method:'700ms low-level nonzero signal embedded in this WAV; exact original PCM appended; physical efficacy unverified'};
 speech.pcmLeadIn=lead;speech.sha256=hash(wav);speech.durationSeconds=verification.wav.durationSeconds;speech.bytes=wav.length;speech.technicalChecks=verification.checks;
 speech.segments=speech.segments.map(s=>({...s,startMs:s.startMs+700,endMs:s.endMs+700,...(s.path===asset.path?{sha256:hash(wav)}:{})}));
 speech.subtitleUnits=speech.subtitleUnits.map(s=>({...s,startMs:s.startMs+700,endMs:s.endMs+700}));
 cue.speech.segments=structuredClone(speech.segments);cue.speech.subtitleUnits=structuredClone(speech.subtitleUnits);
 asset.sha256=speech.sha256;asset.durationMs=Math.ceil(speech.durationSeconds*1000);
 if(number==='P-011'||number==='P-012'){
  cue.sequence=cue.sequence.map(p=>({...p,atMs:p.atMs>0?p.atMs+700:0}));
  cue.transition.durationMs+=700;
  if(cue.gaugeSfx)cue.gaugeSfx.atMs+=700;
 }
 if(number==='P-V06')cue.operatorNote+=' WAV内700msの微弱信号を追加。従来の1900ms演出先行は維持、発話・字幕はGOから2600ms以降。';
 if(number==='P-021')cue.operatorNote='青いNORMALとAvatarを2秒でフェードイン。GOから2.2秒後に固定WAV開始（内蔵微弱信号700ms）、2.9秒後から発話・1文ずつの字幕。案内後もNORMALを保持。';
 results.push({cue:number,path:asset.path,...lead,sha256:speech.sha256,durationSeconds:speech.durationSeconds});
}
show.metadata.showHash=hash(JSON.stringify(show.cues));show.metadata.pcmLeadInCues=targets;
await fs.writeFile(mainPath,JSON.stringify(manifest,null,2)+'\n');await fs.writeFile(exitPath,JSON.stringify(exit,null,2)+'\n');await fs.writeFile('shows/production.json',JSON.stringify(show,null,2)+'\n');
await fs.writeFile('config/production-speech/pcm-leadin-20261017.json',JSON.stringify({sourceCommit,targets,results,physicalAudio:'NOT VERIFIED; file prefix cannot fix loading/decoding delay'},null,2)+'\n');
console.log('PASS: exactly seven WAVs prefixed; original PCM byte-identical; subtitles and speech-relative phases +700ms');
