const COMMANDS = Object.freeze({ ' ': 'cue:next', r: 'cue:replay', R: 'cue:replay', Escape: 'stop', b: 'cue:back', B: 'cue:back', c: 'clear', C: 'clear' });

export function shortcutCommand(event, enabled = true) {
  const target = event.target;
  const editable = Boolean(target?.closest?.('input,textarea,select,[contenteditable=true],dialog'));
  if (!enabled || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || editable) return null;
  return COMMANDS[event.key] ?? null;
}
