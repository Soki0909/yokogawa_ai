# 通し稽古改訂後の運用（候補ブランチ限定）

対象 `codex/production-reliability-20261014`。本番採用・main/master統合の承認ではない。客席での冒頭欠けは未検証で、ソフトウェアのREADYを物理出音の合格と扱わない。結果は [改訂検証記録](./rehearsal-revision-result-20261014.md)。

## 開始前

改訂の適用は進行停止中にserverを再起動し、AdminとすべてのDisplayを再読み込みしてから行う。Production Resetだけでは開いたままのJavaScriptは更新されない。再読み込み後に音声有効化・READY・Cue位置を確認する。

1. 本番用の画面・ケーブル・音声機器でDisplayを開く。Windowsの既定出力だけでなく、**音量ミキサー内のChromeの出力先**を確認する。今回のPCでは既定BluetoothとChromeのDisplay Audio出力が異なっていた。アプリはOS設定を勝手に変更しない。
2. Displayの `20 / 20 READY` を待ち、「設定を保存して開始」を押す。AdminでAudio Masterが1台・Audio READYであることを確認する。WAVのデコード済み表示だけでGOしない。
3. 本番用出力からP-001・P-003・P-020を**初回の一回目から**録音して確認する。特に長い待機後の最初のP-011も確認する。マイク／客席で「館内」「承知」などの冒頭を聞き取り、内部録画と混同しない。試験再生は舞台・PA担当と合図を合わせ、開演中に勝手に試さない。
4. 位置を確認してProduction Resetまたは緊急移動で待機する。復旧SEは未配置ならPreflightのMISSINGが正常。承認済み素材が決まるまで代替SEを足さない。

## 通常進行

- NEXTは前Cueの音声・SE・字幕・有限演出の終了を待たない。**1.5秒間の連打保護**後に、オペレーターの合図で次へ進む。次へ進むと前Cueの音声・SE・字幕・遅延処理は中断する。台本上の役者の台詞・観客操作・移動を待つ責任はオペレーターにある。
- 同じ操作の二重送信と1.5秒以内のNEXTは破棄する。後で実行するキューには入らない。server側にも保護があり、別Adminからの操作でもすり抜けない。
- 真のAudio NOT READYと開始前確認中はNEXTできない。開始前確認は最大3.5秒で失敗を返し、遅れて返ってきた応答でCueを開始しない。Displayの設定から出力を再準備し、READYを確認して明示NEXT／REPLAYする。
- STOPは即時に音声・SEと旧タイマーを停止する。BLACKOUTは従来通り映像遮断で、消音が必要ならSTOPも押す。RESTOREは旧音声を再開しない。
- 収録用の「Cue完了から2秒待つ」は録画の自動進行規則。本番のNEXT終了ロックではない。

## 緊急：Cueを飛ばす／移動

Show上部の黄色枠を開く。

1. 一つ先へ追いつく場合は「現在Cueを中断し、次のCueを待機」。任意位置の場合は「次にGOするCue」で番号・名前を選び「移動内容を確認」。この段階ではまだ現在Cueを止めない。
2. プレビューの「現在P-xxxを停止 → P-yyyを次のNEXTで開始」を確認して「確定：停止してこのCueを次にGO」。現在の音・字幕・遅延演出を取消し、**移動そのものは無音**。BLACKOUT中ならBLACKOUTを保つ。画像は消去し、停止時のシステム状態を保持する。
3. NEXT欄が目的のCueであることを確認し、舞台の合図でNEXT。選んだCueそのものを開始する。一つ先にずれない。飛ばしたCueは自動補完・自動再生しない。

別の操作で位置が変わる／接続が切れると古い確認は無効。移動先を確認し直す。移動履歴の「飛ばした位置」には中断した現在位置も含む。過去へ戻る場合は飛ばした位置なしと表示する。

## P-020／台本担当との連携

現行候補の発声は「館内すべての安全を確認しました」、表示は「館内すべての安全を確認しました。」。新WAVは `public/assets/audio/production-rehearsal-020-safety.wav`、約2.600秒。P-V07後の役者の会話を待つ独立GOのまま。

10/14 21:52 JST時点に取得した正式Google Docs原文は旧「館内すべての扉の解錠を確認しました」のまま。今回の指示を開発側へ反映し、共有原本の編集・コメントは行っていない。台本・舞台監督・PA担当へ新しいP-020の文言を合わせる必要がある。

## 計測の再実行

新しいproduction依存はない。通常検証から先に行う。

```powershell
npm.cmd run check
node scripts/production-browser-check.js artifacts/audio-reliability-20261014/rehearsal-revision/e2e
node scripts/rehearsal-revision-browser-check.js
node scripts/verify-production-reliability.mjs
node scripts/record-production-display.js artifacts/audio-reliability-20261014/rehearsal-revision/recording
node scripts/verify-production-recording.mjs artifacts/audio-reliability-20261014/rehearsal-revision/recording
```

通常検証がPASSした候補で、別の録画・音声比較を止めて以下を実行する。

```powershell
$env:RELIABILITY_PASSES='3'
$env:RELIABILITY_IDLE_MS='2105000'
node scripts/production-reliability-browser-check.js artifacts/audio-reliability-20261014/rehearsal-revision/three-shows-idle
node scripts/analyse-reliability-captures.mjs artifacts/audio-reliability-20261014/rehearsal-revision/three-shows-idle
```

`idle-progress.json` のNode実時間・server HTTP・browser HTTP・renderer応答・Display heartbeatを分けて見る。`Runtime.evaluate`のtimeoutだけからシステム本体の停止を断定しない。物理sleep・実HDMI出音・実投影は別途記録する。

## Admin音声の診断試作

`scripts/audio-owner-ab-check.js` だけがテスト用Admin Audio Masterを注入する。Productionには読み込まれず、通常運用で使う設定もない。試作は遠隔口パクや全ライフサイクルの採用条件を満たさないので、手動でProductionへコピーしない。比較終了で試験用プロセスが閉じ、通常のDisplay Masterへ戻る。

Windowsループバック診断は `scripts/windows-loopback-capture.cs` を既存.NETのcscでコンパイルして利用する。`--probe` は既定出力、`--sessions` は各有効出力のsession/mute/volumeの読み取り。出力先／音量／ミュートの設定変更はしない。captureは出力側PCMの記録でありマイク録音ではない。保存波形には同じ出力を使う他アプリの音が混入するため、A/Bの間は他の音声試験を止める。

## 謎画像の表示優先（2026-10-15）

謎1・最終問題・停止コード問題などの画像表示中は、セリフの字幕ボックス全体を非表示にする。字幕の空判定・音声の終了通知・タイマーには依存しない。音声は従来どおり再生する。画像は画面端近くまで拡大し、`object-fit: contain`で縦横比と画像全体を保つ。画像表示を終えて通常Cueへ進むと、通常の字幕表示へ戻る。
