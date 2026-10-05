# 横川AI — 7・201 Single-PC Production Runbook

## 採用運用

本番は7・201だけで横川AIを使用する。PCは教室後方に設置し、前方の教卓側HDMI端子まで20m HDMIケーブルで接続する。

- PC本体画面: Admin
- セカンドモニター: Display
- Server / Admin / Display / Production WAV: すべて同一PC内
- Wi-Fi / 会場LAN / Netlify: 本番動作には使用しない
- WebSocket: localhost内のCue・状態同期だけに使用
- WAV: WebSocket送信せず、`public/assets/audio` の正本をlocalhost HTTPから取得
- Free Speakを使う場合のみ、同一PC上のAivisSpeech Engineを使用

## 起動

1. HDMIを接続し、Windowsを「表示画面を拡張する」にする。
2. 必要ならAivisSpeechを起動する。固定WAVだけならAivisSpeech停止中でも公演可能。
3. `start-yokogawa-ai-single-pc.cmd` を実行する。
4. PC本体画面で `http://localhost:3000/admin` を開く。
5. セカンドモニター側で `http://localhost:3000/display` を全画面表示する。
6. Production ShowをDry Run後に適用する。
7. DisplayをAudio Masterにする。
8. Displayの「設定を保存して開始」を押す。
9. 固定WAVが全件preloadされ、Audio Readyになることを確認する。

Single-PC起動ではServerは `127.0.0.1` のみにbindする。Adminの接続先一覧にもLAN候補を表示しない。

## Production WAV preload

DisplayがAudio Masterかつ音声出力有効になると、`/api/audio-assets` からProduction固定WAV一覧を取得し、`/api/assets/:assetId` をlocalhost経由で事前fetchする。

- manifest: `Cache-Control: no-store`
- WAV: 既存の `Cache-Control: public, max-age=3600`
- preload fetch concurrency: 4
- Cue再生経路: 既存のHTMLAudioElementを維持
- HIJACKED effect / lip sync / STOP / REPLAY: 変更なし
- Audio Ready: preload完了後にのみServerへ通知

目的は、初回Cue実行後にSSD/HTTP取得を開始する待ち時間を本番開始前へ移すこと。AudioBuffer方式への全面移行は行わない。

## 本番前チェック

1. WindowsのWi-FiをOFFにする。
2. Admin / Displayの両方がlocalhostで開けること。
3. Displayが1台だけONLINEになっていること。
4. そのDisplayだけをRequired / Audio Masterにする。
5. 過去のDisplay B/C等がRequiredのまま残っていないこと。
6. Production固定WAV preloadが完了し、Audio Readyになること。
7. 代表Cueを確認する。
   - #001 NORMAL
   - #004 長文
   - #008 HIJACKED
   - #013 WARNING
   - #015 HOSTILE
   - #016 SHUTDOWN
8. STOP → REPLAYを確認する。
9. BLACKOUT → RESTOREを確認する。
10. HDMI出力先・Windows音声出力先を確認する。

## 受入条件

Wi-Fi OFFの状態で、以下がすべて成立すればSingle-PC本番運用をREADYとする。

```text
Server起動
→ Admin操作
→ Display表示
→ Production WAV
→ HIJACKED effect
→ STOP
→ REPLAY
→ BLACKOUT
→ RESTORE
```

## 障害時

### WAV preload失敗
Displayの準備画面に留まりAudio Readyへ進まない。Show Fileと `public/assets/audio` を確認し、再試行する。

### Displayを再読み込みした
固定WAVを再度preloadしてからAudio Readyへ戻す。本番中に不用意に再読み込みしない。

### Wi-Fiが切れた
Single-PCモードには影響しない。

### HDMI映像が消えた
Windowsのセカンドモニター認識・HDMIケーブル・教卓入力を確認する。Serverと音声系統は同一PC内で継続している。

### AivisSpeech停止
固定Production WAVには影響しない。Free Speak / Local TTSだけが使用不能になる。
