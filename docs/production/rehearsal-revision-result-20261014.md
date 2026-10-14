# 10/14通し稽古フィードバック：候補改訂記録

**候補実装・検証の記録。本番音響の完成／採用とは区別する。** 音声の物理的な冒頭欠けの原因・客席品質は未確定。main/masterへ統合しない。

## 基準とgoal

開始時の実HEAD／origin候補は `b0440618438bbb6398ef7831d48d112af6c0d923`、branchは `codex/production-reliability-20261014`。main/master/origin-main/origin-masterはいずれも `a90176c1e8297f49ac660d851511ad2dda723656`。実装・未コミット画像・既存189テストと過去の失敗ログを確認し、旧報告を今回の合格として扱わなかった。

正式Docsは再取得し読み取り専用で確認、modified time `2026-10-14T12:52:52.896Z`（JST 21:52:52）。共有原本の書き込み・コメントなし。manifestの元合成revisionを偽装せず、`sourceScript.latestReview`へ今回の確認時刻とP-020指示差分を別記した。

実際の確認後に設定したgoal：完了通知が失われると`nextBlock`が永久化する実装を終了待ちから分離し、1500ms／actionId／真のAudio READYで進行を守る。旧音声・字幕・遅延Cueを安全に取消す「指定Cueを次にGO」を追加。20 Cue／17発話と承認Profileを保ち、P-020だけ正しい新WAVにする。ユーザーの実謎画像をcontain最大化する。Display/Admin・OS出力・描画を分離計測し、証拠のない再生方式変更／固定ラグを入れない。通常検証後にidleと3公演を観測し、未検証の物理出音をPASSにせず候補だけ保存する。

実装commit：`a450435`、開始前clock確認の小修正：`5eca13b`。続く診断・運用記録commitのSHAは最終報告／Git logを参照。

## 原因と実装

### NEXTの進行不能

旧serverは`speech/SE completed`と有限演出／字幕の診断結果を通常NEXTの必須条件にしていた。通知欠落・errorが残ると音が終わっていてもロックが外れなかった。今回、**診断結果をNEXTロックから切り離した**。1500msの連打保護はAdminとserverのmonotonic clock双方で保証し、actionId二重送信も拒否。拒否した操作は後で実行しない。

真のNOT READYと開始前nonce確認は維持。開始前確認は3.5秒でtimeoutし、古い応答を採用しない。READY復帰自体で旧発話は再開しない。NEXT受理後は旧transport・SE・字幕・queue・遅延presentationを取消して新Cueを開始する。STOP／BLACKOUTの即応性を維持。BLACKOUTは従来の映像遮断であり、消音はSTOPを併用する。

### 緊急Cue移動

Show上部に二段階の確認を置いた。選択Cueを`currentIndex = targetIndex - 1`の待機位置へ置き、次のNEXTが**対象Cueそのもの**を実行する。移動では発話・SEを再生しない。現在位置の変化・切断で古い確認を無効化し、serverもexpectedIndexを検査。飛ばした位置と次のGOを表示する。BLACKOUTを維持し、過去Cueの自動補完はしない。

### P-020と字幕／台本

- 発声「館内すべての安全を確認しました」、表示「館内すべての安全を確認しました。」。P-V07後の人間台詞を待つ独立GOを維持。
- 新WAV `public/assets/audio/production-rehearsal-020-safety.wav`、2.599932秒、44100Hz／mono／16bit、229358 bytes。
- SHA256 `68e642fd566c306a3f4404f5cb1cdb11120f9c41c2d2c5cfe5f94d91c74d3a66`。
- 同じengineの発音queryは `カンナイ｜スベテノ｜アンゼンオ｜カクニンシマシタ`。確認用queryのみを取得し、WAVを再生成／再生していない。物理的な聞き取り判定とは区別する。
- 阿井田 茂／Calmの承認済みProfile・全採用パラメータを保持。旧020 WAVを保存し、他16発話のactive WAV・全17旧WAV・Profile hashは変更なし。`prod-voice-020-unlock-confirmed`は既存参照を壊さないためのstable IDであり、新しい内容と専用pathへ更新済み。
- 全AI字幕typewriter、一文一表示、文末「。」、P-001の「承知しました、横川教授。」、既採用の文間短縮、復旧SE optional slotを維持。
- 正式Docsには旧「館内すべての扉の解錠を確認しました」が残る。今回の指示差分を開発へ反映したが、原本は変更していない。台本担当・舞台監督側の文言合わせが必要。ローカル技術台本では現行P-020注記を更新し、10/12原文全1104段落は消さず監査を維持した。

### 実謎画像と自己批評

謎1／6／7を画面の98.8%に相当する枠へ拡大。内側は各2pxのborder/padding、object-fit containで比率保持・cropなし。字幕は必要な間だけ画像上へoverlayし、発話終了後に消去する。追加試験で「canonical字幕はnullなのにDisplay側に旧字幕が残る」を見つけ、明示的な消去通知を修正した。

1920×1080の枠は約1897×1067px、1280×720は約1265×711px。実画像を両解像度で6画面確認。大きな問題名・図表は明確、画像内の細字は実投影距離／明るさの確認が必要。7・201での視認性は未検証。余白ゼロのための切り抜きはしていない。

Admin確認画面が下に埋もれる自己批評を受け、緊急移動をShow上部へ変更。再スクリーンショットで現在→次GO→確定が同じ枠で読めることを確認した。

## 音声：OSと物理出音を分離した結果

最初のWASAPI試行は6ケース中5ケースでpacketなし。別のWindows SoundPlayerによる同じ020のself-testではpacketを取得できた。出力sessionを読み取り監査すると、**Windows既定はBluetoothヘッドホン、試験ChromeのsessionはPHL 272E2F（Display Audio）**だった。既定出力だけをcaptureしてもChromeの測定にならない理由を特定し、Chrome sessionの実endpointを指定して再計測した。OS出力先・mute・volume設定を変更していない。

最終A/Bは別の音声試験を止め、同じPC・Chrome・WAV・PHL endpointを使用。fresh profileのDisplay Masterと、Adminページへ試験専用engine／唯一のMasterを注入した試作を比較。ProductionへAdmin再生機能を組み込んでいない。

| Cue | Display：GO→Buffer開始 | Admin試作：GO→Buffer開始 | 注意 |
|---|---:|---:|---|
| P-020 | 52ms | 158ms | 各profile最初の発声。OS capture自体がendpointを開く |
| P-001 | 2636ms | 2692ms | 起動SEと既定のCue内待ち時間を含む |
| P-003 | 50ms | 44ms | 6ms差は優位性の根拠にならない |

各試行でvoice sourceは一系統のみ。ループバック6ケースすべてで先頭500msを100ms窓に分け、発声エネルギーのある窓が完全にゼロになる欠落は0。最初のpacket以降のDATA_DISCONTINUITY／TIMESTAMP_ERRORは0。位相波形相関は4ケースで0.8755〜1.000、Display020とAdmin003は0.515／0.611で**波形全体の一致判定は保留**。後二者もエネルギー窓には発声があるが、冒頭全PCMの完全一致とは言わない。

このA/B数値はa450435相当のclock確認処理で取得。5eca13bは両方式で共通のengineの確認処理を小修正しているが、最終版の物理A/Bは未再実施。Admin採用を裏付ける新たな物理的優位性が得られたわけではない。

これは**Windows mixer後・スピーカー前**の観測。captureを開くこと自体が機器を起こす可能性があり、無介入の冷間出音、HDMI受信機・スピーカーの立ち上がり、マイクでの「館内」の可聴確認を証明しない。稽古時の物理冒頭欠けの根因は未確定。根拠のない先頭無音追加・固定wait・Profile変更は採用していない。

**採用判断：Display Audio Masterを維持。** Admin試作に速度の明確な優位性はなく、遠隔口パク・復旧・全公演を含む本番採用条件も未達。物理出音の優位性がないまま移行しない。診断の終了で試験プロセスを閉じ、Production既定を変えていない。

### 待機後の約1秒遅延を追加発見し修正

`a450435`の35分後P-011は内部音声を最後まで再生できたが、GO→Buffer開始は**1022.6ms**で、通常約37〜42msより遅かった。終了だけで合格にせず確認したところ、開始前clock確認が`setTimeout(poll,16)`へ依存していた。[Chrome公式のtimer throttling説明](https://developer.chrome.com/blog/timer-throttling-in-chrome-88) と整合する仮説として、非表示／無音時のtimer集約を調べた。

実Windowsのminimize状態と`document.hidden`が一致せず、実非表示再現は未検証。そこで**16msの確認timerだけ1000msへ遅らせるproxy**で比較し、旧処理の約1000〜1015msの遅延を再現した。音声・Cue・その他のtimer・autoplay policyは変更していない。

`5eca13b`ではこの短い確認だけをMessageChannelのtaskへ変更。最大1秒のclock停止判定・世代取消し・port解放を保ち、Cueの時間軸や再接続構造は変更していない。同じproxyで新処理は3回**17.1／5.6／12.3ms**、発話sourceを作らず確認できた。`verified` logへ`preparationMs`／`clockProbeMs`を追加した。実server→Display→P-020のGOにも同じproxyを入れ、500ms以内の開始を追加回帰で確認している。

これは開始前確認のtimer依存へのソフトウェア修正で、物理的な冒頭欠けを解決したという意味ではない。**35分試験はa450435で実施し、5eca13b後の35分は未再実施**。新処理は単独engine proxy、実GO proxy、STOP取消し、通常E2E・録画・連続公演で別途検証する。

WASAPI診断のAPIは [Microsoft GetBuffer](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudiocaptureclient-getbuffer)、[GetSessionEnumerator](https://learn.microsoft.com/en-us/windows/win32/api/audiopolicy/nf-audiopolicy-iaudiosessionmanager2-getsessionenumerator)、[GetMute](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-isimpleaudiovolume-getmute) を参照。ヘルパーは診断専用、production依存追加なし。

## 初回HACK

通常通しの初回P-004で最大350msのrAF間隔を観測。他の直前P-001〜003は最大33.3／18.2／17.3ms。別の冷間／再演試行では初回450ms、再演66.8／66.5msで、初回描画コストの差を再現した。初回の54ms long taskはGO直後で、約17秒後のHACKと時刻が異なるため、JavaScriptのそのtaskだけではHACK時の停止を説明できない。

transform/filter/clip-pathの合成準備を試験ページだけに注入した案では冷間383msまでしか下がらず、warm2ケースはrAF sampleなしで無効。**改善の採用証拠は不足**。最終診断scriptは可視状態とsampleなしのUNVERIFIEDを明示するよう修正。GPU／raster／compositorの初回負荷が候補だが、traceで根因まで断定していない。ProductionのHACK演出・CSSを変更せず、初回の引っかかりを残存課題とする。

追加の可視cold traceでも最大300msのrAF間隔を記録。HACK前後にJavaScript long taskなし、`GpuChannel::ExecuteDeferredRequest`最大99.558ms、`RasterDecoderImpl::DoEndRasterCHROMIUM::Flush`最大68.285msを観測した。JSデコードやserver受理待ちとは別のGPU raster／flush負荷を示す証拠だが、trace overheadもあり、各イベントの時間を単純合計して300msの全原因と断定しない。trace／集計は `hack-trace/trace.json` と `hack-trace/analysis.json`。

## 検証記録

| 項目 | 結果・範囲 |
|---|---|
| Syntax＋automated | 最終`npm.cmd run check`、193/193 PASS（旧189＋追加4）。並行試行で既存WebSocket testのtimeoutを1回記録し、timeoutを緩めずserial全193と単独check全193で再確認 |
| Production E2E | PASS、46画面、1920×1080／1280×720、Scene Rehearsal、reload/reconnect、STOP／BLACKOUT／REPLAY／Reset、外部browser request0／console error0 |
| 追加実操作 | 最終12ケースPASS。ended通知を捨てたNEXT、旧音声・起動delay取消し、二段階移動／無音待機／対象そのものGO、stale確認拒否、BLACKOUT保持、実謎6画面、実GOのclock timer proxy |
| 最終録画 | 5eca13bで1920×1080／30fps、177.1秒、20 Cue／17発話＋4SE、完了後最小1.999秒で次Cue、全デコードPASS。Cue ID｜説明付き。最終問題／NORMAL復旧／新020の画面を再目視 |
| WAV／Profile | 旧17WAV保存、active16WAV不変、新020 hash一致、Profile不変、20 Cue順序保持 |
| OS比較 | 上記6クリップ。物理音響のPASSではない |
| a450435の35分超idle | 2105.0417584秒（35分5秒）、自動音声0、renderer／HTTP応答失敗0。次の最初のP-011が1回発話し完了。210回のrenderer観測。ただし約1秒の開始遅延を発見し後から修正。自然な開始・物理出音の総合PASSではない |
| a450435の3公演 | 全60 Cue／63 sourceの完了と内部音声照合PASS。1公演目Scene 1後に上記idleを挟んだ同一Chromeでの連続運転 |
| a450435のデジタル音声 | 全63 clip PASS、10ms RMS照合、energy cosine最低0.973468、想定外低エネルギー最大10ms（30ms以上なし）。35分後の最初のP-011はonset原音・記録とも200ms、cosine0.991190。OS／スピーカー前、細かなクリックや物理音の保証ではない |
| 最終5eca13bの3公演 | idleなしで全60 Cue／63 source PASS、内部63 clipもPASS。cosine最低0.973468／想定外低エネルギー最大10ms。P-011のGO→Buffer開始23.8／17.2／32.1ms。通常のclock確認は最大21.8ms |
| 最終障害回帰 | 16ケース中14 PASS／native可視性2 UNVERIFIED。Context suspend/recreate、REPLAY、12秒JS/heartbeat停止のsleep proxy、WS再接続、clock jump、WAV通信遮断、破損decode、BLACKOUT、reload、Reset5回、NEXT8連打、clock停止proxyでのSTOPを確認。全体判定はSOFTWARE CORE PASS／window PARTIAL／HDMI acoustic NOT VERIFIED |
| 実HDMI・客席マイク・実投影 | 未検証。音響の本番採用判定を保留 |

失敗試行もprivate artifactへ保存。画像判定の前Cue DOM／load待ち不足、server受理直後でDisplayのended取消し通知をまだ受け取っていない検査器の競合を直し、正しい状態を待った再試行を合格にした。試験中断やsampleなしを合格に含めない。A/Bと別音声試験の重なった予備試行は最終比較から除外した。

idleの範囲は**対象Showが35分5秒、操作・自動音声なしで待機したソフトウェア試験**。前半には別の隔離Chromeによる音声比較／E2E／描画診断を実行し、その後停止した。したがってOS／スピーカーが35分間ずっと無音だったcold試験ではない。CDP接続と10秒ごとの観測もある。無計測・本番機器の35分cold出音へ結果を外挿しない。従来のRuntime.evaluate timeoutは今回210回のrenderer観測では再現しなかったが、過去の所在を確定したものでもない。

a450435公演終了時resource（強制GCなし）：JS heap `1,721,520 → 2,149,240 → 2,440,548 bytes`、DOM nodes `475 → 519 → 445`、listeners `35 → 43 → 17`、decoded PCMは全公演`22,439,704 bytes`、終了時active sourceはすべて0。DOMの回収は観測したが、この3公演だけで無制限の連続運転にリークがないとは保証しない。

最終5eca13bではJS heap `1,545,804 → 1,706,348 → 1,697,280 bytes`、DOM nodes `874 → 861 → 643`、listeners `19 → 20 → 18`、decoded PCM `22,439,704 bytes`固定、active sourceは各公演末0。通常3公演のsource fingerprintは `7f0bd346e167e314de21d895d055196da18a5c828a8458de38bd586be6c79258` で開始／終了一致。可視Chrome、autoplay bypassなし。長時間driverのwindow viewportは1324×805で、1920×1080／1280×720は別のE2E・実素材レビュー・録画で検証した。

追加clock停止proxyでは、serverのSTOP処理を33.7ms、DisplayへのSTOP到達を4.8msで観測。probeは取消され、旧Cue・音声の遅れ再生なし。実Windows sleep／HDMI抜き差しとは区別する。実minimizeはwindow boundsとdocument.hiddenが不一致、backgroundはhiddenを観測したがforeground復帰を確認できず、2ケースをUNVERIFIEDとした。focusを偽装したりautoplay policyを無効化して合格にしていない。最初のa450435試行と途中のfocus検査停止は失敗記録として残した。

## 証跡・保全

private artifact root：`artifacts/audio-reliability-20261014/rehearsal-revision/`（録画・生波形・詳細ログはGitに含めない）。最終版は `recording-clock-final/review.html`、`recording-clock-final/production-display-1920x1080.mp4`、`targeted-clock-proxy-final/summary.json`、`e2e-clock-final/`、`three-shows-clock-final/`。調査は `audio-ab-final/analysis.json`、`background-clock-proxy-after/results.json`、`hack-render/results.json`、`hack-trace/`。35分試験は `three-shows-idle/`（a450435）を参照。

主要な数値・hash・scopeは同梱の `rehearsal-revision-evidence-20261014.json` にも保存。正式Docsのmodified timeは作業後のmetadata再取得でも変更なし。Google原本への更新は行っていない。

実謎PNG3ファイルは作業開始時のSHA256を保全。未コミットのユーザー差し替え素材を変更／stageしていない。録画と実素材レビューはそのローカル差し替えを使用している。commitだけを別PCへ取得してもこの未コミット素材は移らないので、素材配布は別途必要。

## 未解決と採用条件

物理的な冒頭欠け・出音遅延／実投影・初回HACK停止の根因を未解決として残す。ソフトウェアPASSだけで完成・本番採用と言わない。本番と同じ出力先で、試験再生によるwarming前の初回と35分後を客席録音し、内部PCM／OSと比較する必要がある。操作の最短手順は [現行運用](./rehearsal-revision-operation-20261014.md)。
