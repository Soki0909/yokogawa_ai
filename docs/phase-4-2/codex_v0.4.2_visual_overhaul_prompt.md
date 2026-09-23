# Codex 実装プロンプト
## 横川AI v0.4.2 — Presentation Preset Visual Overhaul

あなたは `yokogawa_ai` リポジトリの `v0.4.2` を、設計確認、実装、実ブラウザVisual Review、Screenshot自己批評、自律修正、回帰テスト、長時間試験、ドキュメント更新、Git整理、push、annotated tag作成まで自律的に完了してください。

今回の目的は、

> `v0.4.1` で完成した同一Avatar・同一UI・6 Presentation Presetの基盤を維持しながら、NORMAL → WARNING → HIJACKED → HOSTILE → SHUTDOWN → RECOVERY の視覚表現を、本番舞台で3〜5m離れて見ても一瞬で判別できる水準まで引き上げること

です。

今回は「機能を増やす」より **Presetの演出完成度を上げるVisual Polish** が中心です。

特にWARNINGを「黄色い線を足したNORMAL」にしないでください。

---

# 0. 最初に読むもの

必ず以下を確認してください。

1. `yokogawa_ai_v0.4.2_visual_overhaul_requirements.md`
2. Phase 4 / v0.4.0要件
3. Phase 4実装プロンプト
4. Phase 4.1 / v0.4.1要件または実装記録
5. Phase 4.1 / v0.4.1 verification
6. `README.md`
7. root `VERIFICATION.md`
8. Display HTML / CSS / JS
9. Presentation Preset定義
10. Avatar renderer
11. BlinkController
12. LipSyncController
13. BLACKOUT / CLEAR
14. reducedMotion
15. Show File
16. tests
17. soak test
18. Git log / tags / remote

ファイル名が異なる場合はリポジトリを調べて特定してください。

ユーザーの既存変更を消してはいけません。

---

# 1. Goal

利用可能ならGoalを設定してください。

> v0.4.2として、NORMALの人物・基本レイアウトを維持したまま6 Presentation Presetの背景・overlay・motion・UI integrityを再設計し、WARNING < HIJACKED < HOSTILEの視覚強度階層、SHUTDOWNの完全停止感、RECOVERYの修復感を成立させる。実ブラウザScreenshotを自分で見て批評・修正するVisual loopを最低限実行し、回帰・soak・docs・push・v0.4.2 tagまで完了する。

ユーザーへの途中確認は原則不要です。

合理的に判断できることは自律的に決めてください。

---

# 2. 基準状態を確定する

最初に:

```bash
git status
git log --oneline --decorate -n 20
git tag --list --sort=-version:refname
git remote -v
```

等を確認してください。

`v0.4.1` を基準にします。

既存 `v0.4.0` / `v0.4.1` tagを書き換えないでください。

実装前にfull testsを実行し、現在のPASS数と状態を記録してください。

---

# 3. 最重要固定条件

以下は変更対象ではありません。

## Avatar

- 人物デザイン
- 顔
- 髪
- 眼鏡
- スーツ / 服装
- base画像
- mouth差分画像
- blink画像
- Avatar基本位置
- Avatar基本サイズ

Presetによる:

- filter
- glow
- aura
- rim light
- eye-area overlay
- chromatic edge

は変更可能です。

元画像を再生成・加工して置き換えないでください。

## Layout

- 16:9基本構成
- 左側YOKOGAWA AI情報領域
- Avatar領域
- 右側状態表示
- 下部字幕パネル
- 字幕位置
- 主要情報階層

背景layerやdecorative overlay追加は可。

主要blockの再配置は不可。

---

# 4. 実装前Baseline Screenshot

**コード変更前に必ず実ブラウザで現在のNORMALをScreenshotしてください。**

条件を固定します。

可能なら:

- Desktop
- 1440×825前後または現行検証viewport
- 同じ字幕文
- Avatar mouth closedまたは安定状態
- BLACKOUTなし

ファイル例:

```text
artifacts/visual-v042/baseline-normal.png
```

Git管理するかは既存方針に合わせて判断してください。

目的は最終NORMALとのvisual regression確認です。

---

# 5. 実装方針

Presetを6枚の別ページとして作らないでください。

同じDisplay DOMへ:

```text
data-preset
CSS custom properties
pseudo elements
lightweight overlay elements
CSS gradients
SVG if needed
CSS animation
```

を適用する構造を優先してください。

推奨責務:

```text
DisplayRoot
 ├─ EnvironmentBackground
 ├─ SystemChrome
 ├─ Avatar
 ├─ PresetOverlay
 ├─ Subtitle
 └─ Blackout
```

既存構造と異なる場合、無理に名称を合わせず責務だけ取り入れてください。

---

# 6. CSS変数を整理する

巨大なPreset別コピペCSSにしないでください。

必要に応じて以下のようなcustom propertiesを導入してください。

```css
--preset-bg-0
--preset-bg-1
--preset-fg
--preset-accent
--preset-accent-2
--preset-glow
--preset-ring-opacity
--preset-ring-speed
--preset-scan-opacity
--preset-scan-speed
--preset-grid-opacity
--preset-noise-opacity
--preset-glitch-strength
--preset-chromatic-shift
--preset-panel-offset
--preset-motion-scale
--preset-avatar-filter
--preset-avatar-glow
```

実際の命名は既存コードへ合わせてよいです。

---

# 7. NORMAL

NORMALは現在のデザイン基準です。

やること:

- v0.4.1の静かなblue / cyan世界観を維持
- shared visual layer追加で必要な最小修正のみ
- Avatarを最も自然に見せる
- motionは弱い
- hostile用layer等を誤表示しない

やってはいけない:

- NORMALを派手に再デザイン
- Avatar位置変更
- subtitle移動
- 大型ringを常時強表示
- 不穏なglitch追加

実装後、Baseline Screenshotと比較してください。

---

# 8. WARNING

今回最も重要な改善対象です。

テーマ:

> 異常を検知し、システム全体が警戒モードへ切り替わった。

**黄色いborder・WARNING icon・文字色変更だけで完了しないでください。**

最低限、以下から3種類以上を画面全体の大きな演出として成立させてください。

- large concentric rings
- segmented amber arcs
- radial amber glow
- sweeping scan beam
- warning sector illumination
- diagonal hazard texture
- warning grid emphasis

推奨:

```text
background:
  deep navy → dark amber contaminated gradient

avatar behind:
  large segmented ring

foreground:
  slow scan beam

system chrome:
  amber emphasis

motion:
  slow ring rotate
  scan traverse
  glow breathe
  sector pulse
```

ポイント:

- giant ringは小さなアイコンではなく、遠目で分かる大きさ
- 背景自体がNORMALから変わる
- subtitleは安定
- Avatar位置は固定
- 全画面flashは禁止

WARNINGだけを見ても「警告状態」と分かり、NORMALと並べたら一瞬で違いが分かる必要があります。

---

# 9. HIJACKED

テーマ:

> 外部侵入により正常UIの一部が別制御へ奪われた。

WARNINGの単純強化にしないでください。

色:

- magenta
- violet
- dark navy
- residual cyan

表現:

- gridの破損
- magenta intrusion band
- horizontal corruption strip
- decorative line offset
- duplicate border
- local RGB split
- intermittent slice displacement
- ring synchronization failure
- broken micro-label

UIを完全に崩壊させず、正常UIが「侵食されている」ように見せます。

字幕と主要status情報は読めること。

motionはWARNINGより不規則で、HOSTILEほど破壊的にしないでください。

---

# 10. HOSTILE

テーマ:

> 制御不能・敵対的な暴走。

6状態中の最大視覚強度です。

色:

- near-black
- crimson
- dark red
- small residual magenta/cyan

推奨:

- Avatar背後のlarge red core glow
- fragmented ring
- hostile arcs
- broken grid
- heavy vignette
- controlled static/noise
- horizontal rupture
- local RGB shift
- strong but intermittent glitch burst

Motion:

- WARNINGより強い
- HIJACKEDより強い
- 常時全部を最大にはしない
- pulseとburstに緩急を作る

Avatar:

- 同じ人物
- red rim light
- under glow
- eye-area glow overlay可
- 位置・サイズ固定
- 顔を破壊しない

字幕は最後まで読めること。

「赤いfilterを乗せただけ」は不合格です。

---

# 11. SHUTDOWN

テーマ:

> 緊急停止後。システムが機能を失った。

重要:

**派手さを下げ、motionを止めてください。**

- ring stop
- scan stop
- glitch stop
- glow pulse stop
- existing blink closed stopを維持
- desaturated
- near-black
- status shutdown/offline

BLACKOUTではありません。

画面情報は薄く残り、「表示装置は生きているがAIは停止している」と読める状態にしてください。

---

# 12. RECOVERY

テーマ:

> 再起動・再同期・UI修復中。

単なるgreen NORMALは禁止です。

推奨:

- cyan / teal / cool white
- damaged lineが元位置へ戻る
- ringが再整列
- scanがrepair sweepとして通過
- residual magenta/red corruptionが薄れる
- glowが安定
- glitchが収束

重要:

RECOVERY animationが完了しても、Server authoritative presetを自動でNORMALへ変更しないでください。

operator / CueがNORMALへ切り替えます。

---

# 13. 視覚強度を必ず比較する

実装後に以下を横並びで確認してください。

```text
NORMAL
WARNING
HIJACKED
HOSTILE
SHUTDOWN
RECOVERY
```

そして以下を成立させます。

```text
NORMAL < WARNING < HIJACKED < HOSTILE
```

ここでいう強度は単なる彩度ではありません。

- screen coverage
- geometry scale
- motion amount
- motion irregularity
- UI integrity loss
- glow
- glitch

の総合です。

---

# 14. Subtitle保護

字幕は演出の犠牲にしないでください。

禁止:

- subtitle本文への強glitch
- 字幕全体の大幅position shift
- 高速opacity flicker
- RGB splitで読めなくする
- ring / scanで文字を埋める

字幕panelのaccent変更程度は可。

---

# 15. reducedMotion

既存reducedMotionを必ず維持・強化してください。

reducedMotion時:

- rotate stopまたは極低速
- scan stop
- glitch burst stop
- displacement stop
- pulse大幅低減

ただし静止背景・色・geometry・UI integrityにより6状態の差は残します。

3Hz以上のfull-screen flashは禁止です。

---

# 16. Visual Screenshot Loop — 最重要

**ここを省略しないでください。**

コードを書いた後、必ず実ブラウザScreenshotを取得し、自分で画像を見て判断してください。

自動テストPASSだけでは完成扱いにしません。

## Pass 1

同じviewport、同じ字幕、同じAvatar位置で:

```text
normal
warning
hijacked
hostile
shutdown
recovery
```

をScreenshot。

motion対象は複数時点:

```text
warning_t1
warning_t2
warning_t3

hijacked_t1
hijacked_t2
hijacked_t3

hostile_t1
hostile_t2
hostile_t3

recovery_t1
recovery_t2
recovery_t3
```

全部3枚必須ではありませんが、最低2時点以上は確認してください。

---

# 17. Screenshotを実際に見る

Screenshotファイルを作っただけで終わらないでください。

Codexの利用可能な画像確認手段で実際に画像を開き、Visual Self-Critiqueを行ってください。

各Presetについて以下を文章で記録してください。

```text
What works
What is weak
What is visually confusing
What is too subtle at 3–5m
What obscures Avatar/subtitle
What should change next
```

特にWARNING / HIJACKED / HOSTILEは厳しく評価してください。

---

# 18. WARNING Self-Critique基準

以下のどれかに該当したら修正してください。

- NORMALに黄色を足しただけに見える
- ringが小さくて遠目で見えない
- 背景がほぼNORMALのまま
- scanが細すぎる
- amber glowのscreen coverageが小さい
- status文字を読まないとWARNINGと分からない
- HIJACKEDと強度が逆転する
- subtitleよりdecorative elementが前に出る

最低2 visual pass行ってください。

---

# 19. HIJACKED Self-Critique基準

以下なら修正:

- WARNINGの色違い
- 紫filterだけ
- UI侵入感がない
- glitchが均一すぎる
- decorative破損が細かすぎて遠目で見えない
- HOSTILEとほぼ同じ
- subtitleまで壊れている

最低2 visual pass。

---

# 20. HOSTILE Self-Critique基準

以下なら修正:

- 赤いfilterだけ
- HIJACKEDより弱い
- 画面全体が赤一色で平板
- glitchが常時強すぎる
- Avatarの顔が判別できない
- subtitleが読めない
- ring / arcsがWARNINGと同じ形
- 一瞬のScreenshotで暴走感が不足

最低2 visual pass。

---

# 21. SHUTDOWN / RECOVERY Self-Critique

SHUTDOWN:

- 本当にanimationが止まっているか
- BLACKOUTと違うか
- 単に暗いHOSTILEになっていないか

RECOVERY:

- green NORMALになっていないか
- 修復方向のmotionがあるか
- UIが整列していくように見えるか
- normalへ戻る途中の意味があるか

---

# 22. 自律修正

Visual Self-Critiqueで問題を発見したら、

**ユーザーへ「どうしますか」と聞かずに合理的な修正を行ってください。**

ループ:

```text
Implement
→ Screenshot
→ Inspect
→ Critique
→ Prioritize issues
→ Fix
→ Screenshot again
→ Compare
```

WARNING / HIJACKED / HOSTILEは最低2回。

必要なら3〜5 pass行って構いません。

5 pass程度でも会場依存で決め切れない点のみ、verificationの残余課題へ残してください。

---

# 23. 比較画像

可能ならScreenshotを6枚同サイズにして比較できるcontact sheet / compositeを作ってください。

目的:

- hierarchy
- continuity
- screen coverage
- color separation
- layout consistency

の同時確認。

これは開発用artifactであり、アプリ機能へ組み込む必要はありません。

---

# 24. NORMAL Visual Regression

最終NORMAL Screenshotをbaselineと比較してください。

Blink / mouthの瞬間差を除き:

- Avatar位置
- Avatarサイズ
- left panel
- right panel
- subtitle位置
- system chrome大枠

が維持されていること。

もし共通layer追加でNORMALが派手になりすぎた場合は戻してください。

---

# 25. Browser / Multi Display

既存の実ブラウザ構成を再利用してください。

最低:

```text
Admin 1
Display 3
```

6 Presetを切替し、3 Displayでcurrent preset / stateが一致すること。

併せて:

- reconnect
- CLEAR
- BLACKOUT
- RESTORE
- Show Reset
- shutdown → recovery
- Blink
- Browser TTS simulated
- local WAV audio-reactive

を回帰確認。

---

# 26. Automated Tests

既存testsをすべて維持。

追加候補:

- `data-preset` / class mapping
- required visual layers
- Avatar base asset path不変
- shutdown motion disabled
- recovery Blink restart
- reducedMotion state
- subtitle outside glitch layer
- blackout top layer
- current preset reconnect restore
- unknown preset fallback
- hostile-only layer hidden in normal

visual qualityそのものをunit testで保証したふりをしないでください。

---

# 27. Console確認

実ブラウザで:

- console error 0
- unexpected warning 0を目標
- animation / timer bind errorなし
- missing assetなし
- invalid CSS animation warningなし

を確認してください。

既存ブラウザ由来の不可避warningがある場合は根拠を記録。

---

# 28. Performance

以下を避ける:

- WebGL必須化
- giant Canvas loop
- 毎frame大量DOM生成
- continuous JS layout measurement
- giant animated raster background
- external CDN

CSS compositor-friendlyな:

- transform
- opacity

を優先。

filterはAvatar等の必要箇所に限定し、全画面高コストfilterを重ねすぎないでください。

---

# 29. 30分Soak

既存soakを利用してください。

Preset変更を高頻度で含める。

最低確認:

- 6 Preset
- reconnect
- CLEAR
- BLACKOUT / RESTORE
- audio
- lip sync
- blink
- shutdown / recovery

記録:

```text
duration
events
failures
preset changes
reconnects
audio events
blackout count
RSS start/end
abnormal exit
```

failureがあれば修正後に再実行。

---

# 30. npm audit / security

今回security変更が少なくても既存方針に合わせて確認。

例:

```bash
npm audit --omit=dev
```

新規外部dependencyは原則追加しないでください。

---

# 31. README

`v0.4.2` の説明を追加。

最低:

- Presentation Preset Visual Overhaul
- 6 states
- visual intensity hierarchy
- reducedMotion
- visual layers
- venue tuning
- troubleshooting

venue tuningとして、必要なら:

- ring opacity
- glow intensity
- scan opacity
- motion scale

等をCSS variableで調整できることを説明。

---

# 32. Verification

v0.4.2専用verificationを作ってください。

例:

```text
docs/phase-4.2/verification.md
```

既存Phase 4 / 4.1記録は残します。

最低記載:

1. baseline commit/tag
2. implementation summary
3. visual architecture
4. NORMAL regression
5. WARNING
6. HIJACKED
7. HOSTILE
8. SHUTDOWN
9. RECOVERY
10. reducedMotion
11. Screenshot matrix
12. Visual pass log
13. Self-Critique
14. Before/After
15. Admin 1 + Display 3
16. Browser
17. console
18. automated tests
19. soak
20. npm audit
21. acceptance 75 items
22. commits
23. push
24. tag
25. residual venue checks

---

# 33. Visual Pass Log

Verificationへ最低以下のような記録を残してください。

```markdown
## Visual Pass 1

### WARNING
- issue:
- evidence:
- fix:

### HIJACKED
- issue:
- evidence:
- fix:

### HOSTILE
- issue:
- evidence:
- fix:

## Visual Pass 2
...
```

「問題なし」とだけ書かず、何を見たかを具体的に記録。

---

# 34. 重要な禁止事項

- Avatarの元画像変更
- Avatar人物再デザイン
- Avatar位置・サイズの大幅変更
- subtitle位置変更
- layout全面再構築
- WARNING = yellow filter only
- HIJACKED = purple filter only
- HOSTILE = red filter only
- subtitle強glitch
- full-screen rapid flashing
- 3Hz以上の全画面点滅
- WebGL必須
- runtime CDN
- giant new framework
- Screenshot未確認のまま完了
- Screenshotを保存しただけで画像を見ない
- test PASSだけでvisual acceptanceを代替
- RECOVERYからNORMALへ勝手にserver state変更
- v0.4.0 / v0.4.1 tag改変
- user変更破棄

---

# 35. Git

Visual workは調整回数が増えるため、意味のある単位でcommitしてください。

例:

```text
feat(display): add preset environment visual layers
feat(display): overhaul warning and hijacked presentation
feat(display): overhaul hostile shutdown recovery presentation
fix(display): refine preset visuals from browser review
test(display): add preset visual-state regression coverage
docs: document v0.4.2 visual verification
```

完成前に:

```text
full tests
browser visual review
multi display
soak
npm audit
docs
git status
```

を再確認。

すべて合理的にPASSした場合のみ:

```text
v0.4.2
```

annotated tagを作成しremoteへpush。

---

# 36. 完了報告

最後に以下をまとめてください。

1. v0.4.2基準commit
2. 変更ファイル
3. visual architecture
4. NORMAL変更有無
5. WARNING演出
6. HIJACKED演出
7. HOSTILE演出
8. SHUTDOWN演出
9. RECOVERY演出
10. reducedMotion
11. Baseline Screenshot
12. Final Screenshots
13. Visual Pass回数
14. Self-Critiqueで見つけた問題
15. それぞれの修正
16. 6-state comparison結果
17. `WARNING < HIJACKED < HOSTILE`確認
18. subtitle可読性
19. Avatar layout regression
20. Admin 1 + Display 3
21. reconnect
22. CLEAR / BLACKOUT / RESTORE
23. Browser TTS
24. local audio
25. Blink / Lip Sync
26. automated tests
27. console
28. soak
29. npm audit
30. README / verification
31. acceptance 75項目
32. commits
33. remote push
34. v0.4.2 tag
35. working tree
36. 実会場でのみ残る確認事項

---

# 37. 完成定義

`yokogawa_ai_v0.4.2_visual_overhaul_requirements.md` の受入条件を確認し、

> NORMALのレイアウト・Avatar・字幕を守りながら、6 Presetが「同じ横川AIシステムの段階的状態変化」として成立し、WARNING / HIJACKED / HOSTILEが3〜5mの観客へ明確に伝わる

こと。

さらに、

> Codex自身が実ブラウザScreenshotを見て、少なくともWARNING / HIJACKED / HOSTILEを複数回自己批評し、弱い演出を自律修正した

ことを完成条件に含めます。

ユーザー確認を待たず、可能な範囲を最後まで自律的に進めてください。
