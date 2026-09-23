export const SHOW_SCHEMA_VERSION = 2;

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
});

const ID = /^[a-zA-Z0-9_-]{1,100}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const AVATAR_STATES = new Set(['normal', 'thinking', 'warning', 'hijacked', 'hostile', 'shutdown', 'recovery', 'speaking']);
const SPEECH_MODES = new Set(['browser', 'audio-file', 'none']);
const LIP_MODES = new Set(['none', 'simulated', 'audio-reactive']);
const AVATAR_MODES = new Set(['image-yokogawa-v1', 'svg-fallback']);
const text = (value, limit = 5000) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const id = (value, fallback = '') => ID.test(value ?? '') ? value : fallback;

export function normalizeAvatar(input = {}) {
  return {
    ...DEFAULT_AVATAR,
    visible: input.visible !== false,
    state: AVATAR_STATES.has(input.state) ? input.state : DEFAULT_AVATAR.state,
    lipSyncMode: LIP_MODES.has(input.lipSyncMode) ? input.lipSyncMode : DEFAULT_AVATAR.lipSyncMode,
    label: text(input.label, 120) || DEFAULT_AVATAR.label,
    mode: AVATAR_MODES.has(input.mode) ? input.mode : DEFAULT_AVATAR.mode,
    assetSetId: AVATAR_ASSET_SETS[input.assetSetId] ? input.assetSetId : DEFAULT_AVATAR.assetSetId,
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
  return {
    id: id(input.id, `asset-${index + 1}`), name: text(input.name, 120) || `Audio ${index + 1}`,
    path: text(input.path, 300), mimeType: ['audio/wav', 'audio/mpeg'].includes(input.mimeType) ? input.mimeType : 'audio/wav',
  };
}

export function isSafeAssetPath(value) {
  if (!value || typeof value !== 'string' || value.includes('..') || value.includes('\\') || value.startsWith('/') || /^[a-zA-Z]:/.test(value)) return false;
  return /^assets\/audio\/[a-zA-Z0-9_.-]+\.(wav|mp3)$/i.test(value);
}

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
  const lipSyncMode = LIP_MODES.has(input.audio?.lipSyncMode) ? input.audio.lipSyncMode : (speechMode === 'audio-file' ? 'audio-reactive' : 'simulated');
  const avatarState = AVATAR_STATES.has(input.avatar?.state) ? input.avatar.state : 'normal';
  const sceneId = id(input.sceneId ?? input.scene, '') || null;
  const result = {
    schemaVersion: SHOW_SCHEMA_VERSION, id: cueId, name: cueName, enabled: input.enabled !== false,
    route: id(input.route, '') || 'main', scene: sceneId, location: text(input.location, 120), kind,
    speechText, displayText, operatorNote: text(input.operatorNote ?? input.notes, 1000), triggerNote: text(input.triggerNote, 500),
    target: normalizeTarget(input.target), presentationPreset: id(input.presentationPreset, '') || 'normal',
    avatar: { visible: input.avatar?.visible !== false, state: avatarState },
    audio: { speechMode, assetId: audioAsset, lipSyncMode },
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
  if (input.schemaVersion !== SHOW_SCHEMA_VERSION) errors.push('UNSUPPORTED_SCHEMA_VERSION');
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
    if (cue.scene && !sceneIds.has(cue.scene)) errors.push(`CUE_SCENE_NOT_FOUND:${cue.id}`);
    if (!presetIds.has(cue.presentationPreset)) errors.push(`CUE_PRESET_NOT_FOUND:${cue.id}`);
    if (cue.target.type === 'group' && !groupIds.has(cue.target.id)) errors.push(`CUE_GROUP_NOT_FOUND:${cue.id}`);
    if (cue.audio.speechMode === 'audio-file' && !assetIds.has(cue.audio.assetId)) errors.push(`CUE_ASSET_NOT_FOUND:${cue.id}`);
    if (['speech-display', 'speech-only'].includes(cue.kind) && cue.audio.speechMode === 'browser' && !cue.speechText) errors.push(`CUE_SPEECH_EMPTY:${cue.id}`);
    if (['speech-display', 'display-only'].includes(cue.kind) && !cue.displayText) errors.push(`CUE_DISPLAY_EMPTY:${cue.id}`);
  }
  for (const [index, raw] of (Array.isArray(input.cues) ? input.cues : []).entries()) {
    const cueId = raw.id ?? raw.cueId ?? index;
    if (raw.kind != null && !CUE_KINDS.includes(raw.kind)) errors.push(`INVALID_CUE_KIND:${cueId}`);
    if (raw.target?.type && !['all', 'display', 'group'].includes(raw.target.type)) errors.push(`INVALID_TARGET:${cueId}`);
    if (raw.avatar?.state && !AVATAR_STATES.has(raw.avatar.state)) errors.push(`INVALID_AVATAR_STATE:${cueId}`);
  }
  if (input.avatar?.mode != null && !AVATAR_MODES.has(input.avatar.mode)) errors.push('INVALID_AVATAR_MODE');
  if (input.avatar?.assetSetId != null && !AVATAR_ASSET_SETS[input.avatar.assetSetId]) errors.push('AVATAR_ASSET_SET_NOT_FOUND');
  for (const asset of assets) if (!isSafeAssetPath(asset.path)) errors.push(`UNSAFE_ASSET_PATH:${asset.id}`);
  return { valid: errors.length === 0, errors: [...new Set(errors)], normalized: { cues, presets, assets } };
}

export function publicCue(cue) {
  if (!cue) return null;
  const { operatorNote, triggerNote, notes, actions, ...safe } = cue;
  return safe;
}
