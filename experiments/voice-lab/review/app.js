import { assertPlaybackEffect, connectPlaybackEffect } from '/audio-playback-effects.js';
import { AudioBufferPlayer } from '/shared/audio-buffer-player.js';

const rounds = {
  retune: { label: 'VOICE RETUNE', title: '2A基準 — 速度・無機質さ・文間の比較', manifestFile: '/output/retune-2026-10/comparison-manifest.json', audioRoot: '/output/retune-2026-10' },
  'pause-test': { label: '句点の間', title: '2D固定 — 「。…」と「。……」の比較', manifestFile: '/output/sentence-pause-test-2026-10/comparison-manifest.json', audioRoot: '/output/sentence-pause-test-2026-10' },
  provisional: { label: '正式採用', title: '2D — 「。…」＋確定した読み補正', manifestFile: '/output/provisional-profile-2026-10/comparison-manifest.json', audioRoot: '/output/provisional-profile-2026-10' },
  'round-1': { label: 'ROUND 1', title: 'モデル・声質の比較', candidatesFile: '/config/candidates.json', samplesFile: '/config/samples.json', audioRoot: '/output' },
  'round-2': { label: 'ROUND 2', title: '阿井田 茂 — 無機質さの比較', candidatesFile: '/config/candidates-round-2.json', samplesFile: '/config/samples.json', audioRoot: '/output/round-2' },
};

const elements = {
  audio: document.querySelector('#audio-player'), candidateStrip: document.querySelector('#candidate-strip'), head: document.querySelector('#matrix-head'),
  body: document.querySelector('#matrix-body'), nowPlaying: document.querySelector('#now-playing'), nowTitle: document.querySelector('#now-title'),
  nowSample: document.querySelector('#now-sample'), progress: document.querySelector('#progress-bar'), time: document.querySelector('#time-display'),
  stop: document.querySelector('#stop-all'), roundLabel: document.querySelector('#round-label'), roundTitle: document.querySelector('#round-title'),
  modeToggle: document.querySelector('#mode-toggle'), comparisonHint: document.querySelector('#comparison-hint'),
};

const state = { samples: [], round: 'retune', candidates: [], mode: 'production', activeButton: null, sequenceButton: null,
  sequence: [], sequenceIndex: -1, bufferPlayer: null, raf: null, playToken: 0 };

const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const formatTime = (seconds) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00';

function candidateName(candidate, index) {
  const fallback = state.round === 'round-2' ? `2${String.fromCharCode(65 + index)}` : String.fromCharCode(65 + index);
  return { shortId: candidate.displayName ?? fallback, title: `${candidate.model} / ${candidate.style}` };
}

function audioUrl(candidate, sample) { return `${rounds[state.round].audioRoot}/${encodeURIComponent(candidate.id)}/${sample.audioFile ?? `${sample.id}.wav`}`; }
function audioItem(candidate, sample) { return { id: `${candidate.id}:${sample.scriptId ?? sample.id}`, url: audioUrl(candidate, sample) }; }
function resetActiveButton() { state.activeButton?.classList.remove('is-playing'); if (state.activeButton) state.activeButton.textContent = state.activeButton.dataset.idleText ?? '▶ 再生'; state.activeButton = null; }
function resetSequenceButton() { state.sequenceButton?.classList.remove('is-playing'); if (state.sequenceButton) state.sequenceButton.textContent = state.sequenceButton.dataset.idleText ?? '候補を順番に再生'; state.sequenceButton = null; }

async function stopPlayback({ preserveSequence = false } = {}) {
  state.playToken += 1; state.bufferPlayer?.stop(); if (state.raf) cancelAnimationFrame(state.raf); state.raf = null; resetActiveButton();
  if (!preserveSequence) { state.sequence = []; state.sequenceIndex = -1; resetSequenceButton(); }
  elements.stop.disabled = true; elements.nowPlaying.hidden = true; elements.progress.style.width = '0%';
}

function playbackEffect(sample) { return state.round !== 'retune' || state.mode === 'raw' ? 'none' : sample.playbackEffect ?? 'none'; }

async function play(candidate, sample, button, preserveSequence = false) {
  if (state.activeButton === button && state.bufferPlayer?.current) { await stopPlayback(); return; }
  const token = state.playToken + 1; state.playToken = token;
  state.bufferPlayer?.stop(); resetActiveButton();
  if (!preserveSequence) { state.sequence = []; state.sequenceIndex = -1; resetSequenceButton(); }
  if (token !== state.playToken) return;
  const effectId = playbackEffect(sample); assertPlaybackEffect(effectId);
  state.activeButton = button; button.classList.add('is-playing'); button.textContent = '■ 停止';
  elements.stop.disabled = false; elements.nowPlaying.hidden = false;
  const name = candidateName(candidate, state.candidates.indexOf(candidate));
  elements.nowTitle.textContent = `${name.shortId} · ${name.title}${effectId === 'none' ? '' : ' · 本番処理'}`;
  elements.nowSample.textContent = `#${sample.scriptId ?? sample.id.slice(0, 2)} ${sample.label} — ${sample.scriptText ?? sample.text}`;
  try {
    await state.bufferPlayer.start(audioItem(candidate, sample), effectId, { onEnded: async () => {
      if (state.sequence.length && state.sequenceIndex < state.sequence.length - 1) { state.sequenceIndex += 1; const next = state.sequence[state.sequenceIndex]; await play(next.candidate, next.sample, next.button, true); return; }
      await stopPlayback();
    } });
    const updateProgress = () => { if (!state.bufferPlayer.current) return; const current = state.bufferPlayer.currentTime; const duration = state.bufferPlayer.duration; elements.progress.style.width = `${duration ? Math.min(100, current / duration * 100) : 0}%`; elements.time.textContent = `${formatTime(current)} / ${formatTime(duration)}`; state.raf = requestAnimationFrame(updateProgress); };
    updateProgress();
  } catch (error) { await stopPlayback(); window.alert(`音声を再生できませんでした。WAV生成済みか確認してください。\n${error.message}`); }
}

function render() {
  const round = rounds[state.round]; elements.roundLabel.textContent = round.label; elements.roundTitle.textContent = round.title;
  const totalAudio = state.candidates.length * state.samples.length; const readyAudio = state.bufferPlayer?.readyCount ?? 0;
  elements.comparisonHint.textContent = readyAudio === totalAudio ? `音声準備完了 · 各行の ▶ で個別再生、右端で${state.candidates.length}候補を連続再生` : `音声を準備しています… ${readyAudio} / ${totalAudio}`;
  elements.modeToggle.hidden = state.round !== 'retune';
  elements.candidateStrip.innerHTML = state.candidates.map((candidate, index) => {
    const name = candidateName(candidate, index); const params = candidate.parameters;
    return `<article class="candidate-card"><span class="candidate-id">${escapeHtml(name.shortId)}</span><h3>${escapeHtml(name.title)}</h3>
      <p><strong>${escapeHtml(candidate.direction ?? 'Voice candidate')}</strong> — ${escapeHtml(candidate.description ?? '')}</p>
      <p class="params">speed ${params.speedScale} · intonation ${params.intonationScale} · tempo ${params.tempoDynamicsScale} · pause ${params.pauseLengthScale ?? 1}</p>
      ${candidate.note ? `<p class="candidate-note">${escapeHtml(candidate.note)}</p>` : ''}</article>`;
  }).join('');
  elements.head.innerHTML = `<tr><th>台詞</th><th>本文</th>${state.candidates.map((candidate, index) => `<th>${escapeHtml(candidateName(candidate, index).shortId)}</th>`).join('')}<th>連続比較</th></tr>`;
  elements.body.innerHTML = '';
  for (const sample of state.samples) {
    const scriptId = sample.scriptId ?? sample.id.slice(0, 2); const text = sample.scriptText ?? sample.text; const row = document.createElement('tr');
    row.innerHTML = `<td><span class="sample-number">#${escapeHtml(scriptId)}</span><span class="sample-label">${escapeHtml(sample.label)}</span></td>
      <td class="sample-text">${escapeHtml(text)}${sample.pronunciationOverride ? `<span class="sample-note">音声読み: ${escapeHtml(sample.pronunciationOverride.reading)}</span>` : ''}</td>`;
    for (const candidate of state.candidates) {
      const cell = document.createElement('td'); const button = document.createElement('button'); const duration = candidate.durations?.[scriptId];
      button.type = 'button'; button.className = 'play-button'; button.dataset.idleText = '▶ 再生'; button.textContent = '▶ 再生';
      const load = state.bufferPlayer?.status(audioItem(candidate, sample).id); button.disabled = load?.status !== 'ready'; if (button.disabled) button.textContent = load?.status === 'error' ? '読込失敗' : '準備中';
      button.addEventListener('click', () => play(candidate, sample, button)); cell.append(button);
      if (duration) cell.insertAdjacentHTML('beforeend', `<span class="duration">${duration.toFixed(2)} sec</span>`);
      if (candidate.id === '2a' && scriptId === '002') cell.insertAdjacentHTML('beforeend', '<span class="sample-note">旧読み</span>');
      row.append(cell);
    }
    const sequenceCell = document.createElement('td'); const sequenceButton = document.createElement('button'); const count = state.candidates.length;
    sequenceButton.type = 'button'; sequenceButton.className = 'sequence-button'; sequenceButton.dataset.idleText = `${count}候補を順番に再生`; sequenceButton.textContent = sequenceButton.dataset.idleText;
    sequenceButton.addEventListener('click', async () => {
      if (state.sequenceButton === sequenceButton && state.sequence.length) { await stopPlayback(); return; }
      await stopPlayback(); state.sequenceButton = sequenceButton; sequenceButton.classList.add('is-playing'); sequenceButton.textContent = '■ 連続再生を停止';
      state.sequence = state.candidates.map((candidate, index) => ({ candidate, sample, button: row.querySelectorAll('.play-button')[index] })); state.sequenceIndex = 0;
      await play(state.sequence[0].candidate, sample, state.sequence[0].button, true);
    });
    sequenceCell.append(sequenceButton); row.append(sequenceCell); elements.body.append(row);
  }
}

async function selectRound(roundId) {
  await stopPlayback(); await state.bufferPlayer?.clear(); state.bufferPlayer = null; state.round = roundId;
  document.querySelectorAll('[data-round]').forEach((button) => { const active = button.dataset.round === roundId; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
  const round = rounds[roundId];
  if (round.manifestFile) {
    const response = await fetch(round.manifestFile); if (!response.ok) throw new Error(`VOICE RETUNE生成物を取得できません: ${response.status}`);
    const manifest = await response.json(); state.candidates = manifest.candidates; state.samples = manifest.samples;
  } else {
    const [candidateResponse, sampleResponse] = await Promise.all([fetch(round.candidatesFile), fetch(round.samplesFile)]);
    if (!candidateResponse.ok || !sampleResponse.ok) throw new Error('比較設定を取得できません。');
    state.candidates = (await candidateResponse.json()).candidates; state.samples = (await sampleResponse.json()).samples;
  }
  state.bufferPlayer = new AudioBufferPlayer({ connectEffect: connectPlaybackEffect, onStateChange: () => {
    const total = state.candidates.length * state.samples.length; const ready = state.bufferPlayer.readyCount;
    render();
  } });
  render(); const items = state.samples.flatMap((sample) => state.candidates.map((candidate) => audioItem(candidate, sample)));
  void state.bufferPlayer.preload(items);
}
elements.stop.addEventListener('click', () => stopPlayback());
document.querySelectorAll('[data-round]').forEach((button) => button.addEventListener('click', () => selectRound(button.dataset.round).catch(showError)));
document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', async () => { state.mode = button.dataset.mode; document.querySelectorAll('[data-mode]').forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.mode === state.mode))); await stopPlayback(); }));

function showError(error) { document.querySelector('.comparison').innerHTML = `<p style="padding:24px;color:#f0bc63">${escapeHtml(error.message)}</p>`; }
selectRound(location.pathname === '/provisional' ? 'provisional' : location.pathname === '/pause-test' ? 'pause-test' : location.pathname === '/retune' ? 'retune' : 'round-2').catch(showError);
