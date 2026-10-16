import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
// Use -z for Unicode paths: Git's default quoting is not JSON for octal bytes.
const nulPaths=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard','src','public','config','shows','scripts']).toString('utf8').split('\0').filter(Boolean);
for(const p of ['.gitattributes','.gitignore','README.md','package.json','package-lock.json','start-yokogawa-ai-single-pc.cmd','start-yokogawa-ai.cmd','setup-production.cmd','docs/production/production-handoff-20261016.md','docs/production/emergency-backup-operation-20261016.md','docs/production/gauge-audio-slot.md','docs/production/single-pc-runbook.md','docs/production/rehearsal-revision-operation-20261014.md'])nulPaths.push(p);
const files=[];
for(const file of [...new Set(nulPaths)].filter(p=>p!=='config/production-portable-files.json').sort()) {
 if(!(await fs.stat(file).catch(()=>null))?.isFile())continue;
 const bytes=await fs.readFile(file),text=/\.(?:js|mjs|py|cs|json|md|css|html|svg|txt|cmd|ps1)$/.test(file);
 const canonical=text?bytes.toString('utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n'):bytes;
 files.push({path:file,size:bytes.length,hashMode:text?'utf8-lf':'binary',sha256:createHash('sha256').update(canonical).digest('hex')});
}
await fs.writeFile('config/production-portable-files.json',JSON.stringify({format:1,description:'Production sources/assets and lockfile. Node.js 20+ is preinstalled; npm ci --omit=dev installs dependencies. Emergency media are distributed separately through Drive. No runtime binaries, node_modules, credentials or browser profile.',files},null,2));console.log(JSON.stringify({files:files.length,totalBytes:files.reduce((n,f)=>n+f.size,0)}));
