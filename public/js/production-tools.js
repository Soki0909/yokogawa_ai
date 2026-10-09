const byId = id => document.getElementById(id);
let library; let draft; let selectedSpeech; let exported; let busy = false;
async function request(route, body) {
  const response = await fetch(`/api/production-tools${route}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
function action(fn) { return async () => { if (busy) return; busy = true; document.querySelector('main').inert = true; byId('status').textContent = '処理中…'; try { await fn(); } catch (error) { byId('status').textContent = error.message; } finally { busy = false; document.querySelector('main').inert = false; } }; }
function renderSegments(segments, audioReady = false) {
  byId('preview').pause(); byId('preview').removeAttribute('src');
  byId('segments').replaceChildren();
  for (const [index, segment] of segments.entries()) {
    const row = document.createElement('div'); row.className = 'segment';
    for (const [key, label] of [['displayText', '表示'], ['spokenText', '読み上げ'], ['pauseAfterMs', '後の間 (ms)']]) {
      const field = document.createElement('label'); field.textContent = label;
      const input = document.createElement(key === 'pauseAfterMs' ? 'input' : 'textarea'); input.dataset.key = key; input.value = segment[key] ?? ''; if (key === 'pauseAfterMs') { input.type = 'number'; input.min = 0; input.max = 10000; } field.append(input); row.append(field);
    }
    const preview = document.createElement('button'); preview.textContent = '▶ 文'; preview.dataset.preview = 'true'; preview.disabled = !audioReady; preview.onclick = () => { byId('preview').src = `/api/production-tools/audio/${draft.id}/${index}`; void byId('preview').play(); };
    const remove = document.createElement('button'); remove.textContent = '削除'; remove.onclick = () => renderSegments(readSegments().filter((_, position) => position !== index)); row.append(preview, remove); byId('segments').append(row);
  }
  byId('export').disabled = true; byId('apply').disabled = true;
  byId('compose').disabled = false;
}
function readSegments() { return [...document.querySelectorAll('.segment')].map(row => Object.fromEntries([...row.querySelectorAll('[data-key]')].map(input => [input.dataset.key, input.dataset.key === 'pauseAfterMs' ? Number(input.value) : input.value]))); }
byId('segments').addEventListener('input', () => { byId('export').disabled = true; byId('apply').disabled = true; document.querySelectorAll('[data-preview]').forEach(button => { button.disabled = true; }); byId('preview').pause(); byId('preview').removeAttribute('src'); });
for (const id of ['display-text', 'spoken-text']) byId(id).addEventListener('input', () => { byId('compose').disabled = true; byId('export').disabled = true; byId('apply').disabled = true; byId('status').textContent = '全文を変更しました。「再分割」を押して文区間へ反映してください。'; });
byId('speech-select').onchange = action(async () => {
  selectedSpeech = library.manifest.speeches.find(s => s.scriptId === byId('speech-select').value);
  draft = await request('/draft', { scriptId: selectedSpeech.scriptId });
  byId('display-text').value = draft.displayText; byId('spoken-text').value = draft.spokenText; renderSegments(draft.segments, true); byId('status').textContent = '既存音声を読み込みました。';
});
byId('split').onclick = action(async () => { renderSegments((await request('/segment', { displayText: byId('display-text').value, spokenText: byId('spoken-text').value })).segments); byId('status').textContent = '再分割しました。'; });
byId('add').onclick = () => renderSegments([...readSegments(), { displayText: '', spokenText: '', pauseAfterMs: 350 }]);
byId('compose').onclick = action(async () => { const result = await request('/compose', { id: draft.id, segments: readSegments() }); renderSegments(result.segments, true); byId('display-text').value = result.segments.map(s => s.displayText).join(''); byId('spoken-text').value = result.segments.map(s => s.spokenText).join(''); byId('preview').src = result.url; byId('export').disabled = false; byId('status').textContent = `Preview準備完了 / ${result.verification.wav.durationSeconds.toFixed(2)}秒 / clippingなし`; });
byId('export').onclick = action(async () => { exported = await request('/export', { id: draft.id }); const link = document.createElement('a'); link.href = `/${exported.asset.path}`; link.download = ''; link.textContent = '最終WAVを保存'; byId('result').replaceChildren(link); byId('apply').disabled = false; byId('status').textContent = `書き出し完了 / SHA256 ${exported.asset.sha256}`; });
byId('apply').onclick = action(async () => { const cue = library.cues.find(c => c.audio.assetId?.startsWith(`prod-voice-${selectedSpeech.scriptId}-`)); if (!cue) throw new Error('対応するCueがありません'); await request('/apply', { id: draft.id, cueId: cue.cueId }); byId('status').textContent = '現在のShowへ適用しました。Showを保存してください。Production Resetでは同梱版へ戻ります。'; });
library = await request('');
const assetPanel = document.createElement('section'); assetPanel.className = 'panel';
const title = document.createElement('h2'); title.textContent = '問題画像を設定 / AvatarをPreview'; assetPanel.append(title);
for (const [slot, name] of [['first', '第一の謎'], ['final', '最終問題'], ['emergency', '非常停止問題']]) {
  const label = document.createElement('label'); label.textContent = `${name} — PNG / JPEG / WebP (8MBまで)`;
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp';
  input.onchange = action(async () => {
    const file = input.files[0]; if (!file) return;
    const image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    const decoded = new Image(); decoded.src = image; await decoded.decode();
    if (!decoded.naturalWidth || !decoded.naturalHeight) throw new Error('画像を読み込めません');
    const result = await request('/puzzle', { slot, image }); byId('status').textContent = `${decoded.naturalWidth}×${decoded.naturalHeight} / ${result.saveReminder}`;
  }); label.append(input); assetPanel.append(label);
}
const layers = {};
for (const [key, filename] of [['base', 'base.png'], ['mouthHalf', 'mouth-half.png'], ['mouthOpen', 'mouth-open.png'], ['eyesClosed', 'eyes-closed.png']]) {
  const label = document.createElement('label'); label.textContent = key; const input = document.createElement('input'); input.value = `assets/avatar/yokogawa/v1/${filename}`; layers[key] = input; label.append(input); assetPanel.append(label);
}
const swap = document.createElement('button'); swap.id = 'avatar-preview'; swap.textContent = '既存ローカルlayerをDisplayへ適用'; swap.onclick = action(async () => { await request('/avatar', { layers: Object.fromEntries(Object.entries(layers).map(([key, input]) => [key, input.value])) }); byId('status').textContent = 'Avatarを適用しました。本人に似せた新画像は作成していません。Showを保存してください。'; }); assetPanel.append(swap);
document.querySelector('main').append(assetPanel);
for (const speech of library.manifest.speeches) { const option = document.createElement('option'); option.value = speech.scriptId; option.textContent = `P-${speech.scriptId} ${speech.scriptText.slice(0, 36)}`; byId('speech-select').append(option); }
await byId('speech-select').onchange();
