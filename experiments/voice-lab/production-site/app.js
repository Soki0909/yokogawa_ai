import { assertPlaybackEffect, connectPlaybackEffect } from './audio-playback-effects.js';
import { lineUrl, parseLineId } from './line-selection.js';

const $ = (selector) => document.querySelector(selector);
const elements = {
  list: $('#sample-list'), count: $('#result-count'), empty: $('#empty'), message: $('#message'), search: $('#search'),
  scene: $('#scene-filter'), state: $('#state-filter'), status: $('#status-filter'), player: $('#player'),
  playerTitle: $('#player-title'), playerText: $('#player-text'), progress: $('#progress'), time: $('#time'),
  pause: $('#pause'), stop: $('#stop'), previous: $('#previous'), next: $('#next'), profile: $('#profile-heading'), profileValues: $('#profile-values'),
};
const state = { samples: [], visible: [], mode: 'production', selectedId: null, audio: null, context: null, playToken: 0 };

const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const formatTime = (seconds) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00';
const unique = (key) => [...new Set(state.samples.map((item) => key.split('.').reduce((value, part) => value[part], item)))].sort();

function announce(text, error = false) { elements.message.textContent = text; elements.message.dataset.error = String(error); }
function fillSelect(element, values) { element.append(...values.map((value) => Object.assign(document.createElement('option'), { value, textContent: value }))); }

function renderProfile(profile) {
  elements.profile.textContent = `${profile.speaker} / ${profile.style}`;
  const values = [
    ['speed', profile.parameters.speedScale.toFixed(2)], ['pitch', String(profile.parameters.pitchScale)],
    ['intonation', String(profile.parameters.intonationScale)], ['output', `${(profile.output.sampleRate / 1000).toFixed(1)} kHz ${profile.output.channels === 1 ? 'mono' : 'stereo'}`],
  ];
  elements.profileValues.innerHTML = values.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
}

function filteredSamples() {
  const query = elements.search.value.trim().toLocaleLowerCase('ja');
  return state.samples.filter((sample) => (!query || sample.text.toLocaleLowerCase('ja').includes(query) || sample.scriptId.includes(query))
    && (!elements.scene.value || sample.scene === elements.scene.value)
    && (!elements.state.value || sample.state === elements.state.value)
    && (!elements.status.value || sample.status.label === elements.status.value));
}

function render() {
  state.visible = filteredSamples(); elements.count.textContent = state.visible.length; elements.empty.hidden = state.visible.length !== 0;
  elements.list.innerHTML = state.visible.map((sample) => `<article class="sample-card ${sample.scriptId === state.selectedId ? 'is-selected' : ''}" id="line-${sample.scriptId}" tabindex="-1" data-id="${sample.scriptId}">
    <div class="sample-card__meta"><strong>#${sample.scriptId}</strong><span>${escapeHtml(sample.scene)}</span><span class="state state--${sample.state.toLowerCase()}">${escapeHtml(sample.state)}</span><span class="status status--${sample.status.id}">${escapeHtml(sample.status.label)}</span></div>
    <p class="sample-card__text">${escapeHtml(sample.text)}</p>
    ${sample.routeScene ? `<p class="route-note">${escapeHtml(sample.routeScene)} — 教室番号は台本確認待ち</p>` : ''}
    <div class="sample-card__actions"><span>${formatTime(sample.durationSeconds)}</span><span class="effect">${sample.playbackEffect === 'none' ? 'RAW相当' : 'HIJACKED処理'}</span><button class="copy-button" type="button" data-copy="${sample.scriptId}">URLをコピー</button><button class="play-button" type="button" data-play="${sample.scriptId}" aria-label="#${sample.scriptId}を再生">▶ 再生</button></div>
  </article>`).join('');
}

function resetPlayingButton() { document.querySelector('.play-button.is-playing')?.classList.remove('is-playing'); document.querySelectorAll('.play-button').forEach((button) => { if (button.textContent !== '▶ 再生') button.textContent = '▶ 再生'; }); }
async function stop({ hide = true, invalidate = true } = {}) {
  if (invalidate) state.playToken += 1;
  if (state.audio) { state.audio.pause(); state.audio.src = ''; state.audio.load(); }
  state.audio = null; await state.context?.close?.().catch(() => {}); state.context = null; resetPlayingButton();
  elements.progress.style.width = '0%'; elements.time.textContent = '0:00 / 0:00'; elements.pause.textContent = '一時停止'; if (hide) elements.player.hidden = true;
}

async function play(sample) {
  if (!sample) return;
  const token = state.playToken + 1; state.playToken = token;
  await stop({ hide: false, invalidate: false });
  if (token !== state.playToken) return;
  const effectId = state.mode === 'raw' ? 'none' : sample.playbackEffect;
  try { assertPlaybackEffect(effectId); } catch (error) { announce('本番音声処理を適用できません', true); console.error(error); return; }
  const audio = new Audio(sample.audio); audio.preload = 'metadata'; state.audio = audio; state.selectedId = sample.scriptId;
  const button = document.querySelector(`[data-play="${sample.scriptId}"]`); button?.classList.add('is-playing'); if (button) button.textContent = '❚❚ 一時停止';
  elements.player.hidden = false; elements.playerTitle.textContent = `#${sample.scriptId} · ${state.mode === 'raw' ? 'RAW' : '本番再生'} · ${sample.state}`; elements.playerText.textContent = sample.text;
  audio.addEventListener('timeupdate', () => { if (state.audio !== audio) return; elements.progress.style.width = `${audio.duration ? Math.min(100, audio.currentTime / audio.duration * 100) : 0}%`; elements.time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`; });
  audio.addEventListener('ended', () => { if (state.audio === audio) stop(); });
  audio.addEventListener('error', () => { if (state.audio !== audio) return; announce('音声ファイルを再生できませんでした', true); stop(); });
  if (effectId !== 'none') {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) { announce('本番音声処理を適用できません', true); console.error('Web Audio API is unavailable'); await stop(); return; }
    state.context = new Context(); const source = state.context.createMediaElementSource(audio); connectPlaybackEffect(state.context, source, state.context.destination, effectId);
  }
  try { await audio.play(); if (token === state.playToken) announce(''); } catch (error) { if (token !== state.playToken) return; announce('音声ファイルを再生できませんでした', true); console.error(error); await stop(); }
}

function adjacent(direction) { const index = state.visible.findIndex((item) => item.scriptId === state.selectedId); const next = state.visible[index + direction]; if (next) play(next); }
function setMode(mode) { state.mode = mode; document.querySelectorAll('[data-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === mode))); if (state.audio) void play(state.samples.find((item) => item.scriptId === state.selectedId)); }

elements.list.addEventListener('click', async (event) => {
  const playId = event.target.closest('[data-play]')?.dataset.play;
  if (playId) { const sample = state.samples.find((item) => item.scriptId === playId); if (state.audio && state.selectedId === playId && !state.audio.paused) { state.audio.pause(); event.target.textContent = '▶ 再開'; elements.pause.textContent = '再開'; } else if (state.audio && state.selectedId === playId) { await state.audio.play(); event.target.textContent = '❚❚ 一時停止'; elements.pause.textContent = '一時停止'; } else play(sample); return; }
  const copyId = event.target.closest('[data-copy]')?.dataset.copy;
  if (copyId) { try { await navigator.clipboard.writeText(lineUrl(location, copyId)); announce(`#${copyId}のURLをコピーしました`); } catch { announce('URLをコピーできませんでした', true); } }
});
[elements.search, elements.scene, elements.state, elements.status].forEach((control) => control.addEventListener('input', render));
document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
elements.stop.addEventListener('click', () => stop()); elements.previous.addEventListener('click', () => adjacent(-1)); elements.next.addEventListener('click', () => adjacent(1));
elements.pause.addEventListener('click', async () => { if (!state.audio) return; if (state.audio.paused) { await state.audio.play(); elements.pause.textContent = '一時停止'; } else { state.audio.pause(); elements.pause.textContent = '再開'; } });

try {
  const [samplesResponse, profileResponse] = await Promise.all([fetch('./data/production-samples.json'), fetch('./data/voice-profile.json')]);
  if (!samplesResponse.ok || !profileResponse.ok) throw new Error('manifest request failed');
  state.samples = (await samplesResponse.json()).samples; renderProfile(await profileResponse.json());
  fillSelect(elements.scene, unique('scene')); fillSelect(elements.state, unique('state')); fillSelect(elements.status, unique('status.label')); render();
  const line = parseLineId(location.search); if (line && state.samples.some((item) => item.scriptId === line)) { state.selectedId = line; render(); requestAnimationFrame(() => { const card = document.querySelector(`#line-${line}`); card?.scrollIntoView({ block: 'center' }); card?.focus({ preventScroll: true }); }); }
} catch (error) { announce('本番音声一覧を読み込めませんでした', true); console.error(error); }
