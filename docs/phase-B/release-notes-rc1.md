# v0.6.0-rc.1 Release Candidate Notes

Phase B autonomous visual candidateです。最終Visual承認版ではありません。

## 主な変更

- 6 Presentation Presetを舞台映像として再設計し、色だけでなく構図・密度・motionで状態差を強化。
- Phase B用Visual token layerを追加し、後続レビューの強度調整をCSS token中心で行える構造へ変更。
- anomaly / takeover / hostile / shutdown / recoveryなどのTransitionを専用layerで分離。
- Final Challenge、Operation Overlay、3系統radial Unlock Gauge、Emergency fractureを改良。
- reduced motion、BLACKOUT優先、再接続時の過去Transition非再生、NORMAL復帰cleanupを維持。
- Unlock 100%保持と緊急中断のserver-authoritative stateを修正。
- 状態・遷移Screenshot、contact sheet、self-critique、30分soakログをreview packageへ追加。

## 互換性

- Phase A / `v0.5.0`は保持。
- Show Schema v2/v3、Admin、複数Display、Global Audio Master、Free Speak、Cue、BLACKOUT / RESTORE、ローカルLAN運用を維持。
- 新規production dependencyなし。

## レビュー状態

> Phase B autonomous visual candidate complete / user visual review pending

感性的な確認項目は [`review-guide.md`](review-guide.md) を参照してください。

