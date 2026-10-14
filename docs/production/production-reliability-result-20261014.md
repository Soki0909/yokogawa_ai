# 本番安定化候補の仮完了記録（2026-10-14）

**仮完了。本番音響の合格ではない。** ユーザー指定で35分実試験を仮完了条件から除外。HDMI環境は用意できず未検証。main/masterは基準a90176cのまま保持し、候補ブランチ `codex/production-reliability-20261014` だけを保存する。

## 調査・goal

開始時に実Git状態・全ブランチ・過去記録・実コード・同梱Showを確認。Docsは読み取り専用、modified `2026-10-14T06:06:16.917Z`。178 testsの過去報告を現状の音響合格としなかった。

設定goalは、実デコードPCMの再利用、出力clockの検証、開始前Master応答、実endedと有限演出を待つNEXTを実装し、20 Cue/17発話・原音/Profile・緊急取消しを保持して、通常検証と実時間idleを段階実施すること。HDMI unavailableを明記して本番ブランチへの未検証統合を避けることも含めた。35分は後からユーザー指示で除外。

旧経路ではContext suspended/clock0でもspeaking/playingが届いた実Chrome反例を取得。旧fetch準備のbytes破棄、本再生のnew Audio、onplay後graph接続、1200msのみのNEXT保護を確認した。外部HDMI装置・ドライバの障害原因まで特定したものではない。

## 変更

- 全WAVを実デコード、同じAudioBufferを本再生に使用。graph接続後にstart。GO時fetch/decode/resumeなし。
- READYは実PCMとContext clock進行も確認。停止・準備失敗はNOT READY。無音clockは正確な0で、テスト発話のwarmingなし。
- Master nonce確認後にCueを開始。実音声/SE ended、字幕と有限演出が終わるまでserver/canonical/AdminのNEXTを拒否。1200ms guard維持、拒否操作の後実行なし。
- ブラウザ報告出力latencyに映像・字幕・口パクを整列。物理HDMI遅延は未測定。
- BLACKOUT後に古い遅延visualが戻る競合、Reset後に古いverify失敗がREADYを下げる競合を発見・修正し回帰を追加。
- 20 Cue/17発話を保持。P-001は「承知しました、横川教授。」一表示。全文typewriter・一文一表示、表示省略点除去/文末「。」、読みは保持。
- P-003文間350/450ms、P-004 450ms、P-011 450/650msを候補化。既存segment PCMによる新規3 WAVのみ。元17 WAVとProfileはhash不変。P-V06 850ms保持。
- P-V07 optional SE予約先 `public/assets/audio/production-recovery.wav`、4600ms/0.8。現在MISSINGをPreflightで明示、代替音なし。P-020は独立のまま。

## 検証結果

| 検証 | 結果と範囲 |
|---|---|
| automated | 189/189 PASS。起動負荷のある試行は失敗ログを残し、単独再実行。timeout緩和なし |
| Production E2E | PASS、1920×1080/1280×720、46画面、Scene Rehearsal、reload/reconnect、緊急操作。最終verify取消し修正は追加unitとtargetedで再検証 |
| 文間・警告音・編集 | 6ケースPASS。警告音実ended後発話、STOP、文間編集/試聴/保存/reload/export |
| NEXT連打 | 8ケースPASS。キーrepeat・raw server・再接続・即STOP |
| 通常全編・連続運転 | 同じChromeでidleなし3公演、全60 Cue/63 source完了。音声/SEが未完了のNEXTを拒否。人間の芝居間は2秒へ縮約 |
| 障害回帰 | 最終試行15 PASS。最小化はwindowState=minimized/document.hidden=trueが一致、backgroundもhiddenを実測。Context、12秒JS/heartbeat proxy、再接続、clock jump、decode失敗、reload、Reset5回等。実Windows/HDMI sleep・出力先切替は未検証 |
| デジタル音声 | 3公演63 clip照合PASS。10ms RMS、30ms以上の想定外低エネルギーなし。最大10ms、最小energy cosine約0.9735。OS/HDMI前の記録で、クリックや客席の音切れを保証しない |
| 最終録画 | 1920×1080/30fps、177.9秒、20 Cue、17発話+4SE、Cue完了から最小1.999秒でNEXT、全デコードPASS。Cue ID｜説明を維持 |
| integrity | 20 Cue順序、17元WAV、発声テキスト、Profile不変。3文間WAVは既存segmentと合成hash一致 |
| 35分idle | **未完了／PASSではない**。idle中のRuntime.evaluate timeout、原因未特定。最後の成功計測は約20秒で、総idle時間の確定値ではない。ユーザー指示で今回の仮完了を妨げない |
| HDMI・客席 | **未検証**。物理onset/dropout/映像同期値なし |

検査器の旧DOM観測と入力未到達も修正し、失敗試行を合格から除外した。最小化/background後reloadの複合可視復帰は保証できず、個別ケースへ分離して検証。以前の試行では最小化hidden不一致をUNVERIFIEDとして記録し、最終試行では一致を確認。

3公演終了時のinstrumented JS heapは1,987,248→1,769,304→1,885,032bytes、DOM nodesは881→700→621、実デコードPCMは22,517,724bytesで一定、Contextは各回running/active source0。heapはnative PCM/GPUを含まず、検査hookを含む。長時間のleak不存在を保証しない。

## 自己批評・運用

ブラウザUIと録画フレームで字幕・HACK・統合・復旧を確認。P-001起動音はGOから約467ms（既存400ms指定込み）のソフトウェア観測。約76msのブラウザ報告出力leadを使用。どちらも物理出音時刻ではない。

初回HACK付近に約583msのrAF間隔を観測し、ラグ解消とは扱っていない。字幕/色/形は画面上で判別できるが、客席可読性・瞬間的なカクつき・文間の演技判断は本番音響/投影で残る。CSS演出・Avatarは変更していない。

最終3公演ではHACKの最大rAF間隔が1回目約316.6ms、2回目50ms、3回目は途中backgroundで描画frame記録なし。3公演の音声/進行完了を、全演出の3回の可視投影合格に読み替えない。通常visual E2Eと録画の画面確認を別証拠とする。録画は生成時点の素材で、後続の画像差替えは含まない。

運用は「実デコード20/20 → Audio有効化 → 出力READYとMaster確認 → 明示NEXT」。異常時はSTOP、再準備後に舞台進行を見て明示REPLAY/選択Cue。BLACKOUT単体は従来の映像遮断であり、無音化にはSTOPも使用。詳細は [運用手順](./production-reliability-operation-20261014.md)。

ローカル検証ログ・動画は `artifacts/audio-reliability-20261014/` に保存しGit対象外。作業中に検出した謎1/6/7 PNGの別変更と既存未追跡資料はこのcommitへ混ぜず保全した。
