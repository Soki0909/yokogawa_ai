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
let transitionTimer;
let unlockFrame;
let overlayTimer;
let visualTimer;
const lipSync = new LipSyncController(elements['avatar-wrap']);
const blink = new BlinkController(elements['avatar-wrap']);
const systemStates = new Set(['normal', 'warning', 'hijacked', 'hostile', 'shutdown', 'recovery']);

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
  onStart: (id, audio, message) => { lipSync.analyse(audio, message.audio?.playbackEffect); setMode('LOCAL AUDIO', 'speaking'); socket.send({ type: 'playback', id, status: 'speaking' }); },
  onEnd: (id) => { lipSync.stop(); setMode('SYSTEM READY', 'ready'); socket.send({ type: 'playback', id, status: 'completed' }); },
  onStop: (id) => { lipSync.stop(); socket.send({ type: 'playback', id, status: 'stopped' }); },
  onError: (id, error) => { lipSync.stop(); socket.send({ type: 'playback', id, status: 'error', error }); },
});
const localTts = createSpeechProvider('local-tts', {
  onStart: (id, audio) => { lipSync.analyse(audio); setMode('LOCAL TTS', 'speaking'); socket.send({ type: 'playback', id, status: 'speaking' }); },
  onEnd: (id) => { lipSync.stop(); setMode('SYSTEM READY', 'ready'); socket.send({ type: 'playback', id, status: 'completed' }); },
  onStop: (id) => { lipSync.stop(); socket.send({ type: 'playback', id, status: 'stopped' }); },
  onError: (id, error) => { lipSync.stop(); setMode('LOCAL TTS ERROR — 字幕は継続中', 'error'); socket.send({ type: 'playback', id, status: 'error', error }); },
});

function applyPresentation(presentation = {}, preset = null) {
  if (preset) {
    document.documentElement.style.setProperty('--phase-bg', preset.background);
    document.documentElement.style.setProperty('--phase-accent', preset.accent);
    document.documentElement.style.setProperty('--phase-text', preset.text);
    document.documentElement.style.setProperty('--phase-glow', preset.glow);
    document.body.dataset.motion = preset.motion;
    document.body.dataset.preset = preset.id;
    elements['preset-status'].textContent = preset.name?.toUpperCase?.() || preset.id.toUpperCase();
    elements['preset-detail'].textContent = ({
      normal: 'SECURITY ACTIVE', warning: 'ANOMALY DETECTED', hijacked: 'CONTROL OVERRIDDEN',
      hostile: 'CONTAINMENT FAILED', shutdown: 'SYSTEM OFFLINE', recovery: 'SYNC RESTORING',
    })[preset.id] ?? 'CUSTOM PROFILE';
  }
  if (presentation.kind === 'clear') showCaption(''); else if (presentation.displayText && presentation.kind !== 'speech-only') showCaption(presentation.displayText);
  if (presentation.avatar) {
    const visible = presentation.avatar.visible !== false;
    elements['avatar-wrap'].hidden = !visible;
    elements['avatar-wrap'].dataset.state = presentation.avatar.state ?? 'normal';
    elements['avatar-wrap'].dataset.avatarMode = presentation.avatar.mode ?? 'image-yokogawa-v1';
    if (!visible) lipSync.stop();
  }
  elements.blackout.hidden = presentation.blackout !== true;
  if (presentation.transition) renderTransition(presentation.transition);
  if (presentation.overlay) renderOverlay(presentation.overlay);
  if (presentation.visual) renderVisual(presentation.visual);
  if (presentation.unlock) renderUnlock(presentation.unlock);
  const systemState = systemStates.has(document.body.dataset.preset) ? document.body.dataset.preset : elements['avatar-wrap'].dataset.state;
  elements['avatar-wrap'].dataset.systemState = systemState;
  blink.update({ visible: !elements['avatar-wrap'].hidden, state: systemState, blackout: presentation.blackout === true });
}

function renderTransition(transition = {}) {
  clearTimeout(transitionTimer);
  document.body.dataset.transition = transition.id ?? 'none';
  document.body.dataset.transitionStatus = transition.status ?? 'idle';
  document.documentElement.style.setProperty('--phase-a-transition-ms', `${Math.max(0, Number(transition.durationMs) || 0)}ms`);
  document.documentElement.style.setProperty('--phase-a-intensity', String(Math.min(1, Math.max(0, Number(transition.intensity) || 0))));
  const elapsed = transition.startedAt ? Math.max(0, Date.now() - Date.parse(transition.startedAt)) : 0;
  document.documentElement.style.setProperty('--phaseb-transition-delay', `${-Math.min(elapsed, Number(transition.durationMs) || 0)}ms`);
  if (transition.status === 'active') {
    elements['transition-layer'].style.animation = 'none'; void elements['transition-layer'].offsetWidth;
    elements['transition-layer'].style.animation = '';
    transitionTimer = window.setTimeout(() => { document.body.dataset.transitionStatus = 'completed'; }, Math.max(0, (Number(transition.durationMs) || 0) - elapsed));
  }
}

function renderOverlay(overlay = {}) {
  clearTimeout(overlayTimer);
  const visible = overlay.visible === true && overlay.id !== 'none';
  elements['operation-overlay'].hidden = !visible;
  elements['operation-overlay'].dataset.overlay = overlay.id ?? 'none';
  document.body.dataset.overlay = overlay.id ?? 'none';
  elements['operation-title'].textContent = overlay.title || String(overlay.id ?? '').replaceAll('-', ' ');
  elements['operation-message'].textContent = overlay.message ?? '';
  if (overlay.progress != null) updateProgress(Number(overlay.progress));
  else elements['operation-progress'].hidden = overlay.id !== 'unlocking';
  if (visible && overlay.expiresAt) overlayTimer = window.setTimeout(() => {
    elements['operation-overlay'].hidden = true; document.body.dataset.overlay = 'none'; elements['unlock-gauges'].hidden = true;
  }, Math.max(0, Date.parse(overlay.expiresAt) - Date.now()));
}

function renderVisual(visual = {}) {
  clearTimeout(visualTimer);
  const visible = visual.visible === true && visual.type !== 'none';
  elements['scene-visual'].hidden = !visible;
  elements['scene-visual'].dataset.type = visual.type ?? 'none';
  document.body.dataset.visual = visible ? visual.type : 'none';
  elements['scene-visual-label'].textContent = visual.mode && visual.mode !== 'default' ? visual.mode.toUpperCase() : 'SCENE VISUAL';
  elements['scene-visual-title'].textContent = visual.title || String(visual.id ?? '').replaceAll('-', ' ');
  elements['scene-visual-message'].textContent = visual.message ?? '';
  const showImage = visible && visual.type === 'image' && visual.assetId;
  elements['scene-visual-image'].hidden = !showImage;
  if (showImage) { elements['scene-visual-image'].src = `/api/assets/${encodeURIComponent(visual.assetId)}`; elements['scene-visual-image'].alt = visual.title || 'Scene visual'; }
  else elements['scene-visual-image'].removeAttribute('src');
  elements['scene-visual-items'].replaceChildren(...(visual.items ?? []).map((value) => { const item = document.createElement('li'); item.textContent = value; return item; }));
  if (visible && visual.expiresAt) visualTimer = window.setTimeout(() => { elements['scene-visual'].hidden = true; document.body.dataset.visual = 'none'; }, Math.max(0, Date.parse(visual.expiresAt) - Date.now()));
}

function updateProgress(progress) {
  const value = Math.min(100, Math.max(0, progress));
  elements['operation-progress'].hidden = false;
  elements['operation-progress-value'].style.width = `${value}%`;
  elements['operation-progress-label'].textContent = `${Math.round(value)}%`;
  for (const [index, gauge] of [...elements['unlock-gauges'].children].entries()) {
    const gaugeValue = Math.min(100, Math.max(0, value * 1.12 - index * 6));
    gauge.style.setProperty('--gauge-progress', String(gaugeValue));
    const meter = gauge.querySelector('i');
    if (meter) meter.dataset.progress = `${Math.round(gaugeValue)}%`;
  }
}

function renderUnlock(unlock = {}) {
  cancelAnimationFrame(unlockFrame);
  const relevantOverlay = ['unlocking', 'emergency-protection', 'unlock-aborted'].includes(elements['operation-overlay'].dataset.overlay);
  const relevant = relevantOverlay && unlock.status && unlock.status !== 'idle';
  elements['unlock-gauges'].hidden = !relevant;
  document.body.dataset.unlockStatus = relevant ? unlock.status : 'idle';
  if (!relevant) { elements['operation-progress'].dataset.status = 'idle'; return; }
  const draw = () => {
    let progress = Number(unlock.progress) || 0;
    if (unlock.status === 'running' && unlock.startedAt) progress = Math.min(100, Math.max(progress, (Date.now() - Date.parse(unlock.startedAt)) / (Number(unlock.durationMs) || 5000) * 100));
    updateProgress(progress);
    elements['operation-progress'].dataset.status = ['aborted', 'stopped'].includes(unlock.status) ? unlock.status : progress >= 100 ? 'completed' : unlock.status;
    if (unlock.status === 'running' && progress < 100) unlockFrame = requestAnimationFrame(draw);
  };
  draw();
}

function handleEvent(event) {
  if (event.type === 'state') {
    settings = event.state.settings;
    isAudioMaster = event.isAudioMaster === true;
    const restoredText = event.self?.currentSubtitle;
    if (restoredText) showCaption(restoredText);
    applyPresentation({ displayText: restoredText, avatar: event.state.currentAvatar, blackout: event.state.blackout,
      transition: event.state.currentTransition, overlay: event.state.currentOverlay, visual: event.state.currentVisual, unlock: event.state.unlock }, event.state.currentPreset);
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
    try {
      const provider = event.message.audio?.speechMode === 'audio-file' ? localAudio
        : event.message.audio?.speechMode === 'local-tts' ? localTts : speech;
      provider.speak(event.message, settings);
    }
    catch (error) { socket.send({ type: 'playback', id: event.message.id, status: 'error', error: error.message }); }
  } else if (event.type === 'presentation') {
    applyPresentation(event.presentation, event.preset);
  } else if (event.type === 'stop') {
    speech.stop(); localAudio.stop(); localTts.stop(); lipSync.stop(); cancelAnimationFrame(unlockFrame); document.body.dataset.transitionStatus = 'stopped';
  } else if (event.type === 'settings') {
    settings = event.settings; elements.caption.hidden = !settings.subtitlesEnabled;
  } else if (event.type === 'voices:request') {
    publishVoices();
  } else if (event.type === 'show:reset') {
    speech.stop(false); localAudio.stop(false); localTts.stop(false); lipSync.stop(); clearTimeout(overlayTimer); clearTimeout(visualTimer); elements.caption.textContent = '待機しています'; elements.blackout.hidden = true; setMode('SYSTEM READY', 'ready');
  } else if (event.type === 'identify') {
    clearTimeout(identifyTimer);
    elements['identify-name'].textContent = identity.displayName;
    elements['identify-id'].textContent = identity.displayId;
    elements['identify-overlay'].hidden = false;
    identifyTimer = window.setTimeout(() => { elements['identify-overlay'].hidden = true; }, Math.min(10_000, Math.max(1000, Number(event.durationMs) || 5000)));
  }
}

function showCaption(text) {
  const normalized = String(text ?? '');
  elements.caption.textContent = normalized;
  elements.caption.dataset.length = normalized.length > 100 ? 'extra-long' : normalized.length > 64 ? 'long' : normalized.length > 32 ? 'medium' : 'short';
  elements.caption.hidden = !settings.subtitlesEnabled;
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
