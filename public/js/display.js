import { ReconnectingSocket } from './socket-client.js';
import { BrowserSpeechAdapter } from './tts-adapter.js';

const caption = document.getElementById('caption');
const connection = document.getElementById('connection');
const orb = document.getElementById('orb');
const modeLabel = document.getElementById('mode-label');
let settings = { rate: 1, pitch: 0.9, volume: 1, voiceURI: '', subtitlesEnabled: true };

const socket = new ReconnectingSocket('display', handleEvent, (status) => {
  connection.textContent = status === 'connected' ? 'ONLINE' : status === 'connecting' ? 'CONNECTING' : 'RECONNECTING';
  connection.dataset.state = status;
  if (status !== 'connected') setMode('接続を復旧しています', 'error');
});

const speech = new BrowserSpeechAdapter({
  onStart: (id) => { setMode('VOICE OUTPUT', 'speaking'); socket.send({ type: 'playback', id, status: 'speaking' }); },
  onEnd: (id) => { setMode('SYSTEM READY', 'ready'); socket.send({ type: 'playback', id, status: 'completed' }); },
  onStop: (id) => { setMode('VOICE STOPPED', 'stopped'); socket.send({ type: 'playback', id, status: 'stopped' }); },
  onError: (id, error) => { setMode('VOICE ERROR — 字幕は継続中', 'error'); socket.send({ type: 'playback', id, status: 'error', error }); },
});

function handleEvent(event) {
  if (event.type === 'state') {
    settings = event.state.settings;
    const restoredText = event.state.currentMessage?.text ?? event.state.history?.[0]?.text;
    if (restoredText) showCaption(restoredText);
    publishVoices();
    // state同期は表示復元だけに使用し、リロード時の音声自動再生を意図的に行わない。
  } else if (event.type === 'speak') {
    settings = event.settings;
    showCaption(event.message.text);
    socket.send({ type: 'playback', id: event.message.id, status: 'received' });
    try { speech.speak(event.message, settings); }
    catch (error) { socket.send({ type: 'playback', id: event.message.id, status: 'error', error: error.message }); }
  } else if (event.type === 'stop') {
    speech.stop();
  } else if (event.type === 'settings') {
    settings = event.settings;
    caption.hidden = !settings.subtitlesEnabled;
  }
}

function showCaption(text) {
  caption.textContent = text;
  caption.hidden = !settings.subtitlesEnabled;
}

function setMode(label, state) {
  modeLabel.textContent = label;
  orb.dataset.state = state;
}

function publishVoices() {
  const voices = speech.getVoices();
  if (voices.length) socket.send({ type: 'voices', voices });
}
window.speechSynthesis.addEventListener('voiceschanged', publishVoices);
document.addEventListener('visibilitychange', () => { if (!document.hidden) window.speechSynthesis.resume(); });

