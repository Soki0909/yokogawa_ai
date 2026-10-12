import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { delay, freePort, waitForHttp, stopChild, openPage, browserPath } from './runtime-test-browser.js';

const directory = path.resolve(process.argv[2] ?? 'artifacts/stage-pacing-2026-10-13/targeted');
await fs.mkdir(directory,{recursive:true});
const temp = await fs.mkdtemp(path.join(os.tmpdir(),'yokogawa-stage-pacing-'));
const port=await freePort(), debug=await freePort(), base=`http://127.0.0.1:${port}`;
let server,browser,display,tools,observer,state;
const results = [];
const wait = async (predicate,label,timeout=30000) => { const end=Date.now()+timeout; while(Date.now()<end){if(predicate())return;await delay(30);}throw Error(label); };
const send = event => observer.send(JSON.stringify({ ...event, actionId: crypto.randomUUID() }));
try {
  server=spawn(process.execPath,['src/server.js'],{windowsHide:true,stdio:'ignore',env:{...process.env,HOST:'127.0.0.1',PORT:String(port),STATE_FILE:path.join(temp,'state.json'),LOG_DIRECTORY:path.join(temp,'logs'),AIVIS_ENGINE_URL:'http://127.0.0.1:9'}});
  await waitForHttp(`${base}/health`);
  const installedSlots = (await (await fetch(`${base}/api/production-slots`)).json()).slots;
  const warningDuration = installedSlots.find(s=>s.id==='warning').durationMs;
  browser=spawn(browserPath,['--headless=new','--no-proxy-server','--no-first-run','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding',`--remote-debugging-port=${debug}`,`--user-data-dir=${path.join(temp,'browser')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  await waitForHttp(`http://127.0.0.1:${debug}/json/version`);
  display=await openPage(debug,`${base}/display?id=pacing`,{display:true});
  await display.evaluate(`window.__pacingPlays=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){const warning=window.__pacingPlays.findLast(p=>p.src.includes('prod-sfx-warning'));const entry={src:this.src,at:performance.now(),duration:this.duration,audio:this,warningEndedBeforeCall:warning?.audio.ended};window.__pacingPlays.push(entry);this.addEventListener('ended',()=>{entry.endedAt=performance.now();},{once:true});return play.call(this);};`);
  await display.evaluate(`window.__pacingReceived=[];const nativeSend=WebSocket.prototype.send;WebSocket.prototype.send=function(raw){try{const e=JSON.parse(raw);if(e.type==='playback'&&e.status==='received')window.__pacingReceived.push(e.id);}catch{}return nativeSend.call(this,raw);};`);
  observer=new WebSocket(`ws://127.0.0.1:${port}/ws`);observer.on('message',raw=>{const e=JSON.parse(raw);if(e.type==='state')state=e.state;});
  await new Promise((resolve,reject)=>{observer.once('open',resolve);observer.once('error',reject);});
  send({type:'hello',role:'admin'});await wait(()=>state,'state');send({type:'audio-master:set',displayId:'pacing'});
  await display.waitFor(`document.querySelector('#audio-help').textContent.includes('20 / 20 READY')`,'preload');await display.click('#enable-audio');await wait(()=>state.displayAudioReady,'ready');
  const reset=async()=>{send({type:'production:reset'});await wait(()=>state.currentCueIndex===-1,'reset');await delay(300);};
  // Both ERROR Cues must start warning before voice, using the installed warning duration.
  for(const id of ['prod-013','prod-014']){
    await reset();const before=await display.evaluate('window.__pacingPlays.length');send({type:'cue:execute',cueId:id});
    await display.waitFor(`window.__pacingPlays.slice(${before}).some(p=>p.src.includes('/prod-voice-'))`,'warning then voice',20000);
    const plays=await display.evaluate(`window.__pacingPlays.slice(${before}).map(({src,at,duration,endedAt,warningEndedBeforeCall})=>({src,at,duration,endedAt,warningEndedBeforeCall}))`);
    assert.equal(plays.length,2);assert.ok(plays[0].src.includes('prod-sfx-warning'));assert.ok(plays[1].src.includes('prod-voice-'));
    assert.ok(Number.isFinite(plays[0].endedAt));assert.equal(plays[1].warningEndedBeforeCall,true);
    // Browsers can checkpoint microtasks between ended listeners; inspect the native ended flag too.
    assert.ok(plays[1].at>=plays[0].endedAt-1,JSON.stringify({id,plays}));results.push({name:id+' warning-before-speech',warningDuration,plays,status:'PASS'});
    send({type:'stop'});await delay(200);
  }
  await reset();const beforeStop=await display.evaluate('window.__pacingPlays.length');send({type:'cue:execute',cueId:'prod-014'});await delay(500);send({type:'stop'});await delay(warningDuration+500);
  assert.equal(await display.evaluate(`window.__pacingPlays.slice(${beforeStop}).filter(p=>p.src.includes('prod-voice-')).length`),0);
  assert.ok(await display.evaluate(`window.__pacingPlays.slice(${beforeStop}).every(p=>p.audio.paused)`));results.push({name:'STOP during warning discards delayed voice',status:'PASS'});
  await reset();await display.send('Network.setCacheDisabled',{cacheDisabled:true});await display.send('Network.emulateNetworkConditions',{offline:false,latency:600,downloadThroughput:10_000_000,uploadThroughput:10_000_000});
  const receivedBefore=await display.evaluate('window.__pacingReceived.length');
  const waitingBefore=await display.evaluate('window.__pacingPlays.length');send({type:'cue:execute',cueId:'prod-014'});
  await display.waitFor(`window.__pacingReceived.length>${receivedBefore}`,'voice received while warning still playing');
  assert.ok(await display.evaluate(`window.__pacingPlays.slice(${waitingBefore}).some(p=>p.src.includes('prod-sfx-warning')&&!p.audio.paused)`));
  send({type:'stop'});await delay(warningDuration+1000);
  assert.equal(await display.evaluate(`window.__pacingPlays.slice(${waitingBefore}).filter(p=>p.src.includes('prod-voice-')).length`),0);
  await display.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  results.push({name:'STOP while client awaits late warning completion',status:'PASS'});
  // Observe the processing/completed text in the same place, without a shrink/fade animation.
  await reset();send({type:'cue:execute',cueId:'prod-012'});
  await display.waitFor(`document.querySelector('#operation-title').textContent==='解錠処理'`,'processing');
  const processing=await display.evaluate(`(()=>{const r=document.querySelector('#operation-title').getBoundingClientRect();return {top:r.top,left:r.left,width:r.width};})()`);
  await display.waitFor(`document.body.dataset.operationVariant==='collapse'`,'completion');
  const completed=await display.evaluate(`(()=>{const frame=document.querySelector('.operation-overlay-frame'),r=document.querySelector('#operation-title').getBoundingClientRect();return {top:r.top,left:r.left,width:r.width,animation:getComputedStyle(frame).animationName,opacity:getComputedStyle(frame).opacity,title:document.querySelector('#operation-title').textContent};})()`);
  assert.equal(completed.animation,'none');assert.equal(completed.opacity,'1');assert.equal(completed.title,'解錠完了');
  for(const key of ['top','left','width'])assert.ok(Math.abs(completed[key]-processing[key])<1);
  await display.screenshot(path.join(directory,'unlock-completed.png'));send({type:'stop'});results.push({name:'unlock text remains in place',processing,completed,status:'PASS'});
  // User workflow: adjust one gap, listen, save Cue+Show, reopen, and verify retimed phase.
  tools=await openPage(debug,`${base}/production-tools?cue=prod-012`);
  await tools.setViewport(1280,1000);
  await tools.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:directory});
  await tools.waitFor(`document.querySelector('#speech-select').value==='012' && document.querySelectorAll('.segment').length===2`,'selected Cue');
  const oldPhase=state.cues.find(c=>c.cueId==='prod-012').sequence.find(p=>p.unlock).atMs;
  await tools.evaluate(`const input=document.querySelector('[data-key="pauseAfterMs"]');input.value=950;input.dispatchEvent(new Event('input',{bubbles:true}));`);
  await tools.click('#compose');await tools.waitFor(`!document.querySelector('#save-cue-speech').disabled && !document.querySelector('#preview').paused && !document.querySelector('main').inert`,'edited audio preview');
  await tools.evaluate(`document.querySelector('#pacing-direction').scrollIntoView({block:'start'})`);
  await tools.screenshot(path.join(directory,'cue-pause-editor.png'));
  await tools.click('#save-cue-speech');await tools.waitFor(`document.querySelector('#status').textContent.includes('ダウンロードしました')`,'save Cue');
  const saved=state.cues.find(c=>c.cueId==='prod-012');assert.equal(saved.speech.segments[0].pauseAfterMs,950);
  assert.ok(Math.abs(saved.sequence.find(p=>p.unlock).atMs-oldPhase-300)<3);
  await tools.send('Page.reload');await tools.waitFor(`document.querySelector('[data-key="pauseAfterMs"]').value==='950'`,'reopen saved pause');
  const exported=await fetch(`${base}/api/show-file`).then(r=>r.json());assert.equal(exported.cues.find(c=>c.id==='prod-012').speech.segments[0].pauseAfterMs,950);
  await fs.writeFile(path.join(directory,'saved-show-verification.json'),JSON.stringify({cueId:saved.cueId,pauseAfterMs:950,retimedByMs:saved.sequence.find(p=>p.unlock).atMs-oldPhase},null,2));
  results.push({name:'per-Cue pause edit / preview / save / reload / Show export',status:'PASS'});
  assert.deepEqual(display.errors,[]);assert.deepEqual(tools.errors,[]);
  await fs.writeFile(path.join(directory,'verification.json'),JSON.stringify({status:'PASS',results,browserErrors:0},null,2));console.log(JSON.stringify({status:'PASS',cases:results.length,directory}));
} finally {
  observer?.close();tools?.close();display?.close();await stopChild(browser);await stopChild(server);
  await fs.rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:500});
}
