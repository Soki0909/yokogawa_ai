# 横川AI v0.4.2 要件定義書
## Presentation Preset Visual Overhaul — 舞台演出最終調整パッチ

## 1. 文書の目的

本書は、`yokogawa_ai` の `v0.4.2` における Presentation Preset 視覚演出改修の要件を定義する。

`v0.4.1` では、生成済みの横川AI画像AvatarをローカルAssetとして組み込み、口差分・閉眼差分・Blink・Lip Syncを画像レイヤーへ接続し、6つのPresetを同じAvatarへ `filter / glow / motion` で適用できる状態まで完成している。

`v0.4.2` では新しい機能基盤を増やすのではなく、

> **NORMAL / WARNING / HIJACKED / HOSTILE / SHUTDOWN / RECOVERY の6 Presetを、工大祭の実会場で3〜5m離れて見ても瞬時に状態判別できる「舞台演出レベル」まで引き上げる**

ことを目的とする。

特に、現状のWARNINGが「NORMALに黄色を追加しただけ」に見える問題を解消し、色だけでなく背景構造・光・リング・scan・glitch・motion量によって状態差を成立させる。

---

# 2. バージョン位置づけ

- 対象: `v0.4.2`
- 基準: `v0.4.1`
- 種別: Presentation Preset Visual Overhaul / visual polish patch
- `v0.4.0` / `v0.4.1` の既存機能・tag・履歴を変更しない
- Cue Schema、Show File、Audio、Lip Sync、Blink、BLACKOUT、CLEAR、reconnect等の既存機能を維持する
- Avatarの人物デザインそのものは変更しない

今回の中心は **Display側の視覚表現** である。

---

# 3. 今回のテーマ

> 同じ横川AIシステムが、正常状態から警告、侵入、暴走、停止、復旧へ段階的に変質していく。

6画面を別々の作品として作らない。

NORMALを基準世界として、同じDOM・同じAvatar・同じ基本レイアウトに対して、環境演出が徐々に変化・破損・停止・修復する構造とする。

状態遷移の基本イメージ:

```text
NORMAL
  ↓ 異常検知
WARNING
  ↓ 侵入・制御権喪失
HIJACKED
  ↓ 暴走・敵対化
HOSTILE
  ↓ 緊急停止
SHUTDOWN
  ↓ 再起動・修復
RECOVERY
  ↓
NORMAL
```

---

# 4. 絶対に維持するもの

以下は `v0.4.1` を基準として、原則変更しない。

## 4.1 Avatar

- 横川AIの人物デザイン
- 顔
- 髪
- 眼鏡
- スーツ / 服装
- Avatar画像Asset
- Avatarの基本位置
- Avatarの基本サイズ
- mouth closed / half / openの局所レイヤー方式
- 閉眼局所レイヤー方式
- Blink
- Lip Sync
- normalからhostileまで「同じ人物」であること

PresetによるCSS filter、glow、overlay、外周光などは変更可能だが、元画像そのものを書き換えない。

## 4.2 基本レイアウト

- 16:9を基準とする画面構成
- 左側の `YOKOGAWA AI` 情報領域
- Avatar領域
- 右側の状態表示領域
- 下部字幕パネル
- 主要な情報階層
- 字幕の表示位置
- 字幕の読みやすさ
- Displayの既存DOM責務

背景演出のために内部layerを追加してよいが、観客が見る主要ブロックを再配置しない。

## 4.3 既存Show Control

以下を壊さない。

- Presentation PresetのServer authoritative state
- reconnect後Preset復元
- CueからPreset指定
- `preset-only`
- CLEAR
- BLACKOUT / RESTORE
- Show Reset
- Browser TTS
- local audio
- Audio Master
- Lip Sync
- Blink
- reducedMotion
- Show File
- Preflight
- Rehearsal Log
- Admin 1 + Display 3運用

---

# 5. スコープ

## 5.1 実装する

- 6 Presetの背景・overlay・motion再設計
- Presetごとの色彩設計
- 背景グラデーション
- radial / conic gradient
- 大型リング
- セクター / arc
- scanline / scanning beam
- grid / circuit的補助線
- warning pulse
- controlled glitch
- RGB / chromatic shift
- UI侵食表現
- hostile用の強い環境演出
- shutdownの完全停止表現
- recoveryの修復・再同期表現
- Preset用CSS変数整理
- Animation命名・責務整理
- `prefers-reduced-motion` / 既存reducedMotion対応
- 実ブラウザScreenshotによる視覚自己批評
- 自己批評結果を受けた自律修正
- Visual verification記録

## 5.2 原則スコープ外

- Avatar画像の再生成
- Avatar人物の変更
- 新しい顔・服装・髪型
- 3D / WebGL必須化
- Three.js等の大型依存導入
- 全面Canvas化
- 新しいCue schema
- Audio仕様変更
- 高精度Lip Sync
- Script / storyの変更
- Admin UI大改修
- 新しいPreset追加
- 自動的な脚本進行
- RECOVERYからNORMALへのServer state自動変更

最後の項目は重要である。RECOVERYのアニメーションが完了しても、Server authoritativeなPresetを勝手にNORMALへ変更しない。NORMALへの遷移は既存のCue / operator操作で行う。

---

# 6. 設計原則

## 6.1 色だけで状態差を作らない

「青 → 黄 → 紫 → 赤」の色変更だけでは不十分。

各Presetは、少なくとも以下の複数軸で差を持たせる。

```text
color
background geometry
light
overlay
motion amount
motion character
UI integrity
noise / glitch
status emphasis
avatar treatment
```

## 6.2 同一システムの連続性

Presetが変わっても、

- Avatar
- subtitle
- left information block
- right status block
- base system chrome

は同じシステムのものと分かること。

HIJACKED / HOSTILEでも、画面全体をまったく別レイアウトへ置換しない。

## 6.3 舞台距離を基準にする

PCモニターを30cmから見るのではなく、

> **観客が3〜5m離れた場所からプロジェクターまたは大型Displayを見る**

ことを基準にする。

細かいノイズだけでは状態差として数えない。

## 6.4 静止画でも状態が分かり、動くとさらに分かる

Animationを停止したScreenshotでも、NORMAL / WARNING / HIJACKED / HOSTILE / SHUTDOWN / RECOVERYの大半を識別できること。

その上でmotionが状態差を増幅する。

## 6.5 可読性は壊さない

特に字幕は演出対象ではなく情報伝達対象として扱う。

- 字幕本文へ強いglitchをかけない
- 字幕パネルを大きく傾けない
- 字幕を頻繁に位置ずれさせない
- Avatarの口をoverlayで隠さない
- 状態ラベルが背景へ埋もれない

---

# 7. Display Layer設計

既存DOMを尊重しつつ、概念的には以下のlayer責務に整理する。

```text
DisplayRoot
 ├─ EnvironmentBackground
 │   ├─ base gradient
 │   ├─ ambient glow
 │   ├─ grid / circuit
 │   ├─ giant rings / arcs
 │   └─ environment particles/noise
 ├─ SystemChrome
 │   ├─ left info
 │   ├─ right status
 │   └─ decorative lines
 ├─ Avatar
 │   ├─ base image
 │   ├─ mouth overlay
 │   ├─ blink overlay
 │   └─ preset aura / eye overlay
 ├─ PresetOverlay
 │   ├─ scan
 │   ├─ warning sectors
 │   ├─ corruption strips
 │   └─ glitch layers
 ├─ Subtitle
 └─ Blackout
```

BLACKOUTは常に最上位責務を維持する。

新規layerを作る場合も、pointer event等による既存操作への悪影響を出さない。

---

# 8. CSS / Preset Architecture

Preset差分を巨大な個別CSSのコピペにしない。

可能な限り以下のようなCSS custom propertiesを持つ。

```css
--preset-bg-0
--preset-bg-1
--preset-fg
--preset-accent
--preset-accent-2
--preset-danger
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

Preset root class / `data-preset` で変数と必要なanimationを切り替える。

例:

```text
[data-preset="normal"]
[data-preset="warning"]
[data-preset="hijacked"]
[data-preset="hostile"]
[data-preset="shutdown"]
[data-preset="recovery"]
```

Animation名は役割が分かるものにし、状態ごとに同じkeyframesを無理に共有しすぎない。

---

# 9. 視覚強度階層

状態強度は以下を満たす。

```text
NORMAL < WARNING < HIJACKED < HOSTILE
```

SHUTDOWNは「最大強度」ではなく「動作喪失」。

RECOVERYは「暴走後の修復過程」。

目安:

| Preset | Motion | UI破損 | 光量変化 | Glitch |
|---|---:|---:|---:|---:|
| NORMAL | 0〜1 | 0 | 1 | 0 |
| WARNING | 2 | 0〜1 | 2 | 0〜1 |
| HIJACKED | 3 | 2 | 3 | 2 |
| HOSTILE | 4 | 3 | 4 | 3〜4 |
| SHUTDOWN | 0 | 0 | 0〜1 | 0 |
| RECOVERY | 1〜2 | 1→0 | 1〜2 | 1→0 |

この表は実装値そのものではなく演出階層の目安。

---

# 10. NORMAL要件

NORMALは `v0.4.1` の現在画面をデザイン基準とする。

## 必須

- 静かな青 / cyan系
- 知的
- 清潔
- 研究用AI / システムUI
- background motionは非常に弱いか無くてよい
- Avatarの人物像を最も自然に見せる
- subtitle優先
- statusは安定
- 不穏さを出しすぎない

## v0.4.2での扱い

NORMALを派手に作り直してはいけない。

共通layer追加に伴う微調整は許容するが、最初にBaseline Screenshotを保存し、改修後に比較する。

---

# 11. WARNING要件

テーマ:

> 正常系UIが「重大な異常を検知し、システム全体が警戒モードへ移行した」。

単なる「黄色い線の追加」に見えてはいけない。

## 色

- deep navy / charcoalを維持
- amber / yellow-orangeを主accent
- 背景そのものにわずかなamber汚染
- 白飛びする黄色は避ける

## 背景

最低限以下のうち3種類以上を明確に用いる。

- Avatar背後の大型concentric ring
- segmented warning arc
- radial amber glow
- sweeping scan beam
- caution-sector pattern
- subtle diagonal hazard texture
- warning grid emphasis

リング等は画面中央の小さな飾りではなく、3〜5mで認識できるスケールにする。

## motion

- 大型ringの低速回転
- scan beamが周期的に横断
- amber glowがゆっくりpulse
- warning sectorが順次点灯
- status emphasisが周期的に強くなる

全画面点滅で表現しない。

## UI

- 左右panelの基本位置は維持
- statusを明確に `WARNING`
- frame / separatorsの一部をamber化
- subtitleは安定
- Avatar位置変更なし

## 合格条件

静止ScreenshotをNORMALと並べたとき、色だけを見なくても「警告モードへの切替」が分かる。

---

# 12. HIJACKED要件

テーマ:

> システムが外部から侵入され、正常なUIの一部が別の制御に奪われた。

WARNINGの強化版ではなく、「制御権を奪われた」質的変化を作る。

## 色

- magenta / violet
- cyanの残留
- dark navy / near-black
- warningのamberは主色として残さない

## 背景

- normal系gridの一部破損
- magenta intrusion bands
- offset scan
- data corruption strip
- duplicate / displaced line fragments

## UI侵食

レイアウトそのものは維持しつつ、一部decorative elementに:

- 2〜8px程度の局所offset
- horizontal slice displacement
- duplicated border
- intermittent chromatic split
- corrupted micro-label
- broken decorative line

を使える。

ただしsubtitle本文・主要状態情報は読みやすさを維持する。

## motion

- irregular scan
- intermittent horizontal displacement
- low-frequency glitch burst
- ringの同期崩れ
- 一部layerのみ逆方向へ動く

## Avatar

- 元画像を維持
- violet / magenta rim light
- 軽いchromatic edge
- 必要なら眼鏡付近などへの局所overlay
- 顔全体を破壊するglitchは禁止

## 合格条件

「警告」ではなく「侵入・乗っ取り」であることが、文字を読まなくても一定程度分かる。

---

# 13. HOSTILE要件

テーマ:

> 横川AIが制御不能・敵対的な暴走状態へ到達した。

6 Preset中で最大の視覚強度とする。

## 色

- black / near-black
- crimson / red
- dark red
- 必要に応じて僅かなmagenta
- 通常cyanは破損した残光としてのみ残してよい

## 背景

- Avatarを中心とした大きなred core glow
- fragmented ring
- rotating hostile arcs
- broken grid
- deep vignette
- controlled noise
- intermittent horizontal rupture

## motion

WARNING / HIJACKEDより明確に強い。

例:

- segmented ringの異なる速度回転
- arcの断続的再配置
- slow red breathing glow
- irregular glitch burst
- local RGB shift
- UI chromeの瞬間的なslice displacement

ただし常時すべてを最大にしない。強弱を作る。

## Avatar

- 人物は同じ
- 強いred rim / under glow
- eye areaの発光overlayは可
- Avatarの位置・サイズは維持
- 顔が読めないほどのnoiseは禁止

## UI

- right statusを強くHOSTILE化
- system chromeの一部破損
- 一部borderの欠損
- warningより明確に危険
- subtitleは最後まで読める

## 合格条件

WARNING / HIJACKED / HOSTILEを3枚並べたとき、HOSTILEが最も強い状態であることに迷いがない。

---

# 14. SHUTDOWN要件

テーマ:

> システム停止。暴走が止まり、機能が失われた。

HOSTILEより派手にしない。

## 色

- near-black
- desaturated navy / gray
- accentほぼ消失
- faint red / gray残光程度

## motion

**原則完全停止。**

- ring停止
- scan停止
- glow pulse停止
- glitch停止
- Avatar Blinkは既存仕様どおり閉眼停止
- Lip Syncは停止状態

`animation-play-state`やpreset stateで停止が明確になる設計が望ましい。

## UI

- status: shutdown / offline相当
- 情報量を減らした印象
- 一部のsystem chromeをdim
- subtitle表示仕様は既存Cueに従う
- 真っ黒なBLACKOUTとは区別する

## 合格条件

動画を見なくても「静止・停止した」印象がある。
BLACKOUTとは別状態と分かる。

---

# 15. RECOVERY要件

テーマ:

> 停止したシステムが再起動し、破損したUIが徐々に同期・修復される。

単純に緑色のNORMALにしない。

## 色

- cyan / teal / cool white
- normalより一時的に明るいrepair glow
- broken red / magentaが短時間残留してもよい

## motion

- ring再整列
- scanによる再初期化
- corrupted lineが正常位置へ戻る
- glowが安定していく
- glitch強度が時間とともに下がるように見える

CSS animationとして「修復感」を作る。

ただしanimation終了時にServer stateを勝手にNORMALへしない。

## UI

- status: RECOVERY / RESTORING等
- 同じlayoutへ回帰
- Avatarは既存recovery状態
- Blink再開
- subtitleは安定

## 合格条件

NORMALと同じではなく「正常へ戻る途中」であることが分かる。

---

# 16. Motion Safety / reducedMotion

必須:

- 3Hz以上の全画面点滅を実装しない
- full-screen flashを主演出にしない
- rapid luminance inversionを避ける
- `prefers-reduced-motion` を尊重
- 既存reducedMotion設定を壊さない

reducedMotion時:

- ring回転を停止または大幅低速化
- scanを停止または単純表示へ
- glitch burstを停止
- chromatic displacementを静的表現へ
- warning / hijacked / hostileの状態差自体は保持

つまりmotionを切ってもPresetが識別できること。

---

# 17. Performance要件

- WebGL必須にしない
- 大型video backgroundを使わない
- runtime cloud asset禁止
- CDN依存禁止
- 可能な限りCSS gradient / pseudo element / lightweight SVG
- DOMを過剰に増やさない
- noiseを巨大base64連番画像で実装しない
- requestAnimationFrame loopを必要以上に増やさない
- hidden / blackout / shutdown時に不要animationを抑える
- Admin 1 + Display 3の既存soakを悪化させない
- console warning / errorを増やさない

---

# 18. Responsive / Projection要件

最低確認:

- 1920×1080相当
- 1440×825前後のdesktop
- 既存Displayサイズ
- Admin 390×844は回帰確認

Displayでは:

- 16:9で主要演出が欠けない
- background ring等がviewport依存で不自然に切れない
- subtitleが常にsafe area内
- Avatarが既存位置からずれない
- right statusが切れない

---

# 19. 実ブラウザ Visual Verification

今回の中心要件。

Codexはコードを書いて終了してはいけない。

実ブラウザで6 Presetを表示し、Screenshotを取得し、自分で画像を見て批評して修正する。

## 19.1 Baseline

実装前に `v0.4.1` のNORMAL Screenshotを取得する。

可能なら同じviewport、同じ字幕、同じAvatar状態で取得する。

## 19.2 Screenshot Matrix

最低限:

```text
normal
warning
hijacked
hostile
shutdown
recovery
```

同一viewportで取得。

さらにmotionが重要なPreset:

```text
warning: 2〜3時点
hijacked: 2〜3時点
hostile: 2〜3時点
recovery: 2〜3時点
```

を取得し、Animationの時間変化も確認する。

## 19.3 比較用Composite

可能なら6 Presetを同じ大きさで並べた比較画像または同等の一覧を作る。

目的は「個別に見ると派手」ではなく、

> 6状態の階層と連続性が成立しているか

を確認すること。

---

# 20. Codex Visual Self-Critique

Screenshot取得後、Codexは以下を明示的に自己評価する。

## 共通

- 3〜5m離れても状態差が分かるか
- Avatarは同じ人物に見えるか
- Avatar位置・サイズが変わっていないか
- subtitleが常に読めるか
- 背景がUIを食っていないか
- 状態ラベルが読めるか
- 細部だけでなく画面全体の空気が変わっているか
- 16:9で構図が破綻していないか
- NORMALが過剰に派手になっていないか

## WARNING

- 黄色い線を追加しただけに見えないか
- 背景そのものが警告モードへ変化しているか
- giant ring / scan / glow等が遠目で認識できるか
- HIJACKEDより弱いか

## HIJACKED

- WARNINGとの差が色変更だけになっていないか
- 「侵入・乗っ取り」のUI破損が見えるか
- HOSTILEほど破壊的ではないか

## HOSTILE

- 6状態の中で最大強度か
- 赤一色で平板になっていないか
- glitchが強すぎて字幕・顔が読めなくなっていないか
- 一瞬のScreenshotでも暴走感があるか

## SHUTDOWN

- motionが本当に停止しているか
- BLACKOUTと区別できるか
- 暗いだけではなく「機能停止」に見えるか

## RECOVERY

- NORMALの色違いになっていないか
- 修復 / 再同期の時間軸があるか
- HOSTILEから戻っている印象があるか

---

# 21. 自律修正ループ

最低以下のループを実行する。

```text
1. 実装
2. Browser起動
3. 6 Presetを同条件で表示
4. Screenshot取得
5. Screenshotを実際に視認
6. Self-Critiqueを文章化
7. 問題点を優先度順に整理
8. CSS / SVG / animationを修正
9. 再Screenshot
10. Before / After比較
11. 受入条件を再評価
```

WARNING / HIJACKED / HOSTILEについては、最低2回の視覚レビューを行うこと。

合理的に改善可能な問題が残る場合はユーザー確認を待たず修正する。

無限反復はしない。最大5 Visual pass程度を目安とし、それでも残る実会場依存事項はVerificationへ明記する。

---

# 22. Visual Regression保護

以下を変更していないことをScreenshot / DOM / testで確認する。

- Avatar x/y
- Avatar scale
- left panelの大枠
- right panelの大枠
- subtitle位置
- subtitle safe area
- 主要text hierarchy

Blink等のランダム差分を除き、NORMALはv0.4.1 baselineと同じ構図であること。

---

# 23. Automated Test要件

視覚そのものをunit testだけで保証しようとしない。

ただし以下は自動化する。

- 6 Preset ID維持
- preset class / data属性反映
- required visual layer存在
- shutdownでanimation state停止
- recoveryでBlink再開
- reducedMotion class / media query
- BLACKOUT最上位
- reconnect後current preset復元
- unknown preset安全処理
- normalでhostile専用layerが誤表示されない
- subtitle DOMがglitch対象に含まれない
- Avatar base asset不変
- existing v0.4.1 tests regression

既存テストを削除してPASS数を合わせない。

---

# 24. Browser / Multi Display Regression

最低:

- Admin 1
- Display 3
  - Main
  - Side
  - Mobileまたは既存3台構成

確認:

- 6 Preset同期
- reconnect
- CLEAR
- BLACKOUT
- RESTORE
- SHOW RESET
- Blink
- Browser TTS simulated
- local audio / audio-reactive
- shutdown → recovery
- console warning/error

---

# 25. Soak / Performance Regression

既存30分soakを利用可能なら実行。

少なくともPreset切替を多数含める。

確認:

- failure = 0
- abnormal exitなし
- memory growthが既存基準から著しく悪化しない
- animation追加で操作遅延を起こさない
- reconnect後に正しいPreset
- shutdownで不要animation停止
- blackout中に不要演出が見えない

---

# 26. ドキュメント

最低限更新:

- `README.md`
- root `VERIFICATION.md` または既存入口
- `docs/phase-4.2/verification.md` 等のv0.4.2専用検証記録

既存Phase 4 / Phase 4.1記録を上書きしない。

Visual Verificationには最低限:

- baseline
- final preset screenshots
- viewport
- Browser
- self-critique概要
- visual pass回数
- 最終的に修正した点
- 残余課題
- reducedMotion確認
- multi-display
- automated tests
- soak
- npm audit
- Git state

を記録する。

---

# 27. Git / Version

- 実装開始前に `git status`
- `v0.4.1` tag / commit確認
- `v0.4.0` / `v0.4.1` tagを変更しない
- working treeがdirtyなら内容を理解してから進む
- ユーザーの既存変更を勝手に破棄しない

意味のあるcommit単位例:

1. preset visual architecture
2. warning / hijacked visual overhaul
3. hostile / shutdown / recovery
4. visual regression / reduced motion
5. browser review fixes
6. tests / docs

完成条件を満たした場合のみ annotated `v0.4.2` tagを作成しpushする。

---

# 28. 禁止事項

- Avatar人物デザイン変更
- Avatar画像再生成
- Avatar位置の大幅変更
- 字幕位置変更
- layout全面再設計
- WARNINGを黄色borderだけで済ませる
- HIJACKEDを紫filterだけで済ませる
- HOSTILEを赤filterだけで済ませる
- subtitleへ強いglitch適用
- 3Hz以上の全画面flash
- seizure-riskの高いストロボ
- WebGL必須化
- 大型framework導入
- runtime外部CDN依存
- Screenshotを取得せず「見た目は良いはず」と判断する
- Screenshotを取得しても画像を見ずにテストPASSだけで完了扱いする
- RECOVERY animation終了だけでServer presetを勝手にNORMALへ変える
- 既存tag改変
- user変更の破棄

---

# 29. v0.4.2 受入条件

以下をすべて確認する。

1. `v0.4.1` 基準確認
2. v0.4.0 tag不変
3. v0.4.1 tag不変
4. existing tests PASS
5. Avatar asset不変
6. Avatar人物デザイン不変
7. Avatar基本位置不変
8. Avatar基本サイズ不変
9. left info領域維持
10. right status領域維持
11. subtitle位置維持
12. 6 Preset ID維持
13. normal baseline screenshot取得
14. normalが過剰に変化していない
15. warningが画面全体で明確に変化
16. warningに大型background geometry
17. warningにscan / pulse等のmotion
18. warningが黄色border追加だけではない
19. hijackedがwarningと質的に異なる
20. hijackedにUI侵食 / offset表現
21. hijackedにmagenta/violet系侵入表現
22. hijackedでもsubtitle可読
23. hostileが最大視覚強度
24. hostileにred/black environment
25. hostileにfragmented ring / rupture等の構造差
26. hostileでもAvatar認識可能
27. hostileでもsubtitle可読
28. `WARNING < HIJACKED < HOSTILE`成立
29. shutdownで主要animation停止
30. shutdownがBLACKOUTと区別可能
31. shutdownで既存閉眼停止維持
32. recoveryに修復motion
33. recoveryがnormal単純色違いではない
34. recoveryでBlink再開
35. recovery終了でServer stateを勝手にnormalへ変更しない
36. reducedMotion対応
37. reducedMotionでも6状態の識別性維持
38. 3Hz以上の全画面点滅なし
39. subtitleがglitch layer対象外
40. BLACKOUTが常に最上位
41. CLEAR回帰なし
42. reconnect Preset復元
43. Show Reset回帰なし
44. Browser TTS回帰なし
45. local audio回帰なし
46. Lip Sync回帰なし
47. Blink回帰なし
48. Admin 1 + Display 3でPreset同期
49. desktop browser screenshot 6種
50. warning複数時点 screenshot
51. hijacked複数時点 screenshot
52. hostile複数時点 screenshot
53. recovery複数時点 screenshot
54. 6 Preset比較レビュー
55. WARNING自己批評2回以上
56. HIJACKED自己批評2回以上
57. HOSTILE自己批評2回以上
58. 視覚問題を見つけた場合に自律修正
59. final screenshotで再評価
60. console warning/error増加なし
61. automated visual-state tests PASS
62. full regression PASS
63. 30分soakまたは既存同等試験PASS
64. failures 0
65. abnormal exitなし
66. memory著しい悪化なし
67. npm audit重大問題なし
68. README更新
69. v0.4.2 verification作成
70. visual self-critique記録
71. residual venue-dependent issue記録
72. working tree clean
73. remote push済み
74. annotated `v0.4.2` tag
75. 実会場での最終投影確認のみを合理的な残課題として残せる状態

---

# 30. 完成時の状態

`v0.4.2` 完了時には、

> NORMAL画面の人物・レイアウト・システムとしての連続性を維持したまま、WARNING / HIJACKED / HOSTILE / SHUTDOWN / RECOVERYが色・背景構造・光・motion・UI integrityの複数軸で明確に差別化され、3〜5m離れた観客にも一瞬で状態遷移が伝わる

状態を目指す。

特に成功条件は、

> **WARNINGが「黄色を足したNORMAL」ではなく、画面全体が警告モードへ切り替わったように見えること**

である。
