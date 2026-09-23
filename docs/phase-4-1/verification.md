# Phase 4.1 / v0.4.1 検証記録

検証日: 2026-09-23（Asia/Tokyo）  
基準: `v0.4.0` = commit `44c2857`（不変）

## 実装

- 4画像を `public/assets/avatar/yokogawa/v1/` にローカル配置し、`AVATAR_ASSET_SETS`で意味IDとpathを登録
- `base.png`を常時表示し、口画像は顔中央下部、閉眼画像は眼鏡内側だけをCSS `clip-path`で重ねる局所レイヤー方式
- `image-yokogawa-v1`を標準化し、既存SVGを`svg-fallback`として保持
- 既存`LipSyncController`の`closed/half/open`を画像レイヤーへ接続
- `BlinkController`: 3〜6秒間隔、100〜180ms、口と独立。shutdownは閉眼停止、recoveryで再開
- 6 Presetは共通画像へfilter / glow / motionを適用
- Show Fileの旧Avatar定義は既定値補完し、不明なmode / asset setはDry Runで拒否

## 自動試験・Security

- 基準: `npm run check` 43/43 PASS
- 最終: `npm run check` 50/50 PASS（既存43件 + Phase 4.1専用7件）
- 追加試験: asset登録・実在、局所レイヤーDOM/CSS、mode互換・検証、Blink範囲、口/Blink共存、shutdown/recovery、6 Preset
- `npm audit --omit=dev`: 0 vulnerabilities
- 外部CDN / cloud APIなし。Avatar画像・音声・WebSocketは同一hostのローカル配信

## 実ブラウザ

Codex in-app Chromiumで `127.0.0.1:3111` を使用し、Admin 1 + Display 3（Main / Side / Mobile）を接続した。加えて実Chrome 1440×825を `127.0.0.1:3113` で確認した。

- Desktop: base画像、局所open口形、字幕、ヘッダーを目視。口パッチ境界・顔全体の切替なし
- Browser TTS: `closed → half → open`を実DOMで連続採取
- local WAV: Main Audio Masterは`closed/half`、Side/Mobileは`closed`固定
- Blink: 実時間採取でclosed 3 sample / open 67 sample。口用`data-mouth`と別の`data-blink`で動作
- Chrome固有の未bind timerで`Illegal invocation`を検出し、timerを`globalThis`へbindして修正後console warning/error 0件
- Preset: normal / warning / hijacked / hostile / shutdown / recoveryを3 Displayへ実行。3台のpreset/state一致
- shutdown: 3台とも`data-blink=closed`で停止。recoveryでopen・自動Blink再開
- CLEAR: 3台の字幕が空。BLACKOUT: 3台とも全面grid。BLACKOUT中にMobileをreloadして暗転復元、RESTOREで3台解除
- SHOW RESET: Cue位置が開始、字幕/音声待機、Preflight READYへ復帰
- Admin 390×844: `innerWidth=390`、`scrollWidth=clientWidth=375`で横スクロールなし
- Chrome desktop 1440×825: image mode、自然な閉眼frame、Preflight asset set、console warning/error 0を確認。自動化ChromeではSpeech Synthesis APIが無効だったため、Browser TTSの根拠はAPI有効なin-app Chromiumで採取

## LAN / offline

Serverは`0.0.0.0`待受、同一hostのHTTP/WSを使用する。Wi-Fi IPv4 `http://172.20.113.11:3111/health`へLAN address経由でHTTP 200、3 Display ONLINEを確認した。インターネットなしでも中核機能は完結する。

## 長時間試験

- 短縮sanity: 0.1分、18/18操作成功、failure 0、Display reconnect 3、Admin reconnect 1、Audio Master変更1、RSS +2,043,904 bytes
- 30分soak: **PASS**。849/849操作成功、failure 0、Display reconnect 3、Admin reconnect 1、required offline 2、Audio Master reconnect 1 / change 1、presentation 141、BLACKOUT 70、local audio 71、abnormal exitなし。RSS 65,277,952 → 73,351,168 bytes（+8,073,216 bytes、128MiB上限内）

## 受入条件52項目

| # | 判定 | 根拠 |
|---:|:---:|---|
| 1 | ✅ | v0.4.0 API/UIを保持、既存43試験PASS |
| 2 | ✅ | 基準・最終とも既存43/43 PASS |
| 3 | ✅ | 4 PNGをローカル配信pathへ配置 |
| 4 | ✅ | `AVATAR_ASSET_SETS.yokogawa-v1`の4 ID |
| 5 | ✅ | `base.png`を常時最下層に描画 |
| 6 | ✅ | half画像を口周辺clipで統合 |
| 7 | ✅ | open画像を口周辺clipで統合 |
| 8 | ✅ | closed eyes画像を眼鏡内clipで統合 |
| 9 | ✅ | base固定＋局所overlay方式 |
| 10 | ✅ | `data-mouth` closed/half/open |
| 11 | ✅ | Browser TTS simulated実ブラウザ採取 |
| 12 | ✅ | Web Audio audio-reactive既存＋実ブラウザ採取 |
| 13 | ✅ | Browser TTSで3口形を確認 |
| 14 | ✅ | local WAVでMasterの口形変化を確認 |
| 15 | ✅ | 局所clip、open口形スクリーン目視 |
| 16 | ✅ | `BlinkController` |
| 17 | ✅ | 3000〜6000ms unit test |
| 18 | ✅ | 100〜180ms unit test＋実時間採取 |
| 19 | ✅ | 口状態を保持する共存unit test |
| 20 | ✅ | shutdown閉眼停止を定義・3台確認 |
| 21 | ✅ | normal目視 |
| 22 | ✅ | warningを3台確認 |
| 23 | ✅ | hijackedを3台確認 |
| 24 | ✅ | hostileを3台確認 |
| 25 | ✅ | shutdownを3台確認 |
| 26 | ✅ | recoveryを3台確認 |
| 27 | ✅ | state snapshot/reload、BLACKOUT中Mobileで確認 |
| 28 | ✅ | BLACKOUT中Blink停止・再接続復元 |
| 29 | ✅ | CLEAR/BLACKOUT/RESTOREを3台確認 |
| 30 | ✅ | 旧Show File補完、mode/asset検証 |
| 31 | ✅ | Preflight READY、Avatar asset set表示 |
| 32 | ✅ | 既存Rehearsal試験PASS |
| 33 | ✅ | Admin 390×844目視 |
| 34 | ✅ | scrollWidth = clientWidth |
| 35 | ✅ | Admin 1 + Display 3実ブラウザ |
| 36 | ✅ | Chromium desktop目視・console 0 |
| 37 | ✅ | test-tone WAV audio-reactive |
| 38 | ✅ | Browser TTS simulated |
| 39 | ✅ | 実時間Blink sample |
| 40 | ✅ | 6 Preset state同期・目視 |
| 41 | ✅ | LAN IPv4 health HTTP 200 |
| 42 | ✅ | 最終コードで30分soak完走 |
| 43 | ✅ | 849/849、failure 0 |
| 44 | ✅ | abnormalExit false |
| 45 | ✅ | npm audit 0 vulnerabilities |
| 46 | ✅ | README v0.4.1更新 |
| 47 | ✅ | 本検証記録＋root入口更新 |
| 48 | ✅ | Phase 4記録は不変、Phase 4.1を別記録 |
| 49 | ✅ | 最終commit後working tree clean |
| 50 | ✅ | 全Phase 4.1 commitをorigin/masterへpush |
| 51 | ✅ | annotated `v0.4.1`を作成・push |
| 52 | ✅ | `v0.4.0` tag commit `44c2857`不変 |

## 残余調整

口・目のclip範囲、Presetのfilter強度、Avatar表示サイズは演出会場の投影条件に合わせてCSSだけで微調整できる。追加表情、全身、phoneme、3D、VOICEVOX、Audio ZoneはPhase 4.1の範囲外。
