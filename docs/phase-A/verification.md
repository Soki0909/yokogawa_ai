# 横川AI Phase A / v0.5.0 検証記録

検証日: 2026-10-02（Asia/Tokyo）

基準: `master` / Phase 4.2 HEAD `8c0c5ef` / 既存annotated tag `v0.4.2` = `012829a`
対象: Performance Presentation System機能基盤

## 実装概要

Phase 4.2のNode.js / Express / `ws` / Vanilla HTML・CSS・JavaScript構成と6 Preset、画像Avatar、複数Display、Audio Master、Cue、Free Speak、BLACKOUTを維持した。Cue Schemaをv3へ更新し、v2 Showをoptional既定値で移行する。新しい演出状態はServerがtarget別に保持し、Display reconnectでは現在状態と時刻から復元する。

- `transition`: 13 ID、duration/intensity、開始/完了/STOP/reconnect
- `overlay`: 17 ID、title/message/progress/variant、自動消去
- `visual`: 5 type、show/hide、自動消去
- `unlock`: AUTH / CORE / GATE、3〜10秒、0→100%、100%保持、中断/replay/reconnect
- Admin: Current/Next詳細、Sync Markers、位置だけのCue jumpと直接実行を分離
- Demo: [`shows/phase-a-demo.json`](../../shows/phase-a-demo.json) にoperator-controlled 27 Cue

表示層は `Preset Environment → Avatar → Scene Visual → Subtitle/Status → Operation Overlay → BLACKOUT`。BLACKOUTは既存どおり最上位である。Sync Markers、operator/trigger note、履歴、他Display情報はDisplay snapshotへ含めない。

## 自動試験

```text
npm run check
71 tests / 71 pass / 0 fail

npm audit --omit=dev
found 0 vulnerabilities
```

Phase A追加試験はSchema v2→v3 migration、未知ID拒否、target別state、Unlock途中復元、STOP、Cue jump、auto clear/hide、Display layer、Admin編集、27 Cue demo、Show import rollback、Admin 1 + Display 3 real WebSocket flowを対象とする。既存58件を含む全試験が成功した。

## 実ブラウザ / Visual

Codex in-app ChromiumでAdmin 1タブ + Display 3タブを同時接続し、Preflight READY、Broadcast、Display Bだけへの個別Hostile（A/CはRecovery維持）、Audio Master A、Unlock 55%→100%保持、Emergency、Final Challenge、Hostile、Shutdown、Recovery、BLACKOUT/RESTOREを操作した。Admin/Display 4タブのconsoleはwarning 0 / error 0だった。

目視でBootにUnlock gaugeが出る問題と、Shutdownに中断済みgaugeが残る問題を検出し、`hidden`優先規則とoverlay scopeを修正して再撮影した。字幕、Avatar、左右rail、円形HUDの対称性、Overlayの中央軸に崩れはない。

Screenshot自己批評:

- clipping / unexpected scroll: 1280×720の全状態で主要見出し、字幕、左右railがviewport内。横・縦scrollなし
- overlap: Final ChallengeはScene VisualをOverlay背面へ意図的に重ねるが、観客向け主見出しは判読可能。その他は字幕とOverlayが別領域
- subtitle readability: 全状態で下部panelと高コントラスト文字を維持
- Avatar visibility: BLACKOUT以外は顔・輪郭を維持。Shutdownは暗くするが識別可能
- z-index: Scene Visual 22、Overlay 35、Transition 42、BLACKOUT 999の契約を確認
- BLACKOUT precedence: Overlay/Visual/Avatar/字幕を全面的に覆い、RESTOREで直前状態へ復帰

| 状態 | 証跡 |
|---|---|
| Admin 1 + Display 3 | [`admin-display-3.png`](../../artifacts/phase-a/admin-display-3.png) |
| NORMAL / WARNING / HIJACKED | [`normal.png`](../../artifacts/phase-a/normal.png) / [`warning.png`](../../artifacts/phase-a/warning.png) / [`hijacked.png`](../../artifacts/phase-a/hijacked.png) |
| 3 Display Broadcast | [`broadcast-display-a.png`](../../artifacts/phase-a/broadcast-display-a.png) / [`broadcast-display-b.png`](../../artifacts/phase-a/broadcast-display-b.png) / [`broadcast-display-c.png`](../../artifacts/phase-a/broadcast-display-c.png) |
| Display個別送信 | [`individual-browser-b-hostile.png`](../../artifacts/phase-a/individual-browser-b-hostile.png) |
| Final Challenge | [`final-challenge.png`](../../artifacts/phase-a/final-challenge.png) |
| Local Scene画像Asset | [`image-asset.png`](../../artifacts/phase-a/image-asset.png) |
| Unlock 50% / 100% | [`unlocking-50.png`](../../artifacts/phase-a/unlocking-50.png) / [`unlocking-100.png`](../../artifacts/phase-a/unlocking-100.png) |
| Emergency | [`emergency-protection.png`](../../artifacts/phase-a/emergency-protection.png) |
| Hostile / Shutdown / Recovery | [`hostile.png`](../../artifacts/phase-a/hostile.png) / [`shutdown.png`](../../artifacts/phase-a/shutdown.png) / [`recovery.png`](../../artifacts/phase-a/recovery.png) |
| BLACKOUT | [`blackout.png`](../../artifacts/phase-a/blackout.png) |

## 長時間試験

短縮事前試験は0.25分で109/109イベント成功、Phase A演出21回、Display reconnect 3、Admin reconnect 1、failure 0で成功した。

最終試験は30分を連続実行し、794/794イベント成功、failure 0、abnormal exitなしで完走した。内訳はDisplay reconnect 3、Admin reconnect 1、Audio Master reconnect 1 / master変更1、Preflight検査6、Phase A演出159、Unlock 53、Emergency 53、BLACKOUT 53、local audio 53。RSSは62,173,184→91,332,608 bytes（+29,159,424 bytes）で、無制限増加や停止は見られなかった。

途中試行では約20分時点にHeartbeat recovery直後の過渡的な`not-ready` stateをsoak harnessが拾う同期競合を検出した。製品状態が`warning`へ安定するまで待つよう判定を修正し、71/71回帰と短縮109/109を再確認してから、上記30分試験を0分から再実行した。途中試行の時間は合格結果に算入していない。

## Acceptance Criteria逐項照合

| # | 分類 | 判定 | 根拠 |
|---:|---|:---:|---|
| 1 | Architecture | ✅ | Phase 4.2基準`8c0c5ef`、既存58件回帰、6 Preset/Avatar assetを維持 |
| 2 | Architecture | ✅ | `SHOW_SCHEMA_VERSION = 3`、Show export v3 |
| 3 | Architecture | ✅ | `SUPPORTED_SHOW_SCHEMA_VERSIONS=[2,3]`とmigration試験 |
| 4 | Architecture | ✅ | Overlay/Visual/Transition/UnlockをStateStoreとDisplay snapshotで管理 |
| 5 | Architecture | ✅ | 旧Cueは全新規fieldを既定値で補完 |
| 6 | Architecture | ✅ | normalize/render関数と状態fieldを責務別に分離 |
| 7 | Cue / Show | ✅ | Admin編集とSchemaの`transition` |
| 8 | Cue / Show | ✅ | Admin編集とSchemaの`overlay` |
| 9 | Cue / Show | ✅ | Admin編集とSchemaの`visual` |
| 10 | Cue / Show | ✅ | JSON Sync Markers編集、Admin Current/Next表示 |
| 11 | Cue / Show | ✅ | 0〜30,000ms正規化とCSS runtime反映 |
| 12 | Cue / Show | ✅ | `expiresAt`のServer/Display timerと単体試験 |
| 13 | Cue / Show | ✅ | visual.visible、autoHideVisualMs、Scene Visual layer |
| 14 | Cue / Show | ✅ | `shows/phase-a-demo.json` 27 Cue、Schema試験 |
| 15 | Stage Function | ✅ | pa-001→pa-004、NORMAL→WARNING実ブラウザ画像 |
| 16 | Stage Function | ✅ | pa-004→pa-006、WARNING→HIJACKED実ブラウザ画像 |
| 17 | Stage Function | ✅ | pa-010 RIDDLE MODE、riddle-status visual |
| 18 | Stage Function | ✅ | pa-012に指定文言を完全収録・試験固定 |
| 19 | Stage Function | ✅ | pa-013 final-challenge overlay/visual画像 |
| 20 | Stage Function | ✅ | pa-014 authenticating overlay |
| 21 | Stage Function | ✅ | pa-015 auth-success transition/overlay |
| 22 | Stage Function | ✅ | pa-016、実ブラウザ55%とunit 50% |
| 23 | Stage Function | ✅ | 100%を自動error化せず保持、画像証跡 |
| 24 | Stage Function | ✅ | pa-018 emergency-interrupt、Unlockをabortedへ確定 |
| 25 | Stage Function | ✅ | pa-019 unlock-aborted overlay |
| 26 | Stage Function | ✅ | pa-020 connection-failed overlay |
| 27 | Stage Function | ✅ | pa-021 hostile-enter transition |
| 28 | Stage Function | ✅ | pa-022 forced-runaway overlay |
| 29 | Stage Function | ✅ | pa-023 shutdown transition/overlay |
| 30 | Stage Function | ✅ | shutdownはoperator-controlledで自動解除なし、既存静止試験 |
| 31 | Stage Function | ✅ | pa-025 recovery transition/overlay |
| 32 | Stage Function | ✅ | pa-026 normalize + normal speech |
| 33 | Stage Function | ✅ | pa-027は`enabled:false`の任意最終台詞 |
| 34 | Operation | ✅ | 既存NEXT + Phase A real WS flow |
| 35 | Operation | ✅ | 既存BACK回帰試験 |
| 36 | Operation | ✅ | 既存/Phase A REPLAY。Cue再適用で演出を再開始 |
| 37 | Operation | ✅ | 音声なし演出でも有効、Transition/Unlock安全停止 |
| 38 | Operation | ✅ | 既存CLEAR回帰 |
| 39 | Operation | ✅ | 実ブラウザBLACKOUT画像 |
| 40 | Operation | ✅ | RESTORE実操作と既存復元試験 |
| 41 | Operation | ✅ | `cue:jump`は位置だけ、直接実行とUI分離 |
| 42 | Operation | ✅ | id/name/notes/target/preset/transition/overlay/visual/audio/sync表示 |
| 43 | Operation | ✅ | Sync MarkersはAdminだけ、Display publicCueから除外 |
| 44 | Resilience | ✅ | Unlock途中Display再接続で約50%復元するreal WS試験 |
| 45 | Resilience | ✅ | 実ブラウザAdmin再接続とsoak再接続 |
| 46 | Resilience | ✅ | Display BだけHostile、A/C Recovery維持を実ブラウザ確認 |
| 47 | Resilience | ✅ | Audio Master 1台のみ発話する既存/回帰E2E |
| 48 | Resilience | ✅ | reconnect snapshotは状態のみで`speak`を再送しない |
| 49 | Resilience | ✅ | 不正Transition import 422、前後Show同一のrollback試験 |
| 50 | Resilience | ✅ | BLACKOUT z-index 999と既存契約試験 |
| 51 | Resilience | ✅ | startedAt/duration/statusで途中/完了判定、過去Transitionを再発火しない |
| 52 | Verification | ✅ | `npm run check` 71/71 PASS |
| 53 | Verification | ✅ | in-app Chromium 4タブ warning 0 / error 0 |
| 54 | Verification | ✅ | Admin 1 + Display 3 real browser / real WS E2E |
| 55 | Verification | ✅ | 30分連続soak、794/794成功、failure 0、abnormal exitなし |
| 56 | Verification | ✅ | RSS 62,173,184→91,332,608 bytes（+29,159,424）、無制限増加なし |
| 57 | Verification | ✅ | reconnect 3、Admin reconnect 1、master reconnect 1を含め完走 |
| 58 | Verification | ✅ | `npm audit --omit=dev`: 0 vulnerabilities |
| 59 | Verification | ✅ | 本ファイル |

## Git / Release

Phase AはSchema/State、Display、Admin、Demo Show、Browser/Soak、表示修正、Docsを意味単位でコミットした。既存`v0.4.2`は変更せず、本検証済みHEADへannotated `v0.5.0`を付与し、`origin/master`へcommitとtagをpushした。

## Phase Bへ引き継ぐ項目

機能基盤は完了している。WARNING/HIJACKED/HOSTILEの演出強度、Unlock成功感、Error落差、Shutdown静寂、Recovery感動、3〜5m視認性、舞台照明との色バランス、最終animation timing、TTS演技はPhase Bの視覚・会場調整対象であり、Phase Aの機能不全ではない。
