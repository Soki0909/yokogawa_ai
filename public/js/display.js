import { ReconnectingSocket } from './socket-client.js';
import { createSpeechProvider } from './tts-adapter.js';
import { LipSyncController } from './lip-sync.js';
import { BlinkController } from './blink-controller.js';
import { loadProductionAudioManifest } from './audio-preload.js';
import { ProductionAudioEngine, BufferedSpeechProvider, BufferedSfxPlayer, outputLeadMs } from './production-audio-engine.js';
import { TypewriterCaption } from './subtitle-units.js';
import { PresentationRenderCache, prepareDisplayImages } from './display-preparation.js';

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
let audioManifestRevision = null;
let stageImageUrls = [];
let stageImages = [];
let stageImageSignature = '';
let stageImagePromise = null;
let stageManifestPromise = null;
let audioOutputPrepared = false;
let automaticOutputPreparation = true;
let audioOutputPromise = null;
const presentationCache = new PresentationRenderCache();
let identifyTimer;
let transitionTimer;
let unlockFrame;
let overlayTimer;
let visualTimer;
const captionWriter = new TypewriterCaption((text, fullText) => {
  elements.caption.textContent = text;
  if (elements.caption.dataset.mode !== 'typewriter') elements.caption.dataset.mode = 'typewriter';
  if (elements.caption.dataset.sentence !== fullText) elements.caption.dataset.sentence = fullText;
  const length = fullText.length > 100 ? 'extra-long' : fullText.length > 64 ? 'long' : fullText.length > 32 ? 'medium' : 'short';
  if (elements.caption.dataset.length !== length) elements.caption.dataset.length = length;
  elements.caption.hidden = !settings.subtitlesEnabled;
  if (document.body.dataset.captionEmpty !== String(!text)) document.body.dataset.captionEmpty = String(!text);
});
let playbackGeneration = 0;
let presentationGeneration = 0;
const lipSync = new LipSyncController(elements['avatar-wrap']);
const audioEngine = new ProductionAudioEngine({ onStatus: ({ready,reason}) => {
  audioOutputPrepared = ready;
  if (!ready && audioUnlocked && isAudioMaster) {
    const wasReady=audioReadySent;audioReadySent=false;
    if(wasReady){playbackGeneration++;captionWriter.stop();socket.send({type:'audio:not-ready',reason});}
    setMode('AUDIO NOT READY','error');setAudioPreloadHelp(reason);
  }
} });
const sfx = new BufferedSfxPlayer(audioEngine,(effect,runId,status,error)=>socket.send({type:'cue:sfx',runId,index:effect.index,status,error}));
export function productionAudioDiagnostics(){return {ready:audioEngine.ready,reason:audioEngine.reason,contextState:audioEngine.context?.state,stats:audioEngine.stats(),active:audioEngine.active.size,events:audioEngine.events.slice()};}
const blink = new BlinkController(elements['avatar-wrap']);
const unlockMeters = [...elements['unlock-gauges'].children].map(gauge => ({ gauge, meter: gauge.querySelector('i') }));
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
const localAudio = new BufferedSpeechProvider(audioEngine, {
  onStart: (id, analyser,context) => { lipSync.follow(analyser,outputLeadMs(context)); setMode('LOCAL AUDIO', 'speaking'); socket.send({ type: 'playback', id, status: 'speaking', audioClock: audioEngine.context.currentTime }); },
  onEnd: (id) => { lipSync.finish(); setMode('SYSTEM READY', 'ready'); socket.send({ type: 'playback', id, status: 'completed' }); },
  onStop: (id) => { lipSync.stop(); socket.send({ type: 'playback', id, status: 'stopped' }); },
  onError: (id, error) => { lipSync.stop(); socket.send({ type: 'playback', id, status: 'error', error }); },
});
const localTts = createSpeechProvider('local-tts', {
  onStart: (id, audio) => { lipSync.analyse(audio); setMode('LOCAL TTS', 'speaking'); socket.send({ type: 'playback', id, status: 'speaking' }); },
  onEnd: (id) => { lipSync.finish(); setMode('SYSTEM READY', 'ready'); socket.send({ type: 'playback', id, status: 'completed' }); },
  onStop: (id) => { lipSync.stop(); socket.send({ type: 'playback', id, status: 'stopped' }); },
  onError: (id, error) => { lipSync.stop(); setMode('LOCAL TTS ERROR — 字幕は継続中', 'error'); socket.send({ type: 'playback', id, status: 'error', error }); },
});


function setAudioPreloadHelp(message) {
  elements['audio-help'].textContent = message;
}

async function ensureProductionAudioPreloaded() {
  if (audioPreloadResult?.total > 0 && audioPreloadResult.ready === audioPreloadResult.total) return audioPreloadResult;
  if (audioPreloadPromise) return audioPreloadPromise;
  audioPreloadPromise = loadProductionAudioManifest().then(assets => audioEngine.load(assets, ({ ready, total }) => {
      setAudioPreloadHelp(`固定WAVを準備しています… ${ready} / ${total}`);
      elements['enable-audio'].textContent = `音声準備中 ${ready}/${total}`;
    })).then((result) => {
    if (!result.total || result.ready !== result.total) throw new Error('Production WAVの準備が完了していません');
    audioPreloadResult = result;
    setAudioPreloadHelp(`固定WAV ${result.ready} / ${result.total} READY（実デコード済み）。設定を保存して音声出力を確認してください。`);
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
  if (!isAudioMaster || !identity.audioEnabled || !audioUnlocked) return;
  if (audioReadySent && (!automaticOutputPreparation || audioOutputPrepared)) return;
  const generation = playbackGeneration;
  try {
    await ensureProductionAudioPreloaded();
    await ensureStageImagesPrepared();
    await ensureAudioOutputPrepared();
    if (generation !== playbackGeneration || recoveryPending) return;
    if (isAudioMaster && identity.audioEnabled && !audioReadySent) {
      audioReadySent = socket.send({ type: 'audio:ready', protocol:'decoded-v1', decoded:audioEngine.stats() });
    }
  } catch {
    setMode('AUDIO PRELOAD ERROR', 'error');
    elements['audio-gate'].hidden = false;
  }
}

async function ensureStageImagesPrepared() {
  // Display snapshots intentionally omit the full Show/asset catalogue.
  // Fetch once during preparation, not on the Cue or animation path.
  if (!stageManifestPromise) stageManifestPromise = fetch('/api/show-file', { cache: 'no-store' }).then(async response => {
    if (!response.ok) throw new Error('表示素材一覧を取得できません');
    const show = await response.json();
    return show.assets.filter(asset => asset.id.startsWith('puzzle-') && asset.mimeType.startsWith('image/')).map(asset => `/api/assets/${encodeURIComponent(asset.id)}${asset.sha256 ? `?v=${asset.sha256}` : ''}`);
  }).catch(error => { stageManifestPromise = null; throw error; });
  const urls = [...stageImageUrls, ...await stageManifestPromise];
  const signature = JSON.stringify(urls);
  if (stageImageSignature === signature && stageImagePromise) return stageImagePromise;
  stageImageSignature = signature;
  stageImagePromise = prepareDisplayImages(urls).then(images => { stageImages = images; return images; }).catch(error => {
    stageImageSignature = ''; stageImagePromise = null; throw error;
  });
  return stageImagePromise;
}

function ensureAudioOutputPrepared() {
  if (audioOutputPrepared && audioEngine.context?.state === 'running') return Promise.resolve();
  if (!audioOutputPromise) audioOutputPromise = audioEngine.verify().finally(() => { audioOutputPromise = null; });
  return audioOutputPromise;
}

function applyPresentation(presentation = {}, preset = null) {
  if (preset && presentationCache.changed('preset', preset)) {
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
  if (presentation.blackout === true || presentation.kind === 'speech-display') showCaption('');
  else if ('currentSubtitle' in presentation) showCaption(presentation.currentSubtitle);
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
    if (!visible && (lipSync.nodes.length || lipSync.timer || lipSync.frame)) lipSync.finish();
  }
  elements.blackout.hidden = presentation.blackout !== true;
  if (presentation.transition) renderTransition(presentation.transition);
  if (presentation.overlay) renderOverlay(presentation.overlay);
  if (presentation.visual) renderVisual(presentation.visual);
  if (presentation.unlock) renderUnlock(presentation.unlock);
  const recoveryProgress = presentation.overlay?.id === 'restoring' && presentation.transition?.status === 'active' ? presentation.transition : null;
  if (presentationCache.changed('recovery-progress', recoveryProgress) && recoveryProgress) {
    cancelAnimationFrame(unlockFrame);
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
  if (!presentationCache.changed('transition', transition)) return;
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
  if (!presentationCache.changed('overlay', overlay)) return;
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
  if (!presentationCache.changed('visual', visual)) return;
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
  if (showImage) { const url = `/api/assets/${encodeURIComponent(visual.assetId)}${visual.assetVersion ? `?v=${visual.assetVersion}` : ''}`; if (new URL(elements['scene-visual-image'].src || location.href).pathname + new URL(elements['scene-visual-image'].src || location.href).search !== url) elements['scene-visual-image'].src = url; elements['scene-visual-image'].alt = visual.title || 'Scene visual'; }
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
  const label = `${Math.round(value)}%`;
  if (elements['operation-progress-label'].textContent !== label) elements['operation-progress-label'].textContent = label;
  for (const [index, { gauge, meter }] of unlockMeters.entries()) {
    const gaugeValue = value >= 100 ? 100 : Math.min(100, Math.max(0, (value - index * 4) / (100 - index * 4) * 100));
    gauge.style.setProperty('--gauge-progress', String(gaugeValue));
    const progressLabel = `${Math.round(gaugeValue)}%`;
    if (meter && meter.dataset.progress !== progressLabel) meter.dataset.progress = progressLabel;
  }
}

function renderUnlock(unlock = {}) {
  // Overlay identity matters even when canonical unlock values did not change.
  if (!presentationCache.changed('unlock', [unlock, elements['operation-overlay'].dataset.overlay, elements['operation-overlay'].dataset.variant])) return;
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
  // Align visual/subtitle motion with the browser's output pipeline estimate.
  // This estimate does not include unmeasured external HDMI/projector processing.
  const alignmentMs=event.type==='state'?event.state.presentationDelayMs:event.presentation?.presentationDelayMs ?? event.presentationDelayMs;
  const emergency=event.presentation?.kind==='blackout' || event.state?.blackout || (event.type==='state' && !elements.blackout.hidden && event.state.blackout===false);
  if(emergency && !event.aligned)presentationGeneration++;
  if(!event.aligned && !emergency && ['state','presentation','subtitle'].includes(event.type) && alignmentMs>0){
    const aligned=structuredClone(event),generation=playbackGeneration,visualGeneration=presentationGeneration;aligned.aligned=true;
    const shift=value=>{if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){if(['startedAt','completedAt','expiresAt'].includes(key)&&typeof item==='string')value[key]=new Date(Date.parse(item)+alignmentMs).toISOString();else if(item&&typeof item==='object')shift(item);}};
    const target=aligned.presentation||aligned.state;
    if(target)for(const key of ['transition','overlay','visual','unlock','currentTransition','currentOverlay','currentVisual'])shift(target[key]);
    setTimeout(()=>{if(generation===playbackGeneration && visualGeneration===presentationGeneration)handleEvent(aligned);},alignmentMs);return;
  }
  if (event.type === 'runtime:recovered') recoveryPending = false;
  if (recoveryPending && ['state', 'speak', 'sfx', 'subtitle', 'presentation'].includes(event.type)) return;
  if (event.type === 'cue:prepare') {
    const generation=playbackGeneration;
    void (async()=>{
      try {
        if(!isAudioMaster||!audioUnlocked||recoveryPending)throw Error('Audio Master未準備。設定を保存して再試行してください。');
        if(event.audioAssets && audioEngine.signature!==JSON.stringify(event.audioAssets.map(a=>[a.id,a.sha256,a.url]))){audioPreloadResult=null;await audioEngine.load(event.audioAssets);}
        await audioEngine.verify(event.assets);
        if(generation!==playbackGeneration||recoveryPending)return;
        automaticOutputPreparation=true;
        socket.send({type:'cue:prepared',token:event.token,ready:true,presentationDelayMs:outputLeadMs(audioEngine.context)});
      }catch(error){if(generation===playbackGeneration)socket.send({type:'cue:prepared',token:event.token,ready:false,error:error.message});}
    })();return;
  }
  if (event.type === 'state') {
    if(audioManifestRevision!==event.state.audioManifestRevision){
      audioManifestRevision=event.state.audioManifestRevision;audioPreloadResult=null;audioOutputPrepared=false;
      if(audioUnlocked){audioReadySent=false;audioEngine.fail('音声素材の変更を確認。再デコードしています。');}
    }
    settings = event.state.settings;
    stageImageUrls = [
      ...(event.state.assets ?? []).filter(asset => asset.id.startsWith('puzzle-') && asset.mimeType.startsWith('image/')).map(asset => `/api/assets/${encodeURIComponent(asset.id)}${asset.sha256 ? `?v=${asset.sha256}` : ''}`),
      ...(event.state.currentAvatar?.mode === 'svg-fallback' ? [] : event.state.currentAvatar?.layers
        ? Object.values(event.state.currentAvatar.layers).map(url => `/${url}`)
        : [...elements['avatar-wrap'].querySelectorAll('.avatar-image')].map(image => new URL(image.src).pathname)),
    ];
    isAudioMaster = event.isAudioMaster === true;
    audioReadySent = event.self?.audioReady === true;
    const restoredText = event.self?.currentSubtitle;
    showCaption(restoredText);
    applyPresentation({ currentSubtitle: restoredText, avatar: event.state.currentAvatar, blackout: event.state.blackout,
      transition: event.state.currentTransition, overlay: event.state.currentOverlay, visual: event.state.currentVisual, unlock: event.state.unlock }, event.state.currentPreset);
    document.body.dataset.reducedMotion = String(event.state.settings?.reducedMotion === true);
    if (audioPreloadResult?.ready === audioPreloadResult?.total && audioPreloadResult?.total > 0) setAudioPreloadHelp(`固定WAV ${audioPreloadResult.ready} / ${audioPreloadResult.total} READY（実デコード済み）。出力 ${audioEngine.ready?'READY':`NOT READY: ${audioEngine.reason||'設定を保存して開始してください'}`}`);
    else if (!audioPreloadPromise) elements['audio-help'].textContent = isAudioMaster
      ? 'この端末はAudio Masterです。固定WAVを事前準備してから音声出力を開始します。'
      : '字幕Displayとして接続します。Audio Masterに指定されるまで音声は再生しません。';
    if (isAudioMaster && identity.audioEnabled && !audioUnlocked) void ensureProductionAudioPreloaded().catch(() => {});
    else void syncAudioReady();
    if (!isAudioMaster || !identity.audioEnabled || audioUnlocked) elements['audio-gate'].hidden = true;
    publishVoices();
  } else if (event.type === 'speak') {
    settings = event.settings;
    if (event.message.kind !== 'speech-only') showCaption('');
    if (!event.shouldSpeak) {
      setMode('SUBTITLE OUTPUT', 'ready');
      return;
    }
    socket.send({ type: 'playback', id: event.message.id, status: 'received' });
    const generation = playbackGeneration;
    void (async () => {
      try {
        if (['prod-013', 'prod-014'].includes(event.message.cueId)) {
          const completed = await sfx.whenIdle('prod-sfx-warning');
          if (generation !== playbackGeneration || !isAudioMaster || !audioUnlocked || recoveryPending) return;
          if (!completed) throw new Error('警告音が完了していません。REPLAYしてください。');
        }
        const provider = event.message.audio?.speechMode === 'audio-file' ? localAudio
          : event.message.audio?.speechMode === 'local-tts' ? localTts : speech;
        if(provider===localAudio)audioEngine.assertReady(event.message.audio.assetId);
        provider.speak(event.message, settings);
      } catch (error) { if (generation === playbackGeneration) {socket.send({ type: 'playback', id: event.message.id, status: 'error', error: error.message });if(event.message.source==='cue'&&event.message.audio?.speechMode==='audio-file')audioEngine.fail(error.message);} }
    })();
  } else if (event.type === 'presentation') {
    applyPresentation(event.presentation, event.preset);
  } else if (event.type === 'subtitle') {
    revealCaption(event.text, event.durationMs);
  } else if (event.type === 'sfx') {
    if (isAudioMaster && audioUnlocked) void sfx.play(event.effect, event.volume,event.runId).catch(error => audioEngine.fail(error.message));
  } else if (event.type === 'sfx:stop') {
    playbackGeneration++;
    presentationCache.clear();clearTimeout(transitionTimer);clearTimeout(overlayTimer);clearTimeout(visualTimer);cancelAnimationFrame(unlockFrame);
    localAudio.stop(false);localTts.stop(false);speech.stop(false);lipSync.finish();
    sfx.stop(); captionWriter.stop(); showCaption('');
  } else if (event.type === 'stop') {
    presentationCache.clear();
    audioOutputPrepared = false;
    automaticOutputPreparation = false;
    audioEngine.stopAll();
    playbackGeneration++;
    sfx.stop(); captionWriter.stop(); showCaption('');
    speech.stop(); localAudio.stop(); localTts.stop(); lipSync.stop(); cancelAnimationFrame(unlockFrame); clearTimeout(transitionTimer); clearTimeout(overlayTimer); clearTimeout(visualTimer); document.body.dataset.transitionStatus = 'stopped';
  } else if (event.type === 'settings') {
    settings = event.settings; elements.caption.hidden = !settings.subtitlesEnabled;
  } else if (event.type === 'voices:request') {
    publishVoices();
  } else if (event.type === 'show:reset') {
    presentationCache.clear();
    audioOutputPrepared = false;
    automaticOutputPreparation = true;
    audioEngine.stopAll();audioPreloadResult=null;
    stageManifestPromise = null;
    stageImageSignature = '';
    playbackGeneration++;
    sfx.stop(); captionWriter.stop();
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
  captionWriter.stable(String(text ?? ''));
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
  presentationCache.clear();
  audioOutputPrepared = false;
  automaticOutputPreparation = true;
  audioEngine.stopAll();
  playbackGeneration++;
  sfx.stop(); speech.stop(false); localAudio.stop(false); localTts.stop(false); lipSync.stop();
  captionWriter.stop(); cancelAnimationFrame(unlockFrame); clearTimeout(transitionTimer); clearTimeout(overlayTimer); clearTimeout(visualTimer);
  showCaption(''); document.body.dataset.transitionStatus = 'completed';
}
setInterval(detectResume, 500);
setInterval(()=>{
  if(!isAudioMaster||!audioUnlocked||recoveryPending||!automaticOutputPreparation)return;
  if(audioEngine.context?.state!=='running' && audioEngine.ready)audioEngine.fail('音声出力の停止を検出しました');
  if(!audioEngine.ready)void syncAudioReady();
},1000);
navigator.mediaDevices?.addEventListener('devicechange',()=>{
  if(!audioUnlocked||!isAudioMaster)return;
  audioEngine.fail('音声デバイスが変更されました。再準備後にREPLAYしてください。');
});
function revealCaption(text, durationMs) {
  if (document.hidden) { captionWriter.stop(); showCaption(''); return; }
  captionWriter.reveal(text, durationMs);
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
  if (document.hidden) { captionWriter.stop(); showCaption(''); }
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
    automaticOutputPreparation = true;
    const generation = playbackGeneration;
    elements['enable-audio'].disabled = true;
    try {
      await ensureProductionAudioPreloaded();
      await ensureStageImagesPrepared();
      await ensureAudioOutputPrepared();
      if (generation !== playbackGeneration || recoveryPending) { elements['enable-audio'].disabled = false; return; }
      if (isAudioMaster && identity.audioEnabled) {
        audioUnlocked = true;
        audioReadySent = socket.send({ type: 'audio:ready', protocol:'decoded-v1', decoded:audioEngine.stats() });
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
