# Production refresh v2 完了報告

## 確認結果に基づく目標

最新版台本と既存Productionを照合し、記入用紙案内・第一問案内を同期、不要なAI集合案内を除去する。承認済みVoice Profileと原版WAVを保持し、文ごとの読み・間・字幕を編集して最終1 WAVに書き出せる構成、取消可能なSFX、起動・状態遷移・問題画像・Avatar配置・オペレーター画面・最新版Reset・Scene Rehearsal・全編録画を完成させる。実ブラウザと録画で自己批評し、必須gate通過後にcommit/push、masterへ統合して再検証する。新モデル採用、本人似Avatar、未提供問題、曖昧な非常停止内容は人の判断を残す。

## 30項目の報告

1. **開始状態**: master / HEAD / origin-master は `accac58f5916cd2368de23f35ec0787c93ee28f7`。既存の未commit録画ツールを今回の実装へ含めた。ユーザーの未追跡指示書・資料・過去artifactは保持した。
2. **set_goal（実際に設定した全文）**: 最新上演台本（2026-10-09 11:28 UTC）とaccac58の実装差分に基づき、追加の記入用紙案内・変更された第一問案内を承認済み音声で同期し、削除されたAI集合案内／復旧発話を除去する。既存調整済みWAVとVoice Profileを維持し、文単位編集・pause・最終WAVと字幕共通タイムライン、取消可能なSFX、暗転からの起動、画像未提供を明示する謎画像Presenter、最新版Show起動／Production Reset、運用Admin、舞台領域に下端配置する交換可能Avatar、Scene Rehearsal、1920×1080の全Cue録画を完成させる。automated tests、Production E2E、実画面と録画の自己批評、reload/reconnect、音声整合性、console/network、diff reviewを通し、許可済みcommit/pushと安全なmaster統合・再検証を行う。声の最終採用・本人似Avatar・未提供問題本文・曖昧な停止問題内容は保留として具体的に報告する。
3. **台本**: 『7号館からの脱出』14 tabs、modified `2026-10-09T11:28:22.972Z`。終了前の再取得でも同じ更新時刻。Google Docsは読み取りのみ。
4. **台本同期**: Scene 1の用紙案内を追加し、第一問発話を「第一の謎は、こちらです」へ変更。Scene 5の全員/声の台詞をAIで重複再生しない。Scene 7の廃止AI発話も除去。
5. **Cue**: P-019追加。P-010/P-017/P-018除去。P-V02 + P-009は案内発話→問題表示の1 Cue。P-V06 + P-016は停止→遅延した全停止発話の1 Cue。P-V07は100%→progress消去→NORMAL完全復旧まで1 Cue。本編21 Cue、16 speech。
6. **P-002**: 表示は「久安光」、読みは「ヒサヤス ヒカル」。はい。/例えば、そちらに/氏名の3区間を承認済みCalmで合成、350ms/450msの明示間を挿入。原版を保存し、新しい002 WAVを使う。
7. **Composer**: `/production-tools`。原版または現在適用中の最終WAVを文区間へ切り出し、変更した読みの区間だけ合成。Preview→明示export→Cue適用→Show保存の流れ。draftは通常Showと分離。
8. **文/間**: 。！？!?の分割、手動追加/削除、表示/読みの独立編集、0〜10000msの区間後pause。再分割と再合成を明示し、変更後に古いPreviewやexportを使えないようにする。
9. **最終WAV**: 44100Hz/mono/PCM16、silenceをPCMで結合、clipping/無音/形式/hash検査。1 speech Cue = 1 final WAV。13既存take再利用、002/009/019の3 final WAVを新規作成。原版18本は全てハッシュ一致。
10. **字幕**: 音声と同じstart/end区間を共有。開始通知から文を切り替え、長文は発話中に全文が読める速度でreveal。原版takeの境界はquiet-boundaryによる近似として明示。STOP/Reset/Rehearsal/BACKで古い表示・callbackを取消。
11. **SFX**: ローカルで生成した11種類の独自波形、12 Cue内呼出。第三者sampleなし。専用master volume、Audio Masterのみ再生、Cue generationで取消。録画には実Web Audio出力を収録。
12. **transition**: 起動/復旧はfade、停止はcut、乗っ取り/敵対は画面乱れと急変。紫HACK、認証カード、解錠meter、多重ゲージ→100%→異常、ERRORを色・形・動きで区別。
13. **startup**: 暗い初期画面→Avatar出現2600ms→発話。起動progress meterを除去。旧CSSのanimation抑制を録画で発見し修正。
14. **画像**: 第一問/最終問題/非常停止の3 slot。PNG/JPEG/WebP、8MB上限、signature/decode検査、contain。縦320×900、横1500×300を実表示で確認。未提供は中立の確認用枠。内容を推測して作成していない。更新URLへSHAを付けキャッシュ残存を修正。
15. **同梱Show**: `shows/production.json` / route Show は v2.0。通常起動は同梱最新版・Cue前・字幕なし。明示importまたは `SHOW_STARTUP_MODE=saved` で編集Showを選べる。
16. **Production Reset**: 最新版を再適用し、音声/SFX/字幕/演出/画像/blackout/待機callback/Cue位置を初期化。Display登録とAudio Readyを維持。Show Resetは編集Show定義を保持する。
17. **Admin**: version/台本時刻/Ready、現在・次Cue、俳優triggerと大きいNEXTを上部に配置。Rehearsal/詳細編集を下部へ。720pでもNEXTが画面内に収まる。未提供問題数を表示。
18. **Avatar配置**: Stageと字幕領域を分離し、Stage中央下端を字幕上端に接続。PNG内の透明余白をpaint insetで補正。1920×1080/1280×720/1600×1000/1024×768で位置と実描画を確認。
19. **Rehearsal**: Scene 2空Scene、Scene 6開始、Scene 7停止状態、reload/reconnectを確認。過去字幕/問題画像を残さず、正しい次Cueへ進める。遅延Cue中のSTOP/REPLAY/Rehearsal/Resetでstale発話なし。
20. **モデル比較**: 利用可能なfumifumi/まお/ろてじん（長老ボイス）/コハク/阿井田茂を固定文章・共通パラメーターで比較可能なWAVと画面へ。engineの利用条件を保存。Productionは阿井田茂Calmを維持、最終採用は保留。
21. **Avatar交換**: 既存のbase/mouthHalf/mouthOpen/eyesClosedローカルlayerを検査して適用、Resetで同梱へ復帰。本人referenceなしに似顔Avatarを作っていない。
22. **automated**: `npm run check` 155/155 PASS。speech PCM/間/timeline、WAV/hash、Show同期、SFX、Reset、Composer export/apply、callback取消、既存回帰を含む。
23. **Browser E2E**: 実Chrome Production E2E PASS。NEXT/BACK/STOP/REPLAY/BLACKOUT/RESTORE、Scene Rehearsal、cancel、画像upload、Composer/Avatar Preview、reload/reconnect、再起動の最新版選択。
24. **visual review**: 1920/720の代表演出と4 aspect配置を自己確認。Avatarの横ずれ/透明下余白、字幕の小ささ、起動抑制、問題画像cacheを修正。色だけでなく「5項目が統合される」「成功したはずが崩れる」「復旧してUIが消える」動きで客席へ意味を伝える構成。実会場の投影条件と実問題画像の可読性は画像提供後の確認対象。
25. **録画**: `artifacts/recordings/production-refresh-v2-final/production-display-1920x1080.mp4`。1920×1080/30fps H.264+AAC、168.33秒、21 Cue、音声28 clip。最小Cue後待機1.999秒（計時丸め）、全編decode PASS。`review.html`でCueへseek可。`npm run record:production -- <保存先>`で再生成できる。
26. **音声Ready**: 16 speech +11 SFX =27/27 preload。Audio Master Ready、reload/reconnect/Reset後Ready PASS。Voice Profile SHA unchanged、原版18/18 unchanged。
27. **回帰**: Production E2E browser error/warning 0、外部通信0、105 asset要求検証。専用console検査2ページwarning/error 0。`npm audit --omit=dev --audit-level=moderate` 脆弱性0。30分soakは指定どおり完了条件外。
28. **feature**: `codex/yokokawa-production-refresh-v2`、commit `a845baad9161941b2d675c43f251f6ea81b8a418`、originへpush済み。
29. **master**: fast-forward統合後に155/155 check、Production Browser E2E、原版18/18・Profile、全録画decode、audit 0を再検証し、masterをpush済み。HEAD = master = origin/master = origin/feature = `a845baad9161941b2d675c43f251f6ea81b8a418`。追跡差分なし。ユーザー資料と生成artifactだけ未追跡で保持。
30. **人の判断**: 新Voice Modelの採用、本人reference/許諾を用いたAvatar、未提供の3問題画像、非常停止ヒント/回答の○○。Scene 5地の文はAIと記すが実話者は全員/声である点も明記。これら以外の工程を確認待ちにはしていない。

主要変更: `src/audio/*`（編集/PCM）、`src/server.js`/`state-store.js`/`show-schema.js`（timeline/取消/Reset）、`public/*`（Display/Admin/Composer/SFX）、`scripts/*`（Show構築/録画/比較/検証）、`config/production-speech/yokogawa-ai-v2.json`、`shows/*`、新しいWAVとtests。追加production依存なし。
