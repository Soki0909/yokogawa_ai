// Test the lightweight distribution in a new folder using preinstalled Node/npm.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {freePort,waitForHttp,stopChild} from './runtime-test-browser.js';
const manifest=JSON.parse(await fs.readFile('config/production-portable-files.json'));
const folder=await fs.mkdtemp(path.resolve('.tmp-portable-smoke-')),evidence=path.resolve('artifacts/audio-reliability-20261014/portable-smoke-20261016.json');
for(const name of [...manifest.files.map(f=>f.path),'config/production-portable-files.json']){const target=path.join(folder,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(name,target);}
// Simulate a different Windows checkout's line endings without changing binary assets.
for(const item of manifest.files.filter(f=>f.hashMode==='utf8-lf')){const file=path.join(folder,item.path),text=await fs.readFile(file,'utf8');await fs.writeFile(file,text.replaceAll('\r\n','\n').replaceAll('\n','\r\n'));}
const setup=execFileSync('cmd.exe',['/d','/c','setup-production.cmd'],{cwd:folder,windowsHide:true,encoding:'utf8',maxBuffer:8*1024*1024});
const port=await freePort();let server;
try{
 server=spawn('cmd.exe',['/d','/c','start-yokogawa-ai-single-pc.cmd'],{cwd:folder,windowsHide:true,stdio:'ignore',env:{...process.env,PORT:String(port)}});await waitForHttp(`http://127.0.0.1:${port}/health`,30000);
 const show=await fetch(`http://127.0.0.1:${port}/api/show-file`).then(r=>r.json()),slots=await fetch(`http://127.0.0.1:${port}/api/production-slots`).then(r=>r.json()),audio=await fetch(`http://127.0.0.1:${port}/api/audio-assets`).then(r=>r.json());
 assert.equal(show.cues.length,20);assert.equal(audio.expectedCount,show.assets.filter(a=>a.id.startsWith('prod-')&&a.mimeType==='audio/wav').length);assert.ok((slots.slots??slots).every(s=>s.status==='READY'||(s.optional&&s.status==='MISSING')));
 const report={status:'PASS',folder,setup,showCues:show.cues.length,audioExpected:audio.expectedCount,allRequiredSlotsReady:true,optionalMissingSlots:(slots.slots??slots).filter(s=>s.optional&&s.status==='MISSING').map(s=>s.id),method:'Fresh copied distribution, preinstalled Node/npm, npm ci --omit=dev, actual single-PC launcher, HTTP Show/slots/preload. Setup needs registry access or an already populated npm cache. Same host, not a different physical PC test.'};await fs.writeFile(evidence,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await stopChild(server);}
// Keep the isolated copy for review; .tmp-portable-smoke-* is gitignored.
