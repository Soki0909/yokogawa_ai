# Codex Implementation Directive — Scene Rehearsal Start v1.1

## 0. Purpose

Implement **Scene Rehearsal Start** for Yokokawa AI used in 「7号館からの脱出」.

The operational goal is:

> During rehearsal, select a scene defined by the current stage script, restore Yokokawa AI to the presentation state that should exist at the **beginning of that scene**, and continue rehearsal from there using the normal production controls.

This feature is for real rehearsal operation shortly before the performance.

It is not a debug shortcut and it is not merely a Cue index jump.

Codex must autonomously complete:

1. repository / Git inspection
2. latest stage-script read
3. Production Show / Cue audit against the script
4. autonomous `set_goal`
5. design
6. implementation
7. automated tests
8. real-browser E2E
9. screenshot self-review
10. fixes
11. full regression verification
12. commit / push
13. integration to `master` only if all required gates pass and repository workflow permits it

Do not stop after code generation.

---

# 1. Production baseline

Current known Production model:

```yaml
venue:
  room: 7-201
  yokokawa_ai_usage: 7-201 only

production_pc:
  count: 1
  os: Windows
  primary_display: Admin
  secondary_display: Display
  output_route: classroom rear PC -> 20m HDMI -> classroom front

runtime_network:
  Wi-Fi: not required
  venue LAN: not required
  Internet: not required
  Netlify: not required

localhost:
  Admin: true
  Display: true
  Server: true
  Production WAV: true

audio:
  fixed_production_wav_count: 18
  fixed_wav_source: public/assets/audio
  fixed_wav_transport: localhost HTTP
  websocket_audio_binary: prohibited
  preload_required_for_audio_ready: 18/18
  AivisSpeech: Free Speak only
```

Known completed baseline at the previous handoff:

```yaml
default_branch: master
reported_HEAD: 39325d4baba389b30416175e625abda170898d2b
reported_origin_master: same

npm_run_check: 131/131 PASS
Production_WAV_SHA: 18/18 match
Voice_Profile_SHA: match
npm_audit_omit_dev: 0
real_Chrome_1920x1080: PASS
representative_Cues: PASS
HIJACKED_STOP_REPLAY_BLACKOUT_RESTORE: PASS
Display_reload_Audio_Ready_recovery: PASS
server_reconnect_Audio_Ready_recovery: PASS
fixed_WAV_without_AivisSpeech: PASS
external_browser_communication: 0
console_warning_error: 0
invalid_preload_cases: fail-closed PASS
```

This is a handoff reference only.

**The actual current repository is Source of Truth for code state.**

Before editing, verify:

```bash
git status
git branch --show-current
git rev-parse HEAD
git rev-parse origin/master
git log --oneline --decorate -n 20
git remote -v
```

Do not assume the repository is still at the reported SHA.

---

# 2. Critical Source of Truth hierarchy

This task has multiple authoritative sources with different responsibilities.

Do not collapse them into one.

## 2.1 Stage script — authoritative for dramatic structure

The **latest stage script is authoritative for**:

- scene boundaries
- scene order
- which dramatic scene rehearsal is starting
- when Yokokawa AI appears or speaks in the dramatic progression
- the relative timing of Yokokawa AI Cues within the stage action
- what stage action exists before / after a Yokokawa AI Cue
- which scene a Yokokawa AI Cue dramatically belongs to
- what “start of this scene” means for rehearsal

Latest script:

```text
『7号館からの脱出』上演台本
```

Google Docs:

```text
https://docs.google.com/document/d/16KxoOjIFLJXikFF_3u3LnnbjnQX8xJvZ-cPPNxkuJVo/edit
```

Location:

```text
共有Drive
└ 【制作共有用】７号館からの脱出
   └ 脚本・謎チーム
      └ 『7号館からの脱出』上演台本
```

### Read-only rule

This Google Doc is **reference-only** for this task.

Do not:

- edit it
- comment on it
- resolve comments
- modify Drive metadata
- create replacement script files in the shared Drive

Read only.

If the script cannot be accessed from the Codex environment:

- do not guess scene structure from old notes,
- do not silently substitute a stale local assumption,
- report the access blocker clearly.

---

## 2.2 Current Production audio — authoritative for spoken audio implementation

The current Yokokawa AI Production audio has already received acting-direction feedback and tuning.

Therefore the current Production implementation is authoritative for:

- fixed Production WAV files
- spoken wording actually used by Production audio
- reading/pronunciation
- timing inside the recorded WAV
- speed
- pitch
- intonation
- pauses
- Voice Profile
- audio asset mapping

These are already adjusted for performance.

### Important rule

**Do not regenerate or modify Production WAV merely because the script wording differs slightly.**

Do not modify unless a severe inconsistency makes Production unusable and the task cannot be completed without addressing it.

If such a severe discrepancy is found:

- do not silently regenerate audio,
- do not rewrite wording by assumption,
- report it as a blocker / explicit discrepancy.

Production WAV and Voice Profile are otherwise out of scope.

---

## 2.3 Production Show / Cue configuration

The current Production Show File is the executable representation of the stage production.

However, for **scene structure and Cue dramatic ordering**, it must conform to the current stage script.

Therefore:

```text
stage script
    ↓
Production Show / Scene / Cue structure must conform
```

If the current Show File has Cue order, scene ownership, or scene boundaries that conflict with the current script:

**the system side must be corrected to match the script.**

Do not preserve a known-wrong Cue order merely because it already exists.

At the same time:

- do not alter spoken audio content unnecessarily,
- do not change unrelated visual design,
- do not infer missing dramatic decisions that the script does not establish.

---

## 2.4 Runtime presentation implementation

The repository is authoritative for **how** the presentation state is technically represented and rendered:

- Preset
- Avatar
- Subtitle
- Display mode
- Blackout
- Overlay
- Visual
- Transition
- Unlock
- Lip Sync
- Display synchronization
- Audio Ready
- Playback state

The stage script defines when the dramatic state should exist.

The Production system defines how that state is represented.

---

# 3. Mandatory pre-implementation audit

Before implementing Scene Rehearsal Start:

1. read this entire directive,
2. inspect the current repository,
3. read the latest stage script,
4. inspect the current Production Show / Cue definitions,
5. compare script scene structure against current Show / Cue structure,
6. identify discrepancies,
7. determine which system metadata/order must be corrected,
8. only then design Scene Rehearsal Start.

Do not begin by assuming the current Show scene numbering is correct.

---

# 4. `set_goal` — Codex must define it autonomously

After reading:

- this directive,
- the actual repository,
- the latest stage script,
- the current Production Show / Cue structure,

Codex must use `set_goal` itself.

Do **not** copy a prewritten goal from this document.

The goal must be derived autonomously from the actual state found.

The goal should capture, at minimum:

- stage-script-conformant scene rehearsal behavior,
- preservation of tuned Production audio,
- safe state reconstruction,
- Production regression safety,
- real-browser verification.

The purpose of this requirement is to force Codex to establish its own implementation target after grounding itself in the real system.

After `set_goal`, proceed without waiting for user confirmation unless a true blocker exists.

---

# 5. Definition of Scene Rehearsal

Rehearsal is performed **scene by scene** according to the stage script.

Therefore:

> Scene Rehearsal Start means restoring Yokokawa AI to the state it should have at the **beginning of the selected script scene**.

This is the central definition.

It is not:

> jump to immediately before whichever Yokokawa AI Cue happens to be nearest.

---

# 6. Scene start and first Yokokawa AI Cue are not necessarily the same moment

A script scene may begin with:

```text
actors
dialogue
movement
lighting
SE
...
Yokokawa AI Cue
```

If so, Scene Rehearsal Start must restore Yokokawa AI to the state that exists at the **scene beginning**.

It must not pretend that all stage action before the first Yokokawa AI Cue has already occurred.

Therefore the system must distinguish:

```text
scene start boundary
```

from:

```text
first Yokokawa AI Cue inside that scene
```

The first normal `NEXT` available to Yokokawa AI should execute the first Yokokawa AI Cue assigned to that scene when the operator reaches that dramatic timing.

---

# 7. Scenes with no Yokokawa AI Cue

This changes the earlier v1.0 assumption.

Because rehearsal is scene-based, a stage-script scene may legitimately contain **zero Yokokawa AI Cues**.

Such a scene must still be selectable for Scene Rehearsal Start if the system can determine its start state.

Expected behavior:

```text
REHEARSAL START READY

<Scene name>
このScene内に横川AI Cueはありません
```

Requirements:

- restore the correct Yokokawa AI presentation state for the beginning of that scene,
- do not jump to a Cue in the next scene,
- do not invent a Cue,
- do not automatically advance the show,
- do not auto-play audio.

The fail-closed rule becomes:

> **Never substitute a Cue from another scene when the selected scene has no Yokokawa AI Cue.**

Do not disable the entire scene solely because it has zero AI Cues if the scene start state itself can be reconstructed.

---

# 8. Existing `scene:jump`

Keep existing `scene:jump` semantics unless current repository inspection shows a different explicit contract.

Conceptually it is a position/navigation operation.

Do not silently convert it into full rehearsal-state reconstruction.

Scene Rehearsal Start must remain a separate operation.

---

# 9. New operation

Add an independent operation equivalent to:

```text
scene:rehearsal-start
```

Use project naming conventions if another exact name fits better.

The semantics, not the literal name, are mandatory.

---

# 10. Scene Rehearsal Start — required transaction semantics

On successful start:

```text
1. validate selected script scene
2. determine its exact dramatic start boundary
3. calculate the correct Yokokawa AI state at that boundary
4. STOP current audio
5. clear Playback Queue
6. cancel active Transition / Unlock progression
7. replace transient Presentation state with reconstructed scene-start state
8. set runtime scene/cue position consistently with the script scene
9. do not execute any Cue
10. do not automatically play audio
11. send only the final reconstructed state to Display
12. expose the first Yokokawa AI Cue in that scene, if one exists
```

---

# 11. Reconstruction principle

Preferred architecture:

> Start from canonical Show Reset presentation state and deterministically apply only the **state effects** of Production Cues that should already have completed by the beginning of the selected script scene.

Do this server-side.

Do not reconstruct by replaying historical Cues through the normal side-effect path.

Strongly prefer shared deterministic state semantics such as:

```js
nextState = applyCueStateEffects(previousState, cue)
```

or the current architecture's equivalent.

Separate:

```text
deterministic state calculation
```

from:

```text
runtime side effects
```

---

# 12. Reconstruction must obey corrected script ordering

If the pre-implementation audit determines that current Cue ordering / scene assignment does not match the stage script:

1. correct the system-side scene/Cue metadata or ordering,
2. test that normal Production progression still reflects the script,
3. use the corrected order as the basis for reconstruction.

Do not reconstruct from an ordering known to be inconsistent with the script.

---

# 13. Side effects prohibited during reconstruction

Reconstruction must not cause:

```text
historic Production WAV playback
WAV fetching caused solely by historic Cue replay
Local TTS
AivisSpeech
historic WebSocket Cue execution
transition timing playback
unlock timing playback
historic Cue history spam
rehearsal log spam
operator notification spam
Display flashes through historical states
```

---

# 14. Audio rules

Mandatory:

```yaml
Scene_Rehearsal_Start:
  stop_current_audio: true
  clear_playback_queue: true
  auto_fixed_wav: false
  auto_local_tts: false
  auto_aivis_speech: false
```

After restore:

```text
normal NEXT
```

may play the normal Production audio for the appropriate Cue.

Do not modify tuned fixed Production WAV files.

---

# 15. Presentation state to reconstruct

At minimum:

```text
currentPresetId
currentAvatar
currentSubtitle
displayMode
blackout
currentOverlay
currentVisual
currentTransition
unlock
```

Inspect the actual current runtime and include all additional Display-relevant fields.

Possible examples:

```text
avatar visibility
avatar state
lip-sync stable state
warning/hijack flags
mode-specific UI state
transition terminal target
unlock terminal status
Display-target-specific presentation state
```

Do not omit real state merely because it is not listed here.

---

# 16. State to preserve

Do not turn Scene Rehearsal Start into a full application reset.

Preserve infrastructure readiness such as:

```text
Audio Master
Audio Ready
18/18 preload readiness
Display registration
Display identity
server connection metadata
validated Production audio assets
```

unless the actual architecture requires a minimal equivalent refresh.

---

# 17. Transition semantics

Historical transitions must be settled instantly.

Do not visually replay:

```text
NORMAL
-> WARNING
-> HIJACKED
-> ...
```

while reconstructing.

The Display must receive only the final stable scene-start state.

If transition state includes:

```text
from
to
progress
status
```

reconstruct a terminal/settled state appropriate for that scene start.

---

# 18. Unlock semantics

Do not replay a timed Unlock animation during reconstruction.

Reconstruct its correct terminal state at the selected scene boundary.

Do not invent a per-scene hardcoded value if existing Cue semantics can derive it.

---

# 19. Atomicity

The operation must behave transactionally.

Preferred logical sequence:

```text
calculate candidate state privately
validate candidate
stop/clear current playback
commit authoritative runtime state coherently
append one rehearsal-start log
broadcast one final snapshot
```

Adapt exact ordering to current implementation.

The Display must not see intermediate historical states.

---

# 20. Failure atomicity

If reconstruction cannot be completed:

- do not leave a partially mutated runtime,
- do not partially move the Cue position,
- do not partially change the Display,
- show an operator-visible error,
- keep or restore a coherent previous state.

Do not silently continue with guessed state.

---

# 21. Idempotency / state drift

Mandatory.

Repeatedly starting the same script scene must result in the same relevant state.

Test:

```text
Scene X start
Scene X start
Scene X start
...
```

State must not drift.

Also test scene switching:

```text
Scene A
Scene B
Scene C
Scene A
```

The result for Scene A must depend on:

```text
Show Reset + corrected script-conformant Production sequence
```

not stale runtime state.

---

# 22. Reference-state verification

Do not test only against manually written expected snapshots.

Where practical, compare:

```text
A. state reached by deterministic progression through the corrected enabled Production Cue sequence up to the script scene boundary
B. Scene Rehearsal reconstruction result
```

The relevant state projection should match.

Exclude only truly volatile metadata such as timestamps, log IDs, connection IDs.

---

# 23. Script / Show audit behavior

During the audit, classify discrepancies.

## Type A — Scene metadata/order mismatch

Examples:

```text
Cue belongs to Scene 6 in script but Show metadata says Scene 5
Cue order conflicts with script order
Scene boundary is placed differently
```

If the script clearly resolves the discrepancy:

**fix the system side.**

## Type B — minor spoken wording difference

Example:

```text
script wording differs slightly from tuned Production WAV
```

Default:

**keep current Production audio / spoken implementation.**

Do not regenerate.

## Type C — major semantic spoken conflict

Example:

```text
Production audio meaning contradicts the current script
```

Do not silently decide.

Report explicitly.

Only change if the current task cannot logically work without it and the correct resolution is unambiguous.

## Type D — script contains placeholder / undecided content

Examples:

```text
〇〇
TODO
editorial note
temporary puzzle text
```

Do not treat placeholders as final Production content.

Use them only for dramatic structure if the scene boundary/order itself is still clear.

---

# 24. UI — operational priority

Scene Rehearsal is a major Show Mode function.

Do not bury it under:

```text
Advanced
Debug
Developer
Diagnostics
hidden accordion
```

Concept:

```text
SCENE REHEARSAL

[ Scene selector ▼ ]

[ このシーンの冒頭へ ]
```

After successful start:

```text
REHEARSAL START READY

<Script Scene name>

NEXT -> <first Yokokawa AI Cue in this scene>
```

or, if no AI Cue exists:

```text
REHEARSAL START READY

<Script Scene name>
このScene内に横川AI Cueはありません
```

---

# 25. Scene selector

The selector should represent **rehearsal scenes from the current stage script**, not merely arbitrary internal Cue groups.

Requirements:

- deterministic scene order
- readable scene names
- selector change alone does not mutate Production state
- selector change alone does not execute Cue
- selector change alone does not play audio
- start action requires explicit operator activation

If the current Show File lacks enough scene metadata to represent script scenes, improve the system-side metadata minimally and maintainably.

Avoid duplicating the entire script into code.

---

# 26. Viewport requirements

Mandatory real-browser review:

## 1920 × 1080

- Scene Rehearsal must be in the first viewport.
- No scrolling should be required for primary Show Mode operation.

## 1280 × 720

- Scene Rehearsal must remain easy to find and operate.
- Do not reduce text to unreadable size.
- Keep critical controls directly accessible.

---

# 27. Rehearsal safety gate

Review current Rehearsal / Show Mode implementation.

An explicit state such as:

```js
rehearsalSession.active === true
```

may be used to prevent accidental live-show scene jumps.

Do not blindly copy this idea.

Choose the safest usable design after inspecting the actual system.

Priority:

```text
1. prevent accidental Scene Start during live performance
2. keep rehearsal fast
3. avoid unnecessary hidden setup
```

If a gate is used, Show Mode should clearly communicate why the function is unavailable.

Do not hide the function in Advanced.

No keyboard shortcut in this version.

---

# 28. Double-click / concurrency safety

Prevent overlapping Scene Rehearsal Start transactions.

At minimum:

- repeated click must not create concurrent state mutations,
- UI should reflect in-progress state if necessary,
- no duplicate playback-stop race,
- no duplicate log entries for one accepted operation.

Do not add artificial waiting if computation is effectively immediate.

---

# 29. Rehearsal logging

On each successful Scene Rehearsal Start, append exactly one logical entry.

Example:

```yaml
type: scene-rehearsal-start
sceneId: <script-aligned scene id>
nextCueId: <first AI cue or null>
```

Use existing conventions.

Historic state reconstruction itself must generate zero Cue history entries.

---

# 30. Display reload

Mandatory scenario:

```text
Scene Rehearsal Start
-> scene ready
-> Display reload
```

Expected:

- same authoritative final scene-start state
- no historic audio
- no target Cue audio
- no transition replay
- no unlock replay
- Audio Ready remains correct
- Admin remains coherent

The server remains authoritative.

---

# 31. Server reconnect

Verify:

- reconnect does not corrupt scene-start state,
- Audio Ready recovery remains correct,
- fixed WAV readiness remains correct,
- only final current Display state is synchronized,
- no historical playback occurs.

---

# 32. Interaction with controls

Verify at least:

```text
NEXT
BACK
REPLAY
STOP
BLACKOUT
RESTORE
```

Questions to resolve:

- What does NEXT do when the selected scene has a first AI Cue?
- What does NEXT do when the selected scene has zero AI Cues?
- Does BACK remain coherent from a scene-start boundary?
- Does REPLAY refuse to invent a Cue that has not run?
- Does STOP remain safe with no audio?
- Do BLACKOUT/RESTORE preserve reconstruction integrity?

Use the smallest rule consistent with existing Production semantics.

Document any boundary-specific behavior.

---

# 33. Production visual regression

Do not change visual design for:

```text
HIJACKED
WARNING
HOSTILE
SHUTDOWN
Avatar
```

unless a direct bug in state reconstruction makes a minimal fix necessary.

Scene reconstruction must correctly restore a state that happens to be one of those modes.

---

# 34. External-network constraint

Production remains localhost-only.

Do not add:

```text
cloud state reconstruction
Netlify runtime dependency
Internet fetch
CDN dependency
external analytics
```

Verify external browser communication remains zero for Production flow.

The Google Docs script is a **development-time read reference**, not a runtime dependency.

---

# 35. Audio Ready / preload regression

Must continue to preserve:

```text
18/18 preload
Audio Ready
Display reload recovery
server reconnect recovery
invalid preload fail-closed behavior
```

If existing tests cover:

```text
17/18
19/18
404
empty WAV
```

run them.

Scene Rehearsal Start must not falsely set Audio Ready.

---

# 36. Automated tests — minimum required

Add tests covering:

## A. script-aligned scene mapping

Verify current Production scene/Cue mapping matches the current script for Yokokawa AI-relevant scenes.

## B. Scene with AI Cue

```text
start scene
correct scene-start state
no Cue executed
no audio
first scene AI Cue exposed correctly
```

## C. Scene with no AI Cue

```text
start scene succeeds
correct scene-start state
nextCueId for that scene = null / equivalent
no implicit next-scene Cue
no audio
```

## D. Scene 1 or first script scene

Restore true show/scene-start boundary.

## E. representative later scene

Use current script/Show data, not stale hardcoded assumptions.

## F. repeated identical start

No state drift.

## G. repeated cross-scene switching

No stale-state dependency.

## H. atomicity

No intermediate Display history.

## I. no historic side effects

No:

```text
audio
TTS
WAV replay request
transition timers
unlock timers
Cue history spam
```

## J. Display reload

Same state, no replay.

## K. existing controls regression

Targeted regression for:

```text
NEXT
BACK
REPLAY
STOP
BLACKOUT
RESTORE
HIJACKED
```

---

# 37. Strong state-test model

Prefer a deterministic projection such as:

```js
projectPresentationState(runtimeState)
```

and compare relevant state.

Do not weaken assertions by excluding real presentation fields.

---

# 38. Browser E2E

Use the real Production browser path.

Extend:

```text
scripts/production-browser-check.js
```

if appropriate.

At minimum:

```text
open Admin
open Display
reach Audio Ready
activate rehearsal safety state if required
select a script scene
start rehearsal
verify READY
verify Display final state
verify no auto audio
use NEXT at the appropriate scene Cue
verify intended Cue executes
repeat start
switch scenes
reload Display
verify sync
```

Also test a no-AI-Cue scene if such a script scene exists and is represented.

---

# 39. Screenshot review

Capture actual screenshots at:

```text
1920 × 1080
1280 × 720
```

At minimum show:

1. Show Mode with Scene Rehearsal
2. selector
3. READY with a scene that has an AI Cue
4. READY with a scene that has no AI Cue, if applicable

Self-review visually:

- visible immediately?
- scene name readable?
- NEXT information readable?
- visually distinct from NEXT?
- no clipping?
- no bad truncation?
- no unnecessary scrolling?
- production-quality operator UI?

If not, fix and recapture.

---

# 40. Console / browser quality gate

During browser verification:

```text
new console errors: 0
new console warnings: 0
```

Document any proven pre-existing baseline noise separately.

---

# 41. Production regression

Run all relevant existing verification.

Minimum:

```bash
npm run check
npm audit --omit=dev
```

and current Production Browser Check.

Verify:

```text
Single-PC Production Mode
18/18 WAV preload
Audio Ready
Audio Ready recovery
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
Rehearsal
Display reload
server reconnect
Production Browser Check
external communication 0
```

---

# 42. Explicit non-goals

Do not modify unless a direct unavoidable blocker exists:

```text
Production WAV binaries
Voice Profile
acting-direction audio tuning
pronunciation
audio speed
audio intonation
HIJACKED design
Avatar design
Netlify Voice Lab
Single-PC architecture
localhost Production model
```

Do not add:

```text
keyboard shortcut
cloud runtime dependency
historic Cue replay
automatic scene-start audio
implicit next-scene fallback
giant hand-maintained per-scene state snapshots
```

---

# 43. Implementation quality

Prefer:

- deterministic state calculation
- shared Cue state semantics
- minimal scene metadata necessary to represent the script
- explicit naming
- testable boundaries
- server-authoritative state
- atomic snapshot broadcast
- fail-closed ambiguity handling
- small cohesive changes

Avoid:

- duplicated live/reconstruction Cue logic
- per-scene hardcoded state blobs
- timer-based fake reconstruction
- client-only authority
- state change on dropdown selection
- hidden audio
- guessing script intent

---

# 44. Design note before coding

After audit and `set_goal`, write a concise design note in task output or existing repository documentation covering:

```text
1. Actual repository state
2. Current Production Show / Cue structure
3. Current stage-script scene structure relevant to Yokokawa AI
4. Discrepancies found
5. System-side corrections required
6. Audio discrepancies found, if any
7. Authoritative runtime presentation state location
8. Pure state effects vs side effects
9. Reconstruction boundary design
10. Scene-with-no-AI-Cue behavior
11. Rehearsal safety gate decision
12. Atomic commit/broadcast strategy
```

Then implement.

---

# 45. Important ambiguity rule

If the stage script clearly defines scene order/boundary:

```text
follow the script
```

If the script contains an unresolved placeholder but current Production behavior is stable:

```text
do not invent new dramatic behavior
```

If the script and current Production audio have a small wording difference:

```text
preserve tuned Production audio
```

If they have a major semantic conflict:

```text
report it
```

If scene assignment/order is inconsistent:

```text
fix the system to match the script
```

---

# 46. Current representative Production IDs

Previous implementation discussions referenced IDs such as:

```text
P-001
P-011
P-V07
```

Do not treat these as immutable truth.

Confirm against:

```text
latest stage script
current Production Show File
```

Use actual current IDs in tests and final report.

---

# 47. Git workflow

Create/use a feature branch:

```text
codex/scene-rehearsal-start-v1.1
```

If an equivalent work branch already exists, inspect it before reuse.

Do not:

- hard reset user work,
- rewrite history,
- force push,
- overwrite unrelated uncommitted changes.

If the working tree contains unrelated user edits, preserve them.

---

# 48. Commit / integration

Only after all required tests and browser review pass:

1. inspect final diff
2. ensure only intended changes are included
3. commit with a clear message, e.g.

```text
feat: align scene rehearsal with stage script
```

4. push feature branch
5. if repository workflow allows autonomous integration, merge into `master`
6. rerun critical verification on integrated `master`
7. push `master`

Do not integrate if a mandatory gate is failing.

---

# 49. Final report

Return:

```text
1. Baseline branch / HEAD / origin/master
2. set_goal value chosen by Codex
3. Stage script actually referenced
4. Stage script access result
5. Script scene structure relevant to Yokokawa AI
6. Show/Cue discrepancies found
7. System-side scene/Cue corrections made
8. Audio discrepancies found
9. Confirmation that tuned Production WAV / Voice Profile were preserved
10. Final Scene Rehearsal architecture
11. No-AI-Cue scene behavior
12. rehearsalSession / safety-gate decision
13. Files changed
14. Protocol/event changes
15. Automated tests
16. Repeated-start drift test
17. Cross-scene switching test
18. Atomicity verification
19. Display reload verification
20. Server reconnect verification
21. 1920x1080 review
22. 1280x720 review
23. Screenshot self-critique and fixes
24. Full Production regression
25. npm run check result
26. npm audit --omit=dev result
27. console warning/error count
28. external browser communication count
29. feature branch
30. commit SHA
31. master SHA if integrated
32. origin/master SHA
33. remaining risks / unresolved script conflicts
```

Never report PASS for a test not actually executed.

---

# 50. Definition of Done

```yaml
script_alignment:
  latest_stage_script_read: true
  scene_boundaries_follow_script: true
  cue_dramatic_order_follows_script: true
  show_metadata_corrected_if_needed: true

audio:
  tuned_production_wav_preserved: true
  voice_profile_preserved: true
  pronunciation_preserved: true
  acting_direction_tuning_preserved: true

scene_rehearsal:
  selectable_by_script_scene: true
  restores_scene_beginning_state: true
  cue_not_executed_on_start: true
  auto_audio_on_start: false
  scene_with_no_ai_cue_supported: true
  implicit_next_scene_fallback: false

state:
  deterministic_reconstruction: true
  server_authoritative: true
  atomic_display_update: true
  transition_settled: true
  unlock_settled: true
  repeated_start_drift: none
  display_reload_restores_same_state: true

ux:
  main_show_mode: true
  1920x1080_reviewed: true
  1280x720_reviewed: true
  ready_state_clear: true
  visually_distinct_from_NEXT: true

regression:
  Single_PC: PASS
  18_of_18_preload: PASS
  Audio_Ready: PASS
  NEXT: PASS
  BACK: PASS
  REPLAY: PASS
  STOP: PASS
  BLACKOUT: PASS
  RESTORE: PASS
  HIJACKED: PASS
  Lip_Sync: PASS
  Preflight: PASS
  Show_Reset: PASS
  Rehearsal: PASS
  Production_Browser_Check: PASS
  external_requests: 0
  new_console_errors_warnings: 0

delivery:
  set_goal_autonomously_created: true
  automated_tests: PASS
  browser_E2E: PASS
  screenshot_self_review: PASS
  commit_created: true
  push_completed_or_exact_blocker_reported: true
```

---

# 51. Final priority order

When tradeoffs appear:

```text
1. Follow the current stage script for scene structure and dramatic timing
2. Preserve already tuned Production audio unless a severe conflict exists
3. Do not break live Production operation
4. Restore the logically correct Yokokawa AI state for the script scene start
5. Prevent accidental live-show misuse
6. Make scene rehearsal fast and obvious
7. Prevent state drift and duplicated state semantics
8. Keep the implementation maintainable
```

Final acceptance question:

> Can the operator select a scene from the current stage script, restore Yokokawa AI to the exact state it should have at the beginning of that scene, rehearse that scene without accidental cross-scene Cue execution, and continue using the existing tuned Production audio safely?
