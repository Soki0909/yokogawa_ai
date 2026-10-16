# 別PCへの本番引継ぎ（2026-10-16）

## 必要なもの

- Windows x64、インストール済みChromeまたはEdge、HDMI表示先、会場の音声出力機器。
- 現在のmasterを丸ごと展開したフォルダ。部分的に`public`だけをコピーしない。
- Node.js 22.15.0公式Windows x64配布ZIPと、package-lock固定のproduction依存ZIPは`vendor`に同梱。LICENSE／各依存のライセンスもZIP内に含まれる。新しいproduction依存の追加なし。

1. 新しいフォルダにmasterを取得し、`setup-production-offline.cmd`を実行する。インターネットやグローバルNode／npmのインストールは不要。同梱ZIPとpackage-lockのSHA256を検証して展開する。既存node_modulesは勝手に上書きしないので、初回は新しいフォルダを使う。
2. `start-yokogawa-ai-single-pc.cmd`を実行。内蔵画面で`http://localhost:3000/admin`、投影画面で`http://localhost:3000/display`を開く。同梱Nodeがあれば自動的に使用する。
3. AdminでProduction Resetし、開始位置を確認する。DisplayをAudio Masterにして明示的に音声を有効化する。今回の素材では**21/21 decoded**（17発話＋起動／HACK／ERROR／復旧）が目安。Preflightで謎3点・復旧SEを含む全asset slotがREADYか確認する。
4. Windowsの拡張表示、画面解像度1920×1080、Chromeの実音声出力先、PAの音量、スリープ／画面オフ、通知、電源接続を現地で設定・確認する。ブラウザprofileやWindowsのdevice ID・音量ミキサーはPC固有で、Gitからは復元しない。
5. 通常Cue、3謎の四辺、STOP／BLACKOUT／REPLAY／緊急Cue移動を実機で確認する。終了待ちロックはなく、NEXTは1500ms保護。

## 何を引き継ぐか

本番Show／Cue／字幕・文間／音量設定／Voice Profile、すべての参照WAVとSFX、Avatar、最新版の謎PNGをmasterで保存する。`production-backup`にCue別予備WAV・静止画・原本謎PNG・操作表を保存する。

通常起動は`shows/production.json`を正として読み込むため、現PCの`data/state.json`を持ち出す必要はない。保存済みShowとの設定を照合した上で、この安全な初期化を維持する。過去の再生履歴、端末ID、最後のCue位置、旧display接続状態をコピーして勝手に再開させない。

固定の本番20 Cueの再生にはAivisSpeech engine・音声モデルの追加インストールは不要。自由発話やWAV再生成まで行う場合は別途同じAivisSpeech／モデルが必要であり、本同梱物の動作保証範囲に含めない。既存の承認済み音声を再生成しない。

ソース・素材・Node／依存パッケージは再現できるが、Windows／Chrome／GPU／HDMI／アンプの完全な機械状態をGitだけで複製することはできない。元PCの検証は新PCの音響保証ではない。以前確認した無音後のclock差・物理冒頭未検証という残課題も引き継ぐ。

## Webアプリ停止時

`production-backup/README.md`に従い、音響PCでCue別WAVを単発再生、映像PCでCue別PNGを手動提示する。謎原本3枚は事前印刷も用意する。元系と予備系の二重再生を避け、舞台進行担当が切替と再開位置を指示する。
