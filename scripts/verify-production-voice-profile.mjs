import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { comparableProfile, deriveProductionProfile, PRODUCTION_PROFILE_PATH, SELECTED_PROFILE_PATH } from './production-voice-profile.mjs';

const sourceText = await readFile(SELECTED_PROFILE_PATH, 'utf8');
const actual = JSON.parse(await readFile(PRODUCTION_PROFILE_PATH, 'utf8'));
const expected = deriveProductionProfile(sourceText, actual.generatedAt);
assert.deepEqual(comparableProfile(actual), comparableProfile(expected), 'Production voice profile drift detected. Run npm run voice:profile:sync.');
console.log(`Production voice profile verified: ${actual.profileId} / ${actual.source.sha256}`);
