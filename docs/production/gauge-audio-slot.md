# 解錠・復旧の共通ゲージ音

保存先：`C:\Users\kumes\Documents\yokokawa_ai\public\assets\audio\production-gauge.wav`

- ファイル名：**production-gauge.wav**。約5.3秒、16-bit PCM WAV。48kHz推奨、mono／stereo対応。MP3の拡張子だけを変えたものは不可。
- 同じファイルをP-012とP-V07で再利用する。保存後にサーバーを再起動し、Displayで音声を再度有効化する。ほかの現素材がすべて揃っていればdecodedは21件から22件になる。
- P-012：GOから4519ms後、解錠ゲージ開始と同時に再生。認証セリフの後から鳴り、ゲージの5.0秒で終了する。
- P-V07：GOと同時、復旧ゲージ開始時に再生し、ゲージの3.8秒で終了する。
- gainは両方0.8。既存の`production-recovery.wav`は復旧完了時の別音で、GOから4600ms後のまま。
- 映像優先。約5.3秒の音源を共通で置くと、各ゲージ時間まで再生し、最後40msで短くフェードアウトする。音程・再生速度は変えない。短い音源ならその末尾で終了し、ループしない。既存復旧完了音の前にゲージ音が終わる。ゲージ表示・既存演出のタイミングは変更しない。
- 未配置／不正WAVではこの音だけを無音にし、Preflightのゲージ音欄にMISSING／INVALIDを表示する。未配置でもShowを進行できる。
- 実素材を配置後はPreflight READY、冒頭・末尾・復旧完了音との重なり・PA音量を確認する。STOP／NEXT／BLACKOUT等は既存のSFX停止経路を使う。

## 2026-10-16の採用素材・短時間再試験

配置原本は6.08秒・48kHz stereo／32-bit float。原本を`artifacts/audio-reliability-20261014/gauge-slot/original-float32.wav`に保全し、16-bit PCMへ変換した。ユーザーによる聞こえ方の確認を経て、**ゲージ音の素材だけ元音源比＋12dB**を採用。Cue gain 0.8、他のWAV・SE音量・Voice Profileは維持。

採用WAVのpeakは0.8586、full-scale samplesは0。SHA256は`0e9138945429553965ca88f1dbb23304cccc430e8aa99e04744bc3af6226aaa8`。

通常ChromeでP-012／P-V07を実行し、音源の開始・5.0秒／3.8秒終了・復旧完了音との分離・STOPを確認した。ユーザーから「聞こえる・この音量でよい」との聴感回答あり。Windows loopback録音に開始後のdiscontinuity／timestamp errorはなかったが、元音源との波形照合はINCONCLUSIVE。マイク測定・HDMI本番機材・長時間待機の合格としては扱わない。長時間試験は今回実施していない。

音源を後からGitHubへ反映するときは、実WAVもcommitし、`node scripts/build-production-portable-manifest.mjs`で整合性一覧を更新する。本番配布ZIPとDrive予備WAVは、その時点の素材で作り直す。
