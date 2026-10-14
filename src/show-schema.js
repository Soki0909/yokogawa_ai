import { sentenceTexts } from '../public/js/subtitle-units.js';

export const SHOW_SCHEMA_VERSION = 3;
export const SUPPORTED_SHOW_SCHEMA_VERSIONS = Object.freeze([2, 3]);

export const TRANSITION_IDS = Object.freeze([
  'none', 'boot', 'anomaly', 'takeover', 'riddle-enter', 'final-challenge-enter',
  'auth-success', 'unlock-start', 'emergency-interrupt', 'hostile-enter',
  'shutdown', 'recovery', 'normalize', 'timeline',
]);

export const OVERLAY_IDS = Object.freeze([
  'none', 'booting', 'communication-locked', 'access-denied', 'authentication-failed',
  'riddle-active', 'all-conditions-met', 'final-challenge', 'authenticating',
  'authentication-success', 'unlocking', 'emergency-protection', 'unlock-aborted',
  'connection-failed', 'forced-runaway', 'system-shutdown', 'restoring',
]);

export const VISUAL_TYPES = Object.freeze(['none', 'text-card', 'image', 'final-challenge', 'riddle-status']);

export const CUE_KINDS = Object.freeze([
  'speech-display', 'speech-only', 'display-only', 'clear', 'blackout', 'preset-only',
]);

export const DEFAULT_PRESETS = Object.freeze([
  { id: 'normal', name: 'Normal', background: '#07121f', accent: '#62d9ff', text: '#eefaff', glow: .45, motion: 'calm' },
  { id: 'warning', name: 'Warning', background: '#211605', accent: '#ffbe55', text: '#fff8e8', glow: .58, motion: 'pulse' },
  { id: 'hijacked', name: 'Hijacked', background: '#1c0715', accent: '#ff4fbc', text: '#fff0fa', glow: .68, motion: 'glitch' },
  { id: 'hostile', name: 'Hostile', background: '#220909', accent: '#ff5a5a', text: '#fff0f0', glow: .7, motion: 'pulse' },
  { id: 'shutdown', name: 'Shutdown', background: '#020305', accent: '#6c7785', text: '#d5dae0', glow: .12, motion: 'none' },
  { id: 'recovery', name: 'Recovery', background: '#061d18', accent: '#53f3c2', text: '#edfff9', glow: .5, motion: 'calm' },
]);

export const AVATAR_ASSET_SETS = Object.freeze({
  'yokogawa-v1': Object.freeze({
    base: Object.freeze({ id: 'yokogawa-v1-mouth-closed', path: 'assets/avatar/yokogawa/v1/base.png' }),
    mouthHalf: Object.freeze({ id: 'yokogawa-v1-mouth-half', path: 'assets/avatar/yokogawa/v1/mouth-half.png' }),
    mouthOpen: Object.freeze({ id: 'yokogawa-v1-mouth-open', path: 'assets/avatar/yokogawa/v1/mouth-open.png' }),
    eyesClosed: Object.freeze({ id: 'yokogawa-v1-eyes-closed', path: 'assets/avatar/yokogawa/v1/eyes-closed.png' }),
  }),
});

export const DEFAULT_AVATAR = Object.freeze({
  visible: true, state: 'normal', lipSyncMode: 'simulated', label: 'YOKOGAWA AI',
  mode: 'image-yokogawa-v1', assetSetId: 'yokogawa-v1',
  layers: null,
  paintBottomInset: .062,
});

const ID = /^[a-zA-Z0-9_-]{1,100}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const AVATAR_STATES = new Set(['normal', 'thinking', 'warning', 'hijacked', 'hostile', 'shutdown', 'recovery', 'speaking']);
export const SPEECH_MODES = new Set(['browser', 'audio-file', 'local-tts', 'none']);
export const PLAYBACK_EFFECTS = new Set(['none', 'hijacked-subtle-v1']);
const LIP_MODES = new Set(['none', 'simulated', 'audio-reactive']);
const AVATAR_MODES = new Set(['image-yokogawa-v1', 'svg-fallback']);
const text = (value, limit = 5000) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const id = (value, fallback = '') => ID.test(value ?? '') ? value : fallback;
const finite = (value, fallback, min, max) => Number.isFinite(Number(value))
  ? Math.min(max, Math.max(min, Number(value))) : fallback;

export function normalizeTransition(input = {}) {
  return {
    mode: ['cut', 'fade', 'glitch'].includes(input?.mode) ? input.mode : (['anomaly', 'takeover', 'hostile-enter'].includes(input?.id) ? 'glitch' : input?.id === 'shutdown' ? 'cut' : 'fade'),
    id: input?.id === 'timeline' || TRANSITION_IDS.includes(input?.id) ? input.id : 'none',
    durationMs: Math.round(finite(input?.durationMs, 900, 0, 30_000)),
    intensity: finite(input?.intensity, 1, 0, 1),
  };
}

export function normalizeOverlay(input = {}) {
  return {
    id: OVERLAY_IDS.includes(input?.id) ? input.id : 'none',
    visible: input?.visible === true && input?.id !== 'none',
    title: text(input?.title, 160), message: text(input?.message, 1000),
    progress: input?.progress == null ? null : finite(input.progress, 0, 0, 100),
    variant: id(input?.variant, '') || 'default',
  };
}

export function normalizeVisual(input = {}) {
  const type = VISUAL_TYPES.includes(input?.type) ? input.type : 'none';
  return {
    id: id(input?.id, '') || 'none', type,
    assetId: id(input?.assetId, '') || null,
    assetVersion: /^[a-f0-9]{64}$/.test(input?.assetVersion ?? '') ? input.assetVersion : null,
    mode: id(input?.mode, '') || 'default',
    visible: input?.visible === true && type !== 'none',
    title: text(input?.title, 160), message: text(input?.message, 1000),
    items: Array.isArray(input?.items) ? input.items.slice(0, 20).map((item) => text(item, 200)).filter(Boolean) : [],
  };
}

export function normalizeTiming(input = {}) {
  return {
    speechDelayMs: Math.round(finite(input?.speechDelayMs, 0, 0, 30_000)),
    autoClearOverlayMs: input?.autoClearOverlayMs == null ? null : Math.round(finite(input.autoClearOverlayMs, 0, 0, 600_000)),
    autoHideVisualMs: input?.autoHideVisualMs == null ? null : Math.round(finite(input.autoHideVisualMs, 0, 0, 600_000)),
    unlockDurationMs: Math.round(finite(input?.unlockDurationMs, 5000, 3000, 10_000)),
  };
}

// A Cue timeline contains presentation changes only; audio remains one existing asset.
export function normalizeSequence(input) {
  return (Array.isArray(input) ? input : []).slice(0, 20).map((phase) => ({
    atMs: Math.round(finite(phase.atMs, 0, 0, 30_000)),
    ...(phase.overlay ? { overlay: normalizeOverlay(phase.overlay) } : {}),
    ...(phase.visual ? { visual: normalizeVisual(phase.visual) } : {}),
    ...(phase.presentationPreset ? { presentationPreset: id(phase.presentationPreset, 'normal') } : {}),
    ...(phase.avatar ? { avatar: normalizeAvatar(phase.avatar) } : {}),
    ...(phase.transition ? { transition: normalizeTransition(phase.transition) } : {}),
    ...(phase.unlock ? { unlock: { durationMs: Math.round(finite(phase.unlock.durationMs, 5000, 3000, 10000)) } } : {}),
    ...(phase.clearSubtitle === true ? { clearSubtitle: true } : {}),
  })).sort((a, b) => a.atMs - b.atMs);
}

export function normalizeSyncMarkers(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 50).flatMap((marker) => {
    const department = id(marker?.department, '');
    const markerId = id(marker?.id, '');
    return department && markerId ? [{ department, id: markerId, note: text(marker.note, 500) }] : [];
  });
}

export function normalizeAvatar(input = {}) {
  return {
    ...DEFAULT_AVATAR,
    visible: input.visible !== false,
    state: AVATAR_STATES.has(input.state) ? input.state : DEFAULT_AVATAR.state,
    lipSyncMode: LIP_MODES.has(input.lipSyncMode) ? input.lipSyncMode : DEFAULT_AVATAR.lipSyncMode,
    label: text(input.label, 120) || DEFAULT_AVATAR.label,
    mode: AVATAR_MODES.has(input.mode) ? input.mode : DEFAULT_AVATAR.mode,
    assetSetId: AVATAR_ASSET_SETS[input.assetSetId] ? input.assetSetId : DEFAULT_AVATAR.assetSetId,
    layers: input.layers && ['base', 'mouthHalf', 'mouthOpen', 'eyesClosed'].every(key => /^assets\/avatar\/[a-zA-Z0-9_/-]+\.(png|webp)$/.test(input.layers[key] ?? '') && !input.layers[key].includes('..')) ? { ...input.layers } : null,
    paintBottomInset: finite(input.paintBottomInset, input.layers ? 0 : .062, 0, .3),
  };
}

export function normalizeTarget(target) {
  if (target?.type === 'display' && id(target.id)) return { type: 'display', id: target.id };
  if (target?.type === 'group' && id(target.id)) return { type: 'group', id: target.id };
  return { type: 'all' };
}

export function normalizePreset(input = {}, index = 0) {
  return {
    id: id(input.id, `preset-${index + 1}`), name: text(input.name, 120) || `Preset ${index + 1}`,
    background: HEX.test(input.background ?? '') ? input.background : '#07121f',
    accent: HEX.test(input.accent ?? '') ? input.accent : '#62d9ff',
    text: HEX.test(input.text ?? '') ? input.text : '#eefaff',
    glow: Number.isFinite(Number(input.glow)) ? Math.min(1, Math.max(0, Number(input.glow))) : .45,
    motion: ['none', 'calm', 'pulse', 'glitch'].includes(input.motion) ? input.motion : 'calm',
  };
}

export function normalizeAsset(input = {}, index = 0) {
  const mimeTypes = ['audio/wav', 'audio/mpeg', 'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  return {
    id: id(input.id, `asset-${index + 1}`), name: text(input.name, 120) || `Audio ${index + 1}`,
    path: text(input.path, 300), mimeType: mimeTypes.includes(input.mimeType) ? input.mimeType : 'audio/wav',
    sha256: /^[a-f0-9]{64}$/.test(input.sha256 ?? '') ? input.sha256 : null,
    durationMs: Math.round(finite(input.durationMs, 0, 0, 180000)),
    ...(typeof input.slot === 'string' ? { slot: id(input.slot) } : {}),
  };
}

export function isSafeAssetPath(value) {
  if (!value || typeof value !== 'string' || value.includes('..') || value.includes('\\') || value.startsWith('/') || /^[a-zA-Z]:/.test(value)) return false;
  return /^assets\/(audio\/[a-zA-Z0-9_.-]+\.(wav|mp3)|visual\/[a-zA-Z0-9_.-]+\.(png|jpe?g|webp|svg))$/i.test(value);
}

export function isImageAsset(asset) { return asset?.mimeType?.startsWith('image/') && /^assets\/visual\//i.test(asset.path ?? ''); }

export function normalizeCue(input = {}, order = 0) {
  const cueId = id(input.cueId ?? input.id, `cue-${order + 1}`);
  const cueName = text(input.cueName ?? input.name, 120) || '名称未設定';
  const legacy = text(input.text);
  const speechText = text(input.speechText ?? legacy);
  const displayText = text(input.displayText ?? legacy);
  const kind = CUE_KINDS.includes(input.kind) ? input.kind : 'speech-display';
  const speechMode = SPEECH_MODES.has(input.audio?.speechMode ?? input.speechProvider)
    ? (input.audio?.speechMode ?? input.speechProvider) : (input.audioAsset ? 'audio-file' : 'browser');
  const audioAsset = id(input.audio?.assetId ?? input.audioAsset, '') || null;
  const lipSyncMode = LIP_MODES.has(input.audio?.lipSyncMode) ? input.audio.lipSyncMode
    : (['audio-file', 'local-tts'].includes(speechMode) ? 'audio-reactive' : speechMode === 'browser' ? 'simulated' : 'none');
  const playbackEffect = PLAYBACK_EFFECTS.has(input.audio?.playbackEffect) ? input.audio.playbackEffect : 'none';
  const avatarState = AVATAR_STATES.has(input.avatar?.state) ? input.avatar.state : 'normal';
  const sceneId = id(input.sceneId ?? input.scene, '') || null;
  const result = {
    schemaVersion: SHOW_SCHEMA_VERSION, id: cueId, name: cueName, enabled: input.enabled !== false,
    route: id(input.route, '') || 'main', scene: sceneId, location: text(input.location, 120), kind,
    speechText, displayText, operatorNote: text(input.operatorNote ?? input.notes, 1000), triggerNote: text(input.triggerNote, 500),
    target: normalizeTarget(input.target), presentationPreset: id(input.presentationPreset, '') || 'normal',
    avatar: { visible: input.avatar?.visible !== false, state: avatarState },
    audio: { speechMode, assetId: audioAsset, lipSyncMode, playbackEffect },
    speech: { subtitleMode: 'typewriter', ...(Array.isArray(input.speech?.subtitleUnits) ? { subtitleUnits: input.speech.subtitleUnits.slice(0,100).map(unit => ({ displayText: text(unit?.displayText), startMs: Math.round(finite(unit?.startMs,0,0,180000)), endMs: Math.round(finite(unit?.endMs,0,0,180000)) })) } : {}), spokenText: text(input.speech?.spokenText ?? speechText), segments: (Array.isArray(input.speech?.segments) ? input.speech.segments : []).slice(0, 100).map(segment => ({ displayText: text(segment?.displayText), spokenText: text(segment?.spokenText), startMs: Math.round(finite(segment?.startMs, 0, 0, 180000)), endMs: Math.round(finite(segment?.endMs, 0, 0, 180000)), pauseAfterMs: Math.round(finite(segment?.pauseAfterMs, 0, 0, 10000)) })) },
    sfx: (Array.isArray(input.sfx) ? input.sfx : []).slice(0, 20).map(effect => ({ assetId: id(effect.assetId), atMs: Math.round(finite(effect.atMs, 0, 0, 180000)), volume: finite(effect.volume, 1, 0, 1), durationMs: Math.round(finite(effect.durationMs, 0, 0, 180000)) })),
    ...(input.recoverySfx ? {recoverySfx:{atMs:Math.round(finite(input.recoverySfx.atMs,4600,0,180000)),volume:finite(input.recoverySfx.volume,.8,0,1)}} : {}),
    transition: normalizeTransition(input.transition), overlay: normalizeOverlay(input.overlay),
    visual: normalizeVisual(input.visual), timing: normalizeTiming(input.timing), sequence: normalizeSequence(input.sequence),
    syncMarkers: normalizeSyncMarkers(input.syncMarkers),
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : order,
    cueId, cueNumber: text(input.cueNumber, 20) || String(order + 1).padStart(3, '0'), cueName,
    text: speechText || displayText, sceneId, displayMode: kind, speechProvider: speechMode,
    audioAsset, preDelay: Number(input.preDelay) || 0, postDelay: Number(input.postDelay) || 0,
    actions: Array.isArray(input.actions) ? input.actions : [], notes: text(input.operatorNote ?? input.notes, 1000),
  };
  return result;
}

export function validateShowFile(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, errors: ['SHOW_FILE_NOT_OBJECT'] };
  if (!SUPPORTED_SHOW_SCHEMA_VERSIONS.includes(input.schemaVersion)) errors.push('UNSUPPORTED_SCHEMA_VERSION');
  for (const key of ['scenes', 'cues', 'presets', 'assets']) if (!Array.isArray(input[key])) errors.push(`${key.toUpperCase()}_NOT_ARRAY`);
  const cues = Array.isArray(input.cues) ? input.cues.map(normalizeCue) : [];
  const presets = Array.isArray(input.presets) ? input.presets.map(normalizePreset) : [];
  const assets = Array.isArray(input.assets) ? input.assets.map(normalizeAsset) : [];
  const unique = (items, key, code) => { const seen = new Set(); for (const item of items) { if (seen.has(item[key])) errors.push(code); seen.add(item[key]); } };
  unique(cues, 'id', 'DUPLICATE_CUE_ID'); unique(presets, 'id', 'DUPLICATE_PRESET_ID'); unique(assets, 'id', 'DUPLICATE_ASSET_ID');
  const presetIds = new Set(presets.map((item) => item.id));
  const assetIds = new Set(assets.map((item) => item.id));
  const sceneIds = new Set((Array.isArray(input.scenes) ? input.scenes : []).map((item) => item.sceneId ?? item.id));
  const groupIds = new Set((Array.isArray(input.groups) ? input.groups : []).map((item) => item.id));
  for (const cue of cues) {
    let previousEnd = 0;
    for (const segment of cue.speech.segments) {
      if (!segment.displayText || segment.endMs <= segment.startMs || segment.startMs < previousEnd) errors.push(`CUE_SPEECH_TIMELINE_INVALID:${cue.id}`);
      previousEnd = segment.endMs;
    }
    if (cue.speech.subtitleUnits?.length) {
      if (JSON.stringify(cue.speech.subtitleUnits.map(unit => unit.displayText)) !== JSON.stringify(sentenceTexts(cue.displayText))) errors.push(`CUE_SUBTITLE_SENTENCES_INVALID:${cue.id}`);
      let end = 0;
      for (const unit of cue.speech.subtitleUnits) {
        if (unit.endMs <= unit.startMs || unit.startMs < end) errors.push(`CUE_SUBTITLE_TIMELINE_INVALID:${cue.id}`);
        end = unit.endMs;
      }
    }
    for (const effect of cue.sfx) if (!assets.some(asset => asset.id === effect.assetId && asset.mimeType.startsWith('audio/'))) errors.push(`CUE_SFX_NOT_FOUND:${cue.id}`);
    for (const phase of cue.sequence) {
      if (cue.transition.id === 'none' || phase.atMs > cue.transition.durationMs) errors.push(`CUE_SEQUENCE_OUTSIDE_TRANSITION:${cue.id}`);
      if (phase.presentationPreset && !presetIds.has(phase.presentationPreset)) errors.push(`CUE_SEQUENCE_PRESET_NOT_FOUND:${cue.id}`);
      if (phase.visual?.type === 'image' && !isImageAsset(assets.find(asset => asset.id === phase.visual.assetId))) errors.push(`CUE_SEQUENCE_IMAGE_NOT_FOUND:${cue.id}`);
    }
    if (cue.scene && !sceneIds.has(cue.scene)) errors.push(`CUE_SCENE_NOT_FOUND:${cue.id}`);
    if (!presetIds.has(cue.presentationPreset)) errors.push(`CUE_PRESET_NOT_FOUND:${cue.id}`);
    if (cue.target.type === 'group' && !groupIds.has(cue.target.id)) errors.push(`CUE_GROUP_NOT_FOUND:${cue.id}`);
    if (cue.audio.speechMode === 'audio-file' && !assetIds.has(cue.audio.assetId)) errors.push(`CUE_ASSET_NOT_FOUND:${cue.id}`);
    if (cue.visual.type === 'image' && !assetIds.has(cue.visual.assetId)) errors.push(`CUE_VISUAL_ASSET_NOT_FOUND:${cue.id}`);
    if (cue.visual.type === 'image' && assetIds.has(cue.visual.assetId) && !isImageAsset(assets.find((asset) => asset.id === cue.visual.assetId))) errors.push(`CUE_VISUAL_ASSET_NOT_IMAGE:${cue.id}`);
    if (['speech-display', 'speech-only'].includes(cue.kind) && cue.audio.speechMode !== 'none' && !cue.speechText) errors.push(`CUE_SPEECH_EMPTY:${cue.id}`);
    if (['speech-display', 'display-only'].includes(cue.kind) && !cue.displayText) errors.push(`CUE_DISPLAY_EMPTY:${cue.id}`);
  }
  for (const [index, raw] of (Array.isArray(input.cues) ? input.cues : []).entries()) {
    const cueId = raw.id ?? raw.cueId ?? index;
    if (raw.kind != null && !CUE_KINDS.includes(raw.kind)) errors.push(`INVALID_CUE_KIND:${cueId}`);
    if (raw.target?.type && !['all', 'display', 'group'].includes(raw.target.type)) errors.push(`INVALID_TARGET:${cueId}`);
    if (raw.avatar?.state && !AVATAR_STATES.has(raw.avatar.state)) errors.push(`INVALID_AVATAR_STATE:${cueId}`);
    if (raw.audio?.playbackEffect && !PLAYBACK_EFFECTS.has(raw.audio.playbackEffect)) errors.push(`INVALID_PLAYBACK_EFFECT:${cueId}`);
    if (raw.transition?.id && !TRANSITION_IDS.includes(raw.transition.id)) errors.push(`INVALID_TRANSITION:${cueId}`);
    if (raw.overlay?.id && !OVERLAY_IDS.includes(raw.overlay.id)) errors.push(`INVALID_OVERLAY:${cueId}`);
    if (raw.visual?.type && !VISUAL_TYPES.includes(raw.visual.type)) errors.push(`INVALID_VISUAL_TYPE:${cueId}`);
  }
  if (input.avatar?.mode != null && !AVATAR_MODES.has(input.avatar.mode)) errors.push('INVALID_AVATAR_MODE');
  if (input.avatar?.assetSetId != null && !AVATAR_ASSET_SETS[input.avatar.assetSetId]) errors.push('AVATAR_ASSET_SET_NOT_FOUND');
  if (input.avatar?.layers != null && !normalizeAvatar(input.avatar).layers) errors.push('INVALID_AVATAR_LAYERS');
  for (const asset of assets) {
    if (!isSafeAssetPath(asset.path)) errors.push(`UNSAFE_ASSET_PATH:${asset.id}`);
    const extensionMatches = asset.mimeType === 'audio/wav' ? /\.wav$/i : asset.mimeType === 'audio/mpeg' ? /\.mp3$/i
      : asset.mimeType === 'image/png' ? /\.png$/i : asset.mimeType === 'image/jpeg' ? /\.jpe?g$/i
        : asset.mimeType === 'image/webp' ? /\.webp$/i : /\.svg$/i;
    if (!extensionMatches.test(asset.path)) errors.push(`ASSET_MIME_MISMATCH:${asset.id}`);
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)], normalized: { cues, presets, assets } };
}

export function publicCue(cue) {
  if (!cue) return null;
  const { operatorNote, triggerNote, notes, actions, syncMarkers, ...safe } = cue;
  return safe;
}
