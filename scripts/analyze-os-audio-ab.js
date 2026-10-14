import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const directory=path.resolve(process.argv[2]);
const rows=JSON.parse(await fs.readFile(path.join(directory,'results.json')));
const show=JSON.parse(await fs.readFile('shows/production.json'));
const assets=new Map(show.assets.map(a=>[a.id,a]));
function pcm(file){const p=spawnSync(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-i',file,'-ac','1','-ar','8000','-f','f32le','-'],{windowsHide:true,maxBuffer:20*1024*1024});if(p.status!==0)throw Error(p.stderr.toString());return new Float32Array(Uint8Array.from(p.stdout).buffer);}
const rms=(x,a,b)=>{let sum=0;for(let i=a;i<Math.min(b,x.length);i++)sum+=(x[i]||0)**2;return Math.sqrt(sum/Math.max(1,b-a));};
const reports=[];
for(const row of rows){
 const voice=row.starts.find(s=>s.asset?.startsWith('prod-voice-'));
 const asset=assets.get(voice.asset),reference=pcm(path.resolve('public',asset.path));
 const samples=Number(/frames=(\d+)/.exec(row.captureLog)?.[1]||0);
 if(samples===0){reports.push({owner:row.owner,cue:row.cueId,status:'NO OS DATA'});continue;}
 const actual=pcm(path.join(directory,`${row.owner}-${row.cueId}.wav`));
 const ready=Number(/unixMs=(\d+)/.exec(row.captureLog)[1]);
 const expected=(voice.at-ready)/1000*8000;
 let best={correlation:-1};
 // Align actual post-mixer waveform against original PCM, independently of start() success.
 const lo=Math.max(0,Math.round(expected-1600)),hi=Math.min(actual.length-4000,Math.round(expected+8000));
 let refEnergy=0;for(let j=800;j<4000;j++)refEnergy+=reference[j]**2;
 const score=k=>{let dot=0,energy=0;for(let j=800;j<4000;j++){dot+=reference[j]*actual[k+j];energy+=actual[k+j]**2;}return {k,correlation:dot/Math.sqrt(refEnergy*energy||1),gain:dot/refEnergy};};
 for(let k=lo;k<=hi;k+=8){const value=score(k);if(value.correlation>best.correlation)best=value;}
 const coarse=best.k;for(let k=Math.max(lo,coarse-8);k<=Math.min(hi,coarse+8);k++){const value=score(k);if(value.correlation>best.correlation)best=value;}
 const head=[];for(let i=0;i<5;i++){const a=i*800,b=a+800;head.push({startMs:i*100,referenceRms:rms(reference,a,b),capturedRms:rms(actual,best.k+a,best.k+b)});}
 let onset=0;while(onset<reference.length&&Math.abs(reference[onset])<.002)onset++;
 const packets=(await fs.readFile(path.join(directory,`${row.owner}-${row.cueId}.wav.packets.csv`),'utf8')).trim().split(/\r?\n/).slice(1).map(l=>l.split(',').map(Number));
 reports.push({owner:row.owner,cue:row.cueId,status:best.correlation>.8?'OS WAVEFORM MATCH':'INCONCLUSIVE — no strong waveform match',sourceScheduleMs:voice.at-row.goAt,osPcmStartAfterGoMs:ready+best.k/8-row.goAt,osVoicedOnsetAfterGoMs:ready+(best.k+onset)/8-row.goAt,reportedOutputLeadMs:(voice.baseLatency+voice.outputLatency)*1000,correlation:best.correlation,gain:best.gain,head100msBins:head,zeroedVoicedBins:head.filter(b=>b.referenceRms>.005&&b.capturedRms<.0001).length,discontinuitiesAfterFirstPacket:packets.slice(1).filter(p=>(p[2]&1)!==0).length,timestampErrors:packets.filter(p=>(p[2]&4)!==0).length});
}
const report={scope:'Windows mixer output; not microphone/acoustic. Capture opens endpoint before GO. Three clips per owner, not a statistical or 35min acoustic acceptance.',reports,adopt:'Display remains default; Admin physical superiority not established and prototype lacks complete lifecycle/RMS validation'};
await fs.writeFile(path.join(directory,'analysis.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
