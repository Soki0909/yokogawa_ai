// Candidate-only browser acceptance. Uses real Chrome rendering/audio decoding;
// mute-audio deliberately prevents claiming a physical speaker test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
import {freePort,waitForHttp,stopChild,openPage,browserPath,delay} from './runtime-test-browser.js';
const output=path.resolve(process.argv[2]||'artifacts/post-show-20261017/browser');
await fs.mkdir(output,{recursive:true});
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'yokogawa-post-show-'));
const port=await freePort(),debug=await freePort(),base=`http://127.0.0.1:${port}`;
let server,browser,page,admin,observer,state,serverLog='';const errors=[],checks=[],progress=[],frames=[];
const send=e=>observer.send(JSON.stringify({...e,actionId:crypto.randomUUID()}));
const wait=async(test,label,timeout=90000)=>{const end=performance.now()+timeout;while(performance.now()<end){if(test())return;await delay(35);}throw Error(`Timeout ${label}; errors=${JSON.stringify(errors)}; state=${JSON.stringify({cue:state?.currentCue,progress:state?.cueProgress,block:state?.nextBlock})}`);};
const opacity=()=>page.evaluate(`Number(getComputedStyle(document.querySelector('#show-curtain')).opacity)`);
const plays=()=>page.evaluate('window.__starts.length');
const shot=async(label)=>{await page.screenshot(path.join(output,label+'.png'));frames.push(label);};
const stop=async()=>{send({type:'stop'});await delay(150);};
const execute=async id=>{const before=state?.currentOutputFade?.startedAt;send({type:'cue:execute',cueId:id});await wait(()=>state?.currentCue?.cueId===id&&state?.currentOutputFade?.startedAt!==before,id+' accepted');};
const ready=async id=>{const n=await plays();await admin.evaluate(`document.querySelector('#cue-rescue').open=true;document.querySelector('#cue-rescue-target').value=${JSON.stringify(id)};document.querySelector('#cue-rescue-target').dispatchEvent(new Event('change',{bubbles:true}))`);await admin.click('#cue-rescue-confirm');await admin.click('#cue-rescue-apply');await wait(()=>state?.cueMove?.targetCueId===id,id+' ready');await delay(200);assert.equal(await plays(),n,'ready must not play');};
const enable=async()=>{
 await page.send('Page.bringToFront');
 await page.waitFor(`document.querySelector('#audio-help').textContent.includes('23 / 23 READY')`,'23 decoded',120000);
 await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'s',code:'KeyS'});
 await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'s',code:'KeyS'});
 assert.equal(await page.evaluate(`document.body.dataset.operatorSetup`),'true');
 await page.send('Runtime.evaluate',{expression:`document.querySelector('#enable-audio').click()`,userGesture:true});
 await wait(()=>state?.displayAudioReady,'Audio READY');await delay(150);
};
try{
 server=spawn(process.execPath,['src/server.js'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,HOST:'127.0.0.1',PORT:String(port),STATE_FILE:path.join(temp,'state.json'),LOG_DIRECTORY:path.join(temp,'logs'),AIVIS_ENGINE_URL:'http://127.0.0.1:9'}});
 server.stdout.on('data',b=>serverLog+=b);server.stderr.on('data',b=>serverLog+=b);await waitForHttp(base+'/health');
 const show=await fetch(base+'/api/show-file').then(r=>r.json());
 const cues=show.cues.filter(c=>c.enabled!==false&&c.route==='main').sort((a,b)=>a.order-b.order);assert.equal(cues.length,24);
 browser=spawn(browserPath,['--headless=new','--mute-audio','--no-proxy-server','--no-first-run','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required',`--remote-debugging-port=${debug}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});await waitForHttp(`http://127.0.0.1:${debug}/json/version`);
 page=await openPage(debug,base+'/display?id=post-show-check',{display:true});
 await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__starts=[];const oldStart=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){if(this.__yokogawaAssetId)window.__starts.push({id:this.__yokogawaAssetId,at:Date.now(),args});return oldStart.apply(this,args)};`});
 await page.send('Page.reload',{});await page.waitFor(`document.querySelector('#connection')?.textContent==='ONLINE'`,'online');await page.send('Page.bringToFront');
 observer=new WebSocket(base.replace('http','ws')+'/ws');await new Promise((r,j)=>{observer.once('open',r);observer.once('error',j)});observer.on('message',raw=>{const e=JSON.parse(raw);if(e.type==='state')state=e.state;if(e.type==='error')errors.push(e)});send({type:'hello',role:'admin'});await wait(()=>state?.displays?.some(d=>d.displayId==='post-show-check'),'registration');send({type:'audio-master:set',displayId:'post-show-check'});
 assert.equal(await opacity(),1);await shot('1920x1080-initial-black');await enable();assert.equal(await opacity(),1);assert.equal(await plays(),0);checks.push('cold initial black; S setup; 23 decoded; no cue audio');
 const runFlow=async()=>{await page.send('Page.bringToFront');const flowSize=await page.evaluate('innerWidth+"x"+innerHeight');
 for(const cue of cues){
  const id=cue.id,old=state.currentCueIndex,n=await plays(),at=Date.now();
  send({type:'cue:next'});await wait(()=>state.currentCueIndex===old+1,cue.cueNumber+' NEXT');assert.equal(state.currentCue.cueId,id);
  if(id==='prod-v-prelude'){
   send({type:'cue:next'});await delay(650);assert.equal(state.currentCueIndex,old+1);assert.ok(errors.some(e=>e.code==='NEXT_GUARDED'||JSON.stringify(e).includes('1.5秒')||JSON.stringify(e).includes('NEXT_GUARDED')));errors.length=0;
   const mid=await opacity();assert.ok(mid>0&&mid<1,`P-V00 mid opacity ${mid}`);await shot(flowSize+'-P-V00-fade');
  }
  await wait(()=>state.cueProgress&&!state.cueProgress.blocked,cue.cueNumber+' finished');await delay(220);
  assert.equal(state.blackout,false);
  if(['prod-v-prelude','prod-v-riddle-close','prod-v-curtain-black'].includes(id))assert.equal(await plays(),n);
  if(id==='prod-v-prelude'){assert.equal(await opacity(),0);assert.equal(await page.evaluate(`document.querySelector('#avatar-wrap').hidden`),true);await shot(flowSize+'-P-V00-ready');}
  if(id==='prod-v-riddle-close'){
   assert.equal(await page.evaluate(`document.body.dataset.preset`),'hijacked');assert.equal(await page.evaluate(`document.querySelector('#scene-visual').hidden && document.querySelector('#caption').textContent===''`),true);await shot(flowSize+'-P-V03-hold');await delay(1800);assert.equal(state.currentCue.cueId,id);
  }
  if(id==='prod-v-curtain-black'){assert.equal(await opacity(),1);await shot(flowSize+'-P-V08-black');}
  if(id==='prod-021'){
   const starts=await page.evaluate('window.__starts');const start=starts.find(x=>x.id==='prod-voice-021-exit');assert.ok(start);assert.ok(start.at-at>=2150);assert.equal(await opacity(),0);assert.equal(await page.evaluate('document.body.dataset.preset'),'normal');await shot(flowSize+'-P-021-final');checks.push({p021AudioDelayMs:start.at-at});
  }
  const sources=await page.evaluate('window.__starts.slice('+n+')');
  if(id==='prod-012')assert.equal(sources.find(s=>s.id==='prod-sfx-gauge').args[2],5);
  if(id==='prod-v-recovery'){assert.equal(sources.find(s=>s.id==='prod-sfx-gauge').args[2],3.8);const chime=sources.find(s=>s.id==='prod-sfx-recovery');assert.ok(chime&&chime.at-at>=4550);}
  progress.push({cue:cue.cueNumber,id,elapsedMs:Date.now()-at,audioStarts:await plays()-n,sources:sources.map(s=>({...s,sinceGoMs:s.at-at}))});console.log(cue.cueNumber+' PASS');await delay(1550);
 }
 checks.push('24 manual NEXTs in exact order; no auto advance; no emergency blackout latch');
 };if(process.env.POST_SHOW_CONTROLS_FIRST!=='1')await runFlow();
 admin=await openPage(debug,base+'/admin');await admin.waitFor(`document.querySelector('#cue-rescue-target')`,'Admin rescue UI');await page.send('Page.bringToFront');
 for(const id of ['prod-v-prelude','prod-v-riddle-close','prod-v-curtain-black','prod-021']){
  await ready(id);send({type:'cue:next'});await wait(()=>state.currentCue?.cueId===id,id+' rescue GO');await delay(250);await stop();
  const n=await plays();await delay(2500);assert.equal(await plays(),n,id+' STOP no stale voice');
  send({type:'cue:replay'});await delay(700);assert.equal(state.currentCue?.cueId,id);await stop();
 }
 checks.push('emergency ready -> explicit NEXT, STOP, REPLAY for all four new Cues; delayed speech cancellation');
 send({type:'blackout'});await wait(()=>state.blackout,'BLACKOUT');assert.equal(await page.evaluate(`!document.querySelector('#blackout').hidden`),true);send({type:'blackout:clear'});await wait(()=>!state.blackout,'RESTORE');
 for(const [width,height] of [[1920,1080],[1280,720]]){
  await page.send('Page.bringToFront');await page.setViewport(width,height);
  for(const id of ['prod-v-prelude','prod-v-riddle-close','prod-v-curtain-black','prod-021']){
   if(id==='prod-021')await page.evaluate(`(()=>{window.__sentences=[];window.__captionObserver?.disconnect();const c=document.querySelector('#caption');window.__captionObserver=new MutationObserver(()=>{const text=c.dataset.sentence;if(text&&window.__sentences.at(-1)?.text!==text)window.__sentences.push({text,at:Date.now()})});window.__captionObserver.observe(c,{attributes:true,attributeFilter:['data-sentence']});})()`);
   await execute(id);await delay(id==='prod-v-prelude'?1200:id==='prod-v-curtain-black'?500:id==='prod-021'?1100:300);
   if(id==='prod-v-prelude'||id==='prod-v-curtain-black'||id==='prod-021'){const value=await opacity();assert.ok(value>0&&value<1,id+' actually animates in visible browser: '+value);checks.push({cue:id,viewport:[width,height],midFadeOpacity:value});}
   await shot(`${width}x${height}-${id}-mid`);
   if(id==='prod-021'){await page.waitFor(`document.querySelector('#caption').textContent.length>4`,'P021 actual subtitle');await shot(`${width}x${height}-P-021-subtitle`);await wait(()=>state.cueProgress&&!state.cueProgress.blocked,'P021 full six sentences');const seen=await page.evaluate('window.__sentences'),units=cues.find(c=>c.id===id).speech.subtitleUnits;assert.deepEqual(seen.map(s=>s.text),units.map(s=>s.displayText));const voice=await page.evaluate(`window.__starts.filter(s=>s.id==='prod-voice-021-exit').at(-1)`);const offsets=seen.map((s,i)=>s.at-voice.at-units[i].startMs);assert.ok(offsets.every(ms=>ms>=-100&&ms<500),JSON.stringify(offsets));checks.push({viewport:[width,height],P021Sentences:6,subtitleOnsetOffsetMs:offsets});}
   await stop();
  }
 }
 await execute('prod-021');await delay(500);send({type:'show:reset'});await wait(()=>state.currentCueIndex===-1,'reset');const n=await plays();await delay(2700);assert.equal(await opacity(),1);assert.equal(await plays(),n);assert.equal(state.displayAudioReady,true);checks.push('Reset retains Audio READY; dark; cancels delayed P021');
 await page.send('Page.reload',{});await page.waitFor(`document.querySelector('#connection')?.textContent==='ONLINE'`,'reload');assert.equal(await opacity(),1);assert.equal(await plays(),0);await enable();await shot('1280x720-reset-reload-black');
 const fresh=await openPage(debug,base+'/display?id=new-dark-display',{display:true});await fresh.waitFor(`document.querySelector('#connection')?.textContent==='ONLINE'`,'new Display');assert.equal(await fresh.evaluate(`Number(getComputedStyle(document.querySelector('#show-curtain')).opacity)`),1);fresh.close();checks.push('reload and new Display remain black; no past audio');
 if(process.env.POST_SHOW_CONTROLS_FIRST==='1')await runFlow();
 const networkErrors=page.requests.filter(r=>(page.responses.get(r.id)?.status??200)>=400);assert.deepEqual(networkErrors,[]);assert.deepEqual(page.errors,[]);assert.deepEqual(admin.errors,[]);assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify({status:'PASS',softwareOnly:true,physicalHdmiAudio:'NOT VERIFIED',checks,progress,frames,consoleErrors:page.errors,networkErrors,serverMissingDisplayRisk:'Source unchanged; separate release gate'},null,2));console.log('Post-show browser PASS');
}catch(e){await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:e.stack,errors,progress,serverLog},null,2));throw e;}
finally{observer?.close();page?.close();admin?.close();await stopChild(browser);await stopChild(server);await fs.writeFile(path.join(output,'server.log'),serverLog);await fs.rm(temp,{recursive:true,force:true,maxRetries:8,retryDelay:500});}
