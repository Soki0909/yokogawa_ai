# Production refresh v2 — grounding and design

Baseline: `accac58f5916cd2368de23f35ec0787c93ee28f7`, master = origin/master. Existing recording tooling was uncommitted and is included in this refresh. Other instruction/reference artifacts are preserved.

Read-only source: 『7号館からの脱出』, Google document `16KxoOjIFLJXikFF_3u3LnnbjnQX8xJvZ-cPPNxkuJVo`, modified `2026-10-09T11:28:22.972Z`, 14 tabs. Scene 1/6/7 and all AI lines were reviewed. Google document is never modified.

## Actual differences

- Scene 1 adds the bag/answer-sheet instruction after the assistants reply. First-question speech becomes 「第一の謎は、こちらです」. Original 009 is archived, not overwritten.
- Scene 5 gathering is now spoken by 全員 / route 声. Remove AI 010/018 from current Show; preserve original WAVs as archives. Prose still mentions AI announcement: report this discrepancy rather than inventing another AI line.
- Independent Scene 7 contains no AI 017. Remove the disabled historical Cue entirely.
- Scene 6 answer is ブレイクヨコガワ. Emergency answer/hint remain placeholders; do not invent content.
- Current subtitles show whole paragraphs, no sentence timeline. Current saved Show resumes at server startup. BACK does not cancel delayed Cue callbacks. Startup uses progress UI. Image presentation exists but lacks explicit puzzle slots and appropriate stage proportions.
- Existing 18 approved WAVs and profile remain immutable. New/changed speech uses approved Aivis Calm profile. Composer stores sentence WAVs, explicit pauses, deterministic final PCM WAV and shared subtitle timing. Existing takes are segmented at quiet boundaries without resynthesis; their alignment is labeled for operator review.

## Design

One final WAV per Production speech; sentence editing/generation/export lives in separate Production tools. Main operator view prioritizes readiness, version, actor trigger, NEXT and up-next. Server Cue scheduler owns generation cancellation; speech/SFX/subtitle timers stop on transport/reset/rehearsal. Startup/reset installs bundled current Show while retaining Display registration and Audio Ready. Puzzle images use contain, dedicated large stage area and explicit missing-image sample; content is not invented. Avatar remains existing art with replaceable validated local layers and stage-area bottom anchoring.

## Human boundaries

New model adoption, personal likeness, missing puzzle images and unresolved emergency answer/hint remain pending. Model inventory/comparison does not change default. These do not block engineering gates.
