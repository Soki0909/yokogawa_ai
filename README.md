# 横川AI Phase B — Performance Presentation System

演劇企画「7号館からの脱出」向けの、インターネット不要な公演用Show Controlです。Phase B / v0.6.0は、Phase A / v0.5.0のCue進行・複数Display・Audio Master・Free Speak・画像Avatar・Server authoritativeな演出状態を維持し、6 Presentation Preset、Avatar自身の状態差、Foreground Interference、Transition、Operation Overlay、Final Challenge、Unlock / Emergencyを舞台映像として完成させた正式版です。Visual Reviewは承認済みです。

```text
Admin /admin ── Cue / Preset / Emergency / Rehearsal ── Node.js + WebSocket
                                                            │
                         ┌──────────────────────────────────┼──────────┐
                         ▼                                  ▼          ▼
                  Display A /display                   Display B   Display C…
                  字幕 + Audio Master                  字幕のみ    字幕のみ
```

Node.js 20以上、Express、`ws`、Vanilla HTML/CSS/JavaScriptを使用します。CDNやクラウドAPIは使わず、会場LAN内だけで中核機能が動作します。

## 起動と会場設営

```powershell
npm install
npm start
```

`start-yokogawa-ai.cmd` でも起動できます。既定は `HOST=0.0.0.0`、`PORT=3000` です。

1. Server、Admin、Displayを同じLANへ接続する。
2. 起動ログまたはAdmin詳細画面のLAN URL/QRを使用する。
3. Adminを `/admin`、投影端末を `/display` で開く。
4. Display Nameを設定し、音を出す1台だけをAudio Masterにする。
5. Audio Masterの「設定を保存して開始」を押す。
6. 必要なDisplayをrequiredにし、PreflightのERRORを解消する。
7. Show FileをDry Runし、リハーサルを開始して本番操作を確認する。

| 変数 | 既定 | 用途 |
|---|---:|---|
| `PORT` | `3000` | HTTP/WebSocketポート |
| `HOST` | `0.0.0.0` | LAN待受 |
| `STATE_FILE` | `data/state.json` | 状態保存先 |
| `LOG_DIRECTORY` | `logs` | 運用ログ |
| `HEARTBEAT_TIMEOUT_MS` | `7000` | OFFLINE判定 |

URL、WebSocket、保存先はlocalhostやWindows固有パスへ固定していません。HTTPS環境では同一hostの `wss:` を使用するため、将来のRender等への配置余地も残しています。

## Cue Schema v3

Cueは `schemaVersion: 3` です。Schema v2 Show Fileもそのまま読み込み、Phase Aのoptionalフィールドを既定値で補完してv3へ移行します。

- `id/name/enabled/route/scene/location/kind/target`
- `speechText`: 音声用。観客表示と別内容にできる
- `displayText`: Display字幕用
- `operatorNote/triggerNote`: Adminだけに表示しDisplayへ送らない
- `presentationPreset`: 見た目のPreset ID
- `avatar`: 表示可否と状態
- `audio`: `speechMode/assetId/lipSyncMode`
- `transition`: `id/durationMs/intensity`
- `overlay`: `id/visible/title/message/progress/variant`
- `visual`: `id/type/assetId/mode/visible/title/message/items`
- `timing`: Overlay/Visualの自動消去、3,000〜10,000msのUnlock時間
- `syncMarkers`: 照明・音響・演者向けの部署別マーカー。Adminだけに表示

旧 `cueId/cueName/text/sceneId` は読み込み時にv3へ移行し、互換aliasも保持します。未知のTransition/Overlay/Visual typeはDry Runで拒否します。

| kind | 動作 |
|---|---|
| `speech-display` | 発話と字幕 |
| `speech-only` | 発話のみ |
| `display-only` | 字幕のみ |
| `clear` | 字幕を消去 |
| `blackout` | 全面暗転。再接続でも維持 |
| `preset-only` | 本文・音声を変えず演出だけ変更 |

## Presentation / Avatar / Lip Sync

標準Presetは `normal`、`warning`、`hijacked`、`hostile`、`shutdown`、`recovery` です。Presetと現在表示はServer authoritativeで、再接続時に復元します。

Phase 4.2では同じAvatar・字幕レイアウトの背面に、共有Environment layerを追加しました。NORMALは参照画像に合わせ、中央の大型Avatar、左右22.5%位置のsystem rail、64%位置のdiamond node、左右3%・画面下部22%を使う字幕panelを基準構図にしています。円形HUDのcore・ring・sector・radial glowは単一の中心軸を共有し、Desktopと狭幅のどちらでも左右対称を維持します。中央の重複タイトルは表示せず、Avatarと字幕を主役にします。状態差は色だけに依存しません。

- `normal`: 青緑の安定した同心円と低密度Grid
- `warning`: 琥珀色の大型Geometry、斜めScan、Pulse
- `hijacked`: magenta/violetの侵入Band、UI offset、非同期Ring
- `hostile`: red/blackの高強度Environment、破断Ring、Rupture
- `shutdown`: 無彩色化、閉眼、主要Animation完全停止
- `recovery`: tealの修復走査、Grid再整列、段階的Ring復帰

Avatarと字幕は演出レイヤーの外に置き、glitchやscanで位置を動かしません。`prefers-reduced-motion` とShow設定の `reducedMotion` ではAnimationを停止しても、色・Geometry・Status labelで6状態を識別できます。BLACKOUTは全演出より上位です。

標準Displayは `image-yokogawa-v1` を表示します。`public/assets/avatar/yokogawa/v1/` の `base.png` を常時表示し、その上へ `mouth-half.png` / `mouth-open.png` の口周辺だけ、`eyes-closed.png` の目周辺だけをCSS clipで重ねます。全身画像を切り替えないため、口とまばたきは互いに独立し、顔全体のちらつきを抑えます。従来SVGは `svg-fallback` として残しています。

Avatar assetは `AVATAR_ASSET_SETS` で意味IDとローカルpathを管理します。標準まばたきは3〜6秒間隔、100〜180msです。`shutdown`では目を閉じた状態で停止し、`recovery`で再開します。6 Presetは同じ画像へCSS filter / glow / motionを適用するため、Presetごとの画像複製はありません。

口は `closed/half/open` の3段階です。

- `simulated`: Browser TTS向けのゆっくりした疑似口パク
- `audio-reactive`: ローカル音声のWeb Audio振幅を平滑化し、hysteresisとholdで口を制御
- `none`: 口パクなし

Avatar非表示、STOP、終了、エラーでは口パク処理を停止してclosedへ戻します。画像・Lip Sync・Blinkの境界を分けているため、将来はAsset Setや音声Providerを独立交換できます。

### Phase B演出レイヤー

Displayは下から `Preset Environment → Avatar → Scene Visual → Subtitle/Status → Operation Overlay → BLACKOUT` の順で合成します。Transitionは一時的な全画面効果で、`prefers-reduced-motion` とShow設定を尊重します。BLACKOUTは従来どおり常に最上位です。

- Transition: boot / anomaly / takeover / riddle / final challenge / auth / unlock / emergency / hostile / shutdown / recovery / normalize
- Operation Overlay: 起動、通信封鎖、拒否、認証、解除、緊急保護、暴走、停止、復旧など
- Scene Visual: text-card / image / final-challenge / riddle-status
- Unlock Gauge: AUTH / CORE / GATEの複数表示で0→100%。既定5秒、100%保持、STOP・REPLAY・再接続対応

演出中の開始時刻、完了、中断、現在進捗、target別状態はServerが保持します。Display再接続時は途中進捗または完了状態を復元し、過去Transitionを先頭から再生しません。

## 音声

`browser` は従来のBrowser Speech Synthesis、`audio-file` はAsset RegistryのWAV/MP3、`none` は無音です。実音声を出すのは常にGlobal Audio Master 1台だけで、他Displayは字幕・演出のみ同期します。ローカル音声もSTOP、Cue REPLAYに対応します。

AssetはIDと相対pathを分離します。音声は `assets/audio/*.wav|*.mp3`、Scene画像は `assets/visual/*.png|*.jpg|*.jpeg|*.webp|*.svg` だけを許可します。`..`、絶対path、asset root外、MIME/拡張子不整合を拒否します。バイナリをWebSocketへ流さず、HTTPのローカルasset endpointから取得します。

## Show File

詳細操作の「Show File書き出し／読込」を使用します。含むものはmetadata、routes、scenes、cues、groups、presets、avatar、assets、show settingsです。接続、heartbeat、Audio Ready、履歴、WebSocket session、秘密情報、OS絶対pathは含みません。

Importは先にDry Runし、schema、重複ID、Cue kind、target、group、preset、avatar、audio asset、参照整合性を検査します。Error時は現在Showを一切変更しません。

Phase Aの本番デモは [`shows/phase-a-demo.json`](shows/phase-a-demo.json) です。通常待機から異常、乗っ取り、謎解き、201集合、最終課題、認証、Unlock、緊急中断、暴走、停止、復旧まで27 Cueを収録します。Show File読込からDry Runして適用してください。状態間は自動連鎖せず、すべてオペレーターがNEXTで進行します。

## 本番操作

- `NEXT` / Space: 次の有効Cue
- `BACK` / B: Cue位置だけ戻す
- `REPLAY` / R: Current Cueを再実行
- `STOP` / Esc: 現在音声を停止
- `CLEAR` / C: 字幕を消去
- `BLACKOUT`: 全Displayを暗転（単一キー割当なし）
- `RESTORE`: BLACKOUT前のPreset/字幕へ復元

input、textarea、select、contenteditableの操作中、modifier押下中、key repeatではショートカットを無効化します。設定からショートカット全体も無効化できます。Free SpeakはCue位置を変えず、想定外の台詞に使用します。

Cue Listの「位置のみ」はCurrent位置だけを移動し、表示・音声・演出を実行しません。「実行」は指定Cueを即時実行します。STOPは音声に加えて進行中Transition/Unlockも安全に停止します。

## Rehearsal / Preflight

Rehearsal Sessionは開始時刻を0秒としてCueと操作のtimestamp、elapsed time、route/scene/location、target、preset、speech mode、結果を記録します。CSV/JSONをローカルExportできます。

PreflightはPhase 3項目に加え、Show Schema v3、Cue参照、Preset、Avatar、Audio Asset、target group、required Display、Audio Master/Readyを確認します。

## 障害時

- Display再接続: 同じIDで現在Preset、字幕、Avatar、Overlay、Visual、Transition/Unlock進捗、BLACKOUTを復元。過去音声は再生しない
- Admin再接続: ServerのCue位置、Show、ログを復元
- Audio Master切断: 字幕は継続。音声とキューを安全に終了し、運用者が再指定
- TTS/音声Assetエラー: 字幕は維持し、修正後にREPLAY
- Show File Error: Dry Runのエラーを直すまでImportしない
- Show Reset: Cue位置、字幕、発話、演出を初期化し、Show定義とDisplay登録は保持

## 検証

```powershell
npm run check
npm run test:browser-console
npm audit --omit=dev
npm run test:soak
```

`test:soak` は既定30分で、Unlock・緊急中断・Hostile・Shutdown・Recovery・NORMAL cleanupを周期投入します。短縮確認は `$env:SOAK_MINUTES='0.1'` のように指定できます。Phase Bの自動試験、実ブラウザ、Admin 1 + Display 3、Screenshot、console、30分試験、受入照合は [Phase B検証記録](docs/phase-B/verification.md)、正式版の要約は [v0.6.0 Release Notes](docs/phase-B/release-notes.md) を参照してください。承認済みReview画像は [`artifacts/phase-b-review/`](artifacts/phase-b-review/) にあります。

次Phaseの設計方針は [Phase C — Production Integration](docs/phase-C/production-integration-plan.md) に記録しています。Phase Cは未着手で、v0.6.0にLocal TTS、音声生成、Production Show File、Free Speak変更は含みません。

## Phase Bスコープ外

VOICEVOX本体、LLM連携、WebGL/3Dアバター、映像編集、複数Audio Zone、クラウド必須機能、特定演者の肖像再現は本番依存にしていません。ProviderとShowデータ境界を残し、後からBrowser TTS、VOICEVOX、事前生成音声を交換できます。
