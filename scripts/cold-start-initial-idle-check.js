// Diagnostic only: fresh headed Chrome, first P-001, optional REAL initial-screen idle.
// No renderer polling, OS loopback, audible warmup or synthetic visibility during idle.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {WebSocket} from 'ws';
import {freePort,waitForHttp,stopChild,openPage,DevToolsPage,browserPath,delay} from './runtime-test-browser.js';

const directory=path.resolve(process.argv[2]||'artifacts/audio-reliability-20261014/cold-start-one-hour');
const idleMs=Number(process.env.INITIAL_IDLE_MS||0), runs=Number(process.env.COLD_RUNS||1), diagnostic=process.env.SILENCE_DIAGNOSTIC==='1';
assert.ok(Number.isFinite(idleMs)&&idleMs>=0);assert.ok(Number.isInteger(runs)&&runs>0&&runs<=5);
if(idleMs&&!diagnostic)assert.ok(idleMs>=3600000,'The initial-idle acceptance run must last at least 3600 real seconds');
await fs.mkdir(directory,{recursive:true});
const hook=`(()=>{
 const now=()=>performance.timeOrigin+performance.now();
 window.__cold={sources:[],contexts:[],wire:[],clicks:[],visibility:[],visual:[],frames:[],long:[],clock:[],capture:false};
 document.addEventListener('visibilitychange',()=>window.__cold.visibility.push({at:now(),hidden:document.hidden,focus:document.hasFocus()}));
 document.addEventListener('click',e=>window.__cold.clicks.push({at:now(),id:e.target.closest('button')?.id,trusted:e.isTrusted,activation:navigator.userActivation.isActive}),true);
 const NativeWS=WebSocket;window.WebSocket=class extends NativeWS{constructor(...args){super(...args);this.addEventListener('message',raw=>{const e=JSON.parse(raw.data);if(['cue:prepare','presentation','speak','sfx','stop','error','accepted'].includes(e.type))window.__cold.wire.push({direction:'in',at:now(),event:e});});}send(raw){const e=JSON.parse(raw);if(['cue:next','cue:prepared','cue:execute'].includes(e.type))window.__cold.wire.push({direction:'out',at:now(),event:e});return super.send(raw);}};
 const NativeContext=AudioContext;window.AudioContext=class extends NativeContext{constructor(...args){super(...args);window.__cold.contexts.push(this);}};
 const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){const context=this.context,e={assetId:this.__yokogawaAssetId,at:now(),contextTime:context.currentTime,duration:this.buffer.duration,state:context.state,baseLatency:context.baseLatency,outputLatency:context.outputLatency,outputTimestamp:context.getOutputTimestamp()};window.__cold.sources.push(e);if(!window.__cold.clockStarted){window.__cold.clockStarted=true;const timer=setInterval(()=>window.__cold.clock.push({at:now(),contextTime:context.currentTime,state:context.state,outputTimestamp:context.getOutputTimestamp()}),25);setTimeout(()=>clearInterval(timer),9000);}this.addEventListener('ended',()=>e.endedAt=now(),{once:true});return start.call(this,...args);};
 const recordings=new Map(),connect=AudioNode.prototype.connect,disconnect=AudioNode.prototype.disconnect;
 AudioNode.prototype.connect=function(destination,...args){const result=connect.call(this,destination,...args);if(window.__cold.capture&&destination instanceof AudioDestinationNode&&this.__yokogawaAssetId){const stream=this.context.createMediaStreamDestination(),recorder=new MediaRecorder(stream.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000}),chunks=[],assetId=this.__yokogawaAssetId,at=now();recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=async()=>{const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=32768)data+=String.fromCharCode(...bytes.subarray(i,i+32768));window.coldCapture(JSON.stringify({assetId,at,data:btoa(data)}));stream.stream.getTracks().forEach(t=>t.stop());};recordings.set(this,recorder);recorder.start();connect.call(this,stream);}return result;};
 AudioNode.prototype.disconnect=function(...args){const result=disconnect.call(this,...args),recorder=recordings.get(this);if(recorder){recordings.delete(this);if(recorder.state!=='inactive')recorder.stop();}return result;};
 document.addEventListener('DOMContentLoaded',()=>new MutationObserver(events=>{for(const e of events){const item={at:now(),id:e.target.id||e.target.tagName,attribute:e.attributeName,value:e.target.getAttribute(e.attributeName)};window.__cold.visual.push(item);requestAnimationFrame(()=>item.frameAt=now());}}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden','data-transition','data-transition-status','data-preset']}));
 window.__cold.startFrames=()=>{let last;function frame(t){if(last)window.__cold.frames.push({at:performance.timeOrigin+t,ms:t-last,hidden:document.hidden});last=t;if(window.__cold.frames.length<5000)requestAnimationFrame(frame);}requestAnimationFrame(frame);};
 new PerformanceObserver(list=>window.__cold.long.push(...list.getEntries().map(e=>({at:performance.timeOrigin+e.startTime,duration:e.duration})))).observe({type:'longtask'});
})();`;
const all=[];
for(let run=1;run<=runs;run++){
 const output=path.join(directory,`run-${run}`);await fs.mkdir(output,{recursive:true});
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'yokogawa-cold-initial-')),port=await freePort(),debug=await freePort(),base=`http://127.0.0.1:${port}`;
 let server,browser,page,admin,observer,state,writes=Promise.resolve(),traceFinished;const errors=[],captures=[],progress=[],samples=[],traceEvents=[];
 const save=(name,value)=>fs.writeFile(path.join(output,name),JSON.stringify(value,null,2));
 const send=e=>observer.send(JSON.stringify({...e,actionId:crypto.randomUUID()}));
 const wait=async(fn,label,ms=40000)=>{const end=performance.now()+ms;while(performance.now()<end){if(fn())return;await delay(25);}throw Error(`Timeout ${label}: ${JSON.stringify(errors)}`);};
 const diag=()=>page.evaluate(`import('/js/display.js').then(m=>m.productionAudioDiagnostics())`);
 const enter=async(p,selector)=>{
  await p.waitFor(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return e&&!e.disabled&&!e.closest('[hidden]')})()`,'enabled '+selector);
  await p.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  await p.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13});
  await p.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 };
 try{
  server=spawn(process.execPath,['src/server.js'],{windowsHide:true,stdio:'ignore',env:{...process.env,HOST:'127.0.0.1',PORT:String(port),STATE_FILE:path.join(temp,'state.json'),LOG_DIRECTORY:path.join(temp,'logs'),AIVIS_ENGINE_URL:'http://127.0.0.1:9'}});await waitForHttp(base+'/health');
  browser=spawn(browserPath,['--no-first-run','--no-default-browser-check',`--remote-debugging-port=${debug}`,`--user-data-dir=${path.join(temp,'chrome')}`,'--window-size=1920,1080','about:blank'],{windowsHide:false,stdio:'ignore'});await waitForHttp(`http://127.0.0.1:${debug}/json/version`);
  const launcher=await openPage(debug,'about:blank');
  const {targetId:adminTarget}=await launcher.send('Target.createTarget',{url:'about:blank',newWindow:true});
  const targets=await fetch(`http://127.0.0.1:${debug}/json/list`).then(r=>r.json());const adminSocket=new WebSocket(targets.find(t=>t.id===adminTarget).webSocketDebuggerUrl);await new Promise((resolve,reject)=>{adminSocket.once('open',resolve);adminSocket.once('error',reject);});
  admin=new DevToolsPage(adminSocket,base+'/admin');for(const method of ['Runtime.enable','Log.enable','Network.enable','Page.enable'])await admin.send(method);
  await admin.send('Page.addScriptToEvaluateOnNewDocument',{source:hook});await admin.send('Page.navigate',{url:base+'/admin'});
  const {targetId:displayTargetId}=await launcher.send('Target.createTarget',{url:'about:blank',newWindow:true});
  const displayTargets=await fetch(`http://127.0.0.1:${debug}/json/list`).then(r=>r.json()),displaySocket=new WebSocket(displayTargets.find(t=>t.id===displayTargetId).webSocketDebuggerUrl);await new Promise((resolve,reject)=>{displaySocket.once('open',resolve);displaySocket.once('error',reject);});
  page=new DevToolsPage(displaySocket,base+'/display');for(const method of ['Runtime.enable','Log.enable','Network.enable','Page.enable'])await page.send(method);await page.setViewport(1920,1080);
  await page.send('Page.addScriptToEvaluateOnNewDocument',{source:hook});await page.send('Runtime.addBinding',{name:'coldCapture'});
  page.socket.on('message',raw=>{const e=JSON.parse(raw);if(e.method==='Runtime.bindingCalled'&&e.params.name==='coldCapture'){const clip=JSON.parse(e.params.payload),file=`${String(captures.length).padStart(3,'0')}-${clip.assetId}.webm`;captures.push({assetId:clip.assetId,at:clip.at,file});writes=writes.then(()=>fs.writeFile(path.join(output,file),Buffer.from(clip.data,'base64')));}});
  await page.send('Page.navigate',{url:base+'/display?id=cold-initial&name=Cold-initial-1080'});
  const screens=JSON.parse(execFileSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-Command',"Add-Type -AssemblyName System.Windows.Forms; @([System.Windows.Forms.Screen]::AllScreens | ForEach-Object { [pscustomobject]@{primary=$_.Primary;x=$_.Bounds.X;y=$_.Bounds.Y;width=$_.Bounds.Width;height=$_.Bounds.Height} }) | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}));
  const projection=screens.find(s=>s.width===1920&&s.height===1080),operator=screens.find(s=>s!==projection);
  if(projection&&operator){
   const displayTarget=(await page.send('Target.getTargetInfo')).targetInfo.targetId,displayWindow=(await page.send('Browser.getWindowForTarget',{targetId:displayTarget})).windowId,adminWindow=(await admin.send('Browser.getWindowForTarget',{targetId:adminTarget})).windowId;
   assert.notEqual(displayWindow,adminWindow);
   await page.send('Browser.setWindowBounds',{windowId:displayWindow,bounds:{left:projection.x,top:projection.y,width:projection.width,height:projection.height,windowState:'normal'}});
   await page.send('Browser.setWindowBounds',{windowId:displayWindow,bounds:{windowState:'fullscreen'}});
   await admin.send('Browser.setWindowBounds',{windowId:adminWindow,bounds:{left:operator.x,top:operator.y,width:operator.width,height:operator.height,windowState:'normal'}});
  }
  launcher.close();
  observer=new WebSocket(base.replace('http','ws')+'/ws');await new Promise((resolve,reject)=>{observer.once('open',resolve);observer.once('error',reject);});observer.on('message',raw=>{const e=JSON.parse(raw);if(e.type==='state')state=e.state;if(e.type==='error')errors.push(e);});send({type:'hello',role:'admin'});
  await page.waitFor(`document.querySelector('#audio-help').textContent.includes('20 / 20 READY')`,'20 actual decoded assets',120000);
  await page.send('Page.bringToFront');await enter(page,'#enable-audio');await wait(()=>state?.displayAudioReady,'canonical READY');
  assert.equal(state.currentCueIndex,-1);assert.equal(await page.evaluate('window.__cold.sources.length'),0);
  // Capture is armed, but no MediaStream/recorder/audio device is opened until a real Cue source connects.
  await page.evaluate('window.__cold.capture=true');
  await admin.send('Page.bringToFront');
  const environment={screens,display:await page.evaluate(`({screen:{width:screen.width,height:screen.height},viewport:[innerWidth,innerHeight],hidden:document.hidden,focus:document.hasFocus(),userAgent:navigator.userAgent,activation:window.__cold.clicks,visibility:window.__cold.visibility})`),admin:await admin.evaluate('({hidden:document.hidden,focus:document.hasFocus(),screenX,screenY,outerWidth,outerHeight})')};
  const initial={at:new Date().toISOString(),state,diagnostics:await diag(),environment,headless:false,autoplayBypass:false,physicalHdmi:'Windows detects PHL HDMI display and Display Audio; actual loudspeaker/acoustic output NOT VERIFIED',adminActivation:'CDP trusted Enter targeting real Admin button; separate native windows placed on detected displays',sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()};await save('initial.json',initial);await page.screenshot(path.join(output,'initial-1920x1080.png'));
  const beganWall=Date.now(),began=performance.now();
  if(process.env.SILENCE_TRACE==='1'){
   traceFinished=new Promise(resolve=>{page.socket.on('message',raw=>{const e=JSON.parse(raw);if(e.method==='Tracing.dataCollected')traceEvents.push(...e.params.value);if(e.method==='Tracing.tracingComplete')resolve();});});
   await page.send('Tracing.start',{categories:'audio,webaudio,media',options:'record-as-much-as-possible'});
  }
  if(idleMs){
   console.log(JSON.stringify({phase:'INITIAL_IDLE_STARTED',run,serverPid:server.pid,browserPid:browser.pid,base,debug,at:new Date(beganWall).toISOString(),targetMs:idleMs}));
   while(performance.now()-began<idleMs){
    await delay(Math.min(60000,idleMs-(performance.now()-began)));
    const sample={elapsedMs:performance.now()-began,at:new Date().toISOString(),currentCueIndex:state.currentCueIndex,ready:state.displayAudioReady,heartbeat:state.displays.find(d=>d.displayId==='cold-initial')?.lastHeartbeat};
    try{const at=performance.now();const r=await fetch(base+'/health',{signal:AbortSignal.timeout(3000)});sample.httpStatus=r.status;sample.serverMs=performance.now()-at;}catch(e){sample.error=e.message;}
    samples.push(sample);await save('idle-progress.json',{beganWall,targetMs:idleMs,elapsedMs:performance.now()-began,samples});
    console.log(JSON.stringify({phase:'IDLE_EXTERNAL_ONLY',...sample}));
   }
  }
  const endedWall=Date.now(),elapsedMs=performance.now()-began;
  // IMPORTANT: no Display evaluate/verify/reload/loopback before this first post-idle NEXT.
  const beforeGoState=structuredClone(state),goAt=Date.now();await admin.send('Page.bringToFront');await enter(admin,'#show-next-button');await page.send('Page.bringToFront');
  await wait(()=>state.currentCue?.cueId==='prod-001','first P-001 accepted');
  if(process.env.AFTER_GO_SESSION_PROBE==='1'){
   await delay(220);const start=Date.now();
   const sessions=execFileSync('artifacts/audio-reliability-20261014/rehearsal-revision/loopback.exe',['--sessions'],{encoding:'utf8',windowsHide:true});
   const processes=execFileSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process | Where-Object {$_.ParentProcessId -eq ${browser.pid}} | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true});
   await save('session-probe.json',{start,end:Date.now(),sessions,processes:JSON.parse(processes)});
  }
  await wait(()=>!state.nextBlock&&!state.cueProgress?.blocked,'P-001 actual finite end',60000);await delay(700);await writes;
  if(traceFinished){await page.send('Tracing.end');await Promise.race([traceFinished,delay(10000).then(()=>{throw Error('trace timeout');})]);await save('audio-trace.json',{traceEvents});}
  const data=await page.evaluate(`({...window.__cold,contexts:window.__cold.contexts.map(c=>({state:c.state,currentTime:c.currentTime,baseLatency:c.baseLatency,outputLatency:c.outputLatency}))})`),adminData=await admin.evaluate('({wire:window.__cold.wire,clicks:window.__cold.clicks,hidden:document.hidden,focus:document.hasFocus()})');
  await save('display-events.json',data);await save('admin-events.json',adminData);await save('after-first.json',{state,diagnostics:await diag()});
  progress.push({pass:run,cue:'P-001',goAt,sources:data.sources});await save('progress.json',progress);await save('captures.json',captures);
  await page.screenshot(path.join(output,'after-P001-1920x1080.png'));
  assert.ok(adminData.clicks.some(c=>c.id==='show-next-button'&&c.trusted&&c.activation),'Actual trusted Admin input required');
  assert.equal(beforeGoState.currentCueIndex,-1);assert.ok(beforeGoState.displayAudioReady);assert.equal(state.currentCueIndex,0);assert.equal(data.sources.length,2);assert.ok(data.sources.every(s=>s.at>=goAt&&s.endedAt&&s.state==='running'));assert.deepEqual(errors,[]);assert.deepEqual(page.errors,[]);
  if(idleMs){if(!diagnostic)assert.ok(elapsedMs>=3600000);assert.ok(samples.every(s=>s.currentCueIndex===-1&&!s.error&&s.httpStatus===200));}
  const show=await fetch(base+'/api/show-file').then(r=>r.json()),cue=show.cues.find(c=>c.id==='prod-001');
  const [boot,voice]=data.sources,contextWallSpanDeltaMs=voice.at-boot.at-(voice.contextTime-boot.contextTime)*1000;
  const summary={status:`${diagnostic?'DIAGNOSTIC ONLY; ':''}CUE EXECUTION PASS; ${contextWallSpanDeltaMs>40?'CLOCK TIMING REVIEW REQUIRED; ':''}physical output NOT VERIFIED`,contextWallSpanDeltaMs,run,idleMs:elapsedMs,requestedIdleMs:idleMs,beganAt:new Date(beganWall).toISOString(),endedAt:new Date(endedWall).toISOString(),cue:cue.cueNumber,intendedTiming:cue.timing,sfx:cue.sfx,goAt,sources:data.sources,wire:data.wire,admin:adminData,automaticIdleAudio:data.sources.filter(s=>s.at<goAt).length,finalDecoded:(await diag()).stats,physicalOnset:null,osFirstPacket:null,acousticHead:null,errors,browserErrors:page.errors,environment,initialSha:initial.sha,externalOnlySamples:samples.length,limits:['CDP attached but no Display commands or renderer polling during idle','Digital MediaRecorder branch opens only for actual post-GO source; not OS or acoustic recording','Digital sample continuity does not prove real-time clock continuity','No physical loudspeaker/acoustic acceptance; Windows HDMI detection alone is insufficient']};
  await save('summary.json',summary);all.push(summary);await fs.writeFile(path.join(directory,'summary.json'),JSON.stringify(all,null,2));console.log(JSON.stringify({phase:'FIRST_P001_COMPLETE',run,idleMs:elapsedMs,sources:data.sources.map(s=>({id:s.assetId,goToStartMs:s.at-goAt}))}));
 }catch(error){await save('failure.json',{error:error.stack,state,errors,admin:await admin?.evaluate('window.__cold').catch(()=>null),display:await page?.evaluate('({...window.__cold,contexts:[]})').catch(()=>null)});throw error;}
 finally{await writes;await fs.cp(path.join(temp,'logs'),path.join(output,'server-logs'),{recursive:true}).catch(()=>{});observer?.close();page?.close();admin?.close();await stopChild(browser);await stopChild(server);await fs.rm(temp,{recursive:true,force:true,maxRetries:8,retryDelay:500});}
}
