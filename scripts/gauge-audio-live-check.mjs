// Targeted actual Cue playback. Windows mixer capture is not microphone/HDMI acceptance.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {WebSocket} from 'ws';
import {freePort,waitForHttp,stopChild,openPage,browserPath,delay} from './runtime-test-browser.js';
const directory=path.resolve(process.env.GAUGE_TEST_OUTPUT||'artifacts/audio-reliability-20261014/gauge-slot/live');await fs.mkdir(directory,{recursive:true});
const testVolume=process.env.GAUGE_TEST_VOLUME===undefined?null:Number(process.env.GAUGE_TEST_VOLUME);assert.ok(testVolume===null||(Number.isFinite(testVolume)&&testVolume>=0&&testVolume<=1));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'yokogawa-gauge-live-')),port=await freePort(),debug=await freePort(),base=`http://127.0.0.1:${port}`;
const captureExe=path.resolve('artifacts/audio-reliability-20261014/rehearsal-revision/loopback.exe');let captureAvailable=true;try{await fs.access(captureExe);}catch{captureAvailable=false;}
let server,browser,page,observer,state,capture;const errors=[],results=[];
const send=e=>observer.send(JSON.stringify({...e,actionId:crypto.randomUUID()}));
const wait=async(fn,label,ms=30000)=>{const end=performance.now()+ms;while(performance.now()<end){if(await fn())return;await delay(30);}throw Error(label+' '+JSON.stringify(errors));};
const sources=()=>page.evaluate('window.__gaugeLive.sources');
function pcm(file){const r=spawnSync(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-i',file,'-ac','1','-ar','8000','-f','f32le','-'],{windowsHide:true,maxBuffer:8*1024*1024});if(r.status!==0)throw Error(r.stderr.toString());return new Float32Array(Uint8Array.from(r.stdout).buffer);}
function correlate(reference,actual,expected){
 const lo=Math.max(0,Math.round(expected-1600)),hi=Math.min(actual.length-7200,Math.round(expected+8000));let best={correlation:-1},refEnergy=0;
 for(let j=800;j<6400;j++)refEnergy+=reference[j]**2;
 const score=k=>{let dot=0,energy=0;for(let j=800;j<6400;j++){dot+=reference[j]*actual[k+j];energy+=actual[k+j]**2;}return {offset:k,correlation:dot/Math.sqrt(refEnergy*energy||1),gain:dot/refEnergy};};
 for(let k=lo;k<=hi;k+=8){const s=score(k);if(s.correlation>best.correlation)best=s;}
 const coarse=best.offset;for(let k=Math.max(lo,coarse-8);k<=Math.min(hi,coarse+8);k++){const s=score(k);if(s.correlation>best.correlation)best=s;}
 return best;
}
try{
 server=spawn(process.execPath,['src/server.js'],{windowsHide:true,stdio:'ignore',env:{...process.env,HOST:'127.0.0.1',PORT:String(port),STATE_FILE:path.join(temp,'state.json'),LOG_DIRECTORY:path.join(temp,'logs'),AIVIS_ENGINE_URL:'http://127.0.0.1:9'}});await waitForHttp(base+'/health');
 browser=spawn(browserPath,['--no-first-run','--no-default-browser-check',`--remote-debugging-port=${debug}`,`--user-data-dir=${path.join(temp,'chrome')}`,'--window-size=1280,850','about:blank'],{windowsHide:true,stdio:'ignore'});await waitForHttp(`http://127.0.0.1:${debug}/json/version`);
 page=await openPage(debug,'about:blank',{display:true});await page.setViewport(1920,1080);
 await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__gaugeLive={sources:[]};const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){const row={assetId:this.__yokogawaAssetId,volume:this.__yokogawaVolume,at:Date.now(),args,bufferSeconds:this.buffer.duration};window.__gaugeLive.sources.push(row);this.addEventListener('ended',()=>row.endedAt=Date.now(),{once:true});return start.call(this,...args);};`});await page.send('Page.navigate',{url:base+'/display?id=gauge-live'});
 observer=new WebSocket(base.replace('http','ws')+'/ws');observer.on('message',raw=>{const e=JSON.parse(raw);if(e.type==='state')state=e.state;if(e.type==='error')errors.push(e);});await new Promise(resolve=>observer.once('open',resolve));send({type:'hello',role:'admin'});
 await wait(()=>state?.displays.some(d=>d.displayId==='gauge-live'),'Display registered');send({type:'audio-master:set',displayId:'gauge-live'});
 await page.waitFor(`document.querySelector('#enable-audio')?.disabled===false`,'all current WAV decoded',120000);await page.send('Runtime.evaluate',{expression:`document.querySelector('#enable-audio').click()`,userGesture:true});await wait(()=>state.displayAudioReady,'Audio Master ready');
 const reference=pcm('public/assets/audio/production-gauge.wav');
 for(const [cueId,windowMs,seconds] of [['prod-012',5000,15],['prod-v-recovery',3800,9]]){
  send({type:'stop'});await delay(250);let log='',ready=false,done;const file=path.join(directory,cueId+'.wav');
  if(testVolume!==null){const cue=structuredClone(state.cues.find(c=>c.cueId===cueId));cue.gaugeSfx.volume=testVolume;for(const effect of cue.sfx)if(effect.assetId==='prod-sfx-gauge')effect.volume=testVolume;send({type:'cue:save',cue});await wait(()=>state.cues.find(c=>c.cueId===cueId)?.sfx.find(s=>s.assetId==='prod-sfx-gauge')?.volume===testVolume,'isolated test gain');}
  if(captureAvailable){capture=spawn(captureExe,[file,String(seconds)],{windowsHide:true,stdio:['ignore','pipe','pipe']});capture.stdout.on('data',b=>{log+=b;ready=log.includes('CAPTURE_READY');});capture.stderr.on('data',b=>log+=b);done=new Promise((resolve,reject)=>capture.once('exit',code=>code===0?resolve():reject(Error(log))));await wait(()=>ready,'Windows loopback ready');}
  const before=(await sources()).length,goAt=Date.now();console.log('Playing '+cueId);send({type:'cue:execute',cueId});await wait(()=>state.currentCue?.cueId===cueId,'Cue accepted');
  await wait(async()=>(await sources()).slice(before).some(s=>s.assetId==='prod-sfx-gauge'&&s.endedAt),'actual gauge end');
  if(done)await done;capture=null;
  const starts=(await sources()).slice(before),gauge=starts.filter(s=>s.assetId==='prod-sfx-gauge');assert.equal(gauge.length,1);assert.equal(gauge[0].args[2],windowMs/1000);assert.ok(Math.abs(gauge[0].endedAt-gauge[0].at-windowMs)<500);
  let mixer={status:'UNVERIFIED — loopback helper unavailable'};
  if(done){const actual=pcm(file),readyAt=Number(/unixMs=(\d+)/.exec(log)?.[1]);mixer=correlate(reference,actual,(gauge[0].at-readyAt)/1000*8000);mixer.status=mixer.correlation>.85?'WAVEFORM MATCH':'INCONCLUSIVE';const packets=(await fs.readFile(file+'.packets.csv','utf8')).trim().split(/\r?\n/).slice(1).map(l=>l.split(',').map(Number));mixer.discontinuitiesAfterFirstPacket=packets.slice(1).filter(p=>(p[2]&1)!==0).length;mixer.timestampErrors=packets.filter(p=>(p[2]&4)!==0).length;}
  if(cueId==='prod-v-recovery')assert.equal(starts.filter(s=>s.assetId==='prod-sfx-recovery').length,1);
  results.push({cueId,goAt,windowMs,gauge:gauge[0],allSources:starts,mixer,captureLog:log});await page.screenshot(path.join(directory,cueId+'.png'));
 }
 send({type:'stop'});await delay(200);const before=(await sources()).length;send({type:'cue:execute',cueId:'prod-v-recovery'});await wait(async()=>(await sources()).length>before,'STOP test gauge');await delay(200);send({type:'stop'});await delay(700);
 const stopped=(await sources()).slice(before).find(s=>s.assetId==='prod-sfx-gauge');assert.ok(stopped?.endedAt&&stopped.endedAt-stopped.at<1200);assert.equal((await sources()).length,before+1);
 assert.deepEqual(errors,[]);assert.deepEqual(page.errors,[]);
 const report={status:'SOFTWARE PASS',testVolume,mixerStatus:results.every(r=>r.mixer.status==='WAVEFORM MATCH')?'WINDOWS MIXER WAVEFORM MATCH':'NOT FULLY VERIFIED',physicalSpeaker:'UNVERIFIED — no microphone/acoustic measurement',idleTest:'NOT RUN (not required)',results,stopCancellation:'PASS'};await fs.writeFile(path.join(directory,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(capture)await stopChild(capture);observer?.close();page?.close();await stopChild(browser);await stopChild(server);await fs.rm(temp,{recursive:true,force:true,maxRetries:8,retryDelay:300});}
