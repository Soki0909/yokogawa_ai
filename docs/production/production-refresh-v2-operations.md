# Production refresh v2 operations

通常の `npm start` は `shows/production.json` の最新版を、Cue実行前・字幕なし・Avatar非表示の初期状態で読み込む。以前のShowを継続する必要がある場合のみ、保存ShowをAdminから明示的にimportする。明示的な従来起動も `SHOW_STARTUP_MODE=saved` で選択できる。

**Production Reset** は音声・SFX・待機callback・字幕・問題画像・overlay・blackout・Cue位置を初期化し、同梱最新版を読み込む。Display登録、Audio Master、現在のAudio Readyは保持する。Show Resetは現在の編集Showの定義を保持して位置を初期化する。

**Speech Composer**: Adminの「音声・字幕・素材編集」から開く。台詞を選択→表示文と読み上げ文を編集→句点/疑問符/感嘆符で分割、必要なら手動区間追加→区間後の間をmsで設定→文WAV準備→文Preview/全体Preview→明示的な最終WAV書き出し→現在のCueへ適用→Show保存。未変更区間は既存WAVを再利用し、変更区間だけ現在のCalm Profileで合成する。原版WAVを上書きしない。最終WAVは44100Hz mono PCM16、検査・SHA・同じ字幕区間のrecipe JSONを出力する。

Productionは各speech Cueで最終1 WAVを再生する。音声の開始通知から共有文区間時刻を使って字幕を切り替え、長文は発話終了前に全文を読める速度でrevealする。旧take由来の文時刻はquiet-boundary alignmentであり、必要に応じ稽古で区間を調整する。

**問題画像**: 第一問/最終問題/非常停止問題のPNG/JPEG/WebPを編集ツールから設定する。最大8MB、ブラウザdecodeとserver signature検査、縦横比を保持したcontain表示。未提供時は確認用枠だけを表示し、Adminに未提供数を出す。問題本文は生成しない。画像設定後もShowを保存する。Resetは同梱未提供枠に戻る。

**Avatar**: 現行layerを保持する。交換用の透明PNG/WebPを `public/assets/avatar/<set>/` に置き、編集ツールのbase/mouthHalf/mouthOpen/eyesClosedパスを指定してDisplayへ適用・Preview・Show保存。4 layerは同じ座標/寸法/口と目の位置を使う。本人reference・使用許諾・演出判断なしに寅さん/堀さん似のAvatarは作成しない。

**モデル比較**: `npm run voice:production:compare` でローカルエンジンのモデル一覧・利用条件・固定文章の同条件WAVを作成する。`/voice-comparison.html` で比較する。Production defaultは変更しない。今回5モデルが利用可能で、engine由来のpolicy原文を保存した。モデルbinaryを配布しない。

**録画**: `npm run record:production -- artifacts/recordings/<review-name>`。1920×1080、実Display演出・字幕・SFX・voice effectを収録し、各Cueの発話と有限演出/SFXが終わって2秒後に次へ進む。Chrome/EdgeとFFmpegが必要。生成は独立stateで通常運用を変更しない。

人の採用判断が必要なもの: 新Voice Model、本人referenceを用いるAvatar、未提供の問題画像、台本中の非常停止ヒント/回答の○○。Scene 5の地の文はAIアナウンスと記すが、実際の話者は全員/声へ更新済み。この曖昧さは報告し、AI集合台詞を勝手に復活させない。
