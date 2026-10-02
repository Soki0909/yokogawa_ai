# Phase B Autonomous Visual Verification

Status: **Phase B rc.2 autonomous visual candidate complete / user visual review pending**

## Baseline and candidate

- Protected baseline: `v0.5.0` (`8fbe042`, Phase A)
- Previous candidate baseline: annotated `v0.6.0-rc.1` (`afba510`)
- Candidate version: `0.6.0-rc.2`
- Candidate tag: annotated `v0.6.0-rc.2`（この検証記録を含む最終HEADへ付与）
- Canonical specification: [`yokogawa_ai_phase_b_autonomous_visual_spec_v1.0.md`](yokogawa_ai_phase_b_autonomous_visual_spec_v1.0.md)
- Implementation directive: [`codex_yokogawa_ai_phase_b_autonomous_visual_prompt_v1.0.md`](codex_yokogawa_ai_phase_b_autonomous_visual_prompt_v1.0.md)
- Production dependencies: 追加なし

## Architecture and changed areas

- `public/css/display-phase-b.css`: Phase B token、6 state grammar、transition、overlay、Final Challenge、radial gauge、responsive、reduced motion。
- `public/display.html`: environmentとtransitionの独立layer。
- `public/js/display.js`: state dataset、reconnect時のtransition時刻補正、gauge、完了・中断・cleanup。
- `src/state-store.js`: Unlock開始・100%保持・中断・別Cue移行のauthoritative state修正。
- `scripts/execute-cue.js`: 任意Cue / reset用の検証CLI。発話Cueとdisplay-only Cue双方のacknowledgementに対応。
- `scripts/soak-test.js`: Shutdown / Recovery / normalizeとstate cleanupの周期検証。
- `test/phase-b-visual.test.js`、`test/phase-b-state.test.js`: Phase B固有契約。
- `artifacts/phase-b-review/`: 1280×720状態matrix、1920×1080相当、遷移frame、contact sheet、soak log。

Visual tokenは色、frame、glow、motion duration、transition intensity、gaugeを`--phase-*`系custom propertyに集中させた。演出順は `Environment → Avatar → Scene Visual → Subtitle/Status → Operation Overlay → Transition → BLACKOUT` とし、BLACKOUTを最上位に維持する。

## Autonomous review and fixed defects

| Pass | 発見 | 修正・再確認 |
|---|---|---|
| 1 | connection-failedにUnlock gaugeが残る | gauge表示条件を限定。Emergency / abortedだけは意図的な破断gaugeを保持 |
| 2 | SHUTDOWNで全animationを止めた結果、transitionの赤いflashまで停止 | underlying layerだけ停止し、transition layerは完了・除去までrunning |
| 3 | 静的`unlocking: 100`でUnlock timerが再始動 | `unlock-start`だけ開始、100%はcompleted保持、Emergencyはaborted保持、別Cueでidle cleanup |
| 3 | 汎用Cue CLIが発話付きCueのmessage ID ackを待てない | 短命な専用Admin接続の最初のacceptedを成功として扱うよう修正 |
| 4 | 初回30分soakが19分時点で、3.5秒heartbeat判定と5秒event timeoutの競合により検証client timeout | 本番既定と同じ7秒heartbeat判定、15秒event timeout、解決済みwaiter timerの明示cleanupへ修正。短縮再試験後、0分から30分を再実行 |

詳細は [`visual-self-critique.md`](visual-self-critique.md)。

## Automated verification

実行コマンド:

```powershell
npm run check
npm audit --omit=dev
```

- `npm run check`: **80 tests PASS / 0 fail**。Phase A baseline 71件を維持し、Phase B固有9件を追加。
- Syntax check: server、state、schema、audio、network、全主要client、soak / preset / cue / browser helperをPASS。
- `npm audit --omit=dev`: 最終実行結果を下記「最終試験記録」に記載。

追加契約はDOM layer order、BLACKOUT z-index、state/overlay/visual/unlock cleanup、shutdown motion stop、recovery completion、reduced motion、responsive overflow、transition completion、reconnect stabilityを含む。

## Real browser verification

実ブラウザでAdmin 1 + Display 3を同一serverへ接続し、次を確認した。

- Admin表示: `3 ONLINE / 3 REGISTERED`、Preflight READY、Audio Master READY。
- Broadcast: `pa-004`が3台すべてへ同じWARNING演出・字幕を配信。
- Individual: Display BだけHOSTILEへ変更し、A/CがWARNINGのまま維持。
- Audio Master: Masterだけ通常TTSを処理し、非Masterは字幕出力。Master切断時にAdminがOFFLINE / Audio Master errorを表示し、同じIDの再接続・再準備で復帰。
- Display reconnect: targeted stateと字幕を復元し、過去transitionを再生しない。
- Admin reconnect: Cue位置、3台接続、Audio Masterを復元。
- NEXT / BACK / REPLAY / 任意Cue / Free Speak / Show Resetを実操作。
- 最新server stateで `pa-016 → pa-017 → pa-018 → pa-021 → pa-025 → pa-026`を実行。Unlock `completed 100%`、Emergency `aborted 100%`、NORMALで`overlay=none / visual=none / unlock=idle`をDOM datasetと画面で再確認。
- BLACKOUT / RESTORE、NORMAL → WARNING → HIJACKED → UNLOCK → ERROR → HOSTILE → SHUTDOWN → RECOVERY → NORMALを確認。
- Admin + Display A/B/Cのconsole: **warning 0 / error 0**。

Resolution:

- 1280×720: viewportとdocumentが一致、横縦scrollなし。
- 1920×1080相当: viewportとdocumentが一致、横縦scrollなし。証跡 [`normal-1920x1080.png`](../../artifacts/phase-b-review/normal-1920x1080.png)。
- Avatar、字幕、status、overlayにclipping / unintended overlapなし。中央HUDは共通中心軸上で左右対称。

## Screenshot and transition evidence

- State matrix: [`contact-sheet-states.png`](../../artifacts/phase-b-review/contact-sheet-states.png)
- Climax matrix: [`contact-sheet-climax.png`](../../artifacts/phase-b-review/contact-sheet-climax.png)
- Transition matrix: [`contact-sheet-transitions.png`](../../artifacts/phase-b-review/contact-sheet-transitions.png)
- Individual files and review passes: [`artifacts/phase-b-review/`](../../artifacts/phase-b-review/)

必須6 Preset、Final Challenge、auth、Unlock 0/25/50/75/100、Emergency、aborted、connection-failed、forced-runaway、BLACKOUT、およびanomaly / takeover / unlock / emergency / hostile-enter / shutdown / recoveryの比較フレームを格納した。

## Soak and performance

- Final 30-minute run: **30分 / 795 iteration / failure 0 / abnormal exitなし**。
- Reconnect 3、Admin reconnect 1、Audio Master reconnect 1、Master change 1、BLACKOUT 44、Unlock / Emergency / Shutdown / Recovery / normalize各44、cleanup check 132。
- RSS: 65,400,832 → 93,904,896 bytes（+28,504,064 bytes）。795反復後も処理成功率100%で、unbounded growthや異常終了なし。
- Short final-candidate smoke: 9秒、42/42 iteration、failure 0、reconnect 3、admin reconnect 1、master reconnect 1、master change 1、shutdown / recovery / normalize各2、cleanup check 6、abnormal exitなし。
- AnimationはCSS transform / opacity中心。Canvas / WebGL、particle、大量DOM生成、JS毎frame描画、新規runtime依存を追加していない。
- timerはtransition cleanupとUnlock stateに限定し、終了・中断・別Cue・再接続を試験した。

## Acceptance criteria mapping

| 区分 | 条件 | 結果・根拠 |
|---|---|---|
| Regression | Phase A機能回帰なし | ✅ baseline 71 testを含む80 test PASS |
| Regression | v2/v3 Show互換 | ✅ schema / migration / import rollback tests PASS |
| Regression | Admin / Display / Audio Master | ✅ 実ブラウザ4タブ + WebSocket flow |
| Regression | reconnect | ✅ Display / Admin / Master再接続、state restore |
| Regression | BLACKOUT / RESTORE | ✅ flow test + 実ブラウザ |
| State | NORMAL基準状態 | ✅ state matrix、左右対称・低motion |
| State | WARNING異常認識 | ✅ 琥珀geometry / scan / pulse |
| State | HIJACKED構造差 | ✅ intrusion band / offset / async ring |
| State | HOSTILE高強度 | ✅ red-black / rupture / broken ring |
| State | SHUTDOWN motion停止 | ✅ CSS contract + 実ブラウザ静止確認 |
| State | RECOVERY段階復旧 | ✅ 0/25/50/75/100 frame |
| State | NORMAL復帰残留なし | ✅ dataset cleanup + state test |
| Sequence | anomaly | ✅ start/mid/end evidence |
| Sequence | takeover | ✅ start/mid/end evidence |
| Sequence | Final Challenge | ✅ climax sheet、中央主役化 |
| Sequence | Unlock進行 | ✅ 0/25/50/75/100 + radial gauge |
| Sequence | 100%成功 | ✅ `completed` / 100%実ブラウザ |
| Sequence | Emergency interruption | ✅ `aborted` / 100%、破断gauge |
| Sequence | Hostile enter | ✅ transition evidence |
| Sequence | Shutdown落差 | ✅ before/after + motion停止 |
| Sequence | Recovery sequence | ✅ staged frame + cleanup |
| Rendering | clipping / overlap / scrollなし | ✅ 1280×720、1920×1080相当 |
| Rendering | subtitle可読 / Avatar識別 | ✅ matrix原寸確認 |
| Rendering | BLACKOUT最上位 / z-index | ✅ automated contract + browser |
| Cleanup | overlay / visual / gauge / transition残留なし | ✅ state tests + NORMAL dataset |
| Cleanup | reconnect後過去Transitionなし | ✅ negative-delay / completed restore test + browser reload |
| Evidence | Screenshot / frames / sheets | ✅ review package 3 contact sheets + individual files |
| Evidence | self-critique / 修正履歴 | ✅ self-critique + commit history |
| Verification | automated / browser / 4 tabs | ✅ 80/80、console 0/0、Admin 1 + Display 3 |
| Verification | soak / failure 0 | ✅ 30分、795/795、failure 0、abnormal exitなし |
| Verification | audit重大問題なし | ✅ `npm audit --omit=dev`: 0 vulnerabilities |

## Final test record

- `npm run check`: 80 pass / 0 fail / 0 skipped。
- `npm audit --omit=dev`: found 0 vulnerabilities。
- `SOAK_MINUTES=30 SOAK_INTERVAL_MS=2000 node scripts/soak-test.js`: 795 pass / failure 0 / abnormal exit false。
- 初回試験の検証client timeoutを修正後、要件どおり0分から全時間を再実行した。最終ログは [`soak-30m.log`](../../artifacts/phase-b-review/soak-30m.log)。

## Subjective items pending user review

技術的な壊れ・状態漏れ・描画崩れではなく、WARNING / HOSTILEの強度、Unlock成功感、Emergency落差、SHUTDOWN静寂、RECOVERYの温かさ、Final Challenge主役感、全体強度階層の9項目だけを [`review-guide.md`](review-guide.md) に残した。

## rc.2 Avatar / foreground interference verification

- Avatarの基本画像と無表情な人物設計を維持し、目元発光、顔面色光、眼鏡反射、二重像、状態別blinkで6状態を区別した。
- WARNINGは短いblinkと薄いscan、HIJACKEDはmagenta/cyan位相ずれ・細いjamming band・data corruption、HOSTILEは長い凝視・太い警告帯・rupture・高圧pulseとし、色だけでない差を設けた。
- HOSTILEのfallback SVG眉変形を無効化し、「怒ったAI」ではなく無表情の危険なsystem lockを維持した。
- SHUTDOWNは閉眼、Avatar effect opacity 0、foreground opacity 0、全foreground/avatar effect animation `none`を実ブラウザcomputed styleで確認した。
- RECOVERYは4.8秒の再点灯とinterference剥離を経て安定し、NORMAL復帰後はforeground opacity 0、全foreground child animation `none`、system/blink profile `normal`を確認した。
- Foreground layerはAvatar前面かつScene Visual / Operation Overlay / Transition / BLACKOUTより背面で、字幕の可読性を維持した。
- 実ブラウザviewport 1440×825で6状態を撮影。横・縦overflow 0、console warning 0 / error 0。
- 証跡: [`rc2/contact-sheet-avatar-states.png`](../../artifacts/phase-b-review/rc2/contact-sheet-avatar-states.png) および同directoryの6状態原寸画像。
- `npm run check`: **83 pass / 0 fail**。rc.1の80件にAvatar/foreground/blink profile契約を追加。
- short state/reconnect soak: **0.25分 / 93 event / failure 0 / abnormal exit false**。既存30分soak証跡はrc.1から継承し、rc.2差分に対して短時間回帰を追加した。
