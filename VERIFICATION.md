# 横川AIの検証記録

演出の進行、音声再生、字幕、緊急操作、再接続時の状態復元を、自動試験と実ブラウザーで確認しています。

| 対象 | 記録 |
|---|---|
| 最終構成の自動試験 | [2026年10月24日の全202件・直列実行結果](docs/production/record-archive-20261024.md) |
| 24 Cue版の演出・暗転・追加音声 | [演出改訂と検証](docs/production/post-show-candidate-operation-20261017.md) |
| 長時間待機・音声準備 | [信頼性検証](docs/production/production-reliability-result-20261014.md) |
| 字幕・台本・画像素材 | [字幕と素材の検証](docs/production/subtitle-script-assets-report.md) |
| 画面演出・複数Display・状態復元 | [Phase B検証](docs/phase-B/verification.md) |
| 固定音声とローカル音声合成 | [Phase C検証](docs/phase-C/verification.md) |
| 録画・画像・ログの保管 | [記録アーカイブ](docs/production/record-archive-20261024.md) |

2026年10月24日の直列実行は202/202 PASSです。並列実行ではサーバー起動待ちや通信イベント待ちのタイムアウトが記録されています。各報告の件数・仕様・判定は実施時点のものです。

自動試験を再実行する場合：

```powershell
node --test --test-concurrency=1 test/*.test.js
```

ソフトウェア試験は、実際のHDMI・PAを通した音量や発話冒頭の聞こえ方を保証するものではありません。会場出力は現地で確認します。

[開発段階ごとの記録](docs/archive/development-index.md) · [システム解説](docs/system.md)
