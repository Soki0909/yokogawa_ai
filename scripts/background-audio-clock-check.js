// Compare the observed 16ms timer clock probe with current code, using real hidden Chrome.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {freePort,waitForHttp,stopChild,openPage,browserPath,delay} from './runtime-test-browser.js';
const directory=path.resolve(process.argv[2]||'artifacts/audio-reliability-20261014/rehearsal-revision/background-clock');await fs.mkdir(directory,{recursive:true});
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'yokogawa-clock-')),port=await freePort(),debug=await freePort(),base=`http://127.0.0.1:${port}`;
let server,browser,page,background,comparison;const results=[];
try{
 server=spawn(process.execPath,['src/server.js'],{windowsHide:true,stdio:'ignore',env:{...process.env,HOST:'127.0.0.1',PORT:String(port),STATE_FILE:path.join(temp,'state.json'),LOG_DIRECTORY:path.join(temp,'logs'),AIVIS_ENGINE_URL:'http://127.0.0.1:9'}});await waitForHttp(base+'/health');
 browser=spawn(browserPath,['--no-first-run',`--remote-debugging-port=${debug}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'],{windowsHide:false,stdio:'ignore'});await waitForHttp(`http://127.0.0.1:${debug}/json/version`);
 const baseline=execFileSync('git',['show','a450435:public/js/production-audio-engine.js'],{encoding:'utf8',windowsHide:true});
 const current=await fs.readFile('public/js/production-audio-engine.js','utf8');
 const effects=await fs.readFile('public/js/audio-playback-effects.js');const comparePort=await freePort();
 comparison=createServer(async(req,res)=>{try{
  if(req.url==='/baseline.js'||req.url==='/current.js'){res.setHeader('Content-Type','text/javascript');res.end((req.url==='/baseline.js'?baseline:current).replace("'./audio-playback-effects.js'","'/effects.js'"));}
  else if(req.url==='/effects.js'){res.setHeader('Content-Type','text/javascript');res.end(effects);}
  else if(req.url.startsWith('/api/')){const result=await fetch(base+req.url);res.writeHead(result.status,{'Content-Type':result.headers.get('content-type')||'application/octet-stream'});res.end(Buffer.from(await result.arrayBuffer()));}
  else res.end('<!doctype html><html><title>Isolated audio clock diagnostic</title><body>Silent render-clock comparison</body></html>');
 }catch(error){res.writeHead(500);res.end(error.message);}});await new Promise(resolve=>comparison.listen(comparePort,'127.0.0.1',resolve));
 page=await openPage(debug,`http://127.0.0.1:${comparePort}/`);
 await page.evaluate(`(async()=>{
  window.__clock={engines:[],sources:[]};const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...a){window.__clock.sources.push(this.__yokogawaAssetId);return start.call(this,...a);};
  for(const url of ['/baseline.js','/current.js']){const {ProductionAudioEngine}=await import(url);const e=new ProductionAudioEngine();await e.load((await fetch('/api/audio-assets').then(r=>r.json())).assets);window.__clock.engines.push(e);}
  const button=document.createElement('button');button.id='clock-enable';button.textContent='Diagnostic clock only';button.onclick=async()=>{for(const e of window.__clock.engines)await e.verify();window.__clock.ready=true;};document.body.prepend(button);
 })()`);
 await page.send('Runtime.evaluate',{expression:`document.querySelector('#clock-enable').click()`,userGesture:true});await page.waitFor('window.__clock.ready','prepared');
 const timerProxy=process.env.CLOCK_TIMER_PROXY==='1';
 if(timerProxy){await page.evaluate(`window.__clock.nativeTimeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>window.__clock.nativeTimeout.call(window,fn,ms===16?1000:ms,...args)`);}
 else {const info=await page.send('Target.getTargetInfo');const {windowId}=await page.send('Browser.getWindowForTarget',{targetId:info.targetInfo.targetId});await page.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'minimized'}});await page.waitFor('document.hidden','real minimized page');await delay(32000);}
 for(let pass=0;pass<3;pass++){
  for(const index of [0,1]){
   const result=await page.evaluate(`(async()=>{const e=window.__clock.engines[${index}],at=performance.now();await e.verify();return {elapsedMs:performance.now()-at,hidden:document.hidden,state:e.context.state,active:e.active.size,bufferSources:window.__clock.sources.length};})()`);
   results.push({version:index===0?'a450435 timer probe':'current',pass,timerProxy,...result});await delay(1200);
  }
 }
 await fs.writeFile(path.join(directory,'results.json'),JSON.stringify({results,scope:timerProxy?'PROXY: only the 16ms clock-poll timer is clamped to 1000ms. This is not an observed Windows visibility transition.':'Actual document.hidden observed',physicalAudio:'NOT VERIFIED; silent clock only'},null,2));console.log(JSON.stringify(results));
}finally{page?.close();background?.close();await stopChild(browser);await stopChild(server);if(comparison)await new Promise(resolve=>comparison.close(resolve));await fs.rm(temp,{recursive:true,force:true,maxRetries:8,retryDelay:500});}
