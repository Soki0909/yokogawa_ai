# Technical generation results

Generated on 2026-10-02 with AivisSpeech Engine `1.1.0-dev`. Technical QA passed for all 30 files. This report does not rank voice quality or select a final Yokogawa AI Voice Profile.

| Candidate | Generated / expected | Format | Duration range | Maximum peak | Minimum RMS | Max leading / trailing silence | Full-scale samples | Result |
|---|---:|---|---:|---:|---:|---:|---:|---|
| candidate-a-aida-calm | 10 / 10 | 44.1 kHz, mono, 16-bit PCM | 1.860–18.380 s | 0.950 | 0.100 | 0.110 / 0.200 s | 0 | PASS |
| candidate-b-fumifumi-normal | 10 / 10 | 44.1 kHz, mono, 16-bit PCM | 1.480–21.290 s | 0.950 | 0.120 | 0.110 / 0.200 s | 0 | PASS |
| candidate-c-rotejin-elder | 10 / 10 | 44.1 kHz, mono, 16-bit PCM | 2.300–25.690 s | 0.950 | 0.120 | 0.290 / 0.340 s | 0 | PASS |

## Checks performed

- RIFF/WAVE structure and PCM 16-bit parse: PASS
- All 10 canonical lines generated for every Candidate: PASS
- Non-silent signal by peak and RMS: PASS
- Consistent sample rate, channel count, and bit depth within each Candidate: PASS
- No sample at full-scale clipping value: PASS
- Leading silence at most 1.0 s and trailing silence at most 1.5 s: PASS
- Duration greater than 0.2 s and less than 120 s: PASS
- `03-normal-long.wav` generated and passed every check for all Candidates: PASS
- Voice identity configuration is fixed to one model / speaker / style ID per Candidate in generation metadata: PASS

Machine-readable details are in ignored, reproducible `output/qa-report.json` and `output/generation-run.json`.

