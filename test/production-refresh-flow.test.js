import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path'; import os from 'node:os'; import net from 'node:net';
import { WebSocket } from 'ws';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const portFor = () => new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)); }); });
function connect(port, role, display) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`); const events = [];
  socket.on('message', raw => {const event=JSON.parse(raw);if(role==='display' && event.type==='cue:prepare')socket.send(JSON.stringify({type:'cue:prepared',token:event.token,ready:true}));events.push(event);});
  const next = async predicate => { const end = Date.now() + 10000; while (Date.now() < end) { const index = events.findIndex(predicate); if (index >= 0) return events.splice(index, 1)[0]; await delay(10); } throw new Error('REFRESH_EVENT_TIMEOUT'); };
  return new Promise(resolve => socket.once('open', async () => { socket.send(JSON.stringify({ type: 'hello', role, display })); const initial = await next(e => e.type === 'state'); resolve({ socket, events, initial, next, send: e => socket.send(JSON.stringify(e)) }); }));
}
test('default startup replaces stale saved show; Production Reset retains registration and Ready', async t => {
  const port = await portFor(); const directory = await mkdtemp(path.join(os.tmpdir(), 'refresh-flow-'));
  await writeFile(path.join(directory, 'state.json'), JSON.stringify({ metadata: { title: 'Old custom Show' }, currentSubtitle: '古いセリフ', currentCueIndex: 4, blackout: true }));
  const child = spawn(process.execPath, ['src/server.js'], { windowsHide: true, stdio: 'ignore', env: { ...process.env, SHOW_STARTUP_MODE: 'bundled', PORT: String(port), HOST: '127.0.0.1', STATE_FILE: path.join(directory, 'state.json'), LOG_DIRECTORY: path.join(directory, 'logs'), AIVIS_ENGINE_URL: 'http://127.0.0.1:9' } });
  t.after(() => child.kill()); const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/health`)).ok) break; } catch {} await delay(50); }
  const admin = await connect(port, 'admin'); const display = await connect(port, 'display', { displayId: 'refresh-stage', displayName: 'Stage', audioEnabled: true });
  t.after(() => { admin.socket.close(); display.socket.close(); });
  assert.equal(admin.initial.state.metadata.version, 'production-reliability-20261014'); assert.equal(admin.initial.state.currentSubtitle, null); assert.equal(admin.initial.state.currentCueIndex, -1);
  display.send({ type: 'audio:ready', protocol:'decoded-v1' }); await admin.next(e => e.type === 'state' && e.state.displayAudioReady);
  admin.send({ type: 'cue:execute', cueId: 'prod-003' }); const speech = await display.next(e => e.type === 'speak');
  display.send({ type: 'playback', id: speech.message.id, status: 'speaking' });
  const subtitle = await display.next(e => e.type === 'subtitle'); assert.equal(subtitle.text, speech.message.speech.segments[0].displayText);
  admin.send({ type: 'production:reset' }); await display.next(e => e.type === 'show:reset');
  const reset = await admin.next(e => e.type === 'state' && e.state.currentCueIndex === -1 && e.state.displayAudioReady);
  assert.equal(reset.state.currentVisual.visible, false); assert.equal(reset.state.currentSubtitle, null); assert.equal(reset.state.currentAvatar.visible, false); assert.equal(reset.state.blackout, false);
  assert.equal(reset.state.audioMasterId, 'refresh-stage'); assert.equal(reset.state.displays[0].displayName, 'Stage');
  const manifest = await fetch(`${base}/api/audio-assets`).then(r => r.json()); assert.equal(manifest.expectedCount, 20);
  // Pending SFX must never fire after BACK or Production Reset.
  admin.send({ type: 'cue:execute', cueId: 'prod-001' }); await display.next(e => e.type === 'presentation');
  admin.send({ type: 'cue:back' }); await display.next(e => e.type === 'stop'); await delay(600);
  assert.equal(display.events.some(e => e.type === 'sfx' && e.effect.assetId === 'prod-sfx-boot'), false);
  const post = (route, body) => fetch(`${base}/api/production-tools${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const draft = await (await post('/draft', { scriptId: '001' })).json();
  const composed = await (await post('/compose', { id: draft.id, segments: draft.segments })).json(); assert.equal(composed.verification.pass, true);
  const exported = await (await post('/export', { id: draft.id })).json(); assert.match(exported.asset.sha256, /^[a-f0-9]{64}$/);
  assert.equal((await post('/apply', { id: draft.id, cueId: 'prod-001' })).status, 200);
  const reopened = await (await post('/draft', { scriptId: '001' })).json(); assert.deepEqual(reopened.segments.map(s => s.displayText), draft.segments.map(s => s.displayText));
  const warningDraft = await (await post('/draft', { scriptId: '014' })).json();
  await post('/compose', { id: warningDraft.id, segments: warningDraft.segments }); await post('/export', { id: warningDraft.id });
  admin.send({ type: 'cue:execute', cueId: 'prod-014' }); await admin.next(e => e.type==='state' && e.state.currentCue?.cueId==='prod-014');
  assert.equal((await post('/apply', { id: warningDraft.id, cueId: 'prod-014' })).status,422,'cannot replace a pending delayed Cue');
  admin.send({ type:'stop' }); await admin.next(e => e.type==='state' && e.state.playbackStatus==='stopped');
  assert.equal((await post('/apply', { id: warningDraft.id, cueId:'prod-014' })).status,200);
  assert.equal((await post('/avatar', { layers: { base: '../../secret' } })).status, 422);
  assert.equal((await post('/puzzle', { slot: 'final', image: 'data:image/png;base64,AAAA' })).status, 422);
  // Production must fail closed when the Audio Master is missing; visuals cannot go ahead.
  admin.send({ type: 'audio-master:set', displayId: null });
  await display.next(e => e.type === 'state' && !e.isAudioMaster);
  admin.send({ type: 'cue:execute', cueId: 'prod-003' });
  await admin.next(e=>e.type==='error' && e.code==='AUDIO_NOT_READY');
  admin.send({ type: 'stop' }); await display.next(e => e.type === 'stop');
});
