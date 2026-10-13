import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalAudioProvider } from '../public/js/tts-adapter.js';

test('STOP/replacement discards queued play and late AbortError from an old audio element', async () => {
  const starts=[],errors=[];let rejectPlay;
  class Audio { play(){return new Promise((_,reject)=>{rejectPlay=reject;});}pause(){} }
  const provider=new LocalAudioProvider({onStart:id=>starts.push(id),onError:id=>errors.push(id)},Audio);
  const old=provider.speak({id:'old',audio:{assetId:'prod-voice-002-example'}});
  provider.stop();old.onplay();rejectPlay(new Error('AbortError'));await Promise.resolve();
  assert.deepEqual(starts,[]);assert.deepEqual(errors,[]);
  const replaced=provider.speak({id:'replaced',audio:{assetId:'prod-voice-002-example'}});const lateReject=rejectPlay;
  const current=provider.speak({id:'current',audio:{assetId:'prod-voice-002-example'}});
  replaced.onplay();lateReject(new Error('AbortError'));current.onplay();await Promise.resolve();
  assert.deepEqual(starts,['current']);assert.deepEqual(errors,[]);provider.stop();
});
