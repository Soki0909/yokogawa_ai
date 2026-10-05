# Scene Rehearsal Start v1.1 — Design and Audit

## Baseline

- Start branch: `master`
- Start HEAD / `origin/master`: `39325d4baba389b30416175e625abda170898d2b`
- Runtime: Node.js / Express / WebSocket, server-authoritative `StateStore`
- Production: localhost-only single-PC, 18 fixed WAV assets, one Audio Master

## Current-script audit

Read-only source: Google Docs `『7号館からの脱出』上演台本`, document
`16KxoOjIFLJXikFF_3u3LnnbjnQX8xJvZ-cPPNxkuJVo`, revision
`ANLCKQn2B1C85Cdk8kqXy2V7gTeD4QxQWOP2Y1SdHtkg_xKHhgmvWV0V4zHe-LJn583X0Oli8hdJ4f8v3g4W8o3tVZpgXWeZAhOZbGdclKw`.

The main dramatic sequence is Scene 1 through Scene 7. Parallel tabs are 横Scene 2–5 and
虎Scene 2–3. Production `shows/production.json` is the main sequence; 横Scene 5 remains in
the separate route show.

| Script scene | Main Production AI Cue |
| --- | --- |
| Scene 1 / 7・201 | P-001–P-009 plus visual boundary Cues |
| Scene 2 / 7・203 | none |
| Scene 3 / 7・306 | none |
| Scene 4 / 7・413 | none |
| Scene 5 / 4階廊下 | P-010 |
| Scene 6 / 7・201 | P-011–P-016 plus visual boundary Cues |
| Scene 7 / 7・201 | P-V07; P-017 is absent from the current script and remains disabled |

Found system-side discrepancies:

1. Main Show metadata omitted script Scenes 2–4, making scene-based rehearsal impossible.
2. P-010 was disabled by an older unresolved-route audit, but the current main Scene 5 clearly
   contains that announcement. It is enabled without changing its tuned WAV or wording.
3. P-017 has no current-script line. Its tuned WAV/Cue is retained but remains excluded from NEXT.
4. Show metadata referenced an older script revision. A separate current scene-structure revision
   is recorded without rewriting the historical WAV provenance.

No major semantic conflict was found in enabled Production speech. Production WAV files,
Voice Profile, pronunciation and performance parameters are unchanged.

## Runtime design

`canonical Show Reset presentation + enabled Cue state effects before the selected Scene`
is calculated from scratch. Live Cue execution and rehearsal reconstruction share one pure
`applyCueStateEffects` function. Reconstruction uses settled transition/unlock results and never
creates speech messages, history entries, timers, WebSocket Cue events, or TTS/WAV requests.

The server validates and calculates a complete candidate before mutation. It then stops current
audio, clears playback state, commits the candidate to authoritative and per-Display state,
adds exactly one `scene-rehearsal-start` log, and sends each Display one final restore snapshot.
Infrastructure readiness, Display identity/registration, Audio Master and Audio Ready are preserved.

At the scene boundary `currentCue` is intentionally empty. For a scene with an AI Cue, NEXT is
restricted to that scene's first enabled Cue until it runs. For a scene without an AI Cue, NEXT is
empty and returns `NO_SCENE_CUE`; it never falls through to a later scene. REPLAY is unavailable
until a Cue actually runs. BACK leaves the scene boundary and returns to the preceding Cue position.

## Safety and UI

Scene Rehearsal is visible in the primary Show Mode. Starting it requires both an active rehearsal
session and an explicit Scene selection plus button activation. Selection alone has no effect.
The active session toggle is present beside the Scene control, so the safety gate is visible and
does not require opening Advanced mode. Client action locking, action IDs, and a server transaction
guard prevent overlapping starts. No keyboard shortcut is added.
