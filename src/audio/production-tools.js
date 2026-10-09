import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { segmentSpeech, composeSpeech, pcmData, encodePcm } from './speech-composer.js';
import { analysePcmWav } from './wav-analysis.js';
import { normalizeAvatar } from '../show-schema.js';

export function installProductionTools(app, { root, client, profile, store, broadcastState }) {
  const drafts = new Map();
  const publicAudio = path.join(root, 'public/assets/audio');
  const manifestPath = path.join(root, 'config/production-speech/yokogawa-ai-v2.json');
  const safeId = value => /^[a-zA-Z0-9_-]{1,100}$/.test(value ?? '');
  const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (error) { res.status(422).json({ error: error.message }); } };
  app.get('/api/production-tools', wrap(async (_req, res) => res.json({ manifest: JSON.parse(await fs.readFile(manifestPath, 'utf8')), profile, cues: store.state.cues })));
  app.post('/api/production-tools/draft', wrap(async (req, res) => {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const speech = structuredClone(manifest.speeches.find(s => s.scriptId === req.body.scriptId));
    if (!speech) throw new Error('SPEECH_NOT_FOUND');
    const currentCue = store.state.cues.find(cue => cue.audio.assetId?.startsWith(`prod-voice-${speech.scriptId}-`));
    const currentAsset = store.state.assets.find(asset => asset.id === currentCue?.audio.assetId);
    if (currentCue?.speech?.segments?.length && currentAsset) Object.assign(speech, { path: currentAsset.path, displayText: currentCue.displayText, spokenText: currentCue.speech.spokenText, segments: currentCue.speech.segments });
    const wav = await fs.readFile(path.join(root, 'public', speech.path));
    const metadata = speech.segments;
    // Align/slice the exact current final take; initial preview requires no generation.
    const pcm = pcmData(wav);
    const buffers = metadata.map(s => encodePcm(pcm.subarray(Math.round(s.startMs * 44.1) * 2, Math.min(pcm.length, Math.round(s.endMs * 44.1) * 2))));
    const id = randomUUID(); const directory = path.join(root, 'data/speech-drafts', id);
    await fs.mkdir(directory, { recursive: true });
    const segments = metadata.map(s => ({ displayText: s.displayText, spokenText: s.spokenText, pauseAfterMs: s.pauseAfterMs ?? 0 }));
    for (const [i, buffer] of buffers.entries()) await fs.writeFile(path.join(directory, `${i}.wav`), buffer);
    drafts.set(id, { id, directory, speech, segments, buffers, generatedText: segments.map(s => s.spokenText) });
    res.json({ id, displayText: speech.displayText, spokenText: speech.spokenText, segments });
  }));
  app.post('/api/production-tools/segment', wrap(async (req, res) => res.json({ segments: segmentSpeech(req.body.displayText, req.body.spokenText) })));
  app.post('/api/production-tools/compose', wrap(async (req, res) => {
    const draft = drafts.get(req.body.id); if (!draft) throw new Error('DRAFT_NOT_FOUND');
    const segments = req.body.segments;
    if (!Array.isArray(segments) || !segments.length || segments.length > 100 || segments.some(s => typeof s.displayText !== 'string' || typeof s.spokenText !== 'string' || !s.spokenText.trim() || s.spokenText.length > 5000)) throw new Error('INVALID_SEGMENTS');
    const buffers = [];
    for (const [i, segment] of segments.entries()) {
      if (draft.generatedText[i] === segment.spokenText && draft.buffers[i]) buffers.push(draft.buffers[i]);
      else buffers.push((await client.synthesize(segment.spokenText, profile)).wav);
      await fs.writeFile(path.join(draft.directory, `${i}.wav`), buffers[i]);
    }
    const result = composeSpeech(segments, buffers);
    Object.assign(draft, { segments, buffers, generatedText: segments.map(s => s.spokenText), result });
    await fs.writeFile(path.join(draft.directory, 'full.wav'), result.wav);
    await fs.writeFile(path.join(draft.directory, 'recipe.json'), JSON.stringify({ segments: result.timeline, profileId: profile.profileId, sha256: result.verification.wav.sha256 }, null, 2));
    res.json({ id: draft.id, segments: result.timeline, verification: result.verification, url: `/api/production-tools/audio/${draft.id}/full` });
  }));
  app.get('/api/production-tools/audio/:id/:part', wrap(async (req, res) => {
    const draft = drafts.get(req.params.id);
    if (!draft || !/^(full|\d{1,3})$/.test(req.params.part)) throw new Error('DRAFT_AUDIO_NOT_FOUND');
    res.type('audio/wav').sendFile(path.join(draft.directory, `${req.params.part}.wav`));
  }));
  app.post('/api/production-tools/export', wrap(async (req, res) => {
    const draft = drafts.get(req.body.id); if (!draft?.result) throw new Error('COMPOSE_BEFORE_EXPORT');
    const { wav, timeline, verification } = draft.result; const sha256 = analysePcmWav(wav).sha256;
    const filename = `production-edit-${draft.speech.scriptId}-${sha256.slice(0, 16)}.wav`;
    await fs.writeFile(path.join(publicAudio, filename), wav);
    const asset = { id: `prod-voice-${draft.speech.scriptId}-edit-${sha256.slice(0, 16)}`, name: `Edited ${draft.speech.scriptId}`, path: `assets/audio/${filename}`, mimeType: 'audio/wav', sha256 };
    const recipe = { scriptId: draft.speech.scriptId, displayText: timeline.map(s => s.displayText).join(''), spokenText: timeline.map(s => s.spokenText).join(''), voiceProfileId: profile.profileId, profileHash: draft.speech.profileHash, asset, segments: timeline, verification };
    await fs.writeFile(path.join(publicAudio, filename.replace('.wav', '.json')), JSON.stringify(recipe, null, 2));
    res.json(recipe);
  }));
  app.post('/api/production-tools/apply', wrap(async (req, res) => {
    if (!safeId(req.body.cueId) || !safeId(req.body.id)) throw new Error('INVALID_ID');
    const draft = drafts.get(req.body.id); const cue = store.state.cues.find(c => c.cueId === req.body.cueId);
    if (!draft?.result || !cue) throw new Error('DRAFT_OR_CUE_NOT_FOUND');
    const sha = draft.result.verification.wav.sha256; const filename = `production-edit-${draft.speech.scriptId}-${sha.slice(0, 16)}.wav`;
    await fs.access(path.join(publicAudio, filename)); // Explicit export is mandatory before applying.
    const asset = { id: `prod-voice-${draft.speech.scriptId}-edit-${sha.slice(0, 16)}`, name: `Edited ${draft.speech.scriptId}`, path: `assets/audio/${filename}`, mimeType: 'audio/wav', sha256: sha };
    store.state.assets = store.state.assets.filter(a => a.id !== asset.id).concat(asset);
    store.saveCue({ ...cue, speechText: draft.segments.map(s => s.spokenText).join(''), displayText: draft.segments.map(s => s.displayText).join(''), audio: { ...cue.audio, assetId: asset.id }, speech: { spokenText: draft.segments.map(s => s.spokenText).join(''), segments: draft.result.timeline } });
    await store.persist(); broadcastState(); res.json({ applied: true, cueId: cue.cueId });
  }));
  app.post('/api/production-tools/puzzle', wrap(async (req, res) => {
    if (!['first', 'final', 'emergency'].includes(req.body.slot)) throw new Error('INVALID_PUZZLE_SLOT');
    const match = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(req.body.image ?? '');
    if (!match) throw new Error('IMAGE_FORMAT_PNG_JPEG_WEBP_REQUIRED');
    const bytes = Buffer.from(match[3], 'base64');
    if (bytes.length > 8 * 1024 * 1024 || bytes.length < 16) throw new Error('IMAGE_SIZE');
    const valid = match[2] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : match[2] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) throw new Error('IMAGE_SIGNATURE_MISMATCH');
    const filename = `puzzle-${req.body.slot}-${randomUUID()}.${match[2] === 'jpeg' ? 'jpg' : match[2]}`;
    await fs.writeFile(path.join(root, 'public/assets/visual', filename), bytes);
    const asset = store.state.assets.find(a => a.id === `puzzle-${req.body.slot}`);
    if (!asset) throw new Error('PUZZLE_SLOT_NOT_IN_CURRENT_SHOW');
    Object.assign(asset, { path: `assets/visual/${filename}`, mimeType: match[1], name: `${req.body.slot}問題画像（提供済み）`, sha256: createHash('sha256').update(bytes).digest('hex') });
    const update = visual => { if (visual?.assetId === asset.id) { visual.message = ''; visual.assetVersion = asset.sha256; } };
    for (const cue of store.state.cues) { update(cue.visual); cue.sequence.forEach(phase => update(phase.visual)); }
    update(store.state.currentVisual); for (const display of store.state.displays) update(display.currentVisual);
    await store.persist(); broadcastState(); res.json({ asset, saveReminder: '現在のShowを保存してください。Production Resetは同梱版へ戻します。' });
  }));
  app.post('/api/production-tools/avatar', wrap(async (req, res) => {
    const avatar = normalizeAvatar({ ...store.state.avatar, layers: req.body.layers });
    if (!avatar.layers) throw new Error('INVALID_AVATAR_LAYER_PATHS');
    for (const filename of Object.values(avatar.layers)) await fs.access(path.join(root, 'public', filename));
    store.state.avatar = avatar; store.state.currentAvatar = { ...store.state.currentAvatar, layers: avatar.layers };
    for (const display of store.state.displays) display.currentAvatar = { ...display.currentAvatar, layers: avatar.layers };
    await store.persist(); broadcastState(); res.json({ avatar });
  }));
}
