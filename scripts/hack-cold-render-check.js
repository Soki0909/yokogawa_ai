// Isolated real P004 replays. Optional compositor promotion is injected only into this test page.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';import {WebSocket} from 'ws';
import {freePort,waitForHttp,stopChild,openPage,browserPath,delay} from './runtime-test-browser.js';
const directory=path.resolve(process.argv[2]||'artifacts/audio-reliability-20261014/rehearsal-revision/hack-render');await fs.mkdir(directory,{recursive:true});
const results=[],trace=process.env.HACK_TRACE==='1';
for(const promoted of trace?[false]:[false,true]){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'yokogawa-hack-')),port=await freePort(),debug=await freePort(),base=`http://127.0.0.1:${port}`;
 let server,browser,page,observer,state;const errors=[];const send=e=>observer.send(JSON.stringify({...e,actionId:crypto.randomUUID()}));
 const wait=async(fn,label,ms=40000)=>{const end=performance.now()+ms;while(performance.now()<end){if(fn())return;await delay(30);}throw Error(label+' '+JSON.stringify(errors));};
 try{
  server=spawn(process.execPath,['src/server.js'],{windowsHide:true,stdio:'ignore',env:{...process.env,HOST:'127.0.0.1',PORT:String(port),STATE_FILE:path.join(temp,'state.json'),LOG_DIRECTORY:path.join(temp,'logs'),AIVIS_ENGINE_URL:'http://127.0.0.1:9'}});await waitForHttp(base+'/health');
  browser=spawn(browserPath,['--no-first-run',`--remote-debugging-port=${debug}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'],{windowsHide:false,stdio:'ignore'});await waitForHttp(`http://127.0.0.1:${debug}/json/version`);
  page=await openPage(debug,'about:blank',{display:true});await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__hack={frames:[],long:[],states:[]};let prior;function frame(t){if(prior)window.__hack.frames.push({at:performance.timeOrigin+t,ms:t-prior});prior=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);new PerformanceObserver(l=>window.__hack.long.push(...l.getEntries().map(e=>({at:performance.timeOrigin+e.startTime,duration:e.duration})))).observe({type:'longtask'});document.addEventListener('DOMContentLoaded',()=>new MutationObserver(()=>{if(document.body.dataset.transition==='anomaly')window.__hack.states.push({at:Date.now(),status:document.body.dataset.transitionStatus});}).observe(document.body,{attributes:true,attributeFilter:['data-transition-status']}));`});await page.send('Page.navigate',{url:base+'/display?id=hack'});
  observer=new WebSocket(base.replace('http','ws')+'/ws');observer.on('message',raw=>{const e=JSON.parse(raw);if(e.type==='state')state=e.state;if(e.type==='error')errors.push(e);});await new Promise(r=>observer.once('open',r));send({type:'hello',role:'admin'});
  await page.waitFor(`document.querySelector('#audio-help').textContent.includes('20 / 20 READY')`,'decoded',120000);await page.send('Runtime.evaluate',{expression:`document.querySelector('#enable-audio').click()`,userGesture:true});await wait(()=>state?.displayAudioReady,'ready');
  if(promoted)await page.evaluate(`{const style=document.createElement('style');style.textContent='.identity,.preset-environment,.system-rail{will-change:transform,filter,clip-path}';document.head.append(style);}`);
  await delay(1000);
  for(let pass=0;pass<(trace?1:3);pass++){
   await page.send('Page.bringToFront');await page.waitFor('!document.hidden','visible benchmark window');
   const goAt=Date.now(),visibleAtGo=await page.evaluate('!document.hidden');send({type:'cue:execute',cueId:'prod-004'});await wait(()=>state.currentMessage?.cueId==='prod-004'&&Date.parse(state.currentMessage.createdAt)>=goAt-50,'P004');
   let traceEvents=[],traceComplete;
   if(trace){
    await delay(15000);traceComplete=new Promise(resolve=>{const listen=raw=>{const e=JSON.parse(raw);if(e.method==='Tracing.dataCollected')traceEvents.push(...e.params.value);if(e.method==='Tracing.tracingComplete'){page.socket.off('message',listen);resolve();}};page.socket.on('message',listen);});
    await page.send('Tracing.start',{categories:'devtools.timeline,disabled-by-default-devtools.timeline.frame,cc,gpu',options:'record-as-much-as-possible'});
   }
   await wait(()=>!state.cueProgress?.blocked&&!state.nextBlock,'finite end',45000);await delay(250);
   if(trace){await page.send('Tracing.end');await Promise.race([traceComplete,delay(10000).then(()=>{throw Error('trace completion timeout');})]);await fs.writeFile(path.join(directory,'trace.json'),JSON.stringify({traceEvents}));}
   const data=await page.evaluate('window.__hack'),active=data.states.findLast(s=>s.at>=goAt&&s.status==='active');
   const frames=data.frames.filter(f=>f.at>=(active?.at||goAt)-100&&f.at<=(active?.at||goAt)+3600),long=data.long.filter(t=>t.at>=goAt);
   results.push({promoted,pass,cold:pass===0,visibleAtGo,visibleAtEnd:await page.evaluate('!document.hidden'),status:frames.length?'OBSERVED — diagnostic, not an adoption gate':'UNVERIFIED — no rAF samples',goAt,activeAt:active?.at,maxFrameMs:frames.length?Math.max(...frames.map(f=>f.ms)):null,framesOver50:frames.filter(f=>f.ms>50),long,frames});
   await fs.writeFile(path.join(directory,'results.json'),JSON.stringify(results,null,2));await page.screenshot(path.join(directory,`${promoted?'promoted':'baseline'}-${pass}.png`));
  }
 }finally{observer?.close();page?.close();await stopChild(browser);await stopChild(server);await fs.rm(temp,{recursive:true,force:true,maxRetries:8,retryDelay:500});}
}
console.log(JSON.stringify(results.map(({frames,framesOver50,long,...r})=>({...r,longTasks:long,framesOver50:framesOver50.length})),null,2));
