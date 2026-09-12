import { ReconnectingSocket } from './socket-client.js';
import { createSpeechProvider } from './tts-adapter.js';

const elements = Object.fromEntries([...document.querySelectorAll('[id]')].map((element) => [element.id, element]));
const storageKey = 'yokogawa-display-v2';
const generatedId = () => `display-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
let identity;
try { identity = JSON.parse(localStorage.getItem(storageKey)); } catch {}
const parameters = new URLSearchParams(location.search);
const parameterId = /^[a-zA-Z0-9_-]{1,100}$/.test(parameters.get('id') ?? '') ? parameters.get('id') : null;
identity = {
  displayId: parameterId || identity?.displayId || generatedId(),
  displayName: parameters.get('name')?.trim().slice(0, 80) || identity?.displayName || `Display ${Math.floor(Math.random() * 900 + 100)}`,
  audioEnabled: identity?.audioEnabled !== false,
};
localStorage.setItem(storageKey, JSON.stringify(identity));
elements['display-name'].value = identity.displayName;
elements['audio-enabled'].checked = identity.audioEnabled;
elements['display-identity'].textContent = identity.displayName;

let settings = { rate: 1, pitch: .9, volume: 1, voiceURI: '', subtitlesEnabled: true };
let isAudioMaster = false;
let audioUnlocked = false;

const socket = new ReconnectingSocket('display', handleEvent, (status) => {
  elements.connection.textContent = status === 'connected' ? 'ONLINE' : status === 'connecting' ? 'CONNECTING' : 'RECONNECTING';
  elements.connection.dataset.state = status;
  elements['enable-audio'].disabled = status !== 'connected';
  if (status === 'connected') setMode('SYSTEM READY', 'ready');
  else setMode('接続を復旧しています', 'error');
}, { helloData: () => ({ display: identity }), heartbeatMs: 2000 });

const speech = createSpeechProvider('browser', {
  onStart: (id) => { setMode('VOICE OUTPUT', 'speaking'); socket.send({ type: 'playback', id, status: 'speaking' }); },
  onEnd: (id) => { setMode('SYSTEM READY', 'ready'); socket.send({ type: 'playback', id, status: 'completed' }); },
  onStop: (id) => { setMode('VOICE STOPPED', 'stopped'); socket.send({ type: 'playback', id, status: 'stopped' }); },
  onError: (id, error) => { setMode('VOICE ERROR — 字幕は継続中', 'error'); socket.send({ type: 'playback', id, status: 'error', error }); },
});

function handleEvent(event) {
  if (event.type === 'state') {
    settings = event.state.settings;
    isAudioMaster = event.isAudioMaster === true;
    const restoredText = event.self?.currentSubtitle;
    if (restoredText) showCaption(restoredText);
    elements['audio-help'].textContent = isAudioMaster
      ? 'この端末はAudio Masterです。公演開始前または再読み込み後に準備してください。'
      : '字幕Displayとして接続します。Audio Masterに指定されるまで音声は再生しません。';
    if (!isAudioMaster || !identity.audioEnabled || audioUnlocked) elements['audio-gate'].hidden = true;
    publishVoices();
  } else if (event.type === 'speak') {
    settings = event.settings;
    showCaption(event.message.text);
    if (!event.shouldSpeak) {
      setMode('SUBTITLE OUTPUT', 'ready');
      return;
    }
    socket.send({ type: 'playback', id: event.message.id, status: 'received' });
    try { speech.speak(event.message, settings); }
    catch (error) { socket.send({ type: 'playback', id: event.message.id, status: 'error', error: error.message }); }
  } else if (event.type === 'stop') {
    speech.stop();
  } else if (event.type === 'settings') {
    settings = event.settings; elements.caption.hidden = !settings.subtitlesEnabled;
  } else if (event.type === 'voices:request') {
    publishVoices();
  } else if (event.type === 'show:reset') {
    speech.stop(false); elements.caption.textContent = '待機しています'; setMode('SYSTEM READY', 'ready');
  }
}

function showCaption(text) {
  elements.caption.textContent = text; elements.caption.hidden = !settings.subtitlesEnabled;
}
function setMode(label, state) {
  elements['mode-label'].textContent = label; elements.orb.dataset.state = state;
}
function publishVoices() {
  if (!isAudioMaster) return;
  const voices = speech.getVoices();
  if (voices.length) socket.send({ type: 'voices', voices });
}
function openSetup() {
  elements['display-name'].value = identity.displayName;
  elements['audio-enabled'].checked = identity.audioEnabled;
  elements['audio-gate'].hidden = false;
}

window.speechSynthesis?.addEventListener('voiceschanged', publishVoices);
document.addEventListener('visibilitychange', () => { if (!document.hidden) window.speechSynthesis?.resume(); });
elements['open-setup'].addEventListener('click', openSetup);
elements['enable-audio'].addEventListener('click', () => {
  identity = {
    ...identity,
    displayName: elements['display-name'].value.trim() || identity.displayName,
    audioEnabled: elements['audio-enabled'].checked,
  };
  localStorage.setItem(storageKey, JSON.stringify(identity));
  elements['display-identity'].textContent = identity.displayName;
  socket.send({ type: 'display:configure', display: identity });
  window.speechSynthesis?.cancel(); publishVoices();
  if (identity.audioEnabled && isAudioMaster) {
    audioUnlocked = true; socket.send({ type: 'audio:ready' });
  }
  elements['audio-gate'].hidden = true; setMode('SYSTEM READY', 'ready');
});
