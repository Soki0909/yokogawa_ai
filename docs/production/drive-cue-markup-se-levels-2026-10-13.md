# 台本AI Cue追記・SEレベル調整（2026-10-13）

ユーザーの明示指示により、上演台本にAI Cue注記だけを追加した。既存のセリフ・ト書き・SE・照明指定には変更を加えていない。

## Driveバックアップと編集監査

- 編集対象: https://docs.google.com/document/d/16KxoOjIFLJXikFF_3u3LnnbjnQX8xJvZ-cPPNxkuJVo/edit
- 編集前バックアップ: https://docs.google.com/document/d/1ae9QA10M7VGpwa4NXJV4FZRGH37nYHSg9iyr6IGedVU/edit
- 同じDriveフォルダに18タブを含むコピーを保存し、本文・named styles・document stylesの一致を確認。
- revision guard付きで20行を追加。削除・置換リクエストは使用していない。
- 記法は `AI：Cue ID｜短い説明`。説明は録画の共通captionと一致する。
- Scene 6の既存 `SE：警告音。` を書式基準として、青・太字・Arial 11pt・同じ字下げ。注記は次の段落と同じページに置く。
- 追加行を除いた全1,458段落の文字・text style・paragraph styleを、indexの移動だけ除外して完全一致監査。18タブの順序・タイトルも維持。
- PDFのScene 1 / 6 / 7を目視。青いCue注記、既存の赤字、黒字、SE書式を確認した。原文の「開錠」等もこの作業では書き換えていない。
- 保存先: `artifacts/drive-cue-markup-2026-10-13/`。native JSON、本文、編集前後PDF、挿入計画、再実行可能な監査スクリプトと結果を含む。

## SEの個別調整

素材のFFmpeg loudnorm測定と、従来のglobal×Cue二重減衰を確認した。Global SFXを1にし、素材の強さに応じてCue側を調整。セリフ音量・WAV・Voice Profileは変更していない。

| SE | 実効ゲイン（旧→新） | 増加 | 調整後LUFS | 調整後true peak |
| --- | --- | --- | --- | --- |
| 起動音 | 0.325 → 0.8 | +7.82 dB | -19.86 | -7.22 dBTP |
| HACK | 0.39 → 0.55 | +2.99 dB | -17.37 | -5.44 dBTP |
| ERROR警告 | 0.39 → 1 | +8.18 dB | -20.61 | -12.08 dBTP |

HACK素材は元から強いため上げ幅を抑え、起動音と警告音の存在感を増した。3種類の素材WAVはGit版とのSHA-256一致を確認。P-013 / P-014の警告音→セリフ、STOP即応性、NEXT 1200msは維持している。会場のPA・客席での最終音量は現地で調整する。既存Showを読み込んだままの場合は、保存済みの編集内容を確保してから新版Productionを読み込むことで新しい標準レベルを適用できる。

## 検証

- `npm run check`: 通常環境で171/171 PASS。sandbox内ではHTTPサーバ起動制限による失敗があり、通常環境で再実行した。
- `npm run test:stage-pacing`: 実Chrome 6ケースPASS（警告音終了後の発話、STOP、遷移、間の編集・試聴・保存・reload）。
- `npm run production:verify` / speech / profile verify: PASS。既存音声素材・Profileのintegrityを維持。
- 台本native監査: PASS。20 Cue追加、元の1,458段落の文字・書式完全一致。
- 調整後1920×1080録画: `artifacts/recordings/2026-10-13-se-levels/`。録画には共通Cue字幕を維持し、演出・発話完了から2秒後に次のCueへ進む。
- 録画検証: 178.646秒、H.264/AAC、30fps、全20 Cue・17 speech・4 SFX、最短gap 1.999秒、全フレームデコードPASS。録画から切り出したSEピークも起動音-7.6dB、HACK-5.6dB、警告音-12.0dBで、新しい再生ゲインが録画に反映されている。
- 録画全体のAACデコードピークは0dB付近。今回変更したSE部分は十分なheadroomがあり、既存セリフの処理・レベルは変更していない。SE単体の安全性と録画全体のピークは区別して記録する。
