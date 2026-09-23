# 横川AI Phase 4.2 — Presentation Preset Visual Overhaul

演劇企画「7号館からの脱出」向けの、インターネット不要な公演用Show Controlです。Phase 4.2 / v0.4.2はv0.4.1のCue進行・複数Display・Audio Master・Free Speak・画像Avatarを維持し、6種のPresentation Presetを舞台距離でも判別できる全画面演出へ更新しました。

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

## Cue Schema v2

Cueは `schemaVersion: 2` で、主要フィールドは次のとおりです。

- `id/name/enabled/route/scene/location/kind/target`
- `speechText`: 音声用。観客表示と別内容にできる
- `displayText`: Display字幕用
- `operatorNote/triggerNote`: Adminだけに表示しDisplayへ送らない
- `presentationPreset`: 見た目のPreset ID
- `avatar`: 表示可否と状態
- `audio`: `speechMode/assetId/lipSyncMode`

旧 `cueId/cueName/text/sceneId` は読み込み時にv2へ移行し、互換aliasも保持します。

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

Phase 4.2では同じAvatar・字幕レイアウトの背面に、共有Environment layerを追加しました。状態差は色だけに依存しません。

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

## 音声

`browser` は従来のBrowser Speech Synthesis、`audio-file` はAsset RegistryのWAV/MP3、`none` は無音です。実音声を出すのは常にGlobal Audio Master 1台だけで、他Displayは字幕・演出のみ同期します。ローカル音声もSTOP、Cue REPLAYに対応します。

AssetはIDと `assets/audio/*.wav|*.mp3` の相対pathを分離します。`..`、絶対path、asset root外、MIME/拡張子不整合を拒否します。音声データをWebSocketへ流さず、HTTPのローカルasset endpointから取得します。

## Show File

詳細操作の「Show File書き出し／読込」を使用します。含むものはmetadata、routes、scenes、cues、groups、presets、avatar、assets、show settingsです。接続、heartbeat、Audio Ready、履歴、WebSocket session、秘密情報、OS絶対pathは含みません。

Importは先にDry Runし、schema、重複ID、Cue kind、target、group、preset、avatar、audio asset、参照整合性を検査します。Error時は現在Showを一切変更しません。

## 本番操作

- `NEXT` / Space: 次の有効Cue
- `BACK` / B: Cue位置だけ戻す
- `REPLAY` / R: Current Cueを再実行
- `STOP` / Esc: 現在音声を停止
- `CLEAR` / C: 字幕を消去
- `BLACKOUT`: 全Displayを暗転（単一キー割当なし）
- `RESTORE`: BLACKOUT前のPreset/字幕へ復元

input、textarea、select、contenteditableの操作中、modifier押下中、key repeatではショートカットを無効化します。設定からショートカット全体も無効化できます。Free SpeakはCue位置を変えず、想定外の台詞に使用します。

## Rehearsal / Preflight

Rehearsal Sessionは開始時刻を0秒としてCueと操作のtimestamp、elapsed time、route/scene/location、target、preset、speech mode、結果を記録します。CSV/JSONをローカルExportできます。

PreflightはPhase 3項目に加え、Show Schema v2、Cue参照、Preset、Avatar、Audio Asset、target group、required Display、Audio Master/Readyを確認します。

## 障害時

- Display再接続: 同じIDで現在Preset、字幕、Avatar、BLACKOUTを復元。過去音声は再生しない
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

`test:soak` は既定30分です。短縮確認は `$env:SOAK_MINUTES='0.1'` のように指定できます。Phase 4.2の実ブラウザ画像、Visual Pass、30分試験、75項目の受入照合は [Phase 4.2検証記録](docs/phase-4-2/verification.md) を参照してください。過去Phaseの記録も `docs/` に保持しています。

## Phase 4.2スコープ外

VOICEVOX本体、LLM連携、WebGL/3Dアバター、映像編集、複数Audio Zone、クラウド必須機能、特定演者の肖像再現は本番依存にしていません。ProviderとShowデータ境界を残し、後からBrowser TTS、VOICEVOX、事前生成音声を交換できます。
