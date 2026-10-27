# 横川AIの画面と仕組み

横川AIの演出、音声と映像の同期、会場での動かし方をまとめています。

| 資料 | 内容 |
|---|---|
| [作品紹介](../README.md) | デモ動画と代表画面、実現した機能 |
| [画面と動画の解説](showcase.md) | 起動から暴走、停止・復旧までの見どころ |
| [演出を支える仕組み](system.md) | Cue、状態同期、音声、アバター、字幕の構成 |
| [運用資料](operation.md) | 1台PCでの起動、画面操作、再生準備 |
| [検証記録](../VERIFICATION.md) | 実施した検証と記録へのリンク |

## 制作の記録

音声制作では、候補の比較、話速や文間の調整を行い、台本に沿った固定音声へ仕上げました。画面は通常・警戒・制御奪取・暴走・停止・復旧の状態を持ち、謎の提示や認証、解錠の演出を重ねています。

- [音声制作の実験と比較](../experiments/voice-lab/README.md)
- [開発段階ごとの要件・実装・検証](archive/development-index.md)
- [上演向けの演出改訂記録](production/post-show-candidate-operation-20261017.md)
- [録画・画像・検証データの保管先](production/record-archive-20261024.md)

過去の要件書・実装指示・運用記録は、各フェーズと `production/` に保存しています。旧READMEの詳細仕様は[実装・運用リファレンス](archive/runtime-reference.md)に収録しています。
