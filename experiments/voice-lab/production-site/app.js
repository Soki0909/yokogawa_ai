import { assertPlaybackEffect, connectPlaybackEffect } from './audio-playback-effects.js';
import { AudioBufferPlayer } from './audio-buffer-player.js';
import { lineUrl, parseLineId } from './line-selection.js';

const $ = (selector) => document.querySelector(selector);
const elements = {
  list: $('#sample-list'), count: $('#result-count'), empty: $('#empty'), message: $('#message'), preload: $('#preload-status'), search: $('#search'),
  scene: $('#scene-filter'), state: $('#state-filter'), status: $('#status-filter'), player: $('#player'),
  playerTitle: $('#player-title'), playerText: $('#player-text'), progress: $('#progress'), time: $('#time'),
  pause: $('#pause'), stop: $('#stop'), previous: $('#previous'), next: $('#next'), profile: $('#profile-heading'), profileValues: $('#profile-values'),
  diagnostics: $('#audio-diagnostics'), diagnosticsOutput: $('#audio-diagnostics-output'),
};
const priorityIds = ['001', '004', '008', '013', '015', '016'];
const debugAudio = new URLSearchParams(location.search).get('debug') === 'audio';
const state = { samples: [], visible: [], mode: 'production', selectedId: null, player: null, raf: null, preloadStartedAt: 0, priorityReadyAt: null, allReadyAt: null,
  audioSessionResult: 'unsupported', lastAudioError: null, lifecycleTrigger: 'initial', diagnosticEvents: [] };
globalThis.__voiceLabMetrics = { priorityReadyMs: null, allReadyMs: null, lastPlaySchedulingMs: null, totalAudioBytes: 0 };

const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const formatTime = (seconds) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00';
const unique = (key) => [...new Set(state.samples.map((item) => key.split('.').reduce((value, part) => value[part], item)))].sort();

function announce(text, error = false) { elements.message.textContent = text; elements.message.dataset.error = String(error); }
function recordDiagnostic(event) { state.diagnosticEvents.push(event); if (state.diagnosticEvents.length > 100) state.diagnosticEvents.splice(0, state.diagnosticEvents.length - 100); renderDiagnostics(); }
function audioSessionValue(key) { try { return 'audioSession' in navigator ? navigator.audioSession?.[key] ?? 'unavailable' : 'unsupported'; } catch { return 'unavailable'; } }
function renderDiagnostics() {
  if (!debugAudio) return;
  const player = state.player; const context = player?.context;
  const report = {
    userAgent: navigator.userAgent, platform: navigator.userAgentData?.platform ?? navigator.platform ?? 'unsupported',
    audioSession: { supported: 'audioSession' in navigator, type: audioSessionValue('type'), state: audioSessionValue('state'), setup: state.audioSessionResult },
    documentVisibility: document.visibilityState, lifecycleTrigger: state.lifecycleTrigger,
    audioContext: { state: context?.state ?? 'not-created', sampleRate: context?.sampleRate ?? 'unsupported', baseLatency: context?.baseLatency ?? 'unsupported', outputLatency: context?.outputLatency ?? 'unsupported', instances: player?.contextCount ?? 0 },
    preload: { total: state.samples.length, ready: player?.readyCount ?? 0, errors: player?.errorCount ?? 0, fetchInProgress: player?.fetchInProgress ?? 0, decodeInProgress: player?.decodeInProgress ?? 0, decodeQueueLength: player?.decodeQueueLength ?? 0, maxDecodeInProgress: player?.maxDecodeInProgress ?? 0 },
    playback: { sample: player?.current?.item?.id ?? null, mode: state.mode, isPlaying: player?.isPlaying ?? false },
    lastAudioError: state.lastAudioError ?? player?.lastAudioError ?? null, lastResumeResult: player?.lastResumeResult ?? 'not-attempted', lastContextStateChange: player?.lastContextStateChange ?? null,
    events: state.diagnosticEvents.slice(-20),
  };
  elements.diagnosticsOutput.textContent = JSON.stringify(report, null, 2);
}
function configureAudioSession() {
  if (!('audioSession' in navigator)) { state.audioSessionResult = 'unsupported'; return; }
  try { navigator.audioSession.type = 'playback'; state.audioSessionResult = `configured:${navigator.audioSession.type}`; recordDiagnostic({ timestamp: new Date().toISOString(), trigger: 'audio-session-configured' }); }
  catch (error) { state.audioSessionResult = `failed:${error.message}`; recordDiagnostic({ timestamp: new Date().toISOString(), trigger: 'audio-session-failed', error: error.message }); }
}
function fillSelect(element, values) { element.append(...values.map((value) => Object.assign(document.createElement('option'), { value, textContent: value }))); }
function renderProfile(profile) {
  elements.profile.textContent = `${profile.speaker} / ${profile.style}`;
  const values = [['speed', profile.parameters.speedScale.toFixed(2)], ['pitch', String(profile.parameters.pitchScale)], ['intonation', String(profile.parameters.intonationScale)], ['output', `${(profile.output.sampleRate / 1000).toFixed(1)} kHz ${profile.output.channels === 1 ? 'mono' : 'stereo'}`]];
  elements.profileValues.innerHTML = values.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
}
function filteredSamples() {
  const query = elements.search.value.trim().toLocaleLowerCase('ja');
  return state.samples.filter((sample) => (!query || sample.text.toLocaleLowerCase('ja').includes(query) || sample.scriptId.includes(query))
    && (!elements.scene.value || sample.scene === elements.scene.value) && (!elements.state.value || sample.state === elements.state.value) && (!elements.status.value || sample.status.label === elements.status.value));
}
function loadControl(sample) {
  const load = state.player?.status(sample.scriptId) ?? { status: 'pending' };
  if (load.status === 'error') return `<button class="retry-button" type="button" data-retry="${sample.scriptId}">再試行</button>`;
  const ready = load.status === 'ready'; return `<button class="play-button" type="button" data-play="${sample.scriptId}" aria-label="#${sample.scriptId}を再生" ${ready ? '' : 'disabled'}>${ready ? '▶ 再生' : '準備中'}</button>`;
}
function render() {
  state.visible = filteredSamples(); elements.count.textContent = state.visible.length; elements.empty.hidden = state.visible.length !== 0;
  elements.list.innerHTML = state.visible.map((sample) => `<article class="sample-card ${sample.scriptId === state.selectedId ? 'is-selected' : ''}" id="line-${sample.scriptId}" tabindex="-1" data-id="${sample.scriptId}">
    <div class="sample-card__meta"><strong>#${sample.scriptId}</strong><span>${escapeHtml(sample.scene)}</span><span class="state state--${sample.state.toLowerCase()}">${escapeHtml(sample.state)}</span><span class="status status--${sample.status.id}">${escapeHtml(sample.status.label)}</span></div>
    <p class="sample-card__text">${escapeHtml(sample.text)}</p>${sample.routeScene ? `<p class="route-note">${escapeHtml(sample.routeScene)}</p>` : ''}
    <div class="sample-card__actions"><span>${formatTime(sample.durationSeconds)}</span><span class="effect">${sample.playbackEffect === 'none' ? 'RAW相当' : 'HIJACKED処理'}</span><button class="copy-button" type="button" data-copy="${sample.scriptId}">URLをコピー</button>${loadControl(sample)}</div>
  </article>`).join('');
  if (state.player?.current?.source) { const button = document.querySelector(`[data-play="${state.selectedId}"]`); button?.classList.add('is-playing'); if (button) button.textContent = '❚❚ 一時停止'; }
}
function updatePreloadStatus() {
  if (!state.player || !state.samples.length) return;
  const ready = state.player.readyCount; const total = state.samples.length; const now = performance.now();
  if (!state.priorityReadyAt && priorityIds.every((id) => state.player.status(id).status === 'ready')) { state.priorityReadyAt = now; globalThis.__voiceLabMetrics.priorityReadyMs = now - state.preloadStartedAt; elements.preload.dataset.priorityReadyMs = globalThis.__voiceLabMetrics.priorityReadyMs.toFixed(2); }
  if (!state.allReadyAt && ready === total) { state.allReadyAt = now; globalThis.__voiceLabMetrics.allReadyMs = now - state.preloadStartedAt; elements.preload.dataset.allReadyMs = globalThis.__voiceLabMetrics.allReadyMs.toFixed(2); }
  const errors = state.samples.filter((sample) => state.player.status(sample.scriptId).status === 'error').length;
  elements.preload.dataset.fetchCount = String(state.player.fetchCount); elements.preload.dataset.decodeCount = String(state.player.decodeCount);
  elements.preload.textContent = ready === total ? '音声準備完了' : `音声を準備しています… ${ready} / ${total}${errors ? `（${errors}件を再試行できます）` : ''}`;
  renderDiagnostics();
}
function stopProgress() { if (state.raf) cancelAnimationFrame(state.raf); state.raf = null; }
function tickProgress() {
  if (!state.player?.current) return stopProgress(); const current = state.player.currentTime; const duration = state.player.duration;
  elements.progress.style.width = `${duration ? Math.min(100, current / duration * 100) : 0}%`; elements.time.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  state.raf = requestAnimationFrame(tickProgress);
}
function resetPlayingButton() { document.querySelectorAll('.play-button').forEach((button) => { button.classList.remove('is-playing'); if (!button.disabled) button.textContent = '▶ 再生'; }); }
function stop({ hide = true } = {}) {
  state.player?.stop(); stopProgress(); resetPlayingButton(); elements.progress.style.width = '0%'; elements.time.textContent = '0:00 / 0:00'; elements.pause.textContent = '一時停止'; if (hide) elements.player.hidden = true;
}
async function play(sample, offset = 0) {
  if (!sample || state.player.status(sample.scriptId).status !== 'ready') return;
  stop({ hide: false }); const effectId = state.mode === 'raw' ? 'none' : sample.playbackEffect;
  try { assertPlaybackEffect(effectId); } catch (error) { announce('本番音声処理を適用できません', true); console.error(error); return; }
  state.selectedId = sample.scriptId; elements.player.hidden = false; elements.playerTitle.textContent = `#${sample.scriptId} · ${state.mode === 'raw' ? 'RAW' : '本番再生'} · ${sample.state}`; elements.playerText.textContent = sample.text;
  try {
    const result = await state.player.start({ id: sample.scriptId, url: sample.audio }, effectId, { offset, onEnded: () => stop() });
    globalThis.__voiceLabMetrics.lastPlaySchedulingMs = result.schedulingMs; elements.preload.dataset.lastPlaySchedulingMs = result.schedulingMs.toFixed(3); announce(''); render(); tickProgress();
  } catch (error) { state.lastAudioError = error.message; announce('音声ファイルを再生できませんでした', true); recordDiagnostic({ timestamp: new Date().toISOString(), trigger: 'playback-ui-error', error: error.message }); console.error(error); stop(); }
}
function adjacent(direction) { const index = state.visible.findIndex((item) => item.scriptId === state.selectedId); const next = state.visible[index + direction]; if (next) void play(next); }
function setMode(mode) { state.mode = mode; document.querySelectorAll('[data-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === mode))); const sample = state.samples.find((item) => item.scriptId === state.selectedId); if (sample && state.player.current) void play(sample); renderDiagnostics(); }

elements.list.addEventListener('click', async (event) => {
  const retryId = event.target.closest('[data-retry]')?.dataset.retry;
  if (retryId) { const sample = state.samples.find((item) => item.scriptId === retryId); state.player.load({ id: retryId, url: sample.audio }).catch(() => {}); return; }
  const playId = event.target.closest('[data-play]')?.dataset.play;
  if (playId) {
    const sample = state.samples.find((item) => item.scriptId === playId);
    if (state.selectedId === playId && state.player.current?.source) { state.player.pause(); stopProgress(); event.target.textContent = '▶ 再開'; elements.pause.textContent = '再開'; }
    else if (state.selectedId === playId && state.player.current && !state.player.current.source) { await state.player.resume(); event.target.textContent = '❚❚ 一時停止'; elements.pause.textContent = '一時停止'; tickProgress(); }
    else await play(sample); return;
  }
  const copyId = event.target.closest('[data-copy]')?.dataset.copy;
  if (copyId) { try { await navigator.clipboard.writeText(lineUrl(location, copyId)); announce(`#${copyId}のURLをコピーしました`); } catch { announce('URLをコピーできませんでした', true); } }
});
[elements.search, elements.scene, elements.state, elements.status].forEach((control) => control.addEventListener('input', render));
document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
elements.stop.addEventListener('click', () => stop()); elements.previous.addEventListener('click', () => adjacent(-1)); elements.next.addEventListener('click', () => adjacent(1));
elements.pause.addEventListener('click', async () => { if (!state.player.current) return; if (state.player.paused) { await state.player.resume(); elements.pause.textContent = '一時停止'; tickProgress(); render(); } else { state.player.pause(); stopProgress(); elements.pause.textContent = '再開'; render(); } });
document.querySelector('.logout').addEventListener('click', () => { void state.player?.clear(); });
document.addEventListener('visibilitychange', () => {
  state.lifecycleTrigger = `visibilitychange:${document.visibilityState}`;
  const recovery = document.visibilityState === 'visible' ? state.player?.recover(state.lifecycleTrigger) : null;
  recordDiagnostic({ timestamp: new Date().toISOString(), trigger: state.lifecycleTrigger, recovery });
});
window.addEventListener('pageshow', (event) => {
  state.lifecycleTrigger = `pageshow:${event.persisted ? 'bfcache' : 'normal'}`;
  const recovery = state.player?.recover(state.lifecycleTrigger);
  recordDiagnostic({ timestamp: new Date().toISOString(), trigger: state.lifecycleTrigger, recovery });
});
window.addEventListener('pagehide', (event) => { if (!event.persisted) void state.player?.clear(); });

try {
  elements.diagnostics.hidden = !debugAudio; configureAudioSession(); renderDiagnostics();
  const [samplesResponse, profileResponse] = await Promise.all([fetch('./data/production-samples.json'), fetch('./data/voice-profile.json')]);
  if (!samplesResponse.ok || !profileResponse.ok) throw new Error('manifest request failed');
  state.samples = (await samplesResponse.json()).samples; renderProfile(await profileResponse.json());
  state.player = new AudioBufferPlayer({ connectEffect: connectPlaybackEffect, onStateChange: () => { updatePreloadStatus(); render(); }, onDiagnostic: recordDiagnostic });
  globalThis.__voiceLabMetrics.totalAudioBytes = state.samples.reduce((total, sample) => total + (sample.bytes ?? 0), 0); elements.preload.dataset.totalAudioBytes = String(globalThis.__voiceLabMetrics.totalAudioBytes);
  fillSelect(elements.scene, unique('scene')); fillSelect(elements.state, unique('state')); fillSelect(elements.status, unique('status.label')); render(); updatePreloadStatus();
  const line = parseLineId(location.search); if (line && state.samples.some((item) => item.scriptId === line)) { state.selectedId = line; render(); requestAnimationFrame(() => { const card = document.querySelector(`#line-${line}`); card?.scrollIntoView({ block: 'center' }); card?.focus({ preventScroll: true }); }); }
  state.preloadStartedAt = performance.now(); void state.player.preload(state.samples.map((sample) => ({ id: sample.scriptId, url: sample.audio })), priorityIds);
} catch (error) { state.lastAudioError = error.message; announce('本番音声一覧を読み込めませんでした', true); recordDiagnostic({ timestamp: new Date().toISOString(), trigger: 'initialization-error', error: error.message }); console.error(error); }
