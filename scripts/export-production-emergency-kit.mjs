// Authoring tool only. Existing audio is decoded/mixed offline, never synthesized.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
import {freePort,waitForHttp,stopChild,openPage,browserPath,delay} from './runtime-test-browser.js';
import {finiteCueDuration} from '../src/cue-completion.js';

const output=path.resolve(process.argv[2]||'production-backup');
const audioOnly=process.env.BACKUP_AUDIO_ONLY==='1';
for(const dir of ['audio','visual','puzzles'])await fs.mkdir(path.join(output,dir),{recursive:true});
await fs.copyFile('docs/production/emergency-backup-operation-20261016.md',path.join(output,'README.md'));
const labels=JSON.parse(await fs.readFile('config/production-backup-cue-labels.json','utf8'));
const byNumber=new Map(labels.labels.map(line=>{const label=line.replace(/^AI[：:]\s*/,''),number=label.split('｜')[0];return[number,{label,scriptLine:line}];}));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'yokogawa-emergency-kit-')),port=await freePort(),debug=await freePort(),base=`http://127.0.0.1:${port}`;
let server,browser,page,observer,state;const errors=[],rows=[];
const send=event=>observer.send(JSON.stringify({...event,actionId:crypto.randomUUID()}));
const wait=async(predicate,label,ms=90000)=>{const end=performance.now()+ms;while(performance.now()<end){if(predicate())return;await delay(30);}throw Error(`Timeout ${label}: ${JSON.stringify(errors)}`);};
try{
 server=spawn(process.execPath,['src/server.js'],{windowsHide:true,stdio:'ignore',env:{...process.env,HOST:'127.0.0.1',PORT:String(port),STATE_FILE:path.join(temp,'state.json'),LOG_DIRECTORY:path.join(temp,'logs'),AIVIS_ENGINE_URL:'http://127.0.0.1:9'}});await waitForHttp(base+'/health');
 const show=await fetch(base+'/api/show-file').then(r=>r.json()),slots=await fetch(base+'/api/production-slots').then(r=>r.json());
 await fs.writeFile(path.join(output,'resolved-production-show.json'),JSON.stringify(show,null,2));await fs.writeFile(path.join(output,'asset-slots.json'),JSON.stringify(slots,null,2));
 const cues=show.cues.filter(c=>c.enabled!==false&&c.route==='main').sort((a,b)=>a.order-b.order);assert.equal(cues.length,byNumber.size);
 const assets=new Map(show.assets.map(a=>[a.id,a]));
 browser=spawn(browserPath,['--headless=new','--mute-audio','--no-first-run',`--remote-debugging-port=${debug}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});await waitForHttp(`http://127.0.0.1:${debug}/json/version`);
 page=await openPage(debug,base+'/display?id=emergency-export',{display:true});await page.send('Page.bringToFront');
 await page.evaluate(`window.__backupBuffers=new Map();window.__backupDecode=new OfflineAudioContext(2,1,48000)`);
 for(const asset of show.assets.filter(a=>a.mimeType==='audio/wav'))await page.evaluate(`fetch('/api/assets/'+${JSON.stringify(asset.id)}).then(r=>{if(!r.ok)throw Error('audio fetch');return r.arrayBuffer()}).then(b=>window.__backupDecode.decodeAudioData(b)).then(b=>{window.__backupBuffers.set(${JSON.stringify(asset.id)},b);return true;})`);
 const decoded=await page.evaluate('window.__backupBuffers.size');
 observer=new WebSocket(base.replace('http','ws')+'/ws');await new Promise((resolve,reject)=>{observer.once('open',resolve);observer.once('error',reject);});observer.on('message',raw=>{const e=JSON.parse(raw);if(e.type==='state')state=e.state;if(e.type==='error')errors.push(e);});send({type:'hello',role:'admin'});
 await page.waitFor(`document.querySelector('#audio-help').textContent.includes('${decoded} / ${decoded} READY')&&!document.querySelector('#enable-audio').disabled`,'actual decode',120000);
 await page.send('Runtime.evaluate',{expression:`document.querySelector('#enable-audio').click()`,userGesture:true});await wait(()=>state?.displayAudioReady,'READY');
 await page.send('DOM.enable');await page.send('CSS.enable');
 const {frameTree}=await page.send('Page.getFrameTree');const {styleSheetId}=await page.send('CSS.createStyleSheet',{frameId:frameTree.frame.id});
 await page.send('CSS.setStyleSheetText',{styleSheetId,text:'.caption-shell{display:none!important}*,*::before,*::after{animation:none!important;transition:none!important}'});
 for(const [index,cue] of cues.entries()){
  const number=cue.cueNumber,label=byNumber.get(number);assert.ok(label,`Missing script label ${number}`);
  const parts=(cue.sfx||[]).map(e=>({assetId:e.assetId,atMs:e.atMs,volume:(show.settings.sfxVolume??1)*e.volume,effect:'none',kind:'SE',...(e.maxDurationMs?{maxDurationMs:e.maxDurationMs,fadeOutMs:e.fadeOutMs??0}:{})}));
  if(cue.audio?.speechMode==='audio-file')parts.push({assetId:cue.audio.assetId,atMs:cue.timing?.speechDelayMs||0,volume:show.settings.volume??1,effect:cue.audio.playbackEffect||'none',kind:'speech'});
  const rendered=await page.evaluate(`(async()=>{
   const parts=${JSON.stringify(parts)},effect=await import('/js/audio-playback-effects.js');
   const seconds=parts.length?Math.max(...parts.map(p=>p.atMs/1000+effect.playbackDurationSeconds(window.__backupBuffers.get(p.assetId).duration,p.maxDurationMs)+(p.effect==='none'?0:.15))):1;
   const context=new OfflineAudioContext(2,Math.ceil(seconds*48000),48000);
   for(const p of parts){const source=context.createBufferSource(),gain=context.createGain();source.buffer=window.__backupBuffers.get(p.assetId);gain.gain.value=p.volume;effect.connectPlaybackEffect(context,source,gain,p.effect);gain.connect(context.destination);effect.startPlaybackWindow(context,source,gain,{maxDurationMs:p.maxDurationMs,fadeOutMs:p.fadeOutMs,startAt:p.atMs/1000});}
   const buffer=await context.startRendering(),bytes=new Uint8Array(44+buffer.length*4),view=new DataView(bytes.buffer),text=(at,s)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};
   text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,48000,true);view.setUint32(28,192000,true);view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,bytes.length-44,true);
   const channels=[buffer.getChannelData(0),buffer.getChannelData(1)];let peak=0,clipped=0;
   for(let i=0;i<buffer.length;i++)for(let ch=0;ch<2;ch++){const v=channels[ch][i]*0.7079457843841379;peak=Math.max(peak,Math.abs(v));if(Math.abs(v)>1)clipped++;view.setInt16(44+4*i+2*ch,Math.round(Math.max(-1,Math.min(1,v))*32767),true);}
   let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));return{data:btoa(raw),peak,clipped,duration:buffer.duration};
  })()`);
  assert.equal(rendered.clipped,0,`Clipping in ${number}`);
  const audioFile=`${label.label}.wav`,bytes=Buffer.from(rendered.data,'base64');await fs.writeFile(path.join(output,'audio',audioFile),bytes);
  const visualFile=`${String(index+1).padStart(2,'0')}_${label.label}.png`;
  if(audioOnly)await fs.access(path.join(output,'visual',visualFile));
  else{send({type:'cue:execute',cueId:cue.id??cue.cueId});await wait(()=>state.currentCue?.cueId===(cue.id??cue.cueId),number+' accepted');await wait(()=>!state.cueProgress?.blocked&&!state.nextBlock,number+' actual completion');await delay(450);await page.screenshot(path.join(output,'visual',visualFile));}
  const row={order:index+1,cueNumber:number,scriptLine:label.scriptLine,audioFile,visualFile,hasSound:parts.length>0,durationSeconds:rendered.duration,peak:rendered.peak,clippedSamples:rendered.clipped,sha256:createHash('sha256').update(bytes).digest('hex'),parts:parts.map(p=>({...p,path:assets.get(p.assetId).path,sha256:assets.get(p.assetId).sha256})),trigger:cue.triggerNote,speechText:cue.speechText??cue.text??'',notes:number==='P-020'?'台本Cue名は旧表記。音声内容は現在承認済みの「館内すべての安全を確認しました」。':parts.length?'Cue内の待ち時間を含む。音声機器由来のlatencyや次Cueまでの2秒は追加していない。':'映像のみ。1秒の完全無音WAV。音響操作は不要。'};
  rows.push(row);await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),sourceDocument:labels,format:'PCM signed 16-bit stereo 48000Hz',render:'Chrome OfflineAudioContext + existing connectPlaybackEffect; current source WAV reused, no synthesis/per-Cue normalization; common -3dB export headroom; nominal Cue timing, hardware/output pipeline latency excluded',cues:rows},null,2));console.log(JSON.stringify({cue:number,duration:rendered.duration,peak:rendered.peak,hasSound:row.hasSound}));
 }
 for(const n of ['01','06','07'])await fs.copyFile(`public/assets/visual/production-puzzle-${n}.png`,path.join(output,'puzzles',`production-puzzle-${n}.png`));
 const csv=['順番,Cue,ファイル名,秒数,音あり,GOの合図,注意',...rows.map(r=>[r.order,r.cueNumber,r.audioFile,r.durationSeconds,r.hasSound?'あり':'なし',r.trigger,r.notes].map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(','))].join('\r\n');await fs.writeFile(path.join(output,'Cue一覧.csv'),'\ufeff'+csv);
 assert.deepEqual(page.errors,[]);assert.deepEqual(errors,[]);console.log('Emergency kit export PASS: '+rows.length+' cues');
}finally{observer?.close();page?.close();await stopChild(browser);await stopChild(server);await fs.rm(temp,{recursive:true,force:true,maxRetries:8,retryDelay:500});}
