# 別PCへの本番引継ぎ（2026-10-16）

## 軽量配布の前提

- Node.js 20以上とnpmは導入済み。ChromeまたはEdge、HDMI表示先、会場の音声機器は使用PCで用意する。
- Node本体、node_modulesのZIP、ブラウザprofile、OSの機器設定は同梱しない。依存関係は既存package-lockから導入する。新しいproduction依存の追加なし。
- 予備WAV・静止画は[指定Drive](https://drive.google.com/drive/folders/1GF_cvicowUErYlBMJ0fe9o31UyT4sAiH)に別配布し、通常アプリへ重複同梱しない。

1. 別PCへの共有には、`scripts/archive-production-handoff.py`で生成する`横川AI_別PC本番一式_Node導入済み.zip`を使用する。通常再生に必要なソース・確定素材・設定・手順だけを収録し、過去の録画・検証画像・Git履歴・Node本体・node_modulesを除く。受取側にPythonは不要。展開後の`yokogawa_ai`フォルダで操作する。
2. `setup-production.cmd`を実行する。実行内容はNode 20以上の確認、`npm ci --omit=dev`、素材等のSHA256検証。**この準備時にはnpm registryへの接続または必要なnpm cacheが必要**。既存の開発用node_modulesを入れ直さないよう、新しいフォルダで実行する。
3. `start-yokogawa-ai-single-pc.cmd`を実行する。内蔵画面で`http://localhost:3000/admin`、投影画面で`http://localhost:3000/display`を開く。導入済みのNodeをPATHから使用する。固定Showの本番再生中にはインターネットは不要。
4. AdminでProduction Resetし、開始位置を確認する。DisplayをAudio Masterにして明示的に音声を有効化する。今回の素材では**21/21 decoded**（17発話＋起動／HACK／ERROR／復旧）が目安。Preflightで謎3点・復旧SEを含む全7 slotのREADYを確認する。
5. Windowsの拡張表示、1920×1080、ブラウザの実出力先、PA音量、スリープ／画面オフ、通知、電源接続を現地確認する。通常Cue、3謎の四辺、STOP／BLACKOUT／REPLAY／緊急Cue移動を確認する。NEXTは1500ms保護。

## 引継ぎ範囲

本番Show／Cue／字幕・文間／音量設定／Voice Profile、全参照WAVとSFX、Avatar、最新版の謎PNGをmasterに保存している。`config/production-portable-files.json`が配布対象と整合性一覧。`node scripts/verify-production-portability.mjs`で再確認できる。

GitHubのmaster全体には既存の過去録画・検証記録が残るため、全体ZIPや通常cloneは本番配布ZIPより大きい。Gitで取得する場合も、通常起動に必要な要素はすべてmasterにある。履歴を書き換えるforce pushは行わない。

通常起動は`shows/production.json`を正として読み込む。現PCの`data/state.json`、再生履歴、端末ID、最後のCue、旧Display接続状態をコピーせず、安全な開始位置から明示操作する。

固定20 Cueの再生にはAivisSpeech engine・モデルは不要。自由発話やWAV再生成を行う場合は別途同じエンジン／モデルが必要。承認済み音声は再生成しない。

ソース・確定素材・依存バージョンは再現できるが、Windows／Chrome／GPU／HDMI／PAの機械状態はPC固有。今回の新フォルダ検証は別の物理PCの出音保証ではない。以前確認した無音後のclock差・物理冒頭未検証という残課題を引き継ぐ。

## Webアプリ停止時

[音響映像予備一式ZIP](https://drive.google.com/file/d/1n3v_ZwWATIxecTQq0xYNlyxG6twz9fDo/view)を事前ダウンロード・展開する。[予備運用手順](emergency-backup-operation-20261016.md)に従い、音響PCでCue別WAVを単発再生、映像PCで対応PNGを手動提示。謎3原本を印刷しておく。旧系と予備系の二重音声を避け、舞台進行担当が再開位置を指示する。

予備素材を作り直す場合は`npm run backup:export`、`node scripts/verify-production-emergency-kit.mjs`を順に実行する。生成先`production-backup`はGit対象外。録画・予備素材生成用のブラウザ／Python等は本番の通常再生には不要。
