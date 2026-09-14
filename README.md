# 横川AI Phase 3 — Production Show Control

演劇企画「7号館からの脱出」向けの、インターネット不要な公演用Show Controlです。Phase 3 / v0.3.0ではPhase 2のCue・複数Display・Audio Master・Free Speakを維持しつつ、他のスタッフでも迷いにくい本番モード、本番前チェック、配信先セット、LAN/QR接続支援を追加しました。

```text
Admin /admin ── 本番モード / Preflight / Cue / Free Speak ──┐
                                                               ▼
                                             Node.js + WebSocket Server
                                             状態・Cue・履歴・JSON保存
                                                               │
                     ┌─────────────────────────────────────────┼──────────────┐
                     ▼                                         ▼              ▼
              Display A /display                        Display B        Display C...
              字幕 + AUDIO MASTER                       字幕のみ         字幕のみ
```

- Node.js 20以上、Express 5、`ws`、Vanilla HTML/CSS/JavaScript
- QRコードはローカル生成し、公演中の中核機能にクラウドやCDNを使用しない
- サーバーがCue位置、Display、字幕、キュー、履歴、Audio Masterのsource of truth
- Display台数は固定せず、Admin 1台＋Display 3台を自動試験・実ブラウザ試験済み
- `public/js/tts-adapter.js` にTTS Provider交換境界を維持

## セットアップと起動

依存パッケージの初回取得時だけインターネットが必要です。

```powershell
npm install
npm start
```

`start-yokogawa-ai.cmd` のダブルクリックでも起動できます。既定は `HOST=0.0.0.0`、`PORT=3000` です。起動ログにlocalhostと利用可能なLAN IPv4のAdmin/Display URLが表示されます。

| 変数 | 既定値 | 用途 |
|---|---|---|
| `PORT` | `3000` | HTTP/WebSocketポート |
| `HOST` | `0.0.0.0` | LAN待受。単一PC限定なら `127.0.0.1` |
| `NODE_ENV` | `production` | 実行環境名 |
| `STATE_FILE` | `data/state.json` | 状態保存先 |
| `LOG_DIRECTORY` | `logs` | ログ保存先 |
| `HEARTBEAT_TIMEOUT_MS` | `7000` | Display Offline判定時間 |

ブラウザは `location.host` を使い、HTTPなら `ws://`、HTTPSなら `wss://` を選択します。コードはlocalhost、Windows固有パス、大学固有ネットワークへ固定していません。

## 会場LANの設営

1. サーバーPC、Admin端末、Display端末を同じLANへ接続します。
2. サーバーPCで起動し、表示された会場LANのIPv4 URLを選びます。
3. Adminで `/admin` を開き、「詳細操作」内の接続情報またはQRを使います。
4. 各投影端末で `/display` を開き、Display Nameと音声出力許可を設定します。
5. Adminの「識別表示」で端末名とDisplay IDが正しい投影先に出ることを確認します。
6. 必須端末だけ `required` にし、その他は `optional` のままにします。
7. Audio Masterを1台指定し、そのDisplayで「設定を保存して開始」を押します。
8. 本番前チェックがREADY、または意図したWARNINGだけであることを確認します。

接続候補が複数ある場合は、会場LANと同じサブネットのアドレスを選んでください。仮想・リンクローカル等は可能な範囲で候補から除外・区別します。Windows Firewallの許可は利用するプライベートネットワークだけに限定してください。

KIT-WLAP2ではPhase 2時点で端末間通信を実機確認済みです。Phase 3も同構成を想定しますが、コードはKIT-WLAP2固有仕様に依存しません。IP変更時はサーバーを再起動して新しいURL/QRを使用します。

## Display登録、required / optional、Audio Ready

Display ID、表示名、音声許可はブラウザのlocalStorageに保存されます。テスト時だけ `/display?id=rehearsal-a&name=Main` のように初期値を指定できます。本番は通常の `/display` を使ってください。

- `required`: 切断すると本番前チェックがERROR / NOT READY
- `optional`: 切断してもオンラインの対象へ継続し、WARNING
- Heartbeatは2秒間隔、既定7秒でOFFLINE
- 再接続は同じIDを復元し、過去字幕を同期するが過去音声は自動再生しない
- Audio Readyはランタイム状態で、Audio Masterの再読込後は再度有効化が必要
- Audio Masterは切断時も自動変更しない。運用者が状態を確認して手動変更する

## 本番前チェック

Cueを実行せず、Server、Cue件数、Cue位置、全Display名・接続状態・required属性、Audio Master、Audio Ready、配信先セットを確認できます。

- `READY`: 必須条件がそろっている
- `WARNING`: 開始可能だが、任意Display Offline、途中Cue、Audio未有効等の注意がある
- `NOT READY`: Cueなし、Audio Master未設定/Offline、required Display Offline等

「音声テスト」はAudio Masterだけへテスト文を送り、Current Cueを変更しません。

## 配信先セット

「詳細操作」から複数Displayを名前付きセットとして作成し、CueまたはFree Speakのtargetに選べます。セットはDisplay名ではなくDisplay IDを参照するため、名称変更後も維持されます。

- group内の一部がOfflineでもオンライン端末へ配信
- group内のrequired DisplayがOfflineならPreflightで警告
- Display登録削除時はgroup参照を安全に除去
- Cueが使用中のgroup削除はブロック
- 無効または送信先0台のtargetは明確なエラー

## 本番中の基本操作

通常は「本番モード」で操作します。現在Scene、Current Cue本文/target、次Cue本文、Display/Audio警告を確認でき、NEXTを最大の主要ボタンとして表示します。

- `NEXT`: 次の有効Cueを実行
- `BACK`: Cue位置だけを1つ戻し、発話しない
- `REPLAY`: Current Cueを新しい履歴イベントとして再実行
- `STOP`: 現在のAudio Masterへ停止を送る

Cue編集、任意Cue、Audio Master変更、Free Speak、配信先編集、Show Resetは「詳細操作」に分離しています。主要操作は短時間ロックとaction IDのサーバー側重複排除で二重実行を抑制します。

固定Cueが本番の主系統です。Cue targetはALL、特定Display、配信先セットに対応します。Free Speakは想定外の台詞用で、Cueと同じキュー・履歴を使いますがCue位置を進めません。Show Resetは確認後にCue位置、字幕、発話キューを初期化し、Cue定義、Display登録、設定、履歴は保持します。

## トラブル時

| 状況 | 対応 |
|---|---|
| required DisplayがOFFLINE | LANとブラウザを確認し、同じDisplay IDで再接続 |
| optional DisplayがOFFLINE | 他Displayは継続。必要性を確認して復旧 |
| Audio MasterがOFFLINE | 字幕は継続。自動切替されないため、復旧または手動で別Masterを指定 |
| MasterがONLINEだが音がない | Audio Ready、端末音量、タブミュート、日本語音声を確認 |
| Admin切断 | Displayとサーバーは継続。Adminを再読込するとCue位置と状態を同期 |
| 送信先0台 | target/group有効状態と対象DisplayのONLINEを確認 |
| TTSエラー | 字幕で継続し、音声設定後にCueまたは履歴から再実行 |
| ポート使用中 | `$env:PORT=3100; npm start` |

Audio Masterが発話中に切断した場合は、誤った自動継続を避け、現在発話と待機キューをエラー終了します。運用者が状態確認後に再実行してください。

## TTS Provider境界

Phase 3も `createSpeechProvider` / `BrowserSpeechProvider` を使用し、Cue・WebSocket・Show Control層は `speechSynthesis` を直接呼びません。将来は同じ契約でVOICEVOX、事前生成音声等を追加できます。今回VOICEVOXや演者録音は導入していません。

## テスト

```powershell
npm test
npm run check
npm audit
```

30分のAdmin 1＋Display 3長時間試験:

```powershell
npm run test:soak
```

短縮確認例:

```powershell
$env:SOAK_MINUTES='1'
$env:SOAK_INTERVAL_MS='500'
npm run test:soak
```

長時間試験はNEXT/BACK/REPLAY/STOP、ALL/individual/group、Free Speak、required/optional/Master切断・再接続、Admin再接続、Preflight取得、RSS、異常終了を検証します。

## 本番前チェックリスト

- [ ] `npm run check` と30分試験が成功
- [ ] LAN URLを別端末から開ける
- [ ] 全required DisplayがONLINE、optionalの不在が意図どおり
- [ ] 識別表示と実際の投影先が一致
- [ ] Audio Masterが1台でAudio Ready、二重発話しない
- [ ] Cue本文・順序・enabled・target groupを確認
- [ ] NEXT / BACK / REPLAY / STOP / 任意Cue / Free Speakを稽古
- [ ] Admin・Display再読込とShow Resetの範囲を確認
- [ ] インターネットを切った会場LANで字幕と実音を確認
- [ ] プロジェクター、スピーカー、長文、全画面表示を実設備で確認

## Phase 3のスコープ外

アバター本制作、リップシンク、通常/暴走時の具体演出、VOICEVOX本導入、録音音声、自律応答、脚本依存の大量Cue、認証・クラウド前提化はPhase 4以降です。本アプリは実際の施錠、防災、非常口、電源、セキュリティ設備を操作しません。

## 文書と運用データ

- [文書索引](docs/README.md)
- [Phase 3要件正本](docs/phase-3/yokogawa_ai_phase3_requirements.md)
- [Phase 3実装指示](docs/phase-3/codex_phase3_implementation_prompt.md)
- [Phase 3検証記録](docs/phase-3/verification.md)

状態は `data/state.json`、ログは `logs/yokogawa-ai.log` に保存します。認証は未実装です。将来インターネット公開する場合はAdmin認証、TLS、永続Storage、アクセス制御を追加してください。
