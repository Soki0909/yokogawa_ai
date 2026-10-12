import { ReconnectingSocket } from './socket-client.js';
import { shortcutCommand } from './shortcuts.js';

const elements = Object.fromEntries([...document.querySelectorAll('[id]')].map((element) => [element.id, element]));
let state = null;
let noticeTimer;
let connected = false;
let actionLocked = false;
let nextDeadline = 0;
let cueRenderSignature = '';
let selectRenderSignature = '';
let connectionRenderSignature = '';
const transitionIds = ['none', 'boot', 'anomaly', 'takeover', 'riddle-enter', 'final-challenge-enter', 'auth-success', 'unlock-start', 'emergency-interrupt', 'hostile-enter', 'shutdown', 'recovery', 'normalize', 'timeline'];
const overlayIds = ['none', 'booting', 'communication-locked', 'access-denied', 'authentication-failed', 'riddle-active', 'all-conditions-met', 'final-challenge', 'authenticating', 'authentication-success', 'unlocking', 'emergency-protection', 'unlock-aborted', 'connection-failed', 'forced-runaway', 'system-shutdown', 'restoring'];
const visualTypes = ['none', 'text-card', 'image', 'final-challenge', 'riddle-status'];

const socket = new ReconnectingSocket('admin', handleEvent, (status) => {
  connected = status === 'connected';
  elements['system-status'].textContent = connected ? 'ONLINE' : status === 'connecting' ? '接続中' : '再接続中';
  elements['system-card'].dataset.state = connected ? 'connected' : 'error';
  updateControls();
  if (connected) void fetch('/api/production-slots', { cache: 'no-store' }).catch(() => {});
});

function handleEvent(event) {
  if (event.type === 'state') { state = event.state; nextDeadline = performance.now() + (state.nextGuard?.remainingMs ?? 0); render(); }
  else if (event.type === 'error') showNotice(event.message, 'error');
  else if (event.type === 'accepted') showNotice(event.id?.startsWith('identify:') ? '対象Displayへ識別表示を送りました。'
    : event.id?.startsWith('scene-rehearsal:') ? 'Scene冒頭の状態へ復元しました。'
      : event.queued ? '待機キューへ追加しました。' : 'Displayへ送信しました。', 'success');
  else if (event.type === 'voices') renderVoices(event.voices);
}

function render() {
  document.body.dataset.mode = state.adminMode ?? 'show';
  elements['show-mode-button'].setAttribute('aria-pressed', String(document.body.dataset.mode === 'show'));
  elements['advanced-mode-button'].setAttribute('aria-pressed', String(document.body.dataset.mode === 'advanced'));
  const online = state.displays.filter((display) => display.online);
  elements['display-status'].textContent = `${online.length} ONLINE / ${state.displays.length} REGISTERED`;
  elements['display-card'].dataset.state = online.length ? 'connected' : 'error';
  const labels = { idle: '待機中', received: '受信済み', speaking: '再生中', completed: '完了', stopped: '停止', error: 'エラー' };
  elements['voice-status'].textContent = labels[state.playbackStatus] ?? state.playbackStatus;
  elements['voice-card'].dataset.state = state.playbackStatus === 'error' ? 'error' : state.playbackStatus === 'speaking' ? 'connected' : 'idle';
  elements['current-message'].textContent = state.currentMessage?.text ?? state.currentSubtitle ?? '待機しています';
  elements['next-message'].textContent = state.queue[0]?.text ?? 'なし';
  elements['queue-count'].textContent = `${state.queue.length} 件`;
  elements['current-cue'].textContent = cueTitle(state.currentCue, '— 待機中');
  elements['next-cue'].textContent = cueTitle(state.nextCue, '— END');
  renderSelects(); renderDisplays(); renderCues(); renderGroups(); renderConnections(); renderPreflight(); renderShowMode(); renderHistory(state.history); applySettings(state.settings);
  renderMasterWarning(); updateControls();
}

function cueTitle(cue, fallback) { return cue ? `${cue.cueNumber} ${cue.cueName}` : fallback; }
function option(value, label) { return new Option(label, value); }
function replaceOptions(select, options, selected) { if (document.activeElement === select) return; select.replaceChildren(...options); select.value = selected ?? ''; }
function targetValue(target) { return target?.type === 'display' ? `display:${target.id}` : target?.type === 'group' ? `group:${target.id}` : 'all'; }
function parseTarget(value) { const [type, ...parts] = value.split(':'); return type === 'display' || type === 'group' ? { type, id: parts.join(':') } : { type: 'all' }; }
function nullableNumber(value) { return value === '' ? null : Number(value); }
function parseSyncMarkers(value) {
  if (!value.trim()) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('Sync MarkersはJSON配列で入力してください。');
  return parsed;
}
function cueDetail(cue) {
  if (!cue) return '—';
  const markers = cue.syncMarkers?.map((marker) => `${marker.department}:${marker.id}${marker.note ? `(${marker.note})` : ''}`).join(', ') || 'なし';
  return `ID ${cue.cueId} · TARGET ${targetLabel(cue.target)} · PRESET ${cue.presentationPreset} · TRANSITION ${cue.transition?.id ?? 'none'} / ${cue.transition?.durationMs ?? 0}ms · OVERLAY ${cue.overlay?.id ?? 'none'} · VISUAL ${cue.visual?.type ?? 'none'}:${cue.visual?.id ?? 'none'} · AUDIO ${cue.audio?.speechMode ?? 'none'} · SYNC ${markers}`;
}
function targetLabel(target) {
  if (!target || target.type === 'all') return 'ALL DISPLAYS';
  if (target.type === 'display') return state.displays.find((display) => display.displayId === target.id)?.displayName ?? `不明なDisplay (${target.id})`;
  return state.targetGroups.find((group) => group.id === target.id)?.name ?? `不明な配信先セット (${target.id})`;
}
function targetOptions() {
  return [option('all', 'ALL DISPLAYS'), ...state.displays.map((display) => option(`display:${display.displayId}`, `Display: ${display.displayName}`)), ...state.targetGroups.filter((group) => group.enabled).map((group) => option(`group:${group.id}`, `配信先セット: ${group.name}`))];
}

function renderSelects() {
  const signature = JSON.stringify({ displays: state.displays.map(({ displayId, displayName, online }) => [displayId, displayName, online]), groups: state.targetGroups.map(({ id, name, enabled, displayIds }) => [id, name, enabled, displayIds]), scenes: state.scenes.map(({ sceneId, sceneName, order }) => [sceneId, sceneName, order]), audioMasterId: state.audioMasterId });
  if (signature === selectRenderSignature) { elements['scene-select'].value = state.currentSceneId ?? ''; elements['audio-master-select'].value = state.audioMasterId ?? ''; return; }
  selectRenderSignature = signature;
  replaceOptions(elements['audio-master-select'], [option('', '未指定'), ...state.displays.map((display) => option(display.displayId, `${display.displayName} (${display.online ? 'ONLINE' : 'OFFLINE'})`))], state.audioMasterId);
  replaceOptions(elements['target-select'], targetOptions(), elements['target-select'].value || 'all');
  const scenes = [...state.scenes].sort((a, b) => a.order - b.order);
  replaceOptions(elements['scene-select'], [option('', '未選択'), ...scenes.map((scene) => option(scene.sceneId, scene.sceneName))], state.currentSceneId);
  replaceOptions(elements['rehearsal-scene-select'], [option('', 'Sceneを選択'), ...scenes.map((scene) => option(scene.sceneId, scene.sceneName))],
    elements['rehearsal-scene-select'].value || state.sceneRehearsal?.sceneId || scenes[0]?.sceneId);
}

function renderDisplays() {
  elements['display-list'].replaceChildren();
  if (!state.displays.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Displayは未登録です'; elements['display-list'].append(empty); return; }
  for (const display of state.displays) {
    const item = document.createElement('article'); item.className = `display-item ${display.online ? 'online' : 'offline'}`; item.dataset.displayId = display.displayId;
    const heartbeat = display.lastHeartbeat ? new Date(display.lastHeartbeat).toLocaleTimeString('ja-JP', { hour12: false }) : '—';
    item.innerHTML = '<span class="dot"></span><div><strong></strong><small></small></div><div class="display-badges"><span></span><span></span><span class="required-mark"></span></div><div class="display-actions"><label class="required-toggle"><input data-action="required" type="checkbox"> 必須Display</label><button data-action="identify">識別表示</button><button data-action="delete" class="delete">登録削除</button></div>';
    item.querySelector('strong').textContent = display.displayName;
    item.querySelector('small').textContent = `${display.displayId} · heartbeat ${heartbeat} · ${display.currentSubtitle ? '字幕表示中' : '待機'}`;
    item.querySelector('.display-badges span:first-child').textContent = display.online ? 'ONLINE' : 'OFFLINE';
    item.querySelector('.display-badges span:nth-child(2)').textContent = state.audioMasterId === display.displayId ? `AUDIO MASTER ${display.audioReady ? 'READY' : 'NOT READY'}` : display.audioEnabled ? 'AUDIO ENABLED' : 'AUDIO DISABLED';
    item.querySelector('.required-mark').textContent = display.required ? 'REQUIRED' : 'OPTIONAL';
    item.querySelector('[data-action=required]').checked = display.required;
    item.querySelector('[data-action=identify]').disabled = !display.online;
    item.querySelector('[data-action=delete]').disabled = display.online;
    elements['display-list'].append(item);
  }
}

function renderCues() {
  const cues = [...state.cues].sort((a, b) => a.order - b.order);
  const signature = JSON.stringify([state.currentCue?.cueId, state.targetGroups, cues]);
  if (signature === cueRenderSignature) return;
  cueRenderSignature = signature; elements['cue-list'].replaceChildren();
  for (const [index, cue] of cues.entries()) {
    const scene = state.scenes.find((item) => item.sceneId === cue.sceneId);
    const item = document.createElement('article'); item.className = `cue-item ${state.currentCue?.cueId === cue.cueId ? 'current' : ''} ${cue.enabled ? '' : 'disabled'}`; item.dataset.cueId = cue.cueId;
    item.innerHTML = '<strong class="cue-number"></strong><strong class="cue-name"></strong><p></p><small></small><div class="cue-actions"><button data-action="run">▶ 実行</button><button data-action="jump">位置のみ</button><button data-action="edit">編集</button><button data-action="up">↑</button><button data-action="down">↓</button></div>';
    item.querySelector('.cue-number').textContent = cue.cueNumber; item.querySelector('.cue-name').textContent = cue.cueName; item.querySelector('p').textContent = cue.displayText || cue.speechText || cue.text || '（表示・発話なし）';
    item.querySelector('small').textContent = `${scene?.sceneName ?? 'Sceneなし'} · ${cue.kind ?? 'speech-display'} · ${cue.presentationPreset ?? 'normal'} · ${cue.transition?.id ?? 'none'} · ${cue.overlay?.id ?? 'none'} · ${targetLabel(cue.target)}${cue.enabled ? '' : ' · DISABLED'}`;
    item.querySelector('[data-action=up]').disabled = index === 0; item.querySelector('[data-action=down]').disabled = index === cues.length - 1; elements['cue-list'].append(item);
  }
}

function renderGroups() {
  elements['group-list'].replaceChildren();
  if (!state.targetGroups.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '配信先セットはありません'; elements['group-list'].append(empty); return; }
  for (const group of state.targetGroups) {
    const item = document.createElement('article'); item.className = 'group-item'; item.dataset.groupId = group.id;
    item.innerHTML = '<div class="group-item-head"><strong></strong><small></small></div><p></p><div class="group-actions"><button data-action="edit">編集</button><button data-action="delete" class="delete">削除</button></div>';
    item.querySelector('strong').textContent = group.name; item.querySelector('small').textContent = group.enabled ? 'ENABLED' : 'DISABLED';
    item.querySelector('p').textContent = group.displayIds.map((id) => state.displays.find((display) => display.displayId === id)?.displayName ?? `不明 (${id})`).join(' + ') || '対象Displayなし'; elements['group-list'].append(item);
  }
}

function renderConnections() {
  const info = state.connectionInfo; if (!info) return;
  const signature = JSON.stringify(info); if (signature === connectionRenderSignature) return; connectionRenderSignature = signature;
  elements['connection-list'].replaceChildren(); addConnectionItem('このPC', info.local.admin, info.local.display, true);
  for (const candidate of info.candidates) addConnectionItem(`${candidate.name} · ${candidate.address}${candidate.reason ? ` · ${candidate.reason}` : ''}`, candidate.adminUrl, candidate.displayUrl, candidate.usable);
}
function addConnectionItem(title, adminUrl, displayUrl, usable) {
  const item = document.createElement('article'); item.className = `connection-item ${usable ? '' : 'unusable'}`; const copy = document.createElement('div'); const heading = document.createElement('h3'); heading.textContent = title; const links = document.createElement('div'); links.className = 'connection-links';
  for (const [label, url] of [['Admin', adminUrl], ['Display', displayUrl]]) { const link = document.createElement('a'); link.href = url; link.textContent = `${label}: ${url}`; links.append(link); }
  copy.append(heading, links); item.append(copy);
  if (usable) { const qr = document.createElement('div'); qr.className = 'connection-qr'; for (const [label, url] of [['Admin', adminUrl], ['Display', displayUrl]]) { const figure = document.createElement('figure'); const image = document.createElement('img'); image.src = `/api/qr?url=${encodeURIComponent(url)}`; image.alt = `${label}接続用QRコード`; const caption = document.createElement('figcaption'); caption.textContent = label; figure.append(image, caption); qr.append(figure); } item.append(qr); }
  elements['connection-list'].append(item);
}

function renderPreflight() {
  const preflight = state.preflight; const label = preflight.status === 'ready' ? 'READY' : preflight.status === 'warning' ? 'WARNING' : 'NOT READY';
  elements['preflight-result'].textContent = label; elements['preflight-result'].dataset.state = preflight.status; elements['show-preflight-badge'].textContent = label; elements['show-preflight-badge'].dataset.state = preflight.status;
  elements['preflight-summary'].textContent = preflight.status === 'ready' ? '本番開始可能です。すべての必須項目が正常です。' : preflight.status === 'warning' ? `本番開始可能ですが、${preflight.warnings}件の注意事項があります。` : `本番開始できません。${preflight.errors}件のエラーを解消してください。`;
  elements['preflight-list'].replaceChildren();
  for (const check of preflight.items) { const item = document.createElement('article'); item.className = 'preflight-item'; item.dataset.state = check.status; const badge = document.createElement('b'); badge.textContent = check.status.toUpperCase(); const name = document.createElement('span'); name.textContent = check.label; const detail = document.createElement('small'); detail.textContent = check.detail; item.append(badge, name, detail); elements['preflight-list'].append(item); }
  const local = state.localTts ?? {};
  elements['local-tts-summary'].textContent = local.status === 'ready'
    ? `Local TTS READY — ${local.profileId} / Engine ${local.engineVersion} / ${local.styleName} (runtime Style ${local.runtimeStyleId})`
    : `Local TTS ${String(local.status ?? 'unknown').toUpperCase()} — ${local.profileId ?? 'profile不明'} / ${local.error ?? 'Engine未確認'} / Browser fallbackなし`;
}

function renderShowMode() {
  elements['production-version'].textContent = `${state.metadata?.version ?? 'Custom Show'} · ${state.metadata?.sourceScript?.modifiedTime ?? '台本時刻未設定'} · ${state.playbackStatus.toUpperCase()}`;
  elements['next-trigger'].textContent = state.nextCue?.triggerNote || '次のCueはありません';
  elements['production-speech-volume'].value = state.settings.volume;
  elements['production-sfx-volume'].value = state.settings.sfxVolume ?? .65;
  const scene = state.scenes.find((item) => item.sceneId === state.currentSceneId); elements['show-current-scene'].textContent = scene?.sceneName ?? '— 未選択';
  elements['show-current-cue'].textContent = cueTitle(state.currentCue, '— 待機中');
  elements['show-current-text'].textContent = state.sceneRehearsal?.ready && !state.nextCue
    ? 'このScene内に横川AI Cueはありません。'
    : state.currentCue?.text ?? 'NEXTを押すと最初のCueを実行します。';
  elements['show-current-target'].textContent = `TARGET — ${state.currentCue ? targetLabel(state.currentCue.target) : '—'}`;
  elements['show-next-cue'].textContent = cueTitle(state.nextCue, '— END'); elements['show-next-text'].textContent = state.nextCue?.text ?? '次のCueはありません。'; elements['show-next-button-label'].textContent = state.nextCue ? `${state.nextCue.cueNumber} ${state.nextCue.cueName}` : '次のCueはありません';
  elements['show-operator-note'].textContent = state.currentCue?.operatorNote || '—'; elements['show-trigger-note'].textContent = state.currentCue?.triggerNote || '—';
  elements['show-current-detail'].textContent = cueDetail(state.currentCue); elements['show-next-detail'].textContent = cueDetail(state.nextCue);
  elements['show-current-meta'].textContent = state.currentCue ? `ROUTE ${state.currentCue.route ?? 'main'} · LOCATION ${state.currentCue.location || '—'} · PRESET ${state.currentCue.presentationPreset ?? 'normal'} · AVATAR ${state.currentCue.avatar?.state ?? 'normal'} · AUDIO ${state.currentCue.audio?.speechMode ?? 'browser'}` : 'ROUTE main · PRESET normal · AVATAR normal · AUDIO browser';
  elements['rehearsal-toggle'].textContent = state.rehearsalSession?.active ? 'リハーサル終了' : 'リハーサル開始';
  elements['scene-rehearsal-session-toggle'].textContent = state.rehearsalSession?.active ? 'リハーサル終了' : 'リハーサル開始';
  const elapsed = state.rehearsalSession ? Math.max(0, Date.now() - Date.parse(state.rehearsalSession.startedAt)) : 0; elements['rehearsal-status'].textContent = state.rehearsalSession ? `${state.rehearsalSession.active ? '記録中' : '終了'} · ${Math.floor(elapsed / 60000)}:${String(Math.floor(elapsed / 1000) % 60).padStart(2, '0')} · ${state.rehearsalLog.length}件` : 'リハーサル未開始';
  elements['shortcuts-input'].checked = state.settings.shortcutsEnabled !== false;
  const rehearsal = state.sceneRehearsal;
  elements['scene-rehearsal-ready'].hidden = rehearsal?.ready !== true;
  if (rehearsal?.ready) {
    elements['scene-rehearsal-ready-scene'].textContent = rehearsal.sceneName;
    const cue = state.cues.find((item) => item.cueId === rehearsal.nextCueId);
    elements['scene-rehearsal-ready-next'].textContent = cue
      ? `NEXT → ${cue.cueNumber} ${cue.cueName}` : 'このScene内に横川AI Cueはありません';
  }
  elements['scene-rehearsal-help'].textContent = state.rehearsalSession?.active
    ? 'Sceneを選び、明示的に開始してください。選択だけでは状態は変わりません。'
    : '安全のため、先に「リハーサル開始」を有効にしてください。';
  elements['show-alerts'].replaceChildren(); for (const warning of state.preflight.items.filter((item) => item.status !== 'ok').slice(0, 5)) { const item = document.createElement('div'); item.className = `show-alert ${warning.status}`; item.textContent = `${warning.label}: ${warning.detail}`; elements['show-alerts'].append(item); }
  const missingPuzzles = state.assets.filter(asset => asset.id.startsWith('puzzle-') && asset.path.endsWith('puzzle-image-pending.svg'));
  if (missingPuzzles.length) { const notice = document.createElement('div'); notice.className = 'show-alert warning'; notice.textContent = `問題画像 ${missingPuzzles.length}枠が未提供 — 編集ツールで設定してください`; elements['show-alerts'].append(notice); }
}

function renderMasterWarning() {
  const master = state.displays.find((display) => display.displayId === state.audioMasterId);
  if (!state.audioMasterId) { elements['master-warning'].textContent = '⚠ AUDIO MASTER未指定 — 本番前に指定してください'; elements['master-warning'].hidden = false; }
  else if (!master?.online) { elements['master-warning'].textContent = `⚠ AUDIO MASTER OFFLINE — ${master?.displayName ?? state.audioMasterId} の音声は再生されません`; elements['master-warning'].hidden = false; }
  else if (!master.audioEnabled || !master.audioReady) { elements['master-warning'].textContent = `⚠ AUDIO MASTER音声準備待ち — ${master.displayName} のDisplay設定から音声を有効化してください`; elements['master-warning'].hidden = false; }
  else elements['master-warning'].hidden = true;
}

function renderHistory(history) {
  elements['history-list'].replaceChildren(); if (!history.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '履歴はまだありません'; elements['history-list'].append(empty); return; }
  const labels = { queued: '待機', received: '受信', speaking: '再生中', completed: '完了', stopped: '停止', error: 'エラー' };
  for (const item of history) { const article = document.createElement('article'); article.className = 'history-item'; const main = document.createElement('div'); main.className = 'history-main'; const meta = document.createElement('div'); meta.className = 'history-meta'; const time = document.createElement('time'); time.textContent = new Date(item.createdAt).toLocaleTimeString('ja-JP', { hour12: false }); const source = document.createElement('span'); source.className = 'history-id'; source.textContent = item.source === 'cue' ? `CUE ${item.cueName ?? item.cueId}` : item.source === 'test' ? 'AUDIO TEST' : 'FREE SPEAK'; const target = document.createElement('span'); target.className = 'history-id'; target.textContent = targetLabel(item.target); const status = document.createElement('span'); status.className = 'history-status'; status.dataset.state = item.status; status.textContent = labels[item.status] ?? item.status; const text = document.createElement('p'); text.textContent = item.text; meta.append(time, source, target, status); main.append(meta, text); const actions = document.createElement('div'); actions.className = 'history-actions'; const restore = document.createElement('button'); restore.type = 'button'; restore.textContent = '入力へ戻す'; restore.onclick = () => { elements['speech-input'].value = item.text; updateCount(); }; const replay = document.createElement('button'); replay.type = 'button'; replay.textContent = '再読み上げ'; replay.onclick = () => socket.send({ type: 'replay', id: item.id }); actions.append(restore, replay); article.append(main, actions); elements['history-list'].append(article); }
}

function applySettings(settings) { if (document.activeElement?.matches('.settings input, .settings select')) return; elements['rate-input'].value = settings.rate; elements['rate-output'].value = Number(settings.rate).toFixed(1); elements['pitch-input'].value = settings.pitch; elements['pitch-output'].value = Number(settings.pitch).toFixed(1); elements['volume-input'].value = settings.volume; elements['volume-output'].value = `${Math.round(settings.volume * 100)}%`; elements['subtitle-input'].checked = settings.subtitlesEnabled; elements['voice-select'].value = settings.voiceURI; }
function renderVoices(voices) { const current = state?.settings.voiceURI ?? ''; elements['voice-select'].replaceChildren(option('', '日本語の既定音声'), ...voices.map((voice) => option(voice.voiceURI, `${voice.name} (${voice.lang})`))); elements['voice-select'].value = current; }
function showNotice(message, kind = 'info') { clearTimeout(noticeTimer); elements.notice.textContent = message; elements.notice.dataset.kind = kind; elements.notice.hidden = false; noticeTimer = setTimeout(() => { elements.notice.hidden = true; }, 6000); }
function updateCount() { elements['character-count'].textContent = `${elements['speech-input'].value.length.toLocaleString('ja-JP')} / 5,000`; updateControls(); }
function updateControls() {
  const hasDisplay = state?.displays.some((display) => display.online); const locked = !connected || actionLocked; elements['send-button'].disabled = !connected || !hasDisplay || !elements['speech-input'].value.trim();
  const nextGuarded = performance.now() < nextDeadline;
  for (const id of ['next-button', 'show-next-button']) { elements[id].disabled = !connected || nextGuarded || !state?.nextCue || !hasDisplay; elements[id].title = nextGuarded ? 'NEXT保護中（1.2秒）。連打は破棄されます。' : '次の合図でNEXT'; }
  if (nextGuarded) elements['show-next-button-label'].textContent = 'NEXT受理・二重押し保護中…';
  else if (state) elements['show-next-button-label'].textContent = state.nextCue ? `${state.nextCue.cueNumber} ${state.nextCue.cueName}` : '次のCueはありません';
  for (const id of ['back-button', 'show-back-button']) elements[id].disabled = locked || (state?.currentCueIndex ?? -1) < 0;
  for (const id of ['cue-replay-button', 'show-replay-button']) elements[id].disabled = locked || !state?.currentCue || !hasDisplay;
  for (const id of ['show-clear-button', 'show-blackout-button', 'show-blackout-clear-button']) elements[id].disabled = !connected || !hasDisplay;
  for (const button of elements['cue-list'].querySelectorAll('[data-action="run"], [data-action="jump"]')) button.disabled = locked || !hasDisplay;
  elements['scene-rehearsal-start'].disabled = locked || !state?.rehearsalSession?.active || !elements['rehearsal-scene-select'].value || !hasDisplay;
  elements['scene-rehearsal-session-toggle'].disabled = locked;
  const presentationActive = state?.currentTransition?.status === 'active' || state?.unlock?.status === 'running';
  const localTtsActive = state?.localTts?.activity === 'synthesizing';
  for (const id of ['stop-button', 'show-stop-button']) elements[id].disabled = !connected || !hasDisplay;
  const master = state?.displays.find((display) => display.displayId === state.audioMasterId); elements['audio-test-button'].disabled = !connected || !master?.online || !master?.audioReady;
  elements['local-tts-test-button'].disabled = !connected || !master?.online || !master?.audioReady || state?.localTts?.status !== 'ready';
}
function performAction(type, extra = {}) {
  const emergency = ['stop', 'blackout', 'blackout:clear', 'clear'].includes(type);
  if (type === 'cue:next') { if (performance.now() < nextDeadline) return; nextDeadline = performance.now() + (state?.nextGuard?.intervalMs || 1200); }
  else if (!emergency) { if (actionLocked) return; actionLocked = true; window.setTimeout(() => { actionLocked = false; updateControls(); }, 650); }
  updateControls(); socket.send({ type, actionId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, ...extra });
}
setInterval(updateControls, 100);
function updateSettings() { socket.send({ type: 'settings:update', settings: { voiceURI: elements['voice-select'].value, rate: Number(elements['rate-input'].value), pitch: Number(elements['pitch-input'].value), volume: Number(elements['volume-input'].value), subtitlesEnabled: elements['subtitle-input'].checked, shortcutsEnabled: elements['shortcuts-input'].checked } }); }
function openCue(cue = {}) {
  elements['cue-id'].value = cue.cueId ?? ''; elements['cue-number'].value = cue.cueNumber ?? String(state.cues.length + 1).padStart(3, '0'); elements['cue-name'].value = cue.cueName ?? '';
  elements['cue-text'].value = cue.speechText ?? cue.text ?? ''; elements['cue-display-text'].value = cue.displayText ?? cue.text ?? ''; elements['cue-kind'].value = cue.kind ?? 'speech-display';
  elements['cue-speech-mode'].value = cue.audio?.speechMode ?? 'browser'; elements['cue-avatar-state'].value = cue.avatar?.state ?? 'normal'; elements['cue-lip-sync'].value = cue.audio?.lipSyncMode ?? 'simulated';
  elements['cue-operator-note'].value = cue.operatorNote ?? ''; elements['cue-trigger-note'].value = cue.triggerNote ?? ''; elements['cue-location'].value = cue.location ?? ''; elements['cue-enabled'].checked = cue.enabled !== false;
  replaceOptions(elements['cue-scene'], [option('', 'Sceneなし'), ...state.scenes.map((scene) => option(scene.sceneId, scene.sceneName))], cue.sceneId);
  replaceOptions(elements['cue-route'], (state.routes ?? [{ id: 'main', name: 'Main' }]).map((route) => option(route.id, route.name ?? route.id)), cue.route ?? 'main'); replaceOptions(elements['cue-target'], targetOptions(), targetValue(cue.target));
  replaceOptions(elements['cue-preset'], state.presets.map((preset) => option(preset.id, preset.name)), cue.presentationPreset ?? 'normal'); replaceOptions(elements['cue-asset'], [option('', 'なし'), ...state.assets.map((asset) => option(asset.id, asset.name))], cue.audio?.assetId ?? '');
  replaceOptions(elements['cue-transition'], transitionIds.map((id) => option(id, id)), cue.transition?.id ?? 'none'); replaceOptions(elements['cue-overlay'], overlayIds.map((id) => option(id, id)), cue.overlay?.id ?? 'none'); replaceOptions(elements['cue-visual-type'], visualTypes.map((id) => option(id, id)), cue.visual?.type ?? 'none');
  elements['cue-transition-duration'].value = cue.transition?.durationMs ?? 900; elements['cue-transition-intensity'].value = cue.transition?.intensity ?? 1;
  elements['cue-overlay-visible'].checked = cue.overlay?.visible === true; elements['cue-overlay-progress'].value = cue.overlay?.progress ?? ''; elements['cue-overlay-title'].value = cue.overlay?.title ?? ''; elements['cue-overlay-message'].value = cue.overlay?.message ?? '';
  elements['cue-visual-id'].value = cue.visual?.id ?? 'none'; elements['cue-visual-visible'].checked = cue.visual?.visible === true; elements['cue-visual-title'].value = cue.visual?.title ?? ''; elements['cue-visual-message'].value = cue.visual?.message ?? ''; elements['cue-visual-items'].value = (cue.visual?.items ?? []).join('\n');
  replaceOptions(elements['cue-visual-asset'], [option('', 'なし'), ...state.assets.filter((asset) => asset.mimeType?.startsWith('image/')).map((asset) => option(asset.id, asset.name))], cue.visual?.assetId ?? '');
  elements['cue-unlock-duration'].value = cue.timing?.unlockDurationMs ?? 5000; elements['cue-overlay-clear'].value = cue.timing?.autoClearOverlayMs ?? ''; elements['cue-visual-hide'].value = cue.timing?.autoHideVisualMs ?? '';
  elements['cue-sync-markers'].value = cue.syncMarkers?.length ? JSON.stringify(cue.syncMarkers, null, 2) : '';
  elements['cue-dialog'].showModal();
}
function openGroup(group = {}) { elements['group-id'].value = group.id ?? ''; elements['group-name'].value = group.name ?? ''; elements['group-notes'].value = group.notes ?? ''; elements['group-enabled'].checked = group.enabled !== false; elements['group-display-options'].replaceChildren(); for (const display of state.displays) { const label = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.value = display.displayId; input.checked = group.displayIds?.includes(display.displayId) ?? false; const text = document.createElement('span'); text.textContent = `${display.displayName} (${display.online ? 'ONLINE' : 'OFFLINE'})`; label.append(input, text); elements['group-display-options'].append(label); } elements['group-dialog'].showModal(); }

elements['speech-input'].addEventListener('input', updateCount);
elements['speech-input'].addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); elements['send-button'].click(); } });
elements['send-button'].addEventListener('click', () => socket.send({ type: 'speak', text: elements['speech-input'].value.trim(), target: parseTarget(elements['target-select'].value) }));
elements['clear-button'].addEventListener('click', () => { elements['speech-input'].value = ''; updateCount(); elements['speech-input'].focus(); });
for (const [id, type] of [['stop-button', 'stop'], ['show-stop-button', 'stop'], ['back-button', 'cue:back'], ['show-back-button', 'cue:back'], ['next-button', 'cue:next'], ['show-next-button', 'cue:next'], ['cue-replay-button', 'cue:replay'], ['show-replay-button', 'cue:replay']]) elements[id].addEventListener('click', () => performAction(type));
elements['replay-button'].addEventListener('click', () => socket.send({ type: 'replay' })); elements['scene-select'].addEventListener('change', () => { if (elements['scene-select'].value) socket.send({ type: 'scene:jump', sceneId: elements['scene-select'].value }); }); elements['audio-master-select'].addEventListener('change', () => socket.send({ type: 'audio-master:set', displayId: elements['audio-master-select'].value || null })); elements['audio-test-button'].addEventListener('click', () => performAction('audio:test')); elements['local-tts-test-button'].addEventListener('click', () => performAction('local-tts:test'));
elements['rehearsal-scene-select'].addEventListener('change', updateControls);
elements['scene-rehearsal-start'].addEventListener('click', () => performAction('scene:rehearsal-start', { sceneId: elements['rehearsal-scene-select'].value }));
elements['scene-rehearsal-session-toggle'].addEventListener('click', () => performAction(state.rehearsalSession?.active ? 'rehearsal:stop' : 'rehearsal:start'));
elements['show-mode-button'].addEventListener('click', () => socket.send({ type: 'admin-mode:set', mode: 'show' })); elements['advanced-mode-button'].addEventListener('click', () => socket.send({ type: 'admin-mode:set', mode: 'advanced' })); elements['open-advanced-button'].addEventListener('click', () => socket.send({ type: 'admin-mode:set', mode: 'advanced' })); elements['show-preflight-badge'].addEventListener('click', () => elements['preflight-panel'].scrollIntoView({ behavior: 'smooth' }));
elements['new-cue-button'].addEventListener('click', () => openCue()); elements['new-group-button'].addEventListener('click', () => openGroup());
elements['display-list'].addEventListener('change', (event) => { if (event.target.dataset.action === 'required') socket.send({ type: 'display:required', displayId: event.target.closest('.display-item').dataset.displayId, required: event.target.checked }); });
elements['display-list'].addEventListener('click', (event) => { const button = event.target.closest('button'); const item = button?.closest('.display-item'); if (!button || !item) return; if (button.dataset.action === 'identify') socket.send({ type: 'display:identify', displayId: item.dataset.displayId }); else if (button.dataset.action === 'delete' && window.confirm('このOFFLINE Display登録を削除しますか？\n配信先セットからも安全に除去されます。')) socket.send({ type: 'display:delete', displayId: item.dataset.displayId }); });
elements['cue-list'].addEventListener('click', (event) => { const button = event.target.closest('button'); const item = button?.closest('.cue-item'); if (!button || !item) return; const cue = state.cues.find((entry) => entry.cueId === item.dataset.cueId); if (button.dataset.action === 'run') performAction('cue:execute', { cueId: cue.cueId }); else if (button.dataset.action === 'jump') performAction('cue:jump', { cueId: cue.cueId }); else if (button.dataset.action === 'edit') openCue(cue); else { const cues = [...state.cues].sort((a, b) => a.order - b.order); const index = cues.findIndex((entry) => entry.cueId === cue.cueId); const other = button.dataset.action === 'up' ? index - 1 : index + 1; [cues[index], cues[other]] = [cues[other], cues[index]]; socket.send({ type: 'cue:reorder', cueIds: cues.map((entry) => entry.cueId) }); } });
elements['group-list'].addEventListener('click', (event) => { const button = event.target.closest('button'); const item = button?.closest('.group-item'); if (!button || !item) return; const group = state.targetGroups.find((entry) => entry.id === item.dataset.groupId); if (button.dataset.action === 'edit') openGroup(group); else if (window.confirm(`配信先セット「${group.name}」を削除しますか？`)) socket.send({ type: 'target-group:delete', groupId: group.id }); });
elements['cue-form'].addEventListener('submit', (event) => {
  event.preventDefault();
  let syncMarkers;
  try { syncMarkers = parseSyncMarkers(elements['cue-sync-markers'].value); } catch (error) { showNotice(error.message, 'error'); return; }
  socket.send({ type: 'cue:save', cue: {
    cueId: elements['cue-id'].value || undefined, cueNumber: elements['cue-number'].value, cueName: elements['cue-name'].value, route: elements['cue-route'].value, location: elements['cue-location'].value,
    speechText: elements['cue-text'].value, displayText: elements['cue-display-text'].value, kind: elements['cue-kind'].value, presentationPreset: elements['cue-preset'].value, sceneId: elements['cue-scene'].value || null, target: parseTarget(elements['cue-target'].value),
    avatar: { visible: true, state: elements['cue-avatar-state'].value }, audio: { speechMode: elements['cue-speech-mode'].value, assetId: elements['cue-asset'].value || null, lipSyncMode: elements['cue-lip-sync'].value },
    transition: { id: elements['cue-transition'].value, durationMs: Number(elements['cue-transition-duration'].value), intensity: Number(elements['cue-transition-intensity'].value) },
    overlay: { id: elements['cue-overlay'].value, visible: elements['cue-overlay-visible'].checked, title: elements['cue-overlay-title'].value, message: elements['cue-overlay-message'].value, progress: nullableNumber(elements['cue-overlay-progress'].value) },
    visual: { id: elements['cue-visual-id'].value, type: elements['cue-visual-type'].value, assetId: elements['cue-visual-asset'].value || null, visible: elements['cue-visual-visible'].checked, title: elements['cue-visual-title'].value, message: elements['cue-visual-message'].value, items: elements['cue-visual-items'].value.split('\n').map((value) => value.trim()).filter(Boolean) },
    timing: { unlockDurationMs: Number(elements['cue-unlock-duration'].value), autoClearOverlayMs: nullableNumber(elements['cue-overlay-clear'].value), autoHideVisualMs: nullableNumber(elements['cue-visual-hide'].value) }, syncMarkers,
    operatorNote: elements['cue-operator-note'].value, triggerNote: elements['cue-trigger-note'].value, enabled: elements['cue-enabled'].checked,
  } });
  elements['cue-dialog'].close();
});
elements['group-form'].addEventListener('submit', (event) => { event.preventDefault(); socket.send({ type: 'target-group:save', group: { id: elements['group-id'].value || undefined, name: elements['group-name'].value, notes: elements['group-notes'].value, enabled: elements['group-enabled'].checked, displayIds: [...elements['group-display-options'].querySelectorAll('input:checked')].map((input) => input.value) } }); elements['group-dialog'].close(); });
elements['reset-button'].addEventListener('click', () => { if (window.confirm('SHOW RESETを実行しますか？\nCue位置・字幕・発話キューを初期化します。Cue定義とDisplay登録は保持されます。')) socket.send({ type: 'show:reset' }); });
elements['production-reset'].addEventListener('click', () => socket.send({ type: 'production:reset' }));
elements['production-speech-volume'].addEventListener('change', event => socket.send({ type: 'settings:update', settings: { volume: Number(event.target.value) } }));
elements['production-sfx-volume'].addEventListener('change', event => socket.send({ type: 'settings:update', settings: { sfxVolume: Number(event.target.value) } }));
for (const id of ['voice-select', 'rate-input', 'pitch-input', 'volume-input', 'subtitle-input', 'shortcuts-input']) elements[id].addEventListener('change', updateSettings);
elements['show-clear-button'].addEventListener('click', () => performAction('clear'));
elements['show-blackout-button'].addEventListener('click', () => performAction('blackout'));
elements['show-blackout-clear-button'].addEventListener('click', () => performAction('blackout:clear'));
elements['rehearsal-toggle'].addEventListener('click', () => socket.send({ type: state.rehearsalSession?.active ? 'rehearsal:stop' : 'rehearsal:start' }));
elements['show-file-input'].addEventListener('change', async () => { const file = elements['show-file-input'].files[0]; if (!file) return; try { const data = JSON.parse(await file.text()); const check = await fetch('/api/show-file/validate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }).then((response) => response.json()); if (!check.valid) return showNotice(`Show Fileエラー: ${check.errors.join(', ')}`, 'error'); if (!window.confirm(`検証OK: Cue ${check.summary.cues}件。現在のShow定義へ適用しますか？`)) return; const result = await fetch('/api/show-file/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }).then((response) => response.json()); showNotice(result.valid ? 'Show Fileを適用しました。' : result.errors.join(', '), result.valid ? 'success' : 'error'); } catch (error) { showNotice(`Show Fileを読み込めません: ${error.message}`, 'error'); } finally { elements['show-file-input'].value = ''; } });
document.addEventListener('keydown', (event) => { const command = shortcutCommand(event, state?.settings.shortcutsEnabled); if (command) { event.preventDefault(); performAction(command); } });
setInterval(() => { elements.clock.textContent = new Date().toLocaleTimeString('ja-JP', { hour12: false }); }, 250);
updateCount();
