# Codex Implementation Directive — Yokokawa AI Script & Visual Polish v1.1

## 0. Purpose

「7号館からの脱出」本番用の横川AIについて、最新上演台本に合わせて **Scene 1 / Scene 6 / Scene 7 のCue構成・Scene Rehearsal初期化・Display演出を仕上げる**。

今回の主目的は、機能追加ではなく **舞台上で意味が伝わるProduction演出への最終調整** である。

特に、

- Scene Rehearsal Startで残っているセリフテキストを正しく初期化する
- Scene 1の乗っ取りを「黄色い状態変化」ではなく、明確な画面崩壊→紫HACK状態として成立させる
- 台本上ひと続きの出来事を不要に複数Cueへ分割しない
- Scene 6の「5つの謎達成」「認証成功」「複数ゲージ100%」「異常発生」「緊急遮断」を、観客が数m離れても意味を理解できる舞台演出にする
- Scene 7の復旧を100%表示で終わらせず、NORMAL状態へ完全復帰するところまで1つの復旧演出として完成させる

こと。

---

# 1. Current production baseline

直前の確認済み状態:

```yaml
branch: master
HEAD: a433bd4
origin/master: a433bd4

30min_soak_previous_result:
  operations: 891/891
  failures: 0

automated_tests:
  total: 139
  result: PASS

Production_WAV_preload: 18/18 PASS
WAV_Profile_integrity: PASS
Display_reconnect: PASS
Admin_reconnect: PASS
Audio_Master_disconnect_recovery: PASS
AivisSpeech_off_Production_E2E: PASS
Scene_Rehearsal: PASS
STOP_REPLAY_BLACKOUT_RESTORE: PASS
reload_server_reconnect: PASS
external_browser_communication: 0
console_warning_error: 0
offline_dependency_vulnerabilities: 0
```

このSHAは作業開始時点の参考情報であり、Codexは最初に実際のGit状態を確認すること。

```bash
git status
git branch --show-current
git rev-parse HEAD
git rev-parse origin/master
git log --oneline --decorate -n 20
```

既存の未コミット作業を破壊しないこと。

---

# 2. Source of Truth

## 2.1 演劇進行・Scene・Cueの劇中タイミング

最新上演台本を正とする。

```text
『7号館からの脱出』上演台本
https://docs.google.com/document/d/16KxoOjIFLJXikFF_3u3LnnbjnQX8xJvZ-cPPNxkuJVo/edit
```

配置:

```text
共有Drive
└ 【制作共有用】７号館からの脱出
   └ 脚本・謎チーム
      └ 『7号館からの脱出』上演台本
```

Google Docsは **読み取り専用**。

変更・コメント・Drive metadata更新をしないこと。

## 2.2 横川AIの音声

現在のProduction音声は演技指導を反映済み。

以下は現在のProduction実装を正とする。

- Production WAV
- Voice Profile
- 読み
- 発話速度
- pitch
- intonation
- 文間
- WAV内の演技
- 現在実際に使っている発話内容

### 原則

今回の変更のためにProduction WAVを再生成しない。

Cueを統合する場合も、既存の調整済みWAV assetを **新しいCue sequence内から再利用** する。

台本との差が重大な意味矛盾でない限り、音声本文は変更しない。

---

# 3. Autonomous goal setting

以下を読んだ後、

1. この指示書
2. 現在のrepository
3. 最新上演台本
4. 現在のShow/Cue定義
5. 現在のDisplay演出コード

Codex自身で `set_goal` を設定すること。

goalは今回実際に確認したコード構造から自主的に定義し、

- 台本への整合
- 調整済みProduction音声の保全
- 舞台上で分かる視認性
- Scene Rehearsalの正しい初期化
- 既存Productionの回帰防止

を含むこと。

`set_goal`後、通常の実装判断はユーザー確認待ちにせず完遂する。

---

# 4. General visual principle

横川AIのDisplayはPC画面を近距離で見るUIではない。

7・201前方に表示され、観客は数m離れて見る。

したがって状態変化は、

```text
小さな文字
小さなアイコン
細いバー
微妙な色差
```

だけに依存してはいけない。

重要な状態変化は、

- 画面全体の動き
- 大きな形
- レイアウトの変化
- Avatar周辺の明確な変化
- 背景状態
- 大きな進行表示

によって認識できること。

ただし、高速な高頻度フラッシュを多用しない。
強い演出は可能だが、観客に意味が伝わることを優先する。

---

# 5. Scene Rehearsal Start — subtitle/text reset bug

## Current problem

Scene Rehearsal Startで各Sceneの初期状態へ戻した際、

**直前に表示されていた横川AIのセリフテキストが残ることがある。**

これはScene開始状態として不正。

## Required behavior

Scene Rehearsal Startによるstate reconstructionには、

```text
currentSubtitle
caption / speech text
speech-active visual state
lip-sync transient state
```

等のセリフ表示関連stateも必ず含める。

Scene boundary上で発話中ではない場合:

```text
subtitle/text = empty
speech-active = false
lip-sync = settled/non-speaking
```

となること。

単にDOMだけclearするのではなく、**Server authoritative state reconstruction側で正しい状態にする**。

Display reload後も古い字幕が復活してはいけない。

## Required regression test

少なくとも:

```text
Cueを実行して字幕表示
↓
Scene Rehearsal Start
↓
字幕なし
↓
Display reload
↓
字幕なし
```

を確認する。

複数Sceneで確認すること。

---

# 6. Scene 1 — hijack / monitor disturbance

Latest script:

```text
AIがプリンキピアを説明
↓
「突然、モニターの映像が乱れる。」
↓
照明明滅・館内施錠
...
↓
横川AIが通常とは異なる調子で話す
```

## Current problem

現在は状態変化が「黄色くなる」印象に寄っており、

```text
突然、モニターの映像が乱れる
```

という舞台上の出来事として弱い。

## Required new staging

この切り替えは、終盤のSHUTDOWN演出に近いレベルまで **画面全体を大きく動かしてよい**。

ただしSHUTDOWNのコピーではなく、

> 正常な横川AIが外部から奪われ、表示系そのものが壊されて別状態へ上書きされる

という意味が伝わる演出にする。

### Suggested visual vocabulary

Codexは実装に合わせて最適化してよいが、最低限以下のような「画面が乱れた」と数m離れて分かる表現を使う。

- horizontal tearing / slicing
- full-screen displacement
- momentary layout shift
- chromatic split / channel offset
- noise bands
- scan distortion
- Avatar/backgroundの位置揺れ
- HACK側の紫系visualが断続的に侵入
- 最後に紫系HACK状態へsettle

単なる黄色フラッシュや小規模なglitchでは不十分。

## Final state

animation終了後:

```text
stable state = purple HACK / hijacked state
```

として安定すること。

途中の乱れが終わった後も中間状態に残らないこと。

---

# 7. Scene 1 — subtitle during hijack transition

「突然、モニターの映像が乱れる」のtransition中は、

**セリフテキストを表示しない。**

必要な挙動:

```text
previous speech ends
↓
subtitle disappears
↓
monitor disturbance / hijack animation
↓
purple HACK state settles
↓
次のAI発話開始時にそのセリフだけ表示
```

過去のセリフをtransition中に残さない。

次のAI Cueの字幕は、音声開始と整合して表示する。

---

# 8. Scene 1 — merge P-V02 + P-009

Current concepts:

```text
P-V02 五つの謎・第1問開始
P-009 台本009
```

台本では:

```text
ノイズとともに画面が変わり、横川AIが5つの謎を出題する。

AI「第一の謎は、この201にあります」
```

これは舞台上ひと続きの出来事であり、オペレーターが2 Cueに分けて操作する必要はない。

## Required change

**1つのCueへ統合する。**

1回のNEXTで:

```text
1. ノイズ演出開始
2. 画面が「5つの謎 / 第1問開始」状態へ変化
3. 数秒の自然な間
4. 既存の調整済み音声
   「第一の謎は、この201にあります」
   を再生
5. 発話時に字幕表示
6. 第1問開始状態でsettle
```

となること。

### Important

- 新しい音声を生成しない
- 現行P-009相当のProduction WAVを再利用
- Cue統合後に不要になったvisual-only CueをNEXTで別操作させない
- Cue IDは既存参照・ログ・テストを調査し、最も安全なcanonical IDをCodexが決める
- obsolete IDを無理に残して二重実行できる状態にしない

「数秒」は固定値を思いつきで決めず、現在のWAV長・animation長・舞台テンポを確認して自然な値にする。

---

# 9. Scene 6 — five puzzles completed → final problem

Script:

```text
扇
「答えは①から⑤まで全部揃った！ 横川AI、これで脱出できるんだろう！」

横川AI
「条件の達成を確認。五つの解を統合し、最終問題を提示する。最終問題の回答を入力しなさい」
```

## Current problem

現在はCue発火後すぐ最終問題が出現し、

> 5つの謎をすべて解いた

という達成とシステムのアンロック感が弱い。

## Required staging

Cue開始後、

```text
扇の台詞
↓
横川AI Cue
↓
5つの謎がすべて解放 / UNLOCKされたことが明確に見えるanimation
↓
5つの解が統合されるtransition
↓
最終問題をreveal
```

という因果関係をvisualで作る。

### Visual target

例えば:

- 5つのlock / node / moduleが見える
- それぞれが短いsequenceでUNLOCK / VERIFIED
- 五つが中央へ収束
- 統合処理
- 最終問題領域が展開

など。

これは一例であり、現行UIとの整合を優先してCodexがより良い表現を設計してよい。

### Audio synchronization

既存の調整済みWAVは変更しない。

可能なら発話内容の意味とvisual phaseを合わせる。

```text
「条件の達成を確認」
  -> 5つの達成確認

「五つの解を統合し」
  -> integration

「最終問題を提示する」
  -> final problem reveal
```

音声を切り刻んだり再生成したりする必要はない。

---

# 10. Scene 6 — authentication success must NOT use percent gauge

Script:

```text
扇「横川AI、最後の答えは〇〇だ！」
横川AI「……認証成功。これより開錠を開始する」
```

## Current problem

「認証成功」の演出と、その後の「開錠進捗」のゲージが似ており、意味の違いが分かりにくい。

## Required separation

### Phase A — authentication

「認証成功」は **percentage progressではない演出** にする。

例えば:

- large AUTHENTICATED / VERIFIED state
- identity/verification ring lock-in
- central confirmation seal
- access token / check
- brief full-screen confirmation pulse

など。

少なくとも:

```text
0% -> 100%
```

型の表示は禁止。

観客が、

> 答えが正しかった / 認証を通過した

と理解できること。

### Phase B — unlocking process

そのあと初めて、

> 実際の解錠作業が進行している

ことを別visualで示す。

この2つを明確に区別する。

---

# 11. Scene 6 — multiple gauges around Avatar

Script:

```text
横川AIのアバターの周りにいくつものゲージが表示され、
みるみるうちに100%となる。
安堵の歓声が上がりかけたその時……
```

## Current problem

この「いくつものゲージ」が十分に再現されていない。

## Required staging

Avatarを中心に、**複数の独立した進行要素**が同時または時間差で進む演出にする。

単一の大きなprogress barだけでは不十分。

観客から見て、

> 複数系統のセキュリティ解除処理が一気に進んでいる

と感じられること。

### Possible design

例:

- Avatar周囲に複数radial gauges
- 4〜6個程度の大型module progress
- circular arcs + progress values
- module labels / unlock indicators
- staggered progression

など。

ただし細かい文字を読まないと意味が分からない設計にしない。

大きな形と動きで成立させる。

---

# 12. Scene 6 — reaching 100% then “something is wrong”

100%は成功感を一度与える必要がある。

しかし、

```text
100%
```

を画面に残し続けない。

## Desired dramatic progression

```text
multiple gauges climb
↓
all reach 100%
↓
brief successful completion beat
↓
100% UI collapses / disappears / clears
↓
a subtle but clearly perceptible anomaly begins
↓
audience can feel:
「成功したはずなのに、何かがおかしい」
```

この違和感は、その後の虎谷の正体・緊急遮断につながる余白として使う。

### Important

100%の瞬間に即座にERRORへ飛ばしすぎない。

台本には、

```text
安堵の歓声が上がりかけたその時、
後方にいた虎谷が歩み出る
```

という芝居の時間がある。

そのため、

**100%後の状態は役者の芝居を邪魔せず、「成功したが不穏」というstable/semi-stable visualとして成立させる。**

---

# 13. Scene 6 — emergency security interruption

Script:

```text
横川AI
「エラー。セキュリティプロテクトの緊急遮断を確認。
解錠作業ストップ。
エラー。指定されたスタッフへの連絡に失敗。」
```

## Required change

このエラー表現は、

```text
P-014 連絡失敗
```

等、現在Productionで既に使っている **連絡失敗系の演出方式を再利用 / 同じvisual grammarへ統一** する。

CodexはまずP-014の実装を確認すること。

同じ意味のERRORなのに別デザインを新造しない。

### Target

- ERRORであることが遠距離でも分かる
- 通信/連絡失敗であることが既存Cueと同じ文法で理解できる
- 現在のHACK / HOSTILE / WARNING等との状態階層も壊さない

必要なら共通component / presetへrefactorしてよい。

---

# 14. Scene 6 — merge P-V06 stop-code visual and the following system-stop speech

今回統合したい対象を明確にする。

対象は、

```text
P-V06 停止コード・システム停止
```

として現在実装されている **停止コード入力後のVisual / system-stop演出** と、その直後に続く横川AIの発話:

```text
「……システム、全停止。セキュリティを……解放します……」
```

である。

台本上、この2つの間には **他の登場人物の台詞・別のオペレーターCueを挟む必要がない**。

Latest script:

```text
八束「解けたぞ！ 停止コードは……これだ！」
扇「横川AI！ 〇〇！」

M-5 カットアウト。

扇が停止コードを叫ぶと、
激しい警告音と明滅がピタリと止まり、
館内に静寂が訪れる。

横川AI
「……システム、全停止。セキュリティを……解放します……」

SE：プシューという音
SE：重厚な扉のロックが解除される音
```

したがって、

> `P-V06 停止コード・システム停止` を実行したあと、  
> オペレーターがもう一度NEXTを押して  
> 「……システム、全停止。セキュリティを……解放します……」  
> を発話させる構造にはしない。

## Required behavior

**1回のNEXT / 1つのCue** の中で、以下を連続実行する。

```text
1. 停止コード入力を受理
2. HOSTILE / 暴走中の激しいmotion・警告状態を停止
3. 警告音・明滅が止まったことをDisplay上でも明確に表現
4. 館内が静かになったように感じる短いdramatic pause
5. 横川AIが停止済み / shutdown settled状態へ移行
6. 既存の調整済みProduction WAV
   「……システム、全停止。セキュリティを……解放します……」
   を自動的に1回だけ再生
7. 発話開始時にのみsubtitleを表示
8. 発話終了後、subtitle lifecycleを既存仕様どおり処理
9. システム停止・セキュリティ解放後のstable stateへsettle
```

つまり舞台上では:

```text
扇「横川AI！ 〇〇！」
↓
[オペレーター NEXT：P-V06を1回だけ実行]
↓
暴走停止
↓
静寂 / 間
↓
横川AI
「……システム、全停止。セキュリティを……解放します……」
↓
停止後state
```

となる。

## Cue structure

Codexは現在のShow Fileを確認し、

- `P-V06 停止コード・システム停止`
- その直後の「……システム、全停止。セキュリティを……解放します……」を再生するspeech Cue

が現在別Cueであるなら、**P-V06側へ統合する**。

統合後は、後者を通常のNEXT対象として残さない。

ただし:

- 既存WAV assetは削除・再生成しない
- 統合されたP-V06 Cueから既存WAVを参照する
- history / REPLAY / logging上、1つのProduction Cueとして一貫するようにする
- obsolete speech Cue IDへの参照がtest / Admin / logging / script mappingに残っていないか確認する

対象Cue IDの実際の名称が現在異なる場合は、Show FileとWAV mappingを確認して意味的に該当するCueを特定すること。

## Dramatic pause

「いい感じの間」は、単に大きな固定秒数を入れることではない。

目的は:

> 激しい暴走が突然止まったことを観客に認識させ、  
> 一瞬の静寂を作ってから、横川AIの弱った/停止処理的な発話が入る

こと。

現在のvisual transition時間、既存WAVの冒頭、舞台テンポを確認し、実ブラウザで自然に感じる値へ調整すること。

## Cancellation safety

このCueはVisual → delay → audioを含むため、以下を必ず保証する。

### STOP

発話開始前にSTOPされた場合:

- pending speech開始をcancel
- stale timerを残さない
- 数秒後に勝手にWAVが鳴らない

発話開始後なら既存STOP semanticsに従って音声を停止する。

### REPLAY

- P-V06の最初から再現
- visual停止演出から再開始
- pause後、WAVは1回だけ再生
- 古いpending callbackによる二重発話なし

### Scene Rehearsal / Show Reset

Cue途中で実行した場合:

- P-V06のpending sequenceを完全cancel
- Scene Reset後にsystem-stop speechが遅れて鳴らない
- reset後のsubtitle/stateを上書きしない

### Display reload / reconnect

Server authoritative sequence/stateを維持し、
reloadにより同じWAVが重複再生されないこと。

---

# 15. Scene 7 — P-V07 restoration must fully return to NORMAL

Latest script:

```text
そのとき、
正面のモニターに表示された横川AIが温かな光を取り戻し、
正常に復旧する。
```

## Current problem

P-V07 復旧開始がprogress 100%到達で実質終了しており、

```text
正常に復旧する
```

までvisualとして完了していない。

## Required behavior

P-V07相当の1 Cue内で:

```text
SHUTDOWN / stopped state
↓
recovery begins
↓
progress increases
↓
100%
↓
completion beat
↓
percentage / progress UI disappears
↓
visual elements restore
↓
Avatar / background / presentation returns to NORMAL
↓
stable normal state
```

まで完結させる。

100% progress barを最終画面として残さない。

### Final state

Cue完了時:

```yaml
displayMode: NORMAL equivalent
blackout: false
recoveryProgressUI: hidden
transient recovery overlay: none
transition: settled
avatar: normal production state
subtitle: script-appropriate, normally empty unless speech is active
```

実際のfield名は現行runtimeに合わせること。

「温かな光を取り戻す」という台本の印象は、既存NORMAL designを壊さず、復旧transition内の光・色・motionで表現してよい。

---

# 16. Cue merge architecture

今回のCue統合では、

> 1 Cue = 1瞬間

と考えない。

舞台上ひとつのオペレーションとして連続する、

```text
animation
↓
delay / beat
↓
audio
↓
subtitle
↓
final stable state
```

を1 Cueとして扱ってよい。

ただし実装は、

- nested setTimeout乱立
- client-only ad hoc sequencing
- untracked timers

にしない。

既存Cue runtime / transition / playback scheduling architectureを確認し、再現可能・停止可能・REPLAY可能なsequenceとして設計する。

STOP / REPLAY / Show Reset / Scene Rehearsalとの整合を必ず確認する。

---

# 17. STOP / REPLAY semantics for merged Cues

Cue内にdelayやanimationを含むため、以下を必ず設計する。

## STOP

Cue途中でSTOPされた場合:

- pending audio開始をcancel
- pending timers/animation callbacksをcancel
- audio playback停止
- orphaned transitionを残さない

## REPLAY

REPLAYした場合:

- Cueを正しい初期phaseから再現
- 古いtimerが二重実行されない
- audioが二重再生されない
- subtitle lifecycleも最初から再現

## Scene Rehearsal / Show Reset

Cue途中からScene Rehearsal StartまたはShow Resetした場合:

- sequenceを完全cancel
- stale callbackが数秒後に発火しない
- reconstructed stateを上書きしない

---

# 18. Scene Rehearsal state after these changes

Cue統合・演出変更後、各SceneのScene Rehearsal Start stateも再確認する。

特に:

## Scene 1

- script-defined beginning state
- stale subtitleなし
- HACK transition実行前の正しいstate

## Scene 6

- Scene 6開始時点の正しいPresentation
- stale final-problem / 100% / error UIなし
- stale subtitleなし

## Scene 7

台本上Scene 7開始時点では、直前に:

```text
システム全停止
セキュリティ解放
```

が完了している。

したがってScene 7 Rehearsal Startは **P-V07復旧後のNORMALではなく、Scene 7冒頭時点の停止後state** を正しく再構築すること。

P-V07はScene 7中盤〜後半、虎谷が執念を手放したタイミングで実行され、そこで初めてNORMALへ復旧する。

ここを混同しないこと。

---

# 19. Visual self-review — mandatory

実ブラウザで確認する。

最低限:

```text
1920x1080
1280x720
```

## Scene 1

確認:

- monitor disturbanceが本当に「乱れ」に見えるか
- 黄色化だけに見えないか
- fullscreen motionが数m離れて分かるか
- transition中subtitleが消えているか
- 最後にpurple HACKへ明確にsettleするか

## Scene 6

確認:

- 5つの謎達成→統合→最終問題が因果的に見えるか
- 認証成功がpercentage gaugeと誤認されないか
- Avatar周りに複数ゲージが本当に存在感を持って見えるか
- 100%の成功beatがあるか
- 100% UIが残り続けないか
- その後の「何かおかしい」空気が出るか
- emergency interruptionがP-014系visual grammarと一致するか
- stop code Cueが一続きの舞台演出として自然か

## Scene 7

確認:

- recovery progressが100%へ行くか
- 100%後にprogress UIが消えるか
- NORMALへの復旧まで見えるか
- final stateがstableか

スクリーンショットだけで判定困難なanimationについては、Playwright等で複数時点のframe screenshotを残すか、現在の検証環境で可能な方法により遷移を確認する。

Codex自身が画像を確認し、弱ければ修正すること。

---

# 20. Automated tests

既存139 testsを基準に、今回必要なtestを追加・更新する。

最低限:

## Scene Rehearsal subtitle reset

```text
speech subtitle exists
-> rehearsal start
-> subtitle empty
-> Display reload
-> subtitle remains empty
```

## P-V02 + P-009 merged Cue

```text
one NEXT only
visual transition occurs
delay occurs
existing audio starts
subtitle lifecycle correct
final puzzle-start state correct
```

旧visual-only Cueを別NEXTで実行しなくてよいこと。

## Scene 6 final-problem Cue

- five-complete animation phase
- final problem reveal phase
- correct final state
- no unrelated audio changes

## Authentication

- no percentage progress used for auth-success phase

## Multi-gauge unlock

- multiple progress units represented
- completion state reaches full
- transient 100% UI eventually clears

## Emergency error

- reuses/equates to P-014 communication-failure visual grammar as intended

## Stop-code merged Cue

- single Cue
- delay before speech
- existing WAV playback once
- STOP cancels pending phase
- REPLAY does not double-fire
- Scene Rehearsal cancels pending callback

## P-V07

- reaches 100
- progress UI clears
- final state NORMAL
- Display reload receives NORMAL final snapshot

---

# 21. Production regression

Verify existing Production operation remains intact.

At minimum:

```bash
npm run check
npm audit --omit=dev
```

plus current Production Browser Check / relevant E2E.

Check:

```text
Single-PC mode
18/18 WAV preload
Audio Ready
Display reload
server reconnect
NEXT
BACK
REPLAY
STOP
BLACKOUT
RESTORE
HIJACKED
Lip Sync
Preflight
Show Reset
Scene Rehearsal
external browser communication = 0
new console warning/error = 0
```

Production WAV / Voice Profile integrity must remain PASS.

---

# 22. 30-minute soak is NOT required for this task

**Do not run the 30-minute soak test as a completion requirement.**

The previous `a433bd4` baseline already passed the 30-minute Production soak.

For this visual/Cue-polish task, completion may be declared after:

- automated tests
- targeted merged-Cue tests
- Production Browser E2E
- real-browser visual review
- reload/reconnect regression
- Production WAV/Profile integrity
- console/network checks

all pass.

Do not delay completion solely to repeat the 30-minute soak.

A short targeted stability/repetition test is acceptable and recommended, but a 30-minute run is not required.

---

# 23. Explicit non-goals

Do not modify unless directly required:

```text
Production WAV binaries
Voice Profile
pronunciation
speed
pitch
intonation
acting-direction tuning
Avatar character design itself
Netlify Voice Lab
Single-PC architecture
localhost-only Production model
unrelated scenes
```

Do not add new cloud/runtime dependencies.

---

# 24. Git workflow

Create a feature branch, recommended:

```text
codex/yokokawa-script-visual-polish-v1.0
```

Do not:

- reset unrelated user work
- rewrite history
- force push

After all required gates pass:

1. review diff
2. commit
3. push feature branch
4. if repository workflow permits and all gates pass, integrate into `master`
5. rerun critical targeted checks on integrated `master`
6. push `master`

30-minute soak is not required before integration.

---

# 25. Final report

Final report must include:

```text
1. starting branch / HEAD / origin/master
2. Codex set_goal
3. stage script reference used
4. files changed
5. Scene Rehearsal subtitle reset fix
6. Scene 1 hijack animation implementation
7. P-V02 + P-009 merge result
8. Scene 6 five-puzzle unlock/final-problem animation
9. authentication-success visual
10. multi-gauge unlock implementation
11. 100%-then-anomaly implementation
12. P-014-style emergency error reuse
13. stop-code/system-stop Cue merge
14. Scene 7 P-V07 full recovery implementation
15. STOP/REPLAY/Rehearsal cancellation behavior for merged Cue sequences
16. 1920x1080 visual review
17. 1280x720 visual review
18. automated tests result/count
19. Production Browser Check result
20. WAV/Profile integrity
21. preload / Audio Ready
22. reload / reconnect
23. console warning/error count
24. external communication count
25. confirmation: 30-minute soak intentionally not rerun
26. feature branch
27. commit SHA
28. master/origin-master SHA if integrated
29. remaining risks
```

Do not claim a visual requirement is PASS unless it was actually inspected in a real browser.

---

# 26. Definition of Done

```yaml
scene_rehearsal:
  stale_subtitle_after_reset: false
  stale_subtitle_after_display_reload: false

scene_1:
  monitor_disturbance_is_visually_strong: true
  simple_yellow_transition_only: false
  subtitle_hidden_during_hijack_transition: true
  settles_to_purple_hack: true
  puzzle_visual_and_P009_speech_single_cue: true

scene_6:
  five_puzzle_completion_animation: true
  integration_transition_before_final_problem: true
  authentication_uses_non_percent_visual: true
  multiple_avatar_surrounding_gauges: true
  progresses_to_100: true
  persistent_100_UI: false
  post_100_anomaly_state: true
  emergency_error_matches_existing_P014_visual_grammar: true
  stop_code_and_system_stop_single_cue: true
  dramatic_pause_before_system_stop_speech: true

scene_7:
  PV07_progress_to_100: true
  recovery_progress_UI_removed_after_completion: true
  returns_to_NORMAL_within_same_cue: true
  final_state_stable: true

audio:
  existing_tuned_WAV_reused: true
  WAV_regeneration: false
  Voice_Profile_changed: false

merged_cue_safety:
  STOP_cancels_pending_phases: true
  REPLAY_no_double_fire: true
  Show_Reset_cancels_pending_phases: true
  Scene_Rehearsal_cancels_pending_phases: true

regression:
  automated_tests: PASS
  Production_Browser_E2E: PASS
  18_18_preload: PASS
  Audio_Ready: PASS
  reload_reconnect: PASS
  console_new_warning_error: 0
  external_browser_communication: 0

visual_review:
  1920x1080: PASS
  1280x720: PASS

long_soak:
  required: false
```

---

# 27. Final acceptance perspective

Do not evaluate only by implementation correctness.

Evaluate as a stage effect viewed from several meters away.

Final questions:

1. Scene 1で、観客は「モニターが明確に乱れ、横川AIが乗っ取られた」と理解できるか。
2. Scene 6で、「5つ達成 → 最終問題 → 認証成功 → 解錠進行 → 100%成功 → しかし何かおかしい」というドラマが画面だけでも追えるか。
3. 緊急遮断・連絡失敗は、既存のProduction演出と同じシステム世界のERRORに見えるか。
4. 停止コード入力後、1回のCue操作で「暴走停止 → 間 → システム全停止音声」まで自然につながるか。
5. Scene 7で、復旧バーが100%になっただけではなく、「横川AIが正常に戻った」と観客が理解できるか。
6. Scene Rehearsal Startを何度使っても、古い字幕や途中animationが次のSceneへ漏れないか。

この6点を満たして初めて完了とする。
