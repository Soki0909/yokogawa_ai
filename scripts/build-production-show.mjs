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
  avatar: { ...demo.avatar, visible: false, state: 'normal', lipSyncMode: 'audio-reactive' },
  settings: {
    rate: 1, pitch: 0.9, volume: 1, subtitlesEnabled: true,
    speechProvider: 'browser', freeSpeakMode: 'local-tts', shortcutsEnabled: true, reducedMotion: false,
  },
};

const states = {
  '001': 'normal', '002': 'normal', '003': 'normal', '004': 'normal',
  '005': 'hijacked', '006': 'hijacked', '007': 'hijacked', '008': 'hijacked', '009': 'hijacked',
  '010': 'warning', '011': 'hijacked', '012': 'hijacked', '013': 'warning', '014': 'warning',
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
    ...(fields.syncMarkers ? { syncMarkers: fields.syncMarkers } : {}),
  };
}

const mainCues = [
  speechCue('001', 10, {
    name: '横川AI起動応答', triggerNote: '横川教授「横川AIを起動してくれ」直後。STANDBYからGO。',
    transition: { id: 'boot', durationMs: 1600, intensity: 1 },
    overlay: { id: 'booting', visible: true, title: 'SYSTEM BOOT', message: 'INITIALIZING YOKOGAWA AI', progress: 42 },
    timing: { autoClearOverlayMs: 2600 },
    operatorNote: 'Production起動Cue。非表示STANDBYからAvatarをrevealし、WAV001終了後もNORMALを保持する。',
  }),
  speechCue('002', 20), speechCue('003', 30), speechCue('004', 40),
  visualCue('prod-v-incident', 'P-V01', '映像異常開始', 'scene-1', 'warning', 50, {
    displayText: 'UNIDENTIFIED SIGNAL DETECTED', transition: { id: 'anomaly', durationMs: 1200, intensity: 0.8 },
    operatorNote: 'WAV004完了後、台本「モニターの横川AIの映像に、不自然なノイズが走る」でGO。ここではFULL HIJACKEDへ進めない。出演者の調査芝居を待つ。',
    triggerNote: 'WAV004完了後、映像ノイズ開始の舞台監督合図でGO',
    syncMarkers: [
      { department: 'LX', id: 'ALIGN-LX-ANOMALY', note: '照明明滅。記述用markerであり正式照明Cue番号ではない。' },
      { department: 'SE', id: 'ALIGN-SE-DOOR-LOCK', note: '扉施錠音。記述用markerであり正式音響Cue番号ではない。' },
      { department: 'ACT', id: 'ALIGN-ACT-INVESTIGATE', note: '出演者が通信・扉・状況を調査する芝居区間。' },
    ],
  }),
  speechCue('005', 60, {
    name: '制御奪取・台本005', transition: { id: 'takeover', durationMs: 1500, intensity: 1 },
    overlay: { id: 'communication-locked', visible: true, title: 'COMMUNICATION LOCKED', message: 'EXTERNAL CHANNELS DISABLED' },
    audio: { speechMode: 'audio-file', assetId: byId.get('005').assetId, lipSyncMode: 'audio-reactive', playbackEffect: 'hijacked-subtle-v1' },
    operatorNote: '消灯・復灯後、このCueで初めてFULL HIJACKEDへ移行しWAV005を再生する。subtle hijacked effect適用。',
    triggerNote: '照明の消灯・復灯完了直後にGO',
    syncMarkers: [{ department: 'LX', id: 'ALIGN-LX-HIJACK-REVEAL', note: '消灯・復灯後にGO。記述用markerであり正式照明Cue番号ではない。' }],
  }),
  ...['006', '007', '008'].map((scriptId, index) => speechCue(scriptId, 70 + index * 10, {
    audio: { speechMode: 'audio-file', assetId: byId.get(scriptId).assetId, lipSyncMode: 'audio-reactive', playbackEffect: 'hijacked-subtle-v1' },
    operatorNote: `現行台本 scene-1 / 7・201 / 発話${scriptId}。HIJACKED状態とsubtle voice effectを継続し、自動進行しない。`,
  })),
  visualCue('prod-v-riddle-enter', 'P-V02', '五つの謎・第1問開始', 'scene-1', 'hijacked', 100, {
    displayText: 'FIVE RIDDLES — FIRST: 7・201', transition: { id: 'riddle-enter', durationMs: 1300, intensity: 1 },
    overlay: { id: 'riddle-active', visible: true, title: 'RIDDLE ACTIVE', message: 'FIRST LOCATION — 7・201' },
    visual: { id: 'riddle-five', type: 'riddle-status', visible: true, title: '5 QUESTIONS', message: 'FIRST — 7・201', items: ['01 ACTIVE', '02', '03', '04', '05'] },
    operatorNote: '台本にある「五つの謎」「第一の謎」「7・201」だけを表示。問題本文は未提供のため表示しない。',
    triggerNote: 'WAV008終了後、画面変化の合図でGO',
  }),
  speechCue('009', 110, {
    audio: { speechMode: 'audio-file', assetId: byId.get('009').assetId, lipSyncMode: 'audio-reactive', playbackEffect: 'hijacked-subtle-v1' },
    operatorNote: '現行台本 scene-1 / 7・201 / 発話009。HIJACKED状態とsubtle voice effectを継続。',
  }),
  speechCue('010', 120, {
    name: '五条件達成・201集合',
    enabled: false,
    overlay: { id: 'all-conditions-met', visible: true, title: 'ALL CONDITIONS MET', message: 'PROCEED TO 201', progress: 100 },
    visual: { id: 'riddle-complete', type: 'riddle-status', visible: true, title: '5 / 5 COMPLETE', items: ['01 ✓', '02 ✓', '03 ✓', '04 ✓', '05 ✓'] },
    operatorNote: 'UNRESOLVED ROUTE MAPPING。館内放送WAV010は無効化してmain NEXTから隔離。全route達成と接続位置を確認後、Operatorが有効化して直接実行する。横川ルート専用018とは同時実行しない。',
    triggerNote: 'main NEXT対象外。Scene 5の全条件達成と接続位置を確認後、有効化して直接実行',
  }),
  speechCue('011', 130, {
    name: '最終問題提示', transition: { id: 'final-challenge-enter', durationMs: 1700, intensity: 1 },
    overlay: { id: 'final-challenge', visible: true, title: 'FINAL CHALLENGE', message: 'ENTER THE FIVE ANSWERS' },
    visual: { id: 'final-input', type: 'final-challenge', visible: true, title: 'AUTHORIZATION SEQUENCE', message: '5 KEYS REQUIRED', items: ['I', 'II', 'III', 'IV', 'V'] },
  }),
  speechCue('012', 140, {
    name: '認証成功・開錠開始', transition: { id: 'auth-success', durationMs: 1000, intensity: 1 },
    overlay: { id: 'authentication-success', visible: true, title: 'AUTHENTICATION SUCCESS', message: 'UNLOCK SEQUENCE READY', progress: 100 },
    operatorNote: 'WAV012認証成功。終了後に電子音SE、続いて開錠進行Cueを手動GO。ここではHIJACKED状態を保持する。',
    syncMarkers: [{ department: 'SE', id: 'ALIGN-SE-AUTH-CHIME-AFTER', note: 'WAV012終了後に電子音。記述用markerであり正式音響Cue番号ではない。' }],
  }),
  visualCue('prod-v-unlock', 'P-V03', '開錠進行', 'scene-6', 'warning', 150, {
    displayText: 'LOCK RELEASE IN PROGRESS', transition: { id: 'unlock-start', durationMs: 1200, intensity: 1 },
    overlay: { id: 'unlocking', visible: true, title: 'UNLOCKING', message: 'AUTH / CORE / GATE', progress: 0 },
    timing: { unlockDurationMs: 5000 }, operatorNote: '電子音SE後に手動GO。複数ゲージを0→100%へ進め、到達後もEmergency Cueまで保持。自動進行しない。',
    triggerNote: 'WAV012終了後の電子音SEを確認してGO',
  }),
  speechCue('013', 160, {
    name: '緊急遮断', transition: { id: 'emergency-interrupt', durationMs: 900, intensity: 1 },
    overlay: { id: 'emergency-protection', visible: true, title: 'EMERGENCY PROTECTION', message: 'UNLOCK SEQUENCE INTERRUPTED' },
    operatorNote: '警告SE完了後にWAV013をGO。開錠100%表示から割り込ませる。',
    triggerNote: '虎谷の端末操作→警告SE完了後にGO',
    syncMarkers: [{ department: 'SE', id: 'ALIGN-SE-WARNING-BEFORE-013', note: 'WAV013より前に警告音。記述用markerであり正式音響Cue番号ではない。' }],
  }),
  speechCue('014', 170, {
    name: '連絡失敗', overlay: { id: 'connection-failed', visible: true, title: 'CONNECTION FAILED', message: 'REMOTE SYSTEM UNREACHABLE' },
    operatorNote: 'WAV014終了後に警告SE。音声終了後も自動進行しない。',
    syncMarkers: [{ department: 'SE', id: 'ALIGN-SE-WARNING-AFTER-014', note: 'WAV014終了後に警告音。記述用markerであり正式音響Cue番号ではない。' }],
  }),
  visualCue('prod-v-hostile-enter', 'P-V04', '危険状態・警報開始', 'scene-6', 'hostile', 180, {
    displayText: 'HOSTILE CONTROL DETECTED', transition: { id: 'hostile-enter', durationMs: 1300, intensity: 1 },
    overlay: { id: 'forced-runaway', visible: true, title: 'FORCED RUNAWAY', message: 'MANUAL CONTROL LOST' },
    operatorNote: '虎谷の端末操作でWAV015より先にGO。AI危険表示、照明明滅、警報開始。',
    triggerNote: '虎谷が端末を操作した瞬間にGO',
    syncMarkers: [
      { department: 'LX', id: 'ALIGN-LX-HOSTILE-FLICKER', note: '照明明滅開始。記述用markerであり正式照明Cue番号ではない。' },
      { department: 'SE', id: 'ALIGN-SE-ALARM-START', note: '警報開始。記述用markerであり正式音響Cue番号ではない。' },
    ],
  }),
  speechCue('015', 190, {
    name: '強制暴走',
    overlay: { id: 'forced-runaway', visible: true, title: 'FORCED RUNAWAY', message: 'MANUAL CONTROL LOST' },
    operatorNote: 'HOSTILE先行Cueと警報開始後にWAV015をGO。終了後に轟音SE。',
    triggerNote: '虎谷の暴走命令を受けてGO',
    syncMarkers: [{ department: 'SE', id: 'ALIGN-SE-RUMBLE-AFTER-015', note: 'WAV015終了後に轟音。記述用markerであり正式音響Cue番号ではない。' }],
  }),
  visualCue('prod-v-emergency-riddle', 'P-V05', '非常停止問題', 'scene-6', 'hostile', 200, {
    displayText: 'EMERGENCY STOP CHALLENGE — CONTENT PENDING',
    overlay: { id: 'riddle-active', visible: true, title: 'EMERGENCY STOP', message: 'CHALLENGE CONTENT PENDING' },
    visual: { id: 'emergency-stop-riddle', type: 'riddle-status', visible: true, title: 'EMERGENCY STOP CHALLENGE', message: 'SCRIPT CONTENT NOT PROVIDED', items: ['INPUT PENDING'] },
    operatorNote: '非常停止問題の表示container。台本で問題本文・ヒント内容が未確定のため創作しない。素材受領後に差し替える。',
    triggerNote: 'WAV015後、非常停止の謎を提示する舞台進行でGO',
  }),
  visualCue('prod-v-stop-code', 'P-V06', '停止コード・システム停止', 'scene-6', 'shutdown', 210, {
    displayText: 'STOP CODE ACCEPTED — SYSTEM SHUTDOWN', transition: { id: 'shutdown', durationMs: 1800, intensity: 1 },
    overlay: { id: 'system-shutdown', visible: true, title: 'SYSTEM SHUTDOWN', message: 'ALL PROCESSES SUSPENDED' },
    operatorNote: '停止コード入力でGO。警報・照明明滅・HOSTILE motionを停止してSHUTDOWNへ移行し、その後WAV016を実行する。',
    triggerNote: '非常停止コード入力成立の瞬間にGO',
    syncMarkers: [
      { department: 'SE', id: 'ALIGN-SE-ALARM-STOP', note: '警報STOP。記述用markerであり正式音響Cue番号ではない。' },
      { department: 'LX', id: 'ALIGN-LX-FLICKER-STOP', note: '照明明滅STOP。記述用markerであり正式照明Cue番号ではない。' },
      { department: 'ACT', id: 'ALIGN-ACT-RUNAWAY-STOP', note: '機械設備の暴走芝居を停止。' },
    ],
  }),
  speechCue('016', 220, {
    name: 'システム全停止',
    overlay: { id: 'system-shutdown', visible: true, title: 'SYSTEM SHUTDOWN', message: 'ALL PROCESSES SUSPENDED' },
    operatorNote: '停止コードCueのshutdown transition後にWAV016。終了後も長時間SHUTDOWNを保持し、RECOVERYへ自動進行しない。',
    triggerNote: '停止コードCueのtransition開始後にGO',
    syncMarkers: [
      { department: 'SE', id: 'ALIGN-SE-DOOR-UNLOCK-AFTER-016', note: 'WAV016終了後に扉解錠音。記述用markerであり正式音響Cue番号ではない。' },
      { department: 'ACT', id: 'ALIGN-ACT-CHECK-DOOR', note: '馬場・久保が扉を確認する芝居。' },
    ],
  }),
  visualCue('prod-v-recovery', 'P-V07', '復旧開始', 'scene-7', 'recovery', 230, {
    displayText: 'SYSTEM RESTORING', transition: { id: 'recovery', durationMs: 2200, intensity: 1 },
    overlay: { id: 'restoring', visible: true, title: 'RESTORING', message: 'SYSTEM SYNCHRONIZATION', progress: 72 },
    operatorNote: '台本Scene 7、横川AI復旧の舞台進行に合わせてGO。',
  }),
  speechCue('017', 240, {
    name: '全五問正解・通常復帰', enabled: false, transition: { id: 'normalize', durationMs: 1400, intensity: 1 },
    operatorNote: 'UNRESOLVED SCRIPT。Scene 6内包Scene 7と独立Scene 7でWAV017有無が競合するため、Asset/Cueを保持したまま無効化しmain NEXTから除外。脚本・舞台監督確認後に有効化して直接実行。',
    triggerNote: '通常NEXT対象外。WAV017採用と接続位置の確認後、有効化して直接実行',
  }),
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
