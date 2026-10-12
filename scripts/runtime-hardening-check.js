import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { delay, freePort, waitForHttp, stopChild, openPage, browserPath } from './runtime-test-browser.js';

const mode = process.argv[2] ?? 'phase-b';
const continuation = mode === 'phase-c-continuation';
const endurance = mode === 'phase-c-endurance';
assert.ok(['phase-b','phase-c-smoke','phase-c','phase-c-continuation','phase-c-endurance'].includes(mode),'Unknown test mode');
const directory = path.resolve(process.env.RUNTIME_HARDENING_ARTIFACTS ?? 'artifacts/runtime-hardening'); await mkdir(directory,{recursive:true});
const show = JSON.parse(await readFile('shows/production.json','utf8'));
const fingerprintFiles = ['src/server.js','src/state-store.js','src/cue-scheduler.js','src/show-schema.js','public/js/admin.js','public/js/display.js','public/js/cue-sfx.js','public/js/socket-client.js','shows/production.json','public/js/subtitle-units.js','src/production-asset-slots.js'];
export async function fingerprint() { const hash=createHash('sha256'); for(const file of fingerprintFiles) hash.update(await readFile(file));return hash.digest('hex'); }
async function idleEvidenceBridge(evidence) {
  const baseline=await readFile(path.join(directory,'idle-state-store.js'),'utf8');
  const current=await readFile('src/state-store.js','utf8');
  assert.equal(current.replace('      if (p.previousVisualState) p.previousVisualState.currentSubtitle = null;\n',''),baseline,'Only the BLACKOUT caption cache sanitizer may differ from real-idle implementation');
  const hash=createHash('sha256');for(const file of fingerprintFiles)hash.update(file==='src/state-store.js'?baseline:await readFile(file));
  const priorGate=JSON.parse(await readFile(path.join(directory,'idle-phase-b-pass.json'),'utf8'));
  assert.equal(hash.digest('hex'),priorGate.fingerprint);
  assert.equal(evidence.state.previousVisualState,null);assert.ok(show.cues.every(c=>c.kind!=='blackout'));
  assert.ok(evidence.state.displays.every(d=>d.previousVisualState==null));
  return {observedFingerprint:priorGate.fingerprint,verifiedFingerprint:await fingerprint(),onlyChange:'Sanitize cached BLACKOUT subtitle on recovery',cacheAbsentDuringIdle:true,affectedBranchRetest:'BLACKOUT + 12s JS pause + RESTORE'};
}
if(mode.startsWith('phase-c')) { const gate=JSON.parse(await readFile(path.join(directory,'phase-b-pass.json'),'utf8'));assert.equal(gate.status,'PASS');assert.equal(gate.fingerprint,await fingerprint(),'Phase B must pass on this exact implementation before long tests'); }
const temporary=await mkdtemp(path.join(os.tmpdir(),'yokogawa-hardening-'));
const port=await freePort(); const debugPort=await freePort(); const base=`http://127.0.0.1:${port}`;
let server,browser,display,admin,observer,state; const errors=[]; const samples=[]; const scenarios=[]; const scene6Audio=[]; let resetCount=0; let performances=0; let longestIdleMs=0;
const injectedRestartDiagnostics=[];
if (continuation) {
  const evidence=JSON.parse(await readFile(path.join(directory,'phase-c-failure.json'),'utf8'));
  const bridge=await idleEvidenceBridge(evidence);
  assert.ok(evidence.error.includes('state.displayAudioReady'),'Only the background-readiness assertion may continue');
  assert.ok(evidence.longestIdleMs>=35*60000);assert.equal(evidence.state.currentCueIndex,9);
  assert.equal(evidence.state.metadata.showHash,show.metadata.showHash);
  const idle=evidence.samples.filter(s=>s.label==='real-extended-idle-background');
  assert.ok(idle.length>=70);assert.ok(idle.every(s=>s.runtime.cueIndex===9&&s.audio.plays===13&&s.audio.contexts===0&&s.runtime.cueTimers===0));
  await writeFile(path.join(temporary,'state.json'),JSON.stringify(evidence.state));
  longestIdleMs=evidence.longestIdleMs;resetCount=evidence.resetCount;samples.push(...evidence.samples);
  scenarios.push({name:'real-extended-idle-background-observation',status:'PASS',elapsedMs:longestIdleMs,readyWhileBackground:false,continuation:'Saved stable checkpoint; server/browser restart before explicit Scene6 NEXT'});
  await writeFile(path.join(directory,'long-idle-observation.json'),JSON.stringify({status:'PASS',bridge,elapsedMs:longestIdleMs,samples:idle.length,cueIndex:9,plays:13,readyWhileBackground:false,foregroundRecoveryGate:'Requires continuation and targeted recovery PASS'},null,2));
}
if (endurance) {
  const evidence=JSON.parse(await readFile(path.join(directory,'phase-c-continuation-failure.json'),'utf8'));
  scenarios.push({name:'real-idle-source-compatibility',status:'PASS',...await idleEvidenceBridge(evidence)});
  assert.ok(evidence.error.includes('resume must not replay'));assert.equal(evidence.performances,5);
  assert.ok(evidence.longestIdleMs>=35*60000);assert.equal(evidence.state.metadata.showHash,show.metadata.showHash);
  const cycles=evidence.samples.filter(s=>s.label.includes('performance-'));
  assert.equal(cycles.length,5);assert.ok(cycles.every(s=>s.runtime.cueTimers===0&&s.audio.contexts===0&&s.dom.jsEventListeners===8&&s.dom.nodes===362));
  assert.ok(cycles.at(-1).runtime.memory.heapUsed<cycles[0].runtime.memory.heapUsed+32*1024*1024);
  assert.ok(cycles.at(-1).renderer.JSHeapUsedSize<cycles[0].renderer.JSHeapUsedSize+16*1024*1024);
  // The failed lifecycle-only probe never stopped JS: voice started at its normal
  // 1900ms deadline, before the 12s recovery. Recheck with an enforced pause below.
  const lastVoice=evidence.plays.at(-1);const priorEffect=evidence.plays.at(-2);
  assert.ok(lastVoice.src.includes('prod-voice-016'));assert.ok(lastVoice.at-priorEffect.at<3000);
  await writeFile(path.join(temporary,'state.json'),JSON.stringify(evidence.state));
  performances=evidence.performances;resetCount=evidence.resetCount;longestIdleMs=evidence.longestIdleMs;
  samples.push(...evidence.samples);scenarios.push(...evidence.scenarios.map(s=>s.name.endsWith('sleep-proxy')?{...s,status:'OBSERVATION',lifecyclePauseVerified:false,supersededBy:'enforced pending-speech proxy'}:s));
  const observedScene6=evidence.plays.find(p=>p.src.includes('prod-voice-011'));
  assert.ok(observedScene6?.playingTime<.12);assert.equal(observedScene6.volume,1);
  scene6Audio.push({...observedScene6,observedCycle:5,allFiveCycleStartAssertionsPassed:true});
  scenarios.push({name:'five-completed-cycles-resource-observations',status:'PASS',cycles:5,source:'phase-c-continuation-failure.json',lifecycleOnlyProbe:'not frozen; corrected enforced pause retested'});
}
const startServer=()=>spawn(process.execPath,['src/server.js'],{windowsHide:true,stdio:'ignore',env:{...process.env,HOST:'127.0.0.1',PORT:String(port),STATE_FILE:path.join(temporary,'state.json'),LOG_DIRECTORY:path.join(temporary,'logs'),AIVIS_ENGINE_URL:'http://127.0.0.1:9',SHOW_STARTUP_MODE:'saved'}});
async function observe() {
  observer=new WebSocket(`ws://127.0.0.1:${port}/ws`);
  observer.on('message',raw=>{const event=JSON.parse(raw);if(event.type==='state')state=event.state;if(event.type==='error'&&event.code!=='NEXT_GUARDED') errors.push(event);});
  await new Promise((resolve,reject)=>{observer.once('open',resolve);observer.once('error',reject);});observer.send(JSON.stringify({type:'hello',role:'admin'}));
}
const send=event=>observer.send(JSON.stringify(event));
async function wait(predicate,label,timeout=30000) {const end=performance.now()+timeout;while(performance.now()<end){if(errors.length)throw Error(JSON.stringify(errors));if(predicate())return;await delay(50);}throw Error(`Timeout: ${label}`);}
const plays=()=>display.evaluate('window.__runtimePlays.length');
async function ready() {
  await display.waitFor(`document.querySelector('#audio-help').textContent.includes('28 / 28 READY') || document.querySelector('#audio-gate').hidden`, 'preload',30000);
  if(await display.evaluate(`!document.querySelector('#audio-gate').hidden`)) await display.click('#enable-audio');
  await wait(()=>state?.displayAudioReady,'Audio Ready');
}
async function reset() { send({type:'production:reset'});await wait(()=>state?.currentCueIndex===-1,'Reset');resetCount++;await ready(); }
async function cue(c) {
  // Headless targets share one virtual window. The real HDMI Display stays visible
  // during playback; bring it forward here, and background it explicitly for idle.
  await display.send('Page.bringToFront');
  await wait(()=>state?.displayAudioReady&&state.displays.some(d=>d.online),'connected and Audio Ready');
  // Guard is based on acceptance, not completion. Every intentional step waits at least 1.25s.
  await delay(1250);const start=Date.now();send({type:'cue:next'});
  if(c.id==='prod-011') for(let i=0;i<4;i++)send({type:'cue:next'});
  await wait(()=>state?.currentCue?.cueId===c.id,`${c.id} accepted`);
  if(c.audio.speechMode==='audio-file')await wait(()=>state.history.some(h=>h.cueId===c.id&&Date.parse(h.createdAt)>=start-1000&&h.status==='completed'),`${c.id} speech`,45000);
  await wait(()=>state.currentTransition.status!=='active'&&state.unlock.status!=='running',`${c.id} visuals`,45000);
  const end=start+Math.max(c.transition?.durationMs??0,...(c.sfx??[]).map(s=>s.atMs+s.durationMs));await delay(Math.max(0,end-Date.now()));
  if(c.id==='prod-011') { const clip=await display.evaluate(`window.__runtimePlays.find(p=>p.src.includes('prod-voice-011'))`);assert.ok(clip&&clip.playingTime<.12,'Scene6 starts from the beginning');assert.equal(clip.volume,1);scene6Audio.push(clip); }
}
async function snapshot(label) {
  const runtime=await(await fetch(`${base}/api/runtime-status`)).json();
  const browserMetrics=await display.send('Performance.getMetrics');const dom=await display.send('Memory.getDOMCounters');
  const renderer=Object.fromEntries(browserMetrics.metrics.filter(m=>['JSHeapUsedSize','Nodes','Documents','JSEventListeners','TaskDuration'].includes(m.name)).map(m=>[m.name,m.value]));
  let chromeRootRss=null;try{chromeRootRss=Number(execFileSync('powershell',['-NoProfile','-Command',`(Get-Process -Id ${browser.pid}).WorkingSet64`],{windowsHide:true}).toString().trim());}catch{}
  const audio=await display.evaluate(`({plays:window.__runtimePlays.length,contexts:window.__runtimeContexts.filter(c=>c.state!=='closed').length,visibility:document.visibilityState,focus:document.hasFocus()})`);
  const sample={label,at:new Date().toISOString(),runtime,renderer,dom,audio,chromeRootRss};samples.push(sample);
  await writeFile(path.join(directory,`${mode}-resources.json`),JSON.stringify(samples,null,2));return sample;
}
async function passiveIdle(ms,label) {
  const count=await plays();const index=state.currentCueIndex;const start=performance.now();
  while(performance.now()-start<ms){await delay(Math.min(30000,ms-(performance.now()-start)));await snapshot(label);console.log(JSON.stringify({stage:label,idleSeconds:Math.round((performance.now()-start)/1000),targetSeconds:ms/1000}));}
  const elapsed=performance.now()-start;longestIdleMs=Math.max(longestIdleMs,elapsed);
  assert.equal(await plays(),count,'no idle playback');assert.equal(state.currentCueIndex,index);
  const readyWhileBackground=state.displayAudioReady;
  await display.send('Page.bringToFront');await display.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await wait(()=>state.displays.some(d=>d.online),'foreground heartbeat');await ready();await delay(700);
  assert.equal(await plays(),count,'foreground cannot replay');assert.equal(state.currentCueIndex,index);
  scenarios.push({name:label,elapsedMs:elapsed,readyWhileBackground,foregroundReady:true,status:'PASS'});
}
async function burst(kind) {
  await reset();const before=await plays();
  await admin.waitFor(`!document.querySelector('#show-next-button').disabled`, 'NEXT enabled after Reset');
  if(kind==='enter') {
    await admin.send('Page.bringToFront');
    await admin.evaluate(`document.querySelector('#show-next-button').focus()`);
    for(let i=0;i<5;i++) await admin.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13,autoRepeat:i>0});
    await admin.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  } else if(kind==='raw-server')for(let i=0;i<5;i++)send({type:'cue:next',actionId:`unique-${kind}-${i}`});
  else await admin.evaluate(`(()=>{const b=document.querySelector('#show-next-button');${kind==='double'?'b.click();b.click();':kind==='triple'?'b.click();b.click();b.click();':kind==='five'?'for(let i=0;i<5;i++)b.click();':kind==='mixed'?'b.click();document.dispatchEvent(new KeyboardEvent("keydown",{key:" ",bubbles:true}));':kind==='enter'?'b.focus();b.click();b.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",repeat:true,bubbles:true}));':'document.dispatchEvent(new KeyboardEvent("keydown",{key:" ",bubbles:true}));for(let i=0;i<5;i++)document.dispatchEvent(new KeyboardEvent("keydown",{key:" ",repeat:true,bubbles:true}));'}})()`);
  await wait(()=>state.currentCueIndex===0,`${kind} accepted`);await delay(1500);assert.equal(state.currentCueIndex,0,`${kind} burst advances once`);
  await delay(1000);assert.equal(state.currentCueIndex,0,'rejected NEXT never queues');
  send({type:'stop'});await delay(100);const stopped=await plays();await delay(250);assert.equal(await plays(),stopped,'STOP cannot start another pending clip');
  send({type:'cue:next'});await wait(()=>state.currentCueIndex===1,'next explicit accepted');send({type:'stop'});
  scenarios.push({name:kind,status:'PASS'});
}
async function proxy(label) {
  const before=await plays();const index=state.currentCueIndex;
  await display.evaluate(`Promise.all(window.__runtimeContexts.filter(c=>c.state==='running').map(c=>c.suspend()))`);
  await admin.send('Page.bringToFront');await display.waitFor(`document.visibilityState==='hidden'`,'background before freeze');
  await display.send('Debugger.enable');await display.send('Debugger.pause');
  // Debugger pause guarantees suspension; combining it with lifecycle freeze can
  // block the lifecycle command itself in Chrome. Check heartbeat loss directly.
  await delay(12000);assert.ok(state.displays.every(d=>!d.online),'JS suspension loses heartbeat');
  await display.send('Debugger.resume');await display.send('Debugger.disable');await display.send('Page.bringToFront');
  await wait(()=>state.displays.some(d=>d.online),'resume online',30000);await ready();await delay(1000);
  assert.equal(await plays(),before,'resume must not replay');assert.equal(state.currentCueIndex,index);
  await display.evaluate('window.__realDateNow ??= Date.now; Date.now=()=>window.__realDateNow()+7200000');await delay(1500);
  await display.evaluate('Date.now=window.__realDateNow');await delay(1500);
  assert.equal(await plays(),before);assert.equal(state.currentCueIndex,index);scenarios.push({name:label,pauseMs:12000,enforcedJsPause:true,heartbeatLost:true,clockJumpMs:7200000,status:'PASS'});
}
async function pausedSocketProxy() {
  // Unlike BFCache freeze, pause JavaScript with the socket still receiving data.
  await reset();send({type:'cue:execute',cueId:'prod-001'});
  await wait(()=>state.currentCue?.cueId==='prod-001','pending socket target');
  await delay(100);const before=await plays();const index=state.currentCueIndex;
  await display.send('Debugger.enable');await display.send('Debugger.pause');
  await delay(12000);await display.send('Debugger.resume');await display.send('Debugger.disable');
  await ready();await delay(1500);assert.equal(await plays(),before,'queued pre-resume speech/SFX discarded');
  assert.equal(state.currentCueIndex,index);scenarios.push({name:'JS-pause-with-live-socket-and-delayed-speech',pauseMs:12000,status:'PASS'});
  await reset();
}
try {
  server=startServer();await waitForHttp(`${base}/health`);
  if(!continuation&&!endurance) {const imported=await fetch(`${base}/api/show-file/import`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(show)});assert.ok(imported.ok);}
  browser=spawn(browserPath,['--headless=new', '--no-proxy-server','--no-first-run','--no-default-browser-check','--autoplay-policy=no-user-gesture-required',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${path.join(temporary,'browser')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
  display=await openPage(debugPort,`${base}/display?id=hardening&name=Stage`,{display:true});
  await display.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__runtimePlays=[];window.__runtimeContexts=[];const oldPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){const clip={src:this.src,at:Date.now(),volume:this.volume};window.__runtimePlays.push(clip);this.addEventListener('playing',()=>{clip.playingTime=this.currentTime;clip.duration=this.duration},{once:true});return oldPlay.call(this)};const AC=window.AudioContext;window.AudioContext=class extends AC{constructor(...args){super(...args);window.__runtimeContexts.push(this)}}`});
  await display.send('Page.reload');await display.waitFor('window.__runtimePlays','hooks');await display.send('Performance.enable');
  admin=await openPage(debugPort,`${base}/admin`);await observe();await wait(()=>state?.displays.length,'registered');send({type:'audio-master:set',displayId:'hardening'});await ready();
  if(mode==='phase-b') {
    for(const kind of ['double','triple','five','space-repeat','enter','mixed','raw-server'])await burst(kind);
    await reset();send({type:'cue:next'});await wait(()=>state.currentCueIndex===0,'before emergency STOP');const started=performance.now();await admin.click('#show-stop-button');await wait(()=>state.currentTransition.status==='stopped','immediate STOP');assert.ok(performance.now()-started<500);
    const oldObserver=observer;await observe();oldObserver.close();for(let i=0;i<5;i++)send({type:'cue:next'});await delay(500);assert.equal(state.currentCueIndex,0);scenarios.push({name:'reconnect-burst-and-immediate-stop',status:'PASS'});
    await snapshot('phase-b-end');
  } else if(mode==='phase-c-smoke') {
    await cue(show.cues[0]);await reset();
    await pausedSocketProxy();
    send({type:'cue:execute',cueId:'prod-003'});await wait(()=>state.currentMessage?.cueId==='prod-003'&&state.playbackStatus==='speaking','BLACKOUT speech');
    send({type:'blackout'});await wait(()=>state.blackout,'BLACKOUT accepted');assert.ok(state.previousVisualState.currentSubtitle);
    await proxy('BLACKOUT-with-suspended-speech');send({type:'blackout:clear'});await wait(()=>!state.blackout,'RESTORE accepted');
    assert.equal(state.currentSubtitle,null);await display.waitFor(`document.querySelector('#caption').textContent===''`,'RESTORE has no old caption');await reset();
    await reset();send({type:'cue:execute',cueId:'prod-v-riddle-enter'});await wait(()=>state.currentCue?.cueId==='prod-v-riddle-enter','idle before smoke');await delay(6000);await proxy('stable-freeze-reconnect-clock');
    await reset();send({type:'cue:execute',cueId:'prod-v-stop-code'});await wait(()=>state.currentCue?.cueId==='prod-v-stop-code','pending before smoke');await delay(100);await proxy('pending-freeze-reconnect-clock');await reset();await snapshot('smoke-end');
  } else {
    const first=show.cues.filter(c=>c.scene==='scene-1');const rest=show.cues.filter(c=>c.scene!=='scene-1');
    const firstStarts=[209,224,237,270,360,372,384,400,540,554];
    if(!continuation||endurance) await reset();else {assert.equal(state.currentCueIndex,9);assert.equal(await plays(),0);}
    await snapshot(continuation?'checkpoint-restart-baseline':'baseline');
    for(let cycle=1;!endurance&&cycle<=5;cycle++) {
      if(cycle>1)await reset();const performanceStart=performance.now();
      if(!(continuation&&cycle===1)) for(let i=0;i<first.length;i++){if(cycle===1)await delay(Math.max(0,firstStarts[i]*1000-(performance.now()-performanceStart)));await cue(first[i]);}
      if(cycle===1&&!continuation)await delay(Math.max(0,600000-(performance.now()-performanceStart)));
      if(cycle===1&&!continuation) {
        await admin.send('Page.bringToFront');await admin.send('Emulation.setFocusEmulationEnabled',{enabled:false});await display.send('Emulation.setFocusEmulationEnabled',{enabled:false});
        await passiveIdle(35*60000,'real-extended-idle-background');await proxy('combined-idle-background-freeze-clock-reconnect');
      } else {await passiveIdle(15000,`cycle-${cycle}-targeted-idle`);await proxy(`cycle-${cycle}-sleep-proxy`);}
      const count=await plays();const index=state.currentCueIndex;
      await display.send('Page.reload');await display.waitFor('window.__runtimePlays','reload hooks');await ready();assert.equal(await plays(),0);assert.equal(state.currentCueIndex,index);
      await admin.send('Page.reload');await admin.waitFor(`document.querySelector('#system-status').textContent==='ONLINE'`,'Admin reload');
      await display.send('Page.bringToFront');await display.send('Emulation.setFocusEmulationEnabled',{enabled:true});
      for(const c of rest)await cue(c);assert.equal(state.currentPresetId,'normal');performances++;
      await reset();await display.send('HeapProfiler.collectGarbage');await snapshot(`performance-${cycle}-reset`);console.log(JSON.stringify({performance:cycle,status:'PASS',previousPlays:count}));
    }
    // Resets during boot speech delay, speech, merged timeline, SFX, flow and immediately after reconnect.
    for(const id of ['prod-001','prod-003','prod-004','prod-012','prod-011','prod-v-stop-code']){
      send({type:'cue:execute',cueId:id});await wait(()=>state.currentCue?.cueId===id,'Reset target');await delay(300);await reset();const count=await plays();await delay(2500);assert.equal(await plays(),count);assert.equal(state.currentCueIndex,-1);
    }
    // Frozen delayed speech must be discarded, including messages queued on the socket before timeout.
    send({type:'cue:execute',cueId:'prod-v-stop-code'});await wait(()=>state.currentCue?.cueId==='prod-v-stop-code','pending freeze');await delay(100);await proxy('freeze-with-pending-speech');await reset();
    send({type:'cue:execute',cueId:'prod-v-riddle-enter'});await wait(()=>state.currentCue?.cueId==='prod-v-riddle-enter','restart stable target');await delay(6000);const beforeRestart=state.currentCueIndex;const restartPlays=await plays();const beforeRestartErrors=display.errors.length;await stopChild(server);await delay(500);server=startServer();await waitForHttp(`${base}/health`);await observe();await ready();assert.equal(state.currentCueIndex,beforeRestart);await delay(2000);assert.equal(await plays(),restartPlays);
    injectedRestartDiagnostics.push(...display.errors.slice(beforeRestartErrors).filter(message=>message.includes(`ws://127.0.0.1:${port}/ws`)&&message.includes('ERR_CONNECTION_REFUSED')));
    scenarios.push({name:'explicit-saved-mode-server-restart',status:'PASS'});
    for(const kind of ['five','mixed','raw-server'])await burst(kind);
    await display.setViewport(1280,720);await display.setViewport(1024,768);await display.setViewport(1920,1080);await reset();await display.send('HeapProfiler.collectGarbage');await snapshot('endurance-end');
    const resets=samples.filter(s=>s.label.includes('-reset'));assert.equal(performances,5);assert.ok(longestIdleMs>=35*60000);
    assert.ok(resets.at(-1).renderer.JSHeapUsedSize < resets[0].renderer.JSHeapUsedSize+16*1024*1024,'bounded renderer heap');
    assert.ok(resets.every(s=>s.runtime.cueTimers===0&&s.audio.contexts===0),'all Cue timers/audio contexts released after Reset');
    assert.ok(resets.at(-1).runtime.memory.heapUsed<resets[0].runtime.memory.heapUsed+32*1024*1024,'bounded server heap');
  }
  const browserMessages=[...display.errors,...admin.errors];
  // CDP freeze deliberately closes the socket via BFCache. Keep injected-fault diagnostics.
  const expectedFaultDiagnostics=browserMessages.filter(message=>mode!=='phase-b' && (message.includes('Page entered Back-Forward Cache')||injectedRestartDiagnostics.includes(message)));
  const unexpectedErrors=browserMessages.filter(message=>!expectedFaultDiagnostics.includes(message));
  if(unexpectedErrors.length)throw Error(JSON.stringify(unexpectedErrors));
  const external=[...display.requests,...admin.requests].filter(r=>/^https?:/.test(r.url)&&new URL(r.url).origin!==base);assert.equal(external.length,0);
  const result={status:'PASS',mode,fingerprint:await fingerprint(),scenarios,performances,resetCount,longestIdleMs,scene6Audio,physicalWindowsSleep:false,proxy:'Debugger JS pause 12s + hidden Display + AudioContext suspend + verified heartbeat loss + 2h wall-clock jump; normal background throttling flags retained',samples,browserErrors:0,expectedFaultDiagnostics,externalRequests:0};
  await writeFile(path.join(directory,`${mode}-result.json`),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,samples: samples.length}));
  if (mode === 'phase-b') await writeFile(path.join(directory,'phase-b-pass.json'),JSON.stringify({status:'PASS',fingerprint:result.fingerprint},null,2));
} catch(error) {await writeFile(path.join(directory,`${mode}-failure.json`),JSON.stringify({error:error.stack,state,plays:display?await display.evaluate('window.__runtimePlays'):null,browserErrors:display?.errors,scenarios,performances,resetCount,longestIdleMs,scene6Audio,fingerprint:await fingerprint(),samples},null,2));throw error;}
finally {observer?.close();display?.close();admin?.close();await stopChild(browser);await stopChild(server);if(temporary.startsWith(path.join(os.tmpdir(),'yokogawa-hardening-')))await rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:250});}
