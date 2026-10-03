import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateShowFile } from '../src/show-schema.js';

const load = async (name) => JSON.parse(await readFile(`shows/${name}`, 'utf8'));

test('Production Showは全18 Assetを登録しscripted speechをaudio-fileへ固定する', async () => {
  const [main, route, manifest] = await Promise.all([
    load('production.json'), load('production-yokogawa-route.json'),
    readFile('config/production-speech/yokogawa-ai-v1.json', 'utf8').then(JSON.parse),
  ]);
  assert.equal(validateShowFile(main).valid, true);
  assert.equal(validateShowFile(route).valid, true);
  assert.equal(main.assets.length, 18);
  assert.equal(route.assets.length, 18);
  const speech = [...main.cues, ...route.cues].filter((cue) => cue.kind.startsWith('speech'));
  assert.equal(speech.length, 18);
  assert.equal(speech.filter((cue) => cue.audio.speechMode === 'audio-file').length, 18);
  assert.equal(speech.filter((cue) => cue.audio.speechMode === 'browser').length, 0);
  assert.deepEqual(speech.map((cue) => cue.speechText), manifest.speeches.map((item) => item.scriptText));
  assert.equal(main.settings.freeSpeakMode, 'local-tts');
  assert.equal(route.metadata.description.includes('UNRESOLVED ROUTE MAPPING'), true);
});
