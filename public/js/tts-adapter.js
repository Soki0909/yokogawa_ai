export class BrowserSpeechAdapter {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.active = null;
    this.wasStopped = false;
  }

  getVoices() {
    return window.speechSynthesis.getVoices()
      .filter((voice) => voice.lang.toLowerCase().startsWith('ja'))
      .map(({ name, lang, voiceURI, default: isDefault }) => ({ name, lang, voiceURI, default: isDefault }));
  }

  speak(message, settings) {
    this.stop(false);
    this.wasStopped = false;
    const utterance = new SpeechSynthesisUtterance(message.text);
    utterance.lang = 'ja-JP';
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume;
    const selected = window.speechSynthesis.getVoices().find((voice) => voice.voiceURI === settings.voiceURI);
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
    window.speechSynthesis.speak(utterance);
  }

  stop(notify = true) {
    if (!this.active) {
      window.speechSynthesis.cancel();
      return;
    }
    const id = this.active.id;
    this.wasStopped = true;
    this.active = null;
    window.speechSynthesis.cancel();
    if (notify) this.callbacks.onStop?.(id);
  }
}

