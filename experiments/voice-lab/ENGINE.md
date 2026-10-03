# Engine and model record

## Engine used for this evaluation

- Engine: AivisSpeech Engine
- Version: `1.1.0-dev`
- Endpoint: `http://127.0.0.1:10101`
- API: VOICEVOX-compatible `/speakers`, `/audio_query`, `/synthesis`
- Output selected by all Candidates: PCM WAV, 44,100 Hz, mono, 16-bit
- Production connection: none

The Engine executable, BERT cache, and AIVMX files are machine-local tools/data and are not stored in this repository. The runtime snapshot from `/version`, `/engine_manifest`, and `/speakers` is regenerated as `output/engine-info.json`.

## Candidate models installed for this evaluation

| Model | Version | Model UUID | Speaker UUID | Selected Style / API style ID |
|---|---:|---|---|---|
| [阿井田 茂](https://hub.aivis-project.com/aivm-models/47e53151-a378-46f3-abee-ce13aa07feb1) | 1.0.0 | `47e53151-a378-46f3-abee-ce13aa07feb1` | `561e4e59-3bc9-4726-9028-44a3c12a6f1d` | Calm / `1310138977` |
| [fumifumi](https://hub.aivis-project.com/aivm-models/71e72188-2726-4739-9aa9-39567396fb2a) | 1.0.0 | `71e72188-2726-4739-9aa9-39567396fb2a` | `754d769b-7128-4172-964e-b10945d55e39` | ノーマル / `606865152` |
| [ろてじん（長老ボイス）](https://hub.aivis-project.com/aivm-models/696c98a2-c0b7-4fe7-8cf2-c7e9b8a9bd82) | 1.0.0 | `696c98a2-c0b7-4fe7-8cf2-c7e9b8a9bd82` | `452fee2b-d102-4053-bccd-c0f8c265c147` | ノーマル / `391794336` |

All three models report Aivis Common Model License 1.0. Exact synthesis parameters are in `config/candidates.json`.

## Local setup note

This evaluation used the official Windows x64 portable distribution. On this machine, the bundled Hugging Face BERT bootstrap produced Windows cache links that could not be resolved. The fixed BERT revision requested by the Engine (`d701ec67708287b20d2063270f6b535e6eed09ab`) was downloaded from the official repository, verified against the published `model_fp16.onnx` SHA-256 (`23f633ae7c5900ff82b35a428b67a54e7e7911d5d6a6dcfc77967be8f1c94dc6`), and installed as ordinary cache files. This is machine setup only; no workaround is embedded in Production or Voice Lab code.

