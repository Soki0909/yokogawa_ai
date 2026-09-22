export class LipSyncStateMachine {
  constructor({ holdMs = 100, openHigh = .18, openLow = .12, halfHigh = .06, halfLow = .035 } = {}) {
    Object.assign(this, { holdMs, openHigh, openLow, halfHigh, halfLow }); this.state = 'closed'; this.changedAt = 0; this.smoothed = 0;
  }
  update(level, now = performance.now()) {
    const rate = level > this.smoothed ? .45 : .15; this.smoothed += (Math.max(0, level) - this.smoothed) * rate;
    let next = this.state;
    if (this.state === 'open') next = this.smoothed < this.openLow ? (this.smoothed >= this.halfLow ? 'half' : 'closed') : 'open';
    else if (this.state === 'half') next = this.smoothed >= this.openHigh ? 'open' : this.smoothed < this.halfLow ? 'closed' : 'half';
    else next = this.smoothed >= this.openHigh ? 'open' : this.smoothed >= this.halfHigh ? 'half' : 'closed';
    if (next !== this.state && now - this.changedAt >= this.holdMs) { this.state = next; this.changedAt = now; }
    return this.state;
  }
  reset() { this.state = 'closed'; this.smoothed = 0; this.changedAt = 0; return this.state; }
}

export class LipSyncController {
  constructor(element) { this.element = element; this.machine = new LipSyncStateMachine(); this.timer = null; this.frame = null; this.context = null; }
  set(state) { if (this.element) this.element.dataset.mouth = state; }
  stop() { clearInterval(this.timer); cancelAnimationFrame(this.frame); this.context?.close?.(); this.timer = null; this.frame = null; this.context = null; this.set(this.machine.reset()); }
  simulate() { this.stop(); const sequence = ['half', 'open', 'half', 'closed']; let index = 0; this.timer = setInterval(() => this.set(sequence[index++ % sequence.length]), 190); }
  analyse(audio) {
    this.stop(); const Context = globalThis.AudioContext || globalThis.webkitAudioContext; if (!Context) { this.simulate(); return; }
    const context = new Context(); this.context = context; const source = context.createMediaElementSource(audio); const analyser = context.createAnalyser(); analyser.fftSize = 512; source.connect(analyser); analyser.connect(context.destination);
    const data = new Uint8Array(analyser.fftSize); const tick = () => { analyser.getByteTimeDomainData(data); let sum = 0; for (const value of data) { const normalized = (value - 128) / 128; sum += normalized * normalized; } this.set(this.machine.update(Math.sqrt(sum / data.length))); this.frame = requestAnimationFrame(tick); }; tick();
  }
}
