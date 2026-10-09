# Runtime Hardening v1.0 検証記録

基準: master a845baad9161941b2d675c43f251f6ea81b8a418。Google Docs「7号館からの脱出」更新 2026-10-09T11:28:22.972Z、読み取り専用で全Scene確認。作業後も同時刻。Google Docsへの書き込み・操作なし。

## 確認後に設定したgoal

全20隣接境界を監査し、人間の台詞・観客操作・不定時間の移動を維持する。固定連続演出2境界を統合し、canonical NEXTを1200msのmonotonic受付間隔で保護する。STOPを即応させ、復帰時の過去音声/SFX/字幕/callbackを破棄する。通常gateを通過した同一実装で、台本推定以上の35分実時間idle、障害proxy、5公演、Reset耐久とresource観測を完了してmasterへ統合する。

## 実装と境界

- NEXT: 1200ms。UIとStateStore/serverで保証。別actionId・別Admin接続でも同じcanonical受付時刻を使う。単調時計を使用し、拒否は保存・queue・後送しない。target不成立は進行前に検出する。
- STOP/BLACKOUT/CLEAR: NEXT保護と通常650ms操作lockから独立。実ブラウザの保護中STOPは500ms未満をassert。
- P-004+P-V01: 説明WAV末尾+200msで映像乱れ→紫HACK。LX/施錠SE markerを保持。次の調査芝居は手動。
- P-012+P-V03: 認証WAV・電子音末尾+200msから6ゲージ→100%→崩れ→異常。認証と解錠を別effectに保つ。告白等を待つP-013は手動。
- 21→19 Cue。全20境界はMERGE 2、KEEP 18。詳細はruntime-hardening-boundaries.md。曖昧で今回統合を保留した境界0。既存P-V02+009、P-V06+016、P-V07内のNORMAL復旧も維持。
- freeze/時計異常はcallback実行直前とwatchdogで検出。切断・復帰ではpending演出をcancelしstable最終stateへ復元。Displayはrecovery ACKまでqueued再生イベントを破棄する。次Cueはoperatorの明示NEXT。
- Production WAV/Profileは変更・再生成なし。録画ツールは当該testがspawnしたChrome process treeを終了し、temp dictionary lockを解消する。新規production dependencyなし。

## 通常gate（長時間試験より先にPASS）

- npm run check: 159/159 PASS。
- Production Browser E2E: PASS、1920×1080/1280×720、46 screenshots、27/27 preload、106 asset requests、Scene Rehearsal/reload/reconnect、STOP/REPLAY/Reset中のstale callbackなし。
- NEXT guard browser: double/triple/5連打、Space repeat、CDPの実Enter repeat、mouse+keyboard、別ID raw WebSocket、再接続burst、保護中STOPの8ケースPASS。
- WAV:18/18、Profile hash 1daf31f7884c9b49649361abb66a3fb3069169c5e437ac5ffe9117de62dfeeb3維持。
- npm audit --omit=dev: 脆弱性0。通常console warning/error0、external browser requests0。
- 1920×1080/30fps H264+AAC録画: 165.066667秒、19 Cue、16 speech+12 SFX、全デコードPASS、最小完了後gap2秒。artifacts/recordings/runtime-hardening-final。
- implementation fingerprint:905ca4b22d8c52e4e0c39a3ded2017534ee27c885f827d963c1aebbd303c5fe5。通常PASS記録を照合しないと長時間commandは開始しない。

## Visual自己批評

1920/720の実Chrome screenshotsと録画抽出frameを自分で確認した。説明字幕の後に画面tear・色ずれ・紫HACKへ移り、単なる黄色切替ではない。認証は短い認証状態、解錠はAvatar周囲の大きい6ゲージで区別できる。進捗の100%の後にゲージ消失・崩れと異常状態が続き、観客に成功と思わせた後の逆転を保つ。場内投影距離そのものの実測はしていないが、状態色・大見出し・ゲージは低解像度でも読める。Adminでは現在/次Cueと舞台のGO条件を確認した。

## 本番時間モデル

並行routeの最長はScene2〜5の4×4分15秒=17分。移動・謎解き・集合の8分を加え25分を本番相当と見積もり、35分の実時間idleを採用する。実際の稽古計測ではなく台本からの推定。最初のScene1は約10分の時間軸、残り4公演はtargeted idleを用いる。Windows全体をsleepさせると検証・作業も停止するため、Chrome freeze+AudioContext suspend+heartbeat喪失/reconnect+2時間時計jumpの安全proxyを使用する。物理sleep/HDMI・音響装置の復帰はproxy検証と区別する。



## 長時間・障害・複数公演結果

全mandatory gate PASS。通常159 tests/E2E/録画PASSの版で、Scene1の10分時間軸と35分00.287秒の実時間idleを実行した。hidden/focusなし、Cue位置9・HTMLAudio再生回数13のまま、全70 idle samplesでCue timer/AudioContext 0。並行routeの17分＋8分の余裕を超える実放置である。

背景のChromeではheartbeatが間引かれOFFLINE/Audio Ready解除になる。進行を止める安全な状態として扱い、前面復帰後にONLINE/Audio Readyを確認する。初回driverは背景のままReadyをassertして停止したため、保存stable checkpointからserver/browser再起動を挟んでScene6/7へ継続した。検証全体は分割実行であり、1つの連続processで35分＋5公演を通したとは主張しない。

5公演がNORMAL復旧まで完了。各回Scene6最初の発話はplayingTime<0.12秒、volume1をassertし、冒頭欠け・無音・古い音声の再開なし。5公演目の保存traceはplayingTime 0秒。Production Reset要求28回、起動delay/発話/統合timeline/解錠/全停止の途中でもpending Cue timer/audio contextを解放。reload/reconnect、2時間Date.now jumpと復元、同じCue位置での明示saved-mode server再起動、NEXT連打、1280/1024/1920 resize PASS。

前面tabのlifecycle freezeは実際にJSを停止しない場合があった。旧lifecycle-only probeはOBSERVATION扱いでsleep合格根拠から外した。最終proxyはhidden Display＋AudioContext suspend＋Debugger.pause 12秒で、実heartbeat喪失をassertした。queued speech/SFX、BLACKOUT中の発話、pending全停止speechを破棄し、復帰時に再生せずstable stateへ戻ることを確認した。Debugger pauseとlifecycle freezeの併用でCDP命令が停止した試験装置は終了し、単独の確実なpauseと20秒protocol timeoutへ修正した。

最後のdiff reviewでBLACKOUT restore cacheの旧字幕を発見し、復帰時にcache字幕も消す1行を追加した。最終160 tests、Production E2E、NEXT guard、BLACKOUT＋12秒JS pause＋RESTORE、障害/Reset/再起動critical regression PASS。35分/5公演の観測版と最終版の差分がこの1行だけであることを全9 implementation filesのhashで検証し、観測経路でcacheが存在しないことを確認した。35分を修正後に再実行したとは主張しない。変更の影響を受けるcache経路を実ブラウザで再試験した。

最終fingerprint: eaa41154fdfbe95433a46ceedc3187cd39f5090800719cc3113f8edde5d03fe7。観測fingerprint:905ca4b22d8c52e4e0c39a3ded2017534ee27c885f827d963c1aebbd303c5fe5。対応する機械可読結果はruntime-hardening-verification.json、詳細ログ/traceはartifacts/runtime-hardening。

## Resource推移

値はMB。Chrome RSSはroot processでありbrowser全process合計ではない。Display heapは各Reset後にGCして観測した。

| 公演後Reset | Server heap | Server RSS | Display heap | Chrome root RSS | timer/context | socket/handle | DOM node/listener |
|---|---:|---:|---:|---:|---|---|---|
| 1 | 15.43 | 65.28 | 0.97 | 177.6 | 0/0 | 3/5 | 362/8 |
| 2 | 14.38 | 69.88 | 0.98 | 196.31 | 0/0 | 3/5 | 362/8 |
| 3 | 14.9 | 70.88 | 0.98 | 197.62 | 0/0 | 3/5 | 362/8 |
| 4 | 15.6 | 71.85 | 0.98 | 198.33 | 0/0 | 3/5 | 362/8 |
| 5 | 18.74 | 75.29 | 0.98 | 198.21 | 0/0 | 3/5 | 362/8 |

Server RSSは約65→75MB、heapは約14〜19MB。Chrome root RSSはwarmup後約198MBで頭打ち、Display heap/DOM/listenerは一定。5回の範囲で無限増加を示す挙動なし。CPUは5公演のServer累計user10.703秒＋system3.937秒。長時間idleのServer heapは約12〜22MBの範囲で回収を伴った。

## 発見・修正と制約

実装修正: 切断時のqueue解除、heartbeat復帰時のReady再通知、clock jump直後のcallback破棄、復帰ACK前のqueuedイベント破棄、BLACKOUT restore cacheの旧字幕消去。録画後のChrome子processがdictionaryを保持する問題も当該testのprocess tree終了で解消。試験条件の修正: 実再生時にheadless Displayを前面化、背景のReady判定を復帰後へ変更、確実なJS pause採用。

通常browserの新規console warning/errorと外部通信0。障害注入で意図的にserverを停止した期間のWebSocket接続拒否2件は保存し、unexpected errorsと区別した。

実Windows sleep、物理minimize/fullscreen/HDMI切断・20m HDMI・会場音響/投影の復帰は未実測。headlessのhidden/focus喪失・resizeとJS/AudioContext/heartbeat/clockのproxyを用いた。未提供の謎画像3枠・停止コード○○・本人Avatar referenceの最終決定は従来どおり保留。新Voice Model採用も変更なし。

Git: codex/yokokawa-runtime-hardening-v1でcommitし、masterへfast-forward統合。同一implementation fingerprintでmasterの160 tests/Production E2E/NEXT guard/障害proxy/WAV/Profile/録画verifyを再検証してpushする。最終SHAとorigin/master一致は作業完了時の報告に記載する。
