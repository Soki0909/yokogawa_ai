import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserSpeechAdapter, createSpeechProvider } from '../public/js/tts-adapter.js';

class FakeUtterance {
  constructor(text) { this.text = text; }
}

function fakeEngine() {
  return {
    spoken: null,
    cancelled: 0,
    getVoices: () => [{ name: 'Japanese Test Voice', lang: 'ja-JP', voiceURI: 'ja-test', default: true }],
    speak(utterance) { this.spoken = utterance; },
    cancel() { this.cancelled += 1; },
  };
}

test('TTSアダプターが設定を適用し、開始・完了を通知する', () => {
  const events = [];
  const engine = fakeEngine();
  const adapter = new BrowserSpeechAdapter({
    onStart: (id) => events.push(['start', id]),
    onEnd: (id) => events.push(['end', id]),
  }, engine, FakeUtterance);
  adapter.speak({ id: 'msg-1', text: '音声テスト' }, { rate: 1.2, pitch: 0.8, volume: 0.7, voiceURI: 'ja-test' });
  assert.equal(engine.spoken.text, '音声テスト');
  assert.equal(engine.spoken.lang, 'ja-JP');
  assert.equal(engine.spoken.rate, 1.2);
  assert.equal(engine.spoken.voice.voiceURI, 'ja-test');
  engine.spoken.onstart(); engine.spoken.onend();
  assert.deepEqual(events, [['start', 'msg-1'], ['end', 'msg-1']]);
});

test('TTS停止とエラーを重複なく通知する', () => {
  const events = [];
  const engine = fakeEngine();
  const adapter = new BrowserSpeechAdapter({
    onStop: (id) => events.push(['stop', id]),
    onError: (id, error) => events.push(['error', id, error]),
  }, engine, FakeUtterance);
  adapter.speak({ id: 'msg-stop', text: '停止' }, { rate: 1, pitch: 1, volume: 1, voiceURI: '' });
  const stoppedUtterance = engine.spoken;
  adapter.stop();
  stoppedUtterance.onerror({ error: 'canceled' });
  assert.deepEqual(events, [['stop', 'msg-stop']]);
  adapter.speak({ id: 'msg-error', text: '失敗' }, { rate: 1, pitch: 1, volume: 1, voiceURI: '' });
  engine.spoken.onerror({ error: 'synthesis-failed' });
  assert.deepEqual(events.at(-1), ['error', 'msg-error', 'synthesis-failed']);
});

test('音声合成APIがなくても一覧は空で、発話だけを安全に拒否する', () => {
  const adapter = new BrowserSpeechAdapter({}, undefined, undefined);
  assert.deepEqual(adapter.getVoices(), []);
  assert.throws(() => adapter.speak({ id: 'x', text: '字幕は継続' }, {}), /利用できません/);
});

test('Local TTS Providerは同一originの一時音声だけを再生する', async () => {
  const events = [];
  class FakeAudio {
    constructor(src) { this.src = src; FakeAudio.last = this; this.currentTime = 0; }
    play() { this.onplay?.(); return Promise.resolve(); }
    pause() {}
  }
  const provider = createSpeechProvider('local-tts', { onStart: (id) => events.push(['start', id]), onEnd: (id) => events.push(['end', id]) }, { AudioClass: FakeAudio });
  provider.speak({ id: 'runtime-1', audio: { runtimeUrl: '/api/runtime-audio/abc' } });
  assert.equal(FakeAudio.last.src, '/api/runtime-audio/abc');
  FakeAudio.last.onended();
  assert.deepEqual(events, [['start', 'runtime-1'], ['end', 'runtime-1']]);
  assert.throws(() => provider.speak({ id: 'bad', audio: { runtimeUrl: 'https://example.com/audio.wav' } }), /URLが不正/);
});
