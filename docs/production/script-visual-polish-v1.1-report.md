# 横川AI Production visual polish v1.1 実施報告

2026-10-09。実装指示書 v1.1 を全文確認し、コード・Git・最新上演台本を読んだ後に目標を設定した。

## 確認結果と自主設定した目標（set_goal）

開始時は `master`、HEAD / origin/master とも `a433bd4b30ab9485789f7e884f03b35920ba641b`。未追跡のユーザー資料は変更・commit対象にしていない。feature は `codex/yokokawa-script-visual-polish-v1.1`。

現状ではScene再構築が最後のセリフも再現し、Displayもnull字幕でDOMを消さなかった。画面と音声009/016は別Cue、100%認証と解錠は同じ進捗文法で、復旧も途中のUIを残していた。サーバーの時限処理には未追跡のsetTimeoutがあった。

設定した目標は「a433bd4のStateStore・WebSocket配信・Display時刻ベース演出を最新台本Scene 1/6/7へ整合させ、字幕消去、009/016の取消可能な1Cue統合、全画面乱れ→紫HACK、5解達成→統合→最終問題、非％認証、複数ゲージ100%→不穏、共通ERROR、復旧UI消去→NORMALを実装する。調整済み18WAV/Profileを保全し、両解像度の実画像自己批評、tests/E2E/取消/reload/reconnect/console/network gate後にfeature push、安全なmaster統合・再検証・pushまで完了する」。create_goal APIに登録した目標で、指示書のコピーではない。

## 台本の参照

[『7号館からの脱出』上演台本](https://docs.google.com/document/d/16KxoOjIFLJXikFF_3u3LnnbjnQX8xJvZ-cPPNxkuJVo/edit)をGoogle Driveの読み取りAPIだけで取得した。Docsの変更・UI操作は一切行っていない。

確認revision: `AHj4eMQHSQoNSp9V1tmbaOGg_5sSZrsBzpsDqI2tvQm-qYGEG61B-pTVD-8fVzEXPgUKHGGxwLt_cO-qMsdW9_3RnHxxrZvaGn2hdiB8MkA`（14 tabs）。Scene 1の映像乱れ・五つの謎、Scene 6の統合・認証・緊急遮断・停止、Scene 7の復旧の劇中順序を確認した。音声manifestの既存source revisionとは役割を分け、WAVの台詞・演技・音声情報は変更していない。

## 設計と変更内容

既存Show schema v3に任意の `sequence` と `timing.speechDelayMs` を追加。sequenceは音声を含まないPresentation phaseで、StateStoreの時刻・phaseIndexが正とする。リロードやScene再構築は最終snapshotを再現する。CueSchedulerが世代番号とTimer集合を所有し、既にイベントループに入ったcallbackもcancel後には実行できない。

| 対象 | 実装・Cue統合結果 |
|---|---|
| Scene Rehearsal | prior Cueをsettled状態で再構築後、global/各DisplayのcurrentSubtitleをnullにする。Displayもnullを空字幕として描画し、空caption枠を隠す。reloadにも古いセリフを残さない。 |
| Scene 1 / P-V01 | 2.4秒の大きな水平断裂・全画面変位・色分離から紫HIJACKEDへ定着。字幕を消す。黄色になるだけの旧演出を置換。 |
| P-V02 + P-009 | canonical ID `prod-v-riddle-enter`、番号P-V02。1 NEXTで五つの謎表示→2.3秒待機→既存WAV009を一度再生。独立 `prod-009` を削除。 |
| P-011 | 5つの緑チェックが順に成立→2秒で中央へ収束→4.2秒で最終問題をreveal。4.8秒の1Cue。問題本文は創作せず、既存台詞を保持。 |
| P-012 | 大きな緑のチェック印・認証成功。％や解錠ゲージを表示しない。 |
| P-V03 | Avatar周囲にCORE/GATE01/GATE02/ARCHIVE/NETWORK/SECURITYの6ゲージ。5秒で全系統100%、0.9秒の成功の間、収束・消去後6.8秒で画面のずれと紫のAvatar残像を残す。不穏な状態で役者を待つ。 |
| P-013 / P-014 | connection-failedの赤枠・×・ERROR文法を共用。緊急遮断と連絡失敗が同じシステムのエラーに見える。 |
| P-V06 + P-016 | canonical ID `prod-v-stop-code`、番号P-V06。1 NEXTで暴走を止め、1.2秒cut＋0.7秒の間→既存WAV016を一度再生。独立 `prod-016` を削除。音声後はSHUTDOWNを維持。 |
| P-V07 | 6秒の1Cue。進捗→3.8秒で100%→4.6秒でUI消去・Avatar/preset NORMAL→温かな光が収束。reloadでもNORMAL。 |
| 取消 | STOP/REPLAY/Show Reset/Scene Rehearsalはpending音声・phase Timerを破棄。REPLAYはCueの先頭から一度。新Cueとserver shutdownでも取消。server restartはPresentation deadlineだけを再開し、過去・pending音声を再生しない。 |

主な変更ファイル:

- `src/show-schema.js`, `src/state-store.js`, `src/server.js`, 新規 `src/cue-scheduler.js`
- `public/display.html`, `public/js/display.js`, 新規 `public/css/display-production.css`
- `scripts/build-production-show.mjs`, `shows/production.json`
- `scripts/production-browser-check.js`, `scripts/phase-c-soak-test.js`（統合IDへの参照修正のみ）
- `test/phase-c-production-show.test.js`, `test/scene-rehearsal-start.test.js`, `test/scene-rehearsal-flow.test.js`, 新規 `test/script-visual-polish.test.js`
- `package-lock.json`：監査で見つかったproxy-addr 2.0.7を2.0.8へpatch。新規production依存なし。

## 実ブラウザ自己批評・修正

Chromeの実際のProduction Admin/DisplayをCDPで操作し、1920×1080と1280×720で46枚（Display42＋Admin4）のframeを保存した。HTMLMediaElement.playの時刻・回数も実測した。単なるDOM想定ではなく、実際の描画を画像ツールで見た。

最初のレビューでは謎画面のoverlayが重複し、達成ノードの装飾が干渉したため除去。720pでは解錠タイトルがAvatarの明るい顔に重なったため暗い背景板を追加し、再撮影・E2E後の画像で修正を確認した。

両解像度の判断はPASS。大きい断裂から紫状態への変化、5つの緑チェックの収束と最終問題の拡大表示、認証チェック印と6個の％円の違い、100%が消えて位置・色が異常になる余韻、赤いERROR、停止のcutと閉眼、最後のバー消去・青NORMAL復帰を確認した。観客への主要情報は大きな形と日本語で伝え、細い英文railを読まなくてもドラマを追える。停止音声は1.9秒の静寂後、009は2.3秒後に各一度だけ始まる。

画像と時刻付き状態記録はローカル `artifacts/script-visual-polish/`（`*-*.jpg`, `admin-*.png`, `visual-frame-states.json`）。Browser gateは連続して再実行しPASSした。

## 必須gate

| 確認 | 結果 |
|---|---|
| `npm run check` | PASS、148 tests / 148 pass / 0 fail |
| `npm run test:production-browser` | PASS、両解像度、46 screenshots |
| single-PC / preload / Audio Ready | PASS、18/18、音声ゲート・reload後の再準備を確認 |
| NEXT / BACK / STOP / REPLAY / BLACKOUT / RESTORE | PASS |
| Scene Rehearsal / Show Reset / merged Cue取消 | PASS、旧deadline後も音声なし、REPLAY二重再生なし |
| Display reload / server reconnect | PASS、字幕残存なし・過去音声再生なし・最終snapshot一致 |
| tuned WAV integrity | PASS、18/18、再生成・binary変更なし |
| Voice Profile integrity | PASS、`sha256:1daf31f7884c9b49649361abb66a3fb3069169c5e437ac5ffe9117de62dfeeb3` |
| `npm audit --omit=dev` | PASS、0 vulnerabilities |
| browser console warning/error | 0（RuntimeとLogのwarning/error両方を監視） |
| external browser communication | 0、Production asset requests 113 |
| diff review / `git diff --check` | PASS、WAV/Profile・ユーザー資料の差分なし |
| 30分soak | 指示に従い意図的に再実行していない。完了条件外。 |

feature commit SHAと統合後のmaster/origin-master SHA、master上での再検証結果は、この報告に対応するチャットの最終報告に記録する。履歴はfeature/masterのfast-forwardを使用し、force pushや履歴改変を行わない。

## 残存リスク

実会場のプロジェクターの明るさ・色再現、数mの客席と音響設備での最終確認は未実施。実ブラウザの大きさ・コントラスト・時間的変化から観客への意味の伝わり方を自己評価したが、実会場の照明/SEとの合わせ稽古は必要。問題本文やヒントの未提供部分は既存containerのまま、P-017は既存のdisabled方針を維持。既に運用中のpersisted Showは明示的に新版Production Showをimportする必要がある（ユーザーの運用stateを自動上書きしない）。
