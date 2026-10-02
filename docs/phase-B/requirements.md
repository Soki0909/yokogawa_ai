# Phase B 実装要件（運用用チェックリスト）

この文書は正本2ファイルを実装・検証時に参照しやすく整理したチェックリストです。矛盾時は次の正本を優先します。

- [`yokogawa_ai_phase_b_autonomous_visual_spec_v1.0.md`](yokogawa_ai_phase_b_autonomous_visual_spec_v1.0.md)
- [`codex_yokogawa_ai_phase_b_autonomous_visual_prompt_v1.0.md`](codex_yokogawa_ai_phase_b_autonomous_visual_prompt_v1.0.md)

## 実装範囲

- Phase A / `v0.5.0`のShow制御、Schema v2/v3、複数Display、Audio Master、再接続、BLACKOUTを後方互換で維持する。
- `normal / warning / hijacked / hostile / shutdown / recovery`の6 Presetを、色だけでなく構図・密度・motion・status geometryで識別可能にする。
- Avatarと字幕を主役として維持し、演出はCSS token、transform、opacity中心で構成する。
- anomaly、takeover、Final Challenge、auth-success、unlock、emergency-interrupt、hostile-enter、shutdown、recovery、normalizeを決定的な一時演出として実装する。
- Unlockを0〜100%、成功保持、緊急中断、再接続、別状態移行時のcleanupまで一貫させる。
- Operation Overlay、Scene Visual、Transition、BLACKOUTのlayer契約を守る。
- `prefers-reduced-motion`とShow設定のreduced motionで意味を失わずmotionを停止する。
- 1280×720と1920×1080相当でclipping、overlap、scrollを発生させない。

## 検証と成果物

- Phase Aの71 testを維持し、Phase B固有のDOM、z-index、cleanup、unlock、shutdown、recovery、reduced-motion契約を追加する。
- Admin 1台 + Display 3台で主要状態、個別送信、Audio Master、切断・再接続、BLACKOUT / RESTOREを実ブラウザ確認する。
- console warning 0 / error 0、30分soak failure 0、重大audit問題なしを確認する。
- 状態画像、遷移フレーム、contact sheet、self-critique、review guide、verification、RC notesを残す。
- `v0.5.0`を変更せず、全条件達成後だけannotated tag `v0.6.0-rc.1`を作る。これは最終Visual承認ではない。

## 終了表現

> Phase B autonomous visual candidate complete / user visual review pending

