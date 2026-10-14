import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {resolveProductionSlots} from '../src/production-asset-slots.js';
const directory=path.resolve(process.argv[2]||'artifacts/audio-reliability-20261014/normal-candidate');
const clips=JSON.parse(await fs.readFile(path.join(directory,'captures.json')));const progress=JSON.parse(await fs.readFile(path.join(directory,'progress.json')));
const show=JSON.parse(await fs.readFile('shows/production.json'));const assets=new Map(show.assets.map(a=>[a.id,a]));
for(const slot of await resolveProductionSlots('public'))if(slot.resolvedPath)assets.set(slot.assetId,{id:slot.assetId,path:slot.resolvedPath});
const decode=file=>execFileSync(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-i',file,'-ac','1','-ar','48000','-f','f32le','pipe:1'],{windowsHide:true,maxBuffer:64*1024*1024});
const rms=bytes=>{const result=[];for(let at=0;at<bytes.length;at+=1920){let sum=0,n=0;for(let p=at;p+4<=Math.min(bytes.length,at+1920);p+=4){const v=bytes.readFloatLE(p);sum+=v*v;n++;}result.push(Math.sqrt(sum/Math.max(1,n)));}return result;};
const onset=levels=>{for(let i=0;i<levels.length-1;i++)if(levels[i]>.003 && levels[i+1]>.003)return i*10;return null;};
const results=[];
for(const cue of progress){
 for(const source of cue.sources.filter(s=>s.assetId?.startsWith('prod-'))){
  const clip=clips.find(c=>c.assetId===source.assetId && Math.abs(c.at-source.at)<300);if(!clip)throw Error('Capture missing: '+source.assetId);
  const reference=rms(decode('public/'+assets.get(source.assetId).path)),actual=rms(decode(path.join(directory,clip.file)));
  let best={lag:0,cosine:-1};for(let lag=-40;lag<=40;lag++){let cross=0,r2=0,a2=0;for(let i=0;i<reference.length;i++){const r=reference[i],a=actual[i+lag]||0;cross+=r*a;r2+=r*r;a2+=a*a;}const cosine=cross/Math.sqrt(r2*a2||1);if(cosine>best.cosine)best={lag,cosine};}
  let run=0,maxRun=0,missing=0;for(let i=0;i<reference.length;i++){if(reference[i]>.003 && (actual[i+best.lag]||0)<reference[i]*.2){run++;missing++;maxRun=Math.max(maxRun,run);}else run=0;}
  results.push({pass:cue.pass,cue:cue.cue,assetId:source.assetId,file:clip.file,referenceOnsetMs:onset(reference),capturedOnsetMs:onset(actual),alignmentOffsetMs:best.lag*10,energyCosine:best.cosine,maxUnexpectedLowEnergyMs:maxRun*10,lowEnergyBins:missing,goToBufferStartMs:source.at-cue.goAt,browserReportedOutputLeadMs:((source.baseLatency||0)+(source.outputLatency||0))*1000,physicalOnset:null,physicalDropouts:null});
 }
}
const passed=results.every(r=>r.maxUnexpectedLowEnergyMs<30 && r.energyCosine>.94);
const report={status:passed?'DIGITAL RENDER CHECK PASS':'DIGITAL RENDER CHECK FAILED',method:'Audio graph MediaStreamDestination -> MediaRecorder Opus -> ffmpeg mono 48kHz; 10ms RMS alignment within +/-400ms; reference RMS >.003, captured <20% for >=30ms flags dropout. This is BEFORE OS/HDMI/speaker, not acoustic verification.',samples:results.length,physicalHdmi:'NOT VERIFIED',results};
await fs.writeFile(path.join(directory,'digital-audio-analysis.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,samples:results.length,worstEnergyCosine:Math.min(...results.map(r=>r.energyCosine)),maxUnexpectedLowEnergyMs:Math.max(...results.map(r=>r.maxUnexpectedLowEnergyMs))}));if(!passed)process.exitCode=1;
