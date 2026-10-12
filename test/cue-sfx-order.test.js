import test from 'node:test';
import assert from 'node:assert/strict';
import { CueSfxPlayer } from '../public/js/cue-sfx.js';

class Audio extends EventTarget {
  constructor(src) { super(); this.src=src; this.paused=true; }
  async play() { this.paused=false; }
  pause() { this.paused=true; }
}
class Context {
  createMediaElementSource() { return {connect(){}}; }
  async resume() {}
  async close() {}
}
const effect = {assetId:'prod-sfx-warning',volume:.6};
test('warning completion gate waits for actual ended event, rather than predicted duration', async () => {
  const player = new CueSfxPlayer({AudioClass:Audio,AudioContextClass:Context});
  await player.play(effect);let completed=false;const wait=player.whenIdle().then(ok=>{completed=ok;return ok;});
  await Promise.resolve();assert.equal(completed,false);
  const item=[...player.active][0];item.audio.dispatchEvent(new Event('ended'));
  assert.equal(await wait,true);assert.equal(item.audio.paused,true);assert.equal(player.active.size,0);
});
test('STOP releases waiting speech as cancelled, and an old end cannot release a new warning', async () => {
  const player = new CueSfxPlayer({AudioClass:Audio,AudioContextClass:Context});await player.play(effect);
  const old=[...player.active][0];const wait=player.whenIdle();player.stop();assert.equal(await wait,false);
  await player.play(effect);old.audio.dispatchEvent(new Event('ended'));assert.equal(player.active.size,1);
  const next=player.whenIdle();[...player.active][0].audio.dispatchEvent(new Event('ended'));assert.equal(await next,true);
});
test('an audio error prevents following speech from being released as a success', async () => {
  const player = new CueSfxPlayer({AudioClass:Audio,AudioContextClass:Context});await player.play(effect);
  const wait=player.whenIdle();[...player.active][0].audio.dispatchEvent(new Event('error'));assert.equal(await wait,false);
  assert.equal(await player.whenIdle('prod-sfx-warning'),false,'late speech cannot forget a prior warning error');
});
