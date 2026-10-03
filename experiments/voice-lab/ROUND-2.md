# Round 2 — mechanical voice comparison

## User feedback reflected

Round 1ではCandidate A（阿井田 茂 / Calm）の声質が最も良かった。一方、横川AIにはさらに無機質な人工音声らしさが必要という評価を受けた。

Round 2では別の話者へ広げず、阿井田 茂の低い中年男性声を固定する。DSPは使わず、AivisSpeechの素のsynthesis parameterとStyleだけで人工的な一定感を比較する。

| Candidate | Style | speed | pitch | style strength | tempo dynamics | 狙い |
|---|---|---:|---:|---:|---:|---|
| 2A | Calm | 0.93 | 0.00 | 0.45 | 0.20 | Aの良さを保った控えめな無機質化 |
| 2B | Calm | 0.96 | 0.00 | 0.15 | 0.05 | 同じ声で強く平坦化 |
| 2C | Heavy | 0.96 | 0.00 | 0.15 | 0.05 | 重厚感を増しつつ強く平坦化 |

`pitchScale` は音声合成後の加工で、0から変更すると音質劣化の可能性があるためRound 2では全候補0とする。`tempoDynamicsScale` は値が大きいほど早口で生っぽい抑揚になるため、人工的な一定感を狙って小さくする。AivisSpeechでは `pauseLength` / `pauseLengthScale` は互換フィールドとして存在するが合成結果には影響しない。

## Generate and verify

```powershell
npm run voice:lab:round2
```

出力先は `output/round-2/`。Round 1のWAVは上書きしない。

## Technical results

2026-10-02に全30 WAVを生成し、全候補で技術QAに合格した。声の好みや採用順位は判定していない。

| Candidate | Generated | Format | Duration range | Max peak | Min RMS | Max leading / trailing silence | Full-scale samples | Result |
|---|---:|---|---:|---:|---:|---:|---:|---|
| 2A | 10 / 10 | 44.1 kHz, mono, 16-bit PCM | 1.802–18.552 s | 0.950 | 0.109 | 0.108 / 0.201 s | 0 | PASS |
| 2B | 10 / 10 | 44.1 kHz, mono, 16-bit PCM | 1.699–18.008 s | 0.950 | 0.113 | 0.105 / 0.188 s | 0 | PASS |
| 2C | 10 / 10 | 44.1 kHz, mono, 16-bit PCM | 1.801–18.066 s | 0.950 | 0.121 | 0.113 / 0.188 s | 0 | PASS |

Engine logでも2B/2Cの `Style Weight: 0.15`、`Tempo Dynamics: 0.01 (Input: 0.05)`、`Pitch: 1.00 (Input: 0.00)` を確認した。

## Selection

2026-10-03のユーザー試聴により、Candidate 2Aを横川AIのVoice Profileとして確定した。設定の正本は `config/selected-profile.json`。Phase C Productionコードへの統合は未実施。
