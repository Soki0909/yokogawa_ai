# Codex実装プロンプト
## 横川AI Phase 2 — ローカルLAN・マルチディスプレイ・固定Cue対応

このディレクトリは `yokokawa_ai` プロジェクトのルートです。

Phase 1のMVPはすでに完成しています。  
今回の目的は、新規プロジェクトを作り直すことではなく、**既存実装を壊さずにPhase 2へ改良すること**です。

この作業は短い修正ではなく、**完成条件を満たすまで継続する長時間の自律開発タスク**として扱ってください。

---

# 0. 最初に読むもの

まず、カレントディレクトリと既存ファイルを確認してください。

そのうえで、少なくとも以下を全文読んでください。

- `docs/phase-2/requirements.md`
- 既存の `README.md`
- 既存の `docs/phase-2/verification.md`
- Phase 1の要件定義書・実装プロンプトが残っている場合はそれら
- `package.json`
- サーバー実装
- WebSocket関連実装
- `/admin` 関連実装
- `/display` 関連実装
- TTS adapter
- 既存テスト

`docs/phase-2/requirements.md` を今回のPhase 2における要件の正としてください。

Phase 1の既存仕様・検証済み動作は、Phase 2要件と矛盾しない限り維持してください。

---

# 1. Goalを設定する

実装開始前に、このタスク全体をGoalとして設定してください。

実行環境で `set_goal` が利用可能なら、**必ず `set_goal` を使用してください。**

`set_goal` が存在しない場合は、Codex環境で利用可能な同等のGoal機能（例: `/goal` 等）を使用してください。

Goal機能そのものが利用不能でも、作業を止めないでください。その場合は、以下のGoalを継続目標として内部的に保持し、同じ完成条件まで自走してください。

## Goal

> 現在完成している横川AI Phase 1 MVPを後方互換で維持しながら、`docs/phase-2/requirements.md` に従い、ローカルLAN、複数Display Client、Heartbeat、Broadcast・個別送信、Audio Master、State Sync、固定Cue、Scene、NEXT/BACK/REPLAY、任意Cue実行、Cue編集・永続化、Free Speak、Show Reset、将来のTTS Provider交換境界、Render等への将来デプロイ可能性を実装する。自動テスト・疑似マルチ端末テスト・実ブラウザ検証・長時間試験・回帰試験・README/検証記録・Git管理まで完了し、Phase 2受け入れ条件をすべて根拠付きで満たすまで継続する。

## Goalの停止条件

以下をすべて満たした場合のみGoal達成としてください。

1. Phase 2要件定義書の受け入れ条件を1項目ずつ確認済み
2. Phase 1の主要機能に回帰がない
3. 複数Displayを疑似または実端末で検証済み
4. 固定Cueの公演フローを検証済み
5. 切断・再接続・Audio Master障害等を検証済み
6. インターネット非依存の中核動作を確認済み
7. 自動テストがすべて成功
8. 長時間試験が成功
9. READMEと検証記録が更新済み
10. Git履歴が整理され、作業ツリーが意図した状態
11. 利用可能なGitHub remoteがある場合はpush済み
12. 必須機能に未完了TODOがない

Goalを設定しただけで作業を止めず、そのまま実装へ進んでください。

---

# 2. 自走方針

基本的にユーザーへ途中確認を求めず、自分で合理的に判断して完成まで進めてください。

作業ループは以下とします。

```text
現状確認
↓
要件との差分整理
↓
実装
↓
自動テスト
↓
疑似マルチ端末テスト
↓
実ブラウザ確認
↓
問題発見
↓
原因調査・修正
↓
再テスト
↓
Gitコミット
↓
次の未完了要件へ
```

以下のような軽微な事項でユーザー確認待ちにしないでください。

- ファイル構成
- 関数名
- UIの細部
- 使用ライブラリ
- テスト方式
- Heartbeatの妥当な秒数
- Display IDの生成方式
- Cue保存形式
- 内部イベント形式

要件・既存設計・安全性から合理的に決めてください。

問題が起きた場合も、質問する前に以下を行ってください。

1. ログ確認
2. コード確認
3. 再現
4. 原因特定
5. 修正
6. 再試験
7. 代替設計の検討

外部認証、実物ハードウェア不足、権限不足など、自分では解消不能なブロッカーのみ最終的に制約として報告してください。

その場合でも、ブロッカーと無関係な作業をすべて先に完了してください。

---

# 3. 既存Phase 1を保護する

今回の作業は「作り直し」ではありません。

最初に以下を実施してください。

1. `git status`
2. `git log --oneline --decorate`
3. 現在のテスト実行
4. 既存のPhase 1検証記録確認
5. 既存機能のスモークテスト

Phase 1完成版にまだタグがない場合、既存履歴と状態を確認したうえで、適切なら以下に相当するタグを付けてください。

```bash
git tag -a v0.1.0 -m "Complete single-display MVP"
```

既に同等タグが存在する場合は重複作成しないでください。

ユーザーの未コミット変更を勝手に削除・上書きしないでください。

---

# 4. 実装優先順

原則として以下の順番で進めてください。

## Step 1: LAN正式対応

- `HOST=0.0.0.0` 等のLAN公開整理
- 起動時にlocalhost URLとLAN URLを表示
- WebSocket URLのlocalhost固定を排除
- HTTP → WS
- HTTPS → WSS
- Windows Firewall / LAN手順のREADME化

## Step 2: Display Client化

- Display ID
- Display Name
- Display設定保持
- 複数Display接続
- AdminでDisplay一覧
- 接続 / 切断状態
- Heartbeat
- Offline判定
- 再接続

## Step 3: Target / Broadcast

- ALL
- 特定Display
- 将来Groupを追加可能なtargetモデル
- 字幕・イベント配信の共通化

## Step 4: Audio Master

- 1台のみAudio Master
- Adminから指定
- 非MasterでTTSを起動しない
- Master切断警告
- 二重再生防止

## Step 5: 固定Cue

- Cueデータモデル
- Cue一覧
- Cue編集
- Cue保存
- Cue並び替え
- enabled
- current / next
- NEXT
- BACK
- REPLAY
- 任意Cue直接実行
- Cue履歴

## Step 6: Scene / Reset

- Sceneモデル
- Cue所属
- Current Scene
- Sceneジャンプ
- Show Reset
- Reset誤操作防止

## Step 7: Speech/TTS境界整理

- 現在のBrowser TTSは維持
- Browser Speech依存を明確なProvider/Adapter境界へ閉じ込める
- 将来VOICEVOX Providerを追加可能にする
- 将来Cached Audio / 事前生成WAVを追加可能にする
- Cue側に特定TTS実装を直結しない

VOICEVOX本体は今回実装しなくてよいです。

## Step 8: 総合検証

- Phase 1回帰
- マルチDisplay
- Cue
- 切断・復帰
- Audio Master
- 長時間試験
- LAN想定
- README
- VERIFICATION更新

必要に応じて順序を微調整して構いませんが、理由なく大幅に逸脱しないでください。

---

# 5. 固定Cueは本番主系統として実装する

固定Cueは補助機能ではなく、Phase 2の主要機能です。

本番の基本操作が以下になることを目標としてください。

```text
CURRENT CUEを確認
↓
NEXT
↓
必要ならREPLAY / STOP
↓
想定外だけFree Speak
```

CueとFree Speakは別々の発話エンジンを作らず、可能な限り共通のSpeech/Event Pipelineを利用してください。

概念:

```text
Cue ───────┐
           ├── Speech/Event Pipeline ── Target ── Display
Free Speak ┘
```

Cueの原データはテキストを正としてください。

将来VOICEVOX等でWAVを生成しても、元テキストを保持してください。

---

# 6. TTSは今回後回し。ただし将来変更可能にする

今回の実音声方式は現在のBrowser TTSを維持してください。

ただし内部設計では、将来以下へ変更可能にしてください。

```text
Speech Service
├─ BrowserSpeechProvider     ← 今回
├─ VoicevoxProvider          ← 将来
└─ CachedAudioProvider       ← 将来
```

重要:

- CueロジックがChrome Speech Synthesisを直接知らない
- Show Controlが特定音声モデルを直接知らない
- WebSocketイベントが特定TTSへ密結合しない
- 将来Server側で音声生成してAudio Masterへ送れる余地を残す
- 固定Cueを事前生成WAVへ置換できる余地を残す

過剰な抽象化は避けつつ、交換境界は明確にしてください。

---

# 7. 複数状況を想定したテストを必須にする

今回、単体テストだけで完成扱いにしないでください。

物理PCが複数台ない場合でも、**複数のWebSocketクライアント、複数ブラウザページ、複数ブラウザコンテキスト等を利用して、マルチ端末状況を疑似的に再現してください。**

可能であればPlaywright等のE2Eテストを導入して構いません。

ただし既存構成に対して過剰な依存追加になる場合は、Node.js WebSocketクライアント＋ブラウザ検証等、より単純な方法でも構いません。

以下のシナリオを最低限テストしてください。

---

## Scenario A: 従来の1台完結

```text
Server
Admin
Display A
```

すべて同一PC想定。

確認:

- Phase 1と同じ操作ができる
- Free Speak
- 字幕
- TTS
- STOP
- REPLAY
- 履歴
- Cue
- NEXT

---

## Scenario B: 管理PCと投影PCを分離

```text
Server/Admin PC
      │ LAN
      ▼
Display A
```

疑似的でもよいので別クライアントとして接続する。

確認:

- AdminとDisplayが別接続でも正常
- WebSocket接続先がlocalhost固定でない
- State Sync
- TTS
- 再接続

---

## Scenario C: Server / Admin / Display完全分離

```text
Server
├─ Admin
└─ Display A
```

3者を論理的に別クライアントとして扱う。

確認:

- Server状態が正
- AdminリロードでDisplayに影響しない
- DisplayリロードでAdminに影響しない

---

## Scenario D: 3 Display同時接続

```text
Display A
Display B
Display C
```

確認:

- 3台すべてONLINE
- 一意なID
- Display一覧
- Heartbeat
- Broadcastで全台へ字幕
- current state整合性
- 1台切断しても残り2台は正常

---

## Scenario E: 個別Display送信

```text
target = Display B
```

確認:

- Bだけが対象イベントを受信
- A/Cに誤配信しない
- 履歴にtargetが残る

---

## Scenario F: Audio Master

```text
A = Audio Master
B = mute
C = mute
```

確認:

- AだけTTS開始
- B/Cは字幕のみ
- 二重音声再生が起きない
- Audio Master変更後は新Masterのみ発話

TTS自動試験が難しい場合は、Providerをモックし「発話要求がどのDisplayで発火したか」を自動検証してください。

さらに実ブラウザで可能な範囲を確認してください。

---

## Scenario G: Audio Master切断

```text
A = Audio Master
↓
A disconnect
```

確認:

- Adminに警告
- B/Cが勝手に二重発話しない
- 他Displayの表示は継続
- 手動でMasterを切り替えられる

---

## Scenario H: Displayの瞬断・復帰

```text
Display B ONLINE
↓
heartbeat停止 / socket切断
↓
OFFLINE
↓
再接続
```

確認:

- OFFLINE判定
- Admin表示
- 再接続後ONLINE
- 表示状態復元
- 過去発話を勝手に再生しない

---

## Scenario I: Admin切断・復帰

```text
Admin disconnect
↓
Display群は維持
↓
Admin reconnect
```

確認:

- Display接続が維持される
- Admin復帰時にDisplay一覧を再取得
- Current Cue / Sceneを復元
- 誤ってCueを再実行しない

---

## Scenario J: Cue基本進行

Cueを最低5件作成したテストデータで、

```text
Cue 1
Cue 2
Cue 3
Cue 4
Cue 5
```

確認:

- Cue 1実行
- NEXT
- NEXT
- BACK
- REPLAY
- Cue 5へ直接ジャンプ
- disabled Cue
- Cue編集
- Cue保存
- 再起動後復元

BACKは位置変更だけで自動再発話しないことを確認してください。

---

## Scenario K: Cue中のFree Speak

```text
Current Cue = 3
↓
Free Speak
↓
Current Cue = 3のまま
```

確認:

- Free SpeakでCue位置が変わらない
- 履歴上でCue/Free Speakを区別
- その後NEXTでCue 4へ進む

---

## Scenario L: Show Reset

途中状態:

```text
Scene 3
Cue 12
字幕あり
queueあり
```

Reset実行後:

- Scene初期化
- Cue初期化
- queueクリア
- 一時字幕クリア
- Display登録保持
- Cue定義保持
- 設定保持

誤操作防止UIも確認してください。

---

## Scenario M: Cue実行中のDisplay切断

```text
3 Displays
↓
Cue送信
↓
Display B disconnect
```

確認:

- A/Cは影響なく継続
- BのみOffline
- Server全体がクラッシュしない
- Queueが破綻しない

---

## Scenario N: 同時接続・再接続ストレス

複数Displayを短時間で、

```text
connect
disconnect
reconnect
```

させる。

確認:

- 重複Displayが増殖しない
- stale connectionが残らない
- displayId衝突を安全に処理
- memory leakの兆候がない

---

## Scenario O: インターネットなし想定

外部URLやクラウドAPIへの依存がないことを確認する。

可能ならテスト環境でネットワーク外部アクセスを使わずに、

- Server
- Admin
- Display
- Cue
- Free Speak
- TTS
- State Sync

が動くことを確認してください。

物理的なインターネット切断を自動化できない場合は、

- 外部HTTP依存の静的検査
- localhost/LANのみでのE2E

を行い、実物理切断だけを会場試験項目として残してください。

---

## Scenario P: 将来Renderを阻害しない確認

Renderへ実デプロイする必要はありません。

ただし以下を確認してください。

- `PORT` 環境変数
- `HOST` 環境変数
- localhost URLの固定なし
- HTTPならWS
- HTTPSならWSSとなるロジック
- Windows絶対パスなし
- Storage処理が他実装へ差し替え可能な境界を壊していない

---

# 8. 長時間・負荷試験

Phase 1には30分連続試験があります。

Phase 2でも、マルチDisplay前提の長時間試験を追加してください。

最低条件:

```text
3 Display Clients
1 Admin相当Client
30分以上
```

試験中に定期的に、

- Cue実行
- Free Speak
- Heartbeat
- Broadcast
- 個別target

を行ってください。

可能なら途中で、

- Display 1台切断
- 再接続
- Audio Master変更

も疑似実行してください。

以下を記録してください。

- 総イベント数
- 成功数
- 失敗数
- 再接続回数
- Offline検知回数
- 異常終了の有無
- メモリ使用量の大幅増加有無

テスト時間を環境変数で短縮可能にし、CIや日常確認では短時間版も実行できるようにしてください。

---

# 9. 実ブラウザ確認

自動テストだけで終わらせないでください。

ブラウザを利用できる環境では実際に以下を開いて確認してください。

- Admin
- Display A
- Display B
- Display C

同一PC上の複数タブ・ウィンドウ・ブラウザコンテキストでも構いません。

最低限目視確認:

- Admin UI
- Display一覧
- Online/Offline
- Audio Master
- Current Scene
- Current Cue
- Next Cue
- NEXT
- BACK
- REPLAY
- Cue一覧
- Cue編集
- Free Speak
- target選択
- STOP
- Show Reset
- Display側字幕
- Display側に管理UIが漏れていないこと
- 長文
- 複数Display時のレイアウト

UIに問題があれば自分で修正してください。

初回UIをそのまま完成扱いしないでください。

---

# 10. 公演操作性を自己評価する

本番スタッフ視点で、最低限以下を自己評価してください。

- 今どのSceneか一目で分かるか
- 今どのCueか分かるか
- 次のCueが分かるか
- NEXTを押し間違えにくいか
- STOPを即座に押せるか
- Display障害がすぐ分かるか
- Audio Master障害がすぐ分かるか
- Free SpeakとCueを間違えにくいか
- Resetを誤操作しにくいか
- 3 Displayあっても状態が把握できるか
- 稽古で任意Cueへすぐ移動できるか

問題があれば修正し、再度ブラウザ確認してください。

---

# 11. Git / GitHub

Git管理は必須です。

大きな1コミットにまとめないでください。

機能単位でこまめにコミットしてください。

例:

```text
chore: checkpoint phase 1 baseline
feat: expose LAN access information
feat: add display client identities
feat: support multiple displays
feat: monitor display heartbeat
feat: add broadcast and targeted delivery
feat: add audio master control
feat: add fixed cue model
feat: add cue show controls
feat: add scenes and show reset
refactor: isolate speech provider boundary
test: cover multi-display scenarios
test: add multi-display soak coverage
docs: document LAN show operation
```

各主要Stepについて、

```text
実装
↓
テスト
↓
確認
↓
コミット
```

を基本としてください。

GitHub remoteがある場合は、認証済みで安全にpush可能なら節目ごとにpushしてください。

禁止:

- force push
- 既存履歴の不必要なrewrite
- ユーザー変更の破棄
- エラー回避のための乱暴なreset

remoteがなければローカルGit管理のまま完成まで進めてください。

---

# 12. ドキュメント

READMEをPhase 2仕様へ更新してください。

最低限:

- システム概要
- Phase 2アーキテクチャ
- 必要環境
- 1台構成
- LAN構成
- Server起動
- Admin接続
- Display初期登録
- Display追加
- Audio Master設定
- Cue作成
- Cue編集
- NEXT/BACK/REPLAY
- Free Speak
- Show Reset
- 切断時の復旧
- インターネット不要であること
- Firewall
- LAN IP確認
- Browser TTS制約
- 将来VOICEVOXへ変更可能な構造
- Render等で公開する際は認証が必要であること
- 本番前チェック
- トラブルシューティング

既存の `docs/phase-2/verification.md` がある場合は、Phase 2検証結果へ更新またはPhase 2用検証記録を追加してください。

テストシナリオごとに、

```text
Scenario
結果
検証方法
制約
```

が追えるようにしてください。

---

# 13. 完成判定

実装が終わったと思っても、すぐGoal達成にしないでください。

`docs/phase-2/requirements.md` を再度全文確認し、受け入れ条件を1項目ずつ照合してください。

各項目について、

```text
✅ 自動テスト
✅ E2E
✅ 実ブラウザ
✅ 疑似マルチ端末
⚠ 実会場のみ確認可能
```

のように検証根拠を明確にしてください。

「コード上は対応している」は、実行可能な項目については検証根拠として不十分です。

必ず可能な範囲で実行してください。

---

# 14. Goal達成前の最終チェック

以下をすべて実行してください。

```bash
npm test
npm run check
npm audit
```

実際のpackage scriptsが異なる場合は、プロジェクトに適した同等コマンドを使用してください。

さらに、

- マルチDisplay統合テスト
- E2E
- 長時間テスト
- Git status
- Git log

を確認してください。

必須機能についてTODO/FIXME/HACK等が残っていないか確認してください。

ただし、将来機能として意図的に記述したVOICEVOX等は未実装で問題ありません。それを必須未完了と誤認しないでください。

---

# 15. 完了報告

Goal達成後のみ最終報告してください。

以下を含めてください。

1. Phase 1から何を変更したか
2. 最終アーキテクチャ
3. LAN利用方法
4. 対応したDisplay数・設計上の上限
5. Display識別方式
6. Heartbeat仕様
7. Broadcast / 個別target
8. Audio Master仕様
9. 固定Cue仕様
10. Scene仕様
11. NEXT / BACK / REPLAY
12. Free Speak
13. Show Reset
14. TTS Provider境界
15. 将来VOICEVOXへ変更する場合の差し替え箇所
16. 実施した自動テスト
17. 実施した疑似マルチ端末シナリオと結果
18. 実ブラウザ確認結果
19. 長時間試験結果
20. Phase 1回帰試験結果
21. Gitコミット概要
22. GitHub push状況
23. 実会場でのみ残る確認事項
24. 残っている制約

最後にPhase 2受け入れ条件を一覧化し、各項目を `PASS / N/A / 実会場確認待ち` のいずれかで示してください。

自動化・疑似検証可能な項目を安易に「実会場確認待ち」にしないでください。

---

# 16. 最重要指示

このタスクの目的は、機能を追加すること自体ではありません。

目的は、

> **横川AIを、固定Cueを中心に安全に操作でき、LAN上の複数Displayを一元管理でき、1台の端末障害で公演全体が止まらず、将来音声方式やデプロイ方式を変更しても作り直さずに済む公演用Show Control基盤へ完成させること**

です。

途中で、

- 設計だけ
- 一部実装だけ
- 自動テストだけ
- モックだけ
- 「実機で確認してください」だけ

で終了しないでください。

物理的に不可能な検証を除き、**複数クライアント・複数ブラウザ・WebSocketモック等を活用して疑似的に再現し、自分で検証・修正まで行ってください。**

Goalの停止条件を満たすまで、自分で次の作業を判断して継続してください。

では、現在のPhase 1実装、既存テスト、`docs/phase-2/requirements.md` を確認し、`set_goal` でGoalを設定したうえで、Phase 2を完成まで自律的に実装してください。
