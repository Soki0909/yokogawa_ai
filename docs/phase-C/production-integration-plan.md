# Phase C — Production Integration

Status: **Implementation candidate / USER REVIEW REQUIRED**

Phase B / v0.6.0を基準にProduction Integrationを実装した。正式tagは作成せず、実機でのVoice Reviewと通し稽古を待つ候補版として扱う。実装詳細は [`implementation.md`](implementation.md)、検証根拠は [`verification.md`](verification.md) を参照する。

## Voice production policy

### Scripted Speech

台本で確定している横川AIの発話は、事前生成した固定音声ファイルを本番標準とする。原則WAVとし、本番Cueは`audio-file`を使用する。

目的:

- PCやBrowserによって声を変えない。
- 常に同じ横川AI Voice Profileを再生する。
- 本番品質、音量、間を事前確認できる。
- インターネットなしで再現可能にする。

### Emergency / Free Speak

想定外の発話、Free Speak、緊急発話は、Server-sideのLocal TTS Providerを使用する。

- Browser依存Voiceを使用しない。
- 同一Voice Profileを固定し、可能な限り事前生成WAVと同一人物に聞こえるようにする。
- インターネットを必須にしない。
- Local TTSが利用不能な場合、Browser TTSへ暗黙fallbackしない。
- Operatorへ利用不能理由と復旧方法を明確に表示する。

Browser Speech Synthesisを残す場合もdevelopment / optional fallback用途に限定し、production標準経路では原則disabledとする。

## Provider boundary

```text
Voice Provider
├─ Audio File Provider
├─ Local TTS Provider
└─ Browser TTS Provider
   └─ development / optional only
```

Production設定の方向性:

```text
scripted speech  = audio-file
free speak       = local-tts
emergency speech = local-tts
browser tts      = productionでは原則disabled
```

TTS Engine固有APIをCue、Admin、Displayへ直接漏らさず、Providerを差し替えられる境界を維持する。Audio Master、STOP、REPLAY、Lip Sync、Preflight、エラー通知はProvider共通契約として扱う。

## Yokogawa AI voice direction

基本Voice Profileは、低い男性声、教授らしい、落ち着いている、知的、重厚、過剰な芝居をしない、AIらしい一定感がある方向とする。Visualと同様、状態によって人格そのものは変化しない。

- NORMAL: 落ち着き、知的、安定。
- WARNING: 同じ人物の声のまま、警告として明瞭にする。
- HIJACKED: 同じ人物を維持し、必要な場合だけ軽い通信異常・system interferenceを加える。
- HOSTILE: 怒鳴る、怒る、悪役化する表現を避け、無機質かつ強く危険な命令を淡々と実行する。
- SHUTDOWN: 停止・途切れを演出可能にする。
- RECOVERY: 元の安定した声へ段階的に戻す。

## Implemented order

1. Audio Architecture正式仕様化
2. Local TTS Provider設計・実装
3. 横川AI Voice Profile策定
4. 最新上演台本から横川AI全Cue抽出
5. Production Cue設計
6. 代表的な5〜10台詞のみ音声生成
7. 実際のVisualと合わせてVoice Review
8. Voice Profile確定
9. 全台詞WAVを再現可能な方法で一括生成
10. WAVをAsset Registryへ統合
11. Production Show File作成
12. Free SpeakをLocal TTSへ統合
13. Audio Preflight強化
14. 実ブラウザ・実機検証
15. 通し稽古でCue timing / 音量 / 演者との間を調整

順序の重要原則:

```text
Voice architecture
→ 少数の代表音声
→ ユーザーVoice Review
→ Voice確定
→ 全台詞生成
```

代表音声によるVoice Labとユーザー選定を先に完了し、その正本から全18台詞を生成した。Production Show FileはPhase A demoと分離し、`shows/phase-a-demo.json`を上書きしていない。

## Candidate stop gate

- HIJACKED / HOSTILE / SHUTDOWN固有のVoice DSP
- 正式`v0.7.0` tag
- `master`へのmerge
- 実会場PAでの音量・間・演者とのタイミング確定

現在のGoogle Docs台本revisionを正とし、台本文面自体は変更していない。横川ルート固有台詞の配置は推測せず、別Show Fileとして保留している。
