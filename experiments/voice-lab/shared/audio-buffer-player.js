export class AudioBufferPlayer {
  constructor({ AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext, fetchImpl = globalThis.fetch?.bind(globalThis), connectEffect, onStateChange = () => {}, now = () => performance.now() } = {}) {
    if (!AudioContextClass || !fetchImpl || !connectEffect) throw new Error('AudioBufferPlayer dependencies are unavailable.');
    this.AudioContextClass = AudioContextClass; this.fetchImpl = fetchImpl; this.connectEffect = connectEffect;
    this.onStateChange = onStateChange; this.now = now; this.context = null; this.buffers = new Map(); this.states = new Map(); this.current = null; this.fetchCount = 0; this.decodeCount = 0;
  }

  status(id) { return this.states.get(id) ?? { status: 'pending', error: null }; }
  get readyCount() { return [...this.states.values()].filter((entry) => entry.status === 'ready').length; }
  get currentTime() { return this.current ? this.current.source ? Math.min(this.current.buffer.duration, this.current.offset + Math.max(0, (this.context?.currentTime ?? 0) - this.current.startedAt)) : this.current.offset : 0; }
  get duration() { return this.current?.buffer.duration ?? 0; }
  get paused() { return !this.current?.source; }

  ensureContext() { this.context ??= new this.AudioContextClass(); return this.context; }
  setState(id, status, error = null) { this.states.set(id, { status, error }); this.onStateChange(id, status, error); }

  async load(item) {
    if (this.status(item.id).status === 'ready') return this.buffers.get(item.id);
    this.setState(item.id, 'loading');
    try {
      this.fetchCount += 1; const response = await this.fetchImpl(item.url, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await this.ensureContext().decodeAudioData(await response.arrayBuffer()); this.decodeCount += 1;
      this.buffers.set(item.id, buffer); this.setState(item.id, 'ready'); return buffer;
    } catch (error) { this.buffers.delete(item.id); this.setState(item.id, 'error', error); throw error; }
  }

  async preload(items, priorityIds = []) {
    const priority = new Set(priorityIds); const first = items.filter((item) => priority.has(item.id)); const rest = items.filter((item) => !priority.has(item.id));
    await Promise.allSettled(first.map((item) => this.load(item)));
    await Promise.allSettled(rest.map((item) => this.load(item)));
  }

  async start(item, effectId = 'none', { offset = 0, onEnded = () => {} } = {}) {
    const buffer = this.buffers.get(item.id);
    if (!buffer || this.status(item.id).status !== 'ready') throw new Error(`Audio is not ready: ${item.id}`);
    this.stop(); const context = this.ensureContext(); if (context.state === 'suspended') await context.resume();
    const source = context.createBufferSource(); source.buffer = buffer; this.connectEffect(context, source, context.destination, effectId);
    const current = { item, buffer, source, effectId, offset, startedAt: context.currentTime, onEnded, stopped: false };
    source.onended = () => { if (this.current !== current || current.stopped) return; this.current = null; onEnded(); };
    this.current = current; const before = this.now(); source.start(0, offset); return { schedulingMs: this.now() - before, duration: buffer.duration };
  }

  pause() {
    if (!this.current?.source) return;
    const current = this.current; current.offset = this.currentTime; current.stopped = true; current.source.stop(); current.source.disconnect?.(); current.source = null;
  }

  async resume() {
    if (!this.current || this.current.source) return null;
    const { item, effectId, offset, onEnded } = this.current;
    return this.start(item, effectId, { offset, onEnded });
  }

  stop() {
    if (!this.current) return;
    const current = this.current; current.stopped = true;
    try { current.source?.stop(); } catch {}
    current.source?.disconnect?.(); this.current = null;
  }

  async clear() {
    this.stop(); this.buffers.clear(); this.states.clear(); const context = this.context; this.context = null; await context?.close?.().catch(() => {});
  }
}
