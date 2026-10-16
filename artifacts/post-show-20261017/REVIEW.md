# 10/17 演出改訂候補：検証・自己批評

**候補実装の技術レビューPASS。本番採用はNO GO（ユーザー承認・新発話試聴・会場音響確認・既知リスク判断待ち）。** master / origin/master / 安定版タグは da09d3bbcfed8d3d9a2568dd7be621359160ddc7 のまま。専用ブランチ `codex/post-show-cue-revision-20261017` 内だけの変更。commitのみ行い、push・統合・deploy・共有Docs/Drive変更は行っていない。

## set_goal

成功実績のある安定版と既存20 Cue・17発話・再生経路・1500ms保護を保全したまま、ゲージだけ−3dBと4 Cueを足す。24 Cue/23音声をブラウザ両解像度、録画、緊急操作、素材整合性で検証し、独立した候補配布物と戻し方を残す。

## 実装と操作

|Cue|GOの合図|内容|
|---|---|---|
|P-V00|M-0がフェードアウトし照明が立つ時|開演前の黒から既存初期画面へ2.5秒。Avatar・音・字幕なし。P-001は別NEXT。|
|P-V03|Scene 5の「謎は全て解けました！ 201の教室に集合してください！」後|謎1と字幕・overlayを閉じ紫HIJACKEDを保持。集合と芝居を待ってP-011を手動NEXT。|
|P-V08|「さあ、今度こそ全員で――7号館から脱出だ！」後の溶暗、M-8前|全体を1秒で完全な黒へ。緊急BLACKOUTとは独立。|
|P-021|カーテンコールが終わった後|青いNORMAL＋Avatarが2秒でフェードイン。2.2秒後から31.046秒の固定退場案内。6文タイプライター、終了後NORMAL保持。|

ゲージ音だけ元の承認済み+12dB PCMから1回の−3dB処理で+9dB相当へ。RMS差−2.999999dB、peak .858582→.607819、48kHz stereo PCM16・6.08秒・ヘッダー/長さ維持、クリップ0。元float32の直接+9dBとの最大差1 LSB。Cueゲイン.8、P-012上限5秒、P-V07上限3.8秒、復旧チャイム4.6秒を維持。元+12dB takeは `stable/production-gauge-plus12db.wav` とGitの安定版に保全。

P-021はインストール済みの阿井田茂1.0.0・Calm（1310138977）、元Profileのパラメーターで制作。文間450/650/350/650/350ms、既存の文境界正規化・合成方式。新しい6文と最終WAVだけを制作し、既存17発話・Profile・既存20 Cueオブジェクト・他SE・謎画像は安定版と同一。試聴サンプルは `public/assets/audio/production-post-show-021-exit.wav`（プロジェクト直下からのパス）。発音と主観的な採用は未承認。

冒頭0.7秒の欠落対策は未実施。既存WAVへの無音追加・常時ノイズ・Web Audio経路変更・全体時間補正・ドライバー変更なし。新しいフェードは表示専用の黒い合成レイヤーと既存のCue settlementを使用し、新規の音声タイマーを持たない。

## 最終検証

- `npm run check`: **200/200 PASS、skip 0、FAIL 0** (`check-final.log`)。
- 既存Production Browser E2E: **PASS**、両解像度、既存HACK/解錠/復旧/謎提示、Scene Rehearsal、STOP/REPLAY/BLACKOUT/RESTORE、reload/reconnect、Composer再利用・書出し、console/network異常0 (`production-browser.log`)。
- 追加E2E: **PASS**。24回のNEXT順序、1500ms拒否（後実行なし）、4新Cueへの実Admin緊急移動→明示NEXT、STOP後の遅延発話抑止、REPLAY、Resetの暗転とAudio READY維持、reloadと新Displayの暗さ、過去の音声再生なし (`accepted-browser/report.json`)。
- 全23 WAVの実デコード、8/8 slot READY。P-012/P-V07の実source.start上限5/3.8秒と復旧音4.6秒を検証。P-021はGOから内部source.startまで2232ms（意図した2200ms待機込み）。6文の字幕開始は内部source.start＋文開始時刻から91〜151ms後。既存の出力pipeline見積りを含むソフトウェア観測で、物理AV遅延ではない。全体補正は追加していない。
- 初期黒、P-V08完了黒、Reset/reload黒はPNG全画素RGB=0 (`accepted-browser/black-frame-verification.json`)。途中フェードはopacityが0と1の間であることを実測、両解像度のPNGを保存。
- 録画 **1920×1080 / 1280×720ともPASS**、30fps/H.264＋AAC、約223秒、全24 Cue、18発話＋7 SEの各音声ID、完了後2秒間隔、全編デコード。`recordings/1920x1080` と `recordings/1280x720`。Cue短文字幕は録画のみ。
- 最終配布候補278ファイルのハッシュ、8 slot、別の新規フォルダーでnpm ciと実ランチャー起動・全素材HTTP取得 **PASS** (`portable-smoke.json`)。Node本体/node_modules/ブラウザprofile/秘密情報は配布しない。別の物理PCでの試験ではない。
- 予備素材24 WAV＋24 PNG＋原画3 PNG（音あり19 Cue、無音5 Cue） **PASS**。PCM16/48kHz/stereo、クリップ0、名前・Cue順序・source SHA・待機と最大再生時間を検証 (`staging/emergency/validation.json`)。新4 Cueの名前は候補案で共有台本には未記入。完全無音WAVは1秒で音響操作不要、静止画はフェード動画の代用ではない。
- 候補ZIP2本のCRC・全ファイルSHA一致 **PASS** (`staging/archives.json`)。公式バックアップは未上書き。

## 自己批評と検証中の修正

録画の開始/途中/完了フレームを見比べた。P-V00はAvatarを出さずに元の青画面へ穏やかにつながる。P-V03は白い謎画像と字幕が消えてHACKに戻り、集合中に謎が残らない。P-V08は前の字幕をポンと消さず、Avatar/UIごと黒へ落とす。P-021は青への復帰を見せてから発話し、720pの長文も同じ枠内の2行で欠けずに読める。色・明暗と大きい字幕による状態差は映像上明確。会場の距離・投影輝度・音響での見え方は未確認。

初回の録画検証で25音声イベントに対し24収録しか得られず、録画hookが同じAudioContext内の重なる音を1録音へまとめていたことを確認。**録画ツールのみ**destination gain別の収録に修正し、両録画で全25 IDを検証した。Production音声経路は変更していない。

追加テスト側のセレクター誤記、AdminタブにDisplayが隠れる条件、PNG保存所要時間をフェード時刻に混ぜた判定を修正し、最終の受入試験で全項目を再実行してPASSした。初期の失敗ログと途中試験の画面は採用根拠にしていない。controls-first試験のNEXT通し画面は720pを保持していたため、PNGヘッダーで寸法を監査し、誤った1920プレフィックスだけを1280へ訂正した（画像SHAは不変、`accepted-browser/artifact-dimensions.json`）。4新Cueの途中フレームと字幕同期は別途両解像度で測定済み。表示中の実画面の評価と、非表示タブでの長時間動作保証は区別する。

## 未検証・採用条件・ロールバック

HDMI/PAの物理出音、音声冒頭欠落の原因・解消、物理映像同期、新発話の発音/主観品質、長時間待機は未検証。長時間soakは本改訂では行っていない。`src/server.js` の字幕callbackでmissing Displayが例外となり得る既知リスクは指示どおり修正していない。今回の範囲で再現しなかったことをもって解消扱いにしない。別途の修正承認またはリスク採用判断が必要なrelease gate。

開演前の音声準備はDisplay **Sキー**で開く。緊急Cue移動は「移動内容を確認」→「確定：停止してこのCueを次にGO」→明示NEXT。操作詳細は `docs/production/post-show-candidate-operation-20261017.md`。

元の `C:\Users\kumes\Documents\yokokawa_ai` のmasterは変更していない。候補を止め、元の安定版フォルダーの従来ランチャーを起動すれば戻せる。候補の状態ファイルをコピーしない。ローカルタグ `production-stable-first-show-20261016` からも安定版へ到達できる。reset --hard/clean/既存素材の上書きは不要。
