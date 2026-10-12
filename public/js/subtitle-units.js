// Audio editing chunks may split a sentence; display units never split by length.
export function sentenceTexts(value) {
  return String(value ?? '').match(/[^。！？!?]+[。！？!?]*(?:[」』”"])?|[。！？!?]+/gu)?.map(s => s.trim()).filter(Boolean) ?? [];
}

export function subtitleUnits(speech = {}, displayText = '') {
  if (speech.subtitleUnits?.length && speech.subtitleUnits.map(s => s.displayText).join('') === displayText) return speech.subtitleUnits;
  const chunks = speech.segments ?? [];
  const text = displayText || chunks.map(s => s.displayText).join('');
  if (!chunks.length) {
    let startMs = 0;
    return sentenceTexts(text).map(displayText => { const endMs = startMs + Array.from(displayText).length * 100; const unit = { displayText, startMs, endMs }; startMs = endMs; return unit; });
  }
  let offset = 0;
  const ranges = chunks.map(s => { const start = offset; offset += s.displayText.length; return { ...s, start, end: offset }; });
  let cursor = 0;
  return sentenceTexts(text).map(sentence => {
    const start = text.indexOf(sentence, cursor); const end = start + sentence.length; cursor = end;
    const first = ranges.find(s => s.end > start); const last = ranges.find(s => s.end >= end) ?? ranges.at(-1);
    const position = (s, pos) => s ? s.startMs + (s.endMs - s.startMs) * Math.min(1, Math.max(0, (pos - s.start) / Math.max(1, s.end - s.start))) : 0;
    return { displayText: sentence, startMs: Math.round(position(first, start)), endMs: Math.round(position(last, end)) };
  });
}

export class TypewriterCaption {
  constructor(render, { now = () => performance.now(), request = fn => requestAnimationFrame(fn), cancel = id => cancelAnimationFrame(id) } = {}) {
    Object.assign(this, { render, now, request, cancel }); this.generation = 0; this.target = null;
  }
  stop() { this.generation++; this.cancel(this.frame); this.frame = null; this.target = null; }
  stable(text) { if (this.target !== null && text === this.target) return; this.stop(); this.render(String(text ?? ''), String(text ?? '')); }
  reveal(text, durationMs) {
    this.stop(); this.target = String(text ?? ''); const letters = Array.from(this.target); const generation = this.generation;
    // Leave reading/paint headroom before the next sentence, including visual changes.
    const started = this.now(); const duration = Math.max(1, Number(durationMs) * .65 || letters.length * 65);
    let count = 0; this.render('', this.target);
    const draw = () => {
      if (generation !== this.generation) return;
      const next = Math.min(letters.length, Math.floor((this.now() - started) / duration * letters.length));
      if (next !== count) { count = next; this.render(letters.slice(0, count).join(''), this.target); }
      if (count < letters.length) this.frame = this.request(draw); else this.frame = null;
    };
    this.frame = this.request(draw);
  }
}
