# 実機HDMI計測（旧MediaElement実装の記録）

2026-10-14の候補以降、`npm run test:projection` は `scripts/production-reliability-browser-check.js` を実行する。以下は旧実装の手順であり、新AudioBuffer実装の本番合格判定に使用しない。現行の手順・計測の限界・採用条件は [production-reliability-operation-20261014.md](./production-reliability-operation-20261014.md) を参照。旧play/playing値と新BufferSource値を直接比較しない。

演出・台詞・音源・Cueの予定時刻を変えずに、実画面上のChromeで測る。通常の本番サーバとは別のlocalhostサーバ、保存状態、Chrome profileを作る。終了時はこの検証が起動したprocess treeだけを終了する。普段のChromeやProduction保存状態は操作しない。

## 準備

Windowsの拡張表示とHDMI画面の1920×1080・60Hzを確認する。Displayを投影する画面の座標を`PROJECTION_BOUNDS`、Adminを置く画面の座標を`PROJECTION_ADMIN_BOUNDS`で指定する。現在の既定値はHDMIが左上(0,0)、Adminが(1920,-227)の構成向け。異なる構成では必ず指定する。

計測中は全編が実際に表示・発話される。STOP以外の本番操作を兼用しない。物理音声出力はWindowsの現在の出力先を使用する。検証側がHDMI音声へ勝手に切り替えることはない。

本番前には既存のScene Rehearsalで代表演出を一度確認し、ブラウザを閉じずにProduction Resetする。初回のHACK合成に長いフレーム間隔が発生する環境では、開場前の確認で描画資源を温める運用が有効。確認後にChromeやDisplayを再読み込みした場合は、もう一度確認する。CSSやCue時間を簡略化してこの待ちを隠すことはしない。

```powershell
$env:PROJECTION_BOUNDS='{"left":0,"top":0,"width":1920,"height":1080}'
$env:PROJECTION_ADMIN_BOUNDS='{"left":1920,"top":-227,"width":1200,"height":900}'
$env:PROJECTION_PASSES='2'
$env:PROJECTION_IDLE_MS='60000'
$env:PROJECTION_FAULTS='1'
node scripts/projection-performance-check.js artifacts/projection-performance/current
```

全Cueを本来の長さで実行し、演出・発話完了から2秒後に次へ進む。Headless、動画録画、viewport emulation、背景timerを強制変更するChrome flagは使用しない。Admin側へのフォーカス移動を伴う。最初のScene 1終了後、指定時間idleを挟む。

改善前との比較では`PROJECTION_BASELINE_COMMIT`に比較対象のコミットを指定する。変更したrenderer JS/CSSだけをChromeのテスト用Fetch interceptionから供給し、repositoryの変更を上書きせず比較する。Cue/Show/WAVは同一のものを使う。比較の前後は同じ計測器・同じ画面位置・同じバックグラウンド負荷を使い、他のブラウザE2Eや録画エンコードを同時に走らせない。

## 長時間・障害

通常tests、Production E2E、録画確認、短い実機計測がPASSしてから実行する。

```powershell
Remove-Item Env:PROJECTION_BASELINE_COMMIT -ErrorAction SilentlyContinue
$env:PROJECTION_PASSES='3'
$env:PROJECTION_IDLE_MS='2100000'
$env:PROJECTION_FAULTS='1'
node scripts/projection-performance-check.js artifacts/projection-performance/endurance
```

35分idle中にCue位置・音声再生回数が変わらないことを繰り返し検証する。障害モードでは実ウィンドウminimize/restore、12秒のJS停止＋heartbeat喪失＋停止中の発話要求、STOP中の遅延Cue破棄、明示REPLAY、WebSocket再接続、reload＋手動Audio Ready、2時間の時計jump、5回のProduction Resetを検証する。Windows自体のsleepは実施しない。JS停止は安全なproxyであり、HDMI装置や音声ドライバの物理sleep復帰合格とは区別する。

音声出力は準備済みAudioContextをWAVとSEで共有する。無音中は接続ノードも口パクframeも外し、準備済みContextを1つ維持する。STOP・Reset・切断・復帰のキャンセルでは旧Contextを破棄する。Reset／復帰の準備は無音で行い、過去のCueや音声を再生しない。

## 計測値の意味

- `actionToPresentationMs`: AdminがNEXTを送ってからDisplayがpresentationを受信するまで。同じPCのperformance clockを使う。
- `actionToNextFrameMs`: 上記操作から次のrequestAnimationFrame callbackまで。描画機会の目安であり、パネルに光が出た時刻ではない。
- `playCallToPlayingMs`: HTMLMediaElement.play()からplayingイベントまで。意図したCue内pause/delayを含めない。音声デバイスやスピーカーから実際に音が出た時刻ではない。
- フレーム間隔: median / p95 / p99 / maxと25ms・50ms超の数。60Hzの16.7msを基準に、カクつきが集中するCueを見つける。意図したstepsアニメーションの見た目と、ブラウザ全体のフレーム欠落は別に扱う。
- long task、強制transitionレイアウト、DOM更新、heap / DOM / live AudioContextは原因の候補。1回の最大値だけで改善を断定しない。

`progress.json`はCueごと、`idle-progress.json`はidle中に更新する。元データやウィンドウcaptureはローカル保存し、Gitの対象外とする。実測レポートでは試験装置側の失敗・再試行と、本体側の問題を区別する。

## 物理遅延の残り

投影機器・HDMI経路・PAの内部遅延を測るには、基準画面と投影面を同時に写す高fps撮影、光センサーや音響ループバックなどが必要になる。ソフトウェア測定だけで「HDMI遅延○ms」「客席での音声同期○ms」と断定しない。本番のケーブル・表示装置・PA・座席位置で最後に確認する。
