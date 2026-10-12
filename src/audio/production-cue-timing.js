// Retiming is data-only: existing canonical progression / scheduler cancellation owns playback.
export function retimeCueSpeech(cue, previousDurationMs, durationMs, segments) {
  const id = cue.cueId ?? cue.id;
  const delta = durationMs - previousDurationMs;
  if (['prod-004', 'prod-v-riddle-enter', 'prod-012'].includes(id)) {
    cue.sequence = (cue.sequence ?? []).map(phase => ({ ...phase, atMs: phase.atMs > 0 ? phase.atMs + delta : 0 }));
    if (cue.transition?.durationMs) cue.transition = { ...cue.transition, durationMs: cue.transition.durationMs + delta };
    if (id === 'prod-004') cue.sfx = (cue.sfx ?? []).map(effect => ({ ...effect, atMs: effect.atMs + delta }));
  }
  if (id === 'prod-011' && segments.length >= 3) {
    cue.sequence = cue.sequence.map((phase, index) => ({ ...phase, atMs: segments[index + 1]?.startMs ?? phase.atMs }));
    cue.transition = { ...cue.transition, durationMs: Math.max(durationMs, cue.sequence.at(-1).atMs + 600) };
  }
  return cue;
}
