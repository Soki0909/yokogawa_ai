# 横川AI Phase A 機能実装仕様書 v1.0

作成日: 2026-10-01  
対象: 「7号館からの脱出」横川AI  
基準実装: Phase 4.2 / v0.4.2  
目的: Phase B の感性的なVisual Directionに入る前に、本番で必要な演出をすべてCueから安全・再現可能に実行できる機能基盤を完成させる。

---

# 0. この仕様書の位置づけ

Phase A は「横川AIの見た目を最終完成させる工程」ではない。

Phase A のゴールは、

> **台本上必要な主要演出を、OperatorがCueから最後まで通して実行できる状態を作ること**

である。

WARNING / HIJACKED / HOSTILE / UNLOCK / ERROR / SHUTDOWN / RECOVERY 等の最終的な見た目、派手さ、色、速度、間、舞台距離での印象は Phase B で久米によるVisual Reviewを繰り返して仕上げる。

Phase Aでは機能・状態管理・データ構造・操作・復旧・テストを完成させ、Visual Reviewが必要な箇所は「調整可能なパラメータ」として実装する。

---

# 1. Source of Truth

実装時の優先順位は以下とする。

1. 本仕様書
2. 現行の上演台本
3. 現行 v0.4.2 README / verification
4. 既存コードの実装
5. 過去Phaseの仕様書・旧資料

矛盾する場合は、上位を優先する。

ただし、既存v0.4.2で成立している本番基盤を理由なく破壊しない。

---

# 2. 現行v0.4.2で維持するもの

## 2.1 基盤

- Node.js 20+
- Express
- `ws`
- Vanilla HTML / CSS / JavaScript
- 会場LAN内のみでも中核機能が成立
- `/admin`
- `/display`
- Server authoritative state
- 複数Display
- target / group
- required Display
- Global Audio Master
- state persistence
- reconnect recovery
- heartbeat / OFFLINE判定
- Show File export/import
- Dry Run
- Preflight
- Rehearsal log
- BLACKOUT / RESTORE
- NEXT / BACK / REPLAY / STOP / CLEAR
- Browser TTS / audio-file / none
- Audio Asset Registry
- Avatar asset system
- Blink
- Lip Sync

## 2.2 Presentation Preset

既存6 IDを変更しない。

- `normal`
- `warning`
- `hijacked`
- `hostile`
- `shutdown`
- `recovery`

PresetはAIの「長めに持続する状態」を表す。

場面ごとの短時間処理のためにPresetを増殖させない。

## 2.3 Avatar

本番必須は画像Avatar方式とする。

既存の以下を保護する。

- `base.png`
- `mouth-half.png`
- `mouth-open.png`
- `eyes-closed.png`
- closed / half / open のLip Sync
- Blink
- `shutdown`時の停止
- `recovery`時の再開

Three.js / WebGL 3D AvatarはPhase Aの対象外。

## 2.4 v0.4.2の回帰保護

以下を壊してはならない。

- Admin 1 + Display複数台
- Display個別送信
- Broadcast
- 再接続時の状態復元
- BLACKOUTの最上位表示
- Avatarと字幕がglitch対象外であること
- Audio Master 1台のみ発音
- 過去音声を再接続時に勝手に再生しない
- Show Import失敗時に現在Showを変更しない
- 既存ショートカットの安全制御
- reduced motion
- 既存Avatar assetの互換性

---

# 3. Phase Aの確定方針

## 3.1 本番進行

横川AIは完全Cue方式とする。

- 自由会話を本番進行に使用しない
- 音声認識による回答判定を行わない
- 演者・観客の発話をOperatorが聞き、GOする
- AIの台詞・画面・状態変化はCueで進行する
- 本番中に自動判断を要求しない

既存Free Speak機能は後方互換のため残してよいが、Phase AのShowでは使用しない。削除作業に時間を使わない。

## 3.2 音声

基本方針:

1. まず機械音声を使用可能な構成にする
2. NORMAL / HIJACKED / HOSTILE / SHUTDOWN / RECOVERYの代表台詞で確認する
3. 演出的に不十分なら、後から録音音声Assetに差し替える

Phase Aでは「音声品質の最終判断」は行わない。

Cueから、

- browser speech
- audio file
- none

を選べる既存構成を維持する。

## 3.3 音響・照明

横川AIから照明・舞台音響を直接制御しない。

横川AI側で実装しないもの:

- 照明明滅
- 会場警告音
- 会場アラーム
- 施錠音
- 解錠音
- 機械暴走音
- その他舞台SE

ただしCueに同期情報を持たせる。

---

# 4. Phase Aで実装する演出アーキテクチャ

画面は次の責務へ分離する。

```text
BLACKOUT                 z-index最上位
Operation Overlay
Subtitle / Status
Scene Visual
Avatar
Preset Environment       z-index最下層
```

原則:

- Preset = AI全体の長期状態
- Transition = 状態変化の短時間演出
- Operation Overlay = 現在実行中の処理
- Scene Visual = 台本上必要な問題・情報の表示
- Subtitle = 発話字幕
- Avatar = AIの人格表示
- BLACKOUT = すべてに優先

Avatarと字幕は、Phase Aでも意図せず位置を大きく崩さない。

---

# 5. Cue Schema v3

Phase AではShow schemaを `schemaVersion: 3` へ拡張する。

v2を破棄しない。v2 Show Fileを読み込めること。v2 → v3 migrationを実装すること。

既存フィールドは維持する。

```json
{
  "id": "AI-S1-001",
  "name": "横川AI起動",
  "enabled": true,
  "route": "main",
  "scene": "scene-1",
  "location": "7-201",
  "kind": "speech-display",
  "target": "all",
  "speechText": "",
  "displayText": "",
  "operatorNote": "",
  "triggerNote": "",
  "presentationPreset": "normal",
  "avatar": {},
  "audio": {}
}
```

Phase Aで以下を追加する。

```json
{
  "transition": {
    "id": "boot",
    "durationMs": 1500,
    "intensity": 1
  },
  "overlay": {
    "id": "booting",
    "visible": true,
    "title": "SYSTEM BOOT",
    "message": "",
    "progress": null,
    "variant": "normal"
  },
  "visual": {
    "id": null,
    "type": "none",
    "assetId": null,
    "mode": "contain",
    "visible": false
  },
  "timing": {
    "autoClearOverlayMs": null,
    "autoHideVisualMs": null
  },
  "syncMarkers": [
    {
      "department": "LX",
      "id": "LX-001",
      "note": ""
    }
  ]
}
```

すべての新規フィールドはoptionalとする。

既存v2 Cueは新規フィールドなしでも正常動作すること。

---

# 6. Transition Engine

## 6.1 目的

Presetを直接切り替えるだけではなく、

```text
current state
→ short transition
→ next state
```

をCueから実行できるようにする。

## 6.2 Phase Aで必要なTransition ID

最低限、以下を実装する。

- `none`
- `boot`
- `anomaly`
- `takeover`
- `riddle-enter`
- `final-challenge-enter`
- `auth-success`
- `unlock-start`
- `emergency-interrupt`
- `hostile-enter`
- `shutdown`
- `recovery`
- `normalize`

Transitionの最終ビジュアルはPhase Bで調整する。

Phase Aでは、

- 開始できる
- 指定時間で完了する
- Presetと競合しない
- 再実行できる
- BLACKOUTより下にある
- reconnect後に壊れない

ことを優先する。

## 6.3 duration

各Transitionはデフォルト値を持つがCue単位で上書き可能にする。

duration値をCSSへハードコードして変更不能にしない。

---

# 7. Operation Overlay

## 7.1 目的

Presetを増やさず、「AIが今何を処理しているか」を大きく表示する。

## 7.2 必須Overlay ID

- `none`
- `booting`
- `communication-locked`
- `access-denied`
- `authentication-failed`
- `riddle-active`
- `all-conditions-met`
- `final-challenge`
- `authenticating`
- `authentication-success`
- `unlocking`
- `emergency-protection`
- `unlock-aborted`
- `connection-failed`
- `forced-runaway`
- `system-shutdown`
- `restoring`

表示文言はCueから上書き可能にする。

## 7.3 Overlay表示

Overlayは最低限以下を扱える。

- title
- message
- progress
- variant
- icon / symbol相当のCSS表現
- visible / hidden
- auto clear

`progress` は `null` または0〜100。

Phase Aでは最終デザインを固定しない。

---

# 8. Unlock Gauge

台本上の重要演出として専用実装する。

## 8.1 要件

最終回答後、

1. 認証成功
2. 解錠開始
3. Avatar周辺に複数ゲージ出現
4. 0→100%
5. 一度「成功した」と認識できる状態
6. その後のCueで緊急遮断

を実行できること。

## 8.2 機能仕様

- 複数ゲージ
- 0〜100%
- duration設定可能
- 初期推奨値: 5000ms
- 最低3000ms〜最大10000ms程度を安全に設定可能
- linear固定にしない
- easing / staged progressを後から変更可能
- REPLAY可能
- STOP時に安全に停止
- 次Cueで確実に解除可能
- reconnect時に不正な途中状態を作らない

## 8.3 Phase Aの見た目

Phase Aでは「複数ゲージがAvatar周辺で増加し、100%になる」ことが明確ならよい。

最終的な、

- 本数
- 太さ
- 光量
- 速度変化
- 100%時の溜め
- 成功感

はPhase B。

---

# 9. Scene Visual

## 9.1 方針

何でも表示できる巨大な汎用CMSを作らない。

台本上必要な表示を、安全にCueから呼べる最低限のRendererとする。

## 9.2 必須種別

- `none`
- `text-card`
- `image`
- `final-challenge`
- `riddle-status`

## 9.3 必須用途

- 第一の謎の場所 / 状態提示
- 現在の謎番号
- 5問達成
- 201集合
- 最終問題
- 必要になった固定画像Asset

## 9.4 画像

ローカルAsset Registry方式を使用する。

- PNG
- JPEG
- WebP
- SVG

を扱える設計でよい。

パストラバーサル等を許可しない。

## 9.5 最終問題

`final-challenge`は専用Visualとして実装する。

内容はShow Fileから変更可能にする。

問題内容が未確定でもplaceholderで動作確認できること。

---

# 10. 台本準拠の機能フロー

Phase Aでは最低限、次の流れをdemo Show Fileで通せること。

```text
NORMAL
↓ boot
NORMAL
↓ anomaly
WARNING
↓ takeover
HIJACKED
↓ communication-locked / access-denied
HIJACKED
↓ riddle-enter
RIDDLE MODE
↓ all-conditions-met
201集合
↓ final-challenge-enter
FINAL CHALLENGE
↓ authenticating
AUTHENTICATING
↓ auth-success
AUTHENTICATION SUCCESS
↓ unlock-start
UNLOCK 0→100%
↓ emergency-interrupt
EMERGENCY PROTECTION / UNLOCK ABORTED
↓ connection-failed
ERROR
↓ hostile-enter
HOSTILE
↓ forced-runaway
HOSTILE維持
↓ shutdown
SHUTDOWN
↓ 長時間維持可能
RECOVERY
↓ normalize
NORMAL
↓ optional final confirmation
NORMAL
```

---

# 11. 台本上の重要なCue仕様

## 11.1 乗っ取り

一発でNORMAL→HIJACKEDにしない。

```text
NORMAL
→ anomaly transition
→ WARNING
→ 芝居を挟む
→ takeover transition
→ HIJACKED
```

この2段階をCueとして独立制御できること。

## 11.2 5問達成 / 201集合

優先する正式台詞:

> すべての条件が満たされました。五つの答えを携え、ただちに201へ集合しなさい

このCueをdemo Show Fileへ含める。

## 11.3 最終問題

最終問題表示は台本上必要なScene Visualとして扱う。

問題内容は仮データでよい。

## 11.4 100%後の反転

以下を別Cueにする。

```text
unlocking
→ 100%
→ operator GO
→ emergency-interrupt
→ unlock-aborted
```

100%到達とERRORを自動的に一体化しない。

Operatorが舞台の間を調整できること。

## 11.5 HOSTILE

虎谷の端末操作時点でHOSTILEへ入る。

その後の「強制暴走モードへ移行します」は別Cue。

## 11.6 SHUTDOWN

停止コードを演者が叫んだことをOperatorが確認しGO。

音声認識しない。

Cue実行時:

- HOSTILEの主要motionを止める
- SHUTDOWN Presetへ
- SHUTDOWN Overlay
- その後のAI発話を可能にする

SHUTDOWNはScene 7後半まで何分でも維持できること。

自動RECOVERYしない。

## 11.7 RECOVERY

Operator GOで開始。

```text
SHUTDOWN
→ RECOVERY
→ NORMAL
```

RECOVERYは完了イベントを持つ。

ただし自動で次の台詞Cueを再生しない。

## 11.8 Scene 7差分対応

両方に対応する。

A:
```text
RECOVERY → NORMAL
```

B:
```text
RECOVERY → NORMAL
→ 「全五問、完全正解を確認しました。」
```

最終発話を独立Cueにし、enabledでON/OFFできるようにする。

---

# 12. Sync Marker

Cueに舞台側同期情報を保存できるようにする。

例:

```json
"syncMarkers": [
  {"department": "LX", "id": "LX-12", "note": "照明明滅開始"},
  {"department": "SE", "id": "SE-08", "note": "アラーム開始"}
]
```

Phase Aでは外部機器を制御しない。

Admin上で、

- sync marker
- triggerNote
- operatorNote

が明確に見えること。

Displayへは送らない。

---

# 13. Operator UI

## 13.1 既存操作維持

- NEXT
- BACK
- REPLAY
- STOP
- CLEAR
- BLACKOUT
- RESTORE

## 13.2 Phase A追加表示

Current Cue / Next Cueについて、Adminから最低限以下を確認できる。

- Cue ID
- name
- triggerNote
- operatorNote
- target
- preset
- transition
- overlay
- visual
- audio mode
- sync markers

## 13.3 Cue Jump

既存に十分な機能が無ければ、Cue ID / nameで直接ジャンプできるUIを追加する。

ジャンプは「Cue位置を移動するだけ」と「実行」を混同しない。

誤操作防止を優先する。

## 13.4 危険Cue

最低限以下はAdminで視認しやすくする。

- HOSTILE
- SHUTDOWN
- BLACKOUT

ただしPhase AではUIデザインの美観調整は不要。

---

# 14. Server State

再接続に必要な状態として最低限以下をServer authoritativeにする。

- current cue
- current preset
- current overlay
- current scene visual
- current avatar state
- subtitle
- blackout
- unlock gauge state
- transition completion state
- target-specific presentation state

再接続時:

- 過去音声は自動再生しない
- 画面状態のみ復元
- 一時Transitionを無限再生しない
- Unlockが途中だった場合は安全な静的状態へ復元するか、仕様化したprogressへ復元する

実装方式はコードベースを読んだ上で最小差分を選ぶ。

---

# 15. Audio

Phase Aでは既存Audio architectureを維持。

## 必須

- `browser`
- `audio-file`
- `none`
- Global Audio Master
- STOP
- REPLAY
- 字幕とspeechTextの分離

Phase A用demo Cueに、

- NORMAL代表台詞
- HIJACKED代表台詞
- HOSTILE代表台詞
- SHUTDOWN代表台詞
- RECOVERY後代表台詞

を含める。

Browser TTSの品質そのものはPhase Aの合否条件にしない。

---

# 16. Renderer境界

Phase Aで大規模なThree.js導入はしない。

ただしAvatar描画が既存コードへ密結合しすぎて今後の差し替えを阻害している場合のみ、最小限のRenderer境界を導入してよい。

概念:

```text
AvatarRenderer
└── ImageAvatarRenderer
```

将来:

```text
AvatarRenderer
├── ImageAvatarRenderer
└── ThreeAvatarRenderer
```

ThreeAvatarRenderer自体は実装しない。

リファクタリングが大規模になるならPhase Aでは行わない。

---

# 17. Visual調整可能性

Phase Bで修正しやすいよう、以下を変更可能にする。

- transition duration
- overlay size
- overlay intensity
- glow strength
- animation speed
- pulse interval
- gauge duration
- recovery duration
- hostile intensity
- warning intensity
- opacity
- major color tokens

可能な限りCSS custom properties / data attributes / Show dataへ寄せる。

「久米が見た結果、数字を変えるだけで調整できる」状態を優先する。

---

# 18. Phase Aでやらないこと

以下は明確にスコープ外。

- Three.js Avatar本実装
- 3Dモデル制作
- final visual polish
- WARN/Hijacked/Hostileの最終色決定
- 最終アニメーション速度決定
- 会場3〜5mでの最終視認調整
- プロジェクター輝度対応
- 舞台照明下の最終色調整
- TTS品質の最終採否
- キャスト録音
- DMX制御
- 音響卓制御
- MIDI / OSC連携
- 音声認識
- LLM自由会話
- 謎の自動正誤判定
- 全台本Cueの最終入力
- 謎素材の最終制作
- 汎用CMS
- Electron化
- React等への全面移行
- Socket.IOへの置換
- Redis
- WebRTC
- クラウド必須化

---

# 19. Demo Show File

Phase Aの受入試験用に、実台本の主要状態を通す専用Show Fileを作る。

名前例:

```text
shows/phase-a-demo.json
```

最低限以下を順番に含む。

1. NORMAL待機
2. 起動
3. NORMAL発話
4. anomaly
5. WARNING
6. takeover
7. HIJACKED
8. communication locked
9. access denied
10. riddle mode
11. 5問達成
12. 201集合アナウンス
13. final challenge
14. authenticating
15. authentication success
16. unlock 0→100
17. 100%保持
18. emergency protection
19. unlock aborted
20. connection failed
21. hostile enter
22. forced runaway
23. shutdown
24. shutdown speech
25. recovery
26. normal restored
27. optional final confirmation

placeholder text / imageを使用してよい。

---

# 20. Test Requirements

## 20.1 Unit / integration

最低限テストする。

- v2 → v3 migration
- v3 schema validation
- invalid transition ID
- invalid overlay ID
- invalid visual asset
- invalid progress
- invalid duration
- invalid sync marker
- unknown preset handling
- optional fields absence
- Show Import Dry Run
- Import rollback
- NEXT
- BACK
- REPLAY
- STOP
- CLEAR
- BLACKOUT
- RESTORE
- transition execution
- overlay execution
- overlay clear
- scene visual show/hide
- unlock start
- unlock completion
- unlock replay
- shutdown
- recovery
- optional final cue disabled
- reconnect restore
- target group isolation
- individual Display isolation
- Audio Master behavior

## 20.2 Browser E2E

実ブラウザで最低限確認する。

- Admin 1
- Display 3

シナリオ:

1. 3 Display接続
2. Phase A demo Show import
3. Preflight
4. CueをNORMAL→HIJACKEDまで進行
5. Display 3を切断
6. HOSTILEまで進行
7. Display 3再接続
8. 正しい現在状態へ復帰
9. Display 2のみ別target Cue
10. 他Displayが影響を受けない
11. BLACKOUT
12. RESTORE
13. UNLOCK 0→100
14. ERROR
15. HOSTILE
16. SHUTDOWN
17. RECOVERY
18. NORMAL
19. optional final cue

console warning/errorも確認する。

## 20.3 Soak

既存soakをPhase Aの新状態へ拡張する。

最低30分。

含める操作:

- cue
- replay
- stop
- transition
- overlay
- visual
- unlock
- preset
- reconnect
- broadcast
- individual target
- blackout / restore

failure 0を要求する。

メモリ成長は既存基準を悪化させないこと。

---

# 21. Phase A Acceptance Criteria

以下をすべて満たしたらPhase A完了。

## Architecture

- [ ] v0.4.2既存基盤を維持
- [ ] schemaVersion 3を実装
- [ ] v2 Show互換
- [ ] Server authoritative state維持
- [ ] 新規fieldがoptional
- [ ] transition / overlay / visual責務分離

## Cue / Show

- [ ] Cueからtransition指定可能
- [ ] Cueからoverlay指定可能
- [ ] Cueからvisual指定可能
- [ ] Cueからsync marker指定可能
- [ ] transition duration上書き可能
- [ ] overlay auto clear可能
- [ ] visual show/hide可能
- [ ] Demo Show File完成

## Stage Function

- [ ] NORMAL→WARNING
- [ ] WARNING→HIJACKED
- [ ] RIDDLE MODE
- [ ] 201集合
- [ ] FINAL CHALLENGE
- [ ] AUTHENTICATING
- [ ] AUTH SUCCESS
- [ ] UNLOCK 0→100
- [ ] 100%状態保持
- [ ] EMERGENCY INTERRUPT
- [ ] UNLOCK ABORTED
- [ ] CONNECTION FAILED
- [ ] HOSTILE ENTER
- [ ] FORCED RUNAWAY
- [ ] SHUTDOWN
- [ ] SHUTDOWN長時間維持
- [ ] RECOVERY
- [ ] NORMAL復帰
- [ ] 最終確認台詞optional

## Operation

- [ ] NEXT
- [ ] BACK
- [ ] REPLAY
- [ ] STOP
- [ ] CLEAR
- [ ] BLACKOUT
- [ ] RESTORE
- [ ] Cue jump
- [ ] Current / Next詳細
- [ ] sync marker表示

## Resilience

- [ ] Display reconnect
- [ ] Admin reconnect
- [ ] target isolation
- [ ] Audio Master behavior
- [ ] 過去音声を再接続時に再生しない
- [ ] Import失敗で現Show不変
- [ ] BLACKOUT最優先
- [ ] Transitionが再接続後暴走しない

## Verification

- [ ] full automated tests PASS
- [ ] browser console warning 0 / error 0
- [ ] Admin 1 + Display 3 E2E PASS
- [ ] 30分soak PASS
- [ ] failure 0
- [ ] abnormal exitなし
- [ ] npm auditで重大脆弱性なし
- [ ] Phase A verification.md作成

---

# 22. Phase Aでは合否判定しない項目

以下を「未完成」と判定してPhase Aを止めない。

- WARNINGが十分かっこいいか
- HIJACKEDの侵入感
- HOSTILEの怖さ
- UNLOCKの成功感
- ERRORへの落差
- SHUTDOWNの静寂感
- RECOVERYの感動
- 3〜5mからの視認性
- 舞台照明との色バランス
- animation timingの最終値
- TTSの演技力

これらはPhase Bで確認する。

ただし明らかな表示崩壊、読めない字幕、機能不全はPhase Aの不具合として修正する。

---

# 23. 実装の推奨順

1. repository / branch / current tests確認
2. v0.4.2 regression baseline取得
3. schema v3設計・migration
4. Server state拡張
5. Transition Engine
6. Overlay Renderer
7. Scene Visual Renderer
8. Unlock Gauge
9. Admin表示
10. Show Import / Dry Run拡張
11. Demo Show作成
12. reconnect対応
13. automated tests
14. browser E2E
15. soak
16. docs
17. final regression
18. commit / tag

---

# 24. Git / Release

Phase A開始時に現行HEAD、branch、tag、working treeを記録する。

既存tagを書き換えない。

Phase Aは新規バージョンとして扱う。

推奨:

```text
v0.5.0
```

理由: Cue Schema v3と演出runtime追加を含むため、単純なvisual patchではない。

commitは意味単位に分ける。

例:

```text
feat(show): add cue schema v3
feat(display): add transition and overlay runtime
feat(display): add scene visual and unlock gauge
feat(admin): expose phase-a cue controls
test(show): cover phase-a runtime
docs: publish phase-a verification
```

最終tagは全テスト・E2E・soak・docs完了後のみ付与する。

---

# 25. Deliverables

Phase A完了時、最低限以下を成果物とする。

- 実装コード
- `shows/phase-a-demo.json`
- schema / migration
- automated tests
- browser E2E evidence
- final screenshots
- soak result
- `docs/phase-a/requirements.md`
- `docs/phase-a/verification.md`
- README更新
- CHANGELOGまたはRelease note相当
- annotated git tag

---

# 26. Phase Bへの引継ぎ条件

Phase B開始時には、久米がコードを書き換えなくても以下を繰り返し調整できること。

```text
Codexがvisual調整
↓
実ブラウザ表示
↓
Screenshot / 必要なら動画
↓
久米が感性的評価
↓
数値・CSS・animationを修正
↓
再確認
```

重点対象:

- WARNING
- HIJACKED
- HOSTILE
- UNLOCK
- EMERGENCY ERROR
- SHUTDOWN
- RECOVERY
- 最終問題画面

Phase Aの最重要成果は、

> **Phase Bで見た目だけに集中できる状態**

を作ることである。
