// One owner for pending Cue phases. Cancel invalidates callbacks even if already queued.
export class CueScheduler {
  constructor({ setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.setTimer = setTimer; this.clearTimer = clearTimer;
    this.timers = new Set(); this.generation = 0; this.onCancel = null;
  }
  schedule(delay, callback) {
    const generation = this.generation;
    const timer = this.setTimer(() => {
      this.timers.delete(timer);
      if (generation === this.generation) callback();
    }, delay);
    timer?.unref?.(); this.timers.add(timer);
  }
  cancel() {
    this.generation++;
    for (const timer of this.timers) this.clearTimer(timer);
    this.timers.clear();
    this.onCancel?.(); this.onCancel = null;
  }
}
