# Codex Implementation Directive — Yokokawa AI Asset Slots, Script Sync & Subtitle Unification v1.1

## 0. Purpose

横川AI Productionについて、以下をまとめて完了する。

1. 全AIセリフの字幕表示を **1文字ずつのタイプライター表示** に統一する
2. 字幕の表示単位を原則 **1文 = 1表示** に統一する
3. 1文を文字数や画面幅の都合だけで複数表示へ自動分割しない
4. 最新上演台本と現在のProduction Show / Cue / speech / triggerを同期する
5. 後日受け取るProduction SEを、所定の場所へ置くだけで反映できるasset slotを完成する
6. 謎1・謎6・謎7の実画像を、所定の場所へ置くだけでPuzzle Presenterへ反映できるasset slotを完成する
7. 通常のtests / E2E / browser / recording / integrity checksを完了する
8. mandatory gateがPASSしたらcommit / push / master統合 / master再検証 / pushまで行う

今回の目的は大規模な新規開発ではなく、

> 最新台本とProductionを一致させ、字幕の見せ方を統一し、残る実素材は「あとからファイルを置くだけ」で本番反映できる状態にする。

ことである。

---

# 1. Autonomous `set_goal`

作業開始後、最初に以下を確認する。

1. このdirective全文
2. Git / repository状態
3. 現在のProduction Show / Cue
4. 現在のsubtitle implementation
5. Speech Composer / sentence segment metadata
6. current WAV / Voice Profile
7. SFX implementation
8. Puzzle Presenter
9. Preflight / Admin
10. recording pipeline
11. 最新上演台本
12. 直近runtime-hardening report

その実態を確認した後、Codex自身で `set_goal` を設定する。

goalには最低限:

- subtitle typewriter unification
- one-sentence-one-display
- latest script synchronization
- new Scene 7 AI line
- production-ready SFX slots
- production-ready puzzle-image slots
- regression safety
- master integration

を含める。

既に実装済みの基盤を不要に作り直さない。

---

# 2. Current reference baseline

直近報告時点の参考値:

```yaml
master: 83539ba1043ea0f47480431a346bff38dc7e1cb3
origin_master: 83539ba1043ea0f47480431a346bff38dc7e1cb3
current_cues: 19
tests: 160
next_guard_ms: 1200
wav_count: 18
production_e2e: PASS
recording: PASS
runtime_hardening: PASS
```

この値は参考。

開始時に必ず実状態を確認する。

```bash
git status
git branch --show-current
git rev-parse HEAD
git rev-parse origin/master
git log --oneline --decorate -n 20
```

未コミットのユーザー作業を破壊しない。

---

# 3. Latest stage script

正式基準:

```text
『7号館からの脱出』上演台本
https://docs.google.com/document/d/16KxoOjIFLJXikFF_3u3LnnbjnQX8xJvZ-cPPNxkuJVo/edit
```

Google Docsは読み取り専用。

禁止:

- edit
- comment
- metadata mutation
- shared Drive変更

このdirective作成時点で確認した最新版:

```text
modified:
2026-10-12T09:16:12.587Z
```

Codex実行時にも再取得し、その時点の最新版を使用する。

---

# 4. Script difference analysis already performed

このdirective作成時に、

```text
比較基準:
Google Docs revision 16334
2026-10-09T11:28:22.869Z
```

と、

```text
最新版:
2026-10-12T09:16:12.587Z
```

を比較した。

revision 16334は、Production v2系の台本同期時期に近い基準として使用した。

ただしruntime-hardening等ですでに一部反映済みの可能性があるため、

> 以下の差分を盲目的に適用せず、現在のProduction実装に既に反映済みか確認してから変更する。

---

# 5. Confirmed relevant script difference A — Scene 5 / 201 gathering

以前の台本には、五つ目の謎を解いた直後に:

```text
その瞬間、館内に無機質な横川AIのアナウンスが響き渡る。
```

という記述があった。

最新版ではこの記述は削除されている。

最新版では人間側が:

```text
全員「謎は全て解けました！ 201の教室に集合してください！」
```

と呼びかける。

## Required Production result

横川AIが201集合を呼びかけるProduction Cueは不要。

現在すでに削除済みなら、その状態を維持する。

存在する場合は削除する。

以下の理由で再追加しない:

- 最新台本では人間側の呼びかけ
- AI Cueではない
- operatorがAIから集合アナウンスを出す必要はない

関連:

- Show
- Cue order
- Admin
- recording
- Scene reconstruction
- technical AI-Cue script

を整合させる。

---

# 6. Confirmed relevant script difference B — Scene 6 emergency-stop puzzle context

非常停止謎の直前周辺に人間側台詞変更がある。

旧版例:

```text
白山
「（読んで）これは⋯⋯いったい⋯⋯、私一人じゃ解読が間に合わない！」

扇
「一人じゃない。ここにいる皆で解けばいい。みんな！
横川AIを緊急停止させて、全員で生きてここから脱出するぞ！！」

押野
「いったいどういった暗号なんだ？」

横川
「このプログラムは、どんなセキュリティも」
```

最新版:

```text
白山
「（読んで）これは⋯⋯いったい⋯⋯」

扇
「ここにいる皆で解けばいい。みんな！
横川AIを緊急停止させて、全員で生きてここから脱出するぞ！！」

光
「私（僕）も解く！」

白山
「ヒントはこれですね！」

ヒントが出る。
```

## Required Production result

これは主として人間側の台詞変更であり、AI speechを勝手に追加しない。

ただし以下を最新台本へ合わせる:

- AdminのTrigger表示
- Cue reference metadata
- rehearsal/operator reference
- AI-Cue入り技術台本
- 非常停止問題提示のタイミング

「ヒントが出る」が横川AI Display側の既存Puzzle Presenterで担当すべき仕様になっている場合のみ、現在実装・台本・謎運用を確認して同期する。

台本だけからヒント内容を捏造しない。

---

# 7. Confirmed relevant script difference C — Scene 6 ERROR punctuation

旧:

```text
『エラー。セキュリティプロテクトの緊急遮断を確認。
解錠作業ストップ。
エラー。指定されたスタッフへの連絡に失敗。』
```

最新:

```text
『エラー。セキュリティプロテクトの緊急遮断を確認。
解錠作業ストップ。
エラー。指定されたスタッフへの連絡に失敗』
```

末尾の句点がなくなっている。

## Required Production result

- displayText / subtitleは最新版へ同期
- spoken meaningは変わっていない
- この句読点差だけを理由にProduction WAVを再生成しない
- sentence segmentationへの影響がある場合、最終文として正しく扱う

---

# 8. Confirmed relevant script difference D — Scene 7 new AI speech

これは重要。

最新版でも既存のP-V07相当の復旧演出は残っている。

既存位置:

```text
虎谷
「……ハハ……君は本当に……お人好しで、バカだな……」

M-6 フェードアウト。

虎谷は静かに俯く。

そのとき、
正面のモニターに表示された横川AIが
温かな光を取り戻し、正常に復旧する。
```

したがって、

> 既存P-V07の「NORMAL完全復旧」は削除しない。

その後、かなりの人間側台詞・芝居を挟んだ後、最新版では新しく:

```text
虎谷は二人を見つめたあと、わずかに苦笑し、静かに俯く。

正面のモニターに、
正常な姿へ戻った横川AIが表示される。

横川AI
「館内すべての扉の解錠を確認しました」

M-7 カットイン。
```

が追加されている。

## Required Production result

新規AI speech:

```text
館内すべての扉の解錠を確認しました
```

をProductionへ追加する。

### Important Cue boundary

このspeechを既存P-V07へ統合してはいけない。

理由:

- P-V07復旧と新speechの間に多数の人間台詞がある
- stage timingが不定
- operatorは人間側の芝居を待つ必要がある

したがって新しい独立Production Cueとする。

### New Cue behavior

Trigger:

```text
夢野・押野・三馬らの責任に関するやり取り終了後、
虎谷が二人を見つめて静かに俯く場面
```

その後:

```text
NEXT
→ NORMAL状態であることを維持
→ 必要なら「正常なAIが表示されている」ことをsettle
→ 新AI speech
「館内すべての扉の解錠を確認しました」
→ subtitle typewriter
→ speech完了
```

新たな派手な復旧animationは不要。

P-V07ですでに復旧済みである。

### Audio

これは新規発話なので、

- current approved Voice Profile
- current pronunciation policy
- current Production WAV format

で新しいProduction WAVを生成する。

既存18 WAVを変更しない。

結果としてcanonical Production WAV数が:

```text
18 → 19
```

になる可能性が高い。

実際の現行実装にすでに新speechが存在する場合は重複生成しない。

---

# 9. Cue count expectation after latest-script sync

現在報告上は19 Cue。

Scene 7新規AI speechがまだ存在しない場合、

```text
19 → 20 Cue
```

となる可能性が高い。

ただし数を合わせるためにCueを増減しない。

実際のShowを確認して:

- 新speech未実装 → 独立Cue追加
- すでに実装済み → duplicate禁止

とする。

既存1200ms NEXT guardを維持。

---

# 10. Subtitle policy — ALL Production AI speech uses typewriter

今後、ProductionのAIセリフ字幕は原則すべて:

```text
TYPEWRITER
```

に統一する。

現在存在する:

```text
instant
flow
typewriter
```

等の表示差がある場合、本番AI speechについては全てタイプライターへ統一する。

Cueごとに「短いからinstant」などの分岐をしない。

短いセリフも長いセリフも同じ基本visual grammarにする。

---

# 11. Typewriter definition

タイプライター表示とは:

```text
発話開始
↓
空の字幕
↓
1文字ずつ順番に表示
↓
文全体が完成
```

とする。

例:

```text
館
館内
館内す
館内すべ
...
館内すべての扉の解錠を確認しました
```

実際のDOM update方法は最適化してよい。

重要なのは観客から:

> 音声に合わせて文字が1文字ずつ流れ出てくる

と認識できること。

---

# 12. One sentence = one subtitle display

基本ルール:

> 1文を1つのsubtitle display unitとする。

例:

```text
条件の達成を確認。
五つの解を統合し、最終問題を提示する。
最終問題の回答を入力しなさい。
```

は3 sentence display units。

動作:

```text
sentence 1開始
→ sentence 1をtypewriter表示
→ sentence 1全文表示

sentence 2開始
→ sentence 1をclear
→ sentence 2をtypewriter表示

sentence 3開始
→ sentence 2をclear
→ sentence 3をtypewriter表示
```

---

# 13. Do NOT split one sentence into multiple subtitle displays

現在、一部で1文が複数回に分けて表示されている場合、それを原則廃止する。

禁止例:

元の1文:

```text
受付時に登録された情報を、
館内のシステムと照合しています。
```

これが文法上1文なら:

```text
表示1:
受付時に登録された情報を、

表示2:
館内のシステムと照合しています。
```

のように別displayへ分割しない。

---

# 14. Visual line wrapping is allowed

重要な区別。

```text
1 sentence = 1 display
```

は、

> 画面上で1行に収める

という意味ではない。

同じsubtitle boxの中でCSSによって:

```text
受付時に登録された情報を、
館内のシステムと照合しています。
```

のように2行・3行へ自然に折り返すのは問題ない。

これは1つのdisplayである。

---

# 15. Long sentence handling

1文が長い場合も、文字数だけを理由に複数displayへ自動分割しない。

優先順位:

1. subtitle box内で自然にwrap
2. current responsive typographyを使用
3. readableな範囲でfont sizing / max widthを調整
4. それでも物理的に成立しない例外だけreport

Codexが勝手に意味単位で1文を分割しない。

「基本的に1文1表示」を守る。

---

# 16. Sentence boundary detection

現在Speech Composerでsentence metadataが存在する場合、それをcanonical sourceにする。

原則:

```text
。
！
？
!?
！？
```

等の文末を利用。

ただし:

- `……`
- quotation marks
- numbers
- abbreviations
- spokenText onlyのcomma
- P-002 pronunciation override

を誤ってsentence boundaryにしない。

`displayText` と `spokenText` は別。

字幕へ出すのはdisplayText。

---

# 17. P-002 pronunciation override preservation

P-002:

表示:

```text
はい。例えば、そちらに久安光さんが参加しています
```

音声生成上:

```text
はい。例えば、そちらに、久安光さんが参加しています
```

相当の読み調整。

extra commaはspokenText only。

字幕に不要な「、」を増やさない。

---

# 18. Typewriter timing

タイプライター速度は全Cue固定ms/characterに機械的固定する必要はない。

既存sentence audio durationを使える場合、

> sentenceの音声時間と文字数から、音声に自然に追従するreveal速度

を算出してよい。

要件:

- speech開始とほぼ同時にreveal開始
- 1文字ずつ見える
- speechより極端に遅れない
- 最後の文字が発話終了後かなり遅れて出ない
- 数m離れた観客が読める
- 短文が不自然に高速flashしない

Codexが実ブラウザ・録画で自己レビューして調整する。

---

# 19. Sentence-to-sentence transition

複数文speechでは、

- sentence Nの発話中 → sentence Nを表示
- sentence N終了後のgap中 → sentence N全文を維持してよい
- sentence N+1開始時 → clear
- sentence N+1を空からtypewriter

を基本とする。

次の文が始まる前に意味なく字幕を何度も切り替えない。

Cue終了時は既存subtitle lifecycleに従ってclear。

---

# 20. Typewriter cancellation safety

以下でtypewriter animationを完全cancel:

- STOP
- REPLAY
- BACK
- Scene Rehearsal
- Production Reset
- Show Reset
- Cue change
- Display reconstruction

古いtypewriter timer / requestAnimationFrame / callbackが、

- 次の字幕へ文字追加
- reset後に旧文を復活
- reload後に旧animation再開

しないこと。

---

# 21. Reload / reconnect behavior for subtitle

reload / reconnectで過去のspeechを再生しない。

speech active中のDisplayだけが一時reconnectした場合の挙動は既存architectureに合わせ、安全なstate復元を優先。

少なくとも:

- stale typewriter animation burstなし
- old sentence replayなし
- completed speechの自動再発火なし

を保証。

---

# 22. SFX ownership

横川AI側:

### Scene 1
- startup sound
- HACK noise

### Scene 6
- ERROR warning sound
- second ERROR uses same warning asset

音響側:

- electronic lock / unlock sound
- room/door sound
- long HOSTILE emergency alarm controlled/faded by PA

この担当分けを変更しない。

---

# 23. SFX asset slots

後から本番ファイルを置くだけで反映できるcanonical slotsを完成する。

例:

```text
public/assets/sfx/production/
  startup.wav
  hack-noise.wav
  warning.wav
```

実際のpathは既存repo structureに合わせてよい。

重要:

- path/filename固定
- code変更不要
- Show編集不要
- warningは両ERROR Cueで共有
- READMEあり

---

# 24. Missing SFX behavior

本物SE未配置でも:

- Production起動
- Cue進行
- speech
- visual
- recording

が壊れない。

Preflight/Adminには:

```text
startup: MISSING
hack-noise: MISSING
warning: MISSING
```

と明示。

console error spamなし。

実ファイル配置後にREADYへ変わる。

---

# 25. SFX Cue mapping

最低限:

```text
startup Cue
→ startup slot

HACK disturbance
→ hack-noise slot

first ERROR
→ warning slot

second ERROR
→ same warning slot
```

SFX追加のため新Cueを作らない。

---

# 26. Puzzle image asset slots

既存Puzzle Presenterを使用。

対象:

```text
謎1
謎6
謎7
```

本物画像を後からcanonical pathへ置くだけで反映。

概念例:

```text
public/assets/puzzles/production/
  puzzle-01.png
  puzzle-06.png
  puzzle-07.png
```

repo構造に合わせて変更可。

---

# 27. Puzzle image requirements

- object-fit: contain
- crop禁止
- presenter内で最大限大きく
- 横川AIが問題を提示しているvisual grammar維持
- 1920x1080
- 1280x720
- aspect ratio independent

---

# 28. Missing puzzle image behavior

本物画像未配置でも:

- Show load可能
- Cue progression可能
- server crashなし
- broken-image iconを観客へ出さない

Production-safe placeholderを使用。

Preflightで:

```text
Puzzle 1: MISSING
Puzzle 6: MISSING
Puzzle 7: MISSING
```

が分かること。

謎本文そのものはCodexが作らない。

---

# 29. Asset replacement contract

SE・Puzzleとも:

```text
canonical filenameへ実ファイル配置
→ restart / refresh
→ asset validation
→ READY
→ existing Cueで利用
```

を基本とする。

code変更不要。

READMEへ:

- exact path
- filename
- format
- recommended specs
- replacement procedure

を記載。

---

# 30. Preserve current production hardening

今回、以下を壊さない。

```yaml
next_guard_ms: 1200
next_guard:
  ui: true
  server: true
  rejected_requests_queued: false

STOP:
  immediate: true

BLACKOUT:
  immediate: true

runtime_hardening:
  reconnect: preserved
  stable_state_restore: preserved
  repeated_performance_safety: preserved
```

runtime scheduling architectureを不要に変更しない。

---

# 31. Audio / Voice Profile preservation

既存Production WAVは台本同期で必要なもの以外再生成しない。

Voice Profileも維持。

例外:

```text
Scene 7 new speech
「館内すべての扉の解錠を確認しました」
```

が現在未実装なら、新規WAV生成が必要。

current approved Voice Profileを使用。

---

# 32. Technical AI-Cue script update

repoにある:

```text
docs/production/上演台本_AI-Cue入り_2026-10-11.md
```

または後継fileを確認。

最新台本同期後に古くなるため、技術用Cue台本も最新版へ更新する。

最低限:

- Scene 5のAI集合アナウンス削除
- Scene 6の最新trigger context
- Scene 7新AI speech Cue
- latest Cue count
- latest Cue IDs/order

を反映。

正式Google Docsは変更しない。

---

# 33. Automated tests — subtitle

最低限:

- all Production speech subtitle mode = typewriter
- no Production speech remains instant
- no Production speech remains non-typewriter flow
- sentence boundary correct
- one sentence not split into multiple display units
- multi-sentence speech switches only at sentence boundary
- visual wrap does not create new display unit
- P-002 spoken/display separation
- STOP cancels typewriter
- RESET cancels typewriter
- REPLAY restarts correctly
- stale callback cannot mutate next Cue subtitle
- Scene 7 new line uses typewriter

---

# 34. Automated tests — script sync

- Scene 5 AI 201 gathering Cue absent
- Scene 6 current trigger metadata matches latest script
- ERROR display text matches latest punctuation
- existing P-V07 remains
- Scene 7 new unlock-confirmation speech exists
- new Scene 7 speech is NOT merged with P-V07
- Cue order follows stage script
- current Cue count updated consistently
- recording follows new Cue count/order

---

# 35. Automated tests — assets

SFX:

- startup mapping
- hack-noise mapping
- warning shared mapping
- missing-safe
- presence detected

Puzzle:

- puzzle 1
- puzzle 6
- puzzle 7
- missing-safe
- presence detected
- presenter contain behavior

Preflight:

- missing shown
- present clears warning

---

# 36. Production regression

Run:

```bash
npm run check
npm audit --omit=dev
```

plus current Production E2E.

Verify:

- bundled latest Show
- latest Cue count
- NEXT 1200ms
- startup
- HACK
- ERROR x2
- HOSTILE
- stop code
- existing P-V07
- new Scene 7 unlock-confirmation speech
- puzzle presenter
- Scene Rehearsal
- Production Reset
- reload/reconnect
- Audio Ready
- WAV preload
- recording

35-minute long idle / 5-show endurance does not need repeating unless runtime/reconnect/scheduling architecture is materially changed.

---

# 37. Browser visual review

Mandatory:

```text
1920x1080
1280x720
```

Review all representative subtitle types:

- very short speech
- medium one-sentence speech
- long one-sentence speech
- multi-sentence speech
- ERROR
- Scene 7 new speech

Verify:

- all visibly typewriter
- no instant pop-in
- one sentence stays one display
- long sentence wraps naturally
- no overflow/crop
- typewriter speed feels aligned with speech
- subtitle remains readable several meters away

If poor, self-critique and fix.

---

# 38. Recording regression

Generate full Production recording using current command.

Verify:

- all speech subtitles typewriter
- no unexpected sentence fragmentation
- latest script order
- Scene 7 new Cue
- asset placeholders do not break recording
- audio/video completes

---

# 39. Git workflow

Recommended branch:

```text
codex/yokokawa-subtitle-script-assets-v1.1
```

Do not:

- force push
- history rewrite
- unrelated reset
- Google Docs edit

All gates PASS:

1. diff review
2. commit
3. feature push
4. master integration
5. master critical checks
6. push master

---

# 40. Final report

Include:

1. starting HEAD/master/origin-master
2. `set_goal`
3. latest script modified time
4. script comparison baseline used
5. which analyzed differences were already implemented
6. which differences required actual code/data changes
7. final Cue count
8. Scene 7 new Cue ID/name/trigger
9. Production WAV count before/after
10. subtitle implementation before/after
11. sentence segmentation behavior
12. long-sentence behavior
13. typewriter timing strategy
14. SFX canonical paths
15. puzzle canonical paths
16. missing asset behavior
17. Preflight
18. tests
19. Production E2E
20. browser visual review
21. recording
22. WAV/Profile integrity
23. NEXT 1200ms preservation
24. final commit
25. master/origin-master SHA
26. remaining human-provided assets

---

# 41. Definition of Done

```yaml
subtitle:
  all_ai_speech_typewriter: true
  instant_production_subtitles: 0
  one_sentence_one_display: true
  auto_split_sentence_by_length: false
  css_line_wrap_allowed: true
  multi_sentence_switch_at_sentence_boundary: true
  stop_reset_replay_safe: true

script_sync:
  latest_script_read_only_checked: true
  scene5_ai_gather_announcement_absent: true
  scene6_trigger_context_updated: true
  scene6_error_display_punctuation_synced: true
  existing_scene7_recovery_preserved: true
  scene7_new_unlock_confirmation_added: true
  scene7_new_unlock_confirmation_separate_from_recovery: true

sfx:
  startup_slot: ready
  hack_noise_slot: ready
  warning_slot: ready
  warning_shared: true
  missing_safe: true
  preflight_visible: true

puzzle:
  puzzle01_slot: ready
  puzzle06_slot: ready
  puzzle07_slot: ready
  missing_safe: true
  preflight_visible: true
  no_code_change_for_replacement: true

preservation:
  next_guard_1200ms: true
  runtime_hardening: preserved
  voice_profile: preserved
  unrelated_wavs_unchanged: true

verification:
  tests: PASS
  production_e2e: PASS
  browser_1920x1080: PASS
  browser_1280x720: PASS
  recording: PASS
  audio_ready: PASS
  preload: PASS
  reload_reconnect: PASS
  console_new_error_warning: 0
  external_browser_communication: 0
  audit_vulnerabilities: 0

git:
  master_integrated: true
  origin_master_synced: true
```

---

# 42. Final acceptance criterion

最終的に:

> 横川AIの全セリフ字幕が、短文・長文を問わず1文字ずつのタイプライター表示で統一されている。

かつ:

> 字幕は原則1文=1表示で、1文を文字数や画面幅の都合だけで複数表示へ分割しない。長い1文は同じsubtitle box内で自然に改行表示される。

かつ:

> 最新台本との差分として、Scene 5のAI集合アナウンス削除、Scene 6非常停止周辺のtrigger更新、Scene 6 ERROR表記、Scene 7既存復旧維持、新規「館内すべての扉の解錠を確認しました」Cue追加が現在Production実装と照合され、必要な変更だけ反映されている。

さらに:

> 起動音・HACKノイズ・警告音、および謎1・謎6・謎7画像は、後からcanonical pathへファイルを置くだけでProductionへ反映できる。

この状態までユーザー確認なしで合理的に完了すること。
