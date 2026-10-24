# 記録アーカイブとローカル整理（2026-10-24）

本番コード・演出・音源は最終版 `5135975d53e985ff22e1211d4a6194120ac9c287` のまま。今回のcommitは保存先案内・既存の未追跡指示書のみ。

- 保存先：https://github.com/Soki0909/yokokawa_ai/releases/tag/production-records-20261024
- 最終録画：https://github.com/Soki0909/yokokawa_ai/releases/download/production-records-20261024/production-display-1920x1080.mp4
- 全6,000記録ファイルを保存。重複を含む元データ約3.60GB。元パス・各SHA256はReleaseの `record-archive-manifest.json` と `record-archive-supplement.json` に記載。
- ZIP 11本＋一覧2本＋復元手順＋単独の最終動画＝15 assets。ZIP内の全原本SHA256と、GitHub側の全15 assetsのSHA256を照合済み。
- records-01〜10は同一内容を重複除去。ダウンロード・展開後、`RESTORE.txt` のPowerShell手順で元の全パスへ復元できる。records-11は追加記録で、そのまま展開する。
- 記録はGitHub Releasesへ保管。通常のGit Pullでは大容量録画を取得しない。

## ローカル

録画・スクリーンショット・検証ログ・音声比較記録はローカルから除去。試験用コピー、ダウンロードした一時インストーラ／モデル、失敗したGit処理の一時ファイルを整理。Gitは全参照・履歴を保持して圧縮（`git gc --prune=never`）。

現在のPCと候補worktreeは記録だけをsparse checkout対象外とした。Git自身のルール照合で、本番必須285ファイル（候補284）の全保持、コードの除外0を確認してから適用した。GitHubの記録を削除するcommitは行っていない。

本番のpublic内WAV・謎画像・Avatar、コード・設定・依存、Speech Composer編集データ、復旧用production-backup、候補ブランチのコードを保全。これらは記録ではなく動作／編集／復旧に用いる機能データとして残した。

ローカル容量は約9.0GiBから約1.68GiB（約1.80GB）へ。約1.37GBはGit履歴。本番の更新手順は従来どおり。

## 検証

必須285ファイルSHA256一致、8 slots READY。全体テスト初回は201/202（Phase Aのサーバー起動待ち1件）。当該単独再試験PASS。コード・待ち時間は変更していない。

並列再試験でも別の通信テストに1件のイベント待ちタイムアウトが発生。競合と欠落を区別するため、`node --test --test-concurrency=1 test/*.test.js` で全202件を直列実行し、202/202 PASS（約35秒）。本番コード・音源・設定・Cue・スクリプト・テスト・依存定義が最終版5135975と同一であることをGit diffでも確認。
