import { ReconnectingSocket } from './socket-client.js';
import { createSpeechProvider } from './tts-adapter.js';
import { LipSyncController } from './lip-sync.js';
import { BlinkController } from './blink-controller.js';
import { prepareProductionAudio } from './audio-preload.js';
import { CueSfxPlayer } from './cue-sfx.js';

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
let audioReadySent = false;
let audioPreloadPromise = null;
let audioPreloadResult = null;
let identifyTimer;
let transitionTimer;
let unlockFrame;
let overlayTimer;
let visualTimer;
let subtitleFrame;
const sfx = new CueSfxPlayer();
const lipSync = new LipSyncController(elements['avatar-wrap']);
const blink = new BlinkController(elements['avatar-wrap']);
const systemStates = new Set(['normal', 'warning', 'hijacked', 'hostile', 'shutdown', 'recovery']);

const socket = new ReconnectingSocket('display', handleEvent, (status) => {
  elements.connection.textContent = status === 'connected' ? 'ONLINE' : status === 'connecting' ? 'CONNECTING' : 'RECONNECTING';
  elements.connection.dataset.state = status;
  elements['enable-audio'].disabled = status !== 'connected';
  if (status !== 'connected') audioReadySent = false;
  if (status === 'disconnected') stopLocalTransport();
  if (status === 'connected') { recoveryPending = false; setMode('SYSTEM READY', 'ready'); }
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


function setAudioPreloadHelp(message) {
  elements['audio-help'].textContent = message;
}

async function ensureProductionAudioPreloaded() {
  if (audioPreloadResult?.total > 0 && audioPreloadResult.ready === audioPreloadResult.total) return audioPreloadResult;
  if (audioPreloadPromise) return audioPreloadPromise;
  audioPreloadPromise = prepareProductionAudio({
    concurrency: 4,
    onProgress: ({ ready, total }) => {
      setAudioPreloadHelp(`固定WAVを準備しています… ${ready} / ${total}`);
      elements['enable-audio'].textContent = `音声準備中 ${ready}/${total}`;
    },
  }).then((result) => {
    if (!result.total || result.ready !== result.total) throw new Error('Production WAVの準備が完了していません');
    audioPreloadResult = result;
    setAudioPreloadHelp(`固定WAV ${result.ready} / ${result.total} READY。設定を保存して開始してください。`);
    elements['enable-audio'].textContent = '設定を保存して開始';
    return result;
  }).catch((error) => {
    audioPreloadResult = null;
    setAudioPreloadHelp(`固定WAVの準備に失敗しました。再試行してください。(${error.message})`);
    elements['enable-audio'].textContent = '再試行';
    throw error;
  }).finally(() => {
    audioPreloadPromise = null;
  });
  return audioPreloadPromise;
}

async function syncAudioReady() {
  if (!isAudioMaster || !identity.audioEnabled || !audioUnlocked || audioReadySent) return;
  try {
    await ensureProductionAudioPreloaded();
    if (isAudioMaster && identity.audioEnabled && !audioReadySent) {
      audioReadySent = socket.send({ type: 'audio:ready' });
    }
  } catch {
    setMode('AUDIO PRELOAD ERROR', 'error');
    elements['audio-gate'].hidden = false;
  }
}

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
  if ('currentSubtitle' in presentation) showCaption(presentation.currentSubtitle);
  else if (presentation.kind === 'clear') showCaption('');
  else if (presentation.displayText && presentation.kind !== 'speech-only') showCaption(presentation.displayText);
  if (presentation.avatar) {
    const visible = presentation.avatar.visible !== false;
    elements['avatar-wrap'].hidden = !visible;
    elements['avatar-wrap'].dataset.state = presentation.avatar.state ?? 'normal';
    elements['avatar-wrap'].dataset.avatarMode = presentation.avatar.mode ?? 'image-yokogawa-v1';
    elements['avatar-wrap'].style.setProperty('--avatar-paint-bottom-inset', `${(presentation.avatar.paintBottomInset ?? .062) * 100}%`);
    const avatarLayers = presentation.avatar.layers ?? { base: 'assets/avatar/yokogawa/v1/base.png', mouthHalf: 'assets/avatar/yokogawa/v1/mouth-half.png', mouthOpen: 'assets/avatar/yokogawa/v1/mouth-open.png', eyesClosed: 'assets/avatar/yokogawa/v1/eyes-closed.png' };
    for (const [key, selector] of Object.entries({ base: '.avatar-base', mouthHalf: '.avatar-mouth-half', mouthOpen: '.avatar-mouth-open', eyesClosed: '.avatar-eyes-closed' })) {
      const image = elements['avatar-wrap'].querySelector(selector); const url = `/${avatarLayers[key]}`;
      if (new URL(image.src).pathname !== url) image.src = url;
    }
    if (!visible) lipSync.stop();
  }
  elements.blackout.hidden = presentation.blackout !== true;
  if (presentation.transition) renderTransition(presentation.transition);
  if (presentation.overlay) renderOverlay(presentation.overlay);
  if (presentation.visual) renderVisual(presentation.visual);
  if (presentation.unlock) renderUnlock(presentation.unlock);
  if (presentation.overlay?.id === 'restoring' && presentation.transition?.status === 'active') {
    const transition = presentation.transition;
    const draw = () => {
      const elapsed = Math.max(0, Date.now() - Date.parse(transition.startedAt));
      updateProgress(Math.min(100, elapsed / 3800 * 100));
      if (elapsed < 3800) unlockFrame = requestAnimationFrame(draw);
    };
    draw();
  }
  const systemState = systemStates.has(document.body.dataset.preset) ? document.body.dataset.preset : elements['avatar-wrap'].dataset.state;
  elements['avatar-wrap'].dataset.systemState = systemState;
  blink.update({ visible: !elements['avatar-wrap'].hidden, state: systemState, blackout: presentation.blackout === true });
}

function renderTransition(transition = {}) {
  transition = transition.effect ?? transition;
  clearTimeout(transitionTimer);
  document.body.dataset.transition = transition.id ?? 'none';
  document.body.dataset.transitionMode = transition.mode ?? 'fade';
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
  elements['operation-overlay'].dataset.variant = overlay.variant ?? 'default';
  document.body.dataset.operationVariant = overlay.variant ?? 'default';
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
  elements['scene-visual'].dataset.mode = visual.mode ?? 'default';
  document.body.dataset.visual = visible ? visual.type : 'none';
  elements['scene-visual-label'].textContent = visual.mode && visual.mode !== 'default' ? visual.mode.toUpperCase() : 'SCENE VISUAL';
  elements['scene-visual-title'].textContent = visual.title || String(visual.id ?? '').replaceAll('-', ' ');
  elements['scene-visual-message'].textContent = visual.message ?? '';
  const showImage = visible && visual.type === 'image' && visual.assetId;
  elements['scene-visual-image'].hidden = !showImage;
  if (showImage) { elements['scene-visual-image'].src = `/api/assets/${encodeURIComponent(visual.assetId)}${visual.assetVersion ? `?v=${visual.assetVersion}` : ''}`; elements['scene-visual-image'].alt = visual.title || 'Scene visual'; }
  else elements['scene-visual-image'].removeAttribute('src');
  const signature = JSON.stringify([visual.id, visual.items]);
  if (elements['scene-visual-items'].dataset.signature !== signature) {
    elements['scene-visual-items'].dataset.signature = signature;
    elements['scene-visual-items'].replaceChildren(...(visual.items ?? []).map((value, index) => { const item = document.createElement('li'); item.textContent = value; item.style.setProperty('--node-index', index); return item; }));
  }
  if (visible && visual.expiresAt) visualTimer = window.setTimeout(() => { elements['scene-visual'].hidden = true; document.body.dataset.visual = 'none'; }, Math.max(0, Date.parse(visual.expiresAt) - Date.now()));
}

function updateProgress(progress) {
  const value = Math.min(100, Math.max(0, progress));
  elements['operation-progress'].hidden = false;
  elements['operation-progress-value'].style.width = `${value}%`;
  elements['operation-progress-label'].textContent = `${Math.round(value)}%`;
  for (const [index, gauge] of [...elements['unlock-gauges'].children].entries()) {
    const gaugeValue = value >= 100 ? 100 : Math.min(100, Math.max(0, (value - index * 4) / (100 - index * 4) * 100));
    gauge.style.setProperty('--gauge-progress', String(gaugeValue));
    const meter = gauge.querySelector('i');
    if (meter) meter.dataset.progress = `${Math.round(gaugeValue)}%`;
  }
}

function renderUnlock(unlock = {}) {
  cancelAnimationFrame(unlockFrame);
  const relevantOverlay = ['unlocking', 'emergency-protection', 'unlock-aborted'].includes(elements['operation-overlay'].dataset.overlay)
    && elements['operation-overlay'].dataset.variant === 'default';
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
  detectResume();
  if (event.type === 'runtime:recovered') recoveryPending = false;
  if (recoveryPending && ['state', 'speak', 'sfx', 'subtitle', 'presentation'].includes(event.type)) return;
  if (event.type === 'state') {
    settings = event.state.settings;
    isAudioMaster = event.isAudioMaster === true;
    audioReadySent = event.self?.audioReady === true;
    const restoredText = event.self?.currentSubtitle;
    showCaption(restoredText);
    applyPresentation({ currentSubtitle: restoredText, avatar: event.state.currentAvatar, blackout: event.state.blackout,
      transition: event.state.currentTransition, overlay: event.state.currentOverlay, visual: event.state.currentVisual, unlock: event.state.unlock }, event.state.currentPreset);
    document.body.dataset.reducedMotion = String(event.state.settings?.reducedMotion === true);
    elements['audio-help'].textContent = isAudioMaster
      ? 'この端末はAudio Masterです。固定WAVを事前準備してから音声出力を開始します。'
      : '字幕Displayとして接続します。Audio Masterに指定されるまで音声は再生しません。';
    if (isAudioMaster && identity.audioEnabled && !audioUnlocked) void ensureProductionAudioPreloaded().catch(() => {});
    else void syncAudioReady();
    if (!isAudioMaster || !identity.audioEnabled || audioUnlocked) elements['audio-gate'].hidden = true;
    publishVoices();
  } else if (event.type === 'speak') {
    settings = event.settings;
    if (event.message.kind !== 'speech-only') showCaption(event.message.speech?.segments?.[0]?.displayText ?? event.message.displayText ?? event.message.text);
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
  } else if (event.type === 'subtitle') {
    revealCaption(event.text, event.durationMs);
  } else if (event.type === 'sfx') {
    if (isAudioMaster && audioUnlocked) void sfx.play(event.effect, event.volume).catch(error => socket.send({ type: 'playback', id: 'sfx', status: 'error', error: error.message }));
  } else if (event.type === 'sfx:stop') {
    sfx.stop(); cancelAnimationFrame(subtitleFrame);
  } else if (event.type === 'stop') {
    sfx.stop(); cancelAnimationFrame(subtitleFrame); showCaption('');
    speech.stop(); localAudio.stop(); localTts.stop(); lipSync.stop(); cancelAnimationFrame(unlockFrame); clearTimeout(transitionTimer); clearTimeout(overlayTimer); clearTimeout(visualTimer); document.body.dataset.transitionStatus = 'stopped';
  } else if (event.type === 'settings') {
    settings = event.settings; elements.caption.hidden = !settings.subtitlesEnabled;
  } else if (event.type === 'voices:request') {
    publishVoices();
  } else if (event.type === 'show:reset') {
    sfx.stop(); cancelAnimationFrame(subtitleFrame);
    speech.stop(false); localAudio.stop(false); localTts.stop(false); lipSync.stop(); cancelAnimationFrame(unlockFrame); clearTimeout(transitionTimer); clearTimeout(overlayTimer); clearTimeout(visualTimer); showCaption(''); elements.blackout.hidden = true; setMode('SYSTEM READY', 'ready');
  } else if (event.type === 'identify') {
    clearTimeout(identifyTimer);
    elements['identify-name'].textContent = identity.displayName;
    elements['identify-id'].textContent = identity.displayId;
    elements['identify-overlay'].hidden = false;
    identifyTimer = window.setTimeout(() => { elements['identify-overlay'].hidden = true; }, Math.min(10_000, Math.max(1000, Number(event.durationMs) || 5000)));
  }
}

function showCaption(text) {
  cancelAnimationFrame(subtitleFrame);
  const normalized = String(text ?? '');
  elements.caption.textContent = normalized;
  elements.caption.dataset.length = normalized.length > 100 ? 'extra-long' : normalized.length > 64 ? 'long' : normalized.length > 32 ? 'medium' : 'short';
  elements.caption.hidden = !settings.subtitlesEnabled;
  document.body.dataset.captionEmpty = String(!normalized);
}

let recoveryPending = false;
let lastRuntimeTick = performance.now(); let lastRuntimeWall = Date.now();
function detectResume() {
  const tick = performance.now(); const wall = Date.now();
  const resumed = tick - lastRuntimeTick > 5000 || Math.abs((wall - lastRuntimeWall) - (tick - lastRuntimeTick)) > 5000;
  lastRuntimeTick = tick; lastRuntimeWall = wall;
  if (resumed) { stopLocalTransport(); recoveryPending = socket.send({ type: 'runtime:recover' }); }
  return resumed;
}
function stopLocalTransport() {
  sfx.stop(); speech.stop(false); localAudio.stop(false); localTts.stop(false); lipSync.stop();
  cancelAnimationFrame(subtitleFrame); cancelAnimationFrame(unlockFrame); clearTimeout(transitionTimer); clearTimeout(overlayTimer); clearTimeout(visualTimer);
  showCaption(''); document.body.dataset.transitionStatus = 'completed';
}
setInterval(detectResume, 500);
function revealCaption(text, durationMs) {
  showCaption(text);
  if (text.length <= 32 || settings.reducedMotion) return;
  const started = performance.now(); const duration = Math.min(3500, Math.max(350, durationMs * .65));
  const draw = () => {
    const fraction = Math.min(1, (performance.now() - started) / duration);
    elements.caption.textContent = text.slice(0, Math.max(1, Math.ceil(text.length * fraction)));
    if (fraction < 1) subtitleFrame = requestAnimationFrame(draw);
  };
  draw();
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
elements['enable-audio'].addEventListener('click', async () => {
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
    elements['enable-audio'].disabled = true;
    try {
      await ensureProductionAudioPreloaded();
      if (isAudioMaster && identity.audioEnabled) {
        audioUnlocked = true;
        audioReadySent = socket.send({ type: 'audio:ready' });
      }
    } catch {
      setMode('AUDIO PRELOAD ERROR', 'error');
      elements['enable-audio'].disabled = false;
      elements['audio-gate'].hidden = false;
      return;
    }
    elements['enable-audio'].disabled = false;
  }

  elements['audio-gate'].hidden = true; setMode('SYSTEM READY', 'ready');
});
