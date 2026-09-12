# Phase 2 受け入れ検証記録

最終更新: 2026-09-12
基準版: `v0.1.0`（Phase 1完成版）

## 検証環境とコマンド

- Windows / Node.js v22.15.0
- `npm test`: 16テスト成功、失敗0
- `npm run check`: サーバー・State/Storage/Network・Admin/Display/Socket/TTS構文確認＋16テスト成功
- `npm run test:soak` 高頻度短縮版: 0.05分、28イベント成功、失敗0、再接続1、Offline検知1、Master変更1、RSS増加3,063,808 bytes、異常終了なし
- `npm run test:soak` 規定版: Display接続完了後30分、895イベント成功、失敗0、再接続1、Offline検知1、Master変更1、RSS増加1,232,896 bytes、異常終了なし
- LAN NIC疎通: `HOST=0.0.0.0 PORT=3011` で起動し、`192.168.11.5:3011` のAdmin/DisplayがともにHTTP 200
- Browser TTS: in-app Chromium実ブラウザでAudio Masterの発話完了と非Masterの `SUBTITLE OUTPUT` を確認
- Phase 1の既存10テストを変更前・変更後に実行し、双方で成功

## 自動・疑似マルチ端末試験

実WebSocket接続を使い、Admin 1＋Display 3を別Clientとして起動した。Display IDは `display-a` / `display-b` / `display-c`、Heartbeat timeoutは試験用に900msへ短縮した。

| Scenario | 結果 | 検証方法・根拠 | 制約 |
|---|:---:|---|---|
| A 従来の1台完結 | PASS | Phase 1 `server-flow.test.js`、Free Speak/字幕/TTS通知/STOP/Replay/履歴/再接続 | 実音量は会場確認 |
| B AdminとDisplay分離 | PASS | AdminとDisplayを別WebSocket Clientとして接続、配信元host由来のWS URLを静的検査 | 物理別PCは会場確認 |
| C Server/Admin/Display分離 | PASS | 子Process Server＋独立Admin/Display Client、Admin再接続時State Sync | 同上 |
| D Display 3台 | PASS | 3 ID同時ONLINE、Broadcastを3台で受信、1台切断後も他2台継続 | 台数上限は固定なし |
| E 個別Display | PASS | Display Bだけ受信、A/Cは250ms否定検証、履歴target確認 | — |
| F Audio Master | PASS | Aのみ `shouldSpeak=true`、B/C=false。C変更後はCだけtrue | 実音は実ブラウザでも確認 |
| G Master切断 | PASS | Master IDを保持してOFFLINE、A/B字幕継続、手動でAへ変更 | 自動切替なし |
| H Display瞬断・復帰 | PASS | OFFLINE→同一ID再接続→ONLINE、字幕復元、speak非再送 | — |
| I Admin切断・復帰 | PASS | Display接続を維持し、再接続Adminへ3 DisplayとCurrent Cueを同期 | — |
| J Cue基本進行 | PASS | 6 CueでNEXT/BACK/REPLAY/直接Cue 003/disabled/編集/並び替え/再読込復元 | Cue UIは実ブラウザ目視 |
| K Cue中Free Speak | PASS | Cue 003中にFree Speak後もCue 003、次のNEXTでCue 004 | 履歴sourceも確認 |
| L Show Reset | PASS | Scene/Cue/queue/subtitleを初期化しCue/Display/設定/履歴を保持 | 実ブラウザで確認ダイアログ表示 |
| M Cue中Display切断 | PASS | Master以外の切断は他Displayとキューへ波及せず、Master切断は安全にエラー終了 | — |
| N 接続ストレス | PASS | 同一IDを20回接続/切断し登録1件、同一ID二重接続は新接続へ置換 | 異常終了なし |
| O インターネットなし想定 | PASS | public全ファイルの外部URL否定検査、全試験をlocalhostのみで実行 | 物理回線断は会場確認 |
| P Render阻害なし | PASS | PORT/HOST、ws/wss選択、OS非依存path、`JsonFileStorage`境界を検査 | 公開運用・認証はPhase 2対象外 |

## 実ブラウザ試験

in-app Chromiumで `/admin` と以下3タブを同時接続した。

- `/display?id=browser-a&name=Main`
- `/display?id=browser-b&name=East`
- `/display?id=browser-c&name=West`

確認結果:

- Adminに `3 ONLINE / 3 REGISTERED`、一意ID、Heartbeat、Audio Masterを表示
- Current Scene / Current Cue / Next Cue、NEXT/BACK/REPLAY、Cue一覧、編集・並び替え操作、Free Speak、STOP、Show Resetが管理画面内で識別可能
- Cue追加ダイアログからCue 007「ブラウザ検証Cue」を作成・保存し、一覧への反映を確認（並び替え・再読込永続化は自動試験で確認）
- NEXTでCue 001を実行し、3 Displayすべてに「横川AIシステムを起動します。」を表示
- MainはBrowser TTS経路を実行して `SYSTEM READY` へ完了、East/Westは `SUBTITLE OUTPUT` のみ
- Free SpeakのtargetをEastへ変更し「Display Bだけへの個別送信です。」を送信。Eastだけ更新され、MainはCue 001字幕のまま
- Show Resetクリック時に、初期化範囲を明示した確認ダイアログを表示
- Display画面にAdmin操作要素がなく、投影用字幕・接続・Display設定だけであることを確認
- 1280×720相当のDisplayで日本語長文が中央領域内に折り返される既存Phase 1レイアウトを維持
- 約690px幅のAdminパネルでもレスポンシブ表示となり、重要操作が押し分け可能

ブラウザ確認中、Heartbeatごとの全Cue DOM再生成が操作参照を不安定にする兆候を検出したため、Cue・selectの署名が変わらない限りDOMを保持するよう修正した。

## 長時間試験

30分版はAdmin 1＋Display 3、2秒間隔で以下を繰り返す。

- Cue直接実行
- Free Speak Broadcast
- Display B個別target
- 2秒Heartbeat
- 途中でDisplay B切断・再接続
- 途中でAudio MasterをAからCへ変更
- `/health` のRSS開始値・終了値を比較（増加128MiB未満を合格基準）

実行結果:

```text
SOAK PASS: 30分 / {"totalEvents":895,"succeeded":895,"failed":0,"reconnects":1,"offlineDetections":1,"masterChanges":1,"memoryStartBytes":68403200,"memoryEndBytes":69636096,"memoryGrowthBytes":1232896,"abnormalExit":false}
```

計時はAdmin＋Display 3台の接続とAudio Master準備が完了した後に開始した。895件すべてが個別のmessage IDで完了状態へ到達し、RSS増加は合格基準128MiBを大きく下回った。

## Phase 1回帰

| 機能 | 結果 | 根拠 |
|---|:---:|---|
| localhostのAdmin/Display | PASS | HTTP 200、CSP、実ブラウザ |
| Free Speak、500ms以内字幕 | PASS | 実WebSocket到達時間と実ブラウザ |
| Browser TTS | PASS | Adapter unit test＋実ブラウザ |
| 発話キュー | PASS | 連続送信、順序、完了後dispatch |
| STOP | PASS | masterへのstop、停止後next |
| 履歴Replay | PASS | 新IDとreplayOfを確認 |
| 履歴・設定永続化 | PASS | JSON保存/再読込 |
| TTSエラー安全処理 | PASS | queue解除、履歴error |
| Display再接続 | PASS | restoreOnly、過去speak否定 |
| オフライン中核動作 | PASS | 外部URL・API依存なし |

## Phase 2受け入れ条件

| # | 条件 | 判定 | 検証根拠 |
|---:|---|:---:|---|
| 1 | Phase 1回帰なし | PASS | 既存10テスト＋上記回帰表 |
| 2 | localhost利用 | PASS | HTTP/WS自動試験、実ブラウザ |
| 3 | LAN内別PCからAdmin | PASS | `0.0.0.0` bind、実LAN NIC `192.168.11.5` 経由HTTP 200、独立Admin Client |
| 4 | LAN内別PCからDisplay | PASS | 実LAN NIC経由HTTP 200、独立Display Client |
| 5 | 3 Display同時接続 | PASS | 実WS＋実ブラウザ各3 |
| 6 | Display一意識別 | PASS | localStorage UUID、再接続同一ID |
| 7 | Admin Display一覧 | PASS | 実ブラウザ3件 |
| 8 | 接続・切断リアルタイム | PASS | WS close/state試験 |
| 9 | Heartbeat Offline | PASS | 2秒送信、7秒既定、短縮timeout試験 |
| 10 | Broadcast | PASS | 3 Client＋3ブラウザ |
| 11 | Display個別送信 | PASS | B受信、A/C否定検証＋実ブラウザ |
| 12 | MasterだけTTS | PASS | shouldSpeak排他＋実Browser TTS |
| 13 | Master切断検知 | PASS | OFFLINE状態・Admin警告 |
| 14 | 再接続表示復元 | PASS | Display別currentSubtitle State Sync |
| 15 | 再接続時非自動音声 | PASS | 250ms speak否定検証 |
| 16 | 固定Cue登録 | PASS | Cue追加UI・saveCue |
| 17 | Cue編集・保存 | PASS | unit＋JSON再読込 |
| 18 | Cue順次実行 | PASS | enabled順のnextCue |
| 19 | NEXT | PASS | WS＋実ブラウザ |
| 20 | BACK | PASS | 位置のみ変更、履歴件数不変 |
| 21 | REPLAY | PASS | cueId/replayOf付き新イベント |
| 22 | 任意Cue直接実行 | PASS | Cue 003直接実行 |
| 23 | Scene整理 | PASS | Sceneモデル、所属、表示、jump |
| 24 | Free Speak維持 | PASS | Phase 1回帰＋target追加 |
| 25 | 履歴区別 | PASS | source cue/freeとtarget |
| 26 | Show Reset安全実行 | PASS | 確認UI＋保持/初期化unit/WS |
| 27 | Browser TTS | PASS | Provider unit＋実ブラウザ |
| 28 | Provider交換境界 | PASS | createSpeechProvider/BrowserSpeechProvider |
| 29 | localhost固定なし | PASS | location.host静的検査 |
| 30 | HTTPSでWSS | PASS | location.protocol分岐 |
| 31 | インターネット不要 | PASS | 外部参照否定＋ローカル統合試験 |
| 32 | 30分複数Display | PASS | 接続完了後30分、895/895成功、RSS +1,232,896 bytes、異常終了なし |
| 33 | 全自動テスト成功 | PASS | npm test / npm run check |
| 34 | 実ブラウザmulti Display | PASS | Admin＋Display 3タブ |
| 35 | README運用手順 | PASS | LAN/操作/復旧/制約/チェック記載 |
| 36 | 意味あるGit履歴 | PASS | v0.1.0＋機能別コミット |
| 37 | 必須TODOなし | PASS | `rg` 検査（文書中の検査説明以外0） |

## 実会場でのみ残る確認

- 実ルーター/スイッチと物理別PCでのWindows Firewall疎通
- インターネット回線を物理的に外した通し稽古
- 会場プロジェクターの解像度・長文視認性
- 会場スピーカーの音量、出力先、二重音がないこと
- Windowsへ実際に導入された日本語音声の品質

これらはハードウェア依存であり、ソフトウェア上の代替として独立WS Client、3ブラウザタブ、外部依存静的検査を完了している。
