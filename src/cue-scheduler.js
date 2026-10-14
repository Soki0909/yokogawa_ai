// One owner for pending Cue phases. Cancel invalidates callbacks even if already queued.
export class CueScheduler {
  constructor({ setTimer = setTimeout, clearTimer = clearTimeout, now = () => performance.now(), wall = () => Date.now(), maxLatenessMs = 1500 } = {}) {
    this.setTimer = setTimer; this.clearTimer = clearTimer;
    this.timers = new Set(); this.generation = 0; this.onCancel = null;
    this.now = now; this.wall = wall; this.maxLatenessMs = maxLatenessMs; this.onStall = null;
  }
  schedule(delay, callback) {
    const generation = this.generation;
    const deadline = this.now() + delay;
    const wallDeadline = this.wall() + delay;
    const timer = this.setTimer(() => {
      this.timers.delete(timer);
      if (generation !== this.generation) return;
      if (this.now() - deadline > this.maxLatenessMs || Math.abs((this.wall() - wallDeadline) - (this.now() - deadline)) > 5000) { this.cancel(); this.onStall?.(); return; }
      callback();
    }, delay);
    timer?.unref?.(); this.timers.add(timer);
  }
  cancel() {
    this.onInvalidate?.();
    this.generation++;
    for (const timer of this.timers) this.clearTimer(timer);
    this.timers.clear();
    this.onCancel?.(); this.onCancel = null;
  }
}
