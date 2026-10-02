# Phase B Visual Self-Critique

## NORMAL

- Intent: Avatarと字幕を主役にした、左右対称で静かな基準状態。
- Observed: 同心円・radial line・左右railが同一中心軸に揃い、青緑の低密度背景として機能した。
- Problem found: 既存調整で円形HUD中心のずれが発生し得る構成だった。
- Change made: core / ring / sector / glowの基準を共有し、viewport変化でも中央を維持するtoken構成へ統一した。
- Remaining subjective question: 平常時の情報密度と青緑の明るさが舞台投影に適切か。

## WARNING

- Intent: 通常状態を壊しすぎず、異常の開始を即座に示す。
- Observed: 琥珀色、警告geometry、斜めscan、pulseでNORMALとの差を確保した。
- Problem found: 初回比較では色差に比べ構造差が弱かった。
- Change made: 警告記号、方向性のあるscan、密度の高いframeを追加した。
- Remaining subjective question: 異常発生としてさらに強いflashが必要か。

## HIJACKED

- Intent: 外部から制御を奪われた非同期・侵入状態。
- Observed: magenta/violet、侵入band、UI offset、非同期ringによりWARNINGと構造的に異なる。
- Problem found: 初期案ではWARNINGと同じ中央集中に見える瞬間があった。
- Change made: 左右非対称bandとring timingを分離し、侵入方向を持たせた。
- Remaining subjective question: glitch量をさらに増やすか。

## HOSTILE

- Intent: HIJACKEDより一段高い、赤黒のクライマックス状態。
- Observed: 破断ring、rupture線、高contrast frameで最大強度を形成した。
- Problem found: 遷移開始フレームに直前状態が強く残るため、比較証跡の撮影時刻を調整した。
- Change made: hostile-enter専用layerと完了cleanupを分離した。
- Remaining subjective question: 赤量と画面振動の強度が演劇的に十分か。

## SHUTDOWN

- Intent: 派手さではなくmotion停止と無彩色化で落差を作る。
- Observed: Avatar閉眼、低彩度、静止した暗い構図が成立した。
- Problem found: 初回実ブラウザ確認でtransition flashまでpauseされ、赤い中間フレームが残留した。
- Change made: underlying motionだけを停止し、shutdown transition layerは完了まで動かして除去する例外を追加した。
- Remaining subjective question: 静寂時間と暗さが会場で十分か。

## RECOVERY

- Intent: 破損状態から段階的に色・grid・ringを戻す。
- Observed: 0 / 25 / 50 / 75 / 100の比較で復旧の進行が読み取れ、NORMAL復帰後にeffectは残らなかった。
- Problem found: 復旧直後のcleanupを画像だけでなくDOM状態でも確認する必要があった。
- Change made: normalize後のoverlay / visual / gauge / transitionを自動試験と実ブラウザdatasetの両方で確認した。
- Remaining subjective question: 温かさと希望を感じる色温度になっているか。

## Unlock / Emergency / Final Challenge

- Intent: Final Challengeを主役化し、Unlockの成功感を作ってからEmergencyで反転する。
- Observed: Final Challengeは中央カード、Unlockは3つのradial gauge、Emergencyは破断した赤いgaugeで意味が分離した。
- Problem found: pass 1でconnection-failedにもgaugeが残り、さらに静的`unlocking: 100`がタイマーを再始動する状態更新不具合を検出した。
- Change made: connection-failedからgaugeを除外し、`unlock-start`だけが進行を開始、100%保持はcompleted、緊急中断は100%のままaborted、別Cueでidleへcleanupするよう修正した。
- Remaining subjective question: 100%成功からEmergencyへの感情的落差が十分か。

## Review loop

1. Pass 1: 全状態を実ブラウザ撮影。connection-failedへのgauge漏れを検出。
2. Pass 2: gauge visibilityとemergency fractureを修正し再撮影。
3. Pass 3: shutdown中間flash残留とUnlock state再始動を検出・修正。新規server stateで100%保持 → Emergency → NORMAL cleanupを再確認。
4. Final: 1280×720、1920×1080相当、Admin 1 + Display 3、console 0件、contact sheetを確認。

技術的な完成条件は満たした候補ですが、強度・色・間・感動の大きさはユーザーVisual Reviewに残します。

