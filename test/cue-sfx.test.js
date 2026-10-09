import test from 'node:test';
import assert from 'node:assert/strict';
import { CueSfxPlayer } from '../public/js/cue-sfx.js';

test('SFX STOP while AudioContext resumes cannot start a stale clip', async () => {
  const originalAudio = globalThis.Audio; const originalContext = globalThis.AudioContext;
  let resume; let plays = 0;
  globalThis.Audio = class { addEventListener() {} pause() {} async play() { plays++; } };
  globalThis.AudioContext = class {
    createMediaElementSource() { return { connect() {} }; }
    resume() { return new Promise(resolve => { resume = resolve; }); }
    async close() {}
  };
  try {
    const player = new CueSfxPlayer();
    const pending = player.play({ assetId: 'prod-sfx-glitch', volume: 1 });
    player.stop(); resume(); await pending;
    assert.equal(plays, 0); assert.equal(player.active.size, 0);
  } finally { globalThis.Audio = originalAudio; globalThis.AudioContext = originalContext; }
});
