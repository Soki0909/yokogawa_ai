import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {resolveProductionSlots} from '../src/production-asset-slots.js';
const manifest=JSON.parse(await fs.readFile('config/production-portable-files.json','utf8'));
for(const item of manifest.files){const bytes=await fs.readFile(item.path),canonical=item.hashMode==='utf8-lf'?bytes.toString('utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n'):bytes;assert.equal(createHash('sha256').update(canonical).digest('hex'),item.sha256,`Changed/missing portable file: ${item.path}`);}
const slots=await resolveProductionSlots('public');assert.ok(slots.every(slot=>slot.status==='READY'||(slot.optional&&slot.status==='MISSING')),'Required slots must be READY; optional unprovided audio may be MISSING, never INVALID');
console.log(JSON.stringify({status:'PASS',verifiedFiles:manifest.files.length,slots:slots.map(s=>({id:s.id,status:s.status})),runtime:process.version}));
