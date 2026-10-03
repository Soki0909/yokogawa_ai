# Candidate comparison

AivisHubで利用可能なモデルから、横川AIの方向性に関連する年齢・声質分類を持つ3系統へ絞った。これは試聴前の技術的な候補選定であり、採用順位ではない。

| Candidate | Model / speaker | Style | speed | pitch | intonation | tempo dynamics | volume | pre / post | pause | output |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A | 阿井田 茂 | Calm | 0.92 | -0.03 | 0.78 | 0.82 | 0.95 | 0.10 / 0.18 s | auto × 1.05 | 44.1 kHz mono |
| B | fumifumi | ノーマル | 0.90 | -0.04 | 0.78 | 0.82 | 0.95 | 0.10 / 0.18 s | auto × 1.05 | 44.1 kHz mono |
| C | ろてじん（長老ボイス） | ノーマル | 0.94 | 0.00 | 0.72 | 0.80 | 0.95 | 0.10 / 0.18 s | auto × 1.05 | 44.1 kHz mono |

## Candidate rationale

- A: 中年男性のバリトンモデル。`Calm` を用い、強い演技を避ける。
- B: 壮年男性に分類される落ち着いた声。話速とpitchをわずかに下げ、教授らしい重さを比較する。
- C: 熟年男性モデル。元の年齢感を保つためpitchは変更せず、感情強度とtempo変動を抑える。

全Candidateで同じ10台詞を使用し、状態別DSP、jamming、怒鳴り・悪役化の加工は行わない。AivisSpeechにおける `intonationScale` はStyleの感情表現強度であり、単なる抑揚量ではない。

完全な識別子、model version、speaker UUID、style ID、出典、licenseは `config/candidates.json` を正本とする。
