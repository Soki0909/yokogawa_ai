# 本番安定化候補の運用と採用条件

この改修は `codex/production-reliability-20261014` の候補。HDMI環境を今回用意できないため、ソフトウェア検証のPASSだけで本番採用・main/master統合を行わない。基準版は a90176c1e8297f49ac660d851511ad2dda723656。

ユーザーの追加指示により、35分実試験を仮完了の条件から除外した。全189 automated tests、Production E2E、録画、idleなしの同一Chrome3公演・障害回帰を根拠に候補を仮完了とする。35分試行はブラウザのRuntime.evaluate timeoutで未達、PASSではない。原因未特定のブラウザ無応答とHDMI・客席確認を残して、本番合格とは区別する。詳細は [production-reliability-result-20261014.md](./production-reliability-result-20261014.md)。

## 起動・進行

1. 本番と同じ画面・HDMI音声出力をWindowsで選び、サーバとDisplayを開く。二重に音を出す別DisplayをAudio Masterにしない。
2. 固定WAVの「20 / 20 READY（実デコード済み）」を待つ。これはPCM準備の状態。Audio有効化を押し、別表示の出力READYとAdminのAudio Masterを確認する。NOT READYのままNEXTを押し通さない。
3. NEXTは実音声・SE・有限演出・字幕の終了まで無効となる。1200ms二重押し防止も維持する。拒否したNEXTは後から実行されない。長い持続画面は入口演出までを待ち、画面そのものが消えるまで待たない。
4. STOPは音声・SEと遅延処理を即取消し。BLACKOUTは従来通り映像の遮断であり、無音化が必要ならSTOPも押す。RESTOREは旧音声・字幕を復活させない。
5. 障害後は出力READYを確認し、舞台進行を見て必要なCueを明示REPLAYまたは選択実行する。復帰・reload・Scene Rehearsal・Reset自体が過去Cueを勝手に再生することはない。

READYはブラウザ内の実デコードとContext clockの健全性を確認する。HDMIアンプ・スピーカーが起きていることや客席音量の保証ではない。演出前の試し発話を、初回不具合が解消した証拠にしない。

## 保持・変更範囲

20 Cueの境界・順序、17発話、承認済みVoice Profileと元WAVを保持。P-001は「承知しました、横川教授。」を一つの表示にし、次文はclearしてタイプライター表示。発声を変えず表示の省略点を除き、完全文末を「。」へ整えた。

文間の候補値はP-003が350/450ms、P-004が450ms、P-011が450/650ms。他の声のPCMには手を加えず、既存segmentを連結した新規WAV3本のみを使用。P-V06の850msは保持。Speech Composerで文間を変更・試聴・保存できる既存機能を維持する。演技上の最終採用は本番音響で聴いて判断する。

Scene 7復旧SEの予約先は `public/assets/audio/production-recovery.wav`。選定済み実素材を置き、サーバを再起動してPreflightのREADY、P-V07の4600ms位置、音量0.8とNEXT完了待ちを確認する。未配置ならMISSINGを表示して既存復旧演出を継続し、代替音は鳴らさない。P-020は独立Cueのまま。

## 通常検証と長時間検証

専用localhostサーバ・保存先・Chrome profileを作り、普段のProduction状態は操作しない。通常tests、E2E、録画、短い信頼性試験が通ってから長時間試験を行う。他のE2Eや録画エンコードを重ねない。

```powershell
node --test --test-concurrency=1 test/*.test.js
node scripts/production-browser-check.js
node scripts/stage-pacing-browser-check.js
node scripts/record-production-display.js artifacts/audio-reliability-20261014/recording
node scripts/verify-production-recording.mjs artifacts/audio-reliability-20261014/recording
$env:RELIABILITY_PASSES='1'
$env:RELIABILITY_IDLE_MS='0'
node scripts/production-reliability-browser-check.js artifacts/audio-reliability-20261014/normal
```

```powershell
Remove-Item Env:RELIABILITY_FAULTS_ONLY -ErrorAction SilentlyContinue
$env:RELIABILITY_PASSES='3'
$env:RELIABILITY_IDLE_MS='2100000'
node scripts/production-reliability-browser-check.js artifacts/audio-reliability-20261014/endurance
node scripts/analyse-reliability-captures.mjs artifacts/audio-reliability-20261014/endurance
```

可視Chrome、通常のbackground throttling、手動相当のAudio有効化を使用する。最初のScene 1終了後に実時間idleを挟み、次のP-011より前に発話を試し再生しない。全20 Cueを本来の長さで進め、実完了から2秒後にNEXTする。

このdriverは物理HDMI機器を検出・選択・測定しない。今回の記録は内蔵画面でのソフトウェア検証として出力される。HDMI確認では本番の拡張表示・音声出力を別途確認し、Displayを対象画面に置き、客席で別記録を残す。

`progress.json` はCueごとのBufferSource開始/終了、Context状態、ブラウザ報告latency、描画frameを記録する。`idle-progress.json` / `idle.json` は実時間経過と再生数、`resources.json` は公演ごとのheap/DOM/decoded bytesを記録する。`summary.json` のfaultsに実施した障害とproxyの範囲が載る。hiddenにならなかったminimize試行を成功と扱わない。

デジタル音声はAudio graphからMediaRecorderへ分岐し、OS/HDMIより前で記録する。10ms RMS照合で30ms以上の予期しない低エネルギーを検出する検査であり、細かなクリックや客席での音切れの不存在を保証しない。BufferSource開始、`getOutputTimestamp`、base/outputLatency、次rAFは、物理的な出音・投影面の時刻ではない。物理同期には高fps撮影や音響ループバック等の別計測が必要。

12秒のJS停止＋heartbeat喪失、Context suspend/close、devicechangeイベントは安全なproxyを含む。Windows/HDMI装置のsleep/resumeや実際の音声機器切替の合格と混同しない。

起動時は20 WAVを実デコードし、同じPCMを本再生に再利用する。出力READYにはContext clock進行も必要。STOP/Resetは旧発話・遅延処理を取消し、健全なContextとdecoded PCMは維持する。復帰は無音の準備だけを行い、過去Cueを自動再生しない。

## 現地で残る必須gate

- 本番のHDMI・音響・座席で冷間初回の頭欠け/途切れ/同期を確認。
- Scene 1後35分以上、試し発話せず待機してP-011の最初の出音を確認。
- 同一ブラウザで3公演、Reset・STOP・BLACKOUT・再接続後の復帰を確認。
- 数m離れた観客とオペレーター双方で映像・字幕・音量・文間を確認。
- 実音声機器の省電力復帰・本番出力先を確認。ソフトウェアproxyを実機合格へ読み替えない。

音切れ・遅れが残る場合は候補を本番統合しない。既存main/masterは基準版のまま維持し、候補ログと実機条件を比較して原因を追う。
