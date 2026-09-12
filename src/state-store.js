import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_SETTINGS = Object.freeze({
  rate: 1,
  pitch: 0.9,
  volume: 1,
  voiceURI: '',
  subtitlesEnabled: true,
  historyLimit: 100,
});

const PLAYBACK_STATUSES = new Set([
  'idle', 'received', 'speaking', 'completed', 'stopped', 'error',
]);

function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export class StateStore {
  constructor({ stateFile, logger = console } = {}) {
    this.stateFile = stateFile;
    this.logger = logger;
    this.state = {
      displayConnectionStatus: 'disconnected',
      displayAudioReady: false,
      currentMessage: null,
      playbackStatus: 'idle',
      queue: [],
      history: [],
      settings: { ...DEFAULT_SETTINGS },
    };
    this.displayCount = 0;
    this.persistChain = Promise.resolve();
  }

  async load() {
    if (!this.stateFile) return;
    try {
      const stored = JSON.parse(await readFile(this.stateFile, 'utf8'));
      this.state.settings = this.validateSettings(stored.settings ?? {});
      const interrupted = new Set(['queued', 'received', 'speaking']);
      this.state.history = (Array.isArray(stored.history) ? stored.history : []).map((item) => {
        if (!interrupted.has(item.status)) return item;
        return {
          ...item,
          status: 'error',
          finishedAt: new Date().toISOString(),
          error: 'サーバー再起動により発話が中断されました。必要なら再読み上げしてください。',
        };
      });
      this.trimHistory();
    } catch (error) {
      if (error.code !== 'ENOENT') this.logger.error('状態ファイルを読み込めません', error);
    }
  }

  snapshot() {
    return structuredClone(this.state);
  }

  connectDisplay() {
    this.displayCount += 1;
    this.state.displayConnectionStatus = 'connected';
    this.state.displayAudioReady = false;
  }

  disconnectDisplay() {
    this.displayCount = Math.max(0, this.displayCount - 1);
    this.state.displayConnectionStatus = this.displayCount > 0 ? 'connected' : 'disconnected';
    if (this.displayCount === 0) this.state.displayAudioReady = false;
    if (this.displayCount === 0 && this.state.currentMessage) {
      this.updateCurrent('error', '投影画面との接続が切れました。履歴から再読み上げしてください。');
      this.state.currentMessage = null;
      this.state.playbackStatus = 'error';
      for (const queued of this.state.queue) {
        this.updateHistory(queued.id, { status: 'error', error: '投影画面切断によりキューを解除しました。' });
      }
      this.state.queue = [];
      void this.persist();
    }
  }

  setDisplayAudioReady(ready) {
    this.state.displayAudioReady = this.displayCount > 0 && ready === true;
  }

  createMessage(text, { replayOf = null } = {}) {
    const normalized = safeText(text);
    if (!normalized) throw new Error('EMPTY_TEXT');
    if (normalized.length > 5000) throw new Error('TEXT_TOO_LONG');
    const message = {
      id: `msg-${randomUUID()}`,
      text: normalized,
      createdAt: new Date().toISOString(),
      status: 'queued',
      ...(replayOf ? { replayOf } : {}),
    };
    this.state.history.unshift(message);
    this.trimHistory();
    return message;
  }

  enqueue(message) {
    if (!this.state.currentMessage) {
      this.state.currentMessage = message;
      this.state.playbackStatus = 'received';
      this.updateHistory(message.id, { status: 'received' });
      return { dispatch: message, queued: false };
    }
    this.state.queue.push(message);
    void this.persist();
    return { dispatch: null, queued: true };
  }

  reportPlayback(id, status, error) {
    if (!PLAYBACK_STATUSES.has(status)) throw new Error('INVALID_STATUS');
    if (!this.state.currentMessage || this.state.currentMessage.id !== id) {
      return { accepted: false, next: null };
    }
    this.updateCurrent(status, error);
    if (['completed', 'stopped', 'error'].includes(status)) {
      this.state.currentMessage = null;
      if (status === 'error') {
        for (const queued of this.state.queue) {
          this.updateHistory(queued.id, { status: 'error', error: 'TTSエラーによりキューを解除しました。設定確認後に再送してください。' });
        }
        this.state.queue = [];
        void this.persist();
        return { accepted: true, next: null };
      }
      const next = this.state.queue.shift() ?? null;
      if (next) {
        this.state.currentMessage = next;
        this.state.playbackStatus = 'received';
        this.updateHistory(next.id, { status: 'received' });
      } else {
        this.state.playbackStatus = status;
      }
      void this.persist();
      return { accepted: true, next };
    }
    return { accepted: true, next: null };
  }

  updateCurrent(status, error) {
    this.state.playbackStatus = status;
    const patch = { status };
    if (status === 'speaking') patch.startedAt = new Date().toISOString();
    if (['completed', 'stopped', 'error'].includes(status)) patch.finishedAt = new Date().toISOString();
    if (error) patch.error = String(error).slice(0, 500);
    this.updateHistory(this.state.currentMessage.id, patch);
  }

  updateHistory(id, patch) {
    const item = this.state.history.find((entry) => entry.id === id);
    if (item) Object.assign(item, patch);
  }

  validateSettings(input) {
    const numberInRange = (value, fallback, min, max) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
    };
    return {
      rate: numberInRange(input.rate, DEFAULT_SETTINGS.rate, 0.5, 2),
      pitch: numberInRange(input.pitch, DEFAULT_SETTINGS.pitch, 0, 2),
      volume: numberInRange(input.volume, DEFAULT_SETTINGS.volume, 0, 1),
      voiceURI: typeof input.voiceURI === 'string' ? input.voiceURI.slice(0, 300) : '',
      subtitlesEnabled: input.subtitlesEnabled !== false,
      historyLimit: Math.round(numberInRange(input.historyLimit, DEFAULT_SETTINGS.historyLimit, 20, 500)),
    };
  }

  setSettings(patch) {
    this.state.settings = this.validateSettings({ ...this.state.settings, ...patch });
    this.trimHistory();
    void this.persist();
    return this.state.settings;
  }

  trimHistory() {
    this.state.history = this.state.history.slice(0, this.state.settings.historyLimit);
  }

  async persist() {
    if (!this.stateFile) return;
    const snapshot = JSON.stringify({ history: this.state.history, settings: this.state.settings }, null, 2);
    this.persistChain = this.persistChain.then(async () => {
      try {
        await mkdir(path.dirname(this.stateFile), { recursive: true });
        const temporary = `${this.stateFile}.tmp`;
        await writeFile(temporary, snapshot, 'utf8');
        await rename(temporary, this.stateFile);
      } catch (error) {
        this.logger.error('状態を保存できません', error);
      }
    });
    return this.persistChain;
  }
}
