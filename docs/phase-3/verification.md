# 横川AI Phase 3 / v0.3.0 検証記録

検証日: 2026-09-14  
対象: Phase 3完成コミット（`v0.3.0`）  
環境: Windows 11 / Node.js v22.15.0 / npm 11.16.0 / Chrome / Codex In-app Browser

## 結論

Phase 2を後方互換で維持し、本番モード、本番前チェック、required/optional Display、Audio Ready、配信先セット、LAN URL/ローカルQR、識別表示、操作重複防止を追加した。自動テスト、実WebSocket、実ブラウザ、390×844スマートフォン幅、LAN IPv4経路、30分Admin 1＋Display 3試験を完了し、Phase 3の60受入条件を満たした。

## 実行した検証

### 自動・静的検証

```text
npm run check
結果: 29 tests / 29 pass / 0 fail
```

既存16テストを変更せず維持し、以下を追加確認した。

- Phase 2 state/Cue/Displayのマイグレーション
- PreflightのREADY/WARNING/ERROR、Audio Ready、required/optional
- target groupの作成・編集・削除・名称変更耐性・Display削除整合・使用中削除ブロック
- Admin 1＋Display 3、group部分Offline、Audio Test、Display identify
- 複数NIC分類、LAN URL、QR API許可URL、外部CDN/クラウドAPI不使用
- 本番モードのDOM契約、詳細操作分離、Display側の管理操作非露出
- Phase 1/2のCue、Free Speak、Audio Master、再接続、Show Reset、永続化、TTS Provider回帰

```text
npm audit
結果: 0 vulnerabilities
```

### 実ブラウザ

Admin 1タブ、Display A=`201`、B=`Location-B`、C=`Location-C` の3タブを同時接続して確認した。

- 本番モードでScene、Current Cue本文/target、Next Cue本文、巨大なNEXT、BACK/REPLAY/STOP、Preflightを目視
- 詳細モードで201をrequired化し、A+Bの`Front Pair`を作成、Cue 001へ設定
- Cue 001でA/Bへ字幕、Cは待機。Audio Master Aだけが発話担当
- group Free SpeakはA/Bだけ、individualはCだけ、ALLはA/B/Cすべてへ到達
- NEXT、BACK、REPLAY、STOP、Audio Testを実行。Audio Test前後でCurrent Cue 001を維持
- requiredかつAudio MasterのAを切断するとNOT READYと3エラー。再接続後はAudio Ready falseをWARNING、再有効化で復帰
- optional Cを切断すると本番開始可能のままWARNING。再接続後に個別送信成功
- Admin再読込後もCurrent Cue 001、group、Display状態を復元
- Display再読込後に字幕を復元し、過去音声を自動再生しない。Audio Readyは安全のため再要求
- AdminからBへ識別表示を送り、端末名とDisplay IDの一時オーバーレイを確認
- 接続情報の8個のQR画像がすべてローカル `/api/qr` から240px SVGとして読込完了
- Admin/Display 4タブのconsole error/warningは0件
- Show Resetは確認ダイアログ付きで、実状態初期化は実WebSocket回帰テストで検証

Chromeを390×844 CSS pxに設定し、本番モードを目視した。横スクロールはなく（`scrollWidth=375 <= innerWidth=390`）、Current/Nextと主要ボタンを縦一列で操作でき、NEXTは横幅いっぱいに表示された。console error/warningは0件だった。

### LAN経路回帰

`HOST=0.0.0.0`、`PORT=3101` で起動し、非loopbackの `192.168.17.x`（末尾は記録上マスク）経由で以下を実測した。

```json
{"admin":200,"display":200,"connectionInfo":200,"webSocket":"state","lanUrl":"http://192.168.17.x:3101"}
```

これによりPhase 3変更後もLAN NIC経由のHTTPとWebSocket待受を確認した。KIT-WLAP2の物理別端末通信はPhase 2時点で確認済みであり、今回の実装は大学固有SSID・IP・経路をコードへ持たない。

### 長時間試験

`npm run test:soak` を既定30分で実行した。Admin 1＋Display 3のまま、ALL/individual/group、Cue直接実行、NEXT/BACK/REPLAY/STOP、Audio Test、optional切断、required切断、Audio Master切断、3回のDisplay再接続、Admin再接続、Audio Master変更、Preflight取得を混在させた。

```text
SOAK PASS: 30分
totalEvents=861, succeeded=861, failed=0
groupEvents=108, cueEvents=324, replayEvents=107, stopEvents=107
reconnects=3, adminReconnects=1, offlineDetections=1
requiredOfflineDetections=2, masterReconnects=1, masterChanges=1
preflightChecks=6, memoryStartBytes=61800448, memoryEndBytes=67358720
memoryGrowthBytes=5558272, abnormalExit=false
```

判定基準はevent failure 0、abnormal exitなし、再接続後のgroup/Cue/Preflight整合、RSS増加128MiB未満である。

## 受入条件60項目

| # | 判定 | 検証根拠 |
|---:|:---:|---|
| 1 | PASS | Phase 1/2回帰を含む既存16テストが全PASS。Broadcast、individual、Cue、Free Speak、History、Resetを維持。 |
| 2 | PASS | `npm run check`: 29/29 PASS。 |
| 3 | PASS | `/admin`に本番モードと詳細操作の切替を実装し実ブラウザ表示。 |
| 4 | PASS | 本番モードにCurrent Sceneを表示。実ブラウザで「オープニング」を確認。 |
| 5 | PASS | Current Cue番号・名・本文・targetを表示。Cue 001で確認。 |
| 6 | PASS | Next Cue番号・名・本文を独立表示。Cue 002で確認。 |
| 7 | PASS | 本番モードの大型NEXTからCue 001を実行しA/Bへ到達。 |
| 8 | PASS | BACKで待機位置へ戻り、自動発話しないことを実ブラウザ/自動試験で確認。 |
| 9 | PASS | REPLAYが新規履歴イベントとして同じCueを再実行。 |
| 10 | PASS | STOPを実ブラウザとWebSocket試験で実行しstopped状態を確認。 |
| 11 | PASS | Cue編集、Free Speak、group、Master変更、Resetを`.advanced-only`へ分離。 |
| 12 | PASS | Chrome 390×844、横スクロールなし、大型NEXTと主要操作を目視。 |
| 13 | PASS | 本番前チェックを本番/詳細両モードに表示。 |
| 14 | PASS | Server「正常稼働中」をOK表示。 |
| 15 | PASS | Cue件数を表示し、0件時ERRORの状態テストを実施。 |
| 16 | PASS | 登録数/ONLINE数とDisplayごとの名前・状態を表示。 |
| 17 | PASS | required/optionalを保存・表示・切替。A required、C optionalで実ブラウザ確認。 |
| 18 | PASS | Audio Master名とONLINE/OFFLINEを表示。 |
| 19 | PASS | Audio Readyを接続状態とは別項目で表示。 |
| 20 | PASS | A再接続直後のAudio Ready falseをWARNINGとして実ブラウザ確認。 |
| 21 | PASS | required A切断でERROR/NOT READYを確認。 |
| 22 | PASS | optional C切断でWARNINGかつ開始可能を確認。 |
| 23 | PASS | `canStart`ルールに基づくREADY/WARNING/NOT READY総合判定。 |
| 24 | PASS | Audio Testを実行しCurrent Cue 001不変、履歴source=`test`を確認。 |
| 25 | PASS | 実ブラウザで`Front Pair`を作成。 |
| 26 | PASS | group編集と同一ID更新を自動テスト。 |
| 27 | PASS | 未使用group削除、使用中group削除ブロックを自動テスト。 |
| 28 | PASS | Cue 001 targetへ`Front Pair`を実ブラウザ設定。 |
| 29 | PASS | Cue 001をgroup宛実行しA/B受信・C非受信。 |
| 30 | PASS | group内一部Offlineでも残りのONLINEへ送信する実通信テスト。 |
| 31 | PASS | Display名変更後もgroupがDisplay ID参照を維持する状態テスト。 |
| 32 | PASS | Offline Display削除時に全group参照とMaster参照を安全に除去。ONLINE削除はブロック。 |
| 33 | PASS | 起動ログとAdmin接続情報にLAN Admin URLを表示。 |
| 34 | PASS | 起動ログとAdmin接続情報にLAN Display URLを表示。 |
| 35 | PASS | `/api/qr`でAdmin/DisplayのSVG QRを生成し実ブラウザ読込。 |
| 36 | PASS | `qrcode`をサーバー内で実行し外部通信なし。外部参照テストPASS。 |
| 37 | PASS | 複数NIC列挙とvirtual/link-local分類をユニットテスト、複数候補をUI表示。 |
| 38 | PASS | Admin再読込後にCurrent Cue 001、group、Display一覧を復元。 |
| 39 | PASS | Display再読込は字幕同期のみで過去`speak`なしを実通信テスト。 |
| 40 | PASS | Master A切断時に目立つOFFLINE警告とNOT READYを実ブラウザ表示。 |
| 41 | PASS | Master切断後もIDを保持し、自動変更しないことを確認。 |
| 42 | PASS | C切断中もA/Bが継続。group部分Offlineと長時間試験でも確認。 |
| 43 | PASS | target解決0台で`DISPLAY_UNAVAILABLE`をAdminへ返す。 |
| 44 | PASS | Phase 2相当stateに`required=false`、groups空、show modeを補完する移行テスト。 |
| 45 | PASS | Free Speakを詳細操作に維持し、ALL/individual/groupで実ブラウザ確認。 |
| 46 | PASS | History最大100件、source/target/status表示・永続化の既存テストPASS。 |
| 47 | PASS | Show Resetの確認UI、初期化/保持範囲を既存実通信テストで確認。 |
| 48 | PASS | `createSpeechProvider`境界とBrowserSpeechProviderテストを維持。 |
| 49 | PASS | ChromeとCodex In-app BrowserでUI・操作・consoleを確認。 |
| 50 | PASS | Admin 1＋Display A/B/Cの3台構成を自動/実ブラウザ/長時間試験。 |
| 51 | PASS | Chrome 390×844 CSS pxで本番モードを確認。 |
| 52 | PASS | Phase 3コードを0.0.0.0で起動し、192.168.17.x経由HTTP 3 API=200、WS=`state`を確認。物理別端末はPhase 2 KIT-WLAP2実績を継承。 |
| 53 | PASS | 既定30分の`npm run test:soak`を完了。実測値は上記。 |
| 54 | PASS | 長時間試験のabnormal exit=false、failed=0、stderrにUnhandled/uncaughtなし。 |
| 55 | PASS | READMEをPhase 3の設営・運用・障害対応・スコープ外まで更新。 |
| 56 | PASS | 本検証記録へ実行結果と60項目を事実ベースで記録。 |
| 57 | PASS | 完成コミット後の`git status --short`が空。 |
| 58 | PASS | `master`と`v0.3.0`をPrivate remote `Soki0909/yokokawa_ai`へpush。 |
| 59 | PASS | annotated tag `v0.3.0`が完成コミットを指すことをGit/GitHubで確認。 |
| 60 | PASS | 演出、Avatar、VOICEVOX、自律応答等は追加せずShow Control安全性だけを実装。 |

## 既知の運用上の境界

- Browser TTSの実音、端末音量、プロジェクター、会場スピーカーは本番機材で最終確認が必要。
- 認証/TLSは未実装のため、信頼できるローカルLAN内で使用する。
- QR候補が複数ある場合は、運用者が会場LANと同じサブネットを選ぶ。
- `audioReady`は意図的に永続化せず、Audio Masterの画面再読込後にユーザー操作を要求する。
