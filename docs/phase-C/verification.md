# Phase C Script Alignment Patch — Verification

Status: **Verified candidate / USER REVIEW REQUIRED**

対象は`codex/phase-c-production-audio`。最新台本revision `ANLCKQkGG6HZFnG3YLRl1e3dLpFXWQRPK07w5vC3080NFOXU5GMaJxPmE8OKDYB2ZkWrOup0WNSlpIyJDK7681oB5bB3b7g-7MvsG-oMUE0`を正とし、Google Docs本文は編集していない。

## Acceptance results

| 項目 | 結果 | 根拠 |
|---|---|---|
| Alignment audit | PASS | コード変更前にAL-001〜017を監査。MATCH 3 / MISMATCH 13 / UNRESOLVED_SCRIPT 1 |
| Production build | PASS | Main 24 Cue / 18 assets、横川route 1 Cue / 18 assets |
| PRE-SHOW / RESET | PASS | UI表示・Avatar hidden・非BLACKOUT。Phase AはAvatar visibleを維持 |
| Boot reveal | PASS | boot transition中に段階表示し、終了時NORMAL |
| ANOMALY → HIJACKED | PASS | WAV004完了後ANOMALY、WAV005開始時にFULL HIJACKED |
| HIJACKED voice | PASS | WAV005〜009だけ`hijacked-subtle-v1`。raw WAV hash不変、STOP/REPLAY/Lip Sync維持 |
| Riddle / Final | PASS | 5問・第1問・7・201を表示。問題本文は非創作。既存Final Challengeを維持 |
| Unlock / Emergency | PASS | WAV012後SE marker、0→100%保持、013前・014後の警告SE順序を固定 |
| HOSTILE / Stop | PASS | HOSTILE先行、015後轟音、停止コードで警報/LX停止→SHUTDOWN→016→解錠 |
| SHUTDOWN hold | PASS | 自動Recoveryなし。独立RECOVERY Cueまで保持 |
| Unresolved containment | PASS | WAV010 / 017を通常NEXTから除外、018は別Show、スマホ指示でAI blackoutしない |
| Reconnect | PASS | 現在字幕・Cue位置・演出を新規/再接続Displayとserver再起動後に復元。過去音声は再生しない |
| Automated tests | PASS | `npm run check`: 104/104、failure 0 |
| Voice verification | PASS | profile hash一致、18/18 WAV技術検査・SHA-256・音声由来revision一致 |
| Dependency audit | PASS | `npm audit --omit=dev`: 0 vulnerabilities |
| Browser console | PASS | Admin、Display 3、解像度確認用Displayでwarning 0 / error 0 |
| Viewports | PASS | 1280×720 / 1920×1080でoverflow、字幕阻害なし。長いoverlay見出しのclippingを検出・修正 |

## Real-browser verification

Admin 1 + Display 3で、STANDBY、WAV001 boot reveal、WAV002〜004 NORMAL、独立ANOMALY、WAV005 HIJACKED、5-riddle visual、Final Challenge、Unlock 0→100%保持、Emergency、HOSTILE先行、非常停止問題container、停止コード、WAV016、SHUTDOWN長時間保持、明示RECOVERYを順に確認した。

あわせてAudio Masterのみの固定WAV再生、STOP→REPLAY、BLACKOUT→RESTORE、Display再接続、Audio Master再接続とAudio Ready再設定を確認した。新規途中参加Displayで字幕だけ欠落する問題を検出し、現在字幕・display mode・Cue/Scene位置を永続化および初回snapshotへ含める修正後、riddle字幕とHIJACKED演出が同時復元されることを再確認した。

1280×720では全要素がviewport内。1920×1080では`COMMUNICATION LOCKED`の見出しclippingを検出し、frame幅とresponsive fontを修正後、`clientWidth === scrollWidth`と実画面で全文表示を確認した。

## Commands

```powershell
npm run show:production:build
npm run voice:profile:verify
npm run voice:production:verify
npm run check
npm audit --omit=dev
```

結果: 24 Cue生成、profile PASS、Production WAV 18/18 PASS、test 104/104、audit 0 vulnerabilities。既存Phase Cの30分soak証跡は`artifacts/phase-c-review/soak-30m.json`に保持している。本patchでは台本整合の実ブラウザシナリオを再検証し、raw WAV、Local TTS、Audio Master、Phase B Visualの基盤は作り直していない。

## Self review (15 points)

1. 起動前Avatar: hidden — PASS
2. 待機画面: UIは表示され黒画面ではない — PASS
3. WAV004中: NORMALを完走 — PASS
4. ANOMALY / HIJACKED: 独立した手動Cue — PASS
5. HIJACKED voice: subtleで本文理解を優先 — PASS（実PAの感性確認は残る）
6. 外部制御: marker/noteのみ — PASS
7. Warning SE順序: 013前 / 014後 — PASS
8. HOSTILE: 虎谷端末操作triggerの先行Cue — PASS
9. 非常停止謎: 本文を創作していない — PASS
10. Stop code: alarm/flicker STOP markerを先行 — PASS
11. Shutdown: 自動Recoveryなし — PASS
12. Scene 7 conflict: WAV017無効保持 — PASS
13. 横川Scene 5: WAV018別Show — PASS
14. Phase B Visual: composition再設計なし — PASS
15. Candidate 2A raw WAV/provenance: hash・生成revisionを保持 — PASS

## Remaining user review

- 実PAでの`hijacked-subtle-v1`の同一人物性・明瞭度・強さ
- WAV001途中のAvatar revealと役者リアクションの間
- 照明・音響・役者の手動GOタイミング
- WAV010のPA coverage / route mapping
- 競合するWAV017の採否と接続位置
- 非常停止問題の確定本文・素材

STOP GATEに従い、push、master merge、tag、正式releaseは未実施。
