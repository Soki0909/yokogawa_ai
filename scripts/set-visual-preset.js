import { WebSocket } from 'ws';

const preset = process.env.PRESET ?? process.argv[2];
const targetDisplayId = process.env.TARGET_DISPLAY_ID?.trim() || '';
const presets = new Set(['normal', 'warning', 'hijacked', 'hostile', 'shutdown', 'recovery']);
if (!presets.has(preset)) throw new Error(`PRESET must be one of: ${[...presets].join(', ')}`);

const endpoint = new URL(process.env.VISUAL_BASE_URL ?? 'http://127.0.0.1:3124');
endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
endpoint.pathname = '/ws';

function connect(role, display) {
  const socket = new WebSocket(endpoint);
  const queue = [];
  const waiters = [];
  const next = (predicate, timeout = 5000) => {
    const index = queue.findIndex(predicate);
    if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve };
      waiters.push(waiter);
      setTimeout(() => {
        const current = waiters.indexOf(waiter);
        if (current >= 0) waiters.splice(current, 1);
        reject(new Error(`Timed out waiting for ${role} event`));
      }, timeout).unref();
    });
  };
  socket.on('message', (raw) => {
    const event = JSON.parse(raw);
    const index = waiters.findIndex(({ predicate }) => predicate(event));
    if (index >= 0) waiters.splice(index, 1)[0].resolve(event);
    else queue.push(event);
  });
  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.once('open', async () => {
      socket.send(JSON.stringify({ type: 'hello', role, ...(display ? { display } : {}) }));
      resolve({ socket, initial: await next((event) => event.type === 'state'), next, send: (event) => socket.send(JSON.stringify(event)) });
    });
  });
}

const cueId = `visual-${preset}${targetDisplayId ? `-${targetDisplayId}` : ''}`;
const target = targetDisplayId ? { type: 'display', id: targetDisplayId } : { type: 'all' };
const display = await connect('display', { displayId: 'visual-review-helper', displayName: 'Visual Review Helper', audioEnabled: false });
const admin = await connect('admin');

if (!admin.initial.state.cues.some((cue) => cue.cueId === cueId)) {
  admin.send({
    type: 'cue:save',
    cue: {
      cueId, cueNumber: 'VISUAL', cueName: `Visual ${preset}`, enabled: true,
      route: 'main', sceneId: '', location: 'visual-review', kind: 'display-only',
      speechText: '', displayText: 'プリンキピアについて説明します。',
      operatorNote: '', triggerNote: '', target,
      presentationPreset: preset,
      avatar: { visible: true, state: preset, mode: 'image-yokogawa-v1', assetSetId: 'yokogawa-v1' },
      audio: { speechMode: 'none', assetId: null, lipSyncMode: 'none' },
    },
  });
  await admin.next((event) => event.type === 'state' && event.state.cues.some((cue) => cue.cueId === cueId));
}

admin.send({ type: 'cue:execute', cueId });
await Promise.all([
  ...(targetDisplayId ? [] : [display.next((event) => event.type === 'presentation' && event.preset?.id === preset)]),
  admin.next((event) => event.type === 'accepted' && event.id === `cue:${cueId}`),
]);
display.socket.close();
admin.socket.close();
