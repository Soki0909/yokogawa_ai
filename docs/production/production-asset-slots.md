# Production素材の固定slot

以下のパスへ本番素材を配置し、serverを再起動するかAdminを再読み込みしてください。code変更・Show編集は不要です。Production Resetでも同じslotを使用します。

| 素材 | repository内の固定パス | 使用Cue |
|---|---|---|
| 起動音 | public/assets/audio/production-startup.wav | P-001 |
| HACKノイズ | public/assets/audio/production-hack-noise.wav | P-004内の映像乱れ |
| ERROR警告音（共通） | public/assets/audio/production-warning.wav | P-013、P-014 |
| 謎1 | public/assets/visual/production-puzzle-01.png | P-V02 |
| 謎6（最終問題） | public/assets/visual/production-puzzle-06.png | P-011 |
| 謎7（非常停止） | public/assets/visual/production-puzzle-07.png | P-V05 |

絶対パスの基点は `C:\Users\kumes\Documents\yokokawa_ai`。音は16-bit PCM WAV、mono/stereo、推奨44.1kHz、180秒以内。画像はPNG、8MB以内、縦横比自由。Presenterはcontainで最大表示しcropしません。slot名を変更しないでください。

Preflightに各slotのREADY／MISSING／INVALIDとパスが表示されます。未配置・形式不正はWARNINGとして明示し、同梱の代替音・代替画像でspeech／Cue進行を維持します。`GET /api/production-slots`でも検証と再読込ができます。素材を差し替える操作は演出中を避け、STANDBYで実施しAudio Ready・画像を再確認してください。

P-013／P-014はいずれも警告音終了後にspeech。同じwarning slotを使い、実際のendedもDisplayで確認します。指定外の音はProduction Cueから除外しています。謎本文・ヒント・停止コードは素材担当から受領してください。
