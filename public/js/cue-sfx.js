export class CueSfxPlayer {
  constructor({ AudioClass = globalThis.Audio, AudioContextClass = globalThis.AudioContext, contextFactory = null } = {}) { this.active = new Set(); this.completions = new Map(); this.AudioClass = AudioClass; this.AudioContextClass = AudioContextClass; this.contextFactory = contextFactory; }
  async play(effect, volume = .65) {
    const audio = new this.AudioClass(`/api/assets/${encodeURIComponent(effect.assetId)}`);
    audio.volume = Math.min(1, Math.max(0, volume * effect.volume));
    const prepared = this.contextFactory?.();
    const borrowed = prepared && prepared.state !== 'closed';
    const context = borrowed ? prepared : new this.AudioContextClass(); const source = context.createMediaElementSource(audio);
    source.connect(context.destination);
    let settle;
    const done = new Promise(resolve => { settle = resolve; });
    this.completions.set(effect.assetId,done);
    const item = { audio, context, done }; this.active.add(item);
    let cleaned = false;
    const cleanup = (completed = false) => { if (cleaned) return; cleaned = true; this.active.delete(item); settle(completed); audio.pause(); source.disconnect?.(); if (!borrowed) void context.close().catch(() => {}); };
    item.cleanup = cleanup;
    audio.addEventListener('ended', () => cleanup(true), { once: true }); audio.addEventListener('error', () => cleanup(false), { once: true });
    try {
      await context.resume();
      if (!this.active.has(item)) { cleanup(); return; }
      await audio.play();
      if (!this.active.has(item)) cleanup();
    } catch (error) { const wasActive = this.active.has(item); cleanup(); if (wasActive) throw error; }
  }
  async whenIdle(assetId = null) { if (assetId) return this.completions.has(assetId) ? this.completions.get(assetId) : false; return (await Promise.all([...this.active].map(item => item.done))).every(Boolean); }
  stop() { for (const item of [...this.active]) item.cleanup(false); this.active.clear(); this.completions.clear(); }
}
