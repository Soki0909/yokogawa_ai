import { WebSocket } from 'ws';

const cueId = process.argv[2]?.trim();
const reset = cueId === '--reset';
if (!cueId) throw new Error('Usage: node scripts/execute-cue.js <cue-id|--reset>');

const endpoint = new URL(process.env.VISUAL_BASE_URL ?? 'http://127.0.0.1:3000');
endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
endpoint.pathname = '/ws';

const socket = new WebSocket(endpoint);
let requested = false;
const timeout = setTimeout(() => {
  socket.close();
  throw new Error(`Timed out executing cue ${cueId}`);
}, 5000);

socket.on('open', () => {
  socket.send(JSON.stringify({ type: 'hello', role: 'admin' }));
});

socket.on('message', (raw) => {
  const event = JSON.parse(raw);
  if (!reset && event.type === 'state' && !event.state.cues.some((cue) => cue.cueId === cueId)) {
    clearTimeout(timeout);
    socket.close();
    throw new Error(`Unknown cue: ${cueId}`);
  }
  if (event.type === 'state' && !requested) {
    requested = true;
    socket.send(JSON.stringify(reset ? { type: 'show:reset' } : { type: 'cue:execute', cueId }));
  }
  if (reset && requested && event.type === 'state' && event.state.currentCueIndex === -1) {
    clearTimeout(timeout);
    console.log('Show reset complete');
    socket.close();
  }
  // Display-only cues acknowledge with `cue:<id>`, while cues that also speak
  // acknowledge with the generated message id. This helper owns a short-lived,
  // isolated admin connection, so the first acceptance after our request is the
  // acceptance for this cue.
  if (!reset && requested && event.type === 'accepted') {
    clearTimeout(timeout);
    console.log(`Executed ${cueId}`);
    socket.close();
  }
});

socket.on('error', (error) => {
  clearTimeout(timeout);
  throw error;
});
