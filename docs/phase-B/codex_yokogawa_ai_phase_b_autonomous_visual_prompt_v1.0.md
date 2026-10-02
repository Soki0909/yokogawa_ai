# Codex 実装指示 — 横川AI Phase B Autonomous Visual Pass
## Target: v0.6.0-rc.1

今回のタスクでは、Phase A / v0.5.0で完成した横川AIの機能基盤を変更せず、ユーザーによる最終Visual Directionの直前まで、舞台映像としてのVisualを自律的に完成させてください。

最重要目標:

> **ユーザーがデバッグ・描画ミス確認をしなくてもよく、純粋に「派手さ・怖さ・美しさ・間・演劇的な見え方」だけを評価できる状態へ持っていくこと。**

---

# 1. 最初に読む

必ず以下を確認してください。

1. root README
2. Phase A requirements
3. Phase A verification
4. Phase A release notes
5. Phase A demo Show
6. current Display HTML/CSS/JS
7. Presentation Preset
8. Transition runtime
9. Overlay runtime
10. Scene Visual
11. Unlock Gauge
12. Server authoritative Display state
13. reconnect
14. BLACKOUT / RESTORE
15. browser tests
16. soak tests
17. existing Phase A screenshots

その後、このタスクに添付された

`yokogawa_ai_phase_b_autonomous_visual_spec_v1.0.md`

を全文読み、今回のSource of Truthとしてください。

---

# 2. set_goal

全資料とコードを読んだ後、自分でgoalを設定してください。

goalには最低限、

- v0.5.0回帰保護
- Visual Grammar
- state差別化
- transition完成候補
- Unlock / Error / Shutdown / Recovery
- Screenshot matrix
- self-critique loop
- browser verification
- soak
- review package
- v0.6.0-rc.1

まで含めてください。

ユーザーの文章をそのままgoalへコピーするのではなく、repo構造を理解した上で具体化してください。

---

# 3. 今回の位置づけ

これは最終Visual承認ではありません。

あなたが行うのは、

```text
Phase A functional system
↓
autonomous visual implementation
↓
real-browser visual inspection
↓
objective design/render bug fixing
↓
visual candidate refinement
↓
user review package
```

です。

ユーザーによる最終確認後に、必要なら別タスクで追加Visual調整を行います。

---

# 4. ユーザー確認禁止領域

以下はユーザーへ質問せず自律的に判断してください。

- CSS構造
- DOM wrapper
- token名
- animation implementation
- keyframe分割
- z-index
- safe area
- responsive adjustment
- state cleanup
- compositor bug対策
- performance改善
- test追加
- Screenshot取得方法
- contact sheet生成
- visual bug修正

---

# 5. ユーザー判断として残す領域

以下を勝手に最終確定しないでください。

- 派手さが十分か
- 怖さが十分か
- 色が最終的に好みか
- Animation speedが最終的に適切か
- Unlock 100%の溜め
- Errorのショック強度
- Shutdownの暗さ
- Recoveryの温かさ・感動
- 舞台照明込みの最終見え方
- 3〜5mでの最終強度
- TTS演技

あなたは良い候補まで作る。最終承認はユーザー。

---

# 6. 回帰保護

作業開始時:

```bash
git status
git branch --show-current
git log --oneline --decorate -n 30
git tag --list
```

を確認。

`v0.5.0`を基準として記録してください。

既存tagを書き換えない。

Phase A Acceptanceを壊さない。

特に:

- Schema v3
- v2 migration
- target state
- Admin
- Display
- reconnect
- Audio Master
- STOP / REPLAY
- BLACKOUT / RESTORE
- Unlock logic
- 27 Cue demo
- Show import rollback

を保護してください。

---

# 7. Architecture変更方針

全面再設計しない。

Three.js / Canvas / WebGLを新規導入しない。

基本:

- existing DOM
- CSS custom properties
- CSS transforms
- CSS opacity
- deterministic keyframes
- minimal JS state hook

で実装。

必要なら責務分離のためwrapper追加は可。

---

# 8. Visual Token System

まずVisual調整値を整理してください。

既存tokenを調査し、重複を避けつつPhase B調整値を集約。

最低限:

- state intensity
- state speed
- glow
- grid opacity
- vignette
- overlay scale
- transition durations
- recovery duration

を後から変更しやすくしてください。

Phase B後、ユーザーの

「もう少し派手」
「もう少し遅く」
「赤を強く」

といった指示にtoken変更中心で対応できる構造にしてください。

---

# 9. 状態Visual

仕様書のVisual Grammarに従い、

- NORMAL
- WARNING
- HIJACKED
- HOSTILE
- SHUTDOWN
- RECOVERY

を実装・改善してください。

## NORMAL

stable / symmetric / cyan-teal / slow / controlled。

## WARNING

amber / partial disruption / scan / pulse / still partly ordered。

## HIJACKED

magenta-violet / asymmetric / intrusion / phase offset / external control。

## HOSTILE

red-black / rupture / pressure / maximum intensity / dangerous。

## SHUTDOWN

desaturated / low brightness / motion zero / dead system。

## RECOVERY

warm light / staged reconstruction / geometry return / Avatar return / normal convergence。

色だけの差にしないこと。

---

# 10. Transition

以下をVisual candidateまで改善。

- boot
- anomaly
- takeover
- final-challenge-enter
- auth-success
- unlock-start
- emergency-interrupt
- hostile-enter
- shutdown
- recovery
- normalize

特に:

## anomaly

NORMALから「一瞬で異常を察知」できる。

## takeover

WARNINGと異なる侵入・支配表現。

## emergency-interrupt

Unlock 100%成功から急激に遮断。

## hostile-enter

台詞より前に危険モード成立。

## shutdown

長いfadeではなく、最大強度→急停止。

## recovery

停止→微かな復帰→再構築→NORMAL。

---

# 11. Unlock Gauge

機能logicは変更しない。

Visualを舞台向けへ。

- Avatar周辺
- multiple gauges
- progress recognizable at distance
- AUTH / CORE / GATE等の複数系統を活用可
- 100%で明確なsuccess
- success hold
- emergency interruptionで崩壊可能

STOP / REPLAY / reconnectを回帰させない。

---

# 12. Operation Overlay

全Overlayを見直してください。

目的は「遠距離でも状態が分かる」。

小さい管理UIにはしない。

最低確認:

- ACCESS DENIED
- AUTHENTICATION FAILED
- RIDDLE ACTIVE
- ALL CONDITIONS MET
- FINAL CHALLENGE
- AUTHENTICATING
- AUTH SUCCESS
- UNLOCKING
- EMERGENCY PROTECTION
- UNLOCK ABORTED
- CONNECTION FAILED
- FORCED RUNAWAY
- SYSTEM SHUTDOWN
- RESTORING

subtitle safe areaを守る。

---

# 13. Final Challenge

Scene Visualを主役にする。

- clear hierarchy
- large content area
- background dim
- Avatar still identifiable
- subtitle readable
- placeholderでも成立

actual謎の内容を勝手に作らない。

---

# 14. 自主修正の基準

以下を一つでも見つけたら、自分で修正して再確認してください。

- clipping
- overlap
- scroll
- unreadable subtitle
- hidden Avatar
- broken rail
- broken concentric center
- broken symmetry in NORMAL
- state effect leak
- gauge leak
- overlay leak
- visual leak
- transition class leak
- BLACKOUT violation
- animation continues in SHUTDOWN
- stale transition after reconnect
- compositor flicker
- clip-path corruption
- transform conflict
- excessive blur
- frame drop
- DOM growth
- timer leak

ユーザーへ「これはどうしますか？」と聞かないでください。

明らかな不具合です。

---

# 15. Visual distinctionの自己評価

WARNING / HIJACKED / HOSTILEを並べて、

1. 色を消してもgeometry差があるか
2. 静止画でも状態差があるか
3. 動画ではmotion characterが違うか
4. HOSTILEが最高強度か
5. WARNINGがまだ秩序を残すか
6. HIJACKEDが侵入・支配に見えるか

を自己評価。

不足なら修正。

---

# 16. 実ブラウザScreenshot Loop

一回で終わらない。

最低:

```text
Pass 1
implementation
→ screenshots
→ critique
→ fix

Pass 2
screenshots
→ comparison
→ critique
→ fix

Pass 3
final regression screenshots
```

状態によって問題が少なければ3pass目は確認のみでよい。

---

# 17. 必須Screenshot

最低:

- normal
- warning
- hijacked
- hostile
- shutdown
- recovery
- final-challenge
- authenticating
- auth-success
- unlock-0
- unlock-25
- unlock-50
- unlock-75
- unlock-100
- emergency-protection
- unlock-aborted
- connection-failed
- forced-runaway
- blackout

保存先例:

```text
artifacts/phase-b-review/
```

---

# 18. Transition frame evidence

以下を複数frameで記録:

- anomaly
- takeover
- unlock
- emergency-interrupt
- hostile-enter
- shutdown
- recovery

動画/GIF可能なら追加。

無理ならframe sequence。

---

# 19. Contact Sheet

最低2枚作成。

## states

```text
NORMAL | WARNING | HIJACKED
HOSTILE | SHUTDOWN | RECOVERY
```

## climax

```text
FINAL
AUTH
UNLOCK 50
UNLOCK 100
EMERGENCY
HOSTILE
SHUTDOWN
RECOVERY
```

目的は人間の比較を容易にすること。

---

# 20. 実ブラウザ

Phase A同様、Admin 1 + Display 3を使用。

最低シナリオ:

1. NORMAL
2. WARNING
3. HIJACKED
4. FINAL
5. AUTH
6. UNLOCK
7. EMERGENCY
8. HOSTILE
9. SHUTDOWN
10. RECOVERY
11. NORMAL
12. BLACKOUT
13. RESTORE

Display個別targetも1回確認。

途中reconnectも確認。

console warning / error 0を要求。

---

# 21. Resolution

最低:

- 1280×720
- 1920×1080相当

で確認。

scroll禁止。

safe area確認。

必要なら既存狭幅回帰も実施。

---

# 22. Performance

Phase BのVisual強化で性能を悪化させない。

避ける:

- unnecessary JS animation loop
- high-density particles
- repeated DOM creation
- huge blur chains
- multiple full-screen heavy filters
- unstable mix-blend-mode
- expensive clip-path animation

CSS transform / opacity優先。

実ブラウザで明らかなframe dropがあれば修正。

---

# 23. Automated Tests

Phase Aの71件を回帰。

Visual固有testを追加。

最低:

- layer order
- BLACKOUT precedence
- state cleanup
- overlay cleanup
- visual cleanup
- unlock cleanup
- SHUTDOWN motion stop
- RECOVERY cleanup
- reduced motion
- transition completion
- reconnect no replay
- no scroll contract

最終的にfull suite PASS。

---

# 24. Soak

最終Visual候補で30分soakを実施してください。

Phase B animation stateを含める。

要求:

- failure 0
- abnormal exitなし
- reconnect正常
- state leakなし
- memory unbounded growthなし

途中失敗を修正した場合は0分から再実行。

---

# 25. Self-Critique Document

`docs/phase-B/visual-self-critique.md`

を作る。

各状態について:

```text
Intent
Observed
Problem found
Change made
Remaining subjective question
```

を記録。

「全部良い」だけの自己評価は禁止。

---

# 26. Review Guide

`docs/phase-B/review-guide.md`

を作る。

ユーザーへ確認してほしい質問は9個程度に絞る。

最低:

1. WARNING異常感
2. HIJACKEDとの差
3. HOSTILE強度
4. Unlock成功感
5. Emergency落差
6. Shutdown静寂
7. Recovery温かさ
8. Final Challenge主役感
9. 全体強度階層

技術実装の質問をユーザーへ戻さない。

---

# 27. Verification

`docs/phase-B/verification.md`

へ以下を記録。

- baseline commit / tag
- final candidate commit
- changed files
- visual architecture
- token architecture
- Screenshot matrix
- transition evidence
- bugs discovered autonomously
- bugs fixed
- tests
- browser E2E
- console
- reconnect
- soak
- performance notes
- known subjective items
- user review pending items

---

# 28. README / Release Notes

READMEへPhase B候補状態を反映。

`docs/phase-B/release-notes-rc1.md`等を作成。

これはfinal releaseではない。

---

# 29. Git / Tag

既存`v0.5.0`は変更しない。

全条件を満たしたら、

```text
v0.6.0-rc.1
```

をannotated tagとして付けてよい。

ただし、

- tests PASS
- browser PASS
- screenshot package complete
- self-critique complete
- 30min soak PASS
- docs complete
- clean working tree

が条件。

remote push可能なら既存運用に従いpush。

不可能なら事実を記録。

final `v0.6.0`は付けない。

ユーザーレビュー後の別工程。

---

# 30. 完了条件

このタスクは、

> **Codex自身が実ブラウザを見て、明らかな描画ミス・状態漏れ・構造上の不自然さを修正し、状態比較とTransition比較の証跡を揃え、久米が感性的判断だけを行える状態になった**

時点で完了です。

「実装しました」で終了しないでください。

必ず、

```text
implementation
→ real browser
→ screenshot
→ self critique
→ correction
→ recheck
```

を実施してください。

---

# 31. 最終報告

最後に以下を簡潔に報告。

1. baseline
2. final candidate HEAD
3. tag
4. Visual token構造
5. 6 Presetの変更概要
6. Transition変更概要
7. Unlock / Error
8. Final Challenge
9. 自主検出した描画問題
10. 自主修正内容
11. Screenshot / contact sheet
12. automated test結果
13. browser 4タブ結果
14. console結果
15. reconnect結果
16. 30分soak結果
17. audit結果
18. 久米レビュー待ちの感性的項目
19. 主要成果物

「最終Visual完成」とは書かないでください。

正しい表現は、

> **Phase B autonomous visual candidate complete / user visual review pending**

です。
