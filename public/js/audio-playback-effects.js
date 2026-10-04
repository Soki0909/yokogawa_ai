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
