export class AudioBufferPlayer {
  constructor({ AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext, fetchImpl = globalThis.fetch?.bind(globalThis), connectEffect, onStateChange = () => {}, onDiagnostic = () => {}, now = () => performance.now(), fetchConcurrency = 4 } = {}) {
    if (!AudioContextClass || !fetchImpl || !connectEffect) throw new Error('AudioBufferPlayer dependencies are unavailable.');
    this.AudioContextClass = AudioContextClass; this.fetchImpl = fetchImpl; this.connectEffect = connectEffect;
    this.onStateChange = onStateChange; this.onDiagnostic = onDiagnostic; this.now = now; this.fetchConcurrency = Math.max(1, Math.min(4, fetchConcurrency));
    this.context = null; this.contextCount = 0; this.buffers = new Map(); this.states = new Map(); this.current = null;
    this.fetchCount = 0; this.decodeCount = 0; this.fetchInProgress = 0; this.decodeInProgress = 0; this.maxDecodeInProgress = 0; this.decodeQueueLength = 0;
    this.decodeTail = Promise.resolve(); this.playbackIdleWaiters = []; this.controllers = new Set(); this.generation = 0; this.disposed = false;
    this.lastAudioError = null; this.lastResumeResult = 'not-needed'; this.lastContextStateChange = null;
  }

  status(id) { return this.states.get(id) ?? { status: 'pending', error: null }; }
  get readyCount() { return [...this.states.values()].filter((entry) => entry.status === 'ready').length; }
  get errorCount() { return [...this.states.values()].filter((entry) => entry.status === 'error').length; }
  get currentTime() { return this.current ? this.current.source ? Math.min(this.current.buffer.duration, this.current.offset + Math.max(0, (this.context?.currentTime ?? 0) - this.current.startedAt)) : this.current.offset : 0; }
  get duration() { return this.current?.buffer.duration ?? 0; }
  get paused() { return !this.current?.source; }
  get isPlaying() { return Boolean(this.current?.source); }

  diagnostic(trigger, detail = {}) { this.onDiagnostic({ timestamp: new Date().toISOString(), trigger, ...detail }); }
  setState(id, status, error = null) { this.states.set(id, { status, error }); this.onStateChange(id, status, error); }

  ensureContext(trigger = 'ensure-context') {
    if (this.disposed) throw new Error('AudioBufferPlayer is disposed.');
    if (this.context && this.context.state !== 'closed') return this.context;
    const previous = this.context?.state ?? 'none'; const context = new this.AudioContextClass(); this.context = context; this.contextCount += 1;
    context.addEventListener?.('statechange', () => {
      const next = context.state; const prior = this.lastContextStateChange?.newState ?? previous;
      this.lastContextStateChange = { timestamp: new Date().toISOString(), previousState: prior, newState: next, trigger: 'context-statechange' };
      this.diagnostic('context-statechange', { previousState: prior, newState: next });
    });
    this.diagnostic(trigger, { previousState: previous, newState: context.state }); return context;
  }

  recover(trigger = 'lifecycle-recovery') {
    if (this.disposed) return { state: 'disposed', recreated: false };
    const wasClosed = this.context?.state === 'closed'; const context = this.ensureContext(trigger);
    this.diagnostic(trigger, { contextState: context.state, recreated: wasClosed });
    return { state: context.state, recreated: wasClosed };
  }

  async resumeForPlayback() {
    const context = this.ensureContext('play-gesture');
    if (context.state === 'running') { this.lastResumeResult = 'already-running'; this.diagnostic('resume-not-needed', { contextState: context.state }); return context; }
    try { await context.resume(); this.lastResumeResult = `resumed:${context.state}`; this.diagnostic('resume-success', { contextState: context.state }); return context; }
    catch (error) { this.lastAudioError = error.message; this.lastResumeResult = `failed:${error.message}`; this.diagnostic('resume-failure', { contextState: context.state, error: error.message }); throw error; }
  }

  waitForPlaybackIdle() {
    if (!this.isPlaying) return Promise.resolve();
    return new Promise((resolve) => this.playbackIdleWaiters.push(resolve));
  }
  signalPlaybackIdle() { for (const resolve of this.playbackIdleWaiters.splice(0)) resolve(); this.diagnostic('playback-idle'); }

  enqueueDecode(arrayBuffer, generation) {
    this.decodeQueueLength += 1; this.diagnostic('decode-queued', { decodeQueueLength: this.decodeQueueLength });
    const job = this.decodeTail.then(async () => {
      this.decodeQueueLength -= 1; await this.waitForPlaybackIdle();
      if (generation !== this.generation || this.disposed) throw new Error('Audio preload was cancelled.');
      this.decodeInProgress += 1; this.maxDecodeInProgress = Math.max(this.maxDecodeInProgress, this.decodeInProgress); this.diagnostic('decode-start');
      try { const buffer = await this.ensureContext('decode').decodeAudioData(arrayBuffer); this.decodeCount += 1; return buffer; }
      finally { this.decodeInProgress -= 1; this.diagnostic('decode-end'); }
    });
    this.decodeTail = job.catch(() => {}); return job;
  }

  async load(item) {
    if (this.disposed) throw new Error('AudioBufferPlayer is disposed.');
    if (this.status(item.id).status === 'ready') return this.buffers.get(item.id);
    const generation = this.generation; const controller = new AbortController(); this.controllers.add(controller); this.setState(item.id, 'fetching');
    try {
      this.fetchCount += 1; this.fetchInProgress += 1; this.diagnostic('fetch-start', { sampleId: item.id });
      const response = await this.fetchImpl(item.url, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`); const arrayBuffer = await response.arrayBuffer();
      this.fetchInProgress -= 1; this.setState(item.id, 'decoding'); const buffer = await this.enqueueDecode(arrayBuffer, generation);
      if (generation !== this.generation || this.disposed) throw new Error('Audio preload was cancelled.');
      this.buffers.set(item.id, buffer); this.setState(item.id, 'ready'); return buffer;
    } catch (error) {
      if (this.fetchInProgress > 0 && this.status(item.id).status === 'fetching') this.fetchInProgress -= 1;
      this.buffers.delete(item.id); this.lastAudioError = error.message;
      if (generation === this.generation && !this.disposed) this.setState(item.id, 'error', error);
      this.diagnostic('load-error', { sampleId: item.id, error: error.message }); throw error;
    } finally { this.controllers.delete(controller); }
  }

  async preload(items, priorityIds = []) {
    const priority = new Set(priorityIds); const queue = [...items.filter((item) => priority.has(item.id)), ...items.filter((item) => !priority.has(item.id))];
    const generation = this.generation; const worker = async () => {
      while (queue.length && generation === this.generation && !this.disposed) { const item = queue.shift(); await this.load(item).catch(() => {}); }
    };
    await Promise.all(Array.from({ length: Math.min(this.fetchConcurrency, queue.length) }, worker));
  }

  async start(item, effectId = 'none', { offset = 0, onEnded = () => {} } = {}) {
    const buffer = this.buffers.get(item.id);
    if (!buffer || this.status(item.id).status !== 'ready') throw new Error(`Audio is not ready: ${item.id}`);
    this.stop(); const context = await this.resumeForPlayback();
    const source = context.createBufferSource(); source.buffer = buffer; this.connectEffect(context, source, context.destination, effectId);
    const current = { item, buffer, source, effectId, offset, startedAt: context.currentTime, onEnded, stopped: false };
    source.onended = () => { if (this.current !== current || current.stopped) return; this.current = null; this.signalPlaybackIdle(); this.diagnostic('playback-ended', { sampleId: item.id }); onEnded(); };
    this.current = current; const before = this.now(); source.start(0, offset); const schedulingMs = this.now() - before;
    this.diagnostic('playback-start', { sampleId: item.id, effectId, schedulingMs }); return { schedulingMs, duration: buffer.duration };
  }

  pause() {
    if (!this.current?.source) return;
    const current = this.current; current.offset = this.currentTime; current.stopped = true; current.source.stop(); current.source.disconnect?.(); current.source = null; this.signalPlaybackIdle(); this.diagnostic('playback-pause', { sampleId: current.item.id });
  }
  async resume() { if (!this.current || this.current.source) return null; const { item, effectId, offset, onEnded } = this.current; return this.start(item, effectId, { offset, onEnded }); }
  stop() {
    if (!this.current) return;
    const current = this.current; current.stopped = true; try { current.source?.stop(); } catch {} current.source?.disconnect?.(); this.current = null; this.signalPlaybackIdle(); this.diagnostic('playback-stop', { sampleId: current.item.id });
  }

  async clear() {
    this.generation += 1; this.disposed = true; this.stop(); for (const controller of this.controllers) controller.abort(); this.controllers.clear(); this.signalPlaybackIdle();
    this.buffers.clear(); this.states.clear(); this.playbackIdleWaiters.splice(0); const context = this.context; this.context = null; await context?.close?.().catch(() => {}); this.diagnostic('player-cleared');
  }
}
