export class CueSfxPlayer {
  constructor() { this.active = new Set(); }
  async play(effect, volume = .65) {
    const audio = new Audio(`/api/assets/${encodeURIComponent(effect.assetId)}`);
    audio.volume = Math.min(1, Math.max(0, volume * effect.volume));
    const context = new AudioContext(); const source = context.createMediaElementSource(audio);
    source.connect(context.destination);
    const item = { audio, context }; this.active.add(item);
    const cleanup = () => { this.active.delete(item); audio.pause(); void context.close().catch(() => {}); };
    audio.addEventListener('ended', cleanup, { once: true }); audio.addEventListener('error', cleanup, { once: true });
    try {
      await context.resume();
      if (!this.active.has(item)) { cleanup(); return; }
      await audio.play();
      if (!this.active.has(item)) cleanup();
    } catch (error) { const wasActive = this.active.has(item); cleanup(); if (wasActive) throw error; }
  }
  stop() { for (const { audio, context } of this.active) { audio.pause(); void context.close().catch(() => {}); } this.active.clear(); }
}
