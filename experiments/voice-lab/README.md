# Yokogawa AI Voice Lab

Phase CのProduction統合より先に、横川AIの素のVoice Profileを比較する独立実験環境です。`public/`、`src/`、Show Schema、Admin、Display、Free Speak、Audio Masterには接続しません。AivisSpeech Engineが停止している場合も、このCLIが明示的に失敗するだけで既存アプリへ影響しません。

## 評価範囲

- 対象: 上演台本に存在する正本10台詞 × 絞り込んだ複数Candidate
- 比較: model / speaker / style / speed / pitch / intonation / volume / synthesis parameters
- 優先事項: 状態別DSPを加えない、同じ素声で横川AIとして成立するかを聞く
- 今回しないこと: Production統合、全台詞生成、jamming、HOSTILE演技加工

## 採用Voice Profile

2026-10-03のユーザー試聴により、Round 2 Candidate 2A（阿井田 茂 / Calm）を横川AIのVoice Profileとして確定しました。完全な設定値は `config/selected-profile.json` を正本とします。これはVoice Lab内の選定記録であり、Phase C Productionコードにはまだ反映していません。

## 前提

1. AivisSpeech Engineを起動し、`http://127.0.0.1:10101` で待ち受けさせます。
2. `config/candidates.json` に記録されたモデルがEngineへインストール済みである必要があります。
3. Node.js 20以上を使用します。追加npm dependencyはありません。

今回使用したEngine version、モデルUUID、speaker UUID、style IDは `ENGINE.md`、Candidate比較は `CANDIDATES.md`、実測QA結果は `TECHNICAL-RESULTS.md` に記録しています。

AivisSpeech EngineはVOICEVOX互換の `/audio_query` と `/synthesis` を利用します。AivisSpeechでは `intonationScale` は単純な抑揚量ではなく、選択Styleの感情表現の強さです。このLabでは値をCandidate設定に固定し、生成metadataへ残します。

## 実行

repository rootから:

```powershell
npm run voice:lab
```

### ブラウザで聴き比べる

```powershell
npm run voice:lab:review
```

表示された `http://127.0.0.1:4174` をブラウザで開きます。Round 1 / Round 2を切り替え、個別のWAVをワンクリック再生するか、同じ台詞の3候補を順番に再生できます。AivisSpeech Engineは不要です。

個別コマンド:

```powershell
node experiments/voice-lab/scripts/voice-lab.mjs inspect
node experiments/voice-lab/scripts/voice-lab.mjs generate
node experiments/voice-lab/scripts/voice-lab.mjs verify
```

ユーザー試聴結果を反映した第2ラウンド（阿井田 茂の声質を固定し、より無機質にした3候補）は次で生成します。

```powershell
npm run voice:lab:round2
```

Round 2の意図と比較値は `ROUND-2.md`、出力は `output/round-2/` に分離されます。

`inspect` はEngine version、manifest、利用可能モデル/Styleを `output/engine-info.json` に保存します。`generate` は全Candidateで同じ10台詞を生成し、`verify` はWAV構造、無音、format一貫性、clipping、前後silence、長文生成を検査します。

## 正本と設定

- `config/samples.json`: ユーザー指定の上演台本10台詞。文言を変更しない正本。
- `config/candidates.json`: Candidateと完全なsynthesis parameter。
- `config/selected-profile.json`: ユーザーが確定した採用Voice Profile。Production統合状態も明記。
- `config/engine.json`: Engine接続先とtimeout。

## 生成物とGit管理

`output/` は再生成可能なWAV、Engine情報、生成metadata、QA reportを置く領域です。WAVとモデル本体は容量・環境依存性が大きいため、Voice Lab直下の `.gitignore` で `output/` をGit管理外にします。空ディレクトリ維持用の `.gitkeep` のみ管理します。

各Candidateの出力:

```text
output/
├─ engine-info.json
├─ generation-run.json
├─ qa-report.json
├─ candidate-a/
│  ├─ 01-normal-short.wav
│  ├─ ...
│  ├─ 10-shutdown.wav
│  └─ generation-metadata.json
└─ ...
```

## 聞き比べ方

最初に各Candidateの `01-normal-short.wav`、`02-normal-conversation.wav` を横並びで聞き、低い男性声、教授らしい重厚感、知性、一定感、明瞭さを確認します。次に `03-normal-long.wav` で長文の安定性、`09-hostile.wav` で怒鳴らず同じ人物のまま危険な命令を淡々と実行できるか、`10-shutdown.wav` で句読点と長い間の扱いを比較してください。

技術QAは音声ファイルの健全性のみを判定します。「横川AIとして最も良い声」の判断は行いません。
