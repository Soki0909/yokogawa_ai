import { ReconnectingSocket } from './socket-client.js';

const elements = Object.fromEntries([...document.querySelectorAll('[id]')].map((element) => [element.id, element]));
let state = null;
let noticeTimer;
let connected = false;
let cueRenderSignature = '';
let selectRenderSignature = '';

const socket = new ReconnectingSocket('admin', handleEvent, (status) => {
  connected = status === 'connected';
  elements['system-status'].textContent = connected ? 'ONLINE' : status === 'connecting' ? '接続中' : '再接続中';
  elements['system-card'].dataset.state = connected ? 'connected' : 'error';
  updateControls();
});

function handleEvent(event) {
  if (event.type === 'state') {
    state = event.state; render();
  } else if (event.type === 'error') {
    showNotice(event.message, 'error');
  } else if (event.type === 'accepted') {
    showNotice(event.queued ? '待機キューへ追加しました。' : 'Displayへ送信しました。', 'success');
  } else if (event.type === 'voices') {
    renderVoices(event.voices);
  }
}

function render() {
  const online = state.displays.filter((display) => display.online);
  elements['display-status'].textContent = `${online.length} ONLINE / ${state.displays.length} REGISTERED`;
  elements['display-card'].dataset.state = online.length ? 'connected' : 'error';
  const labels = { idle: '待機中', received: '受信済み', speaking: '再生中', completed: '完了', stopped: '停止', error: 'エラー' };
  elements['voice-status'].textContent = labels[state.playbackStatus] ?? state.playbackStatus;
  elements['voice-card'].dataset.state = state.playbackStatus === 'error' ? 'error' : state.playbackStatus === 'speaking' ? 'connected' : 'idle';
  elements['current-message'].textContent = state.currentMessage?.text ?? state.currentSubtitle ?? '待機しています';
  elements['next-message'].textContent = state.queue[0]?.text ?? 'なし';
  elements['queue-count'].textContent = `${state.queue.length} 件`;
  elements['current-cue'].textContent = state.currentCue ? `${state.currentCue.cueNumber} ${state.currentCue.cueName}` : '— 待機中';
  elements['next-cue'].textContent = state.nextCue ? `${state.nextCue.cueNumber} ${state.nextCue.cueName}` : '— END';
  renderSelects();
  renderDisplays();
  renderCues();
  renderHistory(state.history);
  applySettings(state.settings);
  const master = state.displays.find((display) => display.displayId === state.audioMasterId);
  elements['master-warning'].hidden = !state.audioMasterId || Boolean(master?.online);
  if (!state.audioMasterId) {
    elements['master-warning'].textContent = '⚠ AUDIO MASTER未指定 — 最初のDisplay接続時に自動指定されます';
    elements['master-warning'].hidden = false;
  } else {
    elements['master-warning'].textContent = `⚠ AUDIO MASTER OFFLINE — ${master?.displayName ?? state.audioMasterId} の音声は再生されません`;
  }
  updateControls();
}

function option(value, label) { return new Option(label, value); }
function replaceOptions(select, options, selected) {
  if (document.activeElement === select) return;
  select.replaceChildren(...options);
  select.value = selected ?? '';
}
function targetValue(target) { return target?.type === 'display' ? `display:${target.id}` : target?.type === 'group' ? `group:${target.id}` : 'all'; }
function parseTarget(value) {
  const [type, ...parts] = value.split(':');
  return type === 'display' || type === 'group' ? { type, id: parts.join(':') } : { type: 'all' };
}

function renderSelects() {
  const displays = state.displays;
  const signature = JSON.stringify({
    displays: displays.map(({ displayId, displayName, online }) => [displayId, displayName, online]),
    scenes: state.scenes.map(({ sceneId, sceneName, order }) => [sceneId, sceneName, order]),
    audioMasterId: state.audioMasterId,
  });
  if (signature === selectRenderSignature) {
    elements['scene-select'].value = state.currentSceneId ?? '';
    elements['audio-master-select'].value = state.audioMasterId ?? '';
    return;
  }
  selectRenderSignature = signature;
  replaceOptions(elements['audio-master-select'], [option('', '未指定'), ...displays.map((display) => option(display.displayId, `${display.displayName} (${display.online ? 'ONLINE' : 'OFFLINE'})`))], state.audioMasterId);
  replaceOptions(elements['target-select'], [option('all', 'ALL DISPLAYS'), ...displays.map((display) => option(`display:${display.displayId}`, display.displayName))], elements['target-select'].value || 'all');
  replaceOptions(elements['scene-select'], [option('', '未選択'), ...state.scenes.sort((a, b) => a.order - b.order).map((scene) => option(scene.sceneId, scene.sceneName))], state.currentSceneId);
}

function renderDisplays() {
  elements['display-list'].replaceChildren();
  if (!state.displays.length) {
    const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Displayは未登録です'; elements['display-list'].append(empty); return;
  }
  for (const display of state.displays) {
    const item = document.createElement('article');
    item.className = `display-item ${display.online ? 'online' : 'offline'}`;
    const heartbeat = display.lastHeartbeat ? new Date(display.lastHeartbeat).toLocaleTimeString('ja-JP', { hour12: false }) : '—';
    item.innerHTML = '<span class="dot"></span><div><strong></strong><small></small></div><div class="display-badges"><span></span><span></span></div>';
    item.querySelector('strong').textContent = display.displayName;
    item.querySelector('small').textContent = `${display.displayId} · heartbeat ${heartbeat} · ${display.currentSubtitle ? '字幕表示中' : '待機'}`;
    item.querySelector('.display-badges span:first-child').textContent = display.online ? 'ONLINE' : 'OFFLINE';
    item.querySelector('.display-badges span:last-child').textContent = state.audioMasterId === display.displayId ? 'AUDIO MASTER' : display.audioEnabled ? 'AUDIO OK' : 'MUTED';
    elements['display-list'].append(item);
  }
}

function renderCues() {
  const cues = [...state.cues].sort((a, b) => a.order - b.order);
  const signature = JSON.stringify([state.currentCue?.cueId, cues.map((cue) => [cue.cueId, cue.order, cue.cueNumber, cue.cueName, cue.text, cue.sceneId, cue.target, cue.enabled])]);
  if (signature === cueRenderSignature) return;
  cueRenderSignature = signature;
  elements['cue-list'].replaceChildren();
  for (const [index, cue] of cues.entries()) {
    const scene = state.scenes.find((item) => item.sceneId === cue.sceneId);
    const item = document.createElement('article');
    item.className = `cue-item ${state.currentCue?.cueId === cue.cueId ? 'current' : ''} ${cue.enabled ? '' : 'disabled'}`;
    item.dataset.cueId = cue.cueId;
    item.innerHTML = '<strong class="cue-number"></strong><strong class="cue-name"></strong><p></p><small></small><div class="cue-actions"><button data-action="run">▶</button><button data-action="edit">編集</button><button data-action="up">↑</button><button data-action="down">↓</button></div>';
    item.querySelector('.cue-number').textContent = cue.cueNumber;
    item.querySelector('.cue-name').textContent = cue.cueName;
    item.querySelector('p').textContent = cue.text;
    item.querySelector('small').textContent = `${scene?.sceneName ?? 'Sceneなし'} · ${targetValue(cue.target) === 'all' ? 'ALL' : cue.target.id}${cue.enabled ? '' : ' · DISABLED'}`;
    item.querySelector('[data-action="up"]').disabled = index === 0;
    item.querySelector('[data-action="down"]').disabled = index === cues.length - 1;
    elements['cue-list'].append(item);
  }
}

function renderHistory(history) {
  elements['history-list'].replaceChildren();
  if (!history.length) {
    const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '履歴はまだありません'; elements['history-list'].append(empty); return;
  }
  const labels = { queued: '待機', received: '受信', speaking: '再生中', completed: '完了', stopped: '停止', error: 'エラー' };
  for (const item of history) {
    const article = document.createElement('article'); article.className = 'history-item';
    const main = document.createElement('div'); main.className = 'history-main';
    const meta = document.createElement('div'); meta.className = 'history-meta';
    const time = document.createElement('time'); time.textContent = new Date(item.createdAt).toLocaleTimeString('ja-JP', { hour12: false });
    const source = document.createElement('span'); source.className = 'history-id'; source.textContent = item.source === 'cue' ? `CUE ${item.cueName ?? item.cueId}` : 'FREE SPEAK';
    const target = document.createElement('span'); target.className = 'history-id'; target.textContent = targetValue(item.target) === 'all' ? 'ALL' : item.target?.id;
    const status = document.createElement('span'); status.className = 'history-status'; status.dataset.state = item.status; status.textContent = labels[item.status] ?? item.status;
    const text = document.createElement('p'); text.textContent = item.text;
    meta.append(time, source, target, status); main.append(meta, text);
    const actions = document.createElement('div'); actions.className = 'history-actions';
    const restore = document.createElement('button'); restore.type = 'button'; restore.textContent = '入力へ戻す'; restore.onclick = () => { elements['speech-input'].value = item.text; updateCount(); };
    const replay = document.createElement('button'); replay.type = 'button'; replay.textContent = '再読み上げ'; replay.onclick = () => socket.send({ type: 'replay', id: item.id });
    actions.append(restore, replay); article.append(main, actions); elements['history-list'].append(article);
  }
}

function applySettings(settings) {
  if (document.activeElement?.matches('.settings input, .settings select')) return;
  elements['rate-input'].value = settings.rate; elements['rate-output'].value = Number(settings.rate).toFixed(1);
  elements['pitch-input'].value = settings.pitch; elements['pitch-output'].value = Number(settings.pitch).toFixed(1);
  elements['volume-input'].value = settings.volume; elements['volume-output'].value = `${Math.round(settings.volume * 100)}%`;
  elements['subtitle-input'].checked = settings.subtitlesEnabled; elements['voice-select'].value = settings.voiceURI;
}
function renderVoices(voices) {
  const current = state?.settings.voiceURI ?? '';
  elements['voice-select'].replaceChildren(option('', '日本語の既定音声'), ...voices.map((voice) => option(voice.voiceURI, `${voice.name} (${voice.lang})`)));
  elements['voice-select'].value = current;
}
function showNotice(message, kind = 'info') {
  clearTimeout(noticeTimer); elements.notice.textContent = message; elements.notice.dataset.kind = kind; elements.notice.hidden = false;
  noticeTimer = setTimeout(() => { elements.notice.hidden = true; }, 6000);
}
function updateCount() { elements['character-count'].textContent = `${elements['speech-input'].value.length.toLocaleString('ja-JP')} / 5,000`; updateControls(); }
function updateControls() {
  const hasDisplay = state?.displays.some((display) => display.online);
  elements['send-button'].disabled = !connected || !hasDisplay || !elements['speech-input'].value.trim();
  elements['next-button'].disabled = !connected || !state?.nextCue || !hasDisplay;
  elements['back-button'].disabled = !connected || (state?.currentCueIndex ?? -1) < 0;
  elements['cue-replay-button'].disabled = !connected || !state?.currentCue || !hasDisplay;
  elements['stop-button'].disabled = !connected || !state?.currentMessage;
}
function updateSettings() {
  socket.send({ type: 'settings:update', settings: {
    voiceURI: elements['voice-select'].value, rate: Number(elements['rate-input'].value),
    pitch: Number(elements['pitch-input'].value), volume: Number(elements['volume-input'].value),
    subtitlesEnabled: elements['subtitle-input'].checked,
  } });
}
function openCue(cue = {}) {
  elements['cue-id'].value = cue.cueId ?? '';
  elements['cue-number'].value = cue.cueNumber ?? String(state.cues.length + 1).padStart(3, '0');
  elements['cue-name'].value = cue.cueName ?? '';
  elements['cue-text'].value = cue.text ?? '';
  elements['cue-enabled'].checked = cue.enabled !== false;
  replaceOptions(elements['cue-scene'], [option('', 'Sceneなし'), ...state.scenes.map((scene) => option(scene.sceneId, scene.sceneName))], cue.sceneId);
  replaceOptions(elements['cue-target'], [option('all', 'ALL DISPLAYS'), ...state.displays.map((display) => option(`display:${display.displayId}`, display.displayName))], targetValue(cue.target));
  elements['cue-dialog'].showModal();
}

elements['speech-input'].addEventListener('input', updateCount);
elements['speech-input'].addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); elements['send-button'].click(); } });
elements['send-button'].addEventListener('click', () => socket.send({ type: 'speak', text: elements['speech-input'].value.trim(), target: parseTarget(elements['target-select'].value) }));
elements['stop-button'].addEventListener('click', () => socket.send({ type: 'stop' }));
elements['replay-button'].addEventListener('click', () => socket.send({ type: 'replay' }));
elements['clear-button'].addEventListener('click', () => { elements['speech-input'].value = ''; updateCount(); elements['speech-input'].focus(); });
elements['back-button'].addEventListener('click', () => socket.send({ type: 'cue:back' }));
elements['next-button'].addEventListener('click', () => socket.send({ type: 'cue:next' }));
elements['cue-replay-button'].addEventListener('click', () => socket.send({ type: 'cue:replay' }));
elements['scene-select'].addEventListener('change', () => { if (elements['scene-select'].value) socket.send({ type: 'scene:jump', sceneId: elements['scene-select'].value }); });
elements['audio-master-select'].addEventListener('change', () => socket.send({ type: 'audio-master:set', displayId: elements['audio-master-select'].value || null }));
elements['new-cue-button'].addEventListener('click', () => openCue());
elements['cue-list'].addEventListener('click', (event) => {
  const button = event.target.closest('button'); const item = button?.closest('.cue-item'); if (!button || !item) return;
  const cue = state.cues.find((entry) => entry.cueId === item.dataset.cueId);
  if (button.dataset.action === 'run') socket.send({ type: 'cue:execute', cueId: cue.cueId });
  else if (button.dataset.action === 'edit') openCue(cue);
  else {
    const cues = [...state.cues].sort((a, b) => a.order - b.order);
    const index = cues.findIndex((entry) => entry.cueId === cue.cueId);
    const other = button.dataset.action === 'up' ? index - 1 : index + 1;
    [cues[index], cues[other]] = [cues[other], cues[index]];
    socket.send({ type: 'cue:reorder', cueIds: cues.map((entry) => entry.cueId) });
  }
});
elements['cue-form'].addEventListener('submit', (event) => {
  event.preventDefault();
  socket.send({ type: 'cue:save', cue: {
    cueId: elements['cue-id'].value || undefined, cueNumber: elements['cue-number'].value,
    cueName: elements['cue-name'].value, text: elements['cue-text'].value,
    sceneId: elements['cue-scene'].value || null, target: parseTarget(elements['cue-target'].value),
    enabled: elements['cue-enabled'].checked,
  } });
  elements['cue-dialog'].close();
});
elements['reset-button'].addEventListener('click', () => {
  if (window.confirm('SHOW RESETを実行しますか？\nCue位置・字幕・発話キューを初期化します。Cue定義とDisplay登録は保持されます。')) socket.send({ type: 'show:reset' });
});
for (const id of ['voice-select', 'rate-input', 'pitch-input', 'volume-input', 'subtitle-input']) elements[id].addEventListener('change', updateSettings);
setInterval(() => { elements.clock.textContent = new Date().toLocaleTimeString('ja-JP', { hour12: false }); }, 250);
updateCount();
