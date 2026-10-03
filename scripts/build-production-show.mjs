import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateShowFile } from '../src/show-schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'config/production-speech/yokogawa-ai-v1.json'), 'utf8'));
const demo = JSON.parse(await fs.readFile(path.join(root, 'shows/phase-a-demo.json'), 'utf8'));
const byId = new Map(manifest.speeches.map((speech) => [speech.scriptId, speech]));

const assets = manifest.speeches.map((speech) => ({
  id: speech.assetId,
  name: `横川AI Production ${speech.scriptId}`,
  path: speech.path,
  mimeType: 'audio/wav',
  ...(speech.sha256 ? { sha256: speech.sha256 } : {}),
}));

const common = {
  schemaVersion: 3,
  routes: [{ id: 'main', name: '本編' }, { id: 'yokogawa', name: '横川ルート' }],
  groups: [],
  presets: demo.presets,
  assets,
  avatar: { ...demo.avatar, lipSyncMode: 'audio-reactive' },
  settings: {
    rate: 1, pitch: 0.9, volume: 1, subtitlesEnabled: true,
    speechProvider: 'browser', freeSpeakMode: 'local-tts', shortcutsEnabled: true, reducedMotion: false,
  },
};

const states = {
  '001': 'normal', '002': 'normal', '003': 'normal', '004': 'normal',
  '005': 'hijacked', '006': 'hijacked', '007': 'hijacked', '008': 'hijacked', '009': 'hijacked',
  '010': 'warning', '011': 'hijacked', '012': 'recovery', '013': 'warning', '014': 'warning',
  '015': 'hostile', '016': 'shutdown', '017': 'normal', '018': 'warning',
};

function speechCue(scriptId, order, overrides = {}) {
  const speech = byId.get(scriptId);
  if (!speech) throw new Error(`SPEECH_NOT_FOUND:${scriptId}`);
  const state = states[scriptId];
  return {
    id: `prod-${scriptId}`,
    cueNumber: `P-${scriptId}`,
    name: `台本 ${scriptId}`,
    route: speech.route,
    scene: speech.scene,
    location: speech.location,
    kind: 'speech-display',
    speechText: speech.scriptText,
    displayText: speech.scriptText,
    presentationPreset: state,
    target: { type: 'all' },
    avatar: { visible: true, state },
    audio: { speechMode: 'audio-file', assetId: speech.assetId, lipSyncMode: 'audio-reactive' },
    transition: { id: 'none', durationMs: 0, intensity: 1 },
    operatorNote: `現行台本 ${speech.scene} / ${speech.location} / 発話${scriptId}。音声終了後も自動進行しない。`,
    triggerNote: '舞台監督の合図でGO',
    order,
    ...overrides,
  };
}

function visualCue(id, number, name, scene, state, order, fields = {}) {
  return {
    id, cueNumber: number, name, route: 'main', scene, location: fields.location ?? '7・201',
    kind: fields.displayText ? 'display-only' : 'preset-only', displayText: fields.displayText ?? '',
    presentationPreset: state, target: { type: 'all' }, avatar: { visible: true, state },
    audio: { speechMode: 'none', lipSyncMode: 'none' }, order,
    operatorNote: fields.operatorNote ?? '舞台進行に合わせて手動実行。自動進行しない。',
    triggerNote: fields.triggerNote ?? '舞台監督の合図でGO',
    ...(fields.transition ? { transition: fields.transition } : {}),
    ...(fields.overlay ? { overlay: fields.overlay } : {}),
    ...(fields.visual ? { visual: fields.visual } : {}),
    ...(fields.timing ? { timing: fields.timing } : {}),
  };
}

const mainCues = [
  speechCue('001', 10, { name: '横川AI起動応答', triggerNote: '横川教授「横川AIを起動してくれ」直後' }),
  speechCue('002', 20), speechCue('003', 30), speechCue('004', 40),
  visualCue('prod-v-incident', 'P-V01', '映像異常開始', 'scene-1', 'warning', 50, {
    displayText: 'UNIDENTIFIED SIGNAL DETECTED', transition: { id: 'anomaly', durationMs: 1200, intensity: 0.8 },
    operatorNote: '台本「モニターの横川AIの映像に、不自然なノイズが走る」でGO。',
  }),
  visualCue('prod-v-hijack', 'P-V02', '制御奪取', 'scene-1', 'hijacked', 60, {
    displayText: 'CONTROL CHANNEL OVERRIDDEN', transition: { id: 'takeover', durationMs: 1500, intensity: 1 },
    overlay: { id: 'communication-locked', visible: true, title: 'COMMUNICATION LOCKED', message: 'EXTERNAL CHANNELS DISABLED' },
    operatorNote: '台本の通信遮断・館内ロック成立後にGO。',
  }),
  speechCue('005', 70), speechCue('006', 80), speechCue('007', 90), speechCue('008', 100), speechCue('009', 110),
  speechCue('010', 120, {
    name: '五条件達成・201集合',
    overlay: { id: 'all-conditions-met', visible: true, title: 'ALL CONDITIONS MET', message: 'PROCEED TO 201', progress: 100 },
    visual: { id: 'riddle-complete', type: 'riddle-status', visible: true, title: '5 / 5 COMPLETE', items: ['01 ✓', '02 ✓', '03 ✓', '04 ✓', '05 ✓'] },
    operatorNote: '本編Scene 5、全てのルートの謎が解かれたことを確認してGO。横川ルート専用018とは同時実行しない。',
  }),
  speechCue('011', 130, {
    name: '最終問題提示', transition: { id: 'final-challenge-enter', durationMs: 1700, intensity: 1 },
    overlay: { id: 'final-challenge', visible: true, title: 'FINAL CHALLENGE', message: 'ENTER THE FIVE ANSWERS' },
    visual: { id: 'final-input', type: 'final-challenge', visible: true, title: 'AUTHORIZATION SEQUENCE', message: '5 KEYS REQUIRED', items: ['I', 'II', 'III', 'IV', 'V'] },
  }),
  speechCue('012', 140, {
    name: '認証成功・開錠開始', transition: { id: 'auth-success', durationMs: 1000, intensity: 1 },
    overlay: { id: 'authentication-success', visible: true, title: 'AUTHENTICATION SUCCESS', message: 'UNLOCK SEQUENCE READY', progress: 100 },
  }),
  visualCue('prod-v-unlock', 'P-V03', '開錠進行', 'scene-6', 'recovery', 150, {
    displayText: 'LOCK RELEASE IN PROGRESS', transition: { id: 'unlock-start', durationMs: 1200, intensity: 1 },
    overlay: { id: 'unlocking', visible: true, title: 'UNLOCKING', message: 'AUTH / CORE / GATE', progress: 0 },
    timing: { unlockDurationMs: 5000 }, operatorNote: '0→100%到達後もEmergency Cueまで保持。',
  }),
  speechCue('013', 160, {
    name: '緊急遮断', transition: { id: 'emergency-interrupt', durationMs: 900, intensity: 1 },
    overlay: { id: 'emergency-protection', visible: true, title: 'EMERGENCY PROTECTION', message: 'UNLOCK SEQUENCE INTERRUPTED' },
    operatorNote: '台本の久安による緊急停止合図でGO。開錠100%表示から割り込ませる。',
  }),
  speechCue('014', 170, {
    name: '連絡失敗', overlay: { id: 'connection-failed', visible: true, title: 'CONNECTION FAILED', message: 'REMOTE SYSTEM UNREACHABLE' },
  }),
  speechCue('015', 180, {
    name: '強制暴走', transition: { id: 'hostile-enter', durationMs: 1300, intensity: 1 },
    overlay: { id: 'forced-runaway', visible: true, title: 'FORCED RUNAWAY', message: 'MANUAL CONTROL LOST' },
  }),
  speechCue('016', 190, {
    name: 'システム全停止', transition: { id: 'shutdown', durationMs: 1800, intensity: 1 },
    overlay: { id: 'system-shutdown', visible: true, title: 'SYSTEM SHUTDOWN', message: 'ALL PROCESSES SUSPENDED' },
    operatorNote: '台本の全停止。発話終了後もSHUTDOWNを保持し、復旧Cueへ自動進行しない。',
  }),
  visualCue('prod-v-recovery', 'P-V04', '復旧開始', 'scene-7', 'recovery', 200, {
    displayText: 'SYSTEM RESTORING', transition: { id: 'recovery', durationMs: 2200, intensity: 1 },
    overlay: { id: 'restoring', visible: true, title: 'RESTORING', message: 'SYSTEM SYNCHRONIZATION', progress: 72 },
    operatorNote: '台本Scene 7、横川AI復旧の舞台進行に合わせてGO。',
  }),
  speechCue('017', 210, { name: '全五問正解・通常復帰', transition: { id: 'normalize', durationMs: 1400, intensity: 1 } }),
];

const mainShow = {
  ...common,
  metadata: {
    title: '横川AI Production — 本編', version: 'phase-c-candidate',
    description: '現行Google Docs台本に基づく本編。横シーン5は別Show File。',
    sourceScript: manifest.sourceScript, voiceProfileId: manifest.voiceProfileId, profileHash: manifest.profileHash,
  },
  scenes: [
    { sceneId: 'scene-1', sceneName: 'Scene 1 / AI起動・制御奪取', order: 1 },
    { sceneId: 'scene-5', sceneName: 'Scene 5 / 五条件達成', order: 5 },
    { sceneId: 'scene-6', sceneName: 'Scene 6 / 最終問題・停止', order: 6 },
    { sceneId: 'scene-7', sceneName: 'Scene 7 / 復旧', order: 7 },
  ],
  cues: mainCues,
};

const routeShow = {
  ...common,
  metadata: {
    title: '横川AI Production — 横川ルートScene 5', version: 'phase-c-candidate',
    description: '横シーン5専用。mainへ混在させず、舞台監督がルート確定後に適用する。接続位置はUNRESOLVED ROUTE MAPPING。',
    sourceScript: manifest.sourceScript, voiceProfileId: manifest.voiceProfileId, profileHash: manifest.profileHash,
  },
  scenes: [{ sceneId: 'yokogawa-scene-5', sceneName: '横シーン5 / 7・303', order: 5 }],
  cues: [speechCue('018', 10, {
    name: '横川ルート・201集合',
    operatorNote: '横シーン5専用。横川ルートの謎回答後にGO。mainの010と同時実行しない。以降の接続位置は舞台監督確認待ち。',
    triggerNote: '横シーン5「AIのアナウンス」指示でGO',
  })],
};

for (const [filename, show] of [['production.json', mainShow], ['production-yokogawa-route.json', routeShow]]) {
  const validation = validateShowFile(show);
  if (!validation.valid) throw new Error(`${filename}:${validation.errors.join(',')}`);
  await fs.writeFile(path.join(root, 'shows', filename), `${JSON.stringify(show, null, 2)}\n`);
  console.log(`${filename}: ${show.cues.length} cues / ${show.assets.length} assets`);
}
