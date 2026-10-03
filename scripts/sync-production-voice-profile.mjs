import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deriveProductionProfile, PRODUCTION_PROFILE_PATH, SELECTED_PROFILE_PATH } from './production-voice-profile.mjs';

const sourceText = await readFile(SELECTED_PROFILE_PATH, 'utf8');
const profile = deriveProductionProfile(sourceText);
await mkdir(path.dirname(PRODUCTION_PROFILE_PATH), { recursive: true });
await writeFile(PRODUCTION_PROFILE_PATH, `${JSON.stringify(profile, null, 2)}\n`);
console.log(`Production voice profile synced: ${PRODUCTION_PROFILE_PATH}`);
console.log(profile.source.sha256);
