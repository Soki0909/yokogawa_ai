import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { composeSpeech, normalizeSentenceBuffers, pcmData, encodePcm } from '../src/audio/speech-composer.js';
import { sentenceTexts } from '../public/js/subtitle-units.js';
import { AivisSpeechClient } from '../src/tts/aivis-speech-client.js';
import { loadProductionVoiceProfile } from '../src/voice-profile.js';

const manifestPath = 'config/production-speech/yokogawa-ai-v2.json';
const sourcePath = 'config/production-speech/yokogawa-ai-pacing-source.json';
// Immutable input keeps repeated preparation from accumulating extra silence.
if (!existsSync(sourcePath)) await fs.copyFile(manifestPath, sourcePath);
const source = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
const manifest = structuredClone(source);
const directions = {
  '001': { pauses: [250,350], direction: '落ち着いた応答。了承→教授への呼びかけ→起動宣言を分ける。' },
  '002': { pauses: [300,450], direction: '即答後に説明。そちらに→名前の前の450msは指示対象を見る間として維持。' },
  '003': { pauses: [550,650], direction: '情報照合→セキュリティ応用→プリンキピアへ話題を渡す。観客が説明を受け取る間。' },
  '004': { pauses: [650], direction: '歴史的価値を落ち着いて説明。初版本と所蔵情報へ切り替える。説明後の画面乱れは別の時間軸。' },
  '005': { pauses: [], direction: '冷たい制限通知。次の人間の台詞を待つ。' },
  '006': { pauses: [], direction: '短く断定。感情的にためない。' },
  '007': { pauses: [], direction: '認証拒否を即断。Cue末尾の芝居はoperatorが待つ。' },
  '008': { pauses: [], direction: '脱出条件を一続きで通告。文途中を表示分割しない。' },
  '009': { pauses: [], direction: '提示の一文。完了後に画像へ移る。' },
  '011': { pauses: [650,850], direction: '達成確認を受け止める650ms。統合を見せたあと850ms置き、最終問題の入力命令へ。' },
  '012': { pauses: [650], direction: '認証成功を聞いて一瞬安堵できる650ms。その後に解錠開始を宣言。読みは同じため再合成しない。' },
  '013': { pauses: [300,450,450,300], direction: '警告音後、ERROR→緊急遮断→停止→ERROR→連絡失敗を機械的に区切る。緊急性を失う長い芝居の間は入れない。' },
  '014': { pauses: [350], direction: '警告音を先行。エラーを短く示し、350ms後に連絡失敗を断定。' },
  '015': { pauses: [], direction: '暴走宣言は一続き。途中で余分な間を増やさない。' },
  '016': { pauses: [850], direction: '全停止の事実を置いて850msの静寂。弱った声で解放へ。文中の既存「……」の演技は保持。' },
  '019': { pauses: [450], direction: '袋の用紙を確認できる450msの間を置いて記入指示。実際に探す人間芝居は次の手動Cueまで待つ。' },
  '020': { pauses: [], direction: '正常な確認通知を静かに一文で返す。復旧の達成感を重ねて誇張しない。' },
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = [];
for (const speech of manifest.speeches) {
  const direction = directions[speech.scriptId];
  if (!direction) throw Error(`PACING_DIRECTION_MISSING:${speech.scriptId}`);
  const original = source.speeches.find(s => s.scriptId === speech.scriptId);
  const wav = await fs.readFile(`public/${original.path}`);
  if (sha(wav) !== original.sha256) throw Error(`SOURCE_WAV_CHANGED:${original.path}`);
  const pcm = pcmData(wav);
  let segments = structuredClone(original.segments);
  // Legacy ERROR chunk estimates split the first spoken word. Use reviewed waveform units.
  if (original.subtitleUnits) {
    const spoken = sentenceTexts(original.spokenText);
    segments = original.subtitleUnits.map((u,index) => ({ ...u, spokenText: spoken[index], pauseAfterMs: 0 }));
  }
  if (speech.scriptId === '012') {
    for (const key of ['scriptText','displayText','spokenText','synthesisText']) if (speech[key]) speech[key] = speech[key].replaceAll('開錠','解錠');
    segments = segments.map(s => ({ ...s, displayText: s.displayText.replaceAll('開錠','解錠'), spokenText: s.spokenText.replaceAll('開錠','解錠') }));
  }
  speech.pacing = { version: 1, direction: direction.direction, sourcePath: original.path, sourceSha256: original.sha256, pauseAfterMs: direction.pauses };
  if (segments.length > 1) {
    if (segments.length - 1 !== direction.pauses.length) throw Error(`PACING_SEGMENT_COUNT:${speech.scriptId}`);
    segments = segments.map((s,index) => ({ ...s, pauseAfterMs: direction.pauses[index] ?? 0, alignment: 'approved-voice-boundary; stage pacing' }));
    let buffers;
    if (speech.scriptId === '013') {
      // The old full take has no safe silence at the first ERROR boundary.
      // Cache newly synthesized sentence takes; reruns and pause edits never regenerate them.
      const profile = await loadProductionVoiceProfile(); const client = new AivisSpeechClient();
      const sources = [];
      for (const [index,segment] of segments.entries()) {
        const file = `public/assets/audio/segments/stage-013-source-${index+1}.wav`;
        if (!existsSync(file)) await fs.writeFile(file,(await client.synthesize(segment.spokenText,profile)).wav);
        sources.push(await fs.readFile(file));
      }
      buffers = normalizeSentenceBuffers(sources);
      speech.reusedApprovedTake = false;
      speech.regeneratedWithApprovedProfile = true;
      speech.pacing.regeneratedSentences = true;
      speech.pacing.reason = '旧takeの文境界が有声部分を切るため、同じ承認Profileで文単位に再合成';
    } else buffers = normalizeSentenceBuffers(segments.map(s => encodePcm(pcm.subarray(Math.round(s.startMs * 44.1) * 2, Math.min(pcm.length,Math.round(s.endMs * 44.1) * 2)))));
    segments = segments.map((s,index) => ({ ...s, path: `assets/audio/segments/paced-${speech.scriptId}-${index+1}.wav` }));
    const result = composeSpeech(segments, buffers);
    for (const [index,buffer] of buffers.entries()) await fs.writeFile(`public/${segments[index].path}`,buffer);
    speech.path = `assets/audio/production-paced-${speech.scriptId}.wav`;
    await fs.writeFile(`public/${speech.path}`,result.wav);
    Object.assign(speech, { segments: result.timeline, sha256: result.verification.wav.sha256, durationSeconds: result.verification.wav.durationSeconds, bytes: result.wav.length });
    delete speech.subtitleUnits;
  }
  report.push({ scriptId: speech.scriptId, ...speech.pacing, path: speech.path, durationSeconds: speech.durationSeconds, sha256: speech.sha256 });
}
// Unused original SFX remain archival files, never Production assets / playback.
manifest.sfx = manifest.sfx.filter(s => ['prod-sfx-boot','prod-sfx-glitch','prod-sfx-warning'].includes(s.id));
manifest.pacingRevision = 'stage-pacing-2026-10-13';
await fs.writeFile(manifestPath, `${JSON.stringify(manifest,null,2)}\n`);
await fs.mkdir('artifacts/stage-pacing-2026-10-13',{recursive:true});
await fs.writeFile('artifacts/stage-pacing-2026-10-13/pacing-recipe.json',JSON.stringify({ profileUnchanged: true, reusedApprovedVoiceExcept: ['013'], speeches: report },null,2));
console.log(JSON.stringify({ speeches: report.length, composed: manifest.speeches.filter(s=>s.path.startsWith('assets/audio/production-paced-')).length, sfx: manifest.sfx.length }));
