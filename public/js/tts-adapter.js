export class BrowserSpeechProvider {
  constructor(callbacks = {}, engine = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance) {
    this.callbacks = callbacks;
    this.engine = engine;
    this.Utterance = Utterance;
    this.active = null;
    this.wasStopped = false;
  }

  getVoices() {
    if (!this.engine) return [];
    return this.engine.getVoices()
      .filter((voice) => voice.lang.toLowerCase().startsWith('ja'))
      .map(({ name, lang, voiceURI, default: isDefault }) => ({ name, lang, voiceURI, default: isDefault }));
  }

  speak(message, settings) {
    if (!this.engine || !this.Utterance) throw new Error('このブラウザでは音声合成を利用できません');
    this.stop(false);
    this.wasStopped = false;
    const utterance = new this.Utterance(message.text);
    utterance.lang = 'ja-JP';
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume;
    const selected = this.engine.getVoices().find((voice) => voice.voiceURI === settings.voiceURI);
    if (selected) utterance.voice = selected;
    const token = Symbol(message.id);
    this.active = { id: message.id, utterance, token };
    utterance.onstart = () => {
      if (this.active?.token === token) this.callbacks.onStart?.(message.id);
    };
    utterance.onend = () => {
      if (this.active?.token !== token || this.wasStopped) return;
      this.active = null;
      this.callbacks.onEnd?.(message.id);
    };
    utterance.onerror = (event) => {
      if (this.active?.token !== token || this.wasStopped) return;
      this.active = null;
      this.callbacks.onError?.(message.id, event.error || '音声合成に失敗しました');
    };
    this.engine.speak(utterance);
  }

  stop(notify = true) {
    if (!this.active) {
      this.engine?.cancel();
      return;
    }
    const id = this.active.id;
    this.wasStopped = true;
    this.active = null;
    this.engine.cancel();
    if (notify) this.callbacks.onStop?.(id);
  }
}

// Phase 1 name kept for backwards compatibility.
export const BrowserSpeechAdapter = BrowserSpeechProvider;

export class LocalAudioProvider {
  constructor(callbacks = {}, AudioClass = globalThis.Audio, { source = 'asset' } = {}) {
    this.callbacks = callbacks; this.AudioClass = AudioClass; this.source = source; this.active = null;
  }
  getVoices() { return []; }
  speak(message) {
    const url = this.source === 'runtime'
      ? message.audio?.runtimeUrl
      : message.audio?.assetId ? `/api/assets/${encodeURIComponent(message.audio.assetId)}` : null;
    if (!this.AudioClass || !url) throw new Error(this.source === 'runtime' ? 'Local TTS音声を利用できません' : 'ローカル音声アセットを利用できません');
    if (this.source === 'runtime') {
      const parsed = new URL(url, globalThis.location?.origin ?? 'http://localhost');
      if (parsed.origin !== (globalThis.location?.origin ?? parsed.origin) || !parsed.pathname.startsWith('/api/runtime-audio/')) {
        throw new Error('Local TTS音声URLが不正です');
      }
    }
    this.stop(false); const audio = new this.AudioClass(url); this.active = { id: message.id, audio };
    audio.onplay = () => this.callbacks.onStart?.(message.id, audio);
    audio.onended = () => { if (this.active?.audio !== audio) return; this.active = null; this.callbacks.onEnd?.(message.id); };
    audio.onerror = () => { if (this.active?.audio !== audio) return; this.active = null; this.callbacks.onError?.(message.id, '音声ファイルの再生に失敗しました'); };
    const result = audio.play(); result?.catch?.((error) => this.callbacks.onError?.(message.id, error.message)); return audio;
  }
  stop(notify = true) { if (!this.active) return; const { id, audio } = this.active; this.active = null; audio.pause(); audio.currentTime = 0; if (notify) this.callbacks.onStop?.(id); }
}

export function createSpeechProvider(provider, callbacks = {}, dependencies = {}) {
  if (provider === 'audio-file') return new LocalAudioProvider(callbacks, dependencies.AudioClass);
  if (provider === 'local-tts') return new LocalAudioProvider(callbacks, dependencies.AudioClass, { source: 'runtime' });
  if (provider !== 'browser') throw new Error(`未対応のSpeech Providerです: ${provider}`);
  return new BrowserSpeechProvider(callbacks, dependencies.engine, dependencies.Utterance);
}
