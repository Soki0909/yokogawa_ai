# Phase C Production Audio Integration — Implementation

Status: **Script Alignment Candidate / USER REVIEW REQUIRED**

Phase B / `v0.6.0`の承認済みVisualとPhase C音声基盤を維持したまま、最新台本との不一致だけを修正した。正式release、master merge、tag、pushはSTOP GATEにより行わない。

## Source of truth and provenance

- 台本: Google Docs「『7号館からの脱出』上演台本」（読取専用）
- 現在の監査revision: `ANLCKQkGG6HZFnG3YLRl1e3dLpFXWQRPK07w5vC3080NFOXU5GMaJxPmE8OKDYB2ZkWrOup0WNSlpIyJDK7681oB5bB3b7g-7MvsG-oMUE0`
- modified: `2026-10-03T15:28:38.878Z`
- raw WAV生成時revision: `AHj4eMS3KA9Z6t9TO5mrMgkiaaW8HvtIRZK_RMX11J62cCzp9lINe9lq5LsmmS0pT1fhBPl0a2Y0PQA0pbGM6AoHZh1tsJTPwZ_ie70EKlw`
- Voice Profile: Candidate 2A / `yokogawa-professor-v1` / speed `1.20`

manifestでは現在の台本revisionとraw WAV生成時revisionを分離した。18件の台詞本文、WAV、SHA-256、Candidate 2A profileは変更していない。

## Alignment result

事前監査は [`script-alignment-audit.md`](script-alignment-audit.md) に保存した。17項目の内訳はMATCH 3、MISMATCH 13、UNRESOLVED_SCRIPT 1。MATCHのAL-003、AL-009、AL-016は意味・順序を変更していない。

主な修正は次のとおり。

- Production import / SHOW RESETを、UI表示・Avatar非表示・非BLACKOUTのPRE-SHOW / STANDBYへ戻す。
- WAV001へboot transitionと段階的Avatar revealを付ける。Phase A初期Avatarは従来どおり表示する。
- WAV004完了後に独立ANOMALYを置き、FULL HIJACKEDは消灯・復灯後のWAV005開始時まで遅らせる。
- WAV005〜009だけに`hijacked-subtle-v1`を適用する。
- WAV008と009の間に「5問 / 第1問 / 7・201」だけを示すriddle-enterを置く。
- WAV010は未確定routeの誤進行を防ぐため通常NEXTから無効化し、確認後の直接実行用として保持する。
- WAV012後の電子音、Unlock手動開始、100%保持を明示する。
- WAV013前・WAV014後の警告SE接続点を明示する。
- 虎谷の端末操作をtriggerとするHOSTILE先行CueをWAV015前に置き、WAV015後の轟音接続点を明示する。
- 非常停止問題は本文を創作せず、`CONTENT PENDING`の専用containerだけを用意する。
- 停止コードCueで警報・照明明滅停止とSHUTDOWNを先行し、その後WAV016、扉解錠SE、出演者確認へ接続する。
- SHUTDOWNは長時間保持し、独立RECOVERY Cueだけで復旧する。
- 競合するWAV017は削除せず無効化して保持する。WAV018は横川route別Showのまま維持する。

照明・音響・役者の接続点は`syncMarkers`、`operatorNote`、`triggerNote`だけで表した。Appから外部設備を直接制御せず、正式Cue番号も創作していない。

## HIJACKED voice boundary

`hijacked-subtle-v1`はDisplayのWeb Audio再生層で決定的に構成する。115Hz high-pass、5.6kHz low-pass、11msの低レベルdoubleを使用し、同一人物性と明瞭度を保つ。raw WAVは不変で、同じAudio要素をLip Sync analyserへ接続するため、Audio Master、STOP、REPLAY、audio-reactive lip syncの境界も維持する。SHUTDOWNを含む他のWAVには適用しない。

## Production shows

- Main: `shows/production.json` — 24 Cue / 18 assets
- 横川route supplement: `shows/production-yokogawa-route.json` — 1 Cue / 18 assets
- Phase A demo: `shows/phase-a-demo.json` — 変更なし

未確定事項は、WAV010のroute mapping、Scene 7で競合するWAV017、非常停止問題本文・素材である。これらは推測で解決せず、安全な無効化またはplaceholder containerで止めている。

## STOP GATE

本候補は技術検証済みだが、実PAでのHIJACKED音声明瞭度、boot reveal、外部部署との手動同期、WAV010 / 017の採否と配置についてユーザーレビューが必要である。`v0.7.0`のtag、master merge、pushは行わない。
