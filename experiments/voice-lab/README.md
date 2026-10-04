# Yokogawa AI Voice Lab

Phase CのProduction統合より先に、横川AIの素のVoice Profileを比較する独立実験環境です。`public/`、`src/`、Show Schema、Admin、Display、Free Speak、Audio Masterには接続しません。AivisSpeech Engineが停止している場合も、このCLIが明示的に失敗するだけで既存アプリへ影響しません。

Production Samplerは、確定済みの本番固定WAV 18本を検索・絞り込み・RAW／本番処理で試聴する静的サイトです。公演のネタバレを含むため、Netlifyではサイト全体を共有パスワードで保護します。

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

表示された `http://127.0.0.1:4174` はProduction Sampler、`/retune` は2A〜2Dの再調整比較、`/compare` は従来のRound 1 / Round 2比較です。生成済みWAVの試聴時はAivisSpeech Engineは不要です。

### Voice Retune（2A / 2B / 2C / 2D）

キャストフィードバックを比較する7台詞だけを、Productionとは分離した `output/retune-2026-10/` へ生成します。2Aは既存Production WAVをbaselineとしてコピーし、2B〜2DのみAivisSpeechで生成します。`selected-profile.json`、Production WAV、Production Showは変更しません。

```powershell
# AivisSpeech Engineが127.0.0.1:10101で起動している状態で、2B〜2Dの21本を生成・QA
npm run voice:lab:retune

# 生成済みWAVをローカル画面で比較
npm run voice:lab:review
# http://127.0.0.1:4174/retune
```

再生成せずQAだけ行う場合は `npm run voice:lab:retune:verify` を使います。候補値は `config/candidates-retune.json`、7台詞と #002 の発音指定は `config/samples-retune.json` が正本です。#002は画面上の「久安光」を維持し、合成時のみ「ヒサヤス ヒカル」を使います。

VOICE RETUNE画面では各台詞の個別再生と2A→2B→2C→2Dの連続比較ができます。#008のみRAW／本番再生を切り替えられ、本番再生には既存の `hijacked-subtle-v1` をそのまま適用します。

### Production Samplerの静的build

```powershell
npm run voice:lab:site:build
```

`dist/voice-lab/`へ18 WAVとsanitize済みJSONだけを生成します。台詞は`config/production-speech/yokogawa-ai-v1.json`、演出状態とeffectはProduction Show、Voice情報は`config/voice-profiles/yokogawa-professor-v1.json`から取得し、Sampler側へ手書きで複製しません。

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

Production Samplerの運用・更新手順は `docs/voice-lab-production-sampler.md`、Netlifyとパスワード保護は `docs/deployment/voice-lab-netlify.md` を参照してください。
