# 横川AI Phase 4 要件定義書
## v0.4.0 — 脚本・演出データ対応版

## 1. 文書の目的

本書は、`yokogawa_ai` の Phase 4 / v0.4.0 における要件を定義する。

Phase 3 / v0.3.0 までに、LAN上のAdmin / Server / 複数Display、本番モード、Preflight、required / optional Display、Audio Ready、Audio Master、Cue / Scene、NEXT / BACK / REPLAY / STOP、Broadcast / individual / target group、Free Speak、Show Reset、再接続 / 状態同期、二重操作抑止、ローカルQR / 複数NIC / Display識別、History、Browser TTS Provider境界が完成している。

Phase 4では、このShow Control基盤を維持しつつ、現在進行中の脚本・演出制作を安全に取り込めるよう、Cueを「単なる読み上げ」から「演出イベント」へ拡張する。

また、横川AIの観客向け表現として、通常・異常検知・乗っ取り・暴走・停止・復旧を表現できるPresentation Presetを導入する。さらに、軽量なローポリ風アバターを表示し、音声に合わせた簡易リップシンクを行えるようにする。

---

# 2. Phase 4のテーマ

> 脚本と演出を、コードへ直接埋め込まず、データとして安全に載せられるShow Controlへ拡張する。

Phase 4では、Cue、Presentation Preset、Avatar、Audio、Show File、Rehearsal Logを分離し、脚本改稿や演出変更へ追従できる構造を作る。

---

# 3. 現在の脚本・演出上の前提

Phase 4設計では、横川AIが以下の役割を持つことを想定する。

1. 工大祭の体験授業で、正常なAIとして観客と会話する
2. 虎谷によって乗っ取られたAIとして、観客を謎解きへ誘導する
3. プリンキピアのセキュリティや異常アクセスと関係するシステムとして見せる
4. 物語中盤以降で、異常・乗っ取り・暴走状態を視覚的に表現する
5. 終盤で停止・復旧の対象となる

ただし、以下は脚本上まだ確定していないためPhase 4で固定しない。

- プリンキピア解除の謎と横川AI緊急停止の謎の最終的な順序
- 暴走状態への正確な遷移タイミング
- 横川AIが各シーンで話す最終セリフ
- 各Cueの最終配信先
- 暴走の原因を画面上でどこまで説明するか
- 横川AIの緊急停止コード等の具体的な劇中ロジック

---

# 4. Phase 4で実装する主要機能

1. Cue Schema v2
2. Presentation Preset基盤
3. Display-only / Speech-only / Clear / Blackout Cue
4. ローカル音声ファイル対応
5. Show File Import / Export / Validation
6. 稽古ログ・Cue時刻Export
7. 本番モードのキーボードショートカット
8. 軽量ローポリ風横川AIアバター
9. 簡易リップシンク
10. 通常 / 異常 / 乗っ取り / 暴走 / 停止 / 復旧の初期Presentation Preset
11. 演出アセットのローカル管理
12. Phase 3との後方互換

---

# 5. スコープ外

Phase 4では以下を必須実装しない。

- 高精度3Dモデル / WebGL必須化
- 全身アバター
- モーションキャプチャ
- 音素単位の高精度リップシンク
- Face Tracking / カメラ入力
- VOICEVOX本導入
- クラウド音声生成
- LLMによる自律会話
- 犯人や謎の自動判定
- 観客端末との双方向連携
- 実際の大学設備・施錠・セキュリティ制御
- 横川役の各演者本人に似せた2種類のアバター
- 本番脚本の全Cue登録
- 完成版の最終アートディレクション

VOICEVOXや録音音声は、Phase 4のローカル音声ファイル機能へ後から追加可能な設計とする。

---

# 6. 基本設計原則

## 6.1 Phase 3を壊さない

以下を維持する。

- Admin / Display / Server構成
- Audio Master
- Preflight
- required / optional Display
- target group
- Free Speak
- History
- Show Reset
- reconnect / state sync
- Browser TTS Provider
- LAN / QR
- Render互換方針
- Phase 3本番モード

## 6.2 演出とロジックを分離する

```text
Cue
  ├─ 何を話すか
  ├─ 何を表示するか
  ├─ どのPresentation Presetを使うか
  ├─ どのAvatar状態を使うか
  └─ どこへ送るか

Presentation Preset
  ├─ 背景
  ├─ UI
  ├─ Avatar表示
  ├─ 警告表示
  └─ Animation
```

Cue本文へCSSやHTMLを直接埋め込まない。

## 6.3 ローカル完結

Avatar、Audio、Preset、QR、Show File、Rehearsal Logは公演中インターネット不要とする。

---

# 7. Cue Schema v2

## FR-401 Cue Schema v2

Cueを「発話命令」ではなく「演出イベント」として扱う。

最低限以下を持てること。

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

### route

例: `common`, `ougi`, `toratani`, `yokogawa`。値はユーザーが追加可能。

### scene

文字列またはID。例: `scene-1`, `scene-4`, `finale`。

### location

表示用メタデータ。例: `7-201`, `2F lounge`, `4F`。Display IDとは分離する。

### speechText

AIが発話する本文。空文字可。

### displayText

観客画面へ表示する本文。`speechText` と異なる内容を指定可能。空文字可。

### operatorNote

観客には表示せず、本番オペレーターだけが確認するメモ。

### triggerNote

GO条件・きっかけ。例: `白山「横川教授、お願いします」の後`。

### kind

最低限:

- `speech-display`
- `speech-only`
- `display-only`
- `clear`
- `blackout`
- `preset-only`

### 後方互換

v0.3.0以前のCueをSchema v2へnormalizeする。既存Cueは原則 `speech-display`、`speechText = oldText`、`displayText = oldText` として移行可能。

---

# 8. Presentation Preset基盤

Displayの見た目・状態をデータとして切り替えられるようにする。

Presetは一意IDと表示名を持ち、最低限以下を設定可能とする。

- background
- foreground
- accent
- panel style
- status label
- subtitle visibility
- subtitle placement
- avatar visibility
- avatar state
- overlay
- noise / scanline / glitch intensity
- motion intensity
- optional message
- optional system code

CueからPresetを指定可能。`preset-only` Cueでは発話・字幕を変更せずPresetだけ切り替える。

現在PresetはServer authoritative stateとして保持し、Admin / Display再接続後に同期する。Preset変更で過去音声を再生しない。

---

# 9. 初期Presentation Preset

v0.4.0では、実際に見た目の差が分かる初期演出版を実装する。

## normal

- 研究用AI
- 落ち着いた教授AI
- 高い知性
- 権威はあるが威圧的すぎない
- 横川本人ではなく「横川AI」という独立したシステム人格
- 表示例: `YOKOGAWA AI / SYSTEM ONLINE`

## warning

- normalの世界観を維持
- 異常検知
- 軽度ノイズ
- 注意色・status変化

## hijacked

- UIに侵入・乗っ取り感
- 一部表示崩れ
- glitch可
- 同じシステムが侵入されたと分かる

## hostile

- 暴走状態
- normalから明確に異なる
- 警告感
- 横川AIの人格が乗っ取られた印象
- 字幕・重要情報の可読性は維持

## shutdown

- AI停止
- 無音
- Avatar非表示または停止状態
- 黒を中心とする
- 完全なブラウザ真っ黒と区別できる最小限の状態表示を許容

## recovery

- 再起動 / 復旧中
- 徐々にnormalへ戻る印象
- 演出時間は設定可能

---

# 10. 光刺激・安全性

- 高速ストロボを標準使用しない
- 点滅は原則3Hz未満
- 激しい全画面白黒反転を連続させない
- `reducedMotion`設定を用意
- Presetごとにmotion intensityを持てる

---

# 11. 横川AIアバター

## キャラクター方向性

現行キャラクター設定を基準に:

- 横川 千寿
- 60歳
- 教授
- セキュリティ / 情報系
- 社会的評価・権威が高い
- 落ち着きと知性
- 横川AIは教授本人そのものではなく、教授をモチーフとしたAI人格

ダブルキャストのため、特定の演者本人へ似せない。

## 見た目

- ローポリ風
- 軽量
- 顔中心、または顔＋肩程度のパペット風バストアップ
- 全身不要
- 遠目でも口の開閉が分かる
- normalでも不気味になりすぎない

## 標準実装方式

軽量2D / SVGベースのローポリ風アバターを標準とする。WebGL / true 3Dを必須にしない。

Avatarアセットはローカル保持し、将来SVG/PNG等へ差し替え可能な構造とする。

## 状態

最低限:

- normal
- warning
- hijacked
- hostile
- shutdown / hidden
- recovery

## Idle Animation

任意だが推奨:

- わずかな上下動
- まばたき
- 微小な首 / パペット揺れ

過度な動きは不要。

---

# 12. 簡易リップシンク

高精度音素解析は不要。音の大きさに応じて口が開閉すればよい。

## Mouth State

最低限:

- closed
- half
- open

## Audio File

ローカル音声ファイル再生時はWeb Audio API等を利用し、実際の音量から口状態を決定する。

## 平滑化

以下相当を実装する。

- smoothing
- attack / release
- hysteresis
- minimum hold time

## Browser TTS

SpeechSynthesisの実波形取得を必須にしない。Browser TTS時はspeaking状態中の擬似開閉等による`simulated lip sync`を実装する。

## lipSyncMode

- `none`
- `simulated`
- `audio-reactive`

Avatar非表示時は不要なanimation / analyser処理を停止する。

---

# 13. ローカル音声ファイル対応

Cueは最低限以下を指定可能。

```text
speechMode = browser-tts | audio-file | none
```

`audio-file` はローカル音声アセットIDを参照する。

- 最低限WAVまたはMP3をサポート
- インターネット不要
- 実音声はAudio Masterのみ再生
- non-master Displayは音声を鳴らさない
- STOP対応
- REPLAY対応
- missing audioをPreflight / 実行時に検出

複数DisplayにAvatarを表示する場合、non-master側の口パクも概ね同期して見える構造が望ましい。Serverから再生開始情報やlip stateを配信してよい。大きな音声ストリームをWebSocketで送信しない。

---

# 14. Cue kind動作

## display-only

- displayTextを更新
- 音声なし
- Cue positionは通常通り進む

## speech-only

- 音声を出す
- 観客字幕を変更しない

## clear

- 字幕 / 一時メッセージを消す
- Presetは原則維持

## blackout

- 観客画面を即時ブラックアウト
- 標準ではAudioもSTOP
- 本番モードから緊急操作可能
- 復帰先Preset / displayTextを保持

## preset-only

- Presentation Presetのみ変更
- Cue本文や音声は触らない

---

# 15. CLEAR / BLACKOUT緊急操作

本番モードに安全操作として追加する。

- CLEAR
- BLACKOUT

NEXTと誤操作しない位置へ配置する。BLACKOUTには短い確認、hold操作等の事故防止を検討しつつ、緊急時の即応性も損なわない。

BLACKOUT stateはServer authoritativeとし、Display reconnectでも維持する。解除後は直前のPreset / displayTextへ復元できること。

---

# 16. Show File Import / Export / Validation

Show定義をJSONでExport / Import可能にする。

## schemaVersion

Phase 4標準は `schemaVersion: 2`。

## 含める対象

- metadata
- routes
- scenes
- cues
- target groups
- presentation presets
- avatar config
- asset registry
- relevant show settings

## 含めない対象

- live connection state
- heartbeat
- runtime Audio Ready
- current WebSocket session
- secrets
- OS固有絶対パス

## Validation

Import前に最低限以下を確認。

- schema version
- required fields
- duplicate IDs
- invalid target
- invalid target group
- missing preset
- missing avatar state
- missing audio asset
- invalid cue kind
- broken reference
- legacy migration可否

Import前にerrors / warnings / 変更対象件数をDry Run表示する。

Validation errorがある場合、現在Showを部分的に破壊しない。可能なら適用前snapshot / backupを持つ。

---

# 17. 演出アセット管理

Asset Registryまたは同等構造で最低限以下を扱う。

- audio
- avatar
- optional image
- optional overlay

Asset IDとローカルパスを分離し、Cueは可能な限りAsset IDを参照する。

`../` 等によるpath traversal、絶対パス、public asset root外への参照を防止する。

---

# 18. 稽古ログ・Cue時刻Export

Historyを公演分析へ利用できる形に拡張する。

最低限記録:

- timestamp
- elapsed show time
- action
- cue id
- cue name
- route
- scene
- location
- target
- preset
- speech mode
- success / warning / failure

NEXT / BACK / REPLAY / STOP / CLEAR / BLACKOUT / preset change / Free Speak等を記録する。

「Rehearsal Session」を開始でき、開始時刻を0秒としてelapsed timeを記録する。

Export:

- CSV
- JSON

Cue間隔・Scene滞在時間を後から計算可能な情報を持つ。

---

# 19. 本番モードのキーボードショートカット

最低限:

- `Space` = NEXT
- `R` = REPLAY
- `Esc` = STOP

推奨:

- `B` = BACK
- `C` = CLEAR

BLACKOUTには単一キーを割り当てず、誤操作防止を優先してよい。

次の場合は無効化する。

- input / textarea / select / contenteditableへフォーカス中
- modifier key押下中
- key repeat

shortcut一覧を本番モードで確認でき、設定で無効化できること。

---

# 20. 本番モード拡張

本番モードで最低限以下を確認可能。

- route
- scene
- location
- current cue
- next cue
- current preset
- avatar state
- speech mode
- audio asset status
- triggerNote
- operatorNote
- target
- Display / Audio warnings

`operatorNote` / `triggerNote`は観客Displayへ送らない。

triggerNoteは本番中に見つけやすい位置へ表示する。

---

# 21. Preflight拡張

Phase 4では以下も確認する。

- Show File schema valid
- Cue reference valid
- Presentation Preset exists
- Avatar asset exists
- Audio asset exists
- required audio file playable
- target group valid
- required Display online
- Audio Master online / ready

使用中Cueを中心に判定し、disabled Cueのmissing assetはWARNING扱いでもよい。

---

# 22. Display同期

DisplayはServer stateから以下を同期する。

- current preset
- current displayText
- avatar state
- avatar visibility
- blackout state
- relevant animation state

Display再接続時に現在の見た目を復元し、過去音声は再生しない。blackout状態も復元する。

---

# 23. Performance要件

- 標準AvatarでWebGL必須にしない
- SVG / CSS / Canvas 2D等を優先
- Avatar非表示時はanimation処理を抑える
- glitch / noiseでCPU使用率を不必要に上げない
- Admin 1 + Display 3の30分試験を実施
- v0.3.0から著しいRSS増加・イベント失敗増加を起こさない

---

# 24. UI設計

## Admin

- Phase 3本番モードを維持
- Current / Next Cue中心
- triggerNoteを明確表示
- operatorNoteは補助
- Preset / Avatar / Audio状態を確認
- CLEAR / BLACKOUTはNEXTと分離
- shortcut一覧表示
- Show File管理は詳細操作へ

## Display

normal時:

- 横川AIローポリ風Avatar
- AIシステムUI
- 字幕
- 過剰なキャラクターアニメーションは避ける

hijacked / hostile時:

- 同じUIが崩壊・乗っ取られた連続性
- 完全に別作品のような見た目へ飛ばさない
- Avatarも「同じ横川AIが異常化した」ことが分かる

---

# 25. Avatarデザイン要件

初期アバターは以下を満たす。

- 中高年男性教授を想起
- 知的
- 権威感
- 極端な悪役顔にしない
- 特定演者に似せない
- ローポリ / facetedな面構成
- 顔または胸上
- 口の形が遠目で判別可能
- 目・眉・口など最小限の表情差分
- normalからhostileまで同一人物として連続性
- SVG等で軽量

---

# 26. Audio Zoneについて

Phase 4では従来のGlobal Audio Master 1台を維持する。

複数会場で独立して音声を鳴らすAudio Zoneは将来候補とし、v0.4.0受入条件には含めない。ただし音声責務を将来拡張不能な形へ過度に密結合させない。

---

# 27. テスト要件

## 既存回帰

Phase 3既存テストを全PASS。

## 新規自動テスト

### Cue Schema v2
- legacy migration
- speechText != displayText
- operatorNote非配信
- triggerNote非配信
- route / scene / location保持
- cue kind validation

### Presentation Preset
- create / update / delete
- invalid reference
- preset-only
- reconnect sync

### Cue kind
- speech-display
- speech-only
- display-only
- clear
- blackout
- preset-only

### Audio
- browser-tts
- audio-file
- missing asset
- STOP
- REPLAY

### Lip Sync
- audio-reactive state transition
- simulated
- none
- silence closes mouth

### Show File
- export
- valid import
- invalid import atomic rejection
- duplicate ID
- missing preset
- missing asset
- legacy migration

### Rehearsal Log
- session
- timestamps
- CSV
- JSON

### Shortcut
- Space
- R
- Esc
- input focus suppression
- key repeat suppression

---

# 28. ブラウザ実機テスト

最低:

- Admin 1
- Display 3
- Chrome desktop
- Chrome 390x844相当

確認Scenario:

1. normal preset
2. normal Avatar
3. Browser TTS + simulated lip sync
4. local audio + audio-reactive lip sync
5. speechText/displayText別内容
6. display-only
7. speech-only
8. preset-only
9. warning
10. hijacked
11. hostile
12. shutdown
13. recovery
14. clear
15. blackout
16. blackout reconnect
17. Display reconnect
18. Admin reconnect
19. Show File export
20. valid import
21. invalid import rejection
22. rehearsal session
23. CSV export
24. JSON export
25. Space NEXT
26. R REPLAY
27. Esc STOP
28. input focus shortcut無効
29. Audio asset missing
30. reduced motion

目視確認:

- Avatarが遠目でも認識可能
- 口開閉が不自然に高速でない
- normal / hostileの差が分かる
- hostileでも文字が読める
- 390×844で本番操作可能
- 横スクロールなし
- operatorNoteがDisplayへ漏れない

---

# 29. 長時間試験

30分、Admin 1 + Display 3。

Phase 3内容に加え:

- preset changes
- Avatar states
- audio-file
- simulated lip sync
- audio-reactive lip sync
- CLEAR
- BLACKOUT
- recovery
- rehearsal log
- shortcut相当action
- reconnect

記録:

- duration
- event count
- failures
- reconnect count
- audio events
- avatar events
- preset events
- blackout events
- RSS start/end/delta
- CPU参考値が取れるなら記録
- abnormal exit

---

# 30. Security要件

- Show File importを信頼しすぎない
- HTML injection防止
- displayText / speechTextを安全に描画
- local asset path traversal防止
- MIME / extension検証
- malformed JSON rejection
- oversized fileへの合理的制限
- unknown preset / assetの安全な失敗
- operatorNote / triggerNoteをDisplayへ送らない

---

# 31. README要件

v0.4.0へ更新し、最低限以下を記載。

- Cue Schema v2
- Cue kinds
- speechText / displayText
- operatorNote / triggerNote
- route / scene / location
- Presentation Preset
- normal / warning / hijacked / hostile / shutdown / recovery
- Avatar
- Lip Sync
- Browser TTS vs local audio
- Show File
- Asset管理
- Rehearsal Log
- Keyboard shortcuts
- CLEAR / BLACKOUT
- Phase 4スコープ外
- Phase 3互換
- 本番設営手順

---

# 32. VERIFICATION要件

Phase 4検証正本を追加し、自動テスト、Browser test、Avatar、lip sync、local audio、Show File、log export、shortcuts、LAN、30分soak、npm audit、acceptance criteriaを事実ベースで記録する。

---

# 33. Git / Version

- v0.3.0を変更しない
- Phase 4実装開始前にv0.3.0位置確認
- working tree確認
- 意味のあるcommit
- full test
- docs
- clean
- push
- 完成条件を満たした場合のみ `v0.4.0` annotated tagを作成・push

---

# 34. Phase 4 受入条件

以下をすべて満たしたときv0.4.0完成とする。

1. Phase 3既存機能維持
2. Phase 3既存テスト全PASS
3. Cue Schema v2実装
4. speechText対応
5. displayText対応
6. speechTextとdisplayTextを別内容にできる
7. operatorNote対応
8. triggerNote対応
9. route対応
10. scene対応
11. location対応
12. legacy Cue migration
13. speech-display対応
14. speech-only対応
15. display-only対応
16. clear対応
17. blackout対応
18. preset-only対応
19. Presentation Preset基盤
20. normal preset
21. warning preset
22. hijacked preset
23. hostile preset
24. shutdown preset
25. recovery preset
26. current preset server authoritative
27. reconnect後preset復元
28. reducedMotion対応
29. Avatar表示
30. Avatarが特定演者依存でない
31. ローポリ風
32. 軽量2D / SVG等で動作
33. normal avatar
34. warning / hijacked相当avatar
35. hostile avatar
36. shutdown / hidden
37. recovery
38. mouth closed
39. mouth half
40. mouth open
41. simulated lip sync
42. audio-reactive lip sync
43. 無音でmouth closed
44. lip sync smoothing
45. avatar hidden時負荷抑制
46. browser-tts維持
47. audio-file対応
48. local WAVまたはMP3再生
49. Audio Masterのみ実音声
50. STOPがaudio-fileへ効く
51. REPLAYがaudio-fileへ効く
52. missing audio検知
53. Asset Registryまたは同等構造
54. path traversal対策
55. Show File schemaVersion
56. Show File export
57. Show File import
58. Import validation
59. invalid import atomic rejection
60. duplicate ID検出
61. missing preset検出
62. missing asset検出
63. current Showを破壊せずdry-run確認
64. rehearsal session
65. elapsed show time
66. Cue timestamp記録
67. CSV export
68. JSON export
69. NEXT shortcut
70. REPLAY shortcut
71. STOP shortcut
72. input focus時shortcut無効
73. key repeat二重実行防止
74. shortcut無効化設定
75. CLEAR本番操作
76. BLACKOUT本番操作
77. BLACKOUT reconnect復元
78. operatorNoteがDisplayへ漏れない
79. triggerNoteがDisplayへ漏れない
80. Phase 4 Preflight
81. invalid cue reference検知
82. invalid preset reference検知
83. required audio asset確認
84. Admin 1 + Display 3実ブラウザ検証
85. Chrome desktop確認
86. 390×844確認
87. 横スクロールなし
88. LAN別端末確認
89. 30分soak完了
90. soak failures = 0
91. abnormal exitなし
92. npm audit重大脆弱性なし
93. README更新
94. VERIFICATION更新
95. Phase 4検証記録作成
96. working tree clean
97. remote push済み
98. v0.4.0 annotated tag
99. v0.3.0 tag不変
100. Phase 4スコープ外機能を不用意に本番依存へしない

---

# 35. Phase 4完了時の状態

Phase 4完了時点では、

> 横川AIの脚本・セリフ・画面演出・ローカル音声・アバター・暴走表現を、コードを書き換えずShowデータとして調整できる

状態を目指す。

その後は、実際のセリフ、Cue順、各Cueの場所・配信先、最終アバターデザイン、最終音声、最終暴走演出、テクニカルリハーサルでのタイミングを作品制作側で詰める。
