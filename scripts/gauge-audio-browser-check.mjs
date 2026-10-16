// Muted real Chrome PCM rendering: no fixture is installed as a Production asset.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {freePort,waitForHttp,stopChild,openPage,browserPath} from './runtime-test-browser.js';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'yokogawa-gauge-')),port=await freePort(),debug=await freePort();
const directory='artifacts/audio-reliability-20261014/gauge-slot';await fs.mkdir(directory,{recursive:true});
let server,browser,page;
try{
 server=spawn(process.execPath,['src/server.js'],{windowsHide:true,stdio:'ignore',env:{...process.env,HOST:'127.0.0.1',PORT:String(port),STATE_FILE:path.join(temp,'state.json'),LOG_DIRECTORY:path.join(temp,'logs'),AIVIS_ENGINE_URL:'http://127.0.0.1:9'}});await waitForHttp(`http://127.0.0.1:${port}/health`);
 browser=spawn(browserPath,['--headless=new','--mute-audio','--no-first-run',`--remote-debugging-port=${debug}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});await waitForHttp(`http://127.0.0.1:${debug}/json/version`);
 page=await openPage(debug,`http://127.0.0.1:${port}/display?id=gauge-test`,{display:true});await page.setViewport(1920,1080);await page.waitFor(`document.querySelector('#connection')?.textContent==='ONLINE'`,'Display online');
 const results=await page.evaluate(`(async()=>{
  const {startPlaybackWindow}=await import('/js/audio-playback-effects.js'),out=[];
  for(const cap of [5000,3800,null]){
   const rate=48000,context=new OfflineAudioContext(1,rate*6,rate),buffer=context.createBuffer(1,rate*5.3,rate),data=buffer.getChannelData(0);
   for(let i=0;i<data.length;i++)data[i]=.2*Math.sin(2*Math.PI*1000*i/rate);
   const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.connect(gain);gain.connect(context.destination);
   startPlaybackWindow(context,source,gain,{maxDurationMs:cap,fadeOutMs:40,startAt:.1});
   const pcm=(await context.startRendering()).getChannelData(0),end=.1+(cap?cap/1000:5.3),after=pcm.subarray(Math.ceil(end*rate)),last=pcm.subarray(Math.floor((end-.01)*rate),Math.floor(end*rate));
   const rms=a=>Math.sqrt(a.reduce((n,v)=>n+v*v,0)/a.length);
   out.push({capMs:cap,endSeconds:end,postEndPeak:Math.max(...after.map(Math.abs)),tailRms:rms(last),steadyRms:rms(pcm.subarray(rate,rate+480)),leadingSilence:pcm.subarray(0,.1*rate).every(v=>v===0)});
  }
  return out;
 })()`);
 for(const r of results){assert.equal(r.postEndPeak,0);assert.equal(r.leadingSilence,true);assert.ok(r.steadyRms>.1);if(r.capMs)assert.ok(r.tailRms<r.steadyRms*.3,'40ms ending fade');}
 await page.waitFor(`document.querySelector('#enable-audio')?.disabled===false`,'all current assets decoded',120000);
 assert.deepEqual(page.errors,[]);await page.screenshot(path.join(directory,'display-1920x1080.png'));
 const report={status:'PASS',results,physicalAudio:'NOT VERIFIED (muted OfflineAudioContext test)',method:'Actual Chrome renders 5.3s PCM source to 5.0s / 3.8s windows with 40ms fade; default full source remains intact.'};await fs.writeFile(path.join(directory,'browser-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{page?.close();await stopChild(browser);await stopChild(server);await fs.rm(temp,{recursive:true,force:true,maxRetries:8,retryDelay:300});}
