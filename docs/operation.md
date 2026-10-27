# 起動と画面操作

会場では1台のWindows PCでサーバー・操作画面・投影画面を動かし、HDMIで映像と音声を出力します。

## 起動

Node.js 20以上を使用します。依存関係は `package-lock.json` に固定しています。

```powershell
npm ci
.\start-yokogawa-ai-single-pc.cmd
```

操作画面は `http://localhost:3000/admin`、投影画面は `http://localhost:3000/display` です。起動時には同梱のProduction Showが適用されます。PC本体にAdmin、拡張したセカンドモニターにDisplayを表示します。

1. WindowsでHDMIの映像・音声出力先を確認する。
2. DisplayでSキーを押し、音声設定を開く。初期状態は黒画面。
3. 音を出すDisplayをAudio Masterに指定する。
4. 25/25 Audio READYを確認し、「設定を保存して開始」を押す。
5. AdminでCue位置と本番前チェックを確認する。
6. P-V00で開演画面へ進み、舞台の合図に合わせてNEXTを実行する。

固定WAVの再生だけならAivisSpeechは不要です。Free Speakを使う場合は、同じPCでAivisSpeech Engineを起動します。既定接続先は `http://127.0.0.1:10101`、変更時は `AIVIS_ENGINE_URL` を指定します。

## 主な操作

| 操作 | 動作 |
|---|---|
| NEXT / Space | 次の有効Cueを実行 |
| BACK / B | Cue位置だけを戻す |
| REPLAY / R | 現在のCueを最初から実行 |
| STOP / Esc | 音声と進行中の演出を停止 |
| CLEAR / C | 字幕を消去 |
| BLACKOUT / RESTORE | 暗転・暗転前の表示に復帰 |

文字入力中はショートカットを抑止します。場面を選んだリハーサル開始では、それ以前の表示状態を復元します。ブラウザーを再読み込みした場合は、音声準備をやり直します。

## 運用記録

- [会場での設営・出力確認](production/single-pc-runbook.md)
- [24 Cue版の演出とタイミング](production/post-show-candidate-operation-20261017.md)
- [緊急時の予備WAV・静止画運用](production/emergency-backup-operation-20261016.md)
- [投影画面の録画方法](production/display-recording.md)

上記の詳細記録には旧版の件数・候補段階の記述も含まれます。現行は24 Cue・25音声アセットです。同梱の音声は調整済みなので、再生確認のために生成コマンドを実行する必要はありません。

[作品紹介](../README.md) · [資料一覧](README.md)
