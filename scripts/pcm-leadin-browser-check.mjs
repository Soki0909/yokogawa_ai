import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
import {freePort,waitForHttp,stopChild,openPage,browserPath,delay} from './runtime-test-browser.js';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'yokogawa-pcm-prefix-')),port=await freePort(),debug=await freePort(),base=`http://127.0.0.1:${port}`;
const report=JSON.parse(await fs.readFile('config/production-speech/first-wav-leadin-20261017.json'));let server,browser,page,admin,state;const errors=[],results=[];
const wait=async(f,label,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){if(f())return;await delay(30)}throw Error(label+': '+JSON.stringify(errors))};
const send=e=>admin.send(JSON.stringify({...e,actionId:crypto.randomUUID()}));
try{
 server=spawn(process.execPath,['src/server.js'],{windowsHide:true,stdio:'ignore',env:{...process.env,HOST:'127.0.0.1',PORT:String(port),STATE_FILE:path.join(temp,'state.json'),LOG_DIRECTORY:path.join(temp,'logs'),AIVIS_ENGINE_URL:'http://127.0.0.1:9'}});await waitForHttp(base+'/health');
 const show=await fetch(base+'/api/show-file').then(r=>r.json());assert.equal(show.cues.length,24);
 browser=spawn(browserPath,['--headless=new','--mute-audio','--no-first-run','--no-proxy-server','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required',`--remote-debugging-port=${debug}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});await waitForHttp(`http://127.0.0.1:${debug}/json/version`);
 page=await openPage(debug,base+'/display?id=pcm-prefix-check',{display:true});await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__pcmStarts=[];const native=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){if(this.__yokogawaAssetId){const b=this.buffer,data=b.getChannelData(0);let peak=0,energy=0;for(let i=0;i<Math.round(b.sampleRate*.7);i++){peak=Math.max(peak,Math.abs(data[i]));energy+=data[i]*data[i]}window.__pcmStarts.push({id:this.__yokogawaAssetId,at:Date.now(),peak,energy,args})}return native.apply(this,args)};`});await page.send('Page.reload',{});await page.waitFor(`document.querySelector('#connection')?.textContent==='ONLINE'`,'Display');await page.send('Page.bringToFront');
 admin=new WebSocket(base.replace('http','ws')+'/ws');await new Promise((r,j)=>{admin.once('open',r);admin.once('error',j)});admin.on('message',raw=>{const e=JSON.parse(raw);if(e.type==='state')state=e.state;if(e.type==='error')errors.push(e)});send({type:'hello',role:'admin'});await wait(()=>state?.displays?.length,'registration');send({type:'audio-master:set',displayId:'pcm-prefix-check'});
 await page.waitFor(`document.querySelector('#audio-help').textContent.includes('24 / 24 READY')`,'23 decoded',120000);await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'s',code:'KeyS'});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'s',code:'KeyS'});await page.send('Runtime.evaluate',{expression:`document.querySelector('#enable-audio').click()`,userGesture:true});await wait(()=>state?.displayAudioReady,'READY');
 for(const entry of report.results){const number=entry.cue;
  const cue=show.cues.find(c=>c.cueNumber===number),before=await page.evaluate('window.__pcmStarts.length');
  send({type:'cue:ready',cueId:cue.id,expectedIndex:state.currentCueIndex});await wait(()=>state.cueMove?.targetCueId===cue.id,'ready');await delay(100);assert.equal(await page.evaluate('window.__pcmStarts.length'),before);
  send({type:'cue:next'});await wait(()=>state.currentCue?.cueId===cue.id,'NEXT');
  await page.waitFor(`window.__pcmStarts.slice(${before}).some(s=>s.id===${JSON.stringify(entry.assetId)})`,'real engine start');
  const audio=await page.evaluate(`window.__pcmStarts.slice(${before}).find(s=>s.id===${JSON.stringify(entry.assetId)})`);assert.ok(audio.energy>0&&audio.peak<.0015,number+' decoded nonzero weak prefix');
  let subtitleAt=null;if(cue.audio.speechMode==='audio-file'){await page.waitFor(`document.querySelector('#caption').textContent.length>0`,'first subtitle');subtitleAt=Date.now();const start=entry.kind==='speech'?(cue.timing?.speechDelayMs??0):(cue.sfx.find(s=>s.assetId===entry.assetId)?.atMs??0),expected=(cue.timing?.speechDelayMs??0)-start+cue.speech.subtitleUnits[0].startMs;assert.ok(subtitleAt-audio.at>=expected-70&&subtitleAt-audio.at<expected+1000,number+' subtitle offset');}
  if(['P-011','P-012','P-V07'].includes(number))await wait(()=>state.cueProgress&&!state.cueProgress.blocked,number+' finite presentation complete');
  if(number==='P-012'){const gauge=await page.evaluate(`window.__pcmStarts.slice(${before}).find(s=>s.id==='prod-sfx-gauge')`);assert.equal(gauge.args[2],5);assert.ok(gauge.at-audio.at>=5100);}
  if(number==='P-V07'){assert.equal(audio.args[2],4.5);assert.equal(await page.evaluate('document.body.dataset.preset'),'normal');}
  results.push({cue:number,realDecodedPrefixPeak:audio.peak,firstVisibleTextAfterSourceMs:subtitleAt-audio.at,status:'PASS'});send({type:'stop'});await delay(180);
 }
 // Cancel while P021 is still inside its WAV prefix; no delayed subtitle remains.
 const exit=show.cues.find(c=>c.cueNumber==='P-021'),n=await page.evaluate('window.__pcmStarts.length');send({type:'cue:replay'});await page.waitFor(`window.__pcmStarts.length>${n}`,'REPLAY source');send({type:'stop'});await delay(1000);assert.equal(await page.evaluate(`document.querySelector('#caption').textContent`),'');
 send({type:'blackout'});await wait(()=>state.blackout,'BLACKOUT');send({type:'blackout:clear'});await wait(()=>!state.blackout,'RESTORE');
 send({type:'show:reset'});await wait(()=>state.currentCueIndex===-1,'reset');await delay(300);assert.equal(state.displayAudioReady,true);assert.equal(await page.evaluate(`Number(getComputedStyle(document.querySelector('#show-curtain')).opacity)`),1);
 assert.deepEqual(page.errors,[]);assert.deepEqual(errors,[]);
 await fs.writeFile('artifacts/post-show-20261017/pcm-leadin-browser.json',JSON.stringify({status:'PASS',decoded:24,cues:24,results,controls:['emergency ready','explicit NEXT','STOP','REPLAY','BLACKOUT','RESTORE','Reset'],nextGuardMs:state.metadata.nextGuardMs,physicalAudio:'NOT VERIFIED; no claim of fixing load/decode latency'},null,2));console.log('PASS: all 19 audible Cue first-WAV starts, decoded embedded signal, subtitle sync, P011/P012 finite visuals, safety controls');
}finally{admin?.close();page?.close();await stopChild(browser);await stopChild(server);await fs.rm(temp,{recursive:true,force:true,maxRetries:8,retryDelay:400});}
