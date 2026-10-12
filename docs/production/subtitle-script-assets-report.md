# Subtitle / script / asset slots v1.1 実装記録

開始HEAD/main/origin-main: `1cdc81084244ce099ad75d87ef8d7289e6661eca`。開始master/origin-master: `83539ba1043ea0f47480431a346bff38dc7e1cb3`。既存の未追跡directiveを保持し、mainの成果を基点にfeature branch `codex/yokokawa-subtitle-script-assets-v1.1`で作業。

## 確認後に設定したgoal

現行19 Cue、短文の一括表示、P-002の文分断、未実装のScene 7発話、固定slot未実装を確認してからgoalを設定した。人間待ちと既存P-V07を保持して独立P-020を追加し、既存WAVを再生成せず全字幕typewriter・1文1表示へ統一する。固定3 SFX／3画像slotをmissing-safeで完成し、1200ms NEXT・STOP・復帰安全策を維持して、tests／実Chrome両解像度／録画／integrity／diff reviewを通過後masterへ統合する。

## 最新台本と差分判定

Google Docsは読み取り専用。編集・コメント・共有／metadata変更なし。最初に全16タブ・1103段落を取得（modified `2026-10-12T10:37:15.258Z`）。作業中の更新後に再取得し、modified `2026-10-12T11:05:23.182Z`・revision `AHj4eMS-RR8TmwjrIP8Gxy2Vr0fgdshCuF7D4sf9U8Xog9jUZVR6ugk8rVJiYpgOKC5lbBUapldAi2WBXnrEpnCwT0Pkjad88kxHRrG8wiI`を記録した。全段落の本文は前回取得分と完全一致。比較基準は現在Showの2026-10-09 source metadataと実際のコード。directiveのrevision 16334を盲目的に適用していない。

| 差分 | 作業開始時 | 今回の対応 |
|---|---|---|
| Scene 5 AI集合アナウンス不要 | 本編にCueなし、反映済み | 維持。人間の集合台詞を最新技術台本へ収録 |
| Scene 6 非常停止問題周辺 | Triggerは一般的な記述、最新参照不足 | P-V05を白山のUSB挿入→問題表示へ同期。扇・光・白山の最新台詞をnoteへ。ヒントは創作しない |
| Scene 6 ERROR末尾句点 | P-013に句点あり、未反映 | displayText/scriptText/最終文subtitleのみ句点削除。spokenTextとWAVを保持 |
| Scene 7 P-V07完全復旧 | 実装済み | 100%→UI消去→NORMAL復旧まで維持 |
| Scene 7 解錠確認発話 | 独立Cue・WAVなし | P-020を追加。P-V07からの多数の人間台詞を待つ |

最終再取得のmodifiedは `2026-10-12T11:36:41.372Z`、16タブ・1104段落。revisionは `AHj4eMRyVU1SD6u_dcrceqd2j5crbwve6RSL4CjiGZH5NHkxN5i8g89Opz0YmHGRfEvl7OgB_0tazsv2xsoye_H-nEeO6WyWidHZNZHlBeM`。11:05版との差分は「白山、USBをさす。」が独立段落になったことのみ。AI台詞・Trigger条件・Cue時間軸に変更はなく、source metadataと技術台本を更新した。録画のCue内容と順序は同じ。

P-020: `prod-020`／「館内すべての扉・解錠確認」。夢野・押野・三馬の責任に関する会話後、虎谷が二人を見つめ、苦笑して静かに俯く場面でoperatorがNEXT。NORMALを維持して「館内すべての扉の解錠を確認しました」を再生する。派手な復旧animation・SFX・自動進行は追加しない。承認済み2D/Calm Profileの新WAVは約3.006秒、44.1kHz/mono/16-bit PCM。

最終本編20 Cue（19→20）。現行本編speech manifestは16→17 WAV。従来報告の承認済み基準WAV18本は全hashを保存し、新規1本との検証対象は19本。旧発話／アーカイブ・現行composed takeがあるため、物理ファイル総数と本編使用数は別。Audio preloadは17 voice＋11同梱SFX＝28。新規生成は020だけ。

## 字幕とキャンセル

全本編speechは`subtitleMode=typewriter`。短文／長文／reduced motionによるinstant分岐を廃止。空→文字単位reveal→全文。音声編集用chunkと字幕表示単位を分け、句点・感嘆符・疑問符を文境界として、長さ・画面幅による分割はしない。小数点・ellipsis・読み調整用commaは分割しない。P-002は音声chunk 3個と450ms pauseを保存し、字幕は「はい。」と後半の1文の2表示。displayへ「ヒサヤス ヒカル」等の発音調整を混ぜない。

各文のaudio timelineからreveal時間を計算し、65%の時点で全文が出て残りを読める設定。次の文の開始時にclearして空からrevealする。同じ字幕boxのCSS wrap・文字サイズを利用し、途中でbox／表示単位を交換しない。ERRORの旧alignmentで先頭文が120/150msに切られていたため、WAVを保持してsubtitleUnitsを音声波形の境界へ修正した。queryの音素durationは0だったため、それを正確な時間情報とは称していない。

generation付きrequestAnimationFrameをキャンセルする。STOP、REPLAY、BACK、Cue変更、Scene Rehearsal、Show／Production Reset、reconstruction、disconnect／runtime recoveryで旧文字追加を防ぐ。STOP時はcanonical字幕とBLACKOUT字幕cacheも消す。hiddenタブではrevealを破棄し、再表示時の古い文字burstを防ぐ。Audio preload READY表示をslot再読込snapshotが上書きする問題も修正した。

Audio Master不在で音声の受取先がない場合にも、字幕Displayへ文単位のtypewriter timelineを送る。音声queue／NEXTの動作は従来どおりで、字幕だけの経路を新しいmessage tokenと既存schedulerのキャンセルで保護する。通信testで無音時の最初と2文目の字幕イベントを確認した。

## 素材slotと担当

固定パスは [Production素材slot手順](production-asset-slots.md)。3 WAVは`public/assets/audio/production-startup.wav`、`production-hack-noise.wav`、`production-warning.wav`。3 PNGは`public/assets/visual/production-puzzle-01.png`、`production-puzzle-06.png`、`production-puzzle-07.png`。server再起動／Admin再読込で検証・反映し、Show／codeの編集不要。P-013/P-014は同じwarning slot。P-013は警告音長を既存Cue内delayへ反映し、その後にspeech。P-014の内部警告は従来どおりGO＋3.529秒。

missing/invalidは安全な代替WAV／SVGとPreflight WARNING（MISSING／INVALID）。実素材でREADY、撤去でMISSINGへ戻る。素材の存在だけでなくWAV形式・PNG構造/CRC/圧縮dataを検証する。Puzzle Presenterはcontain。縦横比自由、cropなし、broken-image iconなし。電子ロック音・扉音・長いHOSTILE警報はPA担当とし、対応する内部自動SFXを外した。同期markerと演出のCue内時間軸は保持。

## Visual自己批評と検証

実Chromeの1920×1080／1280×720で全17発話のDOM mutation traceを確認。全てに空・途中・全文があり、targetの変更は文境界のみ。長文は同じ枠で自然に2行へwrapし、overflow/cropなし。P-002のpause中も同じ文が継続する。ERRORの短文は完成前切替を修正し、統合演出の描画が約0.95秒途切れた観測を受け、85%→65%へreveal完了時点を早めて余裕を確保した。録画のP-002とP-020途中／全文frameを実見し、大きい白字幕・暗い背景で視認性を確認。実際の会場投影距離／PA音量は未測定。

slot配置には謎本文を含まない色分けfixtureを一時使用し、各canonical pathとPreflight READY・縦長/横長containを検証後に撤去した。本物の謎を作成していない。既存E2EはAdminとDisplayを同じwindowのtabで開き、背面DisplayのRAFが止まるため、検証側でDisplayを前面にした。Windows screenshot保存・owned Chrome終了の一時的raceには限定的な再試行を追加。

featureの全mandatory gate PASS：165/165 tests、Production E2E（46枚、28/28 preload、110 asset requests、unexpected browser error/warning・外部通信0）、17発話×両解像度の字幕matrix、最終critical 6発話×両解像度とhidden/cancel/reconnect/slot配置、NEXT guard 8ケース、12秒JS pause＋heartbeat喪失＋2時間clock jump等の復帰4ケース。録画は170.366667秒・1920×1080/30fps H264+AAC・20 Cue・17 speech＋8 SFX・最小gap2秒・全デコードPASS。WAV/Profile integrityとaudit脆弱性0。機械可読記録は `subtitle-script-assets-verification.json`。master検証は統合後に追記する。

runtime scheduler／reconnect architectureは維持し、35分idle・5公演は今回再実行せず、NEXT burst・freeze/reconnect/clock/BLACKOUTのtargeted regressionを用いる。

残る人間提供物は本番SE3本・謎PNG3枚・非常停止ヒント／コード。未提供でも起動・speech・Cue・録画を壊さない。新Voice Model／Profile／Avatarの採用変更なし。新規production dependencyなし。

## master統合と再検証

feature commit `a420b7e68a5bea09dcd8461950e85846891bef5b`をpushし、masterへfast-forward統合した。統合後の実ファイルで165/165 tests、Production E2E（46枚、28/28 preload、browser異常・外部通信0）、NEXT guard 8ケース、復帰4ケース、WAV/Profile、録画デコードを再検証して全PASS。feature/masterのimplementation fingerprintは同じ `7dfed2b67bf0d57a55d3e20d3512727d997531de0e77c487f2a0f01e64d1db59`。統合後の証跡は `master-e2e`／`master-hardening`、機械可読master結果はverification JSONへ収録。最終検証記録commitとorigin/master一致のSHAは最終回答に記載する。
