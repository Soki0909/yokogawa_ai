# Display確認用録画

録画は今後も常に左上へ「Cue ID｜短い名称」を表示する。録画専用の注釈で、本番DisplayやAIセリフ字幕には追加しない。次のCueまでの2秒待機中も現在のCue名を保持する。

配置済みProduction素材slotと実際のSFX長を使用する。SEのcanonical pathはWAVのため、MP3で受け取った素材は元ファイルを残して16-bit PCM WAVへ変換して配置する。

```powershell
npm run record:production
# 保存先を指定する場合
npm run record:production -- artifacts/recordings/my-review
```

Chrome（なければEdge）とFFmpegを使う。npmの追加依存は不要。パスが標準以外なら `CHROME_PATH` と `FFMPEG_PATH` を設定する。

`shows/production.json` の本編ルートの有効Cueを順番に実行し、音声の実際のcompleted通知、Cue SFX、transition、unlock、時限overlay/visualの完了を待った後、2秒待って次へ進む。繰り返す背景animationは完了待ちの対象外。最新台本で削除された010/017/018はShowから除外済み。

1920×1080のChrome DisplayをCDP screencastで撮影する。WAVとSFXは実際のWeb Audio出力から収録し、文字幕・flow reveal・HIJACKED再生エフェクトも含む。タイムスタンプで映像と音声を合わせ、FFmpegで30fps H.264/AAC MP4へ変換する。screencastの実取得fpsに応じてフレームが補間ではなく複製される。

保存物:

- `production-display-1920x1080.mp4`：音声付き全編
- `cue-timeline.json`：Cue開始・音声終了・演出終了・次Cueの時刻
- `review.html`：Cue先頭へ移動するボタン付きのローカル動画確認ページ

サーバーstate・ログ・ブラウザprofileは毎回専用の一時領域を使う。通常運用中のShow、WAV、Voice Profileは変更しない。生フレームと音声clipはMP4生成後に削除する。録画は演出レビュー用で、本番Cueの自動進行機能ではない。
