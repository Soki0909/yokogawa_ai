# Codex実装指示 — Audio Playback Reliability Patch v1.0

## 0. このタスクの目的

Yokogawa AI Voice Lab のデプロイ版において、以下の実機症状が確認されている。

### 症状A：スマートフォン
- 再生ボタンを押す
- 再生バー / 時間表示は進む
- しかし音が出ない場合がある

### 症状B：PC
- 再生自体はできる
- ただし音声が一部飛ぶ、欠ける、途切れるように聞こえることがある

現時点で原因は完全確定していない。

しかし、Web Audioを利用する音声プレイヤーとして今後も起きうる問題のうち、
**副作用が小さく、再発防止として合理的な堅牢化項目**については、
原因の100%確定を待たずにProductionへ実装する。

このタスクは、

> **Audio Playback Reliability Patch**

として、Voice Profile調整や音声内容変更とは独立して実装する。

---

# 1. 対象

Repository:

```text
C:\Users\kumes\Documents\yokokawa_ai
```

Production Voice Lab:

```text
https://yokogawa-ai-voice-lab.netlify.app/
```

Netlify Project:

```text
yokogawa-ai-voice-lab
```

現在の実装branch / HEADは作業開始時に必ず確認する。

過去に報告されたbranch名・HEADを盲目的に前提にしない。

---

# 2. Source of Truth

既存Production Samplerの以下を維持する。

```text
18 Production WAV
Production manifest
Voice Profile
RAW / Production切替
hijacked-subtle-v1
共有パスワード認証
Edge Function
deep link
logout
Instant Playback / preload
VOICE RETUNE（存在する場合）
```

今回の主目的は、

```text
再生安定性
AudioContext recovery
preload / decode scheduling
診断能力
```

の改善である。

---

# 3. 今回の実装判断

## 実装する

```text
A. iOS AudioSession playback指定
B. Play gesture内 AudioContext.resume()
C. suspended / interrupted recovery
D. visibilitychange / pageshow後の状態回復
E. Single AudioContext
F. decode concurrency制限
G. 再生中のbackground decode抑制
H. preload failure retry
I. ?debug=audio 診断モード
J. latency / state / queue telemetry
```

## 今回は保留

```text
K. latencyHint = "balanced" のProduction固定
L. HTMLAudioElement fallback の本格導入
```

## 変更しない

```text
M. hijacked-subtle-v1 parameters
N. Production WAV
O. Voice Profile
P. Edge Function認証
Q. Service Worker / persistent audio cache
```

---

# 4. iOS AudioSession

対応ブラウザでは、音声再生用途であることを明示する。

feature detectionを必須とする。

```js
if ("audioSession" in navigator) {
  try {
    navigator.audioSession.type = "playback";
  } catch (error) {
    // diagnostic log only
  }
}
```

要件:
- 非対応ブラウザで例外を起こさない
- PC Chrome / Firefox等に副作用を与えない
- AudioSession設定失敗でSampler全体を停止しない
- debug modeでは設定結果を確認可能にする

---

# 5. AudioContextのライフサイクル

AudioContextは原則として1ページにつき1つだけ生成し、全再生で再利用する。

禁止:

```text
Playごとにnew AudioContext()
sampleごとにAudioContext生成
effect切替ごとにAudioContext生成
```

AudioBufferSourceNodeは再利用不可なので、Playごとに新規作成してよい。

共有するもの:

```text
AudioContext
decoded AudioBuffer
必要な共有AudioGraph構成
diagnostic state
```

---

# 6. Play gesture内でのresume

再生ボタンのユーザー操作を起点として、
AudioContextが `running` でなければ復帰させる。

```js
if (audioContext.state !== "running") {
  await audioContext.resume();
}
```

可能な限り、

```text
user click / tap
→ AudioContext resume
→ source creation
→ source.start()
```

の順を維持する。

resumeより前に不要なnetwork fetchや長いawaitを入れない。

READY済み音声では、Play操作時に:

```text
network fetch
decodeAudioData
```

を実行してはいけない。

---

# 7. suspended / interrupted対応

AudioContextが以下の状態になることを想定する。

```text
running
suspended
interrupted
closed
```

特にスマートフォンでは、

```text
画面ロック
別アプリへ移動
LINEへ移動
台本PDFへ移動
電話
通知
Safariのバックグラウンド化
復帰
```

を想定する。

`interrupted` がブラウザで利用可能な場合は明示的に診断対象とする。

`closed` は単純に `resume()` できないため、意図せずclosedになった場合に備えて、
安全に新しいAudioContextを再初期化できる内部関数を設計してよい。

ただし通常フローではcloseしない。

---

# 8. visibilitychange / pageshow

以下を監視する。

```text
visibilitychange
pageshow
```

復帰時には:

```text
document.visibilityState
AudioContext.state
AudioSession state（利用可能なら）
```

を確認する。

イベント発火だけで勝手に音を鳴らしてはいけない。

基本方針:

```text
ページ復帰
→ 状態確認 / recovery-ready
→ 次のPlay gestureで確実にresume
```

---

# 9. preload / decode scheduling

現在のInstant Playback方針は維持する。

PCでの音欠け予防のため、
`decodeAudioData()` の同時実行数を明確に制限する。

基本値:

```text
decode concurrency = 1
```

fetchについては必要に応じて数本並列でもよい。

例:

```text
fetch concurrency <= 4
decode concurrency = 1
```

禁止:

```text
18 WAVを同時decode
```

---

# 10. 再生中のdecode抑制

音声再生中は、
**新規のbackground decode開始を原則停止**する。

例:

```text
preload queue
↓
decode #012
↓
#001 Play開始
↓
現在実行中のdecodeは完了させてよい
↓
新しいdecode開始をpause
↓
#001再生終了 / Stop
↓
decode queue再開
```

既に実行中のdecodeを危険にabortする必要はない。

---

# 11. priority preload

現在の優先ロードがある場合は維持する。

代表:

```text
#001
#004
#008
#013
#015
#016
```

ただしpriority loadのためにdecode concurrency制限を破らない。

---

# 12. preload failure retry

個別WAVのpreload / decodeに失敗した場合、
Sampler全体を失敗扱いにしない。

状態例:

```text
pending
fetching
decoding
ready
error
```

error状態の音声には、
その音声だけ再試行できる仕組みを用意する。

---

# 13. Instant Playbackを維持

READY状態の音声について、

```text
Play
→ fetch
→ decode
→ play
```

へ戻してはいけない。

必ず:

```text
Play
→ cached AudioBuffer
→ AudioBufferSourceNode
→ source.start()
```

を基本経路とする。

Play時のnetwork requestがゼロであることを検証する。

---

# 14. HIJACKED処理

既存の:

```text
hijacked-subtle-v1
```

は今回変更しない。

対象音声は、

```text
decoded AudioBuffer
→ existing hijacked-subtle-v1 graph
→ destination
```

で再生する。

今回の音欠けがHIJACKED限定かどうかは未確定なので、
effect parameterを推測で変更しない。

RAW / Production切替も維持する。

---

# 15. latencyHint

今回はProductionのAudioContextへ、

```js
latencyHint: "balanced"
```

を固定導入しない。

現状の設定を維持する。

ただしdebug modeで可能なら:

```text
baseLatency
outputLatency
sampleRate
```

を表示する。

将来、

```text
decode競合対策後もPC音切れが再現
```

した場合に初めて、

```text
interactive
vs
balanced
```

を比較検証する。

---

# 16. HTMLAudioElement fallback

今回は通常経路として導入しない。

まず今回のAudioContext recoveryでスマホ問題を改善する。

それでも特定iOSで再現する場合、
次段階のfallback候補とする。

---

# 17. ?debug=audio 診断モード

以下のquery parameterを実装する。

```text
?debug=audio
```

このときだけ、画面上にAudio Diagnosticsを表示する。

通常ユーザーには表示しない。

最低限表示する情報:

```text
userAgent
platform / relevant browser capability
AudioContext.state
AudioContext.sampleRate
AudioContext.baseLatency
AudioContext.outputLatency
navigator.audioSession?.type
navigator.audioSession?.state
document.visibilityState

preload total
ready count
error count
fetch in progress
decode in progress
decode queue length

currently playing sample
playback mode RAW / Production
last audio error
last resume result
last context state change
```

存在しないAPIは `unsupported` と表示し、例外にしない。

---

# 18. 診断ログ

AudioContextの `statechange` を監視する。

debug modeでは最低限、

```text
timestamp
previous state
new state
trigger
```

を追跡できるようにする。

ログ数には上限を設ける。

```text
latest 100 events
```

---

# 19. debug情報のセキュリティ

`?debug=audio` に以下を表示しない。

```text
共有パスワード
認証Cookie
Cookie値
Environment Variable
秘密情報
内部Netlify credential
```

debug modeも既存Edge Function認証下に置く。

---

# 20. logout

既存logout挙動を維持する。

logout時:

```text
認証Cookie削除
current source停止
AudioBuffer参照破棄
preload queue停止
diagnostic stateの保護対象データ破棄
```

logout後にメモリ上の音声を再生できないこと。

---

# 21. WAV先頭無音の切り分け

以下を別々に扱う。

```text
A. Play event → source.start()までのアプリ処理時間
B. WAV先頭 → 実発声開始までのfront silence
C. 再生途中のdropout / glitch
```

Production WAV自体は今回変更しない。

---

# 22. 実ブラウザ検証 — Desktop

実ブラウザでProductionへアクセスし、
最低限以下を確認する。

```text
#001
#004
#008
#013
#015
#016
```

確認項目:

```text
18 / 18 ready
Play
Pause
Resume
Stop
Replay
rapid switching
連打
RAW / Production切替
HIJACKED
deep link
logout
```

READY後Play時にnetwork request / decodeが発生しないこと。

---

# 23. スマホ相当検証

mobile viewport / device emulationが可能なら実施する。

ただしDesktop Chromium mobile emulationはiOS Safari実機と同一ではないため、
mobile emulation PASSだけでiOS問題解消と断定しない。

iOS WebKitの:

```text
AudioSession
AudioContext suspend/interruption
user gesture resume
```

を明示的に考慮する。

---

# 24. 実機向け診断手順

実装後、ユーザーがスマートフォンで問題を再現した際に、

```text
https://yokogawa-ai-voice-lab.netlify.app/?debug=audio
```

で確認できる状態にする。

診断画面だけで最低限、

```text
AudioContextがrunningか
AudioSession type
visibility state
sample readyか
resumeが成功したか
```

を判別できること。

---

# 25. Automated Tests

既存testを壊さず、少なくとも以下を追加する。

1. AudioContext singleton
2. PlayごとにAudioContextを生成しない
3. non-running contextでresumeを試行
4. running contextでは不要なresumeをしない
5. visibilitychange handler
6. pageshow handler
7. audioSession feature detection
8. audioSession unsupportedでも正常
9. decode concurrency最大1
10. playback中のnew decode開始抑制
11. playback終了後queue再開
12. individual preload retry
13. READY後Playでfetchしない
14. READY後Playでdecodeしない
15. HIJACKED graph regressionなし
16. RAW / Production regressionなし
17. debug mode OFFで診断UI非表示
18. `?debug=audio`で診断UI表示
19. debug UIにsecret/cookie値を出さない
20. logout後再生不能
21. deep link regressionなし
22. Edge auth regressionなし

既存:

```text
npm run check
Production voice verification
npm audit --omit=dev
```

もPASS維持。

---

# 26. Instrumentation Test

可能ならテスト用mockで、

```text
decodeAudioData active count
```

を計測し、

```text
max active decode = 1
```

を自動テストする。

また、

```text
isPlaying = true
```

の間に次decodeが開始されないことを確認する。

---

# 27. Self Review

実装後、必ず以下を自己批評する。

```text
1. PlayごとにAudioContextを作っていないか
2. iOS AudioSessionをfeature detectionしているか
3. Play gestureからresumeが遠くなっていないか
4. suspended / interruptedを考慮したか
5. visibility復帰後に壊れないか
6. decode concurrencyが本当に1か
7. playback中にbackground decodeを開始していないか
8. Instant Playbackを壊していないか
9. Play時にfetchしていないか
10. Play時にdecodeしていないか
11. hijacked-subtle-v1を変更していないか
12. RAW / Production両方動くか
13. debug UIが通常利用者へ見えていないか
14. debug UIにsecretを出していないか
15. logout後に音声を再生できないか
16. mobile対策でPC再生を悪化させていないか
17. PC対策で再生開始を不必要に遅くしていないか
```

問題があれば、

```text
修正
→ tests
→ browser verification
→ self review
→ 再確認
```

を繰り返す。

---

# 28. Git運用

この修正は独立パッチとして扱う。

推奨branch:

```text
codex/audio-playback-reliability
```

ただし現在の最新Voice Lab実装が別branchにのみ存在する場合、
その最新commitを正しくbaseにしてbranchを作成する。

古い `master` や `codex/phase-c-production-audio` を誤ってbaseにしない。

作業開始時に必ず現在状態を確認する。

禁止:

```text
force push
master直接merge
release tag
Production WAV再生成
Voice Profile変更
```

---

# 29. Deploy

実装後は既存Netlify Projectへ反映する。

```text
yokogawa-ai-voice-lab
```

新しいNetlify Projectは作らない。

手順:

```text
implementation
→ automated tests
→ local browser verification
→ self review
→ draft / preview deploy
→ browser verification
→ Production deploy
→ Production verification
```

既存Edge Function password protectionを維持する。

---

# 30. Production Verification

Production deploy後、実環境で:

```text
認証
→ 18/18 ready
→ #001再生
→ #004再生
→ #008 Production effect
→ #013
→ #015
→ #016
→ Pause / Resume
→ rapid switching
→ deep link
→ ?debug=audio
→ logout
```

を確認する。

可能ならNetwork panel相当の確認で、

```text
READY後Play時にaudio fetchなし
```

を確認する。

---

# 31. Success Criteria

最低限以下を満たす。

```text
[ ] Production 18 WAVが正常
[ ] AudioContext singleton
[ ] iOS audioSession playback設定
[ ] user gesture resume
[ ] suspended/interrupted recovery
[ ] visibility/pageshow recovery
[ ] decode concurrency = 1
[ ] playback中background decode抑制
[ ] preload retry
[ ] Instant Playback維持
[ ] HIJACKED regressionなし
[ ] ?debug=audio利用可能
[ ] debug modeにsecretなし
[ ] logout正常
[ ] automated tests PASS
[ ] Production deploy ready
```

---

# 32. 今回のSTOP判断

今回の実装で、

```text
latencyHint = balanced
HTMLAudioElement fallback
HIJACKED effect parameter変更
Production WAV変更
```

まで勝手に広げない。

今回の低リスクReliability Patch適用後も、

```text
スマホで無音
PCでdropout
```

が再現する場合は、
`?debug=audio` の実測情報をSource of Truthとして次段階を判断する。

---

# 33. 最終報告フォーマット

次の順に報告する。

```text
1. Base branch / base HEAD
2. Work branch / final HEAD
3. Reproduced / observed symptoms
4. AudioContext lifecycle changes
5. iOS AudioSession changes
6. resume / interruption recovery
7. preload / decode scheduler changes
8. decode concurrency実測
9. playback中decode抑制
10. retry behavior
11. ?debug=audio
12. Desktop browser verification
13. Mobile / emulation verification
14. Production 18 WAV regression
15. HIJACKED regression
16. authentication / logout regression
17. automated test results
18. Production deploy URL / status
19. remaining known limitations
20. whether iOS real-device recheck is still required
```

今回のパッチは、
「症状が完全再現できたか」だけではなく、

> **今後同種の再生不具合が起きにくい構成へ堅牢化できたか**

で評価すること。
