# 横川AI Phase 2 — Show Control

演劇企画「7号館からの脱出」向けの、インターネット不要な公演用Show Controlです。1台のNode.jsサーバーを中心に、同一PCまたはローカルLAN上のAdminと複数Displayを接続し、固定Cueを主系統、Free Speakを即興系統として字幕とBrowser TTSを制御します。

## 構成

```text
Admin /admin ── Cue / Free Speak / target / reset ──┐
                                                    ▼
                                      Node.js + WebSocket Server
                                      公演状態・Cue・履歴・JSON保存
                                                    │
                          ┌─────────────────────────┼─────────────────────────┐
                          ▼                         ▼                         ▼
                   Display A /display        Display B /display        Display C /display
                   字幕 + AUDIO MASTER       字幕のみ                  字幕のみ
```

- Node.js 20以上、Express 5、`ws`、Vanilla HTML/CSS/JavaScript
- Cue・Free Speakは同じSpeech/Event Pipelineを通過
- サーバーが接続Display、Cue位置、Scene、字幕、キュー、履歴、Audio Masterの正
- Display再接続時は字幕状態だけを同期し、過去音声を自動再生しない
- Cue、Display登録、Audio Master、設定、履歴は `data/state.json` に保存
- JSON保存は `src/json-storage.js` の境界に分離

設計上のDisplay台数は固定していません。3台同時接続を自動試験・実ブラウザ試験済みです。

## セットアップと起動

初回だけ依存パッケージ取得にインターネットが必要です。公演中の中核機能は外部通信しません。

```powershell
npm install
npm start
```

`start-yokogawa-ai.cmd` のダブルクリックでも起動できます。既定値は `HOST=0.0.0.0`、`PORT=3000` で、localhostとLANの両方を待ち受けます。起動ログに利用可能なURLが表示されます。

```text
Local:
http://localhost:3000/admin
http://localhost:3000/display

LAN:
http://192.168.x.x:3000/admin
http://192.168.x.x:3000/display
```

環境変数:

| 変数 | 既定値 | 用途 |
|---|---|---|
| `PORT` | `3000` | HTTP/WebSocketポート |
| `HOST` | `0.0.0.0` | 待受アドレス。単一PC限定なら `127.0.0.1` |
| `NODE_ENV` | `production` | 実行環境名。`/health` と起動ログに反映 |
| `STATE_FILE` | `data/state.json` | JSON状態保存先 |
| `LOG_DIRECTORY` | `logs` | ログ保存先 |
| `HEARTBEAT_TIMEOUT_MS` | `7000` | Display Offline判定 |

ブラウザは配信元の `location.host` を使い、HTTPでは `ws://`、HTTPSでは `wss://` を自動選択します。通信先にlocalhostを固定していません。

## LAN構築

1. サーバーPC・Admin端末・Display端末を同じルーターまたはスイッチへ接続します。
2. サーバーPCで `npm start` を実行し、起動ログのLAN URLを確認します。
3. 別端末から `http://<サーバーIP>:3000/admin` または `/display` を開きます。
4. URLが複数表示された場合は、会場LANと同じIPv4（通常 `192.168.*.*` または `10.*.*.*`）を選びます。
5. Windows Defender Firewallで確認が出た場合は、会場で利用するプライベートネットワークに限ってNode.jsの受信を許可します。公開ネットワークへ無条件に開放しないでください。

接続できない場合は、両端末のIPが同じサブネットか、サーバーが起動中か、指定ポートがファイアウォールで許可されているかを確認します。公演前にはインターネット回線を外したLANだけの状態で通し確認してください。

## Displayの登録

1. Display端末で `/display` を開きます。
2. Display Name（例: `7-201 Main`）と「この端末で音声出力を許可」を設定します。
3. 「設定を保存して開始」を押します。
4. 自動生成されたDisplay ID、表示名、音声許可はブラウザのlocalStorageへ保存され、再接続時も同じ端末として復元されます。

右上の「DISPLAY設定」から再編集できます。テスト・稽古で同一ブラウザに複数Displayタブを作る場合だけ、`/display?id=rehearsal-a&name=Main` のようにIDと名前を明示できます。本番では通常の `/display` を使用してください。

Displayは2秒ごとにHeartbeatを送り、既定7秒以上途絶えるとAdminで文字付きの `OFFLINE` 表示になります。復帰時は同じIDで `ONLINE` に戻り、そのDisplayが最後に表示していた字幕を復元します。再接続だけで音声は再生されません。

## 公演操作

### Audio Master

AdminのDisplay一覧上部でAudio Masterを1台指定します。最初に接続したDisplayが初期Masterになります。

- 通常TTSを開始できるのは、targetに含まれるAudio Masterだけ
- 非Masterは字幕だけを表示し、TTS要求を実行しない
- Masterを再読み込みした場合は、Display側で再度「設定を保存して開始」を押す
- Master切断時は自動切替せず、Adminに赤い警告を表示する
- 予測可能性を優先し、運用者が別のONLINE Displayを手動指定する

### 固定Cue

Admin上部にCurrent Scene、Current Cue、Next Cueを常時表示します。

- `NEXT`: 次の有効Cueを実行
- `BACK`: Cue位置だけを1つ戻す。発話はしない
- `REPLAY`: Current Cueを新しい履歴イベントとして再実行
- Cue一覧の `▶`: 任意Cueを直接実行
- `編集`: Cue番号、名称、本文、Scene、target、有効/無効を編集
- `↑` / `↓`: Cue順序を変更
- Scene選択: そのSceneの直前へ位置を移す。自動発話はしない

Cue本文のテキストが原データです。Cueには将来用として `displayMode`、`speechProvider`、`audioAsset`、delay、actions、notesを保持できる構造があります。無効CueはNEXTでスキップされます。

### Free Speak

想定外のセリフはFree Speakへ入力し、`ALL DISPLAYS` または特定Displayをtargetにして送信します。Cueと同じパイプライン・キュー・履歴を使いますが、Current Cueは進みません。履歴には `CUE` / `FREE SPEAK` とtargetが明示されます。

### STOP / REPLAY / Show Reset

- `STOP AUDIO`: 現在のAudio Masterへ停止を送り、キューがあれば次へ進む
- 履歴の「再読み上げ」: 過去イベントを同じtargetで再送
- `SHOW RESET`: 確認ダイアログ後、Current Scene/Cue、発話キュー、字幕、一時表示状態を初期化

Show Reset後もCue定義、Display登録、Audio Master、設定、履歴は保持されます。

## 障害復旧

| 状況 | 対処 |
|---|---|
| DisplayがOFFLINE | 対象端末のブラウザとLANを確認し、`/display` を再読み込み |
| Audio MasterがOFFLINE | 字幕は継続。ONLINEのDisplayを手動でMaster指定し、その画面で音声を有効化 |
| Adminが切断 | Displayとサーバーは継続。Adminを再読み込みすると状態・Cue位置・Display一覧を同期 |
| 字幕は出るが音がない | Master指定、Displayの音声許可、音声有効化、Windows音量、Chromeミュート、日本語音声を確認 |
| TTSエラー | 字幕で継続し、音声設定を確認後にCue/履歴から再実行 |
| ポート使用中 | `$env:PORT=3100; npm start` |
| サーバー終了 | 起動ターミナルで `Ctrl + C` |

1台の非Master Display切断は他Display・キュー・Adminへ波及しません。Audio Masterが発話中に切断した場合は、誤った自動継続を避けるため現在発話とキューをエラー終了し、運用者が再実行します。

## TTS Provider境界

`public/js/tts-adapter.js` の `createSpeechProvider` が交換境界で、Phase 2は `BrowserSpeechProvider` を使用します。Cue・Show Control・WebSocket層は `speechSynthesis` を直接呼びません。

将来VOICEVOXへ変更する場合は、同じProvider契約を持つProviderを追加し、サーバー生成WAVのURLまたはキャッシュ済み `audioAsset` をAudio Masterへ渡すイベントを追加します。Cueテキストは保持されるため、音声モデル変更後も再生成できます。Chromeの自動再生制約により、Browser TTSはMaster画面の読み込み後に毎回ユーザー操作が必要です。

## テスト

```powershell
npm test
npm run check
npm audit
```

`npm test` はPhase 1回帰に加え、LAN URL、Display ID、3 Display、Heartbeat/Offline、Broadcast/個別target、Audio Master、Cue進行/編集/保存/並び替え、Scene、Free Speak、Reset、State Sync、連続再接続を検証します。

30分のマルチDisplay試験:

```powershell
npm run test:soak
```

日常確認用の短縮例:

```powershell
$env:SOAK_MINUTES='1'
$env:SOAK_INTERVAL_MS='500'
npm run test:soak
```

試験はAdmin 1＋Display 3でCue、Broadcast、個別target、Heartbeat、Display切断/再接続、Audio Master変更を実行し、イベント成否・Offline検知・再接続・RSS増加・異常終了を集計します。

## 本番前チェック

- [ ] `npm test` と30分試験が成功
- [ ] 起動ログのLAN IPを別端末から開ける
- [ ] Adminで全DisplayがONLINE
- [ ] Display Nameと投影先が一致
- [ ] Audio Masterが意図した1台で、実音が二重にならない
- [ ] Master画面で音声を有効化
- [ ] NEXT / BACK / REPLAY / 任意Cue / STOPを稽古
- [ ] Cue本文・順序・enabled・targetを確認
- [ ] Free Speak後もCue位置が変わらない
- [ ] DisplayとAdminの再読み込み復旧を確認
- [ ] Show Resetの保持・初期化範囲を確認
- [ ] インターネットなしの会場LANで字幕と実音を確認
- [ ] プロジェクター、スピーカー、長文、全画面表示を実設備で確認

## データ、ログ、公開時の注意

- 状態: `data/state.json`
- ログ: `logs/yokogawa-ai.log`

ログにはServer/Admin/Display接続、切断、Heartbeat timeout、Cue、Free Speak、Audio Master、TTS状態、Show Resetが記録されます。Windows固有の絶対パスやクラウドAPIはコードへ埋め込んでいません。

本アプリにはPhase 2時点で認証がありません。Render等へ将来デプロイする場合は、Admin認証、TLS、永続Storage、アクセス制御を追加してからインターネット公開してください。本アプリは実際の施錠、防災、非常口、電源、セキュリティ設備を操作しません。
