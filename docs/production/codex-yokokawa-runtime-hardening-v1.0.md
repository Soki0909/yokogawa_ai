# Codex Implementation Directive — Yokokawa AI Production Runtime Hardening & Show Consolidation v1.0

## 0. Purpose

「7号館からの脱出」本番用 横川AI Productionについて、以下をこの順番で実施する。

1. 最新台本と現在Show/Cueを再監査する
2. 本番操作上安全な範囲で、NEXTの二重押し・チャタリング対策を強化する
3. 台本上、分離する意味のない隣接Cueを統合する
4. 通常の実装検証・Production回帰・実ブラウザ確認を完了する
5. その完成版に対して、実際の本番時間軸を再現した長時間・障害・複数公演テストを行う
6. 問題があれば修正し、再度通常検証と本番想定テストを行う
7. 全mandatory gateがPASSしたらmasterへ統合・pushする

今回の目的は新しい見栄えを増やすことではない。

> オペレーターの誤操作や、本番中の長時間放置・focus喪失・sleep/resume・再接続・複数公演を含めても、最後まで安全に上演できるProductionへhardeningする。

---

# 1. Mandatory autonomous `set_goal`

最初に以下を確認する。

1. このdirective全文
2. 現在のGit / repository状態
3. 最新上演台本
4. 現在のProduction Show
5. Cue definitions / Cue timeline
6. AdminのNEXT処理
7. server側のCue進行処理
8. Display
9. Audio / SFX
10. Scene Rehearsal
11. Production Reset
12. reconnect / reload処理
13. recording pipeline
14. Production Runbook /既存report

その実態を把握した後、Codex自身で `set_goal` を設定する。

`set_goal` はこの文章のコピーではなく、実際の現行実装・台本・既存安全策を踏まえて自主的に定義する。

少なくとも以下をgoalに含める。

- accidental NEXT protection
- script-conformant Cue consolidation
- deterministic Cue sequencing
- normal Production regression
- long idle reliability
- focus/background reliability
- sleep/resume recovery
- reconnect/reload recovery
- repeated-performance reliability
- no stale playback
- operator recovery clarity

goal設定後、ユーザー確認なしで合理的に進められる範囲は最後まで自律的に進める。

---

# 2. Current reference baseline

前回報告時点の参考値:

```yaml
master: a845baad9161941b2d675c43f251f6ea81b8a418
origin_master: a845baad9161941b2d675c43f251f6ea81b8a418
tests: 155
production_e2e: PASS
recording: PASS
visual_review:
  1920x1080: PASS
  1280x720: PASS
console_error: 0
external_browser_communication: 0
audit_vulnerabilities: 0
```

ただし、このbaselineを無条件に信頼しない。

開始時に必ず:

```bash
git status
git branch --show-current
git rev-parse HEAD
git rev-parse origin/master
git log --oneline --decorate -n 20
```

を確認する。

未コミットのユーザー作業を破壊しない。

---

# 3. Stage script source of truth

最新上演台本:

```text
『7号館からの脱出』上演台本
https://docs.google.com/document/d/16KxoOjIFLJXikFF_3u3LnnbjnQX8xJvZ-cPPNxkuJVo/edit
```

Google Docsは読み取り専用。

禁止:

- edit
- comment
- metadata mutation
- shared Driveへの変更

台本を以下の基準として扱う。

- Scene order
- dramatic timing
- actor speech between AI cues
- audience interaction
- uncertain-duration stage action
- AI speech order
- system visual timing
- Cue trigger point

現在Showが台本と異なる場合、Production側を最新台本へ合わせる。

過去のCue名や過去チャット上の台詞を最新台本より優先しない。

---

# 4. Work order is mandatory

今回の作業順序を入れ替えない。

## Phase A — implementation / Show hardening

1. current system audit
2. latest script audit
3. NEXT protection audit + implementation
4. adjacent Cue boundary audit
5. safe Cue consolidation
6. associated state/timeline/test updates

## Phase B — normal verification

1. automated tests
2. Production E2E
3. browser checks
4. audio/SFX integrity
5. Scene Rehearsal
6. Reset
7. reload/reconnect
8. recording
9. visual review
10. operator UX check

この段階で問題があれば修正し、Phase BをPASSさせる。

## Phase C — long real-operation verification

Phase A/BがPASSした**完成版**に対してのみ:

- real-duration long idle
- background/focus-loss
- sleep/resume
- reload/reconnect
- multiple performances
- repeated Reset
- accidental operator actions
- resource monitoring

を実施する。

Phase Cで問題が見つかった場合:

```text
fix
→ Phase Bのcritical regression
→ 該当Phase C scenario再実行
```

まで行う。

---

# 5. NEXT accidental-double-trigger hardening

現在すでにNEXT二重押し防止・チャタリング対策が存在する場合、まずその実装を確認する。

今回の方針:

> 演劇上、隣接する独立Cue間には原則として少なくとも約1秒以上の余裕がある想定である。  
> ただし想定だけで固定値を入れず、最新台本とShowを監査して、本当に進行を阻害しないことを確認してから、重めの二重押し防止をProductionへ入れる。

---

# 6. NEXT timing audit before changing debounce

全隣接Cueについて、

```text
Cue A
→ next trigger point
→ Cue B
```

の最短実運用間隔を確認する。

特に:

- actor line
- audience response
- stage movement
- waiting for puzzle answer
- lighting/SE not controlled by Yokokawa AI
- operator judgement
- deterministic internal animation
- deterministic AI speech

を区別する。

確認結果として、

> 意図的に1秒未満でNEXTを2回受理しなければ成立しないProduction pathが存在しない

ことを確認する。

もし存在するなら、その箇所は「debounceを弱くする」のではなく、後述のCue統合対象ではないかも含めて設計を再検討する。

---

# 7. Heavy NEXT chatter protection — required behavior

台本監査で問題がない場合、ProductionのNEXT acceptanceに重めのguardを入れる。

狙い:

- mouse double-click
- touch double tap
- key repeat
- Space/Enter連打
- reconnect直後の二重入力
- operator panic click

でCueが2つ進まないこと。

## Minimum requirement

少なくとも約1秒の連続NEXT受理防止を基準とする。

正確な値は、最新Showの最短安全間隔を監査した上でCodexが決める。

目安:

```text
>= 1000 ms
```

進行を阻害しない範囲で、より重めでもよい。

ただし単にAdminボタンをdisabledにするだけでは不十分。

---

# 8. NEXT guard must be authoritative

NEXT guardは、可能な限りserver / canonical Show progression側でも保証する。

つまり:

```text
Admin UI disabled
```

だけではなく、

```text
duplicate NEXT request
→ server rejects / ignores
→ Cue index advances only once
```

を保証する。

mouse / keyboard / API / reconnect後操作など入力経路によって抜け道がないこと。

Rejected NEXTをqueueして、guard解除後に勝手に実行してはいけない。

---

# 9. NEXT guard UX

Adminでは、

- NEXT accepted
- temporarily guarded
- ready again

がオペレーターに過度な情報量を増やさず分かること。

例:

- ボタン短時間disabled
- subtle progress / cooldown

目的は「押せない理由が故障に見えない」程度。

正常な芝居進行を邪魔しない。

---

# 10. NEXT guard scope

NEXT guardはNEXT誤連打対策。

以下のemergency/operator controlsまで一律1秒ロックしてはいけない。

- STOP
- BLACKOUT
- emergency recovery operation

REPLAY / BACK / RESTOREについては現在のsemanticsと事故可能性を確認して適切に設計する。

特にSTOPは即応性を優先。

---

# 11. NEXT guard cancellation / reconnect safety

以下でguard stateが壊れないこと。

- reload
- reconnect
- server restart recovery
- Scene Rehearsal
- Production Reset
- Show Reset

guardの古いtimerが後から現在の操作状態を壊さない。

必要ならgeneration token / monotonic operation ID等を使用する。

---

# 12. Cue boundary audit — all adjacent cues

最新台本と現在Showの**すべての隣接Cue**を監査する。

各境界を以下の3分類へ分ける。

## A. KEEP — human / uncertain boundary

Cue AとCue Bの間に以下がある場合は原則分離を維持。

- 他の登場人物の台詞
- 観客の回答
- 謎解き
- 役者の移動
- 不確定時間の芝居
- 人間の反応待ち
- 外部チームのCueを待つ必要
- 舞台進行上、オペレーター判断で次へ進めたい箇所

これらを勝手に自動進行へ変えない。

## B. MERGE — deterministic boundary

Cue AとCue Bの間に:

- 他者台詞なし
- audience interactionなし
- operator judgement不要
- 不確定時間の行動なし

であり、間にあるのが:

- Yokokawa AI visual
- fixed/deterministic animation
- Yokokawa AI SFX
- fixed dramatic pause
- Yokokawa AI speech

だけなら、原則として1 Cueへ統合できるか検討する。

## C. AMBIGUOUS

台本記述から時間や操作境界が一意に判断できない場合。

その箇所だけ無理に統合しない。

実装を止めず、final reportで列挙する。

---

# 13. Principle for Cue consolidation

Cueは「システム内部のeffect数」ではなく、

> 本番オペレーターが芝居を見ながら、次の人間側イベントを待つための操作単位

として設計する。

したがって:

```text
Visual
→ deterministic pause
→ SFX
→ AI speech
→ visual settle
```

のような一連のシステム演出は、間に人間の不定要素がなければ1 Cueとしてよい。

---

# 14. Do not over-merge

以下は統合しない。

```text
AI Cue
→ actor speaks
→ AI Cue
```

```text
AI Cue
→ audience solves puzzle
→ AI Cue
```

```text
AI Cue
→ actor walks / performs action of variable duration
→ AI Cue
```

```text
AI Cue
→ lighting/sound team resultを人間が確認してから進行
→ AI Cue
```

Cue数を減らすこと自体を目的にしない。

目的は本番操作の自然さと事故削減。

---

# 15. Merge audit output

実装前に内部で隣接Cue boundary tableを作る。

最低限:

```text
Cue A
Cue B
script between
classification: KEEP / MERGE / AMBIGUOUS
reason
result
```

を持つ。

final reportにも、変更した境界と主要KEEP判断を要約する。

---

# 16. Merge implementation requirements

Cueを統合した場合:

- 1回のNEXTで開始
- deterministic animation
- SFX
- delay
- speech
- subtitle
- stable state

をtimelineとして安全に実行。

統合前のobsolete Cueが:

- Admin
- Show file
- tests
- recording
- Scene Rehearsal
- history
- logging
- script mapping

に中途半端に残らないよう整理する。

---

# 17. Merged Cue cancellation safety

統合Cue内にdelay / SFX / speechが存在する場合:

## STOP

- pending delay cancel
- pending SFX cancel
- pending speech cancel
- active audio stop
- stale callbackなし

## REPLAY

- Cue頭から正しく再現
- double timerなし
- double audioなし

## BACK / Reset / Rehearsal

- old timeline complete cancellation
- reconstructed stateを古いcallbackが上書きしない

## reload / reconnect

- completed eventを勝手にreplayしない
- stable stateのみ再構築

---

# 18. Update bundled Production Show

Cue consolidation後のShowをcanonical Production Showとする。

アプリ起動時から最新版Showを使用。

古い保存Showが勝手に優先されない既存v2.0 contractを維持する。

Production Show version/hashも更新。

---

# 19. Update Production recording

`npm run record:production` が、

- new Cue count
- merged Cue timeline
- subtitle
- SFX
- final Show order

へ追従すること。

録画生成scriptが旧Cue IDを前提にしていないか確認する。

---

# 20. Phase B — standard verification before long testing

長時間テストへ入る前に、まず通常検証を完全PASSさせる。

最低限:

```bash
npm run check
npm audit --omit=dev
```

およびProduction E2E。

確認:

- latest Show loads
- initial state
- NEXT
- heavy double-NEXT rejection
- BACK
- REPLAY
- STOP
- BLACKOUT
- RESTORE
- Scene Rehearsal
- Production Reset
- subtitle
- Speech
- SFX
- puzzle presenter
- Avatar layout
- reload
- reconnect
- Audio Ready
- preload
- recording

---

# 21. Explicit NEXT chatter tests

最低限以下を自動/実ブラウザで試す。

- double click
- triple click
- rapid 5 clicks
- Space key repeat
- Enter key repeat if supported
- mixed mouse + keyboard
- NEXT immediately after focus return
- NEXT immediately after reconnect

期待:

```text
one intentional input burst
→ at most one Cue advancement
```

guard解除後の次の明示操作は正常に受理。

---

# 22. Cue merge visual/audio review

統合したCueは実ブラウザで確認。

見る点:

- 間が不自然に短くない
- 逆に長すぎない
- AI speech開始がstage tempoに合う
- SFXとvisualが同期
- subtitle開始/終了が自然
- 1 Cueにしたことで演出的な「待ち」が消えていない

必要ならfixed pauseを調整する。

---

# 23. Browser sizes

最低限:

```text
1920x1080
1280x720
```

Adminも確認。

---

# 24. Phase B acceptance gate

以下を満たすまで長時間テストへ行かない。

```yaml
standard_tests: PASS
production_e2e: PASS
double_next_guard: PASS
cue_merge_regression: PASS
recording: PASS
audio_ready: PASS
preload: PASS
reload_reconnect: PASS
console_new_error_warning: 0
external_browser_communication: 0
```

---

# 25. Phase C — actual-performance time model

ここから、完成したProductionを**実際の上演時間軸**で検証する。

重要な実運用:

```text
Scene 1
↓
Scene 1終了
↓
Scene 2〜5の間、横川AIは表示したまま
操作しない
↓
Scene 6
↓
Scene 7
↓
終演
```

Scene 1終了からScene 6開始まで、横川AIは長時間idleとなる。

---

# 26. Derive realistic idle duration from the latest script

最新台本に書かれたScene 2〜5 / route等の時間情報と現在の上演設計から、

```text
expected Scene1-end → Scene6-start idle duration
```

を推定する。

テストでは少なくとも:

1. 実本番相当のidle
2. 実本番より余裕を持たせたextended idle

を行う。

固定で「10分だけ」等に短縮して、実本番より短い検証で済ませない。

---

# 27. Long idle test

Scene 1を本番と同様に最後まで操作。

Scene 1終了stateで、前項のrealistic duration放置。

その間:

- NEXTなし
- speechなし
- unnecessary Admin interactionなし

その後Scene 6へ復帰し、Scene 7終了まで完走。

確認:

- current Scene/Cue preserved
- stable Display preserved
- Audio Ready
- preload
- WebSocket
- no stale timers
- no delayed speech
- no delayed SFX
- no old subtitle
- no old animation
- first Scene 6 Cue starts normally
- final Scene 7 completes

---

# 28. Background / focus-loss scenarios

idle中に:

- Admin Chrome background
- Display background/minimized where meaningful
- both Chrome windows lose focus
- another application focused for extended period

を試す。

Chromium background throttling / visibility changesを考慮。

focus復帰後:

- timer catch-upなし
- old callbacksなし
- SFX burstなし
- speech auto-startなし
- Cue position正しい
- explicit NEXTで正常再開

---

# 29. Sleep / resume scenario

本番中の不慮の事態:

> Windows PCがsleepしてしまう

ケースを検証する。

可能で安全ならactual Windows sleep/resumeを行う。

ただしCodex実行環境そのものを回復不能にする方法は採用しない。

actual OS sleepを安全・自動的に検証できない場合は、

- browser freeze
- process pause
- large wall-clock jump
- WebSocket drop
- AudioContext suspend
- Display reconnect

を組み合わせ、sleep/resume failure modeを可能な限り再現する。

その場合final reportに:

```text
actual physical Windows sleep: not executed
proxy scenarios: ...
remaining physical verification: ...
```

と明記する。

---

# 30. Sleep/resume acceptance

重要なのはsleep中に演劇を継続することではない。

復帰後に:

- server alive / recoverable
- Admin connected
- Display connected
- Audio Ready recovered
- preload intact/recovered
- Show retained
- Scene/Cue retained
- stable visual restored
- old Cue not replayed
- old speech not played
- old SFX not played
- operator can continue Scene 6→7

であること。

自動復旧が難しい場合は、本番安全性を上げるために必要最小限のrecovery UXを追加してよい。

---

# 31. No automatic Cue replay after recovery

非常に重要。

以下を理由に過去Cueを再実行してはいけない。

- reload
- reconnect
- resume
- Audio Ready recovery
- Display reconnect

復旧時に行うのは:

> canonical stable visual/state reconstruction

まで。

speech / SFX / transient animationの再発火は禁止。

次のCueはoperatorの明示NEXTで開始。

---

# 32. Clock jump safety

sleep/resume相当の大きな時間jumpをsimulateする。

数十分〜数時間相当進んでも:

- delayed Cue execution
- delayed speech
- delayed SFX
- subtitle callback burst
- transition stale callback
- NEXT guard stale timer anomaly

が起きないこと。

必要ならwall-clockではなくmonotonic/cancellation generationベースへ修正。

---

# 33. Reload scenarios during idle

Scene 1終了後idle中に:

- Display reload
- Admin reload
- both reload

を試す。

復帰:

- correct Scene
- correct Cue
- stable visual
- current Show
- Audio readiness
- no automatic Cue

---

# 34. Connection interruption

idle中に:

- WebSocket disconnect
- reconnect
- server connection interruption

を既存Runbookの安全範囲でテスト。

可能ならserver restart recoveryも確認。

復帰後Scene 6〜7完走。

---

# 35. Combined failure scenario

単独条件だけではなく、少なくとも1回:

```text
Scene 1 complete
↓
long idle
↓
browser background
↓
sleep/freeze equivalent
↓
connection loss/recovery
↓
focus return
↓
Scene 6
↓
Scene 7
```

を行う。

---

# 36. Multiple-performance test

本番は複数回公演する前提。

最低3公演、可能なら5公演程度を連続再現。

各回:

```text
本番初期状態へ
→ Scene 1
→ realistic idle
→ Scene 6
→ Scene 7
→ 終演
```

長時間を現実的に実行するコストが高い場合でも、少なくとも1公演はfull-realistic idleとし、残りは時間jump/targeted idleを組み合わせてよい。

ただし複数公演によるresource/state leak評価は必ず行う。

---

# 37. Production Reset endurance

複数回:

- end of show
- Scene 1途中
- merged Cue途中
- speech中
- SFX中
- subtitle flow中
- reconnect直後

で`本番初期状態へ`を実行。

その後Scene 1から正常に開始できること。

---

# 38. Accidental operator scenarios

NEXT guard導入後も、以下を確認。

- double NEXT
- rapid NEXT burst
- REPLAY → NEXT
- STOP → NEXT
- focus return → NEXT burst
- reconnect → NEXT burst
- BLACKOUT → RESTORE → NEXT
- Reset後のNEXT

Cue skipping / double audio / double SFXなし。

---

# 39. Audio after long idle

特にScene 6最初のAI発話を重点確認。

長時間idle / background / resume後に:

- first syllable missingなし
- playback starts normally
- correct volume
- AudioContext ready
- subtitle sync
- lip-sync if applicable
- SFX sync

---

# 40. Display / monitor disturbance

可能な範囲で:

- Display minimize/restore
- fullscreen解除/復帰
- resize
- monitor disconnect equivalent
- 1920x1080復帰

を確認。

Avatar/subtitle/puzzle presenter/stateが崩れない。

---

# 41. Resource monitoring

Phase C中:

- process RSS
- heap where practical
- CPU
- WebSocket count
- event listener duplication where practical
- audio resource count
- timers/handles where practical

を観測。

重視:

> 公演サイクル終了 + Reset後にresourceが概ね安定状態へ戻るか。

単純なピーク値より、回数ごとの右肩上がりリークを探す。

---

# 42. Recovery Admin UX

事故復帰時にAdminから数秒で:

- READY / DEGRADED / RECOVERING
- Display connection
- Audio Ready
- Current Scene
- Current Cue
- NEXT availability

が分かるか自己レビュー。

必要な最小修正は行ってよい。

Main UIをdebug dashboard化しない。

---

# 43. Re-run standard critical regression after fixes

Phase Cでcode変更した場合:

```text
relevant unit tests
Production E2E critical path
NEXT guard
merged Cue
Audio Ready
reload/reconnect
recording if impacted
```

を再実行。

---

# 44. Recording regression

最終版で:

```bash
npm run record:production -- artifacts/recordings/<appropriate-name>
```

を正常生成。

latest consolidated Show順で録画されること。

---

# 45. Git workflow

推奨branch:

```text
codex/yokokawa-runtime-hardening-v1
```

禁止:

- force push
- history rewrite
- unrelated hard reset
- user changes破壊

全mandatory gate PASS後:

1. diff review
2. commit
3. feature push
4. master統合
5. master上critical verification
6. push master

---

# 46. Final report

以下を含める。

## Implementation

- starting HEAD/master/origin-master
- `set_goal`
- latest script modified time
- existing NEXT protection analysis
- chosen NEXT guard semantics
- chosen guard interval and reason
- all Cue boundaries audited
- merged Cue list
- major KEEP boundaries and reasons
- ambiguous boundaries
- changed files

## Standard verification

- test count
- Production E2E
- NEXT burst tests
- Cue merge tests
- browser sizes
- Audio Ready/preload
- reload/reconnect
- recording
- console warning/error
- external communication
- audit

## Real-operation verification

- calculated realistic idle duration
- actual longest idle executed
- focus/background scenarios
- actual sleep or proxy method
- clock jump
- reload/reconnect
- combined failure scenario
- number of performance cycles
- Reset repetitions
- resource trend
- issues found
- fixes
- remaining risks

## Git

- feature commit
- master SHA
- origin/master SHA
- ahead/behind

---

# 47. Definition of Done

```yaml
goal:
  set_by_codex_after_audit: true
  achieved: true

script:
  latest_read_only_script_checked: true
  all_adjacent_cue_boundaries_audited: true

next_safety:
  minimum_safe_interval_audited: true
  heavy_chatter_guard_enabled: true
  server_authoritative_duplicate_rejection: true
  rejected_next_not_queued: true
  mouse_burst: PASS
  keyboard_repeat: PASS
  mixed_input_burst: PASS
  reconnect_burst: PASS

cue_consolidation:
  deterministic_boundaries_merged_where_safe: true
  human_uncertain_boundaries_preserved: true
  cancellation_safe: true
  recording_updated: true
  rehearsal_updated: true

phase_b:
  automated_tests: PASS
  production_e2e: PASS
  visual_review: PASS
  audio_ready_preload: PASS
  reload_reconnect: PASS
  recording: PASS
  console_new_warning_error: 0
  external_browser_communication: 0
  audit_vulnerabilities: 0

phase_c:
  realistic_long_idle: PASS
  background_focus_loss: PASS
  sleep_resume_or_best_safe_proxy: PASS
  clock_jump: PASS
  reload: PASS
  reconnect: PASS
  combined_failure: PASS
  repeated_performances: PASS
  repeated_reset: PASS
  no_stale_audio: true
  no_stale_sfx: true
  no_stale_callbacks: true
  resource_growth_unbounded: false
  show_can_finish_after_recovery: true

git:
  master_integrated: true
  origin_master_synced: true
```

---

# 48. Final acceptance criterion

最終的に以下を満たすこと。

> 本番オペレーターがNEXTを誤って二重押し・連打してもCueが意図せず飛ばず、最新台本上、人間の台詞や不確定な行動を挟まない連続した横川AI演出は適切に1 Cueへ統合されている。

かつ、

> 通常のProduction検証をすべてPASSした完成版を使い、Scene 1終了からScene 6開始まで実本番相当の長時間放置をしても状態を維持し、focus喪失・sleep/resume・reload/reconnect等の不慮の事態が起きても、過去Cueを勝手に再生せず、正しいstable stateへ復帰してScene 6・Scene 7を最後まで上演できる。

さらに、

> これを複数公演繰り返してもCue state・Audio・SFX・subtitle・WebSocket・resourceが破綻しない。

この状態まで、合理的に実行可能な範囲をユーザー確認なしで完了すること。
