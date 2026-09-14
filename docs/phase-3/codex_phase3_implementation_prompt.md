# Codex 実装プロンプト
## 横川AI Phase 3 / v0.3.0 — 本番オペレーション強化版

あなたは `yokogawa_ai` リポジトリの Phase 3 を、設計・実装・テスト・実機相当検証・ドキュメント更新・Git整理・push・tag作成まで自律的に完了してください。

今回の目的は、機能を派手に増やすことではありません。

> Phase 2で完成したShow Control基盤を、  
> 本番で他のスタッフに安心して任せられる状態へ仕上げること

がPhase 3の目的です。

---

# 0. 最初に必ず読むもの

作業開始時に、リポジトリ内の以下を確認してください。

1. `yokogawa_ai_phase3_requirements.md`
2. Phase 2要件定義書
   - 例: `yokogawa_ai_phase2_requirements.md`
3. Phase 2実装プロンプト
   - 例: `codex_phase2_implementation_prompt.md`
4. `README.md`
5. `VERIFICATION.md`
6. `package.json`
7. 現在のサーバー実装
8. Admin UI
9. Display UI
10. WebSocket protocol / message定義
11. state / storage層
12. tests
13. TTS adapter / provider境界
14. Git log / tags / current branch / remote

ファイル名が多少違う場合は、リポジトリ内を調べて対応するものを特定してください。

`set_goal` が利用可能なら、最初に以下相当のGoalを設定してください。

> Phase 3 / v0.3.0を要件定義書の完成条件まで実装し、既存Phase 2機能を壊さず、ブラウザ・複数Display・LAN・長時間試験を通し、README/VERIFICATIONを更新し、remote pushとv0.3.0 tag作成まで完了する。

`set_goal` がない場合は、同等の内部Goalを保持してそのまま進めてください。

---

# 1. ユーザー確認について

原則として、途中でユーザーへ質問しないでください。

要件定義書、既存実装、既存設計から合理的に判断し、自律的に進めてください。

細部に複数の実装方法がある場合は、

1. 既存設計との整合
2. 本番安定性
3. 誤操作防止
4. 後方互換性
5. 単純さ
6. 将来拡張性

の順で判断してください。

本当に作業続行不能な情報不足のみ質問対象とし、それ以外は自分で決めてください。

---

# 2. 重要な前提

Phase 2 / v0.2.0では既に以下が完成しています。

- LAN Admin
- Multiple Display Clients
- Display registration
- Heartbeat / Offline detection
- Broadcast
- Individual target
- Audio Master
- Fixed Cue
- Scene
- NEXT / BACK / REPLAY
- Free Speak
- Show Reset
- reconnect / state sync
- Browser TTS Provider boundary
- JSON persistence boundary
- Render-compatible host / port / ws-wss design
- multiple-display tests

また、KIT-WLAP2上で実際に端末間通信できることは既に確認済みです。

したがって、Phase 3ではLAN機能を作り直さないでください。

既存基盤を活かし、

- 本番モード
- 本番前チェック
- 配信先セット
- 設営・接続支援
- 安全性

を中心に強化してください。

---

# 3. 絶対に守ること

## 3.1 Phase 2を壊さない

`v0.2.0` tagを確認してください。

Phase 2の既存機能を維持してください。

Phase 3実装により、

- Broadcast
- individual targeting
- Free Speak
- Audio Master
- Cue
- Scene
- History
- Reset
- reconnect
- Browser TTS

が失われてはいけません。

## 3.2 演出を勝手に決めない

Phase 3では以下を本格実装しないでください。

- 横川AIアバター
- リップシンク
- 暴走デザイン
- グリッチ演出
- VOICEVOX
- 本番脚本依存Cue
- 横川教授の人物表現

今回作るのは演出そのものではなく、演出を安全に操作する基盤です。

## 3.3 インターネット不要を維持

QRコード生成等を含め、本番の基本機能が外部APIやCDNに依存してはいけません。

必要ライブラリを追加する場合も、runtimeで外部アクセスを要求しないものにしてください。

## 3.4 localhostをハードコードしない

現在のLAN / Render互換方針を維持してください。

---

# 4. 実装順序

以下の順で進めることを推奨します。

## Stage A — 現状監査

- git status
- current branch
- tags
- remote
- Phase 2 tests
- architecture
- state schema
- protocol
- UI
- Browser TTS behavior

を確認してください。

作業開始時点のPhase 2が壊れていないことをテストしてください。

もし既存テストが開始時点で失敗する場合は、Phase 3起因か既存問題かを明確に分離してください。

---

## Stage B — データモデル / protocol設計

以下を既存設計へ最小変更で追加してください。

- required / optional Display
- Audio Ready runtime state
- Target Group / 配信先セット
- Cue target group
- preflight status
- 本番モード用state

必要なschema migrationまたはnormalize処理を実装し、Phase 2データを読み込めるようにしてください。

---

## Stage C — 配信先セット

最初にバックエンド・protocol・storageを完成させてください。

必要機能:

- create
- update
- delete
- list
- enable / disable
- Cueから参照
- group宛Cue送信
- group内一部Offline
- Display rename耐性
- Display delete整合

IDで参照し、名前文字列をキーにしないでください。

---

## Stage D — Audio Ready / Preflight

Display側でBrowser TTSが実際に発話可能な状態かをServerへ通知してください。

重要:

- Display connected != audio ready
- Audio Master online != audio ready

です。

Adminから、

- Audio Master Online
- Audio Ready
- required Display
- optional Display
- Cue存在
- current position

等を確認できるpreflight stateを作ってください。

総合判定:

- READY
- WARNING
- NOT READY

等、意味が明確な表現を使ってください。

要件定義書のERROR / WARNING条件を満たしてください。

---

## Stage E — 本番モード

Admin UIに本番モードを実装してください。

最優先情報:

1. 現在Scene
2. 現在Cue
3. NEXT
4. 次Cue
5. Display / Audio警告
6. BACK / REPLAY / STOP

高度機能は隠すか、明確に別領域にしてください。

### UI自己批評

実際にブラウザで開き、

- PC幅
- スマートフォン幅

の両方を確認してください。

「照明等を担当する人が初見で本番中に使う」という前提で自己批評してください。

特に:

- NEXTがどれか一瞬で分かるか
- 現在Cueと次Cueを間違えないか
- Offline警告が見落とされないか
- 危険操作がNEXTの近くにないか
- スマホでボタンが小さすぎないか
- 横スクロールしていないか
- Cue本文が長い場合に破綻しないか

を確認し、問題があれば自分で修正してください。

---

## Stage F — 接続支援

起動時・Adminから以下を確認できるようにしてください。

- Local Admin URL
- Local Display URL
- LAN Admin URL
- LAN Display URL
- IPv4候補

QRコードもローカル生成してください。

Display URL用QRとAdmin URL用QRを区別してください。

複数NICがある環境を想定し、VPN / virtual adapter等で誤案内しにくい実装にしてください。

完璧なNIC判定が難しい場合は、複数候補を明示してユーザーが選べる方が安全です。

---

# 5. 本番モードの設計思想

Phase 3で最も重要です。

「管理画面」ではなく「Show Control」として考えてください。

通常本番ではオペレーターが、

> NEXT

を中心に進められることを目指します。

Cueには送信先が事前設定されているため、本番中に毎回Displayを選択させないでください。

例:

```text
SCENE: 授業
CURRENT: Cue 04
「それでは次の問題を見てください」

TARGET: 201 + 館内

                 [ NEXT ]

NEXT: Cue 05
「……異常を検知しました」

[BACK] [REPLAY] [STOP]
```

これは例です。
既存デザインに合わせてより良いUIにして構いません。

---

# 6. 誤操作対策

実装時に必ず考慮してください。

最低限:

- NEXT連打
- Show Reset誤操作
- Cue編集誤操作
- target変更誤操作
- Offline Display
- target 0台
- Audio Master Offline
- Audio not ready
- Admin reload
- Display reload

を安全に扱ってください。

NEXTの二重送信対策は、UXとserver側の両方を見て合理的に実装してください。

ただし過剰な確認ダイアログで本番進行を遅くしないでください。

---

# 7. 音声テスト

本番前にAudio Masterから音が出ることを確認できる仕組みを用意してください。

条件:

- current Cue positionを変えない
- Historyを本番Cue実行と混同しない
- targetを誤って館内全体へ出さない
- テストであることが明確

既存のSpeech pipelineを安全に再利用して構いません。

---

# 8. テスト

## 8.1 既存テスト

Phase 2の全テストを維持してください。

開始時と完成時の両方で確認してください。

## 8.2 新規自動テスト

要件定義書のT301〜T305相当を実装してください。

テスト数そのものを目的にしないでください。
重要な状態遷移と回帰をカバーしてください。

## 8.3 ブラウザテスト

最低構成:

- Admin 1
- Display A = 201
- Display B
- Display C

以下を実ブラウザ相当で確認してください。

### Scenario A — 本番モード
- open
- NEXT
- BACK
- REPLAY
- STOP

### Scenario B — Preflight all ready
全てREADYになる。

### Scenario C — Audio not ready
Audio MasterはOnlineだが音声未有効。
WARNING / NOT READYを確認。

### Scenario D — Required Display offline
本番開始不可または重大警告になる。

### Scenario E — Optional Display offline
WARNINGになるがシステム全体は使用可能。

### Scenario F — Target Group
A+Bへ送信。
Cへは送信されない。

### Scenario G — Group partial offline
Bを切断。
Aには送信される。
Adminに警告。

### Scenario H — Audio Master disconnect
自動変更しない。
Adminに重大警告。

### Scenario I — Display reconnect
同じDisplay IDで復帰。

### Scenario J — Admin reload
Cue位置維持。

### Scenario K — Display reload
字幕状態同期。
過去音声を勝手に再生しない。

### Scenario L — Free Speak
Cue positionを変更しない。

### Scenario M — Show Reset
確認あり。
定義データを消さない。

### Scenario N — Smartphone
狭いviewportで本番操作可能。

### Scenario O — QR / LAN URL
QRに正しいLAN URLが含まれる。

### Scenario P — Legacy state
Phase 2形式をロードできる。

---

# 9. 長時間試験

Phase 2と同等に、30分を目安としてAdmin 1 + Display 3でsoak testを行ってください。

自動化できる部分は自動化してください。

試験中に以下を混在させてください。

- NEXT
- BACK
- REPLAY
- STOP
- group
- ALL
- individual
- Free Speak
- reconnect
- required offline
- optional offline
- Audio Master change / disconnect
- preflight checks

最低限ログに残す:

- duration
- total events
- failures
- reconnect count
- offline detection
- Audio Master events
- target-group events
- RSS start/end/delta
- abnormal exit有無

異常があれば原因を修正して再実行してください。

---

# 10. LAN確認

Phase 3変更後も別端末アクセス可能であることを確認してください。

可能であれば実NICを使用して:

- Admin HTTP
- Display HTTP
- WebSocket
- Cue send
- target group
- Audio Master

を確認してください。

KIT-WLAP2固有のコードは書かないでください。

READMEには、

> KIT-WLAP2上で端末間通信できることは実機確認済み

と事実として記載して構いません。

ただし、
「大学の全環境で必ず動く」等の過剰な保証は書かないでください。

---

# 11. セキュリティ / 品質

少なくとも以下を確認してください。

- `npm audit --omit=dev`
- syntax / lint相当
- malformed WebSocket message
- unknown Display ID
- unknown Target Group
- target group with deleted Display
- empty target
- state file corruptionへの既存方針
- browser console errors
- server unhandled rejection / exception

Phase 3追加コードによって新しい高リスク脆弱性を導入しないでください。

---

# 12. Git運用

開始時:

1. `git status`
2. `git log --oneline --decorate -n ...`
3. `git tag`
4. `git remote -v`
5. `v0.2.0`確認

を行ってください。

作業は意味のある単位でcommitしてください。

例:

- target groups
- preflight/audio-ready
- show mode UI
- LAN/QR onboarding
- tests
- docs

ただし無意味にcommitを細分化しすぎないでください。

適切なタイミングでremoteへpushしてください。

Phase 3完成条件を満たすまでは `v0.3.0` を打たないでください。

完成後:

- full tests PASS
- browser verification PASS
- soak PASS
- docs updated
- working tree clean
- local HEAD == remote target branch

を確認し、

`v0.3.0`

tagを作成・pushしてください。

既に同名tagがある場合は勝手に上書きせず、状況を調査してください。

---

# 13. README更新

READMEを初見スタッフにも理解できるよう更新してください。

最低限:

## Overview
横川AI Show Controlとは何か。

## Architecture
Admin / Server / Displays / Audio Master。

## 本番モード
どう操作するか。

## 本番前チェック
何を確認すればREADYか。

## 配信先セット
何のために使うか。

## Setup
1. Server起動
2. LAN URL確認
3. Displays接続
4. Audio有効化
5. Preflight
6. Show mode
7. Start

## KIT-WLAP2
実機端末間通信確認済みという事実。

## Troubleshooting
- Display offline
- Audio not ready
- Audio Master offline
- IP changed
- QR URL unusable
- server restart
- browser reload

## Phase 3 Scope
アバターや暴走演出はまだ本実装していないこと。

---

# 14. VERIFICATION更新

Phase 3の検証証跡を具体的に残してください。

「確認した」ではなく、

- command
- result
- count
- scenario
- browser configuration
- LAN configuration
- soak result
- known limitations

を記載してください。

要件定義書の60受入条件について、PASS / FAIL / N/Aと証拠を整理してください。

N/Aを乱用しないでください。

---

# 15. 完成前の自己レビュー

実装完了したと思っても、そのまま終了しないでください。

以下の観点で自己レビューしてください。

## 技術
- Phase 2を壊していないか
- state migrationは安全か
- reconnectで壊れないか
- group targetで二重送信されないか
- Admin reloadに耐えるか

## 本番運用
- 初見スタッフがNEXTを迷わないか
- 何か切れたとき異常に気づけるか
- 本番開始前に不足端末が分かるか
- Audioが出ない事故を事前検知できるか
- Cue送信先を本番中に考えなくてよいか
- 危険操作が誤タップされにくいか

## UI
- desktop
- smartphone
- long cue text
- many displays
- warning state
- dark room / projector-adjacent operationを想定した可読性

問題を見つけたら自分で修正し、再テストしてください。

---

# 16. 完了報告

最終報告には以下を含めてください。

1. Phase 3で実装したもの
2. 主要な設計判断
3. 自動テスト結果
4. Browser test結果
5. Admin 1 + Display 3結果
6. smartphone確認
7. LAN確認
8. 30分soak結果
9. `npm audit`結果
10. README / VERIFICATION更新
11. Git commit / branch / remote
12. `v0.3.0` tag
13. working tree clean確認
14. Phase 3受入条件のPASS数
15. 実機会場でのみ残る確認事項
16. Phase 4まで保留した演出項目

---

# 17. 完成条件

`yokogawa_ai_phase3_requirements.md` の受入条件をすべて確認し、Phase 3として合理的に完了していること。

部分実装の状態で「完成」としないでください。

一方で、Phase 4対象の演出を先回りして作り込まないでください。

今回のゴールは、

> 「横川AIを本番でどう見せるか」がまだ最終決定していなくても、  
> 決まった演出をスタッフが安全・簡単に運用できるShow Control基盤を完成させること

です。

ユーザー確認を待たず、可能な範囲を最後まで自律的に進めてください。
