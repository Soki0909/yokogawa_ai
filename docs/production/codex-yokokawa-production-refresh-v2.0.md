# Codex Implementation Directive — Yokokawa AI Production Refresh v2.0

## 0. Mission

「7号館からの脱出」本番用の横川AI Productionを、現在の上演台本・実際のオペレーション・今後の微調整に耐えられる構造へ一度に刷新する。

今回の方針は、

> ユーザー確認なしで合理的に決められる実装判断はCodex自身で決め、実装・検証・自己批評・修正・master統合・pushまで自律完遂する。

である。

細かな実装方針、UI配置、内部データ構造、標準値、テスト方法について、要件・台本・既存コードから合理的に判断できる場合は確認待ちにしない。

---

# 1. Mandatory autonomous `set_goal`

作業開始後、次を確認する。

1. このdirective全文
2. 現在のrepository / Git状態
3. 最新上演台本
4. 現在のProduction Show / Cue
5. Audio / Display / Admin / Scene Rehearsal / recording implementation
6. 現在のProduction assets

その上で、Codex自身が `set_goal` を設定する。

goalは文面をコピーするのではなく、実際のコード状態を踏まえて自主的に定義すること。

少なくとも、

- 最新台本への整合
- Production speech編集基盤
- subtitle同期
- SFX / transition基盤
- Production Display演出
- Admin本番UX
- startup/resetの安全性
- offline Production維持
- regression safety

を包含すること。

`set_goal`後は、本directiveで「人の判断が必要」と明記したもの以外、原則ユーザー確認を挟まず完遂する。

---

# 2. Current known baseline

前回完了時点の参考情報:

```yaml
master: accac58f5916cd2368de23f35ec0787c93ee28f7
origin_master: accac58f5916cd2368de23f35ec0787c93ee28f7
tests: 148/148 PASS
Production_E2E: PASS
WAV_preload: 18/18
Audio_Ready: PASS
reload_reconnect: PASS
external_browser_communication: 0
console_warning_error: 0
WAV_Profile_integrity: PASS
```

このSHAを前提にしない。

必ず実際に確認:

```bash
git status
git branch --show-current
git rev-parse HEAD
git rev-parse origin/master
git log --oneline --decorate -n 20
```

未コミットのユーザー作業を破壊しない。

---

# 3. Latest stage script is authoritative for dramatic structure

最新上演台本:

```text
『7号館からの脱出』上演台本
https://docs.google.com/document/d/16KxoOjIFLJXikFF_3u3LnnbjnQX8xJvZ-cPPNxkuJVo/edit
```

Google Docsは読み取り専用。

禁止:

- edit
- comment
- metadata update
- shared Drive mutation

## Script is authoritative for

- Scene boundaries
- Scene order
- Yokokawa AI Cue dramatic position
- which Cue still exists
- which Cue was removed
- current spoken content where the script materially changed
- puzzle presentation timing
- stage action before/after AI cues

現在Show Fileが台本と違う場合、**システム側を台本へ合わせる**。

---

# 4. Audio preservation rule

既存Production音声は演技指導済み。

したがって、台本変更と無関係な既存WAVは不要に再生成しない。

ただし最新台本の変更により、

- line itself changed materially
- line was removed
- new AI line added

ことが明確なら、最新台本へProductionを同期する。

新規/変更音声は現在採用中のVoice Profileを使用し、既存の演技傾向を維持する。

別Voice Modelへの切替は本taskでは自動採用しない。
比較サンプル作成までは可。

---

# 5. Mandatory script re-audit

実装前に最新台本と現在Show/Cueを再監査する。

最低限確認:

- Scene 1
- Scene 6
- Scene 7
- Yokokawa AI全発話
- puzzle presentation cues
- 201集合関連
- startup
- HACK
- HOSTILE
- stop code
- recovery

台本から削除されたProduction Cueは、単なるdisabled放置ではなく、不要ならShowから整理する。

現在確認済みの例:

- 「第一の謎は、この201にあります」は最新台本から削除されている可能性があるため、現台本を再確認して同期
- 横川AIによる201集合Cueが現台本にない場合は削除
- Scene 6最終回答など、最新台本で具体化された部分を確認

過去チャット上の文字列を最新台本より優先しない。

---

# 6. P-002 pronunciation override

対象:

```text
「例えば、そちらに久安光さんが参加しています」
```

表示テキストは台本どおり自然な表記を保つ。

音声生成上のみ、

```text
「例えば、そちらに、久安光さんが参加しています」
```

相当のpauseが入るようにする。

今回を機に、

```text
displayText
spokenText
```

を分離可能にする。

表示用文言へ読み調整用の不要な句読点を混ぜない。

---

# 7. Production Speech Composer

現在の「文章内へ `。...` 等を入れてTTS間隔を調整する」方式から脱却する。

## Goal

各AI speech Cueについて:

```text
display text
spoken text
sentence segmentation
sentence WAVs
gap between sentences
preview
subtitle timing
final Production WAV export
```

を編集可能にする。

## Core principle

本番runtimeでsentence WAVを多数連続再生してpauseを作るのではなく、

> 調整確定後にsentence WAV + silenceを結合し、1本のProduction WAVを書き出す。

本番は従来どおりfinal Production WAVを1本再生する。

これにより:

- STOP
- REPLAY
- preload
- Audio Ready
- reload
- recording
- offline operation

を安定維持する。

---

# 8. Speech data model

現行アーキテクチャに合わせて最適化してよいが、概念的に以下を保持可能にする。

```yaml
speech:
  displayText: "表示する全文"
  spokenText: "音声生成用全文"

  segments:
    - displayText: "第1文。"
      spokenText: "第1文。"
      gapAfterMs: 650

    - displayText: "第2文。"
      spokenText: "第2文。"
      gapAfterMs: 900

  productionWav: "..."
```

sentence segmentationは原則 `。！？` 等を基準に自動生成できるようにする。

ただしAdmin/Editor上で:

- segment boundary adjustment
- spokenText override
- gapAfterMs adjustment

が可能であること。

---

# 9. Speech Composer UX

Debug-onlyの開発UIではなく、今後稽古で調整可能な実用ツールにする。

最低限:

```text
Cue / speech選択
全文表示
sentence segment一覧

[文1] [再生]
gap: 650 ms

[文2] [再生]
gap: 900 ms

[全文Preview]

[Production WAVを書き出す]
```

を実現。

必要ならAdvanced / Production Tools領域へ置く。

誤操作で本番WAVを壊さないよう、

- validation
- explicit export
- output confirmation
- deterministic filename / manifest

を持つ。

---

# 10. Sentence WAV generation

現在のAivisSpeech / Production音声生成基盤を利用する。

各segment:

- current approved Voice Profile
- current pronunciation rules
- current speed/pitch/intonation settings

を使用。

既存Production lineは、不要ならsegment再生成しなくてよい。

新規生成時、AivisSpeechが必要。

Production runtimeは引き続きAivisSpeechなしで動作する。

---

# 11. Final WAV rendering

Production Speech Composerは、sentence WAV間へ指定silenceを挿入して1本のfinal WAVを生成する。

要件:

- PCM paramsをProduction standardへ統一
- deterministic order
- no clipping
- normalizationは既存Production policyを尊重
- final WAV integrity check
- current preload manifestへ反映
- existing SHA/integrity systemに統合

final render後、Production Browserで利用可能になること。

---

# 12. Subtitle must derive from the same sentence segments

Audio segmentationと字幕分割を別管理しない。

同じsegment metadataから字幕を出す。

長いセリフでは:

```text
segment 1 audio begins
-> segment 1 subtitle

segment 2 begins
-> segment 2 subtitle
```

と切り替える。

前文が永遠に残らない。

短い1文のCueは従来の自然な表示を保ってよい。

---

# 13. Subtitle flow reveal

長文segmentについて、一気に全文を瞬間表示するだけでなく、音声に合わせて自然に流れ出る表示を実装する。

ただし「1文字ずつ遅いtyping effect」で読みにくくしない。

Goal:

- speech開始と同時に自然にreveal
- 観客が読む余裕がある
- speech終了より十分前に全文が見えている
- 数m離れても読みやすい

実装方式はCodexが実ブラウザで比較し最適化する。

最低限:

```text
instant
flow
```

程度のmode分離は可。

長いspeechにflowを採用し、短いspeechはinstantでもよい。

---

# 14. Subtitle reset correctness

Scene Rehearsal / Show Reset / Production Reset / scene changeで、

- stale sentence
- previous subtitle
- flow animation
- delayed reveal callback

を残さない。

Server authoritative stateとしてclearする。

Display reload後も復活しない。

---

# 15. Yokokawa AI SFX system

今後、横川AI由来SEはこのシステムから再生する。

SFXをProduction Cue timelineの正式要素にする。

例:

- startup
- HACK noise
- HACK settle
- verify/auth success
- puzzle unlock
- integration
- progress/gauge
- 100% complete
- warning/error
- HOSTILE transition
- shutdown
- recovery
- recovery complete

## Runtime

```text
Cue
├ Visual
├ SFX
├ Speech
└ timing
```

として1 Cue内で組み合わせられること。

SFXのためにNEXTを増やさない。

---

# 16. SFX asset policy — autonomous range

ユーザー確認なしで進めてよい素材は:

1. repository内既存素材
2. Codexが自己生成できるprocedural SFX
3. ライセンスが明確なCC0 / Public Domain素材

とする。

外部素材を使う場合:

- source URL
- title/author if available
- license
- download date
- local filename

を記録。

ライセンスが不明、attribution条件が複雑、商用/公演利用が曖昧な素材は使用しない。

迷う場合は **procedural/self-generated SFXを選ぶ**。

Productionはofflineで完結させる。

---

# 17. Separate SFX volume control

SpeechとSFXは同じ音量調整にしない。

Adminに最低限:

```text
Speech Master
SFX Master
```

を持たせる。

本番中にSFXだけ微調整可能。

ただし操作を煩雑にしない。

---

# 18. Transition grammar

背景・全体色の状態遷移を整理する。

最低限:

```text
cut
fade
glitch
```

のsemantic transitionを持つ。

## Default guidance

### glitch / abrupt

- HACK intrusion
- HACK成立
- HOSTILE / 暴走移行

### cut

演出的に突然変化すべきerror/critical event。

### fade / smooth

- startup completion
- normal scene-to-scene shifts
- puzzle presentation transitions
- recovery to NORMAL
- non-hostile state changes

Cueごとに最適なmodeを持たせる。

既存の全Cueを一律fadeにはしない。

---

# 19. Startup redesign

最初の起動時はmeter / percent表示を使わない。

Desired dramatic flow:

```text
inactive / dark
↓
soft light spreads
↓
Avatar appears
↓
visual stabilizes
↓
startup speech
```

「機械boot progress」ではなく、

> 横川AIという存在が舞台上に現れる

演出とする。

既存Avatar design自体は本taskでは変更不要。

---

# 20. Remove obsolete 201 gathering Cue

最新台本を再確認し、

横川AIが参加者へ201集合を呼びかけるCueが台本上不要ならShowから削除する。

単にdisabledで残してオペレーターに見せない。

関連:

- NEXT order
- Cue count
- scene reconstruction
- recording
- Admin
- tests

を更新。

---

# 21. Puzzle image presentation system

謎1・謎6・謎7等を画像で提示できる汎用visualを実装する。

Goal:

> fullscreen画像ではなく、横川AIが「問題を提示している」舞台画面として見せつつ、問題自体は可能な限り大きくする。

Requirements:

- large central puzzle image
- object-fit: contain
- no crop
- high usable area
- surrounding Yokokawa AI presentation frame
- optional QUESTION / SYSTEM label
- responsive
- 1920x1080 / 1280x720
- source aspect ratio independent

概ね画面70〜85%程度を問題に使える設計を目指すが、実ブラウザで最適化する。

---

# 22. Puzzle assets not yet provided

実際の謎画像がrepositoryに存在するなら使用してよい。

存在しない場合:

- feature implementation
- asset slots/path
- preview sample
- validation
- missing-asset operator indication

まで完了する。

**問題本文そのものをCodexが推測して作らない。**

本物画像未提供はsoftware blocking issueではない。

---

# 23. Bundled current Production Show

起動時に古い保存済みShowが自動採用される構造をやめる。

アプリ起動時は原則:

```text
bundled latest Production Show
+
initial Cue position
+
canonical show-start Presentation
```

から始める。

saved/custom Showを使う場合は明示操作。

Production Show versionをAdminで確認可能にする。

例:

```text
PRODUCTION SHOW
2026.10.xx / <version or hash>
```

---

# 24. Production Reset button

本番開始前に最初に押せる、

```text
本番初期状態へ
```

相当のbuttonを追加。

実行:

- STOP audio
- cancel pending speech/SFX/timers
- clear playback queue
- clear subtitle
- clear puzzle image
- clear overlays
- clear transient transitions
- reset Show/Cue to beginning
- reset scene
- restore canonical startup presentation
- restore correct Avatar visibility
- exit BLACKOUT
- use bundled latest Production Show

Preserve:

- preload
- Audio Ready
- Display registration
- infrastructure readiness

Show進行後の誤押下には確認を出してよい。

---

# 25. Admin UX redesign

現在の実運用に合わせ、AdminをProduction operator中心に再設計する。

最優先:

> 次にいつNEXTを押すか迷わない。

Main Show Modeには最低限:

## Readiness

```text
Production Ready
Display status
Audio Ready / preload
Show version
Current Scene
```

## Current Cue

```text
CURRENT
Cue ID / Cue name
current state
```

## Trigger

台本上、

```text
この台詞/出来事の後にNEXT
```

が分かる情報。

例:

```text
TRIGGER
扇「答えは①から⑤まで全部揃った！ 横川AI、これで脱出できるんだろう！」
```

## Primary control

大きな:

```text
NEXT
```

## Up Next

次Cueの概要。

## Secondary

- STOP
- REPLAY
- BLACKOUT
- RESTORE
- Scene Rehearsal
- 本番初期状態へ

Debug/diagnosticsはAdvancedへ下げる。

---

# 26. Admin editing tools separation

Speech Composerやasset managementは本番Main UIを圧迫しない。

Production operationとauthoringを分ける。

例:

```text
SHOW
REHEARSAL
PRODUCTION TOOLS
ADVANCED
```

Main operator surfaceは簡潔にする。

---

# 27. Avatar layout anchor

Avatarの位置をviewport percentageや個別解像度補正に依存させない。

構造として:

```text
Display
├ Stage Area
│  └ Avatar anchored to bottom
└ Subtitle Area
```

とする。

Goal:

> どの画面比率でも、Avatarの下端が字幕boxの上辺に沿う。

確認:

- 1920x1080
- 1280x720
- 16:10
- representative 4:3 / narrower viewport

Avatarがsubtitleへめり込まない。
大きく浮かない。

---

# 28. Recording pipeline compatibility

既存:

```bash
npm run record:production
```

を壊さない。

Cue数削除/統合、sentence subtitles、SFX、puzzle presentation、new transitionsを反映した録画が生成できること。

録画は引き続き:

- 1920x1080
- audio included
- Cue complete + configured review gap
- review page / cue navigation if current feature exists

を維持。

---

# 29. Voice-model exploration — autonomous preparation only

現在より良い音声モデルがある可能性を調査してよい。

Codexが利用可能なAivisSpeech model / speakerを列挙できるなら:

1. candidates inventory
2. Yokokawa AI向け短い共通sample
3. same speed/settings where meaningful
4. comparison assets
5. comparison HTML/page
6. current model included as baseline

を作る。

評価観点:

- 無機質さ
- 明瞭度
- 威圧感/冷静さ
- 舞台PAで聞き取りやすそうか
- Japanese pronunciation
- latency is irrelevant for fixed WAV
- licensing suitability

## Important

**最終Production voiceは自動変更しない。**

音声モデルの良し悪しは人間の聴感判断が必要。

本taskでは:

> 比較可能な状態まで

を完了とする。

current Production voice remains default.

---

# 30. Avatar resemblance exploration — preparation only

将来的にAvatarをキャストの「寅さん」「堀さん」に似せる案がある。

ただし本人の顔情報・reference assetがこのrepositoryで利用可能とは限らない。

本taskでユーザー確認なしに実施してよいのは:

- current Avatar construction analysis
- which parameters/assets control appearance
- replaceable avatar asset architecture if needed
- safe preview/swap mechanism
- documentation of required input assets

まで。

本人のreferenceが存在しないのに想像で似顔絵化しない。

Production Avatarを勝手に似顔絵へ変更しない。

---

# 31. Cancellation safety

今回の新しい:

- sentence playback
- subtitle flow
- SFX
- delay
- animation
- transition

はすべてcancel可能であること。

STOP / REPLAY / BACK / Show Reset / Production Reset / Scene Rehearsalで:

- stale timer
- stale callback
- delayed SFX
- delayed speech
- delayed subtitle reveal
- old transition

が後から発火しない。

---

# 32. Scene Rehearsal compatibility

新しいShow / subtitle / SFX / puzzle stateをScene Rehearsal reconstructionへ統合。

各Scene Startで:

- correct script scene boundary
- no stale subtitle
- no stale puzzle image
- no stale SFX
- no transient animation
- correct Avatar
- correct background/state
- no auto audio

を保証。

---

# 33. Production state model

可能なら今回のrefreshで、

```text
persistent/authoritative presentation state
```

と

```text
transient timeline effects
```

をより明確に分離する。

Examples:

Persistent:
- display mode
- avatar
- puzzle image
- current stable visual
- subtitle current segment if speaking

Transient:
- reveal progress
- SFX playback
- animation phase
- delayed callbacks

Reset/reconstructionが容易になる設計を優先。

---

# 34. No unnecessary user confirmations

以下はCodex自身で決める:

- exact component structure
- exact CSS implementation
- gap editor control design
- sensible default sentence gaps
- subtitle flow easing
- SFX procedural synthesis details
- transition durations
- Admin layout
- button placement
- test organization
- filenames
- internal IDs
- refactoring needed to avoid duplication

ただし既存Production contractを壊さない。

---

# 35. True human-decision boundaries

以下だけは最終決定を自動で行わない。

## A. New voice model final adoption

comparisonまで。
Production default switchはしない。

## B. Avatar likeness final design

reference/material/user approvalが必要。
architecture preparationまで。

## C. Missing real puzzle images/content

slot implementationまで。
内容を捏造しない。

## D. Script itself ambiguous

最新台本に明確な未確定/TODOがあり、Production meaningを一意に決められない場合。
その箇所だけreportし、他を止めない。

---

# 36. Development phases — execute all in one task

内部的には以下順で実施。

## Phase A — Audit / model

1. Git baseline
2. directive
3. latest script
4. Show/Cue diff
5. set_goal
6. design note

## Phase B — Script / Show sync

- Cue removals
- Cue updates
- P-002 override
- latest script metadata

## Phase C — Speech foundation

- data model
- segmentation
- sentence WAV
- gap editor
- preview
- final WAV export
- subtitle timing

## Phase D — Display / SFX

- subtitle flow
- SFX
- transitions
- startup
- puzzle image
- Avatar anchor

## Phase E — Production UX

- bundled current Show
- initial state
- Production Reset
- Admin redesign

## Phase F — optional comparison prep

- voice-model comparison assets
- Avatar customization architecture

## Phase G — verification / delivery

- tests
- browser E2E
- screenshots
- recording
- self-review
- fixes
- regression
- commit/push/master integration

Do not stop between phases for user confirmation unless a true blocker in section 35 prevents that specific work.

---

# 37. Browser visual review

Mandatory:

```text
1920x1080
1280x720
```

Also test representative alternate aspect ratio for Avatar anchor.

Inspect:

- startup
- HACK
- HOSTILE
- smooth transitions
- long subtitle segmentation
- flow reveal
- puzzle presentation
- NORMAL recovery
- Admin main Show Mode

Codex must inspect screenshots / frames itself。

Fix obvious visual issues before completion.

---

# 38. Audio verification

Verify:

- current existing Production audio not unnecessarily regenerated
- P-002 spoken pause correct
- sentence gaps reflected in exported final WAV
- final WAV decodes
- correct sample format
- no clipping/regression
- SFX and speech volume independent
- SFX does not obscure speech in default mix
- preload complete
- AivisSpeech not required at runtime

---

# 39. Automated tests

Add/update tests for:

- script/Show alignment
- removed Cue absence
- displayText vs spokenText
- sentence segmentation
- gap metadata
- final WAV composition
- subtitle segment timing
- subtitle reset
- SFX cancellation
- transition mode
- startup no-meter behavior
- puzzle image visual state
- bundled default Show
- initial Cue position
- Production Reset
- Avatar anchor layout invariants where testable
- Scene Rehearsal new state
- recording generation
- STOP/REPLAY/BACK cancellation

---

# 40. Production regression

Run:

```bash
npm run check
npm audit --omit=dev
```

plus relevant Production Browser E2E.

Verify:

- Single-PC localhost Production
- current canonical Production WAV preload
- Audio Ready
- Display reconnect
- server reconnect
- NEXT
- BACK
- REPLAY
- STOP
- BLACKOUT
- RESTORE
- HIJACKED
- HOSTILE
- Lip Sync
- Preflight
- Show Reset
- Scene Rehearsal
- Production Reset
- record:production
- external browser communication 0
- new console warning/error 0

If canonical WAV count legitimately changes due script synchronization, update tests/manifests consistently and report old/new count.

---

# 41. 30-minute soak

30-minute soak is **not required** for this task。

Use targeted repetition/stability tests。

Do not delay completion only to run a long soak。

---

# 42. Git workflow

Recommended branch:

```text
codex/yokokawa-production-refresh-v2
```

Do not:

- force push
- rewrite unrelated history
- delete user changes
- hard reset unrelated work

After all mandatory gates pass:

1. diff review
2. commit
3. push feature
4. if repository workflow permits, merge/fast-forward into master
5. rerun critical checks on master
6. push master

---

# 43. Final report

Include:

1. starting branch/HEAD/origin-master
2. set_goal
3. stage script modified time read
4. script vs Show changes
5. removed/added/changed Cue list
6. P-002 implementation
7. Production Speech Composer architecture
8. sentence segmentation/gap behavior
9. final WAV rendering
10. subtitle segment/reveal behavior
11. SFX system/assets/licenses
12. transition grammar
13. startup redesign
14. puzzle image presenter
15. bundled Production Show
16. Production Reset
17. Admin UX redesign
18. Avatar anchor behavior
19. Scene Rehearsal compatibility
20. voice model comparison result/assets
21. Avatar customization preparation
22. tests
23. browser E2E
24. visual review
25. record:production result
26. WAV/preload/Audio Ready
27. console/network/audit
28. feature branch/commit
29. master/origin-master
30. remaining human decisions

---

# 44. Definition of Done

```yaml
script:
  latest_script_read: true
  production_show_synced: true
  obsolete_201_gather_cue_removed_if_script_absent: true

speech:
  displayText_spokenText_separated: true
  P002_pause_override: true
  sentence_segmentation: true
  per_sentence_gap_editing: true
  sentence_preview: true
  final_production_wav_export: true
  runtime_uses_final_wav: true

subtitle:
  segment_synced: true
  long_line_flow_reveal: true
  stale_subtitle_reset: true

sfx:
  cue_timeline_support: true
  offline_assets: true
  license_safe: true
  separate_master_volume: true
  cancellation_safe: true

transition:
  cut: true
  fade: true
  glitch: true
  hack_abrupt: true
  hostile_abrupt: true
  normal_changes_smooth_where_appropriate: true

startup:
  meter_removed: true
  avatar_appearance_staging: true

puzzle:
  image_presenter: true
  responsive_contain: true
  missing_asset_safe: true

production:
  bundled_latest_show_default: true
  initial_cue_state: true
  production_reset: true

admin:
  production_operator_first: true
  trigger_visible: true
  current_next_cue_visible: true
  debug_deemphasized: true

avatar_layout:
  bottom_aligned_to_subtitle_top: true
  multi_aspect_reviewed: true

optional_preparation:
  voice_models_compared_if_available: true
  production_voice_auto_switched: false
  avatar_customization_ready: true
  likeness_auto_changed_without_reference: false

verification:
  automated_tests: PASS
  production_e2e: PASS
  recording: PASS
  1920x1080_review: PASS
  1280x720_review: PASS
  preload_audio_ready: PASS
  reload_reconnect: PASS
  console_new_errors_warnings: 0
  external_browser_communication: 0

long_soak:
  required: false
```

---

# 45. Final acceptance question

> 最新台本をそのままProductionへ反映でき、セリフの読み・文間・字幕を稽古で微調整してfinal WAVへ書き出せ、横川AI由来のSEと画面遷移をCueとして安全に実行でき、本番オペレーターが最新版Showを読み込み作業なしで起動して迷わずNEXTを出せる状態になっているか。

この状態まで、ユーザー確認なしで進められる範囲をすべて完了すること。
