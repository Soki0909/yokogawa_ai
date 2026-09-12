import { ReconnectingSocket } from './socket-client.js';

const elements = Object.fromEntries([
  'clock', 'system-status', 'system-card', 'display-status', 'display-card', 'voice-status', 'voice-card',
  'notice', 'speech-input', 'character-count', 'send-button', 'stop-button', 'replay-button', 'clear-button',
  'current-message', 'next-message', 'queue-count', 'history-list', 'history-template', 'voice-select',
  'rate-input', 'rate-output', 'pitch-input', 'pitch-output', 'volume-input', 'volume-output', 'subtitle-input',
].map((id) => [id, document.getElementById(id)]));

let state = null;
let noticeTimer;
let connected = false;

const socket = new ReconnectingSocket('admin', handleEvent, (status) => {
  connected = status === 'connected';
  elements['system-status'].textContent = connected ? 'オンライン' : status === 'connecting' ? '接続中' : '再接続中';
  elements['system-card'].dataset.state = connected ? 'good' : 'warn';
  updateControls();
});

function handleEvent(event) {
  if (event.type === 'state') {
    state = event.state;
    renderState();
  } else if (event.type === 'accepted') {
    showNotice(event.queued ? '発話キューに追加しました。' : '投影画面へ送信しました。', 'success');
    elements['speech-input'].value = '';
    updateCount();
  } else if (event.type === 'error') {
    showNotice(event.message || '操作を完了できませんでした。', 'error');
  } else if (event.type === 'voices') {
    renderVoices(event.voices);
  }
}

function renderState() {
  const displayConnected = state.displayConnectionStatus === 'connected';
  elements['display-status'].textContent = displayConnected ? '接続済み' : '未接続';
  elements['display-card'].dataset.state = displayConnected ? 'good' : 'bad';
  const statusLabels = { idle: '待機中', received: '受信済み', speaking: '再生中', completed: '完了', stopped: '停止', error: 'エラー' };
  elements['voice-status'].textContent = statusLabels[state.playbackStatus] ?? state.playbackStatus;
  elements['voice-card'].dataset.state = state.playbackStatus === 'error' ? 'bad' : state.playbackStatus === 'speaking' ? 'active' : 'good';
  elements['current-message'].textContent = state.currentMessage?.text ?? '待機しています';
  elements['next-message'].textContent = state.queue[0]?.text ?? 'なし';
  elements['queue-count'].textContent = `${state.queue.length} 件`;
  applySettings(state.settings);
  renderHistory(state.history);
  updateControls();
}

function updateControls() {
  const hasDisplay = state?.displayConnectionStatus === 'connected';
  const hasText = elements['speech-input'].value.trim().length > 0;
  elements['send-button'].disabled = !connected || !hasDisplay || !hasText;
  elements['stop-button'].disabled = !connected || !state?.currentMessage;
  elements['replay-button'].disabled = !connected || !hasDisplay || !state?.history.length;
}

function renderHistory(history) {
  elements['history-list'].replaceChildren();
  if (!history.length) {
    const empty = document.createElement('p');
    empty.className = 'empty'; empty.textContent = '発話履歴はまだありません';
    elements['history-list'].append(empty); return;
  }
  const labels = { queued: '待機', received: '受信', speaking: '再生中', completed: '完了', stopped: '停止', error: 'エラー' };
  for (const item of history) {
    const fragment = elements['history-template'].content.cloneNode(true);
    const article = fragment.querySelector('article');
    const time = fragment.querySelector('time');
    const status = fragment.querySelector('.history-status');
    fragment.querySelector('p').textContent = item.text;
    time.textContent = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(item.createdAt));
    time.dateTime = item.createdAt;
    status.textContent = labels[item.status] ?? item.status;
    status.dataset.state = item.status;
    if (item.error) article.title = item.error;
    fragment.querySelector('.restore-button').addEventListener('click', () => {
      elements['speech-input'].value = item.text; updateCount(); elements['speech-input'].focus();
    });
    fragment.querySelector('.history-replay-button').addEventListener('click', () => socket.send({ type: 'replay', id: item.id }));
    elements['history-list'].append(fragment);
  }
}

function renderVoices(voices) {
  const current = state?.settings.voiceURI ?? '';
  elements['voice-select'].replaceChildren(new Option('日本語の既定音声', ''));
  for (const voice of voices) elements['voice-select'].add(new Option(`${voice.name} (${voice.lang})${voice.default ? ' — 既定' : ''}`, voice.voiceURI));
  elements['voice-select'].value = current;
}

function applySettings(settings) {
  if (document.activeElement?.matches('.settings input, .settings select')) return;
  elements['rate-input'].value = settings.rate; elements['rate-output'].value = Number(settings.rate).toFixed(1);
  elements['pitch-input'].value = settings.pitch; elements['pitch-output'].value = Number(settings.pitch).toFixed(1);
  elements['volume-input'].value = settings.volume; elements['volume-output'].value = `${Math.round(settings.volume * 100)}%`;
  elements['subtitle-input'].checked = settings.subtitlesEnabled;
  elements['voice-select'].value = settings.voiceURI;
}

function showNotice(message, kind = 'info') {
  clearTimeout(noticeTimer);
  elements.notice.textContent = message; elements.notice.dataset.kind = kind; elements.notice.hidden = false;
  noticeTimer = setTimeout(() => { elements.notice.hidden = true; }, 6000);
}

function updateCount() {
  elements['character-count'].textContent = `${elements['speech-input'].value.length.toLocaleString('ja-JP')} / 5,000`;
  updateControls();
}

function updateSettings() {
  elements['rate-output'].value = Number(elements['rate-input'].value).toFixed(1);
  elements['pitch-output'].value = Number(elements['pitch-input'].value).toFixed(1);
  elements['volume-output'].value = `${Math.round(Number(elements['volume-input'].value) * 100)}%`;
  socket.send({ type: 'settings:update', settings: {
    voiceURI: elements['voice-select'].value,
    rate: Number(elements['rate-input'].value), pitch: Number(elements['pitch-input'].value),
    volume: Number(elements['volume-input'].value), subtitlesEnabled: elements['subtitle-input'].checked,
  } });
}

elements['speech-input'].addEventListener('input', updateCount);
elements['speech-input'].addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); elements['send-button'].click(); }
});
elements['send-button'].addEventListener('click', () => {
  const text = elements['speech-input'].value.trim();
  if (!text) { showNotice('読み上げる文章を入力してください。', 'error'); return; }
  if (!socket.send({ type: 'speak', text })) showNotice('サーバーへ再接続中です。少し待ってから再送信してください。', 'error');
});
elements['stop-button'].addEventListener('click', () => socket.send({ type: 'stop' }));
elements['replay-button'].addEventListener('click', () => socket.send({ type: 'replay' }));
elements['clear-button'].addEventListener('click', () => { elements['speech-input'].value = ''; updateCount(); elements['speech-input'].focus(); });
for (const id of ['voice-select', 'rate-input', 'pitch-input', 'volume-input', 'subtitle-input']) elements[id].addEventListener('change', updateSettings);
setInterval(() => { elements.clock.textContent = new Date().toLocaleTimeString('ja-JP', { hour12: false }); }, 250);
updateCount();

