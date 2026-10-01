# v0.5.0 Release Notes — Phase A

Phase 4.2 / v0.4.2の構図、6 Preset、画像Avatar、Audio Master、複数Display、Cue、Free Speak、BLACKOUTを維持したまま、公演演出の機能基盤を追加しました。

## Added

- Schema v3とSchema v2自動migration
- 13 Transition、17 Operation Overlay ID、5 Scene Visual type
- Server-authoritativeなtarget別Overlay / Visual / Transition / Unlock state
- 0→100%の複数Unlock Gauge、3〜10秒設定、100%保持、STOP / REPLAY / reconnect
- Admin Current/Next演出詳細、Sync Markers、Cue位置移動と直接実行の分離
- Phase A 27 Cue demo Show
- Phase A unit / integration / Admin 1 + Display 3 browser / visual / soak試験

## Compatibility

- Schema v2 Show Fileを受理してv3へ正規化します。
- Phase 4.2の標準6 Preset ID、Avatar Asset、Cue kind、WebSocket操作を維持します。
- 新フィールドはoptionalで、旧Cueは従来表示のまま動作します。

## Operator Notes

- 異常→乗っ取り、Unlock 100%→緊急、Shutdown→Recoveryは自動進行しません。
- `shows/phase-a-demo.json` をDry Run後にimportし、NEXTで進行してください。
- STOPは音声と進行中演出を停止します。BLACKOUTは引き続き最上位です。
