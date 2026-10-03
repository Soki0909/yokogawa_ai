const rounds = {
  "round-1": {
    label: "ROUND 1",
    title: "モデル・声質の比較",
    candidatesFile: "/config/candidates.json",
    audioRoot: "/output",
  },
  "round-2": {
    label: "ROUND 2",
    title: "阿井田 茂 — 無機質さの比較",
    candidatesFile: "/config/candidates-round-2.json",
    audioRoot: "/output/round-2",
  },
};

const elements = {
  audio: document.querySelector("#audio-player"),
  candidateStrip: document.querySelector("#candidate-strip"),
  head: document.querySelector("#matrix-head"),
  body: document.querySelector("#matrix-body"),
  nowPlaying: document.querySelector("#now-playing"),
  nowTitle: document.querySelector("#now-title"),
  nowSample: document.querySelector("#now-sample"),
  progress: document.querySelector("#progress-bar"),
  time: document.querySelector("#time-display"),
  stop: document.querySelector("#stop-all"),
  roundLabel: document.querySelector("#round-label"),
  roundTitle: document.querySelector("#round-title"),
};

const state = {
  samples: [],
  round: "round-2",
  candidates: [],
  activeButton: null,
  sequenceButton: null,
  sequence: [],
  sequenceIndex: -1,
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function candidateName(candidate, index) {
  const shortId = state.round === "round-2" ? `2${String.fromCharCode(65 + index)}` : String.fromCharCode(65 + index);
  return { shortId, title: `${candidate.model} / ${candidate.style}` };
}

function audioUrl(candidate, sample) {
  return `${rounds[state.round].audioRoot}/${encodeURIComponent(candidate.id)}/${sample.id}.wav`;
}

function resetActiveButton() {
  state.activeButton?.classList.remove("is-playing");
  if (state.activeButton) state.activeButton.textContent = "▶ 再生";
  state.activeButton = null;
}

function resetSequenceButton() {
  state.sequenceButton?.classList.remove("is-playing");
  if (state.sequenceButton) state.sequenceButton.textContent = "3候補を順番に再生";
  state.sequenceButton = null;
}

function resetButtons() {
  resetActiveButton();
  resetSequenceButton();
}

function stopPlayback() {
  elements.audio.pause();
  elements.audio.removeAttribute("src");
  elements.audio.load();
  state.sequence = [];
  state.sequenceIndex = -1;
  resetButtons();
  elements.stop.disabled = true;
  elements.nowPlaying.hidden = true;
  elements.progress.style.width = "0%";
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

async function play(candidate, sample, button, preserveSequence = false) {
  const wasCurrent = state.activeButton === button && !elements.audio.paused;
  if (wasCurrent) {
    stopPlayback();
    return;
  }
  elements.audio.pause();
  resetActiveButton();
  if (!preserveSequence) {
    resetSequenceButton();
    state.sequence = [];
    state.sequenceIndex = -1;
  }
  state.activeButton = button;
  button.classList.add("is-playing");
  button.textContent = "■ 停止";
  elements.stop.disabled = false;
  elements.nowPlaying.hidden = false;
  const index = state.candidates.indexOf(candidate);
  const name = candidateName(candidate, index);
  elements.nowTitle.textContent = `${name.shortId} · ${name.title}`;
  elements.nowSample.textContent = `${sample.label} — ${sample.text}`;
  elements.audio.src = audioUrl(candidate, sample);
  try {
    await elements.audio.play();
  } catch (error) {
    stopPlayback();
    window.alert(`音声を再生できませんでした。WAV生成済みか確認してください。\n${error.message}`);
  }
}

function render() {
  const round = rounds[state.round];
  elements.roundLabel.textContent = round.label;
  elements.roundTitle.textContent = round.title;
  elements.candidateStrip.innerHTML = state.candidates.map((candidate, index) => {
    const name = candidateName(candidate, index);
    const direction = candidate.direction ?? candidate.modelCategory ?? "Voice candidate";
    const params = candidate.parameters;
    return `<article class="candidate-card">
      <span class="candidate-id">${name.shortId}</span>
      <h3>${escapeHtml(name.title)}</h3>
      <p>${escapeHtml(direction)}</p>
      <p class="params">speed ${params.speedScale} · pitch ${params.pitchScale} · style ${params.intonationScale} · tempo ${params.tempoDynamicsScale}</p>
    </article>`;
  }).join("");

  elements.head.innerHTML = `<tr>
    <th>台詞</th>
    <th>本文</th>
    ${state.candidates.map((candidate, index) => `<th>${candidateName(candidate, index).shortId}</th>`).join("")}
    <th>連続比較</th>
  </tr>`;

  elements.body.innerHTML = "";
  for (const sample of state.samples) {
    const row = document.createElement("tr");
    row.innerHTML = `<td><span class="sample-number">${sample.id.slice(0, 2)}</span><span class="sample-label">${escapeHtml(sample.label)}</span></td>
      <td class="sample-text">${escapeHtml(sample.text)}</td>`;
    for (const candidate of state.candidates) {
      const cell = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "play-button";
      button.textContent = "▶ 再生";
      button.addEventListener("click", () => play(candidate, sample, button));
      cell.append(button);
      row.append(cell);
    }
    const sequenceCell = document.createElement("td");
    const sequenceButton = document.createElement("button");
    sequenceButton.type = "button";
    sequenceButton.className = "sequence-button";
    sequenceButton.textContent = "3候補を順番に再生";
    sequenceButton.addEventListener("click", () => {
      if (state.sequenceButton === sequenceButton && state.sequence.length) {
        stopPlayback();
        return;
      }
      stopPlayback();
      state.sequenceButton = sequenceButton;
      state.sequenceButton.classList.add("is-playing");
      state.sequenceButton.textContent = "■ 連続再生を停止";
      state.sequence = state.candidates.map((candidate, index) => ({
        candidate,
        sample,
        button: row.querySelectorAll(".play-button")[index],
      }));
      state.sequenceIndex = 0;
      play(state.sequence[0].candidate, sample, state.sequence[0].button, true);
    });
    sequenceCell.append(sequenceButton);
    row.append(sequenceCell);
    elements.body.append(row);
  }
}

async function selectRound(roundId) {
  stopPlayback();
  state.round = roundId;
  document.querySelectorAll(".round-tab").forEach((button) => {
    const active = button.dataset.round === roundId;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const response = await fetch(rounds[roundId].candidatesFile);
  if (!response.ok) throw new Error(`Candidate設定を取得できません: ${response.status}`);
  state.candidates = (await response.json()).candidates;
  render();
}

elements.audio.addEventListener("timeupdate", () => {
  const ratio = elements.audio.duration ? elements.audio.currentTime / elements.audio.duration : 0;
  elements.progress.style.width = `${Math.min(100, ratio * 100)}%`;
  elements.time.textContent = `${formatTime(elements.audio.currentTime)} / ${formatTime(elements.audio.duration)}`;
});

elements.audio.addEventListener("ended", () => {
  if (state.sequence.length && state.sequenceIndex < state.sequence.length - 1) {
    state.sequenceIndex += 1;
    const next = state.sequence[state.sequenceIndex];
    play(next.candidate, next.sample, next.button, true);
    return;
  }
  stopPlayback();
});

elements.stop.addEventListener("click", stopPlayback);
document.querySelectorAll(".round-tab").forEach((button) => button.addEventListener("click", () => selectRound(button.dataset.round)));

try {
  const samplesResponse = await fetch("/config/samples.json");
  if (!samplesResponse.ok) throw new Error(`台詞manifestを取得できません: ${samplesResponse.status}`);
  state.samples = (await samplesResponse.json()).samples;
  await selectRound("round-2");
} catch (error) {
  document.querySelector(".comparison").innerHTML = `<p style="padding:24px;color:#f0bc63">${escapeHtml(error.message)}</p>`;
}
