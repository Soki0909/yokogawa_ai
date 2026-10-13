import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { delay, freePort, waitForHttp, stopChild, DevToolsPage, browserPath } from './runtime-test-browser.js';

// Real, visible Chrome windows. No screencast, simulated viewport, or shortened Cue.
// Only isolated server state and a profile created by this invocation are modified.
const out = path.resolve(process.argv[2] || 'artifacts/projection-performance/current');
const passes = Number(process.env.PROJECTION_PASSES || 2);
const idleMs = Number(process.env.PROJECTION_IDLE_MS || 60000);
const position = JSON.parse(process.env.PROJECTION_BOUNDS || '{"left":0,"top":0,"width":1920,"height":1080}');
const adminPosition = JSON.parse(process.env.PROJECTION_ADMIN_BOUNDS || '{"left":1920,"top":-227,"width":1200,"height":900}');
const baselineCommit = process.env.PROJECTION_BASELINE_COMMIT;
const cueFilter = process.env.PROJECTION_CUE_FILTER?.split(',').map(value=>value.trim());
const overrides = baselineCommit ? new Map(['js/display.js','js/lip-sync.js','js/cue-sfx.js','js/tts-adapter.js','css/display-refresh.css'].map(file => [file, execFileSync('git',['show',`${baselineCommit}:public/${file}`],{windowsHide:true})])) : new Map();
const layerStyles={surface:'.stage>.identity{will-change:transform,filter}.identity .image-avatar{will-change:filter}',transform:'.stage>.identity,.identity .image-avatar{will-change:transform}', 'mouth-auto':'.identity .avatar-mouth,.identity .avatar-eyes-closed{will-change:auto!important}'};
if(layerStyles[process.env.PROJECTION_LAYER_TEST]){
 const file='css/display-refresh.css';const original=overrides.get(file)||await fs.readFile(`public/${file}`);
 overrides.set(file,Buffer.concat([original,Buffer.from('\n'+layerStyles[process.env.PROJECTION_LAYER_TEST]+'\n')]));
}
await fs.mkdir(out, { recursive: true });
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'yokogawa-projection-'));
const port = await freePort(), debug = await freePort(), base = `http://127.0.0.1:${port}`;
let server, browser, protocol, display, admin, observer, state;
const send = e => observer.send(JSON.stringify({ ...e, actionId: crypto.randomUUID() }));
const wait = async (predicate, label, ms=30000) => { const end=Date.now()+ms; while(Date.now()<end){if(predicate())return;await delay(30);}throw Error(label); };
const hook = `(() => {
 const clock=()=>performance.timeOrigin+performance.now();
 const p=window.__projection={frames:[],events:[],sends:[],audio:[],longTasks:[],contexts:[],mutations:0,layoutReads:0};
 window.__projectionLiveContexts=new Set();
 const NativeSocket=window.WebSocket;
 window.WebSocket=class extends NativeSocket { constructor(...a){super(...a);window.__projectionLiveSocket=this;this.addEventListener('message',m=>{const e=JSON.parse(m.data);const item={type:e.type,cueId:e.message?.cueId||e.presentation?.cueId,id:e.message?.id,at:clock()};p.events.push(item);requestAnimationFrame(()=>{item.frameAt=clock();});});} send(raw){const e=JSON.parse(raw);p.sends.push({type:e.type,actionId:e.actionId,at:clock()});return super.send(raw);} };
 const play=HTMLMediaElement.prototype.play;
 HTMLMediaElement.prototype.play=function(){const item={src:new URL(this.src).pathname,callAt:clock(),volume:this.volume};p.audio.push(item);this.addEventListener('playing',()=>{item.playingAt=clock();},{once:true});this.addEventListener('ended',()=>{item.endedAt=clock();},{once:true});return play.call(this);};
 const Context=window.AudioContext;
 window.AudioContext=class extends Context { constructor(...a){const started=clock();super(...a);this.__entry={at:started,constructionMs:clock()-started,baseLatency:this.baseLatency,outputLatency:this.outputLatency,sampleRate:this.sampleRate,closed:false};p.contexts.push(this.__entry);window.__projectionLiveContexts.add(this);}async close(){try{return await super.close();}finally{this.__entry.closed=true;window.__projectionLiveContexts.delete(this);}} };
 new PerformanceObserver(list=>{for(const e of list.getEntries())p.longTasks.push({at:performance.timeOrigin+e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});
 let last;function frame(t){if(last!==undefined){if(p.frames.length>=${idleMs>=300000?12000:100000})p.frames.splice(0,${idleMs>=300000?6000:50000});p.frames.push({at:performance.timeOrigin+t,ms:t-last,hidden:document.hidden});}last=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
 document.addEventListener('DOMContentLoaded',()=>{new MutationObserver(es=>{p.mutations+=es.length;}).observe(document.body,{attributes:true,subtree:true,attributeFilter:['style','data-transition','data-transition-status','data-mouth','data-progress']});});
 const descriptor=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'offsetWidth');Object.defineProperty(HTMLElement.prototype,'offsetWidth',{...descriptor,get(){if(this.id==='transition-layer')p.layoutReads++;return descriptor.get.call(this);}});
})();`;
const attach = async url => {const ws=new WebSocket(url);await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return new DevToolsPage(ws,url);};
const page = async (url,bounds,fullscreen=false) => {
 const target=await protocol.send('Target.createTarget',{url:'about:blank',newWindow:true});
 const list=await fetch(`http://127.0.0.1:${debug}/json/list`).then(r=>r.json());
 const p=await attach(list.find(t=>t.id===target.targetId).webSocketDebuggerUrl);
 await Promise.all(['Runtime.enable','Page.enable','Network.enable','Log.enable'].map(m=>p.send(m)));
 if (overrides.size) {
  p.socket.on('message', raw => { const e=JSON.parse(raw);if(e.method!=='Fetch.requestPaused')return;const file=new URL(e.params.request.url).pathname.slice(1);const body=overrides.get(file);void p.send('Fetch.fulfillRequest',{requestId:e.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:file.endsWith('.css')?'text/css':'text/javascript'}],body:body.toString('base64')}).catch(error=>{console.error(error);}); });
  await p.send('Fetch.enable',{patterns:[...overrides.keys()].map(file=>({urlPattern:`${base}/${file}`,requestStage:'Request'}))});
 }
 const {windowId}=await protocol.send('Browser.getWindowForTarget',{targetId:target.targetId});
 p.windowId=windowId;
 await protocol.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal',...bounds}});
 if(fullscreen)await protocol.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'fullscreen'}});
 await p.send('Page.addScriptToEvaluateOnNewDocument',{source:hook});await p.send('Page.navigate',{url});
 await p.waitFor(`document.readyState==='complete' && location.href===${JSON.stringify(url)}`,'navigation');return p;
};
const percentile=(values,q)=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a[Math.min(a.length-1,Math.floor(q*a.length))]:null;};
const summarize=(p,start,end)=>{const f=p.frames.filter(x=>x.at>=start&&x.at<=end&&!x.hidden);const values=f.map(x=>x.ms);return {frames:f.length,medianMs:percentile(values,.5),p95Ms:percentile(values,.95),p99Ms:percentile(values,.99),maxMs:Math.max(0,...values),over25ms:f.filter(x=>x.ms>25).length,over50ms:f.filter(x=>x.ms>50).length,longTasks:p.longTasks.filter(x=>x.at>=start&&x.at<=end)};};
const results=[],resources=[],faults=[];
try {
 server=spawn(process.execPath,['src/server.js'],{windowsHide:true,stdio:'ignore',env:{...process.env,HOST:'127.0.0.1',PORT:String(port),STATE_FILE:path.join(temp,'state.json'),LOG_DIRECTORY:path.join(temp,'logs'),AIVIS_ENGINE_URL:'http://127.0.0.1:9'}});
 await waitForHttp(`${base}/health`);
 browser=spawn(browserPath,['--no-first-run','--no-default-browser-check','--no-proxy-server',`--remote-debugging-port=${debug}`,`--user-data-dir=${path.join(temp,'browser')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 await waitForHttp(`http://127.0.0.1:${debug}/json/version`);
 protocol=await attach((await fetch(`http://127.0.0.1:${debug}/json/version`).then(r=>r.json())).webSocketDebuggerUrl);
 admin=await page(`${base}/admin`,adminPosition);display=await page(`${base}/display?id=projection&name=HDMI`,position,true);
 observer=new WebSocket(`${base.replace('http','ws')}/ws`);await new Promise(resolve=>observer.once('open',resolve));observer.on('message',raw=>{const e=JSON.parse(raw);if(e.type==='state')state=e.state;});send({type:'hello',role:'admin'});
 await wait(()=>state?.displays?.some(d=>d.displayId==='projection'),'registered');send({type:'audio-master:set',displayId:'projection'});
 await display.waitFor(`document.querySelector('#audio-help').textContent.includes('20 / 20 READY')`,'preload');
 // Real trusted mouse gesture unlocks audio, preserving the actual browser policy.
 await display.evaluate(`document.querySelector('#enable-audio').scrollIntoView({block:'center'})`);
 const point=await display.evaluate(`(()=>{const r=document.querySelector('#enable-audio').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 await display.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await display.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
 await wait(()=>state?.displayAudioReady,'audio ready');
 const environment=await display.evaluate(`({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,screen:{width:screen.width,height:screen.height,left:screen.availLeft,top:screen.availTop},hidden:document.hidden,focus:document.hasFocus(),userAgent:navigator.userAgent})`);
 assert.equal(environment.width,position.width);assert.equal(environment.height,position.height);assert.equal(environment.hidden,false);
 await display.send('Performance.enable');
 await fs.writeFile(path.join(out,'environment.json'),JSON.stringify(environment,null,2));
 const layerState=await display.evaluate(`({identity:getComputedStyle(document.querySelector('.identity')).willChange,image:getComputedStyle(document.querySelector('.image-avatar')).willChange,mouth:getComputedStyle(document.querySelector('.avatar-mouth')).willChange})`);
 if(process.env.PROJECTION_LAYER_TEST==='surface'){assert.equal(layerState.identity,'transform, filter');assert.equal(layerState.image,'filter');}
 if(process.env.PROJECTION_LAYER_TEST==='transform')assert.equal(layerState.identity,'transform');
 if(process.env.PROJECTION_LAYER_TEST==='mouth-auto')assert.equal(layerState.mouth,'auto');
 console.log(`HDMI visible: ${JSON.stringify(environment)}`);
 for(let pass=0;pass<passes;pass++){
  send({type:'production:reset'});await delay(800);await wait(()=>state?.displayAudioReady,'reset ready');send({type:'rehearsal:start'});await delay(300);
  const show=await fetch(`${base}/api/show-file`).then(r=>r.json());const allCues=show.cues.filter(c=>c.enabled!==false&&c.route==='main').sort((a,b)=>a.order-b.order);const cues=cueFilter?allCues.filter(c=>cueFilter.includes(c.cueNumber)):allCues;
  for(const cue of cues){
   if(cueFilter){const index=allCues.findIndex(c=>c.id===cue.id);if(index>0){send({type:'cue:jump',cueId:allCues[index-1].id});await wait(()=>state.currentCueIndex===index-1,'targeted jump');await delay(100);}}
   await admin.send('Page.bringToFront');
   await admin.waitFor(`!document.querySelector('#show-next-button').disabled`,'NEXT ready');
   const ap=await admin.evaluate(`(()=>{const e=document.querySelector('#show-next-button');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;if(!e.contains(document.elementFromPoint(x,y)))throw Error('NEXT is covered');return {x,y};})()`);
   await admin.send('Input.dispatchMouseEvent',{type:'mousePressed',...ap,button:'left',clickCount:1});await admin.send('Input.dispatchMouseEvent',{type:'mouseReleased',...ap,button:'left',clickCount:1});
   const start=Date.now();await wait(()=>state?.currentCue?.cueId===cue.id,`accepted ${cue.id}`);
   if(cue.audio?.speechMode==='audio-file')await wait(()=>state.history.some(h=>h.cueId===cue.id&&Date.parse(h.createdAt)>=start-1000&&h.status==='completed'),`audio ${cue.id}`,90000);
   await wait(()=>state.currentTransition?.status!=='active'&&state.unlock?.status!=='running'&&!state.currentOverlay?.expiresAt&&!state.currentVisual?.expiresAt,`visual ${cue.id}`);
   await delay(Math.max(0,start+Math.max(cue.transition?.durationMs||0,...(cue.sfx||[]).map(s=>s.atMs+s.durationMs))-Date.now()));await delay(2000);
   const action=await admin.evaluate(`window.__projection.sends.findLast(e=>e.type==='cue:next')`);
   // Export only this Cue's samples; serializing the entire show each time
   // would manufacture long tasks inside the measurement itself.
   const p=await display.evaluate(`(()=>{const p=window.__projection,t=${action.at};return {frames:p.frames.filter(e=>e.at>=t),events:p.events.filter(e=>e.at>=t),audio:p.audio.filter(e=>e.callAt>=t),longTasks:p.longTasks.filter(e=>e.at>=t),layoutReads:p.layoutReads,mutations:p.mutations};})()`);
   const presentation=p.events.find(e=>e.type==='presentation'&&e.at>=action.at);
   const speech=p.events.find(e=>e.type==='speak'&&e.cueId===cue.id&&e.at>=action.at);
   const audio=p.audio.find(e=>e.src.includes(cue.audio?.assetId)&&e.callAt>=action.at);
   const result={pass:pass+1,cue:cue.cueNumber,start:action.at,end:Date.now(),actionToPresentationMs:presentation?presentation.at-action.at:null,actionToNextFrameMs:presentation?presentation.frameAt-action.at:null,speechReceiveToPlayingMs:audio?.playingAt&&speech?audio.playingAt-speech.at:null,playCallToPlayingMs:audio?.playingAt?audio.playingAt-audio.callAt:null,frames:summarize(p,action.at,Date.now()),forcedTransitionLayoutReads:p.layoutReads,mutations:p.mutations};results.push(result);
   console.log(JSON.stringify(result));await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(results,null,2));
   if(pass===0&&cue.cueNumber==='P-V02'&&idleMs){const before=await display.evaluate('window.__projection.audio.length'),index=state.currentCueIndex;console.log(`Idle ${idleMs}ms after Scene 1`);const idleStart=Date.now();for(let left=idleMs;left>0;left-=10000){await delay(Math.min(left,10000));assert.equal(state.currentCueIndex,index);assert.equal(await display.evaluate('window.__projection.audio.length'),before);await fs.writeFile(path.join(out,'idle-progress.json'),JSON.stringify({elapsedMs:Date.now()-idleStart,targetMs:idleMs,cueUnchanged:true,spontaneousAudio:0}));}await fs.writeFile(path.join(out,'idle.json'),JSON.stringify({milliseconds:Date.now()-idleStart,spontaneousAudio:0,cueUnchanged:true}));}
  }
  const metrics=await display.send('Performance.getMetrics');const dom=await display.send('Memory.getDOMCounters');
  resources.push({pass:pass+1,heapBytes:metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value,dom,liveAudioContexts:await display.evaluate('window.__projectionLiveContexts.size')});
  await fs.writeFile(path.join(out,'resources.json'),JSON.stringify(resources,null,2));
 }
 const measuredTelemetry=await display.evaluate('window.__projection');
 await fs.writeFile(path.join(out,'telemetry-measurement.json'),JSON.stringify(measuredTelemetry));
 if(process.env.PROJECTION_FAULTS==='1'){
  const count=()=>display.evaluate('window.__projection.audio.length');
  const trustedClick=async (p,selector)=>{await p.send('Page.bringToFront');const point=await p.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await p.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await p.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});};
  let n=await count(),index=state.currentCueIndex;
  await protocol.send('Browser.setWindowBounds',{windowId:display.windowId,bounds:{windowState:'normal'}});
  await protocol.send('Browser.setWindowBounds',{windowId:display.windowId,bounds:{windowState:'minimized'}});await display.waitFor('document.hidden','actual minimized');await delay(12000);
  assert.equal(await count(),n);assert.equal(state.currentCueIndex,index);
  await protocol.send('Browser.setWindowBounds',{windowId:display.windowId,bounds:{windowState:'normal'}});await protocol.send('Browser.setWindowBounds',{windowId:display.windowId,bounds:{windowState:'fullscreen'}});await display.send('Page.bringToFront');await display.waitFor('!document.hidden','restored');await delay(1000);assert.equal(await count(),n);faults.push({name:'actual window minimize/restore 12s',automaticAudio:0,status:'PASS'});
  // Safe sleep proxy: the actual HDMI browser renderer stops JS/heartbeat.
  await display.evaluate('Promise.all([...window.__projectionLiveContexts].map(context=>context.suspend()))');
  await display.send('Debugger.enable');await display.send('Debugger.pause');await delay(300);send({type:'cue:execute',cueId:'prod-002'});await delay(12000);await display.send('Debugger.resume');await display.send('Debugger.disable');await delay(2500);assert.equal(await count(),n);faults.push({name:'12s JS suspension + AudioContext suspend + queued speech + heartbeat recovery',automaticAudio:0,status:'PASS'});
  await wait(()=>state.displayAudioReady,'recovery ready');
  n=await count();send({type:'cue:execute',cueId:'prod-001'});await delay(150);await trustedClick(admin,'#show-stop-button');await delay(3500);assert.equal(await count(),n);assert.equal(await display.evaluate('window.__projectionLiveContexts.size'),0);faults.push({name:'STOP cancels pending startup SFX/speech',automaticAudio:0,status:'PASS'});
  const replay=Date.now();await trustedClick(admin,'#show-replay-button');await wait(()=>state.history.some(h=>h.cueId==='prod-001'&&Date.parse(h.createdAt)>=replay-1000&&h.status==='completed'),'explicit replay',30000);await delay(1000);assert.equal(await count(),n+2);faults.push({name:'explicit REPLAY executes startup exactly once',status:'PASS'});
  n=await count();await display.evaluate(`window.__projectionLiveSocket.close()`);await delay(1500);await wait(()=>state.displayAudioReady,'reconnect ready');assert.equal(await count(),n);faults.push({name:'WebSocket reconnect restores stable state only',automaticAudio:0,status:'PASS'});
  index=state.currentCueIndex;await display.send('Page.reload');await display.waitFor(`document.querySelector('#audio-help').textContent.includes('20 / 20 READY')`,'reload preload');await trustedClick(display,'#enable-audio');await wait(()=>state.displayAudioReady,'reload ready');await delay(1200);assert.equal(await count(),0);assert.equal(state.currentCueIndex,index);faults.push({name:'reload + manual Audio Ready does not replay',automaticAudio:0,status:'PASS'});
  await display.evaluate(`window.__realProjectionDateNow=Date.now;Date.now=()=>window.__realProjectionDateNow()+7200000;`);await delay(1000);await display.evaluate('Date.now=window.__realProjectionDateNow');await delay(1000);assert.equal(await count(),0);faults.push({name:'2h clock jump and restore',automaticAudio:0,status:'PASS'});
  for(let i=0;i<5;i++){send({type:'production:reset'});await delay(800);await wait(()=>state.displayAudioReady,'reset ready');assert.equal(state.currentCueIndex,-1);assert.equal(await count(),0);assert.equal(await display.evaluate('window.__projectionLiveContexts.size'),1);}faults.push({name:'five Production Resets; one prepared context, no sources/audio',automaticAudio:0,status:'PASS'});
  await fs.writeFile(path.join(out,'faults.json'),JSON.stringify(faults,null,2));
 }
 await display.screenshot(path.join(out,'display-final.png'));
 await display.evaluate(`document.getAnimations().forEach(animation=>{animation.pause();animation.currentTime=1250;});document.querySelector('#avatar-wrap').dataset.blink='open';document.querySelector('#avatar-wrap').dataset.mouth='closed';`);
 await display.screenshot(path.join(out,'display-comparison.png'));
 const telemetry=await display.evaluate('window.__projection');
 const summary={status:'PASS',visible:true,passes,cues:results.length,targetedCueFilter:cueFilter||null,layerTest:process.env.PROJECTION_LAYER_TEST||null,layerState,baselineCommit:baselineCommit||null,environment,resources,faults,actionToNextFrameP95:percentile(results.map(r=>r.actionToNextFrameMs),.95),playCallToPlayingP95:percentile(results.map(r=>r.playCallToPlayingMs),.95),cueLongTasks:results.reduce((sum,r)=>sum+r.frames.longTasks.length,0),framesOver50ms:results.reduce((sum,r)=>sum+r.frames.over50ms,0),longTasks:measuredTelemetry.longTasks.length,forcedTransitionLayoutReads:measuredTelemetry.layoutReads,contexts:measuredTelemetry.contexts,unexpectedBrowserErrors:display.errors.concat(admin.errors)};
 assert.deepEqual(summary.unexpectedBrowserErrors,[]);
 await fs.writeFile(path.join(out,'telemetry.json'),JSON.stringify(telemetry));await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(summary);
} catch(error) {
 await admin?.screenshot(path.join(out,'failure-admin.png')).catch(()=>{});
 await display?.screenshot(path.join(out,'failure-display.png')).catch(()=>{});
 const fault={error:error.message,currentCue:state?.currentCue,nextCue:state?.nextCue,admin:await admin?.evaluate('window.__projection').catch(()=>null),display:await display?.evaluate('window.__projection').catch(()=>null)};
 await fs.writeFile(path.join(out,'failure.json'),JSON.stringify(fault,null,2));throw error;
} finally {observer?.close();display?.close();admin?.close();protocol?.close();await stopChild(browser);await stopChild(server);if(!temp.startsWith(path.join(os.tmpdir(),'yokogawa-projection-')))throw Error('Invalid test temp');await fs.rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:500});}
