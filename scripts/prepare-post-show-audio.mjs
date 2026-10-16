// Candidate-only authoring. Never regenerate the existing seventeen approved voices.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {AivisSpeechClient} from '../src/tts/aivis-speech-client.js';
import {loadProductionVoiceProfile} from '../src/voice-profile.js';
import {analysePcmWav,verifyProductionWav} from '../src/audio/wav-analysis.js';
import {composeSpeech,normalizeSentenceBuffers} from '../src/audio/speech-composer.js';
export const BASELINE='da09d3bbcfed8d3d9a2568dd7be621359160ddc7';
const sha=b=>createHash('sha256').update(b).digest('hex');
const artifacts='artifacts/post-show-20261017';await fs.mkdir(artifacts+'/stable',{recursive:true});
if(process.argv[2]==='gauge'){
 const source=execFileSync('git',['show',BASELINE+':public/assets/audio/production-gauge.wav'],{maxBuffer:4*1024*1024});
 if(sha(source)!=='0e9138945429553965ca88f1dbb23304cccc430e8aa99e04744bc3af6226aaa8')throw Error('Unexpected stable gauge');
 await fs.writeFile(artifacts+'/stable/production-gauge-plus12db.wav',source,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 const result=Buffer.from(source),gain=10**(-3/20);
 for(let at=12;at+8<=source.length;){const size=source.readUInt32LE(at+4);if(source.toString('ascii',at,at+4)==='data')for(let p=at+8;p<at+8+size;p+=2)result.writeInt16LE(Math.round(source.readInt16LE(p)*gain),p);at+=8+size+size%2;}
 await fs.writeFile('public/assets/audio/production-gauge.wav',result);
 const before=analysePcmWav(source),after=analysePcmWav(result);if(after.fullScaleSamples)throw Error('Gauge clipping');
 const report={baseline:BASELINE,operation:'Stable approved PCM multiplied once by 10^(-3/20), rounded to PCM16. Header, pacing, pitch, Cue gain and cutoffs unchanged.',before,after,measuredRmsDeltaDb:20*Math.log10(after.rms/before.rms)};
 const originalPath='../artifacts/audio-reliability-20261014/gauge-slot/original-float32.wav';
 try{const original=await fs.readFile(originalPath);let data;for(let at=12;at+8<=original.length;){const n=original.readUInt32LE(at+4);if(original.toString('ascii',at,at+4)==='data')data=original.subarray(at+8,at+8+n);at+=8+n+n%2;}let output;for(let at=12;at+8<=result.length;){const n=result.readUInt32LE(at+4);if(result.toString('ascii',at,at+4)==='data')output=result.subarray(at+8,at+8+n);at+=8+n+n%2;}let maxPcmDifference=0;for(let i=0;i<output.length/2;i++){const expected=Math.round(data.readFloatLE(i*4)*10**(9/20)*32768);maxPcmDifference=Math.max(maxPcmDifference,Math.abs(expected-output.readInt16LE(i*2)));}report.originalFloatComparison={sha256:sha(original),maxPcmDifference};}catch(e){report.originalFloatComparison={available:false,reason:e.message};}
 await fs.writeFile(artifacts+'/gauge-change.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}else if(process.argv[2]==='speech'){
 const manifestPath='config/production-speech/post-show-021.json',profile=await loadProductionVoiceProfile();
 const texts=['本日は、『7号館からの脱出』にご来場いただき、誠にありがとうございました。','お帰りの際は、お忘れ物がないかお確かめのうえ、係員の誘導に従ってご退場ください。','当日パンフレットには、アンケートのQRコードを掲載しております。','今後の公演づくりの参考とさせていただきますので、ご回答にご協力いただけますと幸いです。','また、出口付近では、お貸ししたペンの回収を行っております。','お手数ですが、お帰りの際に係員へお渡しください。'];
 const pauses=[450,650,350,650,350,0],client=new AivisSpeechClient();
 const style=await client.resolveStyle(profile),engineVersion=await client.version(),sources=[],segments=[];
 for(const [i,displayText] of texts.entries()){
  const file=`assets/audio/segments/post-show-021-${i+1}.wav`;let bytes;
  try{bytes=await fs.readFile('public/'+file);}catch(e){if(e.code!=='ENOENT')throw e;bytes=(await client.synthesize(displayText,profile,{style})).wav;await fs.writeFile('public/'+file,bytes);}
  if(!verifyProductionWav(bytes).pass)throw Error('Invalid P021 sentence '+i);
  sources.push(bytes);segments.push({displayText,spokenText:displayText,pauseAfterMs:pauses[i],path:file});console.log('P021 sentence '+(i+1)+'/6 ready');
 }
 const normalized=normalizeSentenceBuffers(sources),composed=composeSpeech(segments,normalized);
 for(const [i,bytes] of normalized.entries())await fs.writeFile('public/'+segments[i].path,bytes);
 const output='assets/audio/production-post-show-021-exit.wav';await fs.writeFile('public/'+output,composed.wav);
 const result={scriptId:'021',assetId:'prod-voice-021-exit',path:output,scriptText:texts.join(''),displayText:texts.join(''),spokenText:texts.join(''),voiceProfileId:profile.profileId,profileHash:profile.source.sha256,effectiveParameters:profile.parameters,engineVersion,runtimeStyleId:style.id,model:profile.model,speaker:profile.speaker,style:profile.style,sha256:sha(composed.wav),durationSeconds:composed.verification.wav.durationSeconds,segments:composed.timeline,subtitleUnits:composed.timeline.map(s=>({displayText:s.displayText,startMs:s.startMs,endMs:s.endMs})),pacing:{pauseAfterMs:pauses,direction:'感謝450ms→退場のお願い650ms→アンケート案内350ms→協力依頼650ms→ペン回収350ms→丁寧な結び。既存350/450/650ms文間合成と同じ方式。',normalizeBoundarySilence:true},generatedAt:new Date().toISOString(),technicalChecks:composed.verification.checks};
 await fs.writeFile(manifestPath,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:'GENERATED P-021 ONLY',path:output,durationSeconds:result.durationSeconds,sha256:result.sha256}));
}else throw Error('Use gauge or speech');
