# Phase C Production Audio Integration — Implementation

Status: **Verified candidate / USER REVIEW REQUIRED**

Phase B / `v0.6.0`のVisualと運用機能を維持し、本番固定音声とServer-side Local TTSをProvider境界の内側へ統合した。正式release、master merge、Voice DSPは行っていない。

## Source of truth

- 台本: Google Docs「『7号館からの脱出』上演台本」current revision
- revision: `AHj4eMS3KA9Z6t9TO5mrMgkiaaW8HvtIRZK_RMX11J62cCzp9lINe9lq5LsmmS0pT1fhBPl0a2Y0PQA0pbGM6AoHZh1tsJTPwZ_ie70EKlw`
- modified: `2026-10-03T02:09:48.835Z`
- Voice Profile正本: `experiments/voice-lab/config/selected-profile.json`
- Production snapshot: `config/voice-profiles/yokogawa-professor-v1.json`
- source hash: `sha256:d5c1ef23058df792bf2f27b3422c6212e31d62a2b186e90d305af6731216f739`

台本は読取専用で参照し、編集していない。manifestの全18件は`scriptText === synthesisText`であり、任意の読み替えを加えていない。

## Selected voice

- Candidate: **2A** (`round-2-a-calm-restrained`)
- AivisSpeech model / speaker: 阿井田 茂
- style: Calm
- speaker UUID: `561e4e59-3bc9-4726-9028-44a3c12a6f1d`
- model UUID: `47e53151-a378-46f3-abee-ce13aa07feb1`
- runtime style ID: `1310138977`
- speed: **1.20**（Lab測定より速くするユーザー指定）
- pitch: `0.00`, intonation: `0.45`, tempo dynamics: `0.20`, volume: `0.95`
- output: WAV / 44.1kHz / mono / 16-bit

同期・検証スクリプトは選定正本とのhash drift、profile値、speaker/styleを照合する。Engineの列挙結果からUUIDとstyle名でruntime IDを解決し、固定IDだけに依存しない。

## Architecture

```text
Production Cue ── audio-file ──> local WAV asset ──> Audio Master only
Free Speak/Test ─ local-tts ───> Node provider ──> AivisSpeech
                                      │
                                      └─ bounded runtime WAV cache
Browser TTS ─ development/legacy only; production fallback disabled
```

Local TTSのengine固有処理、profile適用、WAV検査、cache、HTTP配信はserver側へ閉じ込めた。Displayは同一originの一時音声URLだけを扱う。cacheは32件・96MiB・30分TTLの上限を持つ。STOPは合成中リクエストと再生中音声の両方を取消し、失敗時は字幕を残してOperatorへ明示し、Browser TTSへ暗黙fallbackしない。

## Production assets and shows

- Manifest: `config/production-speech/yokogawa-ai-v1.json`
- WAV: `public/assets/audio/yokogawa-professor-v1_*.wav`（18件、合計90.96秒 / 8,023,356 bytes）
- Main show: `shows/production.json`（21 Cue、scripted speech 17件、18 assets登録）
- Route supplement: `shows/production-yokogawa-route.json`（台詞018）
- Preserved demo: `shows/phase-a-demo.json`

台詞010と横川ルート固有台詞018の上演上の排他・配置は台本から一意に確定できないため、`UNRESOLVED ROUTE MAPPING`として別Showに分離した。演出判断を受ける前に推測で本線へ混ぜない。

## Operator behavior

- Scripted Cueは`audio-file`のみを使用する。
- Free SpeakとLocal TTS testは`local-tts`を使用する。
- 音声はGlobal Audio Masterだけが再生し、他Displayは字幕・演出を同期する。
- AivisSpeech停止、profile不一致、合成失敗、WAV不正はAdminへ明示する。
- 再接続で現在字幕・演出は復元するが、過去音声を自動再生しない。
- STOP / REPLAY / BLACKOUT / RESTORE / Show Resetは従来どおり使用できる。

## Intentionally not implemented

- 状態別Voice DSP / effect
- クラウドTTS
- Aivis model binaryのrepository同梱
- 正式`v0.7.0` release/tag、master merge
- 未確定route mappingの推測

次の判断は、実会場のスピーカーで固定WAVとFree Speakを聞き、Voice、速度1.20、音量、Cue timing、演者との間をレビューした後に行う。
