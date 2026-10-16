export const PLAYBACK_EFFECTS = Object.freeze({
  none: Object.freeze({ id: 'none' }),
  'hijacked-subtle-v1': Object.freeze({
    id: 'hijacked-subtle-v1',
    highpassHz: 115,
    highpassQ: .55,
    lowpassHz: 5600,
    lowpassQ: .45,
    dryGain: .94,
    delaySeconds: .011,
    wetGain: .085,
  }),
});

// Optional SFX window, using the audio clock so background timers cannot extend it.
export function playbackDurationSeconds(seconds, maxDurationMs) {
  return Number.isFinite(maxDurationMs) && maxDurationMs > 0 ? Math.min(seconds, maxDurationMs / 1000) : seconds;
}

export function startPlaybackWindow(context, source, gain, {maxDurationMs, fadeOutMs = 0, startAt} = {}) {
  if (!(Number.isFinite(maxDurationMs) && maxDurationMs > 0)) {
    if (startAt === undefined) source.start(); else source.start(startAt);
    return;
  }
  const start = startAt ?? context.currentTime, duration = playbackDurationSeconds(source.buffer.duration, maxDurationMs);
  const fade = Math.min(Math.max(0, Number(fadeOutMs) || 0) / 1000, duration / 2);
  if (fade > 0) {
    gain.gain.setValueAtTime(gain.gain.value, start);
    gain.gain.setValueAtTime(gain.gain.value, start + duration - fade);
    gain.gain.linearRampToValueAtTime(0, start + duration);
  }
  source.start(start, 0, duration);
}

export function assertPlaybackEffect(effectId = 'none') {
  const effect = PLAYBACK_EFFECTS[effectId];
  if (!effect) throw new Error(`Unknown playback effect: ${effectId}`);
  return effect;
}

export function connectPlaybackEffect(context, source, destination, effectId = 'none') {
  const effect = assertPlaybackEffect(effectId);
  if (effect.id === 'none') {
    source.connect(destination);
    return [];
  }

  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass'; highpass.frequency.value = effect.highpassHz; highpass.Q.value = effect.highpassQ;
  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass'; lowpass.frequency.value = effect.lowpassHz; lowpass.Q.value = effect.lowpassQ;
  const dry = context.createGain(); dry.gain.value = effect.dryGain;
  const delay = context.createDelay(.05); delay.delayTime.value = effect.delaySeconds;
  const wet = context.createGain(); wet.gain.value = effect.wetGain;

  source.connect(highpass); highpass.connect(lowpass);
  lowpass.connect(dry); dry.connect(destination);
  lowpass.connect(delay); delay.connect(wet); wet.connect(destination);
  return [highpass, lowpass, dry, delay, wet];
}
