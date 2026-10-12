import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateShowFile } from '../src/show-schema.js';
import { PRODUCTION_SLOTS } from '../src/production-asset-slots.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'config/production-speech/yokogawa-ai-v2.json'), 'utf8'));
const demo = JSON.parse(await fs.readFile(path.join(root, 'shows/phase-a-demo.json'), 'utf8'));
const byId = new Map(manifest.speeches.map((speech) => [speech.scriptId, speech]));

const assets = manifest.speeches.map((speech) => ({
  id: speech.assetId,
  name: `横川AI Production ${speech.scriptId}`,
  path: speech.path,
  mimeType: 'audio/wav',
  ...(speech.sha256 ? { sha256: speech.sha256 } : {}),
}));
assets.push(...manifest.sfx);
for (const slot of ['first', 'final', 'emergency']) assets.push({ id: `puzzle-${slot}`, name: `未提供: ${slot}問題画像`, path: 'assets/visual/puzzle-image-pending.svg', mimeType: 'image/svg+xml' });
for (const slot of PRODUCTION_SLOTS) assets.find(a => a.id === slot.assetId).slot = slot.id;

const common = {
  schemaVersion: 3,
  routes: [{ id: 'main', name: '本編' }, { id: 'yokogawa', name: '横川ルート' }],
  groups: [],
  presets: demo.presets,
  assets,
  avatar: { ...demo.avatar, visible: false, state: 'normal', lipSyncMode: 'audio-reactive' },
  settings: {
    rate: 1, pitch: 0.9, volume: 1, sfxVolume: 1, subtitlesEnabled: true,
    speechProvider: 'browser', freeSpeakMode: 'local-tts', shortcutsEnabled: true, reducedMotion: false,
  },
};

const states = {
  '001': 'normal', '002': 'normal', '003': 'normal', '004': 'normal',
  '005': 'hijacked', '006': 'hijacked', '007': 'hijacked', '008': 'hijacked', '009': 'hijacked',
  '010': 'warning', '011': 'hijacked', '012': 'hijacked', '013': 'warning', '014': 'warning',
  '015': 'hostile', '016': 'shutdown', '019': 'hijacked', '020': 'normal',
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
    speech: { spokenText: speech.spokenText, segments: speech.segments, subtitleMode: 'typewriter', ...(speech.subtitleUnits ? { subtitleUnits: speech.subtitleUnits } : {}) },
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
    ...(fields.sequence ? { sequence: fields.sequence } : {}),
    ...(fields.syncMarkers ? { syncMarkers: fields.syncMarkers } : {}),
  };
}

const mainCues = [
  speechCue('001', 10, {
    name: '横川AI起動応答', triggerNote: '横川教授「横川AIを起動してくれ」直後。STANDBYからGO。',
    transition: { id: 'boot', mode: 'fade', durationMs: 2600, intensity: .65 },
    timing: { speechDelayMs: 2600 },
    sfx: [{ assetId: 'prod-sfx-boot', atMs: 400, volume: .8, durationMs: 1600 }],
    operatorNote: 'Production起動Cue。非表示STANDBYからAvatarをrevealし、WAV001終了後もNORMALを保持する。',
  }),
  speechCue('002', 20), speechCue('003', 30), speechCue('004', 40),
  visualCue('prod-v-incident', 'P-V01', '映像乱れ・制御奪取', 'scene-1', 'hijacked', 50, {
    transition: { id: 'anomaly', durationMs: 2400, intensity: 1 },
    operatorNote: 'WAV004完了後、台本「突然、モニターの映像が乱れる」でGO。全画面の水平断裂から紫HACKへ定着。字幕なしで出演者の調査芝居を待つ。',
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
  speechCue('019', 95, { name: '記入用紙の案内', triggerNote: '横川教授が役割を指示し、助手たちの「はい」後にGO' }),
  speechCue('009', 100, {
    id: 'prod-v-riddle-enter', cueNumber: 'P-V02', name: '五つの謎・第1問開始＋台本009',
    transition: { id: 'riddle-enter', durationMs: 2300, intensity: 1 },
    timing: { speechDelayMs: 0 },
    audio: { speechMode: 'audio-file', assetId: byId.get('009').assetId, lipSyncMode: 'audio-reactive', playbackEffect: 'hijacked-subtle-v1' },
    visual: { id: 'puzzle-first', type: 'image', assetId: 'puzzle-first', visible: true, title: '第一の謎', message: '本物の問題画像は未提供 / 表示枠の確認用' },
    operatorNote: '1 GOで画面変化→定着→2.3秒後に既存WAV009。問題本文は未提供のため表示しない。',
    triggerNote: 'WAV008終了後、画面変化の合図でGO',
  }),
  speechCue('011', 130, {
    name: '五つ達成・統合・最終問題', transition: { id: 'final-challenge-enter', durationMs: 4800, intensity: 1 },
    visual: { id: 'five-verified', type: 'riddle-status', mode: 'five-complete', visible: true, title: '五つの解を確認', message: '5 / 5 VERIFIED', items: ['01 ✓', '02 ✓', '03 ✓', '04 ✓', '05 ✓'] },
    sequence: [
      { atMs: 2000, visual: { id: 'five-integrating', type: 'riddle-status', mode: 'integration', visible: true, title: '五つの解を統合', message: 'INTEGRATING', items: ['01 ✓', '02 ✓', '03 ✓', '04 ✓', '05 ✓'] } },
      { atMs: 4200, visual: { id: 'final-input', type: 'final-challenge', mode: 'reveal', visible: true, title: '最終問題', message: '最終問題の回答を入力しなさい', items: ['I', 'II', 'III', 'IV', 'V'] } },
    ],
  }),
  speechCue('012', 140, {
    name: '認証成功・開錠開始', transition: { id: 'auth-success', durationMs: 1000, intensity: 1 },
    overlay: { id: 'authentication-success', visible: true, title: '認証成功', message: 'AUTHENTICATED — 解錠処理を許可' },
    operatorNote: 'WAV012認証成功。終了後に電子音SE、続いて開錠進行Cueを手動GO。ここではHIJACKED状態を保持する。',
    syncMarkers: [{ department: 'SE', id: 'ALIGN-SE-AUTH-CHIME-AFTER', note: 'WAV012終了後に電子音。記述用markerであり正式音響Cue番号ではない。' }],
  }),
  visualCue('prod-v-unlock', 'P-V03', '開錠進行', 'scene-6', 'warning', 150, {
    transition: { id: 'unlock-start', durationMs: 7400, intensity: 1 },
    overlay: { id: 'unlocking', visible: true, title: '解錠処理', message: 'SECURITY RELEASE', progress: 0 },
    timing: { unlockDurationMs: 5000 }, operatorNote: '電子音SE後にGO。6系統→100%を0.9秒保持→ゲージ収束→不穏なstable状態。役者の芝居を待つ。',
    sequence: [
      { atMs: 5900, overlay: { id: 'unlocking', variant: 'collapse', visible: true, title: '解錠完了', message: 'RELEASE COMPLETE' } },
      { atMs: 6800, overlay: { id: 'unlocking', variant: 'anomaly', visible: true, title: '解錠完了', message: 'RELEASE COMPLETE' }, clearSubtitle: true },
    ],
    triggerNote: 'WAV012終了後の電子音SEを確認してGO',
  }),
  speechCue('013', 160, {
    name: '緊急遮断', transition: { id: 'emergency-interrupt', durationMs: 900, intensity: 1 },
    overlay: { id: 'connection-failed', visible: true, title: 'ERROR — 緊急遮断', message: '解錠停止 / スタッフへの連絡失敗' },
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
  speechCue('016', 210, {
    id: 'prod-v-stop-code', cueNumber: 'P-V06', name: '停止コード・システム全停止＋台本016',
    transition: { id: 'shutdown', durationMs: 1900, intensity: 1 },
    timing: { speechDelayMs: 1900 },
    overlay: { id: 'system-shutdown', visible: true, title: 'システム全停止', message: 'ALL PROCESSES SUSPENDED' },
    operatorNote: '1 GOで暴走を即停止→1.2秒のcut→0.7秒の静寂→既存WAV016を一度再生。終了後はSHUTDOWNを保持。',
    triggerNote: '非常停止コード入力成立の瞬間にGO',
    syncMarkers: [
      { department: 'SE', id: 'ALIGN-SE-ALARM-STOP', note: '警報STOP。記述用markerであり正式音響Cue番号ではない。' },
      { department: 'LX', id: 'ALIGN-LX-FLICKER-STOP', note: '照明明滅STOP。記述用markerであり正式照明Cue番号ではない。' },
      { department: 'ACT', id: 'ALIGN-ACT-RUNAWAY-STOP', note: '機械設備の暴走芝居を停止。' },
      { department: 'SE', id: 'ALIGN-SE-DOOR-UNLOCK-AFTER-016', note: '統合CueのWAV016終了後に扉解錠音。' },
      { department: 'ACT', id: 'ALIGN-ACT-CHECK-DOOR', note: '馬場・窪が扉を確認する芝居。' },
    ],
  }),
  visualCue('prod-v-recovery', 'P-V07', '復旧開始', 'scene-7', 'recovery', 230, {
    transition: { id: 'recovery', durationMs: 6000, intensity: 1 },
    overlay: { id: 'restoring', visible: true, title: 'システム復旧', message: 'SYSTEM SYNCHRONIZATION', progress: 0 },
    sequence: [
      { atMs: 3800, overlay: { id: 'restoring', visible: true, title: '復旧完了', message: 'SYSTEM SYNCHRONIZED', progress: 100 } },
      { atMs: 4600, overlay: { id: 'none' }, presentationPreset: 'normal', avatar: { ...demo.avatar, visible: true, state: 'normal', lipSyncMode: 'none' }, clearSubtitle: true },
    ],
    operatorNote: '虎谷が執念を手放すScene 7のタイミングでGO。100%→UI消去→温かな光→NORMALまで1 Cue。',
  }),
];

// Per-source balance: HACK is already much louder than startup/warning.
// Keep source WAVs untouched; global SFX remains an operator master control.
const sound = (name, atMs = 0, volume = { glitch: .55, warning: 1 }[name]) => ({ assetId: `prod-sfx-${name}`, atMs, volume, durationMs: manifest.sfx.find(s => s.id === `prod-sfx-${name}`).durationMs });
const sounds = { 'prod-v-incident': ['glitch'], 'prod-013': ['warning'], 'prod-014': ['warning'] };
for (const cue of mainCues) if (sounds[cue.id]) cue.sfx = [sound(...sounds[cue.id])];
const first = mainCues.find(c => c.id === 'prod-v-riddle-enter');
first.operatorNote = '台本更新: 「第一の謎は、こちらです」＋画面切替を1 Cue。問題画像未提供。原版009はアーカイブとして保持。';
first.triggerNote = '扇「これか！」の後にGO';
const firstSpeechMs = Math.ceil(byId.get('009').durationSeconds * 1000);
first.visual = { id: 'none' };
first.transition.durationMs = firstSpeechMs + 2300;
first.sequence = [{ atMs: firstSpeechMs, visual: { id: 'puzzle-first', type: 'image', assetId: 'puzzle-first', visible: true, title: '第一の謎', message: '本物の問題画像は未提供 / 表示枠の確認用' } }];
const final = mainCues.find(c => c.id === 'prod-011');
final.triggerNote = '扇「答えは①から⑤まで全部揃った！ 横川AI、これで脱出できるんだろう！」後にGO';
final.sequence[1].visual = { id: 'puzzle-final', type: 'image', assetId: 'puzzle-final', visible: true, title: '最終問題', message: '本物の問題画像は未提供 / 回答: ブレイクヨコガワ（オペレーターのみ）' };
final.sequence[1].visual.message = '本物の問題画像は未提供 / 表示枠の確認用';
const emergency = mainCues.find(c => c.id === 'prod-v-emergency-riddle');
emergency.triggerNote = '白山がUSBをさす→「問題が出る」でGO（白山「これは⋯⋯いったい⋯⋯」の前）';
emergency.operatorNote = '最新参照：扇「ここにいる皆で解けばいい」／光「私（僕）も解く！」／白山「ヒントはこれですね！」。USB挿入を待つ。ヒント内容・表示担当は未確定なので創作・自動提示しない。';
emergency.displayText = ''; emergency.kind = 'preset-only'; emergency.overlay = { id: 'none' };
emergency.visual = { id: 'puzzle-emergency', type: 'image', assetId: 'puzzle-emergency', visible: true, title: '非常停止問題', message: '問題画像・ヒント・停止コード未提供' };

// Audited deterministic boundaries only. Actor/audience/USB boundaries remain manual.
const lecture = mainCues.find(c => c.id === 'prod-004');
const incident = mainCues.find(c => c.id === 'prod-v-incident');
const incidentAt = Math.ceil(byId.get('004').durationSeconds * 1000) + 200;
Object.assign(lecture, { name: 'プリンキピア説明→映像乱れ', transition: { id: 'timeline', durationMs: incidentAt + 2400 },
  sequence: [{ atMs: incidentAt, transition: incident.transition, presentationPreset: 'hijacked', clearSubtitle: true }],
  sfx: incident.sfx.map(s => ({ ...s, atMs: incidentAt + s.atMs })), syncMarkers: incident.syncMarkers,
  triggerNote: '横川「プリンキピアについて説明してくれ」後にGO', operatorNote: '説明WAV完了＋200ms後に映像乱れ。照明・施錠SEの連携markerも同じ境界。調査芝居を挟む次のP-005は手動。' });
const auth = mainCues.find(c => c.id === 'prod-012'); const unlockCue = mainCues.find(c => c.id === 'prod-v-unlock');
const unlockAt = Math.ceil(byId.get('012').durationSeconds * 1000) + 200;
Object.assign(auth, { name: '認証成功→解錠進行→異常', transition: { id: 'timeline', durationMs: unlockAt + 7400 },
  sequence: [{ atMs: 0, transition: { id: 'auth-success', durationMs: 1000 } }, { atMs: unlockAt, transition: unlockCue.transition, overlay: unlockCue.overlay, presentationPreset: 'warning', unlock: { durationMs: 5000 }, clearSubtitle: true }, ...unlockCue.sequence.map(p => ({ ...p, atMs: p.atMs + unlockAt }))],
  sfx: [],
  triggerNote: '扇「最後の答えはブレイクヨコガワだ！」後にGO', operatorNote: '認証WAV→200ms→6系統解錠→100%→異常を1 GO。追加電子音なし。虎谷の告白・外部への指示を待ってP-013を手動。' });
mainCues.splice(mainCues.indexOf(incident), 1); mainCues.splice(mainCues.indexOf(unlockCue), 1);
// PA owns electronic locks, doors and the long HOSTILE alarm. Keep their markers.
for (const cue of mainCues) cue.sfx = (cue.sfx ?? []).filter(s => !['prod-sfx-auth', 'prod-sfx-unlock', 'prod-sfx-hostile', 'prod-sfx-rumble'].includes(s.assetId));
Object.assign(mainCues.find(c => c.id === 'prod-013'), {
  timing: { speechDelayMs: 900 },
  triggerNote: '虎谷「今すぐプリンキピアを持ち出すよう指示を出せ！」の後にGO。内部警告slot終了後に発話を自動開始',
  operatorNote: '1 GOでERROR表示→共有warning slot→WAV013。警告音長を検証してCue内delayへ反映。WAV末尾句点は表示のみ最新版へ同期。',
});
Object.assign(mainCues.find(c => c.id === 'prod-014'), {
  timing: { speechDelayMs: 900 },
  triggerNote: '虎谷「今すぐこの2人を拘束しろ！」の後にGO。共有warning slot→セリフ',
  operatorNote: '1 GOでERROR表示→警告音→WAV014。警告音の実際の長さをspeech delayへ反映。',
  syncMarkers: [{ department: 'SE', id: 'ALIGN-SE-WARNING-BEFORE-014', note: 'WAV014の前に警告音。' }],
});
// Sentence pacing and the integration reveal share one timeline.
final.sequence[0].atMs = byId.get('011').segments[1].startMs;
final.sequence[1].atMs = byId.get('011').segments[2].startMs;
final.transition.durationMs = Math.max(Math.ceil(byId.get('011').durationSeconds * 1000), final.sequence[1].atMs + 600);
mainCues.find(c => c.id === 'prod-015').operatorNote = 'HOSTILE先行Cueの後に暴走宣言。追加の轟音は再生しない。';
for (const cue of mainCues) cue.syncMarkers = (cue.syncMarkers ?? []).filter(marker => marker.department !== 'SE' || /WARNING/.test(marker.id));
mainCues.push(speechCue('020', 240, { name: '館内すべての扉・解錠確認', triggerNote: '夢野・押野・三馬の責任に関する会話後、虎谷が二人を見つめ、わずかに苦笑して静かに俯く→正常なAI表示でGO', operatorNote: 'P-V07復旧の後の多数の人間台詞を待つ独立Cue。NORMALを維持し解錠確認のWAV020を再生。新たな復旧演出・SFXなし。', visual: { id: 'none' }, overlay: { id: 'none' } }));
const showHash = createHash('sha256').update(JSON.stringify(mainCues)).digest('hex');

const mainShow = {
  ...common,
  metadata: {
    title: '横川AI Production — 本編', version: 'subtitle-script-assets-v1.1', nextGuardMs: 1200, showHash,
    description: '現行Google Docs台本のメインScene 1〜7に基づく本編。横シーン5は別Show File。',
    sourceScript: manifest.sourceScript, voiceProfileId: manifest.voiceProfileId, profileHash: manifest.profileHash,
    sceneStructureSource: {
      documentId: '16KxoOjIFLJXikFF_3u3LnnbjnQX8xJvZ-cPPNxkuJVo',
      revisionId: manifest.sourceScript.revisionId,
      tabCount: manifest.sourceScript.tabCount,
    },
  },
  scenes: [
    { sceneId: 'scene-1', sceneName: 'Scene 1 / 7・201 / AI起動・制御奪取', order: 1, scriptTabId: 't.tyup3idqskfk', location: '7・201' },
    { sceneId: 'scene-2', sceneName: 'Scene 2 / 7・203', order: 2, scriptTabId: 't.7im6uhbfkk6m', location: '7・203' },
    { sceneId: 'scene-3', sceneName: 'Scene 3 / 7・306', order: 3, scriptTabId: 't.vl6lnjb0yh3q', location: '7・306' },
    { sceneId: 'scene-4', sceneName: 'Scene 4 / 7・413', order: 4, scriptTabId: 't.e7k2svyhnomc', location: '7・413' },
    { sceneId: 'scene-5', sceneName: 'Scene 5 / 4階廊下 / 五条件達成', order: 5, scriptTabId: 't.qexxsordbvdd', location: '4階廊下' },
    { sceneId: 'scene-6', sceneName: 'Scene 6 / 7・201 / 最終問題・停止', order: 6, scriptTabId: 't.lquo4bdx2m2q', location: '7・201' },
    { sceneId: 'scene-7', sceneName: 'Scene 7 / 7・201 / 復旧', order: 7, scriptTabId: 't.6gopn4tnzuo', location: '7・201' },
  ],
  cues: mainCues,
};

const routeShow = {
  ...common,
  metadata: {
    title: '横川AI Production — 横川ルートScene 5', version: 'production-refresh-v2.0',
    description: '横シーン5専用。mainへ混在させず、舞台監督がルート確定後に適用する。接続位置はUNRESOLVED ROUTE MAPPING。',
    sourceScript: manifest.sourceScript, voiceProfileId: manifest.voiceProfileId, profileHash: manifest.profileHash,
  },
  scenes: [{ sceneId: 'yokogawa-scene-5', sceneName: '横シーン5 / 7・303', order: 5 }],
  cues: [],
};

for (const [filename, show] of [['production.json', mainShow], ['production-yokogawa-route.json', routeShow]]) {
  const validation = validateShowFile(show);
  if (!validation.valid) throw new Error(`${filename}:${validation.errors.join(',')}`);
  await fs.writeFile(path.join(root, 'shows', filename), `${JSON.stringify(show, null, 2)}\n`);
  console.log(`${filename}: ${show.cues.length} cues / ${show.assets.length} assets`);
}
