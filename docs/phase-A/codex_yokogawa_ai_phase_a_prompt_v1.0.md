# Codex 実装指示 — 横川AI Phase A / v0.5.0

## 最初に

このタスクでは、既存の横川AI v0.4.2を基盤として、Phase Aの機能実装を完成させてください。

最重要目的は、

> **「7号館からの脱出」の本番に必要な横川AI演出を、Cueから安全・再現可能に最後まで通せる機能基盤を完成させること**

です。

見た目の最終調整は今回の主目的ではありません。

WARNING / HIJACKED / HOSTILE / UNLOCK / ERROR / SHUTDOWN / RECOVERYの「かっこよさ」「怖さ」「派手さ」「舞台距離での見え方」は、後続のPhase Bで人間によるVisual Reviewを繰り返して完成させます。

今回は、

- Cue architecture
- schema
- state
- renderer
- operation
- reconnect
- test
- demo show
- documentation

を完成させてください。

---

# 1. 必ず最初に読むもの

リポジトリ内を探索し、以下を確認してください。

1. root `README.md`
2. 現在のPhase 4.2 requirements / verification
3. Show File / Cue Schema実装
4. Server authoritative state実装
5. Admin UI
6. Display renderer
7. Audio Master
8. reconnect
9. BLACKOUT / RESTORE
10. automated tests
11. browser test
12. soak test
13. Avatar implementation
14. Presentation Preset implementation

その後、このタスクと一緒に渡された

`yokogawa_ai_phase_a_spec_v1.0.md`

を全文読み、これを今回の実装Source of Truthとして扱ってください。

既存コードと仕様書が矛盾する場合は仕様書を優先します。

ただし、仕様書が要求していない既存機能を理由なく削除・破壊しないでください。

---

# 2. set_goal

ファイルを読んだ後、Codex自身で今回のgoalを設定してください。

goalは、単に私が書いた文章をコピーするのではなく、

- 現在のコード構成
- v0.4.2の完成状態
- Phase A仕様
- テスト構成
- 実装依存関係

を把握した上で、自律的に具体化してください。

goalは、

- Phase A完了条件
- 回帰保護
- verification
- deliverables

まで含むものにしてください。

---

# 3. ユーザー確認について

実装途中で細かな技術判断をユーザーへ質問しないでください。

仕様書と既存コードから合理的に判断できるものは自律的に決定してください。

特に、

- ファイル分割
- module構造
- class/function名
- test organization
- internal state shape
- CSS class
- migration implementation
- E2E implementation

は自律判断してください。

ただし、勝手にPhase Bの感性的デザインを「完成した」と判断しないでください。

今回必要なのはPhase Aです。

---

# 4. 禁止事項

以下は禁止です。

- v0.4.2の既存tag改変
- 既存履歴の破壊
- Avatar PNGの勝手な差し替え
- 人物デザイン変更
- React等への全面移行
- Electron化
- Socket.IOへの不要な置換
- Redis導入
- WebRTC導入
- cloud依存
- CDN必須化
- Three.js Avatar実装
- 3Dモデル制作
- LLM自由会話
- 音声認識
- 謎の自動正誤判定
- DMX制御
- 音響卓制御
- MIDI / OSC連携
- 派手な見た目を理由に大規模な不安定化を行うこと
- テストを削って通すこと
- failing testをskipして完了扱いすること
- 手動確認だけで完了扱いすること

---

# 5. 回帰保護

Phase A開始前に必ず、

```bash
git status
git branch --show-current
git log --oneline --decorate -n 20
git tag --list
```

等で現在地を確認してください。

既存テストを実行し、baselineを記録してください。

v0.4.2で成立している以下は回帰させないでください。

- Show Control
- Cue進行
- Admin
- 複数Display
- Broadcast
- individual target
- Audio Master
- Free Speak既存機能
- Avatar
- Blink
- Lip Sync
- Presentation Preset 6種
- reconnect
- BLACKOUT / RESTORE
- Show File
- Dry Run
- Preflight
- Rehearsal
- reduced motion

Free Speakは本番Showでは使用しませんが、今回は削除しないでください。

---

# 6. 実装対象

仕様書に従い、最低限以下を完成させてください。

## A. Cue Schema v3

v2を拡張し、

- transition
- overlay
- visual
- timing
- syncMarkers

を追加してください。

すべてoptional。

v2 Show File互換を維持し、v2→v3 migrationを実装してください。

Dry Run / validation / import rollbackを更新してください。

---

## B. Transition Engine

最低限:

- none
- boot
- anomaly
- takeover
- riddle-enter
- final-challenge-enter
- auth-success
- unlock-start
- emergency-interrupt
- hostile-enter
- shutdown
- recovery
- normalize

をCueから実行できるようにしてください。

今回のvisualは完成形でなくて構いません。

ただし、

- 実行可能
- duration指定可能
- REPLAY可能
- BLACKOUTと競合しない
- reconnect後に暴走しない
- CSS / data stateでPhase B調整可能

にしてください。

---

## C. Operation Overlay

最低限:

- none
- booting
- communication-locked
- access-denied
- authentication-failed
- riddle-active
- all-conditions-met
- final-challenge
- authenticating
- authentication-success
- unlocking
- emergency-protection
- unlock-aborted
- connection-failed
- forced-runaway
- system-shutdown
- restoring

を実装してください。

title / message / progress / variant / visible / auto clearを扱えるようにしてください。

---

## D. Scene Visual

最低限:

- none
- text-card
- image
- final-challenge
- riddle-status

を実装してください。

最終問題が未確定でもplaceholderで動作確認可能にしてください。

巨大な汎用CMSは作らないでください。

---

## E. Unlock Gauge

専用演出として実装してください。

必要条件:

- Avatar周辺に複数ゲージ
- 0→100%
- duration configurable
- default 5000ms程度
- 100%状態を保持可能
- 次CueでERRORへ移行
- 自動でERRORまで進めない
- REPLAY可能
- STOP安全
- reconnect安全

Phase Bで見た目を直しやすい構成にしてください。

---

## F. Server authoritative state

新規Presentation stateをServer側で復元可能にしてください。

最低限:

- preset
- overlay
- visual
- avatar
- subtitle
- blackout
- unlock state
- transition completion
- target-specific state

を考慮してください。

再接続時に過去音声は再生しないでください。

---

## G. Admin

Current Cue / Next Cueで最低限、

- Cue ID
- name
- triggerNote
- operatorNote
- target
- preset
- transition
- overlay
- visual
- audio
- sync markers

を確認できるようにしてください。

Cue jumpが現状不十分なら追加してください。

Cue jumpとCue executeは分けてください。

---

## H. syncMarkers

Cueへ、

- LX
- SE
- その他department

のmarkerを保存・表示できるようにしてください。

外部機器制御はしないでください。

---

## I. Phase A Demo Show

`shows/phase-a-demo.json` 相当を作成してください。

仕様書記載のフローをすべて通してください。

特に、

```text
NORMAL
→ WARNING
→ HIJACKED
→ FINAL CHALLENGE
→ AUTHENTICATING
→ 100%
→ EMERGENCY ERROR
→ HOSTILE
→ SHUTDOWN
→ RECOVERY
→ NORMAL
```

をOperator操作のみで最後まで通せること。

以下の正式文言も含めてください。

```text
すべての条件が満たされました。五つの答えを携え、ただちに201へ集合しなさい
```

Scene 7は、

- 最終発話あり
- 最終発話なし

の両方に対応し、最終発話を独立optional Cueにしてください。

---

# 7. 本番進行の重要仕様

必ず以下を守ってください。

## 乗っ取り

```text
NORMAL
→ anomaly
→ WARNING
→ Operatorが次Cue
→ takeover
→ HIJACKED
```

自動連続させないでください。

## UNLOCK

```text
AUTH SUCCESS
→ unlock
→ 100%
→ 保持
→ Operator GO
→ emergency interrupt
```

100%とERRORを自動連続させないでください。

## HOSTILE

虎谷が端末を操作したタイミングでHOSTILE。

「強制暴走モードへ移行します」はその後の別Cue。

## SHUTDOWN

音声認識しない。

演者が停止コードを叫んだ後、Operator GO。

自動RECOVERYしない。

SHUTDOWNは長時間維持可能。

## RECOVERY

Operator GO。

```text
SHUTDOWN
→ RECOVERY
→ NORMAL
```

その後の最終発話は独立Cue。

---

# 8. 見た目について

今回のvisualは「Phase Bで評価できるだけの仮完成」にしてください。

重要なのは、

- 状態が変わったことが分かる
- Displayが壊れない
- 字幕が読める
- Avatarが意図せず崩れない
- 3台で同期する
- パラメータを後から変更できる

ことです。

以下を今回の合否条件にしないでください。

- 最高にかっこいい
- 十分怖い
- 十分派手
- 3〜5mで最適
- 照明下で最適
- RECOVERYが感動的

それらはPhase Bです。

一方、明らかなレイアウト崩壊や、字幕不可読、Avatar欠損は修正してください。

---

# 9. 自律Visual Review

Phase Aでも、機能破綻確認のため実ブラウザScreenshotを確認してください。

対象:

- normal
- warning
- hijacked
- hostile
- shutdown
- recovery
- unlocking 50%
- unlocking 100%
- emergency error
- final challenge

各Screenshotについて、

- clipping
- overlap
- subtitle readability
- Avatar visibility
- z-index
- unexpected scroll
- BLACKOUT precedence

を自己批評してください。

感性的な「もっとかっこよく」は今回追い込みすぎないでください。

---

# 10. Test

仕様書のTest Requirementsを満たしてください。

最低でも、

```bash
npm run check
npm run test:browser-console
npm audit --omit=dev
npm run test:soak
```

相当を最終コードで再実行してください。

既存command名が異なる場合はrepositoryに合わせてください。

### 必須E2E

Admin 1 + Display 3で確認してください。

- broadcast
- individual target
- reconnect
- blackout
- restore
- unlock
- error
- hostile
- shutdown
- recovery
- normal restored
- optional final confirmation

Display 3を途中切断し、再接続後に現在状態へ戻ることも確認してください。

### Soak

最終コードで30分。

Phase Aの新runtimeをsoakへ含めてください。

failure 0。

---

# 11. 実装ループ

以下を繰り返してください。

```text
設計
↓
実装
↓
自動テスト
↓
実ブラウザ確認
↓
Screenshot確認
↓
自己批評
↓
不具合修正
↓
回帰テスト
```

ユーザーに途中確認を求めず、Phase Aとして合理的なところまで自律的に進めてください。

ただし、Phase B相当の感性的最終調整へ勝手に広げないでください。

---

# 12. Documentation

実装完了後、最低限以下を更新・作成してください。

- root README
- Phase A requirementsのrepo内コピー
- `docs/phase-a/verification.md`
- 必要ならschema documentation
- demo Show説明
- test commands
- operation instructions
- migration notes
- known limitations
- Phase B handoff

verificationには、

- baseline
- final commit
- tests
- E2E
- screenshot list
- browser console
- reconnect
- soak
- npm audit
- remaining Phase B items

を記録してください。

---

# 13. Git

作業前にclean / branch / current tagsを確認。

既存tagは絶対に書き換えない。

意味単位でcommitしてください。

最終候補は `v0.5.0`。

ただしtagを付けるのは、

- full tests PASS
- E2E PASS
- 30min soak PASS
- docs completed
- working tree clean

を確認した後だけ。

remoteが設定されpush可能な環境なら、既存運用を確認してpushしてください。
権限や接続上不可能なら、その事実をverificationに記録し、勝手に成功扱いしないでください。

---

# 14. 最終報告

最後に以下を簡潔に報告してください。

1. 最終architecture
2. Cue Schema v3概要
3. 実装したTransition
4. 実装したOverlay
5. Scene Visual
6. Unlock Gauge
7. Admin変更
8. reconnect変更
9. Demo Show
10. automated test結果
11. browser E2E結果
12. 30分soak結果
13. audit結果
14. commit / tag
15. Phase Bへ残した項目
16. 作成・更新した主要ファイル

「できたはず」ではなく、実際に確認した結果のみ書いてください。

---

# 15. 完了条件

このタスクは、

> **Phase A demo Showを、Admin 1 + Display 3で、NORMAL→WARNING→HIJACKED→UNLOCK→ERROR→HOSTILE→SHUTDOWN→RECOVERY→NORMALまで実際に通し、再接続・BLACKOUT・target制御・回帰・30分soakまで確認できた**

時点で完了です。

Visualの最終完成は要求しません。

Phase Bで人間が感性的な調整だけに集中できる状態にしてください。
