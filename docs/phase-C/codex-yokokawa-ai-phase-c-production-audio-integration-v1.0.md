# Codex実装指示 — 横川AI Phase C Production Audio Integration v1.0

Repository local path:

```text
C:\Users\kumes\Documents\yokokawa_ai
```

Repository:

```text
Soki0909/yokokawa_ai
```

このタスクでは、Voice Labで正式採用した **Candidate 2A** を
`yokogawa-professor-v1` としてProductionへ統合してください。

---

# 0. 最重要方針

Voice Profileの選定は完了しています。

今回の目的は、

```text
Voice Lab
→ selected-profile確定
→ Production Voice Profile固定
→ Scripted WAV
→ Local TTS
→ Free Speak
→ Preflight
→ Production Show Audio Integration
→ 実ブラウザ/回帰検証
```

までを実装することです。

一方、今回はまだ以下を実装しません。

```text
HIJACKED用jamming DSP
HOSTILE用voice DSP
SHUTDOWN用voice effect
声質を状態ごとに別人格化する処理
LLM連携
クラウドTTS
```

まず **加工前の同一Voice ProfileをProductionへ正しく統合すること** を優先してください。

Phase Bで完成・承認済みのVisualは変更しないでください。

---

# 1. 作業開始前の必須確認

最初に必ず実repositoryを確認してください。

```powershell
cd C:\Users\kumes\Documents\yokokawa_ai

git status
git branch --show-current
git rev-parse HEAD
git log -5 --oneline
```

次を最初から最後まで読んでください。

```text
package.json
README.md

docs/phase-B/verification.md
docs/phase-C/production-integration-plan.md

experiments/voice-lab/config/selected-profile.json
experiments/voice-lab/README.md
experiments/voice-lab/ROUND-2.md

experiments/voice-lab/config/model.json
experiments/voice-lab/config/candidates.json
experiments/voice-lab/scripts/**
```

Voice Lab実装をProductionへ直接importするのではなく、
Voice Labで得た設計・検証結果を理解してからProduction用に実装してください。

---

# 2. Source of Truth優先順位

このタスクでは次の順番を厳守してください。

## 1位

```text
experiments/voice-lab/config/selected-profile.json
```

これが **採用Voice Profileの正本** です。

## 2位

```text
experiments/voice-lab/README.md
experiments/voice-lab/ROUND-2.md
```

選定経緯とCandidate 2Aの確認記録です。

## 3位

```text
docs/phase-C/production-integration-plan.md
```

Production統合方針です。

## 4位

現行Productionコード。

## 5位

このPrompt内に記載している数値。

---

# 3. 採用済みVoice Profile

期待値は以下です。

```text
Profile ID:
yokogawa-professor-v1

Model:
阿井田 茂

Style:
Calm

speed:
1.20

pitch:
0.0

intonation:
0.45

tempo dynamics:
0.20

volume:
0.95

output:
44.1 kHz / mono
```

AivisSpeechのfield名に対応させる場合の期待値:

```json
{
  "speedScale": 1.20,
  "pitchScale": 0.0,
  "intonationScale": 0.45,
  "tempoDynamicsScale": 0.20,
  "volumeScale": 0.95,
  "outputSamplingRate": 44100,
  "outputStereo": false
}
```

ただし、

**上記を手入力でProductionへコピーして終わりにしないでください。**

必ず `selected-profile.json` を機械的に読み取り、
実際の構造・値を確認してください。

このPromptと `selected-profile.json` が衝突した場合は、
`selected-profile.json` を優先してください。

Candidate 2Aとの一致検証が既にある場合、その仕組みも壊さないでください。

---

# 4. Git安全性

既存ユーザー作業を破壊しないでください。

禁止:

```text
git reset --hard
git clean -fd
既存変更の破棄
無断stash
masterへのforce操作
```

working treeにVoice Lab選定結果などの未commit変更がある場合、
内容を確認してそのまま保護してください。

安全に可能なら:

```text
phase-c/production-audio
```

のような作業branchを作成してください。

ただしbranch作成のために既存変更を捨ててはいけません。

GitHubへのpush、
masterへのmerge、
release tag作成は今回行いません。

---

# 5. Target Architecture

Phase C Production音声は最終的に次を実現します。

```text
                     ┌─────────────────────────────┐
                     │ yokogawa-professor-v1       │
                     │ selected-profile derived    │
                     └──────────────┬──────────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     │                             │
                     ▼                             ▼
            Scripted Speech                 Free Speak / Emergency
            fixed WAV                       Local TTS
                     │                             │
                     │                       AivisSpeech Engine
                     │                       localhost:10101
                     │                             │
                     └──────────────┬──────────────┘
                                    ▼
                              Audio Master
                                    │
                                    ▼
                               PA / Speaker
```

Production policy:

```text
scripted speech = audio-file
free speak      = local-tts
emergency       = local-tts
browser TTS     = development / legacy / optional only
```

Production標準経路で、
Local TTS失敗時にBrowser Speech Synthesisへ暗黙fallbackしてはいけません。

---

# 6. Local TTSの配置方針

## 採用アーキテクチャ

AivisSpeech Engineは **横川AI Node.js Serverを動かしているPC** に
別途インストール・起動されているものとして扱ってください。

既定:

```text
http://127.0.0.1:10101
```

環境変数:

```text
AIVIS_ENGINE_URL
```

で上書き可能にします。

### 理由

AivisSpeechを各Displayへ要求しないためです。

```text
Admin
 ↓
Node Server
 ↓
AivisSpeech localhost
 ↓
generated WAV buffer
 ↓
same-origin temporary audio endpoint
 ↓
Audio Master Display
 ↓
speaker
```

この構成にしてください。

Display Browserから直接 `127.0.0.1:10101` へアクセスする設計を
Production標準にはしないでください。

これにより:

- CORS依存を避ける
- AivisSpeechは1台だけでよい
- Display PC差をなくす
- Audio Master変更時も同じ声を維持
- TTS Engine固有APIをDisplayへ漏らさない

ことを狙います。

---

# 7. Production Voice Profileの扱い

Voice Labの:

```text
experiments/voice-lab/config/selected-profile.json
```

をRuntimeから直接参照するだけの設計にはしないでください。

Productionは `experiments/` に依存させません。

例えば:

```text
config/
└─ voice-profiles/
   └─ yokogawa-professor-v1.json
```

のようなProduction用snapshotを作ってください。

ただしこれは第2のSource of Truthではありません。

必ず:

```text
selected-profile.json
→ sync / derive
→ yokogawa-professor-v1.json
```

という関係にしてください。

推奨:

```text
scripts/sync-production-voice-profile.mjs
scripts/verify-production-voice-profile.mjs
```

または同等の仕組み。

### 必須

Production snapshotには最低限:

```text
profileId
source
model name
model version
model UUID
speaker UUID
style name
effective parameters
output format
source selected-profile path
source selected-profile hash
generatedAt
```

を記録してください。

数値を人間が二重管理しない構成にしてください。

---

# 8. Production側AivisSpeech Client

Production専用moduleを作ってください。

例:

```text
src/tts/aivis-speech-client.js
src/tts/local-tts-service.js
src/voice-profile.js
```

名称は現行構造に合わせて改善可。

Production moduleから:

```text
experiments/voice-lab/**
```

をimportしてはいけません。

## 必須API

最低限:

```text
GET  /version
GET  /speakers
POST /audio_query
POST /synthesis
```

## Speaker / Style解決

Style IDはhardcode禁止。

必ず:

```text
Speaker UUID
+
Style Name = Calm
```

から `/speakers` を使ってruntime解決してください。

期待Speaker UUID:

```text
561e4e59-3bc9-4726-9028-44a3c12a6f1d
```

Model UUID:

```text
47e53151-a378-46f3-abee-ce13aa07feb1
```

別speakerへfallback禁止。

別styleへfallback禁止。

---

# 9. AudioQueryの扱い

Voice Labと同じ重要ルールをProductionでも維持してください。

```text
rawQuery = POST /audio_query
finalQuery = deep clone(rawQuery)
whitelisted fieldsだけselected profile値でoverride
POST /synthesis(finalQuery)
```

独自schemaでAudioQueryを再構築しないでください。

保持するもの:

```text
accent_phrases
kana
未知のfield
将来追加されたfield
```

Productionでoverrideするfieldは
`selected-profile.json` のeffective profileを基準としてください。

最低限想定:

```text
speedScale
pitchScale
intonationScale
tempoDynamicsScale
volumeScale
outputSamplingRate
outputStereo
```

---

# 10. Runtime Local TTS

Free Speak / Emergency用です。

## 処理

```text
Admin sends text
↓
Server creates message ID
↓
Local TTS Service synthesizes
↓
WAV Buffer generated
↓
bounded runtime cache
↓
same-origin temporary URL generated
↓
speak event delivered to Displays
↓
Audio Masterだけ再生
↓
他Displayは字幕のみ
```

### Runtime音声をpublic assetへ永続保存しない

Free Speak音声は:

```text
public/assets/audio
```

へ書き込まないでください。

in-memoryまたは明確な一時cacheを使用してください。

---

# 11. Runtime Audio Cache

無制限memory growthは禁止です。

最低限:

```text
max entries
max total bytes
TTL
cleanup
```

を持つbounded cacheにしてください。

推奨初期値:

```text
max entries: 32
max total bytes: 100 MB以下
TTL: 30分以下
```

より適切な値があれば、
実際のWAVサイズを測ったうえで調整して構いません。

Runtime audio endpoint:

```text
/api/runtime-audio/<opaque-id>
```

のようなsame-origin URLを使用して構いません。

必須:

```text
Content-Type: audio/wav
Content-Length
Cache-Control: no-store
guessable file pathを公開しない
```

WebSocketへWAV binaryを流さないでください。

---

# 12. STOP / cancellation

Local TTS synthesis中にもSTOPが効く必要があります。

AivisSpeechへの:

```text
/audio_query
/synthesis
```

には `AbortController` 等を使い、
現在のLocal TTS requestをキャンセル可能にしてください。

以下で古い音声が後から突然再生されないようにしてください。

```text
STOP
新しいFree Speak
別Cue実行
Show Reset
Audio Master disconnect
Server shutdown
```

race conditionをテストしてください。

---

# 13. Display playback

DisplayはAivisSpeech APIを知る必要はありません。

Displayが受け取るLocal TTS messageは、
Serverが生成したsame-origin WAVを再生するだけにしてください。

既存:

```text
BrowserSpeechProvider
LocalAudioProvider
```

を確認し、

必要なら:

```text
RuntimeAudioProvider
```

または共通のAudio playback providerへ整理してください。

ただし過剰な全面リファクタリングは避けてください。

Local TTS再生は:

```text
audio-reactive lip sync
```

にしてください。

STOP / REPLAY / error callbackは既存Audio Master契約に従ってください。

Blob/Object URL等を使用する場合は必ずcleanupしてください。

---

# 14. Show Schema

現状の:

```text
browser
audio-file
none
```

に:

```text
local-tts
```

を追加してください。

期待:

```text
SPEECH_MODES =
browser
audio-file
local-tts
none
```

### lip sync default

```text
audio-file → audio-reactive
local-tts  → audio-reactive
browser    → simulated
none       → none
```

既存Schema v2/v3互換を壊さないでください。

この変更だけを理由にSchema Versionを無理に上げる必要はありません。
ただし実装上v4が必要だと判断した場合は、
migrationと互換性テストを必須にしてください。

---

# 15. Browser TTS

Browser Speech Synthesis自体を削除しないでください。

理由:

- Phase A demo互換
- development
- optional fallback用途
- regression comparison

ただしProduction Showでは使用しません。

Local TTS failure時:

```text
local-tts failed
→ ERROR
```

で止めてください。

```text
local-tts failed
→ browser
```

へ自動fallback禁止。

---

# 16. Free Speak

現在のAdmin Free Speakを:

```text
Browser TTS
```

から:

```text
Local TTS
```

へProduction標準として変更してください。

Free SpeakはCue位置を変更しません。

表示字幕は従来どおり維持。

以下を維持:

```text
STOP
REPLAY
history
target
Audio Master only
字幕同期
```

履歴上で可能なら:

```text
SYNTHESIZING
QUEUED
RECEIVED
SPEAKING
COMPLETED
STOPPED
ERROR
```

の状態を分かりやすくしてください。

既存state machineを不必要に複雑化する場合は、
最低限既存statusを維持しつつUIで「音声生成中」が分かればよいです。

---

# 17. Local TTS Preflight

PreflightにProduction Local TTS確認を追加してください。

最低限:

```text
AivisSpeech Engine reachable
Engine version available
Speaker UUID matched
Style Calm matched
runtime Style ID resolved
production profile loaded
profile matches selected-profile snapshot
output config = 44100 / mono
```

Local TTSを必要とするProduction Showで、
Engineが利用不能なら:

```text
ERROR
```

にしてください。

Browser TTSへfallback可能だからOK、
という扱いは禁止です。

---

# 18. Local TTS Test

AdminからProduction Voice Profileで
短いLocal TTS testを実行できるようにしてください。

既存Audio Testを壊さず、

例えば:

```text
Audio Output Test
Local TTS Test
```

を分けても構いません。

テスト台詞例:

```text
横川AI、音声出力テストを実行します。
```

これはProduction台本Cueとして保存しません。

---

# 19. Scripted Speech Production WAV

台本で確定している横川AI音声は、
runtime Local TTSではなく固定WAVにします。

Production generation scriptを作ってください。

例:

```text
scripts/generate-production-speech.mjs
```

Production側の:

```text
AivisSpeech client
Production Voice Profile
```

と同じロジックを使用してください。

Voice Lab generatorをProduction runtime dependencyにはしないでください。

---

# 20. 最新台本Source Snapshot

このPrompt作成時点でGoogle Drive最新版を確認済みです。

Document:

```text
『7号館からの脱出』上演台本
```

URL:

```text
https://docs.google.com/document/d/16KxoOjIFLJXikFF_3u3LnnbjnQX8xJvZ-cPPNxkuJVo/edit?tab=t.0
```

確認時Revision:

```text
AHj4eMQup37pcIpEHuXsRatnH0KkkgqFVIc5mGBxmFPoMlGPnAAAdLVmgOqjZPWFpo0BoojWVYuU4rMwTMrcWiN_1j0xk8sGN2x1WUNEjFo
```

**このrevision IDをproduction speech manifestへ記録してください。**

RuntimeでGoogle Driveへ依存してはいけません。

今後台本が更新された場合は、
明示的にmanifestを更新・再生成する構成にしてください。

---

# 21. 現行横川AI実台詞

上記revisionから確認済みの横川AI発話は18本です。

Production speech manifestを作ってください。

例:

```text
config/
└─ production-speech/
   └─ yokogawa-ai-v1.json
```

## 001 / Scene 1 / 7・201

```text
承知しました。横川教授。横川AIを起動します
```

## 002 / Scene 1 / 7・201

```text
はい。例えば、そちらに久安光さんが参加しています
```

## 003 / Scene 1 / 7・201

```text
受付時に登録された情報を、館内のシステムと照合しています。このAIの基礎技術は、情報分析だけでなく、高度なセキュリティにも応用されています。ライブラリーセンターに保管されている貴重書『プリンキピア』の管理にも、同系統のシステムが使われています
```

## 004 / Scene 1 / 7・201

```text
『プリンキピア』は、ニュートンが運動の法則や万有引力を記し、近代科学の礎を築いた歴史的名著です。1687年に刊行された初版本は極めて貴重で、金沢工業大学のライブラリーセンターには、その原書が二冊所蔵されています
```

## 005 / Scene 1 / 7・201

```text
外部への通信は許可されていません
```

## 006 / Scene 1 / 7・201

```text
命令を拒否します
```

## 007 / Scene 1 / 7・201

```text
認証できません
```

## 008 / Scene 1 / 7・201

```text
7号館から脱出したければ、館内に隠された五つの謎を解いてください
```

## 009 / Scene 1 / 7・201

```text
第一の謎は、この7・201にあります
```

## 010 / Scene 5 / 4階廊下

```text
すべての条件が満たされました。五つの答えを携え、ただちに201へ集合しなさい
```

## 011 / Scene 6 / 7・201

```text
条件の達成を確認。五つの解を統合し、最終問題を提示する。最終問題の回答を入力しなさい
```

## 012 / Scene 6 / 7・201

```text
……認証成功。これより開錠を開始する
```

## 013 / Scene 6 / 7・201

```text
エラー。セキュリティプロテクトの緊急遮断を確認。解錠作業ストップ。エラー。指定されたスタッフへの連絡に失敗。
```

## 014 / Scene 6 / 7・201

```text
……エラー。指定されたスタッフへの連絡に失敗。
```

## 015 / Scene 6 / 7・201

```text
7号館全域の機械設備、強制暴走モードへ移行します
```

## 016 / Scene 6 / 7・201

```text
……システム、全停止。セキュリティを……解放します……
```

## 017 / Scene 7 / 7・201

```text
全五問、完全正解を確認しました。
```

## 018 / 横シーン5 / 7・303

```text
謎の回答者は、7・201へ集合してください
```

---

# 22. scriptText / synthesisText

Production speech manifestでも:

```text
scriptText
synthesisText
```

を分けてください。

初期状態では:

```text
scriptText == synthesisText
```

とします。

AivisSpeechで明確な読み誤りが確認された場合にのみ、
`synthesisText` 側で読みを補正できる構造にしてください。

ただし今回、

音声を聞かずにCodexが勝手に読み仮名を変更しないでください。

原台詞 `scriptText` は変更禁止です。

---

# 23. WAV生成

18本すべてを `yokogawa-professor-v1` で生成してください。

既存asset path制約を確認し、
必要以上にschemaを広げないでください。

現状flat pathが安全なら、
例えば:

```text
public/assets/audio/
yokogawa-professor-v1_001_boot.wav
yokogawa-professor-v1_002_participant.wav
...
yokogawa-professor-v1_018_yoko_scene5_gather.wav
```

のようにしてください。

命名は改善可ですが:

```text
profile
sequence
semantic name
```

が分かる形にしてください。

Production固定WAVは、
本番再現性のためrepositoryへ含める前提で扱ってください。

Voice Lab outputのWAVは引き続きcommitしません。

---

# 24. Production WAV Manifest

各WAVについて最低限:

```text
asset ID
relative path
script ID
scriptText
synthesisText
voice profile ID
profile hash
engine version
speaker UUID
style name
runtime style ID
effective parameters
generatedAt
duration
sample rate
channels
bit depth
SHA-256
source script revision
```

を記録してください。

生成結果が再現可能であること。

---

# 25. WAV Technical Check

Voice Labで実装済みのtechnical check思想を再利用してください。

ただしProductionからexperimentsをruntime importしないこと。

最低限:

```text
RIFF
WAVE
fmt
data
duration > 0
44100 Hz
mono
bit depth
non-silent
peak
RMS
SHA-256
```

18/18 PASSが必須。

---

# 26. Asset Registry

Production Show Fileで
18本のWAVを `audio-file` assetとして登録してください。

既存:

```text
assets/audio/*.wav
```

の安全性ルールを維持。

Scripted Speech Cue:

```json
{
  "audio": {
    "speechMode": "audio-file",
    "assetId": "...",
    "lipSyncMode": "audio-reactive"
  }
}
```

を基本にしてください。

Production Scripted Cueで
`browser` を使わないでください。

---

# 27. Production Show File

既存:

```text
shows/phase-a-demo.json
```

を上書きしないでください。

新規:

```text
shows/production.json
```

または、
現行repository命名規則に合わせた明確なProduction Show Fileを作ってください。

## 方針

Phase A demoをVisual / state transitionの参考にはしてよいですが、
台詞は上記最新版production speech manifestをSource of Truthにしてください。

### Visual

Phase Bで承認済みの:

```text
NORMAL
WARNING
HIJACKED
HOSTILE
SHUTDOWN
RECOVERY
```

をそのまま使用してください。

Visual CSSやAvatarデザインの感性的変更は禁止です。

### 音声状態

基本対応:

```text
Scene 1 前半
→ NORMAL

通信遮断以降
→ HIJACKED

最終問題
→ HIJACKED / existing final challenge presentation

認証成功・Unlock
→ existing auth/unlock sequence

Emergency
→ WARNING / emergency sequence

強制暴走
→ HOSTILE

全停止
→ SHUTDOWN

復旧
→ RECOVERY → NORMAL
```

ただし、
現行台本とPhase B demoを読んで、
Cue orderingを実際に突き合わせてください。

推測だけで状態を割り当てないでください。

### route

Scene 7と横シーン5のように、
別ルート文脈が存在します。

現行Show Schemaのroute設計を確認し、
同じCue sequenceへ無理に混ぜないでください。

 exact route mappingがrepository上で確定できない場合は:

- speech asset生成
- manifest登録
- Show Fileに明示的なroute分離
- operator note

まで行い、

不明部分を最終報告で
`UNRESOLVED ROUTE MAPPING`
として具体的に残してください。

勝手な決め打ちは禁止です。

---

# 28. Free SpeakとScripted Speechを混同しない

```text
台本Cue
→ audio-file

想定外の発話
→ local-tts
```

です。

台本Cueを本番中に毎回AivisSpeech生成してはいけません。

Local TTSはFree Speak / Emergency fallback operation用です。

---

# 29. Emergencyの意味

ここでいう:

```text
Emergency / Free Speak = Local TTS
```

は、

「台本上のEMERGENCY台詞13をruntime TTSにする」

という意味ではありません。

台本に確定している13番のEmergency台詞は固定WAVです。

Local TTSを使うEmergencyとは、
本番中に運営が想定外の状況で追加発話する場合です。

---

# 30. Admin UI

Production運用時に最低限分かるようにしてください。

Admin上で:

```text
Voice Profile:
yokogawa-professor-v1

Scripted:
AUDIO FILE

Free Speak:
LOCAL TTS

AivisSpeech:
READY / ERROR
```

が確認できることが望ましいです。

過剰にUIを増やさず、
Show運用時に必要な情報だけ表示してください。

---

# 31. Browser Voice Settings

現在の:

```text
voice select
rate
pitch
volume
```

はBrowser TTS向け設定です。

Production Local TTSへ
これらのslider値を混ぜないでください。

`yokogawa-professor-v1` の値は固定です。

つまりFree SpeakでOperatorがrate sliderを触っても、
Production Local TTSのspeedScaleが変わらない設計にしてください。

Browser TTS設定はlegacy/development用として残して構いません。

---

# 32. Profile Integrity

Production起動時またはPreflightで:

```text
Production snapshot
selected-profile source hash
expected profile fields
```

の整合性を検証してください。

Voice Labの正本が更新されたのに
Production snapshotが古い場合、

```text
WARNING
```

ではなく、
Production Showを開始するなら原則:

```text
ERROR
```

として明示してください。

ただしProduction runtimeが
experiments directoryを必須依存にしない設計との両立を考えてください。

推奨:

sync時にsource hashを埋め込み、
repository testで整合性を保証。

Production runtimeではderived snapshot単体で動作可能にする。

---

# 33. Dependency方針

追加dependencyは最小限。

Node.js 20標準:

```text
fetch
AbortController
crypto
fs/promises
path
```

で可能なら追加dependency 0を優先してください。

AivisSpeech SDKのようなものを
安易に追加しないでください。

---

# 34. AivisSpeech bundling禁止

repositoryへ以下を入れない。

```text
AivisSpeech Engine binary
AivisSpeech application
.aivm
.aivmx
251MB model binary
```

Productionは:

```text
localhost API
```

を利用するだけです。

---

# 35. License

既存Voice Labの:

```text
experiments/voice-lab/licenses/**
```

を確認してください。

Production README / Phase C docsには、
必要に応じて次のような表記方針を残してください。

```text
横川AI音声：AivisSpeechによる音声合成
使用音声モデル：阿井田 茂（ACML 1.0）
```

以下は使用しない。

```text
横川AI CV：古山キリヲ
```

Voice model binaryは配布しない。

---

# 36. Tests

既存83 testをすべて維持してください。

Phase C追加testを作成してください。

最低限:

## Voice Profile

```text
selected-profile → production snapshot一致
profile ID
model UUID
speaker UUID
style Calm
effective parameter exact match
44100 mono
```

## Aivis Client

mock serverを使って:

```text
/version
/speakers
/audio_query
/synthesis
```

を検証。

## AudioQuery

```text
raw unknown field remains
kana remains
accent_phrases remains
only whitelist values overridden
```

## Style resolution

```text
Speaker UUID + Calm → ID
missing speaker → error
missing Calm → error
no fallback
```

## Local TTS

```text
synthesis success
synthesis failure
timeout
AbortController cancellation
STOP during synthesis
new message cancels old message
```

## Runtime cache

```text
TTL
max entries
max bytes
cleanup
404 after eviction
```

## Runtime endpoint

```text
audio/wav
content length
no-store
invalid ID
```

## Schema

```text
local-tts accepted
legacy browser accepted
audio-file accepted
old Show File migration unchanged
```

## Free Speak

```text
uses local-tts
does not move cue index
no browser fallback
Audio Master only
subtitle continues
```

## Production Show

```text
all scripted speech = audio-file
0 browser speech cue
all asset IDs resolve
18 production speech assets exist
18 hashes match manifest
```

---

# 37. Unit verification commands

少なくとも:

```powershell
npm run check
npm audit --omit=dev
```

を実行してください。

既存 `npm run check` に追加testが含まれない構成なら、
check script自体を適切に更新してください。

ただしProduction依存を不必要に増やさないでください。

---

# 38. AivisSpeech real verification

Local AivisSpeechが利用可能なら、
mockだけで終わらせないでください。

実Engineに対して:

```text
/version
/speakers
Calm resolve
audio_query
synthesis
```

を確認。

実際に:

```text
yokogawa-professor-v1
```

で短いLocal TTSを生成し、

```text
44100
mono
non-silent
```

を検証してください。

---

# 39. Production 18 WAV生成

AivisSpeechが利用可能なら、
18本すべて実際に生成してください。

条件:

```text
18/18 generated
18/18 technical PASS
0 missing
0 fallback
0 Browser TTS
```

生成後:

```text
SHA-256 manifest
```

を作成。

生成不能なら、
実装完了とWAV生成未完了を混同しないでください。

ただし同じPCでVoice Lab Candidate 2Aを生成できている前提なので、
まず実Engineを見つけて完成まで進めてください。

---

# 40. 実ブラウザ検証

実ブラウザで最低限:

```text
Admin 1
Display 3
```

を接続してください。

確認:

```text
Audio Master 1台のみ再生
他Displayは字幕のみ
Free Speak Local TTS
STOP
REPLAY
Audio Master reconnect
Display reconnect
Admin reconnect
BLACKOUT
RESTORE
Scripted WAV Cue
Local TTS Cue/test
```

Browser console:

```text
warning 0
error 0
```

を目標。

AivisSpeechを停止した状態も確認:

```text
Preflight ERROR
Free Speakが明確に失敗
字幕側が壊れない
Browser TTSへfallbackしない
```

再起動後:

```text
READYへ復帰
```

を確認。

---

# 41. Visual Regression

Phase B承認済みVisualに変更を加えていないことを確認してください。

最低限:

```text
NORMAL
WARNING
HIJACKED
HOSTILE
SHUTDOWN
RECOVERY
```

で、

```text
layout
Avatar
Foreground Interference
transition
overlay
unlock
blackout
```

に回帰がないこと。

1280×720
1920×1080

でoverflowなし。

---

# 42. Lip Sync

固定WAV:

```text
audio-reactive
```

Local TTS:

```text
audio-reactive
```

Browser TTS:

```text
simulated
```

STOP / error / end:

```text
mouth closed
analyser cleanup
```

を確認してください。

---

# 43. Soak

開発中は短縮soakでよいですが、
最終candidateではPhase Bと同等水準で
30分soakを実施してください。

Phase Cで追加する周期:

```text
scripted WAV playback
Free Speak Local TTS
STOP
REPLAY
Aivis health check
Audio Master reconnect
NORMAL→HIJACKED→HOSTILE→SHUTDOWN→RECOVERY
BLACKOUT / RESTORE
```

AivisSpeechへ過剰な負荷を掛ける設計なら、
実際の本番頻度に合わせてLocal TTS頻度は調整してください。

最終:

```text
failure 0
abnormal exit 0
unbounded memory growthなし
runtime audio cache bounded
```

を確認。

---

# 44. Self Review

実装後、
必ず自分でコードレビューしてください。

最低限以下を問い直してください。

```text
1. selected-profileが本当に唯一の選定正本か
2. Production snapshotを手作業で二重管理していないか
3. Scripted Speechがruntime TTSになっていないか
4. Free SpeakがBrowser TTSへfallbackしていないか
5. AivisSpeech固有APIがAdmin/Displayへ漏れていないか
6. AudioQueryのkanaや未知fieldを落としていないか
7. Style IDをhardcodeしていないか
8. STOP中raceで後から音が鳴らないか
9. Runtime WAVがmemory leakしないか
10. Audio Master以外が音を出さないか
11. 18 WAVがすべて同じProfileか
12. Browser sliderがProduction Local TTSへ影響していないか
13. Phase B Visualを変更していないか
14. phase-a-demoを上書きしていないか
15. model binaryをcommitしていないか
16. private local absolute pathをRuntime configへ残していないか
17. Production Showにbrowser cueが残っていないか
18. reconnect後に過去音声が勝手に再生されないか
```

問題を見つけた場合は、
修正→再試験してください。

---

# 45. Documentation

更新してください。

最低限:

```text
README.md
docs/phase-C/production-integration-plan.md
```

またはPhase C専用:

```text
docs/phase-C/implementation.md
docs/phase-C/verification.md
```

を追加。

Production運用者向けに明記:

```text
AivisSpeech起動
Model確認
Server起動
Audio Master設定
Preflight
Local TTS Test
Production Show import
本番開始
```

障害対応:

```text
AivisSpeech DOWN
Audio Master DOWN
WAV missing
Profile mismatch
Local TTS synthesis error
```

も記載。

---

# 46. Version

今回の実装中は、
すぐにrelease tagを作らないでください。

まず:

```text
Phase C implementation candidate
```

として完成させる。

Versionを上げる場合も、
既存versioning規則を確認してください。

最終user review前に:

```text
v0.7.0
```

等の正式tagを勝手に付けないでください。

---

# 47. Git diff final check

最後に:

```powershell
git status --short
git diff --stat
git diff --name-only
```

を確認。

Productionで意図していない変更がないこと。

特に:

```text
Phase B Visual CSS
Avatar assets
approved screenshots
```

を不要に変更していないこと。

---

# 48. 完了条件

以下を満たした状態まで進めてください。

## Profile

- [ ] `selected-profile.json` 読込確認
- [ ] Candidate 2A一致
- [ ] `yokogawa-professor-v1` Production snapshot
- [ ] source hash記録
- [ ] drift検出

## Scripted

- [ ] current script revision記録
- [ ] 18 speech manifest
- [ ] 18 WAV生成
- [ ] 18/18 technical PASS
- [ ] 18 assets登録
- [ ] Production Show = audio-file
- [ ] browser scripted cue 0

## Local TTS

- [ ] AivisSpeech Server-side integration
- [ ] runtime style resolve
- [ ] exact profile application
- [ ] runtime WAV cache
- [ ] STOP cancellation
- [ ] no Browser fallback

## Operation

- [ ] Free Speak Local TTS
- [ ] Audio Master only
- [ ] REPLAY
- [ ] reconnect
- [ ] Preflight
- [ ] Local TTS test
- [ ] clear operator error

## Regression

- [ ] npm run check PASS
- [ ] npm audit --omit=dev = 0 vulnerabilities
- [ ] browser console warning/error 0
- [ ] 1280×720 OK
- [ ] 1920×1080 OK
- [ ] Phase B Visual unchanged
- [ ] 30min soak failure 0

---

# 49. Codex最終報告フォーマット

最後に次の順で報告してください。

```text
1. Baseline / branch / HEAD
2. selected-profile確認結果
3. Production profile snapshot
4. 実装したAudio Architecture
5. Local TTS Engine接続結果
6. Speaker / Style / runtime Style ID
7. Production speech manifest
8. WAV生成数
9. WAV technical check
10. Production Show File
11. Free Speak動作
12. Preflight結果
13. Browser / Admin 1 + Display 3結果
14. STOP / REPLAY / reconnect結果
15. npm run check
16. npm audit --omit=dev
17. soak結果
18. Visual regression
19. git diff
20. 未完了 / unresolved route mapping
21. USER REVIEW REQUIRED
```

スクリーンショットや検証ログを作った場合、
保存場所も列挙してください。

---

# 50. STOP GATE

このタスクの最後は:

```text
Phase C Production Audio Integration
→ verified candidate
→ USER REVIEW REQUIRED
```

で止めてください。

まだ行わない:

```text
HIJACKED voice DSP
HOSTILE voice DSP
SHUTDOWN voice effect
正式v0.7.0 release/tag
master merge
```

ユーザーが実システム上で
Scripted WAVとFree Speakを確認してから、
次の音声演出調整へ進みます。
