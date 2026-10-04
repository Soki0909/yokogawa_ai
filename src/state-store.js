import { randomUUID } from 'node:crypto';
import { JsonFileStorage } from './json-storage.js';
import {
  AVATAR_ASSET_SETS, DEFAULT_AVATAR, DEFAULT_PRESETS, SHOW_SCHEMA_VERSION, normalizeAsset, normalizeAvatar, normalizeCue,
  normalizeOverlay, normalizePreset, normalizeTarget, normalizeTransition, normalizeVisual, publicCue, validateShowFile,
} from './show-schema.js';

export const DEFAULT_SETTINGS = Object.freeze({
  rate: 1, pitch: 0.9, volume: 1, voiceURI: '', subtitlesEnabled: true, historyLimit: 100,
  speechProvider: 'browser', freeSpeakMode: 'browser', shortcutsEnabled: true, reducedMotion: false,
});

export const DEFAULT_SCENES = Object.freeze([
  { sceneId: 'scene-opening', sceneName: 'オープニング', order: 1 },
  { sceneId: 'scene-experience', sceneName: '体験授業', order: 2 },
  { sceneId: 'scene-incident', sceneName: '異常発生', order: 3 },
]);

export const DEFAULT_CUES = Object.freeze([
  ['cue-001', '001', 'AI起動', '横川AIシステムを起動します。', 'scene-opening'],
  ['cue-002', '002', '体験授業開始', 'これより体験授業を開始します。', 'scene-experience'],
  ['cue-003', '003', 'プリンキピア説明', 'プリンキピアについて説明します。', 'scene-experience'],
  ['cue-004', '004', '異常検知', 'システムに異常を検知しました。', 'scene-incident'],
  ['cue-005', '005', 'ハッキング開始', '外部からの侵入を確認しました。', 'scene-incident'],
  ['cue-006', '006', 'ロックダウン宣言', '緊急ロックダウンを開始します。', 'scene-incident'],
].map(([cueId, cueNumber, cueName, text, sceneId], order) => normalizeCue({
  cueId, cueNumber, cueName, text, sceneId, order, target: { type: 'all' }, enabled: true,
  displayMode: 'speech', speechProvider: null, audioAsset: null, preDelay: 0, postDelay: 0, actions: [], notes: '',
}, order)));

const TERMINAL = new Set(['completed', 'stopped', 'error']);
const PLAYBACK = new Set(['idle', 'received', 'speaking', ...TERMINAL]);
const safeText = (value) => typeof value === 'string' ? value.trim() : '';
const validId = (value, fallback) => /^[a-zA-Z0-9_-]{1,100}$/.test(value ?? '') ? value : fallback;
const EMPTY_OVERLAY = Object.freeze(normalizeOverlay());
const EMPTY_VISUAL = Object.freeze(normalizeVisual());
const EMPTY_TRANSITION = Object.freeze({ ...normalizeTransition(), status: 'idle', startedAt: null, completedAt: null });
const EMPTY_UNLOCK = Object.freeze({ status: 'idle', progress: 0, startedAt: null, durationMs: 5000, completedAt: null });

export class StateStore {
  constructor({ stateFile, storage, logger = console, now = () => new Date() } = {}) {
    this.logger = logger;
    this.now = now;
    this.storage = storage ?? new JsonFileStorage(stateFile, logger);
    this.state = {
      displayConnectionStatus: 'disconnected', displayAudioReady: false,
      displays: [], audioMasterId: null, currentMessage: null, currentSubtitle: null,
      displayMode: 'ready', playbackStatus: 'idle', queue: [], history: [],
      scenes: structuredClone(DEFAULT_SCENES), cues: structuredClone(DEFAULT_CUES),
      targetGroups: [], adminMode: 'show',
      currentCueIndex: -1, currentSceneId: null, settings: { ...DEFAULT_SETTINGS },
      schemaVersion: SHOW_SCHEMA_VERSION, metadata: { title: '横川AI Show', version: '0.5.0' }, routes: [{ id: 'main', name: 'Main' }],
      presets: structuredClone(DEFAULT_PRESETS), assets: [{ id: 'test-tone', name: '内蔵テスト音', path: 'assets/audio/test-tone.wav', mimeType: 'audio/wav' }],
      avatar: { ...DEFAULT_AVATAR }, currentPresetId: 'normal', currentAvatar: { ...DEFAULT_AVATAR },
      blackout: false, previousVisualState: null, rehearsalSession: null, rehearsalLog: [],
      currentOverlay: structuredClone(EMPTY_OVERLAY), currentVisual: structuredClone(EMPTY_VISUAL),
      currentTransition: structuredClone(EMPTY_TRANSITION), unlock: structuredClone(EMPTY_UNLOCK),
      localTts: { status: 'unknown', profileId: 'yokogawa-professor-v1', engineVersion: null, runtimeStyleId: null, error: null },
    };
  }

  get displayCount() { return this.state.displays.filter((item) => item.online).length; }

  async load() {
    const stored = await this.storage.load();
    if (!stored) return;
    this.state.settings = this.validateSettings(stored.settings ?? {});
    this.state.scenes = this.validateScenes(stored.scenes);
    this.state.cues = this.validateCues(stored.cues);
    this.state.currentSubtitle = typeof stored.currentSubtitle === 'string' ? stored.currentSubtitle : null;
    this.state.displayMode = typeof stored.displayMode === 'string' ? stored.displayMode : 'ready';
    this.state.currentCueIndex = Number.isInteger(stored.currentCueIndex) && stored.currentCueIndex >= -1 && stored.currentCueIndex < this.state.cues.length ? stored.currentCueIndex : -1;
    this.state.currentSceneId = typeof stored.currentSceneId === 'string' ? stored.currentSceneId : null;
    this.state.audioMasterId = typeof stored.audioMasterId === 'string' ? stored.audioMasterId : null;
    this.state.displays = (Array.isArray(stored.displays) ? stored.displays : []).map((display) => ({
      displayId: validId(display.displayId, `display-${randomUUID()}`),
      displayName: safeText(display.displayName).slice(0, 80) || 'Display',
      audioEnabled: display.audioEnabled !== false,
      required: display.required === true,
      groups: Array.isArray(display.groups) ? display.groups.slice(0, 20) : [],
      online: false, audioReady: false, lastHeartbeat: display.lastHeartbeat ?? null,
      currentSubtitle: display.currentSubtitle ?? null, displayMode: display.displayMode ?? 'ready',
      currentPresetId: display.currentPresetId ?? this.state.currentPresetId,
      currentAvatar: display.currentAvatar ?? structuredClone(this.state.currentAvatar), blackout: display.blackout === true,
      currentOverlay: { ...normalizeOverlay(display.currentOverlay), ...(display.currentOverlay?.expiresAt ? { expiresAt: display.currentOverlay.expiresAt } : {}) },
      currentVisual: { ...normalizeVisual(display.currentVisual), ...(display.currentVisual?.expiresAt ? { expiresAt: display.currentVisual.expiresAt } : {}) },
      currentTransition: this.restoreTransition(display.currentTransition), unlock: this.restoreUnlock(display.unlock),
    }));
    this.state.targetGroups = this.validateTargetGroups(stored.targetGroups);
    this.state.metadata = stored.metadata && typeof stored.metadata === 'object' ? stored.metadata : this.state.metadata;
    this.state.routes = Array.isArray(stored.routes) && stored.routes.length ? stored.routes : this.state.routes;
    this.state.presets = Array.isArray(stored.presets) && stored.presets.length ? stored.presets.map(normalizePreset) : structuredClone(DEFAULT_PRESETS);
    this.state.assets = Array.isArray(stored.assets) ? stored.assets.map(normalizeAsset) : this.state.assets;
    this.state.avatar = normalizeAvatar(stored.avatar);
    this.state.currentPresetId = this.state.presets.some((preset) => preset.id === stored.currentPresetId) ? stored.currentPresetId : 'normal';
    this.state.currentAvatar = { ...this.state.avatar, ...(stored.currentAvatar ?? {}) };
    this.state.blackout = stored.blackout === true; this.state.previousVisualState = stored.previousVisualState ?? null;
    this.state.currentOverlay = { ...normalizeOverlay(stored.currentOverlay), ...(stored.currentOverlay?.expiresAt ? { expiresAt: stored.currentOverlay.expiresAt } : {}) };
    this.state.currentVisual = { ...normalizeVisual(stored.currentVisual), ...(stored.currentVisual?.expiresAt ? { expiresAt: stored.currentVisual.expiresAt } : {}) };
    this.state.currentTransition = this.restoreTransition(stored.currentTransition);
    this.state.unlock = this.restoreUnlock(stored.unlock);
    this.state.rehearsalSession = stored.rehearsalSession ?? null;
    this.state.rehearsalLog = Array.isArray(stored.rehearsalLog) ? stored.rehearsalLog.slice(-5000) : [];
    this.state.adminMode = stored.adminMode === 'advanced' ? 'advanced' : 'show';
    const interrupted = new Set(['queued', 'received', 'speaking']);
    this.state.history = (Array.isArray(stored.history) ? stored.history : []).map((item) => interrupted.has(item.status)
      ? { ...item, status: 'error', finishedAt: this.now().toISOString(), error: 'サーバー再起動により発話が中断されました。' }
      : item);
    this.trimHistory();
  }

  snapshot() {
    this.settleTimedPresentation();
    const cues = this.orderedCues();
    const currentCue = this.state.currentCueIndex >= 0 ? cues[this.state.currentCueIndex] ?? null : null;
    const nextCue = cues.slice(this.state.currentCueIndex + 1).find((cue) => cue.enabled) ?? null;
    return structuredClone({ ...this.state, currentCue, nextCue, preflight: this.preflight() });
  }

  displaySnapshot(displayId) {
    this.settleTimedPresentation();
    const display = this.getDisplay(displayId);
    return structuredClone({
      schemaVersion: SHOW_SCHEMA_VERSION, settings: this.state.settings,
      currentSubtitle: display?.currentSubtitle ?? null, displayMode: display?.displayMode ?? 'ready',
      currentPresetId: display?.currentPresetId ?? this.state.currentPresetId,
      currentPreset: this.getPreset(display?.currentPresetId ?? this.state.currentPresetId),
      currentAvatar: display?.currentAvatar ?? this.state.currentAvatar,
      blackout: display?.blackout ?? this.state.blackout,
      currentOverlay: display?.currentOverlay ?? this.state.currentOverlay,
      currentVisual: display?.currentVisual ?? this.state.currentVisual,
      currentTransition: display?.currentTransition ?? this.state.currentTransition,
      unlock: display?.unlock ?? this.state.unlock,
      currentCue: publicCue(this.snapshot().currentCue),
    });
  }

  registerDisplay(input = {}) {
    const displayId = validId(input.displayId, `display-${randomUUID()}`);
    let display = this.state.displays.find((item) => item.displayId === displayId);
    if (!display) {
      display = { displayId, displayName: 'Display', audioEnabled: true, required: false, groups: [], currentSubtitle: this.state.currentSubtitle, displayMode: this.state.displayMode, currentPresetId: this.state.currentPresetId, currentAvatar: structuredClone(this.state.currentAvatar), blackout: this.state.blackout,
        currentOverlay: structuredClone(this.state.currentOverlay), currentVisual: structuredClone(this.state.currentVisual),
        currentTransition: structuredClone(this.state.currentTransition), unlock: structuredClone(this.state.unlock) };
      this.state.displays.push(display);
    }
    Object.assign(display, {
      displayName: safeText(input.displayName).slice(0, 80) || display.displayName,
      audioEnabled: input.audioEnabled !== false,
      required: typeof input.required === 'boolean' ? input.required : display.required === true,
      groups: Array.isArray(input.groups) ? input.groups.filter((group) => validId(group, '')).slice(0, 20) : display.groups,
      online: true, audioReady: false, lastHeartbeat: this.now().toISOString(),
    });
    this.refreshLegacyStatus(); void this.persist(); return display;
  }

  connectDisplay(input = {}) {
    const display = this.registerDisplay({
      displayId: input.displayId ?? `legacy-display-${this.state.displays.length + 1}`,
      displayName: input.displayName ?? 'Display',
      audioEnabled: input.audioEnabled,
    });
    if (!this.state.audioMasterId) this.setAudioMaster(display.displayId);
    return display;
  }

  heartbeat(displayId) {
    const display = this.getDisplay(displayId);
    if (!display) return false;
    display.lastHeartbeat = this.now().toISOString(); display.online = true;
    this.refreshLegacyStatus(); return true;
  }

  markOffline(displayId) {
    const display = this.getDisplay(displayId);
    if (!display) return;
    display.online = false; display.audioReady = false;
    this.refreshLegacyStatus(); void this.persist();
  }

  disconnectDisplay(displayId) {
    const targetId = displayId ?? this.state.displays.find((display) => display.online)?.displayId;
    const wasMaster = targetId === this.state.audioMasterId;
    this.markOffline(targetId);
    if ((wasMaster || this.displayCount === 0) && this.state.currentMessage) {
      this.updateCurrent('error', 'Audio Masterとの接続が切れました。履歴から再実行してください。');
      this.state.currentMessage = null; this.state.playbackStatus = 'error';
      for (const queued of this.state.queue) {
        this.updateHistory(queued.id, { status: 'error', error: 'Display切断によりキューを解除しました。' });
      }
      this.state.queue = []; void this.persist();
    }
  }

  getDisplay(displayId) { return this.state.displays.find((item) => item.displayId === displayId); }

  setDisplayRequired(displayId, required) {
    const display = this.getDisplay(displayId);
    if (!display) throw new Error('DISPLAY_NOT_FOUND');
    display.required = required === true; void this.persist(); return display;
  }

  deleteDisplay(displayId) {
    const display = this.getDisplay(displayId);
    if (!display) throw new Error('DISPLAY_NOT_FOUND');
    if (display.online) throw new Error('DISPLAY_ONLINE');
    this.state.displays = this.state.displays.filter((item) => item.displayId !== displayId);
    for (const group of this.state.targetGroups) group.displayIds = group.displayIds.filter((id) => id !== displayId);
    if (this.state.audioMasterId === displayId) this.state.audioMasterId = null;
    this.refreshLegacyStatus(); void this.persist(); return display;
  }

  setDisplayAudioReady(displayId, ready) {
    if (typeof displayId === 'boolean') {
      ready = displayId;
      displayId = this.state.audioMasterId;
    }
    const display = this.getDisplay(displayId);
    if (display) display.audioReady = display.online && ready === true;
    this.refreshLegacyStatus();
  }

  setAudioMaster(displayId) {
    if (displayId !== null && !this.getDisplay(displayId)) throw new Error('DISPLAY_NOT_FOUND');
    this.state.audioMasterId = displayId; this.refreshLegacyStatus();
    void this.persist(); return displayId;
  }

  refreshLegacyStatus() {
    this.state.displayConnectionStatus = this.displayCount ? 'connected' : 'disconnected';
    const master = this.getDisplay(this.state.audioMasterId);
    this.state.displayAudioReady = Boolean(master?.online && master.audioEnabled && master.audioReady);
  }

  matchesTarget(display, target) {
    if (target.type === 'all') return true;
    if (target.type === 'display') return display.displayId === target.id;
    if (target.type !== 'group') return false;
    const group = this.getTargetGroup(target.id);
    return group ? group.enabled && group.displayIds.includes(display.displayId) : display.groups.includes(target.id);
  }

  getTargetGroup(groupId) { return this.state.targetGroups.find((group) => group.id === groupId); }

  saveTargetGroup(input = {}) {
    const id = validId(input.id, input.id ? '' : `group-${randomUUID()}`);
    if (!id) throw new Error('INVALID_GROUP');
    const existing = this.getTargetGroup(id);
    const displayIds = [...new Set(Array.isArray(input.displayIds) ? input.displayIds.filter((displayId) => validId(displayId, '')) : [])];
    if (displayIds.some((displayId) => !this.getDisplay(displayId))) throw new Error('DISPLAY_NOT_FOUND');
    const group = {
      id, name: safeText(input.name).slice(0, 120) || '名称未設定', displayIds,
      enabled: input.enabled !== false, notes: safeText(input.notes).slice(0, 500),
    };
    if (existing) Object.assign(existing, group); else this.state.targetGroups.push(group);
    void this.persist(); return group;
  }

  deleteTargetGroup(groupId) {
    if (!this.getTargetGroup(groupId)) throw new Error('GROUP_NOT_FOUND');
    if (this.state.cues.some((cue) => cue.target?.type === 'group' && cue.target.id === groupId)) throw new Error('GROUP_IN_USE');
    this.state.targetGroups = this.state.targetGroups.filter((group) => group.id !== groupId);
    void this.persist();
  }

  setAdminMode(mode) {
    if (!['show', 'advanced'].includes(mode)) throw new Error('INVALID_MODE');
    this.state.adminMode = mode; void this.persist(); return mode;
  }

  preflight() {
    const items = [];
    const add = (id, label, status, detail) => items.push({ id, label, status, detail });
    add('server', 'サーバー', 'ok', '正常稼働中');
    add('cues', 'Cueデータ', this.state.cues.length ? 'ok' : 'error', `${this.state.cues.length}件`);
    const showValidation = validateShowFile(this.exportShowFile());
    add('show-schema', `Show File Schema v${SHOW_SCHEMA_VERSION}`, showValidation.valid ? 'ok' : 'error', showValidation.valid ? '参照整合性OK' : showValidation.errors.join(', '));
    add('presets', 'Presentation Preset', this.state.presets.length >= 6 ? 'ok' : 'warning', `${this.state.presets.length}件`);
    const avatarAssetsReady = Boolean(AVATAR_ASSET_SETS[this.state.avatar?.assetSetId]);
    add('avatar', 'AI Avatar', !avatarAssetsReady ? 'error' : this.state.avatar?.visible !== false ? 'ok' : 'warning', `${this.state.avatar?.mode ?? 'svg-fallback'} / ${this.state.avatar?.assetSetId ?? 'none'} / ${this.state.avatar?.lipSyncMode ?? 'simulated'}`);
    const audioCues = this.state.cues.filter((cue) => cue.audio?.speechMode === 'audio-file');
    add('audio-assets', 'ローカル音声Asset', audioCues.every((cue) => this.state.assets.some((asset) => asset.id === cue.audio.assetId)) ? 'ok' : 'error', `${audioCues.length} Cue / ${this.state.assets.length} Asset`);
    const localTtsRequired = this.state.settings.freeSpeakMode === 'local-tts' || this.state.cues.some((cue) => cue.audio?.speechMode === 'local-tts');
    if (localTtsRequired) add('local-tts', 'AivisSpeech / Local TTS', this.state.localTts.status === 'ready' ? 'ok' : 'error', this.state.localTts.status === 'ready'
      ? `${this.state.localTts.profileId} / ${this.state.localTts.engineVersion} / Style ${this.state.localTts.runtimeStyleId}`
      : `${this.state.localTts.profileId}: ${this.state.localTts.error ?? 'Engine未確認'}`);
    add('position', 'Cue位置', this.state.currentCueIndex < 0 ? 'ok' : 'warning', this.state.currentCueIndex < 0 ? '開始位置' : `Cue ${this.orderedCues()[this.state.currentCueIndex]?.cueNumber ?? '—'} から再開`);
    const registered = this.state.displays.length;
    const online = this.displayCount;
    add('displays', 'Display接続', online ? (online === registered ? 'ok' : 'warning') : 'error', `${online} ONLINE / ${registered} REGISTERED`);
    for (const display of this.state.displays) {
      const status = display.online ? 'ok' : display.required ? 'error' : 'warning';
      add(`display:${display.displayId}`, `${display.required ? '必須' : '任意'}: ${display.displayName}`, status, display.online ? 'ONLINE' : 'OFFLINE');
    }
    const master = this.getDisplay(this.state.audioMasterId);
    if (!this.state.audioMasterId) add('audio-master', 'Audio Master', 'error', '未設定');
    else if (!master?.online) add('audio-master', 'Audio Master', 'error', `${master?.displayName ?? this.state.audioMasterId} OFFLINE`);
    else add('audio-master', 'Audio Master', 'ok', `${master.displayName} ONLINE`);
    if (master?.online) add('audio-ready', 'Audio Ready', master.audioEnabled && master.audioReady ? 'ok' : 'warning', master.audioEnabled && master.audioReady ? '音声有効化済み' : '音声未有効');
    for (const group of this.state.targetGroups) {
      if (!group.enabled) add(`group-disabled:${group.id}`, `配信先: ${group.name}`, 'warning', '無効');
      if (!group.displayIds.length) add(`group-empty:${group.id}`, `配信先: ${group.name}`, 'warning', '対象Displayなし');
      const missing = group.displayIds.filter((id) => !this.getDisplay(id));
      if (missing.length) add(`group:${group.id}`, `配信先: ${group.name}`, 'warning', `不明なDisplay ${missing.length}件`);
      const requiredOffline = group.displayIds.map((id) => this.getDisplay(id)).filter((display) => display?.required && !display.online);
      if (requiredOffline.length) add(`group-required:${group.id}`, `配信先: ${group.name}`, 'error', `必須Display OFFLINE: ${requiredOffline.map((display) => display.displayName).join(', ')}`);
    }
    const errors = items.filter((item) => item.status === 'error').length;
    const warnings = items.filter((item) => item.status === 'warning').length;
    return { status: errors ? 'not-ready' : warnings ? 'warning' : 'ready', canStart: errors === 0, errors, warnings, items };
  }

  createMessage(text, { replayOf = null, source = 'free', cue = null, target = { type: 'all' }, audio = null, kind = null, displayText = null, speechProvider = null } = {}) {
    const normalized = safeText(text);
    if (!normalized) throw new Error('EMPTY_TEXT');
    if (normalized.length > 5000) throw new Error('TEXT_TOO_LONG');
    const message = {
      id: `msg-${randomUUID()}`, text: normalized, createdAt: this.now().toISOString(), status: 'queued',
      source, target: normalizeTarget(target), speechProvider: speechProvider ?? cue?.speechProvider ?? this.state.settings.speechProvider,
      ...(cue ? { cueId: cue.cueId, cueName: cue.cueName, kind: cue.kind, displayText: cue.displayText,
        presentationPreset: cue.presentationPreset, avatar: cue.avatar, audio: cue.audio,
        transition: cue.transition, overlay: cue.overlay, visual: cue.visual, timing: cue.timing } : {}),
      ...(!cue && kind ? { kind } : {}), ...(!cue && displayText ? { displayText } : {}), ...(!cue && audio ? { audio } : {}),
      ...(replayOf ? { replayOf } : {}),
    };
    this.state.history.unshift(message); this.trimHistory(); return message;
  }

  enqueue(message) {
    if (!this.state.currentMessage) {
      this.state.currentMessage = message; this.state.playbackStatus = 'received';
      this.updateHistory(message.id, { status: 'received' }); return { dispatch: message, queued: false };
    }
    this.state.queue.push(message); void this.persist(); return { dispatch: null, queued: true };
  }

  reportPlayback(id, status, error) {
    if (!PLAYBACK.has(status)) throw new Error('INVALID_STATUS');
    if (!this.state.currentMessage || this.state.currentMessage.id !== id) return { accepted: false, next: null };
    this.updateCurrent(status, error);
    if (!TERMINAL.has(status)) return { accepted: true, next: null };
    this.state.currentMessage = null;
    if (status === 'error') {
      for (const queued of this.state.queue) this.updateHistory(queued.id, { status: 'error', error: 'TTSエラーによりキューを解除しました。' });
      this.state.queue = []; void this.persist(); return { accepted: true, next: null };
    }
    const next = this.state.queue.shift() ?? null;
    if (next) {
      this.state.currentMessage = next; this.state.playbackStatus = 'received';
      this.updateHistory(next.id, { status: 'received' });
    } else this.state.playbackStatus = status;
    void this.persist(); return { accepted: true, next };
  }

  updateCurrent(status, error) {
    this.state.playbackStatus = status;
    const patch = { status };
    if (status === 'speaking') patch.startedAt = this.now().toISOString();
    if (TERMINAL.has(status)) patch.finishedAt = this.now().toISOString();
    if (error) patch.error = String(error).slice(0, 500);
    this.updateHistory(this.state.currentMessage.id, patch);
  }

  updateHistory(id, patch) {
    const item = this.state.history.find((entry) => entry.id === id);
    if (item) Object.assign(item, patch);
  }

  executeCue(cueId) {
    const cues = this.orderedCues();
    const index = cues.findIndex((cue) => cue.cueId === cueId);
    if (index < 0) throw new Error('CUE_NOT_FOUND');
    const cue = cues[index];
    if (!cue.enabled) throw new Error('CUE_DISABLED');
    this.state.currentCueIndex = index; this.state.currentSceneId = cue.sceneId ?? null;
    const action = this.applyCue(cue);
    const needsSpeech = ['speech-display', 'speech-only'].includes(cue.kind) && cue.audio.speechMode !== 'none';
    const message = needsSpeech ? this.createMessage(cue.speechText || cue.displayText || cue.cueName, { source: 'cue', cue, target: cue.target }) : null;
    return { cue, action, message };
  }

  nextCue() {
    const cue = this.orderedCues().slice(this.state.currentCueIndex + 1).find((item) => item.enabled);
    if (!cue) throw new Error('NO_NEXT_CUE');
    return this.executeCue(cue.cueId);
  }

  backCue() {
    const cues = this.orderedCues();
    for (let index = this.state.currentCueIndex - 1; index >= 0; index -= 1) {
      if (!cues[index].enabled) continue;
      this.state.currentCueIndex = index; this.state.currentSceneId = cues[index].sceneId ?? null;
      return cues[index];
    }
    this.state.currentCueIndex = -1; this.state.currentSceneId = null; return null;
  }

  replayCue() {
    const cue = this.orderedCues()[this.state.currentCueIndex];
    if (!cue) throw new Error('NO_CURRENT_CUE');
    const original = this.state.history.find((item) => item.cueId === cue.cueId);
    const action = this.applyCue(cue);
    const needsSpeech = ['speech-display', 'speech-only'].includes(cue.kind) && cue.audio.speechMode !== 'none';
    const message = needsSpeech ? this.createMessage(cue.speechText || cue.displayText || cue.cueName, { source: 'cue', cue, target: cue.target, replayOf: original?.id }) : null;
    return { cue, action, message };
  }

  saveCue(input) {
    const cueId = validId(input.cueId, `cue-${randomUUID()}`);
    const existing = this.state.cues.find((cue) => cue.cueId === cueId);
    const cue = normalizeCue({ ...(existing ?? {}), ...input, cueId, order: Number.isFinite(Number(input.order)) ? Number(input.order) : (existing?.order ?? this.state.cues.length) }, existing?.order ?? this.state.cues.length);
    if (['speech-display', 'speech-only'].includes(cue.kind) && cue.audio.speechMode === 'browser' && !cue.speechText) throw new Error('EMPTY_TEXT');
    if (['speech-display', 'display-only'].includes(cue.kind) && !cue.displayText) throw new Error('EMPTY_TEXT');
    if (existing) Object.assign(existing, cue); else this.state.cues.push(cue);
    this.reindexCues(); void this.persist(); return cue;
  }

  reorderCues(cueIds) {
    if (!Array.isArray(cueIds)) throw new Error('INVALID_ORDER');
    const currentId = this.orderedCues()[this.state.currentCueIndex]?.cueId;
    const positions = new Map(cueIds.map((id, index) => [id, index]));
    this.state.cues.forEach((cue) => { if (positions.has(cue.cueId)) cue.order = positions.get(cue.cueId); });
    this.reindexCues(); void this.persist();
    if (currentId) this.state.currentCueIndex = this.orderedCues().findIndex((cue) => cue.cueId === currentId);
  }

  jumpScene(sceneId) {
    if (!this.state.scenes.some((scene) => scene.sceneId === sceneId)) throw new Error('SCENE_NOT_FOUND');
    this.state.currentSceneId = sceneId;
    const index = this.orderedCues().findIndex((cue) => cue.sceneId === sceneId);
    this.state.currentCueIndex = index > 0 ? index - 1 : -1;
    return this.snapshot();
  }

  jumpCue(cueId) {
    const cues = this.orderedCues();
    const index = cues.findIndex((cue) => cue.cueId === cueId);
    if (index < 0) throw new Error('CUE_NOT_FOUND');
    this.state.currentCueIndex = index;
    this.state.currentSceneId = cues[index].sceneId ?? null;
    this.logRehearsal('cue-jump', 'Cue位置移動', { cueId, executed: false });
    void this.persist();
    return cues[index];
  }

  showReset() {
    if (this.state.currentMessage) this.updateCurrent('stopped');
    for (const queued of this.state.queue) this.updateHistory(queued.id, { status: 'stopped', finishedAt: this.now().toISOString() });
    this.state.currentMessage = null; this.state.queue = []; this.state.playbackStatus = 'idle';
    this.state.currentCueIndex = -1; this.state.currentSceneId = null;
    this.state.currentSubtitle = null; this.state.displayMode = 'ready';
    this.state.currentPresetId = 'normal'; this.state.currentAvatar = { ...this.state.avatar }; this.state.blackout = false; this.state.previousVisualState = null;
    this.state.currentOverlay = structuredClone(EMPTY_OVERLAY); this.state.currentVisual = structuredClone(EMPTY_VISUAL);
    this.state.currentTransition = structuredClone(EMPTY_TRANSITION); this.state.unlock = structuredClone(EMPTY_UNLOCK);
    for (const display of this.state.displays) { Object.assign(display, { currentSubtitle: null, displayMode: 'ready', currentPresetId: 'normal', currentAvatar: { ...this.state.avatar }, blackout: false,
      currentOverlay: structuredClone(EMPTY_OVERLAY), currentVisual: structuredClone(EMPTY_VISUAL),
      currentTransition: structuredClone(EMPTY_TRANSITION), unlock: structuredClone(EMPTY_UNLOCK) }); }
    this.logRehearsal('show-reset', 'SHOW RESET');
    void this.persist();
  }

  getPreset(presetId) { return this.state.presets.find((preset) => preset.id === presetId) ?? this.state.presets[0] ?? null; }

  restoreTransition(input = {}) {
    const normalized = normalizeTransition(input);
    return { ...normalized, status: ['idle', 'active', 'completed', 'stopped'].includes(input?.status) ? input.status : 'idle',
      startedAt: input?.startedAt ?? null, completedAt: input?.completedAt ?? null };
  }

  restoreUnlock(input = {}) {
    return {
      status: ['idle', 'running', 'completed', 'stopped', 'aborted'].includes(input?.status) ? input.status : 'idle',
      progress: Number.isFinite(Number(input?.progress)) ? Math.min(100, Math.max(0, Number(input.progress))) : 0,
      startedAt: input?.startedAt ?? null,
      durationMs: Number.isFinite(Number(input?.durationMs)) ? Math.min(10_000, Math.max(3000, Number(input.durationMs))) : 5000,
      completedAt: input?.completedAt ?? null,
    };
  }

  settlePresentation(presentation) {
    const nowMs = this.now().getTime();
    if (presentation.currentTransition?.status === 'active' && presentation.currentTransition.startedAt) {
      const end = Date.parse(presentation.currentTransition.startedAt) + presentation.currentTransition.durationMs;
      if (nowMs >= end) Object.assign(presentation.currentTransition, { status: 'completed', completedAt: new Date(end).toISOString() });
    }
    if (presentation.unlock?.status === 'running' && presentation.unlock.startedAt) {
      const elapsed = nowMs - Date.parse(presentation.unlock.startedAt);
      presentation.unlock.progress = Math.min(100, Math.max(0, elapsed / presentation.unlock.durationMs * 100));
      if (presentation.unlock.progress >= 100) Object.assign(presentation.unlock, { status: 'completed', progress: 100, completedAt: new Date(Date.parse(presentation.unlock.startedAt) + presentation.unlock.durationMs).toISOString() });
    }
    if (presentation.currentOverlay?.expiresAt && nowMs >= Date.parse(presentation.currentOverlay.expiresAt)) presentation.currentOverlay = structuredClone(EMPTY_OVERLAY);
    if (presentation.currentVisual?.expiresAt && nowMs >= Date.parse(presentation.currentVisual.expiresAt)) presentation.currentVisual = structuredClone(EMPTY_VISUAL);
  }

  settleTimedPresentation() {
    this.settlePresentation(this.state);
    for (const display of this.state.displays) this.settlePresentation(display);
  }

  stopPresentation(target = { type: 'all' }, status = 'stopped') {
    this.settleTimedPresentation();
    const stop = (presentation) => {
      if (presentation.currentTransition?.status === 'active') presentation.currentTransition.status = 'stopped';
      if (presentation.unlock?.status === 'running') presentation.unlock.status = status === 'aborted' ? 'aborted' : 'stopped';
    };
    stop(this.state);
    for (const display of this.state.displays) if (this.matchesTarget(display, target)) stop(display);
    void this.persist();
  }

  applyCue(cue) {
    const startedAt = this.now().toISOString();
    const transition = { ...cue.transition, status: cue.transition.id === 'none' ? 'idle' : 'active', startedAt: cue.transition.id === 'none' ? null : startedAt, completedAt: null };
    const overlay = { ...cue.overlay, ...(cue.timing.autoClearOverlayMs != null && cue.overlay.visible ? { expiresAt: new Date(this.now().getTime() + cue.timing.autoClearOverlayMs).toISOString() } : {}) };
    const visual = { ...cue.visual, ...(cue.timing.autoHideVisualMs != null && cue.visual.visible ? { expiresAt: new Date(this.now().getTime() + cue.timing.autoHideVisualMs).toISOString() } : {}) };
    const startsUnlock = cue.transition.id === 'unlock-start';
    const holdsUnlock = cue.overlay.id === 'unlocking' && !startsUnlock;
    const abortsUnlock = ['emergency-protection', 'unlock-aborted', 'connection-failed'].includes(cue.overlay.id) || cue.transition.id === 'emergency-interrupt';
    let unlock = structuredClone(EMPTY_UNLOCK);
    if (startsUnlock) unlock = { status: 'running', progress: 0, startedAt, durationMs: cue.timing.unlockDurationMs, completedAt: null };
    else if (holdsUnlock) {
      const progress = Math.min(100, Math.max(0, Number(cue.overlay.progress) || Number(this.state.unlock.progress) || 0));
      unlock = { status: progress >= 100 ? 'completed' : 'running', progress, startedAt: null, durationMs: 0, completedAt: progress >= 100 ? startedAt : null };
    } else if (abortsUnlock) {
      this.settleTimedPresentation(); unlock = { ...this.state.unlock, status: 'aborted' };
    }
    const action = { kind: cue.kind, target: cue.target, displayText: cue.displayText, presentationPreset: cue.presentationPreset, avatar: cue.avatar, blackout: cue.kind === 'blackout', transition, overlay, visual, unlock };
    if (cue.kind === 'blackout' && !this.state.blackout) this.state.previousVisualState = { currentSubtitle: this.state.currentSubtitle, currentPresetId: this.state.currentPresetId, currentAvatar: this.state.currentAvatar };
    if (cue.kind === 'clear') this.state.currentSubtitle = null;
    else if (['speech-display', 'display-only'].includes(cue.kind)) this.state.currentSubtitle = cue.displayText;
    if (cue.kind !== 'blackout') this.state.currentPresetId = cue.presentationPreset;
    this.state.currentAvatar = { ...this.state.currentAvatar, ...cue.avatar, lipSyncMode: cue.audio.lipSyncMode };
    this.state.currentTransition = structuredClone(transition); this.state.currentOverlay = structuredClone(overlay);
    this.state.currentVisual = structuredClone(visual); this.state.unlock = structuredClone(unlock);
    if (cue.kind === 'blackout') this.state.blackout = true;
    for (const display of this.state.displays) {
      if (!this.matchesTarget(display, cue.target)) continue;
      if (cue.kind === 'clear') display.currentSubtitle = null;
      else if (['speech-display', 'display-only'].includes(cue.kind)) display.currentSubtitle = cue.displayText;
      if (cue.kind !== 'blackout') display.currentPresetId = cue.presentationPreset;
      display.currentAvatar = { ...this.state.currentAvatar }; display.blackout = cue.kind === 'blackout' ? true : display.blackout;
      display.currentTransition = structuredClone(transition); display.currentOverlay = structuredClone(overlay);
      display.currentVisual = structuredClone(visual); display.unlock = structuredClone(unlock);
      display.displayMode = cue.kind;
    }
    this.state.displayMode = cue.kind; this.logRehearsal('cue', `${cue.cueNumber} ${cue.cueName}`, { cueId: cue.cueId, cueName: cue.cueName, route: cue.route, scene: cue.scene, location: cue.location, target: cue.target, preset: cue.presentationPreset, speechMode: cue.audio.speechMode, kind: cue.kind, result: 'success' });
    void this.persist(); return action;
  }

  clearBlackout() {
    const previous = this.state.previousVisualState ?? { currentSubtitle: null, currentPresetId: 'normal', currentAvatar: { ...DEFAULT_AVATAR } };
    Object.assign(this.state, previous, { blackout: false, previousVisualState: null });
    for (const display of this.state.displays) Object.assign(display, previous, { blackout: false });
    this.logRehearsal('blackout-clear', 'BLACKOUT解除'); void this.persist(); return previous;
  }

  savePreset(input) {
    const preset = normalizePreset(input, this.state.presets.length);
    const existing = this.state.presets.find((item) => item.id === preset.id);
    if (existing) Object.assign(existing, preset); else this.state.presets.push(preset);
    void this.persist(); return preset;
  }

  deletePreset(presetId) {
    if (DEFAULT_PRESETS.some((preset) => preset.id === presetId)) throw new Error('PRESET_PROTECTED');
    if (this.state.cues.some((cue) => cue.presentationPreset === presetId)) throw new Error('PRESET_IN_USE');
    this.state.presets = this.state.presets.filter((preset) => preset.id !== presetId); void this.persist();
  }

  exportShowFile() {
    return structuredClone({ schemaVersion: SHOW_SCHEMA_VERSION, metadata: this.state.metadata, routes: this.state.routes,
      scenes: this.state.scenes, cues: this.state.cues, groups: this.state.targetGroups, presets: this.state.presets,
      avatar: this.state.avatar, assets: this.state.assets, settings: this.state.settings });
  }

  importShowFile(input, { apply = false } = {}) {
    const result = validateShowFile(input);
    if (!result.valid || !apply) return { valid: result.valid, errors: result.errors, summary: { cues: result.normalized?.cues.length ?? 0, presets: result.normalized?.presets.length ?? 0, assets: result.normalized?.assets.length ?? 0 } };
    const next = { metadata: structuredClone(input.metadata ?? {}), routes: structuredClone(input.routes ?? [{ id: 'main', name: 'Main' }]),
      scenes: this.validateScenes(input.scenes), cues: result.normalized.cues, targetGroups: this.validateTargetGroups(input.groups),
      presets: result.normalized.presets, assets: result.normalized.assets, avatar: normalizeAvatar(input.avatar), settings: this.validateSettings(input.settings ?? {}) };
    Object.assign(this.state, next); this.showReset(); this.logRehearsal('show-import', 'Show File適用', { cues: next.cues.length }); void this.persist();
    return { valid: true, errors: [], applied: true, summary: { cues: next.cues.length, presets: next.presets.length, assets: next.assets.length } };
  }

  startRehearsal() { this.state.rehearsalSession = { id: `session-${randomUUID()}`, startedAt: this.now().toISOString(), active: true }; this.state.rehearsalLog = []; this.logRehearsal('session-start', 'リハーサル開始'); void this.persist(); return this.state.rehearsalSession; }
  stopRehearsal() { if (this.state.rehearsalSession) { this.logRehearsal('session-stop', 'リハーサル終了'); this.state.rehearsalSession.active = false; this.state.rehearsalSession.endedAt = this.now().toISOString(); void this.persist(); } return this.state.rehearsalSession; }
  logRehearsal(type, label, detail = {}) { if (!this.state.rehearsalSession?.active && !['session-start'].includes(type)) return; this.state.rehearsalLog.push({ timestamp: this.now().toISOString(), elapsedMs: this.state.rehearsalSession ? Math.max(0, this.now().getTime() - Date.parse(this.state.rehearsalSession.startedAt)) : 0, type, label, detail }); this.state.rehearsalLog = this.state.rehearsalLog.slice(-5000); }

  applyDisplayState(message) {
    const displayText = message.displayText ?? message.text;
    this.state.currentSubtitle = displayText; this.state.displayMode = 'speech';
    for (const display of this.state.displays) {
      if (!this.matchesTarget(display, message.target)) continue;
      display.currentSubtitle = displayText; display.displayMode = 'speech';
    }
  }

  validateSettings(input) {
    const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
    return {
      rate: number(input.rate, 1, .5, 2), pitch: number(input.pitch, .9, 0, 2),
      volume: number(input.volume, 1, 0, 1),
      voiceURI: typeof input.voiceURI === 'string' ? input.voiceURI.slice(0, 300) : '',
      subtitlesEnabled: input.subtitlesEnabled !== false,
      historyLimit: Math.round(number(input.historyLimit, 100, 20, 500)),
      speechProvider: safeText(input.speechProvider) || 'browser',
      freeSpeakMode: ['browser', 'local-tts'].includes(input.freeSpeakMode) ? input.freeSpeakMode : 'browser',
      shortcutsEnabled: input.shortcutsEnabled !== false, reducedMotion: input.reducedMotion === true,
    };
  }

  setSettings(patch) {
    this.state.settings = this.validateSettings({ ...this.state.settings, ...patch });
    this.trimHistory(); void this.persist(); return this.state.settings;
  }

  setLocalTtsStatus(status = {}) {
    this.state.localTts = { ...this.state.localTts, ...status };
    return this.state.localTts;
  }

  validateScenes(input) {
    return Array.isArray(input) && input.length
      ? input.map((scene, order) => ({ sceneId: validId(scene.sceneId, `scene-${order + 1}`), sceneName: safeText(scene.sceneName) || `Scene ${order + 1}`, order: Number(scene.order) || order }))
      : structuredClone(DEFAULT_SCENES);
  }

  validateCues(input) {
    return Array.isArray(input) && input.length
      ? input.map((cue, order) => normalizeCue({ ...cue, cueId: validId(cue.cueId ?? cue.id, `cue-${randomUUID()}`) }, order))
      : structuredClone(DEFAULT_CUES);
  }

  validateTargetGroups(input) {
    if (!Array.isArray(input)) return [];
    const seen = new Set();
    return input.flatMap((group) => {
      const id = validId(group?.id, '');
      if (!id || seen.has(id)) return [];
      seen.add(id);
      return [{
        id, name: safeText(group.name).slice(0, 120) || id,
        displayIds: [...new Set(Array.isArray(group.displayIds) ? group.displayIds.filter((displayId) => validId(displayId, '')) : [])],
        enabled: group.enabled !== false, notes: safeText(group.notes).slice(0, 500),
      }];
    });
  }

  orderedCues() { return [...this.state.cues].sort((a, b) => a.order - b.order); }
  reindexCues() { this.state.cues = this.orderedCues().map((cue, order) => ({ ...cue, order })); }
  trimHistory() { this.state.history = this.state.history.slice(0, this.state.settings.historyLimit); }

  async persist() {
    return this.storage.save({
      settings: this.state.settings, history: this.state.history,
      displays: this.state.displays.map((display) => ({ ...display, online: false, audioReady: false })),
      audioMasterId: this.state.audioMasterId, scenes: this.state.scenes, cues: this.state.cues,
      targetGroups: this.state.targetGroups, adminMode: this.state.adminMode,
      metadata: this.state.metadata, routes: this.state.routes, presets: this.state.presets, assets: this.state.assets,
      avatar: this.state.avatar, currentPresetId: this.state.currentPresetId, currentAvatar: this.state.currentAvatar,
      currentSubtitle: this.state.currentSubtitle, displayMode: this.state.displayMode,
      currentCueIndex: this.state.currentCueIndex, currentSceneId: this.state.currentSceneId,
      blackout: this.state.blackout, previousVisualState: this.state.previousVisualState,
      currentOverlay: this.state.currentOverlay, currentVisual: this.state.currentVisual,
      currentTransition: this.state.currentTransition, unlock: this.state.unlock,
      rehearsalSession: this.state.rehearsalSession, rehearsalLog: this.state.rehearsalLog,
    });
  }
}
