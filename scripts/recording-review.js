const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function renderRecordingReview({ cues }) {
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><title>横川AI Display録画</title>
<style>body{margin:24px;background:#111;color:#eee;font-family:system-ui}video{width:100%;max-height:78vh;background:#000}nav{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}button{padding:10px;background:#243747;color:white;border:1px solid #567;border-radius:5px;cursor:pointer}a{color:#8df}</style>
<h1>横川AI Production — 1920×1080</h1><video controls src="production-display-1920x1080.mp4"></video>
<p>有効な全${cues.length} Cue。音声・演出の完了後2秒待機。ボタンでCueの先頭へ移動できます。 <a href="cue-timeline.json">時刻一覧</a></p>
<nav>${cues.map(cue => `<button data-time="${cue.startedSeconds}">${escapeHtml(cue.cueNumber)} ${escapeHtml(cue.name)}</button>`).join('\n')}</nav>
<script>const video=document.querySelector('video');document.querySelector('nav').addEventListener('click',event=>{const button=event.target.closest('button');if(button){video.currentTime=Number(button.dataset.time);video.play();}});</script></html>`;
}
