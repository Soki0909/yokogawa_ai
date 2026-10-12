import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import QRCode from 'qrcode';
import { StateStore, canonicalPresentationState } from './state-store.js';
import { CueScheduler } from './cue-scheduler.js';
import { createLogger } from './logger.js';
import { accessUrls, connectionInfo } from './network.js';
import { createTestToneWav, productionAudioPreloadManifest, resolveLocalAsset } from './local-audio.js';
import { loadProductionVoiceProfile } from './voice-profile.js';
import { AivisSpeechClient } from './tts/aivis-speech-client.js';
import { RuntimeAudioCache } from './tts/runtime-audio-cache.js';
import { LocalTtsService } from './tts/local-tts-service.js';
import { installProductionTools } from './audio/production-tools.js';
import { subtitleUnits } from '../public/js/subtitle-units.js';
import { resolveProductionSlots, applyProductionSlots } from './production-asset-slots.js';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDirectory, '..');
const publicDirectory = path.join(projectRoot, 'public');
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '0.0.0.0';
const environment = process.env.NODE_ENV ?? 'production';
const singlePcMode = ['127.0.0.1', 'localhost', '::1'].includes(host);
const runtimeConnectionInfo = () => singlePcMode
  ? { local: { admin: `http://localhost:${port}/admin`, display: `http://localhost:${port}/display` }, candidates: [] }
  : connectionInfo(port);
const heartbeatTimeoutMs = Number.parseInt(process.env.HEARTBEAT_TIMEOUT_MS ?? '7000', 10);
const logger = createLogger(process.env.LOG_DIRECTORY ?? path.join(projectRoot, 'logs'));
const store = new StateStore({ stateFile: process.env.STATE_FILE ?? path.join(projectRoot, 'data', 'state.json'), logger });
await store.load();
const bundledProductionShow = JSON.parse(await fs.readFile(path.join(projectRoot, 'shows/production.json'), 'utf8'));
if (process.env.SHOW_STARTUP_MODE !== 'saved') store.importShowFile(bundledProductionShow, { apply: true });
else store.stabilizePresentation(); // Explicit recovery mode never resumes pending audio or transient timelines.
let productionSlots = await resolveProductionSlots(publicDirectory);
applyProductionSlots(store, productionSlots);
const voiceProfile = await loadProductionVoiceProfile();
const runtimeAudioCache = new RuntimeAudioCache();
const localTtsService = new LocalTtsService({ client: new AivisSpeechClient(), profile: voiceProfile, cache: runtimeAudioCache });
store.setLocalTtsStatus(localTtsService.status());

async function refreshLocalTtsStatus() {
  const status = await localTtsService.preflight();
  store.setLocalTtsStatus({ ...status, activity: localTtsService.active ? 'synthesizing' : 'idle' });
  broadcastState();
  return status;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));
app.use((_request, response, next) => {
  response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.static(publicDirectory, { extensions: ['html'] }));
app.get('/', (_request, response) => response.redirect('/admin'));
app.get('/health', (_request, response) => response.json({
  ok: true, displayConnected: store.displayCount > 0, displays: store.displayCount,
  environment, uptimeSeconds: Math.round(process.uptime()), memoryRssBytes: process.memoryUsage().rss,
}));
app.get('/api/connection-info', (_request, response) => response.json(runtimeConnectionInfo()));
app.get('/api/show-file', (_request, response) => {
  response.setHeader('Content-Disposition', 'attachment; filename="yokogawa-show-v3.json"');
  response.json(store.exportShowFile());
});
app.post('/api/show-file/validate', (request, response) => response.json(store.importShowFile(request.body, { apply: false })));
app.post('/api/show-file/import', (request, response) => {
  cueScheduler.cancel();
  const result = store.importShowFile(request.body, { apply: true });
  response.status(result.valid ? 200 : 422).json(result);
  if (result.valid) applyProductionSlots(store, productionSlots);
  if (result.valid) broadcastState();
});
app.get('/api/rehearsal.json', (_request, response) => {
  response.setHeader('Content-Disposition', 'attachment; filename="rehearsal-log.json"');
  response.json({ session: store.state.rehearsalSession, events: store.state.rehearsalLog });
});
app.get('/api/rehearsal.csv', (_request, response) => {
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [['timestamp', 'elapsedMs', 'type', 'label', 'detail'], ...store.state.rehearsalLog.map((item) => [item.timestamp, item.elapsedMs, item.type, item.label, JSON.stringify(item.detail)])];
  response.setHeader('Content-Disposition', 'attachment; filename="rehearsal-log.csv"'); response.type('text/csv').send('\ufeff' + rows.map((row) => row.map(quote).join(',')).join('\r\n'));
});
app.get('/api/audio-assets', (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  const assets = productionAudioPreloadManifest(store.state.assets);
  return response.json({ assets, expectedCount: assets.length });
});
app.get('/api/production-slots', async (_request, response) => {
  productionSlots = await resolveProductionSlots(publicDirectory);
  applyProductionSlots(store, productionSlots);
  response.setHeader('Cache-Control', 'no-store'); response.json({ slots: productionSlots });
  broadcastState(); forRole('display', (socket, client) => displayState(socket, client.displayId));
});
app.get('/api/assets/:assetId', (request, response) => {
  const asset = store.state.assets.find((item) => item.id === request.params.assetId);
  if (!asset) return response.status(404).json({ error: 'ASSET_NOT_FOUND' });
  response.setHeader('Cache-Control', asset.slot ? 'no-store' : 'public, max-age=3600'); response.type(asset.mimeType);
  if (asset.id === 'test-tone') return response.send(createTestToneWav());
  try { return response.sendFile(resolveLocalAsset(publicDirectory, asset)); }
  catch { return response.status(400).json({ error: 'UNSAFE_ASSET_PATH' }); }
});
app.get('/api/runtime-audio/:id', (request, response) => {
  const entry = runtimeAudioCache.get(request.params.id);
  if (!entry) return response.status(404).json({ error: 'RUNTIME_AUDIO_NOT_FOUND' });
  response.setHeader('Content-Type', 'audio/wav');
  response.setHeader('Content-Length', entry.bytes);
  response.setHeader('Cache-Control', 'no-store');
  return response.send(entry.buffer);
});
app.get('/api/local-tts/status', async (_request, response) => {
  const status = await refreshLocalTtsStatus();
  response.status(status.status === 'ready' ? 200 : 503).json(status);
});
app.get('/api/qr', async (request, response) => {
  const requestedUrl = typeof request.query.url === 'string' ? request.query.url : '';
  const info = runtimeConnectionInfo();
  const allowed = new Set([
    info.local.admin, info.local.display,
    ...info.candidates.filter((candidate) => candidate.usable).flatMap((candidate) => [candidate.adminUrl, candidate.displayUrl]),
  ]);
  if (!allowed.has(requestedUrl)) return response.status(400).json({ error: 'INVALID_QR_URL' });
  try {
    const svg = await QRCode.toString(requestedUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, width: 240 });
    response.setHeader('Cache-Control', 'no-store');
    response.type('image/svg+xml').send(svg);
  } catch (error) {
    logger.error('QRコードを生成できません', error); response.status(500).json({ error: 'QR_GENERATION_FAILED' });
  }
});

const server = http.createServer(app);
const websocketServer = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
const clients = new Map();
const cueScheduler = new CueScheduler();
cueScheduler.onStall = () => cancelTransport('runtime-stall', true);
const handledActionIds = new Map();
installProductionTools(app, { root: projectRoot, client: new AivisSpeechClient(), profile: voiceProfile, store, broadcastState: () => { broadcastState(); forRole('display', (socket, client) => displayState(socket, client.displayId)); } });
let sceneRehearsalInProgress = false;

function send(socket, type, payload = {}) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, ...payload }));
}

function forRole(role, callback) {
  for (const [socket, client] of clients) if (client.role === role && socket.readyState === WebSocket.OPEN) callback(socket, client);
}

function broadcast(role, type, payload = {}) {
  forRole(role, (socket) => send(socket, type, payload));
}

function broadcastState() {
  broadcast('admin', 'state', { state: { ...store.snapshot(), connectionInfo: runtimeConnectionInfo() } });
}

function displayState(socket, displayId) {
  send(socket, 'state', {
    state: store.displaySnapshot(displayId), self: store.getDisplay(displayId),
    isAudioMaster: store.state.audioMasterId === displayId, restoreOnly: true,
  });
}

function displaySockets() {
  return [...clients].filter(([socket, client]) => client.role === 'display' && socket.readyState === WebSocket.OPEN);
}

function targetDisplays(target) {
  return displaySockets().filter(([, client]) => store.matchesTarget(store.getDisplay(client.displayId), target));
}

function audioMasterReadyFor(target) {
  const master = store.getDisplay(store.state.audioMasterId);
  // An offline master must not silence the remaining subtitle Displays.
  return !master || !master.online || !store.matchesTarget(master, target) || (master.audioEnabled && master.audioReady);
}

let subtitleMessageId = null;
function dispatch(message) {
  subtitleMessageId = message.id;
  if (message.kind === 'speech-display' || !message.kind) store.applyDisplayState(message);
  const recipients = targetDisplays(message.target);
  let audioReceiver = false;
  for (const [socket, client] of recipients) {
    const display = store.getDisplay(client.displayId);
    const shouldSpeak = client.displayId === store.state.audioMasterId && display.audioEnabled && display.audioReady;
    audioReceiver ||= shouldSpeak;
    send(socket, 'speak', { message, settings: store.state.settings, shouldSpeak });
  }
  logger.info('発話イベントをDisplayへ送信', {
    id: message.id, source: message.source, target: message.target,
    recipients: recipients.map(([, client]) => client.displayId), audioMaster: audioReceiver ? store.state.audioMasterId : null,
  });
  broadcastState();
  if (!audioReceiver) {
    scheduleSubtitles(message, true);
    const result = store.reportPlayback(message.id, 'completed');
    broadcastState();
    if (result.next) queueMicrotask(() => dispatch(result.next));
  }
  return recipients.length > 0;
}

function dispatchPresentation(action) {
  const recipients = targetDisplays(action.target);
  for (const [socket] of recipients) send(socket, 'presentation', { presentation: action, preset: store.getPreset(action.presentationPreset) });
  schedulePresentationSettlement(action);
  broadcastState(); return recipients.length > 0;
}

function schedulePresentationSettlement(action) {
  const elapsed = action.transition?.startedAt ? Math.max(0, Date.now() - Date.parse(action.transition.startedAt)) : 0;
  const unlockElapsed = action.unlock?.startedAt ? Math.max(0, Date.now() - Date.parse(action.unlock.startedAt)) : 0;
  const delays = [
    action.transition?.status === 'active' ? Math.max(0, action.transition.durationMs - elapsed) : null,
    action.unlock?.status === 'running' ? Math.max(0, action.unlock.durationMs - unlockElapsed) : null,
    action.overlay?.expiresAt ? Date.parse(action.overlay.expiresAt) - Date.now() : null,
    action.visual?.expiresAt ? Date.parse(action.visual.expiresAt) - Date.now() : null,
    ...(action.transition?.status === 'active' ? action.transition.phases ?? [] : []).filter((phase) => phase.atMs >= elapsed).map((phase) => phase.atMs - elapsed),
    ...(action.transition?.phases ?? []).flatMap(phase => [phase.transition ? phase.atMs + phase.transition.durationMs - elapsed : null, phase.unlock ? phase.atMs + phase.unlock.durationMs - elapsed : null]),
  ].filter((value) => Number.isFinite(value) && value >= 0);
  for (const delay of new Set(delays)) {
    cueScheduler.schedule(Math.min(600_000, delay + 25), () => {
      store.settleTimedPresentation(); void store.persist();
      forRole('display', (socket, client) => displayState(socket, client.displayId));
      broadcastState();
    });
  }
}

function enqueueAndDispatch(socket, message) {
  const result = store.enqueue(message);
  if (result.dispatch) dispatch(result.dispatch);
  send(socket, 'accepted', { id: message.id, queued: result.queued });
  broadcastState();
}

function errorResponse(socket, error) {
  const messages = {
    EMPTY_TEXT: '読み上げる文章を入力してください。',
    TEXT_TOO_LONG: '文章は5,000文字以内にしてください。',
    DISPLAY_NOT_FOUND: '対象Displayが見つかりません。',
    DISPLAY_ONLINE: 'ONLINEのDisplay登録は削除できません。先に対象端末を切断してください。',
    CUE_NOT_FOUND: 'Cueが見つかりません。',
    CUE_DISABLED: '無効なCueは実行できません。',
    NO_NEXT_CUE: '次のCueはありません。',
    NO_CURRENT_CUE: '再実行するCueがありません。',
    SCENE_NOT_FOUND: 'Sceneが見つかりません。',
    REHEARSAL_NOT_ACTIVE: '先にリハーサルを開始してください。',
    REHEARSAL_IN_PROGRESS: 'Scene Rehearsal Startを実行中です。',
    NO_SCENE_CUE: 'このScene内に横川AI Cueはありません。',
    GROUP_NOT_FOUND: '配信先セットが見つかりません。',
    GROUP_IN_USE: 'Cueから使用中の配信先セットは削除できません。先にCueの送信先を変更してください。',
    INVALID_GROUP: '配信先セットのIDが不正です。',
    INVALID_MODE: '管理画面モードが不正です。',
    DUPLICATE_ACTION: '同じ操作の二重送信を防止しました。',
    NEXT_GUARDED: 'NEXT保護中です。連打は破棄しました。次の合図で押してください。',
  };
  send(socket, 'error', { code: error.message, message: messages[error.message] ?? '操作を完了できませんでした。' });
}

function validateTarget(socket, target, requireAudio = true) {
  if (target?.type === 'group') {
    const group = store.getTargetGroup(target.id);
    if (!group) { send(socket, 'error', { code: 'GROUP_NOT_FOUND', message: '配信先セットが見つかりません。' }); return false; }
    if (!group.enabled) { send(socket, 'error', { code: 'GROUP_DISABLED', message: '無効な配信先セットは使用できません。' }); return false; }
  }
  if (!targetDisplays(target).length) {
    send(socket, 'error', { code: 'DISPLAY_UNAVAILABLE', message: '対象Displayが接続されていません。' });
    return false;
  }
  if (requireAudio && !audioMasterReadyFor(target)) {
    send(socket, 'error', { code: 'AUDIO_NOT_READY', message: 'Audio Masterで「音声を有効化」を押してください。' });
    return false;
  }
  return true;
}

function handleSpeechRequest(socket, factory, logLabel) {
  try {
    const prepared = factory();
    const message = prepared.message ?? prepared;
    if (!validateTarget(socket, message.target)) return;
    enqueueAndDispatch(socket, message);
    logger.info(logLabel, { id: message.id, cueId: message.cueId, target: message.target });
  } catch (error) {
    errorResponse(socket, error);
  }
}

function dispatchSubtitleAfterLocalTtsFailure(text, target) {
  const message = { id: `local-tts-error-${Date.now()}`, text, displayText: text, kind: 'speech-display', source: 'free', target,
    audio: { speechMode: 'local-tts', lipSyncMode: 'audio-reactive' } };
  for (const [displaySocket] of targetDisplays(target)) send(displaySocket, 'speak', { message, settings: store.state.settings, shouldSpeak: false });
}

async function handleLocalTtsRequest(socket, text, { source = 'free', target = { type: 'all' }, replayOf = null } = {}) {
  if (!validateTarget(socket, target)) return;
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (!normalized) return errorResponse(socket, new Error('EMPTY_TEXT'));
  if (normalized.length > 5000) return errorResponse(socket, new Error('TEXT_TOO_LONG'));
  store.setLocalTtsStatus({ ...localTtsService.status(), activity: 'synthesizing' }); broadcastState();
  try {
    const runtime = await localTtsService.synthesize(normalized, { source, target });
    const message = store.createMessage(normalized, { source, target, replayOf, kind: 'speech-display', displayText: normalized,
      speechProvider: 'local-tts', audio: { speechMode: 'local-tts', runtimeUrl: runtime.runtimeUrl, runtimeAudioId: runtime.id, lipSyncMode: 'audio-reactive', profileId: voiceProfile.profileId } });
    store.setLocalTtsStatus({ ...localTtsService.status(), activity: 'idle' });
    enqueueAndDispatch(socket, message);
    logger.info('Local TTS発話を受付', { id: message.id, source, target, runtimeAudioId: runtime.id });
  } catch (error) {
    store.setLocalTtsStatus({ ...localTtsService.status(), activity: 'idle' });
    if (error.message !== 'LOCAL_TTS_CANCELLED') dispatchSubtitleAfterLocalTtsFailure(normalized, target);
    send(socket, 'error', { code: error.message, message: error.message === 'LOCAL_TTS_CANCELLED'
      ? 'Local TTS音声生成を停止しました。' : `Local TTS音声生成に失敗しました。Browser TTSへは切り替えません。(${error.message})` });
    broadcastState();
  }
}

function handleCueRequest(socket, factory, logLabel) {
  try {
    const prepared = factory();
    if (!prepared) return;
    if (!validateTarget(socket, prepared.cue.target, Boolean(prepared.message))) return;
    cueScheduler.cancel();
    broadcast('display', 'sfx:stop');
    dispatchPresentation(prepared.action);
    for (const effect of prepared.cue.sfx ?? []) cueScheduler.schedule(effect.atMs, () => {
      for (const [displaySocket, client] of targetDisplays(prepared.cue.target)) {
        if (client.displayId === store.state.audioMasterId) send(displaySocket, 'sfx', { effect, volume: store.state.settings.sfxVolume });
      }
    });
    if (prepared.message && prepared.cue.timing.speechDelayMs > 0) {
      const message = prepared.message;
      store.updateHistory(message.id, { status: 'pending' });
      cueScheduler.onCancel = () => store.updateHistory(message.id, { status: 'stopped', finishedAt: new Date().toISOString() });
      cueScheduler.schedule(prepared.cue.timing.speechDelayMs, () => {
        cueScheduler.onCancel = null;
        const master = store.getDisplay(store.state.audioMasterId);
        if (!master?.online || !master.audioReady || !master.audioEnabled || !targetDisplays(message.target).length) {
          store.updateHistory(message.id, { status: 'error', error: 'Cue待機中にAudio Readyを失いました。REPLAYしてください。' });
          void store.persist(); broadcastState(); return;
        }
        enqueueAndDispatch(socket, message);
      });
      send(socket, 'accepted', { id: message.id, queued: false }); broadcastState();
    }
    else if (prepared.message) enqueueAndDispatch(socket, prepared.message);
    else { send(socket, 'accepted', { id: `cue:${prepared.cue.cueId}`, queued: false }); broadcastState(); }
    store.logRehearsal(logLabel.toLowerCase().replaceAll(' ', '-'), logLabel, { cueId: prepared.cue.cueId, result: 'accepted' }); void store.persist();
    logger.info(logLabel, { cueId: prepared.cue.cueId, kind: prepared.cue.kind, target: prepared.cue.target });
  } catch (error) { errorResponse(socket, error); }
}

function cancelTransport(reason, recover = false) {
  cueScheduler.cancel(); localTtsService.cancelCurrent(reason);
  if (store.state.currentMessage) store.updateCurrent(recover ? 'error' : 'stopped', recover ? `復帰のため再生を破棄: ${reason}` : null);
  for (const message of store.state.queue) store.updateHistory(message.id, { status: recover ? 'error' : 'stopped', error: recover ? `Display復帰によりキューを解除: ${reason}` : null });
  store.state.currentMessage = null; store.state.queue = []; store.state.playbackStatus = recover ? 'error' : 'stopped';
  store.stopPresentation(); store.state.currentSubtitle = null;
  if (recover) { store.stabilizePresentation(); store.state.runtimeRecovery = { reason, at: new Date().toISOString() }; }
  else store.state.currentVisual = canonicalPresentationState(store.state.avatar).currentVisual;
  for (const display of store.state.displays) { display.currentSubtitle = null; display.currentVisual = structuredClone(store.state.currentVisual); }
  forRole('display', (socket, client) => { send(socket, 'stop'); displayState(socket, client.displayId); });
  void store.persist();
}

function scheduleSubtitles(message, subtitleOnly = false) {
  for (const segment of subtitleUnits(message?.speech, message?.displayText ?? message?.text)) cueScheduler.schedule(segment.startMs, () => {
    if (subtitleMessageId !== message.id || (!subtitleOnly && store.state.currentMessage?.id !== message.id)) return;
    store.state.currentSubtitle = segment.displayText;
    for (const [socket, client] of targetDisplays(message.target)) {
      store.getDisplay(client.displayId).currentSubtitle = segment.displayText;
      send(socket, 'subtitle', { text: segment.displayText, mode: 'typewriter', durationMs: Math.max(1, segment.endMs - segment.startMs) });
    }
    void store.persist(); broadcastState();
  });
}

function handleAdmin(socket, event) {
  if (event.type === 'speak') {
    const mode = store.state.settings.freeSpeakMode;
    store.logRehearsal('free-speak', 'Free Speak', { target: event.target ?? { type: 'all' }, speechMode: mode, result: 'accepted' });
    if (mode === 'local-tts') void handleLocalTtsRequest(socket, event.text, { source: 'free', target: event.target ?? { type: 'all' } });
    else handleSpeechRequest(socket, () => store.createMessage(event.text, { source: 'free', target: event.target }), 'Free Speakを受付');
    return;
  }
  if (event.type === 'local-tts:test') {
    const master = store.getDisplay(store.state.audioMasterId);
    void handleLocalTtsRequest(socket, '横川AI、音声出力テストを実行します。', { source: 'test', target: master ? { type: 'display', id: master.displayId } : { type: 'display', id: 'audio-master-unset' } });
    return;
  }
  if (event.type === 'audio:test') {
    const master = store.getDisplay(store.state.audioMasterId);
    handleSpeechRequest(socket, () => store.createMessage('音声テストです。横川AIの音声を確認してください。', {
      source: 'test', target: master ? { type: 'display', id: master.displayId } : { type: 'display', id: 'audio-master-unset' },
    }), '音声テストを受付');
    return;
  }
  if (event.type === 'stop') {
    cueScheduler.cancel();
    localTtsService.cancelCurrent('operator-stop');
    const id = store.state.currentMessage?.id ?? null;
    store.stopPresentation({ type: 'all' });
    if (store.state.currentMessage) store.updateCurrent('stopped');
    for (const queued of store.state.queue) store.updateHistory(queued.id, { status: 'stopped' });
    store.state.currentMessage = null; store.state.queue = []; store.state.playbackStatus = 'stopped';
    void store.persist();
    store.logRehearsal('stop', 'STOP', { messageId: id, result: 'accepted' });
    forRole('display', (displaySocket, client) => { send(displaySocket, 'stop', { id }); displayState(displaySocket, client.displayId); });
    send(socket, 'accepted', { id: id ?? 'presentation:stop', queued: false }); broadcastState();
    logger.info('TTS・演出停止指示', { id }); return;
  }
  if (event.type === 'replay') {
    const original = store.state.history.find((item) => item.id === event.id) ?? store.state.history[0];
    if (!original) { send(socket, 'error', { code: 'NO_HISTORY', message: '再読み上げできる履歴がありません。' }); return; }
    if (original.audio?.speechMode === 'local-tts' || original.speechProvider === 'local-tts') void handleLocalTtsRequest(socket, original.text, { replayOf: original.id, source: original.source, target: original.target });
    else handleSpeechRequest(socket, () => store.createMessage(original.text, { replayOf: original.id, source: original.source, target: original.target,
      kind: original.kind, displayText: original.displayText, speechProvider: original.speechProvider, audio: original.audio }), '履歴再読み上げを受付');
    return;
  }
  if (event.type === 'cue:next') handleCueRequest(socket, () => store.nextCue({ validate: cue => validateTarget(socket, cue.target, ['speech-display', 'speech-only'].includes(cue.kind) && cue.audio.speechMode !== 'none') }), 'Cue NEXT');
  else if (event.type === 'cue:execute') handleCueRequest(socket, () => store.executeCue(event.cueId), 'Cue直接実行');
  else if (event.type === 'cue:jump') {
    try { const cue = store.jumpCue(event.cueId); broadcastState(); send(socket, 'accepted', { id: `jump:${cue.cueId}`, queued: false }); logger.info('Cue位置移動', { cueId: cue.cueId }); } catch (error) { errorResponse(socket, error); }
  }
  else if (event.type === 'cue:replay') {
    cueScheduler.cancel();
    if (store.state.currentMessage) store.updateCurrent('stopped');
    for (const queued of store.state.queue) store.updateHistory(queued.id, { status: 'stopped' });
    store.state.currentMessage = null; store.state.queue = [];
    forRole('display', (displaySocket) => send(displaySocket, 'stop'));
    handleCueRequest(socket, () => store.replayCue(), 'Cue REPLAY');
  }
  else if (event.type === 'cue:back') {
    cancelTransport('back');
    const cue = store.backCue(); store.logRehearsal('back', 'BACK', { cueId: cue?.cueId ?? null, result: 'success' }); broadcastState(); logger.info('Cue BACK');
  } else if (event.type === 'cue:save') {
    try { store.saveCue(event.cue ?? {}); broadcastState(); logger.info('Cueを保存', { cueId: event.cue?.cueId }); } catch (error) { errorResponse(socket, error); }
  } else if (event.type === 'cue:reorder') {
    try { store.reorderCues(event.cueIds); broadcastState(); logger.info('Cueを並び替え'); } catch (error) { errorResponse(socket, error); }
  } else if (event.type === 'scene:jump') {
    cancelTransport('scene-jump');
    try { store.jumpScene(event.sceneId); broadcastState(); logger.info('Sceneへ移動', { sceneId: event.sceneId }); } catch (error) { errorResponse(socket, error); }
  } else if (event.type === 'scene:rehearsal-start') {
    if (sceneRehearsalInProgress) { errorResponse(socket, new Error('REHEARSAL_IN_PROGRESS')); return; }
    sceneRehearsalInProgress = true;
    try {
      const plan = store.prepareSceneRehearsal(event.sceneId);
      cueScheduler.cancel();
      localTtsService.cancelCurrent('scene-rehearsal-start'); runtimeAudioCache.clear();
      const stoppedId = store.state.currentMessage?.id ?? null;
      forRole('display', (displaySocket) => send(displaySocket, 'stop', { id: stoppedId }));
      const result = store.commitSceneRehearsal(plan);
      forRole('display', (displaySocket, client) => displayState(displaySocket, client.displayId));
      send(socket, 'accepted', { id: `scene-rehearsal:${result.sceneId}`, queued: false });
      broadcastState();
      logger.info('Scene Rehearsal Start', { sceneId: result.sceneId, nextCueId: result.nextCueId });
    } catch (error) { errorResponse(socket, error); }
    finally { sceneRehearsalInProgress = false; }
  } else if (event.type === 'audio-master:set') {
    try {
      store.setAudioMaster(event.displayId || null);
      forRole('display', (displaySocket, client) => displayState(displaySocket, client.displayId));
      broadcastState(); logger.info('Audio Master変更', { displayId: event.displayId || null });
    } catch (error) { errorResponse(socket, error); }
  } else if (event.type === 'display:required') {
    try { store.setDisplayRequired(event.displayId, event.required); broadcastState(); logger.info('Display必須設定変更', { displayId: event.displayId, required: event.required === true }); } catch (error) { errorResponse(socket, error); }
  } else if (event.type === 'display:delete') {
    try { store.deleteDisplay(event.displayId); broadcastState(); logger.info('Display登録削除', { displayId: event.displayId }); } catch (error) { errorResponse(socket, error); }
  } else if (event.type === 'display:identify') {
    const target = displaySockets().find(([, client]) => client.displayId === event.displayId);
    if (!target) errorResponse(socket, new Error('DISPLAY_NOT_FOUND'));
    else { send(target[0], 'identify', { durationMs: 5000 }); send(socket, 'accepted', { id: `identify:${event.displayId}`, queued: false }); logger.info('Display識別表示', { displayId: event.displayId }); }
  } else if (event.type === 'target-group:save') {
    try { const group = store.saveTargetGroup(event.group); broadcastState(); logger.info('配信先セット保存', { groupId: group.id }); } catch (error) { errorResponse(socket, error); }
  } else if (event.type === 'target-group:delete') {
    try { store.deleteTargetGroup(event.groupId); broadcastState(); logger.info('配信先セット削除', { groupId: event.groupId }); } catch (error) { errorResponse(socket, error); }
  } else if (event.type === 'admin-mode:set') {
    try { store.setAdminMode(event.mode); broadcastState(); logger.info('Adminモード変更', { mode: event.mode }); } catch (error) { errorResponse(socket, error); }
  } else if (event.type === 'settings:update') {
    const settings = store.setSettings(event.settings ?? {});
    broadcast('display', 'settings', { settings }); broadcastState(); logger.info('設定を更新');
  } else if (event.type === 'show:reset' || event.type === 'production:reset') {
    cueScheduler.cancel();
    localTtsService.cancelCurrent('show-reset'); runtimeAudioCache.clear();
    forRole('display', (displaySocket) => send(displaySocket, 'show:reset'));
    if (event.type === 'production:reset') { store.importShowFile(bundledProductionShow, { apply: true }); applyProductionSlots(store, productionSlots); }
    else store.showReset();
    forRole('display', (displaySocket, client) => displayState(displaySocket, client.displayId)); broadcastState(); logger.info(event.type);
  } else if (event.type === 'clear') {
    const target = event.target ?? { type: 'all' }; store.state.currentSubtitle = null;
    for (const display of store.state.displays) if (store.matchesTarget(display, target)) display.currentSubtitle = null;
    store.logRehearsal('clear', 'CLEAR'); void store.persist(); dispatchPresentation({ kind: 'clear', target, displayText: '', presentationPreset: store.state.currentPresetId, avatar: store.state.currentAvatar }); send(socket, 'accepted', { id: 'clear', queued: false });
  } else if (event.type === 'blackout') {
    const action = { kind: 'blackout', target: { type: 'all' }, blackout: true, presentationPreset: 'shutdown', avatar: { visible: false, state: 'shutdown' }, displayText: '' };
    if (!store.state.blackout) store.state.previousVisualState = { currentSubtitle: store.state.currentSubtitle, currentPresetId: store.state.currentPresetId, currentAvatar: store.state.currentAvatar };
    store.state.blackout = true; for (const display of store.state.displays) display.blackout = true; store.logRehearsal('blackout', 'BLACKOUT'); void store.persist(); dispatchPresentation(action);
  } else if (event.type === 'blackout:clear') {
    store.clearBlackout(); forRole('display', (displaySocket, client) => displayState(displaySocket, client.displayId)); broadcastState();
  } else if (event.type === 'preset:save') {
    try { const preset = store.savePreset(event.preset); store.logRehearsal('preset-change', 'Preset変更', { preset: preset.id, result: 'success' }); broadcastState(); } catch (error) { errorResponse(socket, error); }
  } else if (event.type === 'preset:delete') {
    try { store.deletePreset(event.presetId); broadcastState(); } catch (error) { errorResponse(socket, error); }
  } else if (event.type === 'rehearsal:start') {
    store.startRehearsal(); broadcastState();
  } else if (event.type === 'rehearsal:stop') {
    store.stopRehearsal(); broadcastState();
  }
}

function handleDisplay(client, event) {
  if (event.type === 'runtime:recover') {
    if (client.displayId === store.state.audioMasterId) cancelTransport('display-resume', true);
    const socket = [...clients].find(([, item]) => item === client)?.[0];
    if (socket) { send(socket, 'runtime:recovered'); displayState(socket, client.displayId); }
    broadcastState();
    return;
  }
  const display = store.getDisplay(client.displayId);
  if (!display) return;
  if (event.type === 'display:configure') {
    store.registerDisplay({ displayId: client.displayId, ...event.display });
    logger.info('Display設定更新', { displayId: client.displayId });
    const socket = [...clients].find(([, item]) => item === client)?.[0];
    if (socket) displayState(socket, client.displayId);
    broadcastState(); return;
  }
  if (event.type === 'heartbeat') {
    const wasOffline = !display.online;
    store.heartbeat(client.displayId);
    if (wasOffline) { logger.info('Display Heartbeat復帰', { displayId: client.displayId }); const socket = [...clients].find(([, item]) => item === client)?.[0]; if (socket) displayState(socket, client.displayId); }
    broadcastState(); return;
  }
  if (event.type === 'audio:ready') {
    if (client.displayId !== store.state.audioMasterId || !display.audioEnabled) {
      logger.info('Audio Master以外の準備完了通知を無視', { displayId: client.displayId });
      return;
    }
    store.setDisplayAudioReady(client.displayId, true);
    logger.info('Display TTS準備完了', { displayId: client.displayId }); broadcastState(); return;
  }
  if (event.type === 'playback') {
    if (client.displayId !== store.state.audioMasterId) {
      logger.info('非Audio Masterの再生通知を無視', { displayId: client.displayId, id: event.id }); return;
    }
    try {
      const result = store.reportPlayback(event.id, event.status, event.error);
      if (!result.accepted) return;
      if (event.status === 'speaking') scheduleSubtitles(store.state.currentMessage);
      const playbackLabels = { received: 'TTS受信', speaking: 'TTS開始', completed: 'TTS終了', stopped: 'TTS停止', error: 'TTSエラー' };
      logger.info(playbackLabels[event.status] ?? `TTS状態: ${event.status}`, { id: event.id, displayId: client.displayId, error: event.error });
      broadcastState(); if (result.next) dispatch(result.next);
    } catch (error) { logger.error('不正な再生状態を受信', error); }
  } else if (event.type === 'voices') {
    if (client.displayId === store.state.audioMasterId) broadcast('admin', 'voices', { voices: Array.isArray(event.voices) ? event.voices.slice(0, 100) : [] });
  }
}

websocketServer.on('connection', (socket) => {
  const client = { role: null, displayId: null, alive: true };
  clients.set(socket, client);
  socket.on('pong', () => { client.alive = true; });
  socket.on('message', (data) => {
    let event;
    try { event = JSON.parse(data.toString()); }
    catch { send(socket, 'error', { code: 'INVALID_JSON', message: '通信データを解釈できません。' }); return; }
    if (!client.role) {
      if (!['admin', 'display'].includes(event.role) || event.type !== 'hello') { socket.close(1008, 'hello required'); return; }
      client.role = event.role;
      if (client.role === 'display') {
        const display = store.registerDisplay(event.display ?? {});
        client.displayId = display.displayId;
        if (store.state.audioMasterId === display.displayId) cancelTransport('display-reconnected', true);
        for (const [otherSocket, other] of clients) {
          if (otherSocket !== socket && other.role === 'display' && other.displayId === display.displayId) otherSocket.close(4000, 'new connection');
        }
        if (!store.state.audioMasterId) store.setAudioMaster(display.displayId);
        logger.info('Display接続', { displayId: display.displayId, displayName: display.displayName });
        displayState(socket, display.displayId);
      } else {
        send(socket, 'state', { state: { ...store.snapshot(), connectionInfo: runtimeConnectionInfo() }, restoreOnly: true });
        logger.info('Admin接続');
        broadcast('display', 'voices:request');
      }
      if (client.role === 'display') broadcastState();
      return;
    }
    if (client.role === 'admin') {
      if (typeof event.actionId === 'string' && event.actionId.length <= 100) {
        const now = performance.now();
        for (const [id, handledAt] of handledActionIds) if (now - handledAt > 10_000) handledActionIds.delete(id);
        if (handledActionIds.has(event.actionId)) { errorResponse(socket, new Error('DUPLICATE_ACTION')); return; }
        handledActionIds.set(event.actionId, now);
      }
      handleAdmin(socket, event);
    }
    else handleDisplay(client, event);
  });
  socket.on('close', () => {
    clients.delete(socket);
    if (client.role === 'display') {
      const duplicateStillOpen = [...clients.values()].some((other) => other.role === 'display' && other.displayId === client.displayId);
      if (!duplicateStillOpen) {
        if (store.state.audioMasterId === client.displayId) cancelTransport('audio-master-disconnected', true);
        store.disconnectDisplay(client.displayId);
        logger.info('Display切断', { displayId: client.displayId }); broadcastState();
      }
    } else if (client.role === 'admin') logger.info('Admin切断');
  });
  socket.on('error', (error) => logger.error('WebSocketエラー', error));
});

const socketHeartbeat = setInterval(() => {
  for (const [socket, client] of clients) {
    if (!client.alive) { socket.terminate(); continue; }
    client.alive = false; socket.ping();
  }
}, 10_000);
socketHeartbeat.unref();

const offlineMonitor = setInterval(() => {
  const cutoff = Date.now() - heartbeatTimeoutMs;
  for (const display of store.state.displays) {
    if (display.online && (!display.lastHeartbeat || Date.parse(display.lastHeartbeat) < cutoff)) {
      store.markOffline(display.displayId);
      if (store.state.audioMasterId === display.displayId) cancelTransport('heartbeat-timeout', true);
      logger.info('Display Heartbeat timeout', { displayId: display.displayId });
      broadcastState();
    }
  }
}, 1000);
offlineMonitor.unref();

let previousTick = performance.now(); let previousWall = Date.now();
const runtimeWatch = setInterval(() => {
  const tick = performance.now(); const wall = Date.now();
  if (tick - previousTick > 5000 || Math.abs((wall - previousWall) - (tick - previousTick)) > 5000) { cancelTransport('runtime-clock-or-resume', true); broadcastState(); }
  previousTick = tick; previousWall = wall;
}, 500);
runtimeWatch.unref();

app.get('/api/runtime-status', (_request, response) => response.json({ memory: process.memoryUsage(), cpu: process.cpuUsage(), uptime: process.uptime(), sockets: clients.size, cueTimers: cueScheduler.timers.size, handles: process._getActiveHandles().length, nextGuard: store.nextGuard(), cueIndex: store.state.currentCueIndex }));

const localTtsHealthMonitor = setInterval(() => { void refreshLocalTtsStatus(); }, 30_000);
localTtsHealthMonitor.unref();
void refreshLocalTtsStatus();

server.on('error', (error) => { logger.error('サーバー起動エラー', error); process.exitCode = 1; });
server.listen(port, host, () => {
  // Resume only presentation deadlines after restart, never pending/historical audio.
  for (const presentation of [store.state, ...store.state.displays]) schedulePresentationSettlement({
    transition: presentation.currentTransition, unlock: presentation.unlock,
    overlay: presentation.currentOverlay, visual: presentation.currentVisual,
  });
  const urls = singlePcMode ? accessUrls(port, []) : accessUrls(port);
  logger.info('Yokogawa AI System started', { environment, host, port, lan: urls.lan });
  console.log('\nYokogawa AI System started.\n\nLocal:\n' + urls.local.join('\n') + (urls.lan.length ? '\n\nLAN:\n' + urls.lan.join('\n') : '\n\nLAN:\n利用可能なLAN IPv4アドレスが見つかりません。') + '\n');
});

function shutdown(signal) {
  logger.info(`${signal} を受信。サーバーを終了します。`);
  clearInterval(socketHeartbeat); clearInterval(offlineMonitor); clearInterval(localTtsHealthMonitor);
  localTtsService.cancelCurrent('server-shutdown'); runtimeAudioCache.clear();
  cueScheduler.cancel();
  for (const socket of clients.keys()) socket.close(1001, 'server shutdown');
  server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
