import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const outputRoot = path.join(root, 'dist', 'voice-lab');
const sourceRoot = path.join(root, 'experiments', 'voice-lab', 'production-site');

const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));
const sceneLabels = Object.freeze({
  'scene-1': 'Scene 1',
  'scene-5': 'Scene 5',
  'scene-6': 'Scene 6',
  'scene-7': 'Scene 7',
  'yokogawa-scene-5': '横シーン5',
});

function inside(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

export function resolveAudioSource(publicRoot, relativePath) {
  const audioRoot = path.join(publicRoot, 'assets', 'audio');
  const source = path.resolve(publicRoot, relativePath);
  if (!inside(audioRoot, source) || path.extname(source).toLowerCase() !== '.wav') throw new Error(`Unsafe audio path: ${relativePath}`);
  return source;
}

export function sanitizeSamples(manifest, mainShow, routeShow) {
  if (!Array.isArray(manifest.speeches) || manifest.speeches.length !== 18) throw new Error('Production manifest must contain 18 speeches.');
  const cues = [...mainShow.cues, ...routeShow.cues].filter((cue) => cue.audio?.assetId);
  const cueByAsset = new Map(cues.map((cue) => [cue.audio.assetId, cue]));
  const ids = new Set();
  return manifest.speeches.map((speech) => {
    if (!/^\d{3}$/.test(speech.scriptId) || ids.has(speech.scriptId)) throw new Error(`Invalid or duplicate scriptId: ${speech.scriptId}`);
    ids.add(speech.scriptId);
    const cue = cueByAsset.get(speech.assetId) ?? { avatar: { state: ['005', '006', '007', '008', '009', '011', '012'].includes(speech.scriptId) ? 'hijacked' : 'normal' }, audio: { playbackEffect: ['005', '006', '007', '008', '009'].includes(speech.scriptId) ? 'hijacked-subtle-v1' : 'none' } };
    const effect = cue.audio.playbackEffect ?? 'none';
    if (!['none', 'hijacked-subtle-v1'].includes(effect)) throw new Error(`Unknown playback effect for ${speech.scriptId}: ${effect}`);
    const status = speech.scriptId === '010' ? { id: 'unresolved-placement', label: '配置未確定' }
      : speech.scriptId === '017' ? { id: 'unresolved-script', label: '台本採否未確定' }
        : speech.scriptId === '018' ? { id: 'route', label: '横ルート' }
          : { id: 'active', label: '採用' };
    return {
      scriptId: speech.scriptId,
      scene: sceneLabels[speech.scene] ?? speech.scene,
      state: String(cue.avatar?.state ?? 'normal').toUpperCase(),
      status,
      text: speech.scriptText,
      durationSeconds: Number(speech.durationSeconds.toFixed(3)),
      bytes: speech.bytes,
      audio: `audio/${speech.scriptId}.wav`,
      playbackEffect: effect,
      ...(speech.scriptId === '018' ? { routeScene: '横シーン5' } : {}),
    };
  });
}

export function sanitizeVoiceProfile(profile) {
  return {
    profileId: profile.profileId,
    model: profile.model.name,
    speaker: profile.speaker.name,
    style: profile.style.name,
    parameters: {
      speedScale: profile.parameters.speedScale,
      pitchScale: profile.parameters.pitchScale,
      intonationScale: profile.parameters.intonationScale,
    },
    output: {
      sampleRate: profile.output.sampleRate,
      channels: profile.output.channels,
    },
    attribution: {
      engine: profile.attribution.engine,
      voiceModel: profile.attribution.voiceModel,
    },
  };
}

export async function buildVoiceLabSite() {
  const [manifest, profile, mainShow, routeShow] = await Promise.all([
    readJson('config/production-speech/yokogawa-ai-v1.json'),
    readJson('config/voice-profiles/yokogawa-professor-v1.json'),
    readJson('shows/production.json'),
    readJson('shows/production-yokogawa-route.json'),
  ]);
  const samples = sanitizeSamples(manifest, mainShow, routeShow);
  const publicRoot = path.join(root, 'public');
  const audioRoot = path.join(outputRoot, 'audio');

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(path.join(outputRoot, 'data'), { recursive: true });
  await mkdir(audioRoot, { recursive: true });
  for (const file of ['index.html', 'app.js', 'styles.css', 'line-selection.js']) {
    await cp(path.join(sourceRoot, file), path.join(outputRoot, file));
  }
  await cp(path.join(publicRoot, 'js', 'audio-playback-effects.js'), path.join(outputRoot, 'audio-playback-effects.js'));
  await cp(path.join(root, 'experiments', 'voice-lab', 'shared', 'audio-buffer-player.js'), path.join(outputRoot, 'audio-buffer-player.js'));
  await writeFile(path.join(outputRoot, 'data', 'production-samples.json'), `${JSON.stringify({ schemaVersion: 1, samples }, null, 2)}\n`);
  await writeFile(path.join(outputRoot, 'data', 'voice-profile.json'), `${JSON.stringify(sanitizeVoiceProfile(profile), null, 2)}\n`);

  for (const [index, speech] of manifest.speeches.entries()) {
    const source = resolveAudioSource(publicRoot, speech.path);
    await cp(source, path.join(audioRoot, `${samples[index].scriptId}.wav`));
  }
  return { outputRoot, sampleCount: samples.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildVoiceLabSite();
  console.log(`Voice Lab Production Sampler built: ${result.sampleCount} samples -> ${path.relative(root, result.outputRoot)}`);
}
