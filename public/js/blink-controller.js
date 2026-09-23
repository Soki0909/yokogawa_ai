export function randomBlinkTiming(random = Math.random, {
  minDelayMs = 3000, maxDelayMs = 6000, minDurationMs = 100, maxDurationMs = 180,
} = {}) {
  const within = (minimum, maximum) => Math.round(minimum + Math.max(0, Math.min(1, random())) * (maximum - minimum));
  return { delayMs: within(minDelayMs, maxDelayMs), durationMs: within(minDurationMs, maxDurationMs) };
}

export class BlinkController {
  constructor(element, {
    random = Math.random,
    setTimer = globalThis.setTimeout.bind(globalThis),
    clearTimer = globalThis.clearTimeout.bind(globalThis),
    timing = {},
  } = {}) {
    this.element = element;
    this.random = random;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.timing = timing;
    this.timer = null;
    this.durationTimer = null;
    this.running = false;
  }

  set(closed) {
    if (this.element) this.element.dataset.blink = closed ? 'closed' : 'open';
  }

  schedule() {
    if (!this.running) return;
    const { delayMs } = randomBlinkTiming(this.random, this.timing);
    this.timer = this.setTimer(() => this.blink(), delayMs);
  }

  blink() {
    if (!this.running) return;
    const { durationMs } = randomBlinkTiming(this.random, this.timing);
    this.set(true);
    this.durationTimer = this.setTimer(() => {
      this.durationTimer = null;
      if (!this.running) return;
      this.set(false);
      this.schedule();
    }, durationMs);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.set(false);
    this.schedule();
  }

  stop({ closed = false } = {}) {
    this.running = false;
    this.clearTimer(this.timer);
    this.clearTimer(this.durationTimer);
    this.timer = null;
    this.durationTimer = null;
    this.set(closed);
  }

  update({ visible = true, state = 'normal', blackout = false } = {}) {
    if (!visible || blackout) this.stop();
    else if (state === 'shutdown') this.stop({ closed: true });
    else this.start();
  }
}
