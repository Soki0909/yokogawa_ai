# 横川AI Phase B 自律Visual実装仕様書 v1.0
## ― ユーザーレビュー直前までのVisual Direction / Pre-Polish ―

作成日: 2026-10-02  
対象: 「7号館からの脱出」横川AI  
基準実装: Phase A / v0.5.0  
推奨成果バージョン: `v0.6.0-rc.1`  
最終版想定: ユーザーVisual Review後に `v0.6.0`

---

# 0. Phase Bの目的

Phase Aで、Cue Schema v3、Transition、Operation Overlay、Scene Visual、Unlock Gauge、target別Server State、Admin操作、再接続、BLACKOUT、27 Cue demo Showまで機能基盤が完成した。

Phase Bでは、その機能基盤を使い、

> **演劇の舞台映像として、設計上明らかに破綻のない、状態差が明確で、十分に演出意図が伝わるVisual候補をCodexが自律的に作り切る**

ことを目的とする。

ただし、Phase Bは「最終デザイン承認」ではない。

以下のような感性的判断は、Phase B終了後に久米が実際の画面を見て決定する。

- もっと派手にするか
- もっと怖くするか
- 色味を変えるか
- animationを速く／遅くするか
- 余韻を長くするか
- RECOVERYをもっと感動的にするか
- 舞台照明下で強度を上げるか
- 3〜5mでの視認感をさらに調整するか

Phase BでCodexは、こうした最終的な趣味・演出判断を勝手に「正解」と確定しない。

一方で、以下はユーザー確認を待たずCodex自身で修正する。

- clipping
- overlap
- z-index破綻
- 不要なscroll
- 字幕が読めない
- Avatarが意図せず隠れる
- OverlayとScene Visualの衝突
- Unlock Gaugeが無関係な状態に残る
- Transition終了後に旧stateが残る
- BLACKOUTより上に要素が出る
- reconnectで古いanimationが再発火する
- NORMALの左右対称が意図せず崩れる
- WARNING / HIJACKED / HOSTILEが視覚的にほぼ同一
- SHUTDOWN中に不要なmotionが残る
- RECOVERY後にUIが復旧しきらない
- compositor / transform / clip-path由来の描画破綻
- 16:9画面で主要要素がviewport外へ出る
- 画面全体の情報密度が破綻し主要情報を認識できない

---

# 1. Source of Truth

実装時の優先順位:

1. 本仕様書
2. Phase A / v0.5.0 requirements / verification / release notes
3. 現行上演台本
4. v0.5.0コード
5. Phase 4.2 Visual設計資料
6. 過去の旧案

Phase Aの機能仕様をVisual都合で壊してはならない。

---

# 2. Phase Aから維持するもの

## 2.1 Architecture

- Node.js / Express / `ws`
- Vanilla HTML / CSS / JavaScript
- Server authoritative state
- Admin + 複数Display
- Display別target state
- Audio Master
- reconnect
- Show File v3
- v2 migration
- Dry Run / rollback
- Preflight
- Rehearsal
- local Asset Registry
- BLACKOUT / RESTORE
- STOP / REPLAY
- Cue jump
- syncMarkers

## 2.2 Visual Layer契約

現行レイヤー順:

```text
Preset Environment
→ Avatar
→ Scene Visual
→ Subtitle / Status
→ Operation Overlay
→ Transition
→ BLACKOUT
```

BLACKOUTは最上位。

Avatar・字幕は環境glitchで大きく移動・崩壊させない。

## 2.3 Preset ID

既存6種を変更しない。

- `normal`
- `warning`
- `hijacked`
- `hostile`
- `shutdown`
- `recovery`

## 2.4 Phase A stage flow

意味上の進行は変更しない。

```text
NORMAL
→ WARNING
→ HIJACKED
→ FINAL CHALLENGE
→ AUTHENTICATING
→ AUTH SUCCESS
→ UNLOCK 0→100
→ 100% HOLD
→ EMERGENCY INTERRUPT
→ UNLOCK ABORTED
→ CONNECTION FAILED
→ HOSTILE
→ FORCED RUNAWAY
→ SHUTDOWN
→ RECOVERY
→ NORMAL
→ optional final confirmation
```

Operator-controlledな間を勝手に自動化しない。

---

# 3. Phase Bの設計原則

## 3.1 「Web UI」ではなく「舞台映像」

横川AIは近距離で読む管理画面ではなく、観客が数m離れて見る舞台映像である。

したがって状態差は、

- 小さなラベル
- 細かな文字
- わずかな色差

だけに依存してはならない。

状態変化は必ず、

- 画面全体の色
- geometry
- motion
- density
- symmetry
- pulse
- scale
- scan direction
- framing

の複数要素で表現する。

## 3.2 常時派手にしない

すべての状態を最大強度にするとクライマックスが死ぬ。

演出強度の基本階層:

```text
NORMAL
<
WARNING
<
HIJACKED
<
HOSTILE
```

ただしSHUTDOWNは「強度を下げること」が最大の演出。

RECOVERYはHOSTILEとは別軸の「光・再構築・安堵」で強い印象を作る。

## 3.3 Avatarを人格の軸として残す

BLACKOUT以外では原則としてAvatarの存在を維持する。

- WARNING: AI自体はまだそこにいる
- HIJACKED: AIが乗っ取られている
- HOSTILE: AIが暴走している
- SHUTDOWN: AIが停止している
- RECOVERY: AIが戻ってくる

と観客が理解できること。

画面効果がAvatarを完全に飲み込まない。

## 3.4 Subtitle優先

台詞字幕は常に読めること。

派手な演出のために字幕を犠牲にしない。

字幕領域をglitch、flash、scan、high-frequency noiseの主対象にしない。

---

# 4. Visual Grammar

Phase Bでは6状態を同一の「AI System Visual Grammar」で統一しつつ、明確に差別化する。

## 4.1 NORMAL

意味:
- 安定
- 高性能
- 冷静
- 信頼できる
- 正常稼働

Visual方向:
- 濃紺 / cyan / teal
- 左右対称
- concentric ring
- stable grid
- slow rotation
- low-density data motion
- clean center axis
- controlled glow
- Avatarを最も見やすくする

Motion:
- ゆっくり
- 周期的
- 予測可能
- 微細

禁止:
- glitch
- high-frequency flash
- aggressive rupture
- 不要な非対称

NORMALは以後の異常状態を成立させる基準なので、静かで整っていることを優先する。

## 4.2 WARNING

意味:
- 異常発生
- まだ原因不明
- システムが崩れ始める
- HIJACKED確定前

Visual方向:
- amber / yellow-orange
- 既存NORMAL geometryの一部を保つ
- warning sweep
- diagonal scan
- partial misalignment
- intermittent pulse
- ring一部欠損
- limited shake / offset
- 画面端から異常が侵入してくる感覚

Motion:
- NORMALより速い
- 周期が乱れる
- 瞬間的なburstあり

重要:
WARNINGは「完全乗っ取り」ではない。HIJACKEDより秩序を残す。

## 4.3 HIJACKED

意味:
- 外部から制御権を奪われた
- AIの人格は残るが支配状態が変化
- 通信拒否
- 管理者拒否
- 謎モード

Visual方向:
- magenta / violet
- symmetry破壊
- ringsの位相ずれ
- intrusion bands
- offset geometry
- corrupted targeting marks
- scan direction非同期
- 画面内に「別系統の制御レイヤーが割り込んでいる」表現

WARNINGとの差:

WARNING: 「壊れ始めている」  
HIJACKED: 「誰かに支配されている」

と視覚的に判別できること。

## 4.4 HOSTILE

意味:
- 危険
- 攻撃的
- 制御不能
- 機械設備暴走

Visual方向:
- red / deep crimson / black
- high contrast
- thick rupture
- large warning framing
- aggressive radial pulse
- broken ring
- sector collapse
- expanding pressure wave
- high-energy edge motion

Motion:
- 6状態中最大
- ただし字幕・Avatar識別は保つ
- nonstop微振動ではなく、大きい周期変化＋burstで舞台向けにする

HIJACKEDとの差:

HIJACKED: 侵入・支配  
HOSTILE: 破壊・暴走

## 4.5 SHUTDOWN

意味:
- システム停止
- 全機能停止
- 緊張から静寂へ

Visual方向:
- desaturation
- very low brightness
- no active scan
- no pulse
- no ring rotation
- Avatar closed-eye state
- minimal residual system frameのみ
- 状態表示も停止したように見える

最重要:
HOSTILEからの落差。

```text
最大motion
→ 一瞬
→ 静止
```

を成立させる。

「暗いHOSTILE」にしない。「死んだシステム」に見せる。

## 4.6 RECOVERY

意味:
- 再構築
- 正常復帰
- 安堵
- 台本上の「温かな光」

Visual方向:
- warm white / gold / teal
- center-origin light
- broken geometryが順に再接続
- ring segments return
- grid realignment
- Avatar visibility recovery
- warm light → normal cyan/tealへ収束

RECOVERYは単なるフェードではなく、

```text
停止
→ 小さな生命反応
→ UI再構築
→ Avatar復帰
→ NORMAL
```

の段階感を持つ。

ただし最終的な「感動の強さ」はユーザーレビュー対象。

---

# 5. Transition Direction

Transitionは状態差以上に重要である。

Phase Bでは最低限以下を磨く。

## 5.1 boot

目的: 正常起動。

候補構造:

```text
dark idle
→ central core
→ rings
→ rails
→ Avatar
→ subtitle ready
```

派手すぎず、高性能AIらしい起動。

## 5.2 anomaly

NORMAL→WARNING。

```text
stable
→ very short signal loss / distortion
→ partial frame displacement
→ amber warning geometry
→ WARNING settle
```

一瞬で観客が「何か起きた」と気付けること。

## 5.3 takeover

WARNING→HIJACKED。

```text
WARNING structure
→ intrusion from one/multiple edges
→ system geometry overridden
→ palette shift
→ asymmetry locks in
→ HIJACKED settle
```

WARNINGと同じglitchを色だけ変えて再利用しない。

## 5.4 final-challenge-enter

HIJACKEDを維持しつつ、最終問題を主役にする。

- background activityを適度にdim
- Scene Visualを主役へ
- Avatarの人格は残す
- subtitle safe area維持

## 5.5 auth-success / unlock-start

目的: 観客に一度「成功した」と信じさせる。

```text
authentication
→ success confirmation
→ gauges appear
→ controlled acceleration
→ 100%
→ COMPLETE / SUCCESS hold
```

100%到達後は自動ERRORにしない。Operator GOまで成功状態を保持。

## 5.6 emergency-interrupt

最重要Transitionの一つ。

目的: 成功から失敗への落差。

```text
100% SUCCESS
→ short hold
→ abrupt interruption
→ gauge break / freeze / reverse accent
→ emergency protection
→ unlock aborted
```

ERRORを徐々に出さない。「何かに止められた」ことが明確。

## 5.7 hostile-enter

虎谷の端末操作で発火。

- fast palette takeover
- large-scale rupture
- environment inversion
- Avatar周辺のpressure effect
- aggressive framing

台詞「強制暴走モードへ移行します」より前にHOSTILE状態が成立すること。

## 5.8 shutdown

HOSTILE→SHUTDOWN。

長いfade禁止。

```text
HOSTILE maximum
→ hard stop
→ residual flash / collapse
→ motion zero
→ SHUTDOWN
```

舞台の警告音・照明停止と同期しやすいこと。

## 5.9 recovery / normalize

SHUTDOWN→RECOVERY→NORMAL。

RECOVERY完了後にNORMALへ自然に接続する。NORMALへの切替で突然デザインがjumpしない。

---

# 6. Operation Overlay Visual

Overlayは近距離UIではなく、観客が認識できる舞台表示として設計する。

対象:

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

原則:

- 大見出しは遠距離で読める
- title hierarchyを統一
- messageは補助
- 状態色だけに依存しない
- icon / geometry / border styleにも意味差を持たせる
- Overlay同士が連続しても画面が跳ねすぎない
- subtitleを隠さない

---

# 7. Unlock Gauge Visual

Phase A機能をVisualとして完成候補まで引き上げる。

## 必須

- 複数GaugeがAvatar周囲に存在
- 0→100の進行が直感的
- 進捗数字が読めなくても「進んでいる」と分かる
- 100%で明確な成功感
- Avatarを完全に隠さない
- ERROR transitionで壊せる構造
- STOP / REPLAY / reconnect機能を維持

## Visual候補

- concentric progress arcs
- radial nodes
- outer segmented rings
- 3系統 AUTH / CORE / GATE の進捗差
- 100%時に一度全ringが同期する

最終本数・光量はPhase B後レビュー対象。

---

# 8. Final Challenge Visual

最終問題は通常OverlayよりScene Visualを主役とする。

要件:

- 観客が「これが最終問題」と瞬時に理解
- 問題本文 / 画像を大きく取れる
- Avatarと字幕の責務を壊さない
- backgroundを必要に応じてdim
- actual puzzle assetが未確定でもplaceholderで成立
- 16:9でsafe areaを確保

汎用CMS化しない。

---

# 9. Visual Token System

Phase B後のユーザー修正を容易にするため、主要値を集約する。

推奨:

- CSS custom properties
- preset-level tokens
- transition-level tokens

最低限まとめる値:

```text
--phaseb-warning-intensity
--phaseb-hijacked-intensity
--phaseb-hostile-intensity
--phaseb-warning-speed
--phaseb-hijacked-speed
--phaseb-hostile-speed
--phaseb-glow-normal
--phaseb-glow-warning
--phaseb-glow-hijacked
--phaseb-glow-hostile
--phaseb-anomaly-duration
--phaseb-takeover-duration
--phaseb-hostile-enter-duration
--phaseb-shutdown-duration
--phaseb-recovery-duration
--phaseb-overlay-scale
--phaseb-overlay-opacity
--phaseb-grid-opacity
--phaseb-vignette-strength
```

既存design tokenがある場合は重複させず統合する。

重要:
久米レビュー後に「もっと強く」「もう少し遅く」と言われたとき、大規模コード修正ではなくtoken変更中心で対応できること。

---

# 10. Animation Architecture

## 10.1 deterministic

本番再現性を優先する。

完全ランダムanimationは避ける。

ランダム風に見せる場合も、

- predefined sequence
- deterministic phase offsets
- fixed keyframes

を使う。

## 10.2 transform hierarchy

同じDOMに複数animationが競合しない。

特にtranslate / rotate / scale / clip-pathの上書き競合を防ぐ。必要ならwrapperを分ける。

## 10.3 compositor safety

以下を実ブラウザで確認する。

- clip-path破綻
- transformed childのblur
- stacking context誤生成
- filter + transformのちらつき
- large box-shadowによるGPU負荷
- mix-blend-modeによる可読性低下

破綻した技法は、見た目が面白くても撤回する。

---

# 11. Responsive / Projection Contract

主要対象は16:9。

最低確認:

- 1280×720
- 1920×1080相当

必要に応じて現行狭幅回帰も確認。

禁止:

- horizontal scroll
- vertical scroll
- subtitle clipping
- Avatar face clipping
- Overlay title clipping
- Scene Visual safe area逸脱

---

# 12. Reduced Motion

既存`prefers-reduced-motion` / Show settingを維持。

Animation停止時でも、NORMAL / WARNING / HIJACKED / HOSTILE / SHUTDOWN / RECOVERYを色・geometry・framing・labelで区別可能にする。

---

# 13. Autonomous Visual Review Loop

Phase B最大の要件。

Codexは一度実装して終わってはいけない。

最低限、以下を行う。

```text
implementation
↓
real browser screenshots
↓
state comparison
↓
self-critique
↓
fix obvious design/rendering issues
↓
repeat
```

## 13.1 Screenshot matrix

最低限取得:

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

## 13.2 Transition evidence

静止画だけでは分からないため、最低限以下を複数時点で確認。

- anomaly start / mid / end
- takeover start / mid / end
- unlock start / mid / 100
- emergency-interrupt before / mid / after
- hostile-enter before / mid / after
- shutdown before / immediately after
- recovery 0 / 25 / 50 / 75 / 100

動画キャプチャ可能なら短い動画でもよい。不可能ならframe sequenceで代替。

## 13.3 Contact Sheet

全状態を並べた比較画像を作る。

目的:

- WARNING / HIJACKED / HOSTILEの差
- SHUTDOWNの落差
- RECOVERYの独立性
- NORMALへの復帰

を一目で比較すること。

---

# 14. Codexが自主的に修正すべき項目

ユーザー確認不要。

## Layout

- clipping
- overlap
- unsafe margins
- unexpected scroll
- off-center primary composition
- subtitle collision
- Avatar collision
- Scene Visual collision

## State leak

- gauge残留
- overlay残留
- visual残留
- transition class残留
- wrong preset token残留
- recovery後のhostile effect残留

## Z-index

- BLACKOUT下位違反
- Transitionが字幕を不必要に隠す
- OverlayがScene Visualを不適切に潰す

## Motion

- SHUTDOWNでmotion残留
- NORMALにHostile級motion
- duplicate keyframesによるjerk
- animation restart flicker
- reconnect後の過去Transition再生

## Semantic distinction

- WARNING / HIJACKED / HOSTILEが色違い程度しかない
- SHUTDOWNが単なる暗色Presetに見える
- RECOVERYがNORMALへの単純fadeにしか見えない
- emergency-interruptが通常ERRORと区別できない

## Performance

- obvious frame drop
- runaway timer
- animation leak
- large DOM growth
- repeated listener registration
- memory growth

---

# 15. Codexが最終判断してはいけない項目

Phase B後にユーザーへ渡す。

- 「十分派手か」
- 「十分怖いか」
- 「色が好みか」
- 「この演出が一番かっこいいか」
- 「もっと演劇的にしたいか」
- 「Unlock成功の溜め時間」
- 「ERRORのショック強度」
- 「SHUTDOWNの暗さ」
- 「RECOVERYの温かさ」
- 「最終問題の主役感」
- 「舞台照明と合わせた最終輝度」
- 「3〜5mでの最終強度」
- 「TTSの演技力」

Codexは候補を完成させるが、承認しない。

---

# 16. User Review Package

Phase B終了時に、久米が短時間で判断できる成果物を作る。

推奨ディレクトリ:

```text
artifacts/phase-b-review/
```

最低成果:

```text
normal.png
warning.png
hijacked.png
hostile.png
shutdown.png
recovery.png
final-challenge.png
unlock-0.png
unlock-25.png
unlock-50.png
unlock-75.png
unlock-100.png
emergency-protection.png
unlock-aborted.png
anomaly-start.png
anomaly-mid.png
anomaly-end.png
takeover-start.png
takeover-mid.png
takeover-end.png
hostile-enter-start.png
hostile-enter-mid.png
hostile-enter-end.png
shutdown-before.png
shutdown-after.png
recovery-0.png
recovery-25.png
recovery-50.png
recovery-75.png
recovery-100.png
contact-sheet-states.png
contact-sheet-transitions.png
```

可能なら短い動画またはGIFも追加する。

---

# 17. Review Guide

`docs/phase-B/review-guide.md` を作成。

久米が見るポイントを以下に限定して示す。

1. WARNINGは異常発生として十分か
2. HIJACKEDはWARNINGと明確に違うか
3. HOSTILEはクライマックスとして十分か
4. Unlock 100%で一度成功したと思えるか
5. Emergency Errorの落差は十分か
6. SHUTDOWNの静寂感は十分か
7. RECOVERYは温かな復旧に見えるか
8. 最終問題が画面の主役に見えるか
9. 全体として派手さの段階が適切か

技術質問を大量に並べない。

---

# 18. Test / Verification

Phase Aの71 testsを回帰させない。

Phase BでVisual固有testを追加する。

最低限:

- DOM layer order
- BLACKOUT z-index
- state class cleanup
- overlay cleanup
- visual cleanup
- unlock cleanup
- shutdown animation stop
- recovery completion cleanup
- reduced motion
- no unexpected scroll
- required elements visible
- transition completion
- reconnect state stability

## Browser

Admin 1 + Display 3で最低限:

- NORMAL
- WARNING
- HIJACKED
- UNLOCK
- ERROR
- HOSTILE
- SHUTDOWN
- RECOVERY
- NORMAL
- BLACKOUT / RESTORE

を通す。

console:

```text
warning 0
error 0
```

## Soak

Visual animation変更によるtimer / GPU / memory問題を確認する。

最終候補で30分soakを推奨。

最低条件:

- failure 0
- abnormal exitなし
- unbounded memory growthなし
- reconnect正常
- animation state leakなし

---

# 19. Performance方針

見た目のために本番安定性を犠牲にしない。

優先:

1. 安定
2. 明確な状態差
3. 舞台での視認性
4. 派手さ
5. 細部装飾

避ける:

- excessive backdrop-filter
- 巨大blur多重
- 高密度particle
- Canvas/WebGL新規導入
- 毎frame大量DOM生成
- JS requestAnimationFrameによる不要な自前animation

基本はCSS transform / opacity中心。

---

# 20. Git / Versioning

Phase A `v0.5.0`を保護する。

Phase Bでは既存tagを書き換えない。

推奨作業:

```text
v0.5.0
↓
Phase B implementation commits
↓
v0.6.0-rc.1
↓
久米Visual Review
↓
追加調整
↓
v0.6.0
```

`v0.6.0-rc.1`はVisual最終承認前であることを明示する。

---

# 21. 推奨commit分割

例:

```text
feat(display): establish phase-b visual token system
feat(display): refine warning and hijacked stage states
feat(display): refine hostile and shutdown stage states
feat(display): refine unlock and emergency sequences
feat(display): implement staged recovery presentation
test(display): add phase-b visual contracts
test(browser): capture phase-b review matrix
docs: publish phase-b autonomous review package
```

---

# 22. Deliverables

Phase B自律実装完了時:

- 実装コード
- Phase B visual tokens
- updated state visuals
- updated transitions
- updated overlays
- updated Unlock Gauge visual
- updated Final Challenge visual
- screenshot matrix
- transition frame matrix
- contact sheets
- optional video/GIF
- `docs/phase-B/requirements.md`
- `docs/phase-B/verification.md`
- `docs/phase-B/visual-self-critique.md`
- `docs/phase-B/review-guide.md`
- README更新
- release candidate notes
- `v0.6.0-rc.1` annotated tag（条件達成時）

---

# 23. Phase B Autonomous Acceptance Criteria

以下を全て満たしたら、ユーザーVisual Reviewへ進める。

## Regression

- [ ] Phase A機能回帰なし
- [ ] v2/v3 Show互換維持
- [ ] Admin / Display / Audio Master正常
- [ ] reconnect正常
- [ ] BLACKOUT / RESTORE正常

## State Visual

- [ ] NORMALは安定・基準状態
- [ ] WARNINGは異常発生と認識可能
- [ ] HIJACKEDはWARNINGと構造的に異なる
- [ ] HOSTILEはHIJACKEDより明確に高強度
- [ ] SHUTDOWNはmotion停止
- [ ] RECOVERYは段階的復旧
- [ ] NORMAL復帰で残留effectなし

## Major Sequence

- [ ] anomaly成立
- [ ] takeover成立
- [ ] Final Challenge成立
- [ ] Unlock進行が明確
- [ ] 100%成功状態成立
- [ ] Emergency interruption成立
- [ ] Hostile enter成立
- [ ] Shutdown落差成立
- [ ] Recovery sequence成立

## Rendering

- [ ] clippingなし
- [ ] unintended overlapなし
- [ ] scrollなし
- [ ] subtitle可読
- [ ] Avatar識別可能
- [ ] BLACKOUT最上位
- [ ] z-index契約正常
- [ ] 1280×720正常
- [ ] 1920×1080相当正常

## State Cleanup

- [ ] overlay残留なし
- [ ] visual残留なし
- [ ] gauge残留なし
- [ ] transition残留なし
- [ ] reconnect後過去Transition再生なし

## Evidence

- [ ] Screenshot matrix
- [ ] Transition frames
- [ ] Contact sheet
- [ ] self-critique記録
- [ ] 修正履歴

## Verification

- [ ] automated tests PASS
- [ ] browser console warning 0 / error 0
- [ ] Admin 1 + Display 3 browser flow PASS
- [ ] soak PASS
- [ ] failure 0
- [ ] audit重大問題なし

---

# 24. Phase B終了条件

Phase B自律工程の終了点は、

> **「Codexが見ても明らかな描画・設計上の問題は潰れており、各状態の演出意図が明確で、久米が純粋に『好み・強度・演劇的な見え方』だけを判断できる」状態**

である。

ここで初めてユーザーVisual Reviewへ渡す。

Phase Bの目的は、ユーザーにデバッグをさせることではない。

ユーザーが確認するのは、

> **壊れているかではなく、好きか・十分か・もっと強くしたいか**

だけである。
