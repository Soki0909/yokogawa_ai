// Diagnostic only. Admin prototype is deliberately absent from Production bundles.
// OS loopback is NOT acoustic acceptance and its activation may wake the endpoint.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {freePort,waitForHttp,stopChild,openPage,browserPath,delay} from './runtime-test-browser.js';
const directory=path.resolve(process.argv[2]||'artifacts/audio-reliability-20261014/rehearsal-revision/audio-ab');
await fs.mkdir(directory,{recursive:true});
const captureExe=path.resolve('artifacts/audio-reliability-20261014/rehearsal-revision/loopback.exe');
const results=[];
const hook=`window.__ab={sources:[],visual:[],long:[],frames:[]};
const start=AudioBufferSourceNode.prototype.start;
AudioBufferSourceNode.prototype.start=function(...args){const item={asset:this.__yokogawaAssetId,at:Date.now(),duration:this.buffer.duration,baseLatency:this.context.baseLatency,outputLatency:this.context.outputLatency};window.__ab.sources.push(item);this.addEventListener('ended',()=>item.ended=Date.now());return start.call(this,...args);};
document.addEventListener('DOMContentLoaded',()=>new MutationObserver(()=>{window.__ab.visual.push({at:Date.now(),preset:document.body.dataset.preset,transition:document.body.dataset.transition});}).observe(document.body,{attributes:true,attributeFilter:['data-preset','data-transition','data-transition-status']}));
new PerformanceObserver(list=>window.__ab.long.push(...list.getEntries().map(e=>({at:performance.timeOrigin+e.startTime,duration:e.duration})))).observe({type:'longtask'});
let prior;function frame(t){if(prior)window.__ab.frames.push({at:Date.now(),ms:t-prior});prior=t;if(window.__ab.frames.length>3000)window.__ab.frames.shift();requestAnimationFrame(frame);}requestAnimationFrame(frame);`;
for(const owner of ['Display','Admin-prototype']){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'yokogawa-ab-')),port=await freePort(),debug=await freePort(),base=`http://127.0.0.1:${port}`;
 let server,browser,display,admin,observer,state,capture;const errors=[];
 const send=e=>observer.send(JSON.stringify({...e,actionId:crypto.randomUUID()}));
 const wait=async(fn,label,ms=30000)=>{const end=performance.now()+ms;while(performance.now()<end){if(fn())return;await delay(30);}throw Error(label+' '+JSON.stringify(errors.slice(-3)));};
 try{
  server=spawn(process.execPath,['src/server.js'],{windowsHide:true,stdio:'ignore',env:{...process.env,HOST:'127.0.0.1',PORT:String(port),STATE_FILE:path.join(temp,'state.json'),LOG_DIRECTORY:path.join(temp,'logs'),AIVIS_ENGINE_URL:'http://127.0.0.1:9'}});await waitForHttp(base+'/health');
  browser=spawn(browserPath,['--no-first-run','--no-default-browser-check',`--remote-debugging-port=${debug}`,`--user-data-dir=${path.join(temp,'chrome')}`,'--window-size=1340,900','about:blank'],{windowsHide:false,stdio:'ignore'});await waitForHttp(`http://127.0.0.1:${debug}/json/version`);
  display=await openPage(debug,'about:blank',{display:true});await display.send('Page.addScriptToEvaluateOnNewDocument',{source:hook+(owner==='Display'?'':`localStorage.setItem('yokogawa-display-v2',JSON.stringify({audioEnabled:false}));`)});await display.send('Page.navigate',{url:base+'/display?id=ab-display'});
  admin=await openPage(debug,base+'/admin');await admin.send('Runtime.evaluate',{expression:hook,userGesture:true});
  observer=new WebSocket(base.replace('http','ws')+'/ws');observer.on('message',raw=>{const e=JSON.parse(raw);if(e.type==='state')state=e.state;if(e.type==='error')errors.push(e);});await new Promise(resolve=>observer.once('open',resolve));send({type:'hello',role:'admin'});await wait(()=>state?.displays.length,'registered');
  if(owner==='Display'){
   await display.waitFor(`document.querySelector('#audio-help').textContent.includes('20 / 20 READY')`,'decoded',120000);
   await display.send('Runtime.evaluate',{expression:`document.querySelector('#enable-audio').click()`,userGesture:true});
  }else{
   await admin.evaluate(`(async()=>{
    const {ProductionAudioEngine,BufferedSfxPlayer,outputLeadMs}=await import('/js/production-audio-engine.js');
    const engine=new ProductionAudioEngine();window.__adminPrototype={engine,master:false,generation:0};
    const p=window.__adminPrototype,ws=new WebSocket(location.origin.replace('http','ws')+'/ws');p.ws=ws;
    const send=e=>ws.send(JSON.stringify(e));
    const sfx=new BufferedSfxPlayer(engine,(effect,runId,status,error)=>send({type:'cue:sfx',runId,index:effect.index,status,error}));
    const stop=()=>{p.generation++;sfx.stop();engine.stopAll();};
    ws.addEventListener('open',()=>send({type:'hello',role:'display',display:{displayId:'admin-prototype',displayName:'TEST ONLY Admin prototype',audioEnabled:true}}));
    ws.addEventListener('message',async raw=>{const e=JSON.parse(raw.data);try{
     if(e.type==='state')p.master=e.isAudioMaster===true;
     if(e.type==='cue:prepare'){
      const generation=p.generation;await engine.verify(e.assets);
      if(generation===p.generation&&p.master)send({type:'cue:prepared',token:e.token,ready:true,presentationDelayMs:outputLeadMs(engine.context)});
     }
     if(e.type==='speak'&&e.shouldSpeak&&p.master){
      const generation=p.generation;if(['prod-013','prod-014'].includes(e.message.cueId)){if(!await sfx.whenIdle('prod-sfx-warning'))throw Error('warning incomplete');}
      if(generation!==p.generation)return;
      send({type:'playback',id:e.message.id,status:'received'});
      engine.play(e.message.audio.assetId,{volume:e.settings.volume,effect:e.message.audio.playbackEffect,onStart:()=>send({type:'playback',id:e.message.id,status:'speaking'}),onEnd:()=>send({type:'playback',id:e.message.id,status:'completed'})});
     }
     if(e.type==='sfx'&&p.master)await sfx.play(e.effect,e.volume,e.runId);
     if(['sfx:stop','stop','show:reset'].includes(e.type))stop();
    }catch(error){p.error=error.message;if(e.token)send({type:'cue:prepared',token:e.token,ready:false,error:error.message});}});
    setInterval(()=>{if(ws.readyState===1)send({type:'heartbeat'});},2000);
    await engine.load((await fetch('/api/audio-assets').then(r=>r.json())).assets);p.loaded=true;
    const button=document.createElement('button');button.id='ab-enable';button.textContent='TEST ONLY Admin audio';button.onclick=async()=>{await engine.verify();send({type:'audio:ready',protocol:'decoded-v1',decoded:engine.stats()});};document.body.prepend(button);
   })()`);
   await wait(()=>state.displays.some(d=>d.displayId==='admin-prototype'),'prototype register');send({type:'audio-master:set',displayId:'admin-prototype'});await wait(()=>state.audioMasterId==='admin-prototype','single master');
   await admin.send('Runtime.evaluate',{expression:`document.querySelector('#ab-enable').click()`,userGesture:true});
  }
  await wait(()=>state.displayAudioReady,'READY');
  for(const cueId of ['prod-020','prod-001','prod-003']){
   send({type:'stop'});await delay(300);const file=path.join(directory,`${owner}-${cueId}.wav`);let captureLog='',ready=false;
   capture=spawn(captureExe,[file,'9',...(process.env.LOOPBACK_ENDPOINT?[process.env.LOOPBACK_ENDPOINT]:[])],{windowsHide:true,stdio:['ignore','pipe','pipe']});capture.stdout.on('data',bytes=>{captureLog+=bytes;ready=captureLog.includes('CAPTURE_READY');});capture.stderr.on('data',bytes=>captureLog+=bytes);
   await wait(()=>ready,'loopback ready');const goAt=Date.now();send({type:'cue:execute',cueId});await wait(()=>state.currentMessage?.cueId===cueId,'accepted');const acceptedAt=Date.now();
   await new Promise((resolve,reject)=>{capture.once('exit',code=>code===0?resolve():reject(Error(captureLog)));});capture=null;send({type:'stop'});await delay(200);
   const a=await display.evaluate('window.__ab'),b=await admin.evaluate('window.__ab');const starts=[...a.sources.map(s=>({...s,page:'Display'})),...b.sources.map(s=>({...s,page:'Admin'}))].filter(s=>s.at>=goAt);
   assert.equal(starts.filter(s=>s.asset?.startsWith('prod-voice')).length,1,'exactly one voice owner');assert.ok(starts.every(s=>s.page===(owner==='Display'?'Display':'Admin')));
   const entry={owner,cueId,goAt,acceptedAt,captureLog,starts,displayFrames:a.frames.filter(f=>f.at>=goAt),displayLong:a.long.filter(f=>f.at>=goAt),displayVisual:a.visual.filter(v=>v.at>=goAt),captureEndpoint:process.env.LOOPBACK_ENDPOINT||'Windows default; HDMI unavailable',osCaptureStatus:/frames=0\b/.test(captureLog)?'NO DATA — NOT VERIFIED':'DATA RECEIVED — correlation required',acoustic:'UNVERIFIED',captureBias:'Loopback opens endpoint before GO; cannot establish acoustic cold start'};
   results.push(entry);await fs.writeFile(path.join(directory,'results.json'),JSON.stringify(results,null,2));
  }
  // The prototype is not eligible for adoption: remote RMS/lifecycle safety is unimplemented.
  await display.screenshot(path.join(directory,owner+'-display.png'));assert.deepEqual(display.errors,[]);assert.deepEqual(admin.errors,[]);
 }finally{if(capture)await stopChild(capture);observer?.close();display?.close();admin?.close();await stopChild(browser);await stopChild(server);await fs.rm(temp,{recursive:true,force:true,maxRetries:8,retryDelay:500});}
}
console.log(JSON.stringify({status:'DIAGNOSTIC COMPLETED',cases:results.length,adopt:'Display unchanged; HDMI acoustic and complete Admin lifecycle not verified'}));
