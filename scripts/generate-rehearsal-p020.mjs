import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {AivisSpeechClient} from '../src/tts/aivis-speech-client.js';
import {loadProductionVoiceProfile} from '../src/voice-profile.js';
import {verifyProductionWav} from '../src/audio/wav-analysis.js';
const manifestPath='config/production-speech/yokogawa-ai-v2.json';
const manifest=JSON.parse(await fs.readFile(manifestPath));
const speech=manifest.speeches.find(s=>s.scriptId==='020');
const text='館内すべての安全を確認しました',displayText=text+'。';
const profile=await loadProductionVoiceProfile();
if(profile.source.sha256!==manifest.profileHash)throw Error('PROFILE_HASH_MISMATCH');
const output='assets/audio/production-rehearsal-020-safety.wav';
// Preserve the original synthesis source revision; record the new read-only review separately.
manifest.sourceScript.latestReview={modifiedTime:'2026-10-14T12:52:52.896Z',mode:'read-only',p020Override:'User rehearsal revision: 館内すべての安全を確認しました。',sourceP020:'館内すべての扉の解錠を確認しました'};
if(speech.path!==output){
 const client=new AivisSpeechClient();const result=await client.synthesize(text,profile);
 const technical=verifyProductionWav(result.wav);if(!technical.pass)throw Error('P020_WAV_INVALID');
 const sha256=createHash('sha256').update(result.wav).digest('hex');
 await fs.writeFile('public/'+output,result.wav);
 const endMs=Math.ceil(technical.wav.durationSeconds*1000);
 Object.assign(speech,{path:output,scriptText:text,spokenText:text,synthesisText:text,displayText,sha256,bytes:result.wav.length,durationSeconds:technical.wav.durationSeconds,technicalChecks:technical.checks,
  engineVersion:await client.version(),runtimeStyleId:result.style.id,effectiveParameters:profile.parameters,generatedAt:new Date().toISOString(),reusedApprovedTake:false,
  segments:[{displayText,spokenText:text,startMs:0,endMs,pauseAfterMs:0,path:output,sha256}],subtitleUnits:[{displayText,startMs:0,endMs}],
  pacing:{...speech.pacing,sourcePath:output,sourceSha256:sha256,pauseAfterMs:[]},
  rehearsalRevision:{baseline:'b0440618438bbb6398ef7831d48d112af6c0d923',oldPath:speech.path,reason:'User confirmed safety announcement; source Google Doc remains read-only'}});
 await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({status:'GENERATED',text,path:output,sha256,durationMs:endMs,profileHash:profile.source.sha256}));
}else{
 const wav=await fs.readFile('public/'+output);if(createHash('sha256').update(wav).digest('hex')!==speech.sha256)throw Error('P020_HASH_MISMATCH');
 console.log(JSON.stringify({status:'ALREADY GENERATED',sha256:speech.sha256}));
}
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
