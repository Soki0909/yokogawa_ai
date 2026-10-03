# Phase C Production Audio Integration — Verification

Status: **Verified candidate / USER REVIEW REQUIRED**

検証対象は`codex/phase-c-production-audio`。正式tag、master merge、remote pushはSTOP GATEに従い未実施。

## Acceptance matrix

| 項目 | 結果 | 根拠 |
|---|---|---|
| selected-profile読込 / Candidate 2A | PASS | Production snapshotとsource SHA-256を固定し、drift testを実行 |
| Production profile | PASS | `yokogawa-professor-v1`、阿井田 茂 / Calm、speed 1.20 |
| Current script revision | PASS | manifestにrevision、modified time、13 tabsを記録。台本は非編集 |
| 18 speech manifest / WAV / assets | PASS | 18/18生成・登録。scriptTextとsynthesisText一致 |
| WAV technical check | PASS | 全件44.1kHz / mono / 16-bit、非無音、full-scale clippingなし |
| Production Show audio-file | PASS | Main 17 scripted Cue + route supplement 1。browser scripted cue 0 |
| AivisSpeech server integration | PASS | Engine `1.1.0-dev`、UUID/style解決、profile全値適用 |
| Runtime cache / STOP | PASS | bounded cache、合成cancel、再生停止をunit/integration/browserで確認 |
| Browser fallbackなし | PASS | 実Engine down時にAdmin `NOT READY / AIVIS_UNREACHABLE / Browser fallbackなし`、復旧後READY |
| Free Speak / Audio Master only | PASS | 実Aivis + Admin 1 / Display 3でMasterだけ再生 |
| REPLAY / reconnect / Preflight | PASS | Display・Admin・Audio Master再接続、Ready再確認、過去音声非再生 |
| 1280×720 / 1920×1080 | PASS | 実ブラウザでoverflow、clipping、字幕阻害なし |
| Phase B Visual | PASS | 6 state、Avatar、Foreground Interference、BLACKOUT/RESTORE回帰なし |
| Browser console | PASS | Admin / Display 3でwarning 0 / error 0 |
| `npm run check` | PASS | syntax checks + 97/97 tests、fail 0 |
| `npm audit --omit=dev` | PASS | 0 vulnerabilities |
| 30min soak | PASS | 最終HEADで30:00連続完走、364/364、failure 0、reconnect 3、abnormal exit false、RSS +34,914,304 bytes |

## Browser scenario evidence

実ブラウザで次を確認した。

- Admin 1 + Display 3、Production Show import
- 固定WAV Cue、Free Speak実Aivis、Audio Masterのみ発話
- STOP（Local TTS合成中を含む）、REPLAY、BLACKOUT、RESTORE、Show Reset
- Display reconnect、Admin reconnect、Audio Master reconnect / Audio Ready
- AivisSpeech停止時のblocking error / no fallback、再起動後のREADY復帰
- NORMAL / WARNING / HIJACKED / HOSTILE / SHUTDOWN / RECOVERY / NORMAL cleanup
- 1280×720と1920×1080、長文字幕、console warning/error 0

検証中、Local TTS合成中はserverがSTOP可能なのにAdminボタンだけdisabledとなるUI欠陥を検出した。`localTts.activity === synthesizing`をSTOP有効条件へ追加し、focused testと実ブラウザで修正を確認した。長文字幕がstage frameを越える問題もadaptive font/line clampで修正済み。さらにWindowsの一時的なstate file rename競合を検出し、EPERM / EBUSY / EACCESだけを有限回再試行するよう修正した。非一時エラーは従来どおり即時報告する。

## Automated checks

候補版で以下を実行した。Voice/profile検査、`npm run check`（97/97）、`npm audit --omit=dev`（0 vulnerabilities）、headless browser console（2 pages / 0 warning / 0 error）はPASS。30分soakもstate保存耐性修正後の最終HEADで0分から連続完走した。

```powershell
npm run voice:profile:verify
npm run voice:production:verify
npm run check
npm audit --omit=dev
$env:BROWSER_BASE_URL='http://127.0.0.1:3100'; npm run test:browser-console
npm run test:soak:phase-c
```

30分結果は`artifacts/phase-c-review/soak-30m.json`、ブラウザ確認要約は`artifacts/phase-c-review/browser-verification.json`へ保存する。

PCスリープを経た試行は連続運転として採用しない。ハーネスは60秒を超えるscheduler gapを`SOAK_INVALID_SCHEDULER_GAP`として失格にし、最終証跡はスリープ抑止下で連続30分を0分から測定する。

## Remaining review gate

技術受入は完了候補まで進めるが、音声の感性的品質は自動判定しない。ユーザー確認が必要なのは、実PAにおけるCandidate 2Aの人物感、速度1.20、音量、全18台詞の間、演者とCueのタイミング、台詞010/018のroute mappingである。
