import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { StateStore } from './state-store.js';
import { createLogger } from './logger.js';
import { accessUrls } from './network.js';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDirectory, '..');
const publicDirectory = path.join(projectRoot, 'public');
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '0.0.0.0';
const heartbeatTimeoutMs = Number.parseInt(process.env.HEARTBEAT_TIMEOUT_MS ?? '7000', 10);
const logger = createLogger(process.env.LOG_DIRECTORY ?? path.join(projectRoot, 'logs'));
const store = new StateStore({ stateFile: process.env.STATE_FILE ?? path.join(projectRoot, 'data', 'state.json'), logger });
await store.load();

const app = express();
app.disable('x-powered-by');
app.use((_request, response, next) => {
  response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.static(publicDirectory, { extensions: ['html'] }));
app.get('/', (_request, response) => response.redirect('/admin'));
app.get('/health', (_request, response) => response.json({ ok: true, displayConnected: store.displayCount > 0, displays: store.displayCount }));

const server = http.createServer(app);
const websocketServer = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
const clients = new Map();

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
  broadcast('admin', 'state', { state: store.snapshot() });
}

function displayState(socket, displayId) {
  send(socket, 'state', {
    state: store.snapshot(), self: store.getDisplay(displayId),
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
  return !master || !store.matchesTarget(master, target) || (master.online && master.audioEnabled && master.audioReady);
}

function dispatch(message) {
  store.applyDisplayState(message);
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
    const result = store.reportPlayback(message.id, 'completed');
    broadcastState();
    if (result.next) queueMicrotask(() => dispatch(result.next));
  }
  return recipients.length > 0;
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
    CUE_NOT_FOUND: 'Cueが見つかりません。',
    CUE_DISABLED: '無効なCueは実行できません。',
    NO_NEXT_CUE: '次のCueはありません。',
    NO_CURRENT_CUE: '再実行するCueがありません。',
    SCENE_NOT_FOUND: 'Sceneが見つかりません。',
  };
  send(socket, 'error', { code: error.message, message: messages[error.message] ?? '操作を完了できませんでした。' });
}

function validateTarget(socket, target) {
  if (!targetDisplays(target).length) {
    send(socket, 'error', { code: 'DISPLAY_UNAVAILABLE', message: '対象Displayが接続されていません。' });
    return false;
  }
  if (!audioMasterReadyFor(target)) {
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

function handleAdmin(socket, event) {
  if (event.type === 'speak') {
    handleSpeechRequest(socket, () => store.createMessage(event.text, { source: 'free', target: event.target }), 'Free Speakを受付');
    return;
  }
  if (event.type === 'stop') {
    if (!store.state.currentMessage) {
      send(socket, 'error', { code: 'NOT_SPEAKING', message: '停止する発話はありません。' }); return;
    }
    const id = store.state.currentMessage.id;
    forRole('display', (displaySocket) => send(displaySocket, 'stop', { id }));
    logger.info('TTS停止指示', { id }); return;
  }
  if (event.type === 'replay') {
    const original = store.state.history.find((item) => item.id === event.id) ?? store.state.history[0];
    if (!original) { send(socket, 'error', { code: 'NO_HISTORY', message: '再読み上げできる履歴がありません。' }); return; }
    handleSpeechRequest(socket, () => store.createMessage(original.text, { replayOf: original.id, source: original.source, target: original.target }), '履歴再読み上げを受付');
    return;
  }
  if (event.type === 'cue:next') handleSpeechRequest(socket, () => store.nextCue(), 'Cue NEXT');
  else if (event.type === 'cue:execute') handleSpeechRequest(socket, () => store.executeCue(event.cueId), 'Cue直接実行');
  else if (event.type === 'cue:replay') handleSpeechRequest(socket, () => store.replayCue(), 'Cue REPLAY');
  else if (event.type === 'cue:back') {
    store.backCue(); broadcastState(); logger.info('Cue BACK');
  } else if (event.type === 'cue:save') {
    try { store.saveCue(event.cue ?? {}); broadcastState(); logger.info('Cueを保存', { cueId: event.cue?.cueId }); } catch (error) { errorResponse(socket, error); }
  } else if (event.type === 'cue:reorder') {
    try { store.reorderCues(event.cueIds); broadcastState(); logger.info('Cueを並び替え'); } catch (error) { errorResponse(socket, error); }
  } else if (event.type === 'scene:jump') {
    try { store.jumpScene(event.sceneId); broadcastState(); logger.info('Sceneへ移動', { sceneId: event.sceneId }); } catch (error) { errorResponse(socket, error); }
  } else if (event.type === 'audio-master:set') {
    try {
      store.setAudioMaster(event.displayId || null);
      forRole('display', (displaySocket, client) => displayState(displaySocket, client.displayId));
      broadcastState(); logger.info('Audio Master変更', { displayId: event.displayId || null });
    } catch (error) { errorResponse(socket, error); }
  } else if (event.type === 'settings:update') {
    const settings = store.setSettings(event.settings ?? {});
    broadcast('display', 'settings', { settings }); broadcastState(); logger.info('設定を更新');
  } else if (event.type === 'show:reset') {
    forRole('display', (displaySocket) => send(displaySocket, 'show:reset'));
    store.showReset(); broadcastState(); logger.info('Show Reset');
  }
}

function handleDisplay(client, event) {
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
    if (wasOffline) logger.info('Display Heartbeat復帰', { displayId: client.displayId });
    broadcastState(); return;
  }
  if (event.type === 'audio:ready') {
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
      logger.info(`TTS${event.status}`, { id: event.id, displayId: client.displayId, error: event.error });
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
        for (const [otherSocket, other] of clients) {
          if (otherSocket !== socket && other.role === 'display' && other.displayId === display.displayId) otherSocket.close(4000, 'new connection');
        }
        if (!store.state.audioMasterId) store.setAudioMaster(display.displayId);
        logger.info('Display接続', { displayId: display.displayId, displayName: display.displayName });
        displayState(socket, display.displayId);
      } else {
        send(socket, 'state', { state: store.snapshot(), restoreOnly: true });
        logger.info('Admin接続');
        broadcast('display', 'voices:request');
      }
      if (client.role === 'display') broadcastState();
      return;
    }
    if (client.role === 'admin') handleAdmin(socket, event);
    else handleDisplay(client, event);
  });
  socket.on('close', () => {
    clients.delete(socket);
    if (client.role === 'display') {
      const duplicateStillOpen = [...clients.values()].some((other) => other.role === 'display' && other.displayId === client.displayId);
      if (!duplicateStillOpen) {
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
      logger.info('Display Heartbeat timeout', { displayId: display.displayId });
      broadcastState();
    }
  }
}, 1000);
offlineMonitor.unref();

server.on('error', (error) => { logger.error('サーバー起動エラー', error); process.exitCode = 1; });
server.listen(port, host, () => {
  const urls = accessUrls(port);
  logger.info('Yokogawa AI System started', { host, port, lan: urls.lan });
  console.log('\nYokogawa AI System started.\n\nLocal:\n' + urls.local.join('\n') + (urls.lan.length ? '\n\nLAN:\n' + urls.lan.join('\n') : '\n\nLAN:\n利用可能なLAN IPv4アドレスが見つかりません。') + '\n');
});

function shutdown(signal) {
  logger.info(`${signal} を受信。サーバーを終了します。`);
  clearInterval(socketHeartbeat); clearInterval(offlineMonitor);
  for (const socket of clients.keys()) socket.close(1001, 'server shutdown');
  server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
