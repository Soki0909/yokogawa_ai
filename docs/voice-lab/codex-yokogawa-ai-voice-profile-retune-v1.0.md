# Codex実装指示 — Yokogawa AI Voice Profile 再調整ラウンド v1.0

## 0. 目的

キャスト稽古で実際に横川AI音声を使用した結果、以下のフィードバックが出た。

1. 「少し声が早いかも」
2. 「ちょっと感情的かも。もう少し無機質でもいい」
3. 「文ごとの間に、もう少し間があいてほしい」
4. 「久安 光」は **ヒサヤス ヒカル** と読む。現状の読みが誤っているため修正したい

このフィードバックをもとに、現在採用済みの Voice Profile **2A** を即座に上書きせず、
2Aを基準とした **再調整候補 2B / 2C / 2D** を作成し、Voice Lab上で比較試聴できる状態にする。

このタスクのゴールは、

> **Production本体を変更せず、キャストが比較して次の正式Voice Profileを選べる状態を作ること**

である。

---

# 1. 現在の状態

Repository:

```text
C:\Users\kumes\Documents\yokokawa_ai
```

現在のVoice Lab branch:

```text
codex/voice-lab-production-sampler
```

現在報告されているHEAD:

```text
d2379fedc6a901c6070207ceac84e99c300bbdda
```

Netlify Production:

```text
https://yokogawa-ai-voice-lab.netlify.app/
```

Project:

```text
yokogawa-ai-voice-lab
```

現在はNetlify Edge Functionによる共有パスワード保護済み。

Production / Deploy Previewとも未認証アクセスは遮断されている。

---

# 2. 現行Voice Profile 2A

現在の正式採用Profile:

```text
ID: yokogawa-professor-v1
Model: 阿井田 茂
Style: Calm

speedScale: 1.20
pitchScale: 0.0
intonationScale: 0.45
tempoDynamicsScale: 0.20
volumeScale: 0.95
outputSamplingRate: 44100
outputStereo: false
```

Source of Truth:

```text
experiments/voice-lab/config/selected-profile.json
```

Production snapshot:

```text
config/voice-profiles/yokogawa-professor-v1.json
```

## 重要

現時点で2Aはまだ正式Profileである。

このタスクでは:

```text
2Aを削除しない
selected-profile.jsonを書き換えない
Production WAVを上書きしない
Production Showを変更しない
```

---

# 3. 今回の判断状態

## 確定

```text
「久安 光」の読み = ヒサヤス ヒカル
```

## 修正候補

```text
speedを少し下げる
intonationを下げる
tempo dynamicsを少し下げる
文ごとのpauseを増やす
```

## 未確定

```text
2B / 2C / 2D のどれを正式採用するか
```

Codexが自動的に「2Cを正式採用」などと決めてはいけない。

---

# 4. 再調整候補

## 2B — Mild Retune

```text
speedScale: 1.12
pitchScale: 0.0
intonationScale: 0.35
tempoDynamicsScale: 0.15
volumeScale: 0.95
pauseLengthScale: 1.20
```

狙い:

```text
現行2Aの印象をなるべく保ちながら、
少し遅く、少し無機質にし、文間を少し広げる
```

## 2C — Neutral Mechanical

```text
speedScale: 1.10
pitchScale: 0.0
intonationScale: 0.30
tempoDynamicsScale: 0.10
volumeScale: 0.95
pauseLengthScale: 1.30
```

狙い:

```text
2Aの人物性を保ちながら、
キャストの「もう少し無機質」の要望へ明確に寄せる
```

現時点の本命候補ではあるが、Codexが正式採用してはいけない。

## 2D — Flat Mechanical

```text
speedScale: 1.08
pitchScale: 0.0
intonationScale: 0.25
tempoDynamicsScale: 0.08
volumeScale: 0.95
pauseLengthScale: 1.35
```

狙い:

```text
かなり淡々としたAI寄り。
2Cより一段無機質にした比較用候補。
```

---

# 5. AivisSpeechの扱い

AivisSpeech Engine:

```text
http://127.0.0.1:10101
```

現行Productionと同じ方式を使う。

必須:

```text
/audio_query
/synthesis
```

AudioQueryは既存Phase C方針を維持する。

```text
AivisSpeechから返されたAudioQuery JSONを完全保持
→ unknown fieldも保持
→ 必要なfieldだけ上書き
→ JSONを再構築しない
```

Override対象は今回必要なものだけ。

```text
speedScale
pitchScale
intonationScale
tempoDynamicsScale
volumeScale
pauseLengthScale
outputSamplingRate
outputStereo
```

---

# 6. 「文ごとの間」の評価

今回の要望は、

> 文ごとの間に、もう少し間があいてほしい

である。

単純に全文を遅くするだけでは対応しない。

以下を区別する:

```text
全体速度
文中の自然なリズム
句読点の間
文と文の間
```

`pauseLengthScale` が期待通り効いているか、生成WAVを実際に聴いて確認する。

必要であればAudioQuery内のpause関連fieldを調査する。

禁止:

- 台詞本文へ不要な「……」「、」「。」を追加して間を作る
- scriptTextを書き換える
- synthesisTextへ演出的な句読点を大量挿入してごまかす

まずAivisSpeech側の正規parameterで対応する。

---

# 7. 「久安 光」の読み修正

対象:

```text
#002
```

台本表示上:

```text
はい。例えば、そちらに久安光さんが参加しています
```

これは変更しない。

## scriptText

```text
はい。例えば、そちらに久安光さんが参加しています
```

## synthesisText

発音制御のため:

```text
はい。例えば、そちらにヒサヤス ヒカルさんが参加しています
```

とする。

重要:

```text
scriptText != synthesisText
```

をこの1件について許可する。

Production speech verificationも、
「scriptTextとsynthesisTextが完全一致であること」を絶対条件にしないよう、
**明示的なpronunciation overrideとして扱える仕組み**にする。

---

# 8. Pronunciation Overrideの設計

#002だけの特殊処理をコードへ直書きしない。

Production speech manifestまたは専用configに、例えば:

```json
{
  "scriptId": "002",
  "displayText": "はい。例えば、そちらに久安光さんが参加しています",
  "synthesisText": "はい。例えば、そちらにヒサヤス ヒカルさんが参加しています",
  "pronunciationNote": "久安 光 = ヒサヤス ヒカル"
}
```

のような形で保持する。

実際のschemaは現行設計に合わせて最小変更する。

要件:

- 表示は「久安光」
- 音声だけ「ヒサヤス ヒカル」
- overrideであることが追跡可能
- 将来の再生成でも誤読へ戻らない

---

# 9. 比較対象セリフ

今回は18本全部を生成しない。

以下の **7本**だけ生成する。

```text
#001 起動
#002 久安光の名前
#003 通常説明
#004 プリンキピア長文
#008 五つの謎
#013 緊急エラー
#016 SHUTDOWN
```

理由:

```text
001: 通常時の第一印象
002: 固有名詞の読み
003: 通常会話
004: 長文・速度・文間
008: HIJACKED
013: 緊急時の明瞭度
016: SHUTDOWN・間
```

---

# 10. 比較対象Profile

Voice Lab上では:

```text
2A
2B
2C
2D
```

を同じ台詞で横並び比較できるようにする。

2Aは既存Production WAVをbaselineとして使用してよい。

ただし #002 については、現行2Aは誤読を含むことを明示する。

表示例:

```text
2A — Current Production
※ #002は旧読み
```

---

# 11. Voice Lab UI

既存Production Samplerを壊さず、再調整専用の一時比較モードを追加する。

例:

```text
PRODUCTION
VOICE RETUNE
ROUND 2
ROUND 1
```

デフォルトは今まで通り:

```text
PRODUCTION
```

VOICE RETUNEを開くと:

```text
7台詞 × 4候補
```

を比較できる。

---

# 12. VOICE RETUNE UI

各台詞ごとに:

```text
#004 プリンキピア長文

[2A 再生]
[2B 再生]
[2C 再生]
[2D 再生]

[2A→2B→2C→2D 連続比較]
```

を用意。

候補cardには:

```text
speed
intonation
tempo dynamics
pause scale
```

を表示する。

ただし一般キャスト向けなので、数値を主役にせず、

```text
2B: 少し落ち着く
2C: 無機質寄り
2D: かなり淡々
```

を先に見せる。

---

# 13. HIJACKED比較

#008については特に:

```text
RAW
本番再生
```

を切り替え可能にする。

本番再生では現在Productionで使っている:

```text
hijacked-subtle-v1
```

を適用する。

最重要:

2B〜2Dでベース声が無機質になることで、HIJACKED effect適用後に:

```text
聞き取りづらくならないか
人物性が消えすぎないか
```

を確認する。

effect値自体は今回変更しない。

---

# 14. 生成物の分離

正式Production WAVを上書きしない。

例:

```text
experiments/voice-lab/output/retune-2026-10/
├─ 2b/
├─ 2c/
├─ 2d/
└─ metadata/
```

outputがgitignore対象ならその運用を維持する。

Netlifyへdeployする場合はbuild時に必要WAVだけcopyする。

---

# 15. Candidate config

新規config例:

```text
experiments/voice-lab/config/candidates-retune.json
```

候補:

```text
2B
2C
2D
```

2Aは `selected-profile.json` をbaselineとして読む。

2Aの値をretune configへコピーして二重管理しない。

---

# 16. 技術QA

各候補 × 7台詞 = 21 WAVについて:

```text
sample rate
channels
bit depth
duration
non-silent
no clipping
front silence
tail silence
generation metadata
```

を検査。

期待:

```text
44.1kHz
mono
16-bit
```

---

# 17. Duration比較

比較reportを出す。

各台詞について:

```text
2A duration
2B duration
2C duration
2D duration
差分%
```

特に:

```text
#004
#013
#016
```

を確認。

目的は、

```text
遅くしすぎて稽古テンポを壊していないか
```

を見ること。

---

# 18. Pause比較

可能なら文間pauseを簡易解析する。

最低限:

```text
#004
#013
```

で、

- 発話全体duration
- 文境界付近のsilence
- 2Aとの差

を記録する。

高度な音声認識は不要。
WAV amplitudeからsilence区間を測る程度でよい。

---

# 19. Browser verification

VOICE RETUNE画面で以下を確認:

```text
2A〜2D表示
7台詞
個別再生
連続比較
Stop
候補切替
#002表示 = 久安光
#002音声 = ヒサヤス ヒカル
#004比較
#008 RAW
#008 Production effect
#013比較
#016比較
```

Console:

```text
warning 0
error 0
```

---

# 20. Netlify

既存:

```text
https://yokogawa-ai-voice-lab.netlify.app/
```

を使用する。

既存のEdge Function password protectionを維持する。

VOICE RETUNEも同じ共有パスワード配下。

禁止:

- 新規Netlify Projectを作らない
- password protectionを外さない
- Production Samplerを消さない
- public assetをpassword gate外へ置かない

---

# 21. Deploy

実装・検証後:

```text
draft deploy
```

までは自律的に進めてよい。

draftで:

```text
VOICE RETUNE
7台詞
2A〜2D
```

を実ブラウザ確認。

Production deployは既存運用に従う。

---

# 22. Production本体は変更しない

このタスクでは以下を変更しない。

```text
selected-profile.json
Production 18 WAV
shows/production.json
shows/production-yokogawa-route.json
Production Local TTS profile
正式Voice Profile ID
```

ただし #002のpronunciation override仕組み自体を将来Productionへ安全に反映できるよう、
設計・testは用意してよい。

---

# 23. 正式採用後の次段階

このタスクでは実行しない。

ユーザーが2B / 2C / 2Dのどれかを正式採用した後に別タスクで:

```text
selected-profile更新
→ 18 WAV再生成
→ #002 pronunciation override適用
→ production-speech manifest更新
→ SHA更新
→ Production Show rebuild
→ Voice Lab Production更新
→ 全test
→ 実演確認
```

を行う。

---

# 24. Tests

最低限:

1. retune候補3件
2. 2A baseline読込
3. 7 sample IDs
4. 2B〜2D × 7 = 21 WAV
5. #002 scriptTextは久安光
6. #002 synthesisTextはヒサヤス ヒカル
7. pronunciation override追跡可能
8. 他17台詞に意図しないoverrideなし
9. candidate values一致
10. output format 44.1kHz mono 16-bit
11. clippingなし
12. Production WAV変更なし
13. selected-profile変更なし
14. Production show変更なし
15. HIJACKED effect値変更なし
16. Voice Lab Production tab regressionなし
17. password protection regressionなし

既存:

```powershell
npm run check
npm run voice:profile:verify
npm run voice:production:verify
npm audit --omit=dev
```

もPASS維持。

---

# 25. Self Review

必ず自己批評する。

1. 2Aを正式Profileから外していないか
2. 18本を再生成していないか
3. #002表示をカタカナへ変えていないか
4. pronunciation overrideが将来も再現可能か
5. 「速さ」と「間」を同じ問題として処理していないか
6. intonationを下げすぎて不自然になっていないか
7. 2Dが比較用として十分差があるか
8. 2Bと2Cがほぼ同じになっていないか
9. 長文#004で聞き取りやすいか
10. #013で緊急感を消しすぎていないか
11. #016の間が長すぎないか
12. #008 + hijacked effectで明瞭度が落ちていないか
13. effect値を勝手に変えていないか
14. Production Samplerを壊していないか
15. password gateを壊していないか

問題があれば修正→再検証。

---

# 26. Git

作業branch:

```text
codex/voice-lab-production-sampler
```

または既存運用に合わせて子branchを切る場合:

```text
codex/voice-profile-retune
```

どちらを使うかは現在のworking treeとbranch状態を確認して安全に判断する。

禁止:

```text
master merge
release tag
force push
selected-profile正式更新
```

---

# 27. 最終報告

次の順で報告:

```text
1. Baseline / branch / HEAD
2. キャストフィードバック反映方針
3. 2A baseline
4. 2B
5. 2C
6. 2D
7. 7 sample lines
8. #002 pronunciation override
9. generated WAV count
10. duration comparison
11. pause comparison
12. HIJACKED comparison
13. Voice Lab UI
14. browser verification
15. tests
16. Production regression
17. Netlify draft URL
18. git diff
19. remaining user decision
20. USER REVIEW REQUIRED
```

---

# 28. STOP GATE

このタスクの終了条件:

```text
2B / 2C / 2D生成
→ 7台詞比較
→ Voice Lab VOICE RETUNE実装
→ browser確認
→ draft deploy
```

まで。

次はユーザー・キャストが聞いて選ぶ。

Codexは:

```text
2B / 2C / 2Dの正式採用
selected-profile更新
Production 18 WAV再生成
```

を勝手に行わない。

最終状態:

```text
USER REVIEW REQUIRED
```

で停止する。
