# Codex 実装プロンプト
## 横川AI Phase 4 / v0.4.0 — 脚本・演出データ対応版

あなたは `yokogawa_ai` リポジトリの Phase 4 / v0.4.0 を、設計、実装、テスト、ブラウザ検証、長時間試験、ドキュメント更新、Git整理、push、tag作成まで自律的に完了してください。

今回の目的は、

> Phase 3で完成した本番Show Controlへ、脚本・演出・ローカル音声・軽量Avatar・暴走画面を安全に載せられるデータ駆動型の演出基盤を追加すること

です。

派手なデモを作ること自体ではなく、脚本が今後変更されても壊れにくい構造を優先してください。

---

# 0. 最初に読むもの

必ず以下を確認してください。

1. `yokogawa_ai_phase4_requirements.md`
2. Phase 3要件定義書
3. Phase 3実装プロンプト
4. `README.md`
5. `VERIFICATION.md`
6. `docs/phase-3/verification.md`
7. `package.json`
8. Server
9. Admin UI
10. Display UI
11. WebSocket protocol
12. state/storage
13. Cue model
14. Scene model
15. target group
16. Audio Master
17. TTS adapter
18. tests
19. soak test
20. Git log / tags / remote

ファイル名が異なる場合はリポジトリ内を調べて特定してください。

---

# 1. Goal

利用可能ならGoalを設定してください。

> Phase 4 / v0.4.0として、Cue Schema v2、Presentation Preset、Cue kind、ローカル音声、Show File、稽古ログ、ショートカット、軽量ローポリ風Avatar、簡易lip sync、通常/暴走系画面を実装し、Phase 3を壊さず100項目の受入条件まで検証し、remote pushとv0.4.0 annotated tagまで完了する。

ユーザーへの途中確認は原則不要です。合理的な判断が可能なことは自律的に決めてください。

---

# 2. Phase 3を基準にする

最初に `git status`, `git log`, `git tag`, `git remote -v` を確認し、`v0.3.0` とユーザー報告の完成コミット `34c2529` を確認してください。

存在しない場合は、実際のGit履歴をsource of truthとして扱い、勝手に履歴を書き換えないでください。

既存 `v0.3.0` tagは変更しないでください。

Phase 3の既存自動テストを実装前に実行してください。

---

# 3. 設計思想

```text
Show
 ├─ Cue
 ├─ Preset
 ├─ Avatar
 ├─ Assets
 ├─ Targets
 └─ Settings

Runtime
 ├─ Current Cue
 ├─ Current Preset
 ├─ Display connections
 ├─ Audio Master
 ├─ Audio Ready
 └─ Blackout
```

CueへHTML/CSS/JSを直接埋め込まないでください。演出定義とランタイム状態を分離してください。

---

# 4. 実装順序

## Stage A — Phase 3監査

- full tests
- state schema
- Cue schema
- Display render
- Audio Master behavior
- reconnect
- Preflight
- History
- Admin show mode

を理解してください。

## Stage B — Cue Schema v2

最低フィールド:

```text
id
name
enabled
route
scene
location
kind
speechText
displayText
operatorNote
triggerNote
target
presentationPreset
avatar
audio
```

Phase 3 Cueを安全にnormalizeしてください。既存Cueのtext等は原則:

```text
kind = speech-display
speechText = oldText
displayText = oldText
```

へ変換。

既存stateを書き換える場合はバックアップしてください。

## Stage C — Cue kinds

- speech-display
- speech-only
- display-only
- clear
- blackout
- preset-only

kind処理を巨大if文の寄せ集めにせず、Cue execution pipelineとして整理してください。

---

# 5. Presentation Preset

Presetをfirst-class modelにしてください。CueからPreset IDを参照します。

最低初期Preset:

- normal
- warning
- hijacked
- hostile
- shutdown
- recovery

これらは実際に画面差が分かる状態まで作ってください。ただし最終デザイン確定版ではありません。

### normal
- 研究AI
- 知的
- 落ち着いた教授的雰囲気
- 横川AIの基準デザイン

### warning
- normalの世界観を維持しつつ異常検知

### hijacked
- 同じシステムが侵入されたことが分かる

### hostile
- 暴走。文字可読性を維持

### shutdown
- 停止

### recovery
- 復旧

過度なストロボは禁止。標準で3Hz以上の全画面点滅を実装しないでください。`reducedMotion`を実装してください。

---

# 6. 横川AI Avatar

今回、Avatarの初期制作まで行ってください。

## 6.1 方向性

- 横川 千寿
- 60歳男性教授
- 情報 / セキュリティ系
- 権威と知性
- 落ち着き
- 世界的評価を受ける人物像

ただしダブルキャストのため、どちらの演者本人にも似せないでください。

「横川教授をモチーフに作られた横川AI」という独立したキャラクターにしてください。

## 6.2 見た目

- low-poly / faceted
- 顔中心
- 必要なら肩まで
- puppet-likeでもよい
- 全身不要
- projectorで遠目でも口が見える
- normal時に怖くしすぎない

## 6.3 技術

標準はSVG / CSS / Canvas 2D等。true 3DやWebGLを必須にしない。

SVGの場合、polygon / pathを少数利用し、mouth partsを差し替え可能にし、eye / brow / overlay程度の状態変化を可能にしてください。

外部画像サービス、CDN、クラウド生成をruntimeに使わない。

## 6.4 Asset差し替え

将来デザイナーが作ったSVG/PNG等へ置き換えられる構造にしてください。

---

# 7. Avatar states

最低限:

- normal
- warning
- hijacked
- hostile
- shutdown / hidden
- recovery

PresetとAvatar stateは連動可能。ただし将来独立指定できる柔軟性を残してください。

---

# 8. Lip Sync

高精度リップシンクは不要です。

mouth state:

- closed
- half
- open

ローカル音声ではWeb Audio API `AnalyserNode`等で音量解析。RMSや平均振幅等の合理的な手法で構いません。

最低限 smoothing、threshold hysteresis、attack/release、minimum mouth state duration 相当を設け、口が高速でチラつかないようにしてください。

Browser TTSではSpeechSynthesisの実波形を無理に取得せず、`simulated` lip syncを実装してください。

modes:

```text
none
simulated
audio-reactive
```

---

# 9. ローカル音声

Cueで:

```text
speechMode = browser-tts | audio-file | none
```

を指定可能にしてください。

Audio assetをID参照できる構造が望ましいです。

実音声はAudio Masterだけ。non-masterで同じaudioを鳴らしてはいけません。

複数DisplayでAvatarを表示する場合、口だけは概ね同期して見える方が望ましいです。可能ならServerからplayback start / playback state / lip state等を配信してください。ただし同期のために大きな音声ストリームをWebSocketで送らないでください。

完全なフレーム同期はPhase 4では必須ではありません。

---

# 10. Asset Registry

以下を扱える軽量registryを作ってください。

- audio
- avatar
- optional visual assets

例:

```json
{
  "id": "voice-normal-001",
  "type": "audio",
  "path": "assets/audio/voice-normal-001.wav"
}
```

`../`、absolute path、asset root外参照を許さないでください。

---

# 11. Show File

Show定義をJSONでExport / Import。

Include:

- metadata
- routes
- scenes
- cues
- target groups
- presets
- avatar config
- asset registry
- relevant show settings

Exclude:

- live sockets
- heartbeat
- transient Audio Ready
- OS absolute paths
- secrets

Phase 4標準 `schemaVersion = 2`。

Import前にdry-runし、malformed JSON、unsupported schema、duplicate IDs、broken cue target、broken group、broken preset、broken asset、unsupported cue kind、invalid audio config、invalid avatar stateを確認。

Validation failure時は既存Showを変更しない。Importはatomicに近い方式で適用。

---

# 12. Show File UI

Admin詳細操作に:

- Export Show
- Import Show
- Validate
- Apply

を用意。

Import時はErrors / Warnings / Cues / Presets / Assets等の件数を表示するとよいです。

---

# 13. Rehearsal Session

Historyを壊さず、稽古分析用Session概念を追加してください。

Start SessionをT0とし、以下を記録:

- timestamp
- elapsed
- action
- cue
- route
- scene
- location
- target
- preset
- speechMode
- result

Export:

- CSV
- JSON

日本語Excel等を考慮し、CSVにUTF-8 BOMを採用しても構いません。

---

# 14. Keyboard Shortcuts

本番モード:

```text
Space = NEXT
R     = REPLAY
Esc   = STOP
B     = BACK
C     = CLEAR
```

BLACKOUTに危険な単一ショートカットを割り当てる必要はありません。

次の場合無効:

- input / textarea / select / contenteditable
- modifier key
- key repeat

既存action ID / server duplicate suppressionも活用してください。

---

# 15. 本番モード改修

Current Cueに:

- Cue name
- route
- scene
- location
- speechText
- displayText
- target
- preset
- avatar
- audio
- triggerNote
- operatorNote

を表示。

Next Cueも主要項目を表示。

triggerNoteは本番中に見つけやすい位置へ。operatorNoteはそれより優先度低め。

CLEAR / BLACKOUT / Show ResetをNEXT付近に密集させないでください。

---

# 16. Preflight改修

Phase 4用:

- Cue schema valid
- preset references
- asset references
- audio playable
- avatar available
- target valid
- required Displays
- Audio Master
- Audio Ready

disabled Cueは本番未使用ならWARNINGでもよい。

---

# 17. Display rendering

Display側をcomponent的に整理してください。

推奨:

```text
DisplayRoot
 ├─ Background
 ├─ SystemChrome
 ├─ Avatar
 ├─ Overlay
 ├─ Subtitle
 └─ Blackout
```

Vanilla構成維持で構いません。React等への全面移行は不要です。

---

# 18. CLEAR / BLACKOUT

CLEARは字幕を消しPreset維持。

BLACKOUTは最上位layerで画面を黒くし、AudioをSTOP。BLACKOUT stateをServer authoritativeにし、Display reconnectでも黒を維持。

解除操作を必須とし、解除後は元のPreset / displayTextを復元できること。

---

# 19. Browser visual verification

実ブラウザで確認してください。既存環境でPlaywright等が使えるなら利用して構いません。

最低:

- Desktop: Admin + Display 3
- Mobile Admin: 390 x 844

normal → warning → hijacked → hostile → shutdown → recovery を通しで確認。

自己批評:

- 同じAIの状態変化に見えるか
- normalが不気味すぎないか
- hostileが弱すぎないか
- 字幕が読めるか
- Avatar口が小さすぎないか
- lip syncが高速点滅しないか
- warningがhostileと区別できるか

問題があれば自分で修正してください。

---

# 20. Avatar visual self-review

以下を満たすまで調整。

- 中高年教授の印象
- low-poly
- 顔中心
- projector向き
- actor-specificでない
- normal / hostileの同一人物感
- mouth closed/half/open差が明確
- SVG等が過度に重くない

美術的な完璧さより、公演で読み取れることを優先。

---

# 21. Audio test

ローカルtest audio assetを用意して構いません。ただし著作権上問題のない自作test fixture等を使用してください。

Test:

- audio file
- STOP
- REPLAY
- lip sync
- missing file
- non-master silent

---

# 22. Automated tests

Phase 3 existing tests + Phase 4 tests。

最低:

- schema migration
- Cue kinds
- Presets
- Avatar state
- Audio
- lip sync state logic
- Show File
- validation
- Asset security
- Rehearsal Log
- shortcuts
- blackout restore
- reconnect

既存テストを削除してPASS数だけ合わせることは禁止。

---

# 23. Soak test

30分、Admin 1 + Display 3。

Phase 3のsoak内容に加え:

- preset changes
- Avatar states
- audio-file
- simulated lip sync
- audio-reactive state
- CLEAR
- BLACKOUT
- recovery
- rehearsal log
- shortcuts相当action
- reconnect

記録:

- duration
- events
- failures
- reconnects
- preset changes
- audio events
- blackout count
- memory
- abnormal exit

failureが出たら修正して再実行してください。

---

# 24. npm audit / security

既存プロジェクト方針に合わせて `npm audit --omit=dev` 等を実施。

特に:

- Show File JSON injection
- path traversal
- display HTML injection
- arbitrary filesystem read
- unsafe file upload

を確認。

---

# 25. README

初見の公演スタッフにも使えるよう更新。

追加章:

- Cue Schema v2
- Presentation Presets
- Avatar
- Lip Sync
- Local Audio
- Show File
- Rehearsal Log
- Keyboard Shortcuts
- Clear / Blackout
- Asset Directory
- Preflight
- Troubleshooting

Troubleshooting例:

- Avatarが出ない
- audio file missing
- lip syncしない
- Browser TTSではaudio-reactiveにならない
- blackoutから戻らない
- Show File import error
- preset missing

---

# 26. VERIFICATION

`docs/phase-4/verification.md` 等へPhase 4検証正本を作成。

100項目受入条件をPASS / FAIL / N/Aと証拠付きで整理。N/Aを乱用しない。

---

# 27. Git

意味のあるcommit例:

1. Cue schema v2
2. presentation presets
3. avatar / lip sync
4. local audio
5. show file
6. rehearsal logging
7. show mode / shortcuts
8. tests
9. docs

無意味に細分化しすぎなくてよい。

完成時:

- tests PASS
- browser PASS
- mobile PASS
- LAN PASS
- soak PASS
- npm audit OK
- docs
- clean
- push

を確認後のみ `v0.4.0` annotated tagを作成・push。

---

# 28. 重要な禁止事項

- v0.3.0 tagを書き換えない
- 既存Historyを消さない
- Phase 3機能を簡略化して削らない
- Avatarのためだけに巨大フレームワークへ移行しない
- WebGL必須にしない
- runtimeでCDNへ依存しない
- 演者本人に似せた顔を勝手に作らない
- 脚本未確定事項をhard-codeしない
- `speechText`と`displayText`を常に同じに固定しない
- operatorNote / triggerNoteをDisplayへ送らない
- Browser TTSから無理に音声波形取得するhackへ依存しない
- aggressive flashingを実装しない
- Show Fileから任意ローカルファイルを読ませない

---

# 29. 完了報告

最後に以下をまとめてください。

1. Phase 4実装概要
2. Cue Schema v2
3. Cue kinds
4. Presets
5. Avatar仕様
6. Lip Sync
7. Local Audio
8. Show File
9. Rehearsal Log
10. Shortcuts
11. Preflight
12. automated tests結果
13. browser結果
14. mobile結果
15. Admin 1 + Display 3
16. LAN確認
17. soak結果
18. npm audit
19. README / VERIFICATION
20. acceptance 100項目
21. commits
22. remote
23. tag
24. working tree
25. 実会場で残る確認
26. Phase 5以降へ残したもの

---

# 30. 完成定義

`yokogawa_ai_phase4_requirements.md` の100受入条件をすべて確認し、合理的にPhase 4が完成していること。

今回のゴールは、

> 横川AIの脚本・セリフ・画面・音声・Avatar・暴走演出を、コードを書き換えずShowデータとして変更できる状態

です。

ユーザー確認を待たず、可能な範囲を最後まで自律的に進めてください。
