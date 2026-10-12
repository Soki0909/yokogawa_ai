// Review-only annotation. Injected by the recorder, never shipped to Production Display.
const descriptions = {
  'P-001': '横川AI 起動', 'P-002': '参加者の照会', 'P-003': '情報照合・セキュリティ説明',
  'P-004': 'プリンキピア説明 → HACK', 'P-005': '外部通信を拒否', 'P-006': '命令を拒否',
  'P-007': '認証を拒否', 'P-008': '五つの謎・脱出条件', 'P-019': '記入用紙の案内',
  'P-V02': '第一の謎を提示', 'P-011': '五つ達成 → 統合 → 最終問題',
  'P-012': '認証成功 → 解錠 → 異常', 'P-013': '緊急遮断・連絡失敗',
  'P-014': 'スタッフへの連絡失敗', 'P-V04': '危険状態・警報', 'P-015': '機械設備の強制暴走',
  'P-V05': '非常停止問題を提示', 'P-V06': '停止コード → 全停止・解放',
  'P-V07': '復旧 → NORMAL', 'P-020': '全館の扉・解錠確認',
};
export const recordingCueCaption = cue => `${cue.cueNumber}｜${descriptions[cue.cueNumber] ?? cue.name}`;

export function recordingCueCaptionScript(cue) {
  return `(() => {
    let label = document.getElementById('recording-cue-caption');
    if (!label) {
      label = document.createElement('div');
      label.id = 'recording-cue-caption';
      Object.assign(label.style, {
        position: 'fixed', top: '24px', left: '24px', zIndex: '2147483647',
        maxWidth: 'calc(100vw - 48px)', padding: '10px 18px', borderRadius: '8px',
        background: 'rgba(0,0,0,.85)', color: '#fff', font: '600 28px/1.4 system-ui, sans-serif',
        whiteSpace: 'normal', overflowWrap: 'anywhere', pointerEvents: 'none',
        border: '1px solid rgba(255,255,255,.35)'
      });
      document.body.append(label);
    }
    label.textContent = ${JSON.stringify(recordingCueCaption(cue))};
    return label.textContent;
  })()`;
}
