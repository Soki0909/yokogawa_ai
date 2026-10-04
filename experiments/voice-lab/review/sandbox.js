const defaults = { text: 'エラー。セキュリティプロテクトの緊急遮断を確認。解錠作業ストップ。エラー。指定されたスタッフへの連絡に失敗。', punctuationMode: 'none', speedScale: 1.08, intonationScale: .25, tempoDynamicsScale: .08, pauseLengthScale: 1.35 };
const elements = {
  form: document.querySelector('#sandbox-form'), text: document.querySelector('#sandbox-text'), count: document.querySelector('#character-count'),
  punctuation: document.querySelector('#punctuation-mode'), speed: document.querySelector('#speed-scale'), intonation: document.querySelector('#intonation-scale'),
  tempo: document.querySelector('#tempo-scale'), pause: document.querySelector('#pause-scale'), generate: document.querySelector('#generate-button'),
  reset: document.querySelector('#reset-button'), status: document.querySelector('#sandbox-status'), result: document.querySelector('#sandbox-result'),
  preview: document.querySelector('#synthesis-preview'), audio: document.querySelector('#sandbox-audio'),
};
let audioUrl = null;

function updateCount() { elements.count.textContent = [...elements.text.value].length; }
function applyDefaults() {
  elements.text.value = defaults.text; elements.punctuation.value = defaults.punctuationMode; elements.speed.value = defaults.speedScale;
  elements.intonation.value = defaults.intonationScale; elements.tempo.value = defaults.tempoDynamicsScale; elements.pause.value = defaults.pauseLengthScale;
  elements.audio.pause(); elements.audio.removeAttribute('src'); elements.audio.load();
  if (audioUrl) URL.revokeObjectURL(audioUrl); audioUrl = null; elements.result.hidden = true; elements.generate.textContent = '▶ 生成して再生';
  updateCount(); elements.status.textContent = '2D初期値に戻しました';
}
function payload() {
  return { text: elements.text.value, punctuationMode: elements.punctuation.value, parameters: {
    speedScale: Number(elements.speed.value), intonationScale: Number(elements.intonation.value),
    tempoDynamicsScale: Number(elements.tempo.value), pauseLengthScale: Number(elements.pause.value),
  } };
}

elements.text.addEventListener('input', updateCount);
elements.reset.addEventListener('click', applyDefaults);
elements.audio.addEventListener('ended', () => { elements.generate.textContent = '▶ 生成して再生'; });
elements.form.addEventListener('submit', async (event) => {
  event.preventDefault(); elements.generate.disabled = true; elements.generate.textContent = '生成中…'; elements.status.textContent = 'AivisSpeechで生成しています';
  try {
    const response = await fetch('/api/sandbox/synthesize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload()) });
    if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.error ?? `HTTP ${response.status}`); }
    const synthesisText = decodeURIComponent(response.headers.get('x-synthesis-text') ?? '');
    if (audioUrl) URL.revokeObjectURL(audioUrl); audioUrl = URL.createObjectURL(await response.blob());
    elements.audio.src = audioUrl; elements.preview.textContent = synthesisText; elements.result.hidden = false;
    await elements.audio.play(); elements.generate.textContent = '■ 再生中'; elements.status.textContent = '生成完了';
  } catch (error) {
    elements.generate.textContent = '▶ 生成して再生'; elements.status.textContent = `生成失敗: ${error.message}`;
  } finally { elements.generate.disabled = false; }
});

updateCount();
