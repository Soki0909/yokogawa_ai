import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { StateStore } from './state-store.js';
import { createLogger } from './logger.js';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDirectory, '..');
const publicDirectory = path.join(projectRoot, 'public');
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '127.0.0.1';
const logger = createLogger(process.env.LOG_DIRECTORY ?? path.join(projectRoot, 'logs'));
const store = new StateStore({ stateFile: process.env.STATE_FILE ?? path.join(projectRoot, 'data', 'state.json'), logger });
await store.load();

const app = express();
app.disable('x-powered-by');
app.use(express.static(publicDirectory, { extensions: ['html'] }));
app.get('/', (_request, response) => response.redirect('/admin'));
app.get('/health', (_request, response) => response.json({ ok: true, displayConnected: store.displayCount > 0 }));

const server = http.createServer(app);
const websocketServer = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const clients = new Map();

function send(socket, type, payload = {}) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, ...payload }));
}

function broadcast(role, type, payload = {}) {
  for (const [socket, client] of clients) {
    if (client.role === role) send(socket, type, payload);
  }
}

function broadcastState() {
  broadcast('admin', 'state', { state: store.snapshot() });
}

function activeDisplay() {
  return [...clients].find(([socket, client]) => client.role === 'display' && socket.readyState === WebSocket.OPEN)?.[0];
}

function dispatch(message) {
  const display = activeDisplay();
  if (!display) return false;
  send(display, 'speak', { message, settings: store.state.settings });
  logger.info('発話を投影画面へ送信', { id: message.id });
  return true;
}

function handleAdmin(socket, event) {
  if (event.type === 'speak') {
    if (!activeDisplay()) {
      send(socket, 'error', { code: 'DISPLAY_UNAVAILABLE', message: '投影画面が未接続です。/display を開いてから再送信してください。' });
      return;
    }
    try {
      const message = store.createMessage(event.text);
      const result = store.enqueue(message);
      if (result.dispatch) dispatch(result.dispatch);
      send(socket, 'accepted', { id: message.id, queued: result.queued });
      logger.info(result.queued ? '発話をキューへ追加' : '発話を受付', { id: message.id });
      broadcastState();
    } catch (error) {
      const response = error.message === 'TEXT_TOO_LONG'
        ? '文章は5,000文字以内にしてください。'
        : '読み上げる文章を入力してください。';
      send(socket, 'error', { code: error.message, message: response });
    }
    return;
  }

  if (event.type === 'stop') {
    const display = activeDisplay();
    if (!display || !store.state.currentMessage) {
      send(socket, 'error', { code: 'NOT_SPEAKING', message: '停止する発話はありません。' });
      return;
    }
    send(display, 'stop', { id: store.state.currentMessage.id });
    logger.info('停止指示', { id: store.state.currentMessage.id });
    return;
  }

  if (event.type === 'replay') {
    if (!activeDisplay()) {
      send(socket, 'error', { code: 'DISPLAY_UNAVAILABLE', message: '投影画面が未接続です。' });
      return;
    }
    const original = store.state.history.find((item) => item.id === event.id)
      ?? store.state.history[0];
    if (!original) {
      send(socket, 'error', { code: 'NO_HISTORY', message: '再読み上げできる履歴がありません。' });
      return;
    }
    const message = store.createMessage(original.text, { replayOf: original.id });
    const result = store.enqueue(message);
    if (result.dispatch) dispatch(result.dispatch);
    send(socket, 'accepted', { id: message.id, queued: result.queued });
    logger.info('再読み上げを受付', { id: message.id, replayOf: original.id });
    broadcastState();
    return;
  }

  if (event.type === 'settings:update') {
    const settings = store.setSettings(event.settings ?? {});
    broadcast('display', 'settings', { settings });
    broadcastState();
    logger.info('設定を更新');
  }
}

function handleDisplay(event) {
  if (event.type === 'playback') {
    try {
      const result = store.reportPlayback(event.id, event.status, event.error);
      if (!result.accepted) return;
      logger.info(`発話状態: ${event.status}`, { id: event.id, error: event.error });
      broadcastState();
      if (result.next) dispatch(result.next);
    } catch (error) {
      logger.error('不正な再生状態を受信', error);
    }
    return;
  }
  if (event.type === 'voices') {
    broadcast('admin', 'voices', { voices: Array.isArray(event.voices) ? event.voices.slice(0, 100) : [] });
  }
}

websocketServer.on('connection', (socket) => {
  const client = { role: null, alive: true };
  clients.set(socket, client);
  socket.on('pong', () => { client.alive = true; });
  socket.on('message', (data) => {
    let event;
    try {
      event = JSON.parse(data.toString());
    } catch {
      send(socket, 'error', { code: 'INVALID_JSON', message: '通信データを解釈できません。' });
      return;
    }
    if (!client.role) {
      if (!['admin', 'display'].includes(event.role) || event.type !== 'hello') {
        socket.close(1008, 'hello required');
        return;
      }
      client.role = event.role;
      if (client.role === 'display') {
        store.connectDisplay();
        logger.info('投影画面が接続');
        broadcastState();
      }
      send(socket, 'state', { state: store.snapshot(), restoreOnly: true });
      return;
    }
    if (client.role === 'admin') handleAdmin(socket, event);
    else handleDisplay(event);
  });
  socket.on('close', () => {
    if (client.role === 'display') {
      store.disconnectDisplay();
      logger.info('投影画面が切断');
      broadcastState();
    }
    clients.delete(socket);
  });
  socket.on('error', (error) => logger.error('WebSocketエラー', error));
});

const heartbeat = setInterval(() => {
  for (const [socket, client] of clients) {
    if (!client.alive) {
      socket.terminate();
      continue;
    }
    client.alive = false;
    socket.ping();
  }
}, 10_000);
heartbeat.unref();

server.on('error', (error) => {
  logger.error('サーバー起動エラー', error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  logger.info('Yokogawa AI System started', { host, port });
  console.log(`\nYokogawa AI System started.\n\nAdmin:\nhttp://localhost:${port}/admin\n\nDisplay:\nhttp://localhost:${port}/display\n`);
});

function shutdown(signal) {
  logger.info(`${signal} を受信。サーバーを終了します。`);
  clearInterval(heartbeat);
  for (const socket of clients.keys()) socket.close(1001, 'server shutdown');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
