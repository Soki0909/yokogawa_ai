# 横川AI ドキュメント索引

実行・公演運用の入口は、プロジェクトルートの [`README.md`](../README.md) です。
このディレクトリには、開発フェーズごとの要件正本、実装指示、検証記録を保管します。

| フェーズ | 要件正本 | 実装プロンプト | 検証記録 | Git基準点 |
|---|---|---|---|---|
| Phase 1 | [`phase-1/requirements.md`](phase-1/requirements.md) | [`phase-1/implementation-prompt.md`](phase-1/implementation-prompt.md) | `v0.1.0` タグ時点の旧 `VERIFICATION.md` | `v0.1.0` |
| Phase 2 | [`phase-2/requirements.md`](phase-2/requirements.md) | [`phase-2/implementation-prompt.md`](phase-2/implementation-prompt.md) | [`phase-2/verification.md`](phase-2/verification.md) | `v0.2.0` |
| Phase 3 | [`phase-3/yokogawa_ai_phase3_requirements.md`](phase-3/yokogawa_ai_phase3_requirements.md) | [`phase-3/codex_phase3_implementation_prompt.md`](phase-3/codex_phase3_implementation_prompt.md) | [`phase-3/verification.md`](phase-3/verification.md) | `v0.3.0` |
| Phase 4 | [`phase-4/yokogawa_ai_phase4_requirements.md`](phase-4/yokogawa_ai_phase4_requirements.md) | [`phase-4/codex_phase4_implementation_prompt.md`](phase-4/codex_phase4_implementation_prompt.md) | [`phase-4/verification.md`](phase-4/verification.md) | `v0.4.0` |
| Phase 4.1 | [`phase-4-1/yokogawa_ai_v0_4_1_requirements.md`](phase-4-1/yokogawa_ai_v0_4_1_requirements.md) | [`phase-4-1/codex_v0_4_1_implementation_prompt.md`](phase-4-1/codex_v0_4_1_implementation_prompt.md) | [`phase-4-1/verification.md`](phase-4-1/verification.md) | `v0.4.1` |
| Phase 4.2 | [`phase-4-2/yokogawa_ai_v0.4.2_visual_overhaul_requirements.md`](phase-4-2/yokogawa_ai_v0.4.2_visual_overhaul_requirements.md) | [`phase-4-2/codex_v0.4.2_visual_overhaul_prompt.md`](phase-4-2/codex_v0.4.2_visual_overhaul_prompt.md) | [`phase-4-2/verification.md`](phase-4-2/verification.md) | `v0.4.2` |
| Phase A | [`phase-A/yokogawa_ai_phase_a_spec_v1.0.md`](phase-A/yokogawa_ai_phase_a_spec_v1.0.md) | [`phase-A/codex_yokogawa_ai_phase_a_prompt_v1.0.md`](phase-A/codex_yokogawa_ai_phase_a_prompt_v1.0.md) | [`phase-A/verification.md`](phase-A/verification.md) | `v0.5.0` |
| Phase B | [`phase-B/yokogawa_ai_phase_b_autonomous_visual_spec_v1.0.md`](phase-B/yokogawa_ai_phase_b_autonomous_visual_spec_v1.0.md) | [`phase-B/codex_yokogawa_ai_phase_b_autonomous_visual_prompt_v1.0.md`](phase-B/codex_yokogawa_ai_phase_b_autonomous_visual_prompt_v1.0.md) | [`phase-B/verification.md`](phase-B/verification.md) | `v0.6.0-rc.1` |

Phase A / `v0.5.0`がVisual承認済みの保護基準です。Phase B / `v0.6.0-rc.1`は自律Visual候補であり、ユーザーVisual Review待ちです。過去Phaseの正本と検証記録は実行コードから分離し、内容とGit基準点を保持しています。
