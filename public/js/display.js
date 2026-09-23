import { ReconnectingSocket } from './socket-client.js';
import { createSpeechProvider } from './tts-adapter.js';
import { LipSyncController } from './lip-sync.js';
import { BlinkController } from './blink-controller.js';

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
let identifyTimer;
const lipSync = new LipSyncController(elements['avatar-wrap']);
const blink = new BlinkController(elements['avatar-wrap']);

const socket = new ReconnectingSocket('display', handleEvent, (status) => {
  elements.connection.textContent = status === 'connected' ? 'ONLINE' : status === 'connecting' ? 'CONNECTING' : 'RECONNECTING';
  elements.connection.dataset.state = status;
  elements['enable-audio'].disabled = status !== 'connected';
  if (status === 'connected') setMode('SYSTEM READY', 'ready');
  else setMode('接続を復旧しています', 'error');
}, { helloData: () => ({ display: identity }), heartbeatMs: 2000 });

const speech = createSpeechProvider('browser', {
  onStart: (id) => { lipSync.simulate(); setMode('VOICE OUTPUT', 'speaking'); socket.send({ type: 'playback', id, status: 'speaking' }); },
  onEnd: (id) => { lipSync.stop(); setMode('SYSTEM READY', 'ready'); socket.send({ type: 'playback', id, status: 'completed' }); },
  onStop: (id) => { lipSync.stop(); setMode('VOICE STOPPED', 'stopped'); socket.send({ type: 'playback', id, status: 'stopped' }); },
  onError: (id, error) => { lipSync.stop(); setMode('VOICE ERROR — 字幕は継続中', 'error'); socket.send({ type: 'playback', id, status: 'error', error }); },
});
const localAudio = createSpeechProvider('audio-file', {
  onStart: (id, audio) => { lipSync.analyse(audio); setMode('LOCAL AUDIO', 'speaking'); socket.send({ type: 'playback', id, status: 'speaking' }); },
  onEnd: (id) => { lipSync.stop(); setMode('SYSTEM READY', 'ready'); socket.send({ type: 'playback', id, status: 'completed' }); },
  onStop: (id) => { lipSync.stop(); socket.send({ type: 'playback', id, status: 'stopped' }); },
  onError: (id, error) => { lipSync.stop(); socket.send({ type: 'playback', id, status: 'error', error }); },
});

function applyPresentation(presentation = {}, preset = null) {
  if (preset) { document.documentElement.style.setProperty('--phase-bg', preset.background); document.documentElement.style.setProperty('--phase-accent', preset.accent); document.documentElement.style.setProperty('--phase-text', preset.text); document.documentElement.style.setProperty('--phase-glow', preset.glow); document.body.dataset.motion = preset.motion; document.body.dataset.preset = preset.id; }
  if (presentation.kind === 'clear') showCaption(''); else if (presentation.displayText && presentation.kind !== 'speech-only') showCaption(presentation.displayText);
  if (presentation.avatar) {
    const visible = presentation.avatar.visible !== false;
    elements['avatar-wrap'].hidden = !visible;
    elements['avatar-wrap'].dataset.state = presentation.avatar.state ?? 'normal';
    elements['avatar-wrap'].dataset.avatarMode = presentation.avatar.mode ?? 'image-yokogawa-v1';
    if (!visible) lipSync.stop();
  }
  elements.blackout.hidden = presentation.blackout !== true;
  blink.update({ visible: !elements['avatar-wrap'].hidden, state: elements['avatar-wrap'].dataset.state, blackout: presentation.blackout === true });
}

function handleEvent(event) {
  if (event.type === 'state') {
    settings = event.state.settings;
    isAudioMaster = event.isAudioMaster === true;
    const restoredText = event.self?.currentSubtitle;
    if (restoredText) showCaption(restoredText);
    applyPresentation({ displayText: restoredText, avatar: event.state.currentAvatar, blackout: event.state.blackout }, event.state.currentPreset);
    document.body.dataset.reducedMotion = String(event.state.settings?.reducedMotion === true);
    elements['audio-help'].textContent = isAudioMaster
      ? 'この端末はAudio Masterです。公演開始前または再読み込み後に準備してください。'
      : '字幕Displayとして接続します。Audio Masterに指定されるまで音声は再生しません。';
    if (!isAudioMaster || !identity.audioEnabled || audioUnlocked) elements['audio-gate'].hidden = true;
    publishVoices();
  } else if (event.type === 'speak') {
    settings = event.settings;
    if (event.message.kind !== 'speech-only') showCaption(event.message.displayText || event.message.text);
    if (!event.shouldSpeak) {
      setMode('SUBTITLE OUTPUT', 'ready');
      return;
    }
    socket.send({ type: 'playback', id: event.message.id, status: 'received' });
    try { (event.message.audio?.speechMode === 'audio-file' ? localAudio : speech).speak(event.message, settings); }
    catch (error) { socket.send({ type: 'playback', id: event.message.id, status: 'error', error: error.message }); }
  } else if (event.type === 'presentation') {
    applyPresentation(event.presentation, event.preset);
  } else if (event.type === 'stop') {
    speech.stop(); localAudio.stop(); lipSync.stop();
  } else if (event.type === 'settings') {
    settings = event.settings; elements.caption.hidden = !settings.subtitlesEnabled;
  } else if (event.type === 'voices:request') {
    publishVoices();
  } else if (event.type === 'show:reset') {
    speech.stop(false); localAudio.stop(false); lipSync.stop(); elements.caption.textContent = '待機しています'; elements.blackout.hidden = true; applyPresentation({ avatar: { visible: true, state: 'normal', mode: 'image-yokogawa-v1' }, blackout: false }); setMode('SYSTEM READY', 'ready');
  } else if (event.type === 'identify') {
    clearTimeout(identifyTimer);
    elements['identify-name'].textContent = identity.displayName;
    elements['identify-id'].textContent = identity.displayId;
    elements['identify-overlay'].hidden = false;
    identifyTimer = window.setTimeout(() => { elements['identify-overlay'].hidden = true; }, Math.min(10_000, Math.max(1000, Number(event.durationMs) || 5000)));
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
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) window.speechSynthesis?.resume();
});
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
