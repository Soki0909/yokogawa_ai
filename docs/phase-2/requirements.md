# 横川AI 改善要件定義書
## Phase 2: ローカルLAN・マルチディスプレイ・固定Cue対応

- 文書種別: 改善実装要件定義書
- 対象プロジェクト: `yokokawa_ai`
- 前提バージョン: Phase 1 単一Display MVP完成版
- 作成日: 2026-09-12

---

# 1. 目的

本書は、現在完成している「横川AI 公演用ローカルWebアプリ」を、公演本番でより安全かつ柔軟に運用できるシステムへ拡張するための要件を定義する。

Phase 1では、同一PC上で以下を実現した。

- `/admin` 管理画面
- `/display` 投影画面
- 任意テキスト送信
- WebSocketによるリアルタイム通信
- 字幕表示
- Chrome Speech SynthesisによるTTS
- 発話キュー
- 停止
- 再読み上げ
- 発話履歴
- 切断・再接続
- 設定永続化
- 自動テスト
- 長時間連続稼働検証

Phase 2では、これを次の方向へ拡張する。

> **1台の横川AIサーバーを中心に、ローカルLAN上の管理端末と複数の投影端末が接続し、固定Cueと自由発話を組み合わせて公演を制御できるShow Control基盤へ発展させる。**

本番の主系統はローカルLANとし、インターネット接続を必要としない。

一方で、将来的にRender等のクラウド環境へデプロイできるよう、特定のローカル環境へ過度に依存しない設計を維持する。

---

# 2. 基本方針

Phase 2では以下を設計上の優先順位とする。

1. 公演中の安定性
2. ローカルLANのみでの完全動作
3. 複数投影端末への対応
4. 固定Cueによる本番操作の単純化
5. 障害端末の即時把握
6. 再接続・復旧の容易さ
7. 自由入力による即興対応の維持
8. 音声方式を後から交換できる構造
9. 将来のShow Control拡張性
10. Render等への将来デプロイ可能性

---

# 3. 現在の実装状況

現在のアーキテクチャは概ね以下である。

```text
/admin
   │
   │ speak / stop / settings
   ▼
Node.js + Express + WebSocket Server
   │
   ├─ current state
   ├─ speech queue
   ├─ history
   ├─ settings
   ├─ JSON persistence
   └─ logging
   │
   ▼
/display
   ├─ subtitle
   └─ Chrome Speech Synthesis
```

現在はサーバーが発話順序・履歴・設定等の状態を管理し、投影ブラウザがTTS再生を担当する。

現在の主要技術は以下である。

- Node.js
- Express 5
- WebSocket (`ws`)
- Vanilla HTML / CSS / JavaScript
- Chrome Speech Synthesis
- Node.js標準テストランナー

Phase 1の受け入れ条件および完成条件は検証済みであり、本書ではPhase 1の既存機能を原則として後方互換で維持する。

---

# 4. Phase 2の完成像

想定する本番構成は以下とする。

```text
                    横川AI Local LAN
                           │
                    ┌──────┴──────┐
                    │ Yokogawa AI │
                    │   Server    │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
    Admin PC          Display PC A       Display PC B
                         │                  │
                         ▼                  ▼
                    Projector A        Projector B

                           │
                           ▼
                      Display PC C
                           │
                           ▼
                      Projector C
```

サーバーPC・管理PC・投影PCは同一端末であっても別端末であってもよい。

以下の構成をすべて許容する。

### 構成A: 1台完結

```text
Server + Admin + Display
```

### 構成B: 管理と投影を分離

```text
Server/Admin PC
      │
      └── Display PC
```

### 構成C: 完全分離

```text
Server PC
├── Admin PC
├── Display A
├── Display B
└── Display C
```

---

# 5. Phase 2スコープ

## 5.1 必須実装

Phase 2で必ず実装する。

- LAN内別PCからの接続
- 複数Display Client
- Display ID / Display Name
- Display接続一覧
- Heartbeatによる死活監視
- Broadcast
- Display個別送信
- Display Groupを考慮したデータ構造
- Audio Master
- 再接続時State Sync
- 固定Cue
- Cue一覧
- Cue実行
- NEXT
- BACK
- REPLAY
- 任意Cue直接実行
- Cue編集
- Cue永続化
- 自由入力発話の維持
- Cueと自由入力で共通の出力経路を使用
- 公演Reset
- TTS Providerを交換可能にするための抽象化
- 現行Browser TTSの維持
- Render等へ移行可能な構造の維持
- マルチDisplay向け自動テスト
- README / 運用手順更新

## 5.2 今回は必須としない

以下は将来対応とし、Phase 2の完成条件には含めない。

- VOICEVOX本体の導入
- ElevenLabs等のクラウドTTS
- LLMによる自動文章生成
- 音声認識
- カメラ認識
- 謎の自動判定
- DMX制御
- OSC / MIDI連携
- 実際の建物設備との連携
- 動画同期
- 高精度時刻同期
- クラウド本番運用
- Redis / PostgreSQL等の外部DB必須化
- 認証システムの本格導入

---

# 6. ネットワーク要件

## NET-001 LAN公開

サーバーはlocalhostだけでなく、ローカルLAN上の他端末から接続できること。

例:

```text
http://192.168.10.10:3000/admin
http://192.168.10.10:3000/display
```

サーバーは必要に応じて `0.0.0.0` へbindできること。

localhostアクセスも引き続き利用可能とする。

## NET-002 起動時アクセス情報

サーバー起動時に最低限以下を表示する。

```text
Local:
http://localhost:3000/admin
http://localhost:3000/display

LAN:
http://192.168.x.x:3000/admin
http://192.168.x.x:3000/display
```

複数のネットワークアダプターが存在する場合、不適切な仮想NIC等を可能な範囲で除外し、利用可能なLANアドレスを提示する。

## NET-003 インターネット非依存

本番中核機能はインターネット接続なしで動作すること。

以下をLAN内で完結する。

- 管理画面
- Display
- Cue
- 自由発話
- 状態同期
- 履歴
- Browser TTS
- Heartbeat
- 再接続

## NET-004 WebSocket接続先

クライアント側で `localhost` を固定値としてハードコードしない。

ページを配信したホストを基準にWebSocket接続先を決定できること。

HTTP時は `ws://`、HTTPS時は `wss://` を利用可能な設計とする。

---

# 7. Display Client要件

## DSP-001 Display識別

各Display Clientは一意な `displayId` を持つこと。

例:

```text
display-main
display-201
display-3f
display-4f
```

人間向け表示名として `displayName` を持つ。

例:

```text
7-201 メイン
3F 東側
4F
```

## DSP-002 Display初期設定

Display初回利用時に以下を設定可能とする。

- Display Name
- Audio有効 / 無効

Display IDは自動生成してもよい。

設定はブラウザ側へ保存し、再接続時に同一Displayとして復元できること。

## DSP-003 Display一覧

管理画面に接続済みDisplay一覧を表示する。

最低限表示する。

- Display Name
- Display ID
- ONLINE / OFFLINE
- Audio有効 / 無効
- 最終Heartbeat
- 現在の表示状態

## DSP-004 複数同時接続

最低3台のDisplay Clientを同時接続して正常動作すること。

設計上は特定台数へ固定しない。

## DSP-005 Display切断

Displayが切断された場合、他Displayや管理画面の動作を停止させないこと。

## DSP-006 再接続

切断後に同一Displayが再接続した場合、登録情報を復元し、現在の表示状態へ追従できること。

---

# 8. Heartbeat要件

## HBT-001 Heartbeat送信

Display Clientは定期的にHeartbeatをサーバーへ送信すること。

推奨:

```text
2秒間隔
```

## HBT-002 Offline判定

一定時間Heartbeatがない場合、そのDisplayをOFFLINEとして扱う。

推奨:

```text
5〜10秒
```

具体値は実装者が調整してよい。

## HBT-003 管理画面通知

DisplayがOFFLINEになった場合、管理画面で視覚的に分かること。

色だけではなく文字でも表示する。

## HBT-004 復帰

Heartbeat再開時は自動的にONLINEへ戻ること。

---

# 9. 配信対象要件

## TGT-001 Broadcast

すべてのDisplayへ同じイベントを送信できること。

例:

```json
{
  "target": {
    "type": "all"
  }
}
```

## TGT-002 個別送信

特定Displayだけに送信できること。

例:

```json
{
  "target": {
    "type": "display",
    "id": "display-201"
  }
}
```

## TGT-003 Display Group

将来、複数Displayをグループ化できるデータ構造を採用する。

例:

```text
ALL
MAIN
UPSTAIRS
ROUTE_A
```

Phase 2ではGroup編集UIまで実装してもよいが、必須ではない。

ただしCueやイベントのtarget構造は、後からGroupを追加できる形式とする。

---

# 10. Audio Master要件

## AUD-001 Audio Master

複数Display接続時、原則として1台のみをAudio Masterとする。

Audio Masterのみが通常のTTS音声を再生する。

他Displayは字幕・演出表示のみ行う。

## AUD-002 Audio設定

管理画面からAudio Masterを指定できること。

例:

```text
Audio Master:
[ 7-201 Main ▼ ]
```

## AUD-003 Audio Master切断

Audio Masterが切断された場合、管理画面に明確な警告を表示する。

勝手に別DisplayをAudio Masterへ切り替えるかどうかは実装方針に委ねるが、自動切替を行う場合は管理画面に明示する。

公演の予測可能性を優先し、初期実装では手動再指定でもよい。

## AUD-004 二重再生防止

通常運用では複数Displayが同一TTSを同時再生しないこと。

---

# 11. 固定Cue要件

固定CueをPhase 2の必須機能とする。

本番では、自由入力より固定Cueを主な操作方法とする。

## CUE-001 Cue定義

Cueは最低限以下の情報を持つ。

```text
cueId
cueNumber
cueName
text
target
enabled
```

将来拡張を考慮し、以下を追加可能な構造とする。

```text
sceneId
displayMode
speechProvider
audioAsset
preDelay
postDelay
actions
notes
```

## CUE-002 Cueの正

Cue本文はテキストを正とする。

音声ファイルが将来生成された場合でも、Cueの意味を表す原データはテキストとして保持する。

これにより、音声モデル変更時に再生成可能とする。

## CUE-003 Cue一覧

管理画面でCueを順序付き一覧として表示する。

例:

```text
001 AI起動
002 体験授業開始
003 プリンキピア説明
004 異常検知
005 ハッキング開始
006 ロックダウン宣言
```

## CUE-004 Current Cue

現在のCueを明確に表示する。

## CUE-005 Next Cue

次に実行されるCueを明確に表示する。

## CUE-006 NEXT

`NEXT` 操作で次のCueを実行する。

通常の本番運用ではNEXTを主要操作とする。

## CUE-007 BACK

Cue選択位置を1つ前へ戻せること。

BACKしただけで自動的に発話を再実行しないことを基本とする。

## CUE-008 REPLAY

現在または直前Cueを再実行できること。

## CUE-009 任意Cue実行

Cue一覧から任意Cueを選択し、直接実行できること。

稽古中の途中再開に利用する。

## CUE-010 Cue編集

Cueの以下を編集できること。

- Cue名
- 発話テキスト
- target
- enabled

編集内容は永続化する。

## CUE-011 Cue並び替え

Cue順序を変更できること。

UI方式は任意。

## CUE-012 Cue有効 / 無効

Cueを削除せず、一時的に無効化できること。

## CUE-013 Cue実行履歴

Cue実行を履歴へ記録する。

最低限:

- cueId
- cueName
- 実行時刻
- target
- 結果

## CUE-014 Cueと自由発話の統合

Cue発話と自由入力発話は、可能な限り同じSpeech / Event処理経路を使用すること。

以下のような別々の独立実装へ分岐させない。

```text
Cue専用TTS処理
Free Speak専用TTS処理
```

代わりに、

```text
Cue
   ┐
   ├──▶ Speech/Event Pipeline
   │
Free Speak
```

とする。

---

# 12. Scene要件

固定Cueを整理しやすくするため、CueをScene単位でまとめられる構造を持つ。

## SCN-001 Scene定義

Sceneは最低限以下を持つ。

```text
sceneId
sceneName
order
```

## SCN-002 Cue所属

CueはSceneへ所属できること。

Scene未設定Cueも許容してよい。

## SCN-003 Scene表示

管理画面で現在Sceneを確認できること。

## SCN-004 Sceneジャンプ

稽古・復旧用途として、任意Sceneへ移動できること。

Sceneジャンプだけでは音声を自動発話しないことを基本とする。

---

# 13. 自由発話要件

Phase 1の自由入力機能は維持する。

## FSP-001 Free Speak

管理画面で任意テキストを入力し即時発話できること。

## FSP-002 Target

自由発話でも送信対象を選択できること。

最低限:

- ALL
- 特定Display

## FSP-003 Cue進行への非干渉

自由発話を行ってもCueの現在位置を勝手に進めないこと。

## FSP-004 履歴

自由発話もCue発話と区別可能な形で履歴へ記録する。

---

# 14. State Sync要件

## SYN-001 サーバーを状態の正とする

以下の公演状態は原則としてサーバー側を正とする。

```text
connectedDisplays
currentScene
currentCue
currentSubtitle
displayMode
audioMaster
cueDefinitions
history
settings
```

## SYN-002 Display再接続

Display再接続時に現在表示すべき状態を送信する。

最低限:

- 現在字幕
- Display向け表示状態
- 自分の設定
- Audio Masterかどうか

## SYN-003 音声非自動再生

再接続・リロードだけを理由として、現在または過去の発話を勝手に再生しないこと。

既存MVPの安全動作を維持する。

---

# 15. 公演Reset要件

## RST-001 Show Reset

次公演へ向けて公演状態を初期化できること。

最低限以下をリセットする。

```text
currentScene
currentCue
speechQueue
currentSubtitle
temporary display state
```

## RST-002 保持対象

以下はResetしても保持する。

```text
Cue定義
Display登録
設定
必要な履歴
```

## RST-003 誤操作防止

Show Resetは誤操作しにくいUIとする。

例:

- 確認ダイアログ
- 長押し
- 2段階操作

---

# 16. TTSアーキテクチャ要件

VOICEVOX等への変更はPhase 2では必須実装としない。

ただし、後から音声方式を交換できる設計を必須とする。

## TTS-001 Provider抽象化

TTS方式を交換可能な境界を設ける。

概念例:

```text
Speech Service
    │
    ├── BrowserSpeechProvider
    ├── VoicevoxProvider       （将来）
    └── CachedAudioProvider    （将来）
```

現在は `BrowserSpeechProvider` 相当を使用する。

## TTS-002 Browser TTS維持

Phase 2では現在のChrome Speech Synthesisによる発話を維持し、既存機能を壊さない。

## TTS-003 Provider依存の分離

Cue、WebSocket、Show Control等のコードから、Chrome Speech Synthesis固有処理を直接呼び出さない設計を目標とする。

## TTS-004 将来のサーバー生成音声

将来的に以下の構成へ変更できること。

```text
Cue / Free Speak
      │
      ▼
Speech Service
      │
      ▼
VOICEVOX
      │
      ▼
WAV
      │
      ▼
Audio Master
```

Phase 2時点ではVOICEVOX API実装を要求しない。

## TTS-005 固定Cue音声キャッシュ

将来的に固定Cueを事前生成WAVへ変換できるデータ構造を採用する。

例:

```text
Cue text
   ↓
Audio Cache
   ↓
cue_005.wav
```

固定Cueのテキストを失わないこと。

---

# 17. Eventモデル要件

将来、発話以外の演出を追加するため、イベント構造を一般化可能にする。

現在必要な主イベント:

```text
speak
stop
state_sync
heartbeat
cue_execute
```

将来追加予定:

```text
set_mode
show_text
hide_text
play_audio
play_video
show_image
blackout
glitch
```

概念例:

```json
{
  "event": "speak",
  "target": {
    "type": "all"
  },
  "payload": {
    "text": "セキュリティシステムを起動します。"
  }
}
```

既存コードを無理に全面置換する必要はないが、新規機能は将来のイベント拡張を阻害しない形式とする。

---

# 18. 管理画面要件

Phase 2の管理画面では、最低限以下を一画面から把握できること。

```text
YOKOGAWA AI SHOW CONTROL

SERVER       ONLINE

DISPLAYS
● 7-201      READY   AUDIO MASTER
● 3F         READY
● 4F         READY

CURRENT SCENE
Scene 1: 体験授業

CURRENT CUE
004 プリンキピア説明

NEXT CUE
005 異常検知

[ BACK ] [ NEXT ] [ REPLAY ]

CUE LIST
...

FREE SPEAK
[                                ]
Target: [ ALL ▼ ]
[ SPEAK ]

[ STOP AUDIO ]

[ SHOW RESET ]
```

重要操作は明確に配置する。

特に、

- NEXT
- STOP
- Display障害
- Audio Master障害

は瞬時に把握できること。

---

# 19. Render / Cloud互換性要件

本番はローカルLANを正とし、Renderでの実運用はPhase 2の完成条件に含めない。

ただし以下を守る。

## CLD-001 環境変数

最低限以下を環境変数で上書き可能とする。

```text
PORT
HOST
NODE_ENV
```

## CLD-002 localhost固定禁止

ブラウザ側やサーバー側で、通信先として `localhost` を必須前提にしない。

## CLD-003 HTTP / HTTPS

HTTP環境とHTTPS環境の両方を想定する。

WebSocketは `ws://` / `wss://` を適切に選択可能とする。

## CLD-004 OS依存パス禁止

Windows固有の絶対パスをコードへ埋め込まない。

## CLD-005 Storage境界

状態保存処理は、将来JSONファイル以外へ変更可能な責務分離を意識する。

Phase 2では現在のJSON永続化を継続してよい。

## CLD-006 公開時認証

Render等でインターネット公開する場合、管理画面認証が必要になることをREADMEへ明記する。

Phase 2では認証機能自体を必須実装としない。

---

# 20. 非機能要件

## NFR-001 後方互換

Phase 1で成立していた以下の単一PC構成も引き続き利用可能であること。

```text
localhost:3000/admin
localhost:3000/display
```

## NFR-002 レスポンス

LAN内での通常操作は体感上即時に反映されること。

目標:

```text
管理操作 → Display字幕反映
500ms以内
```

## NFR-003 安定性

1台のDisplay障害が他Displayへ波及しないこと。

## NFR-004 長時間稼働

最低30分以上、複数Display接続状態で安定稼働できること。

可能であれば実際の公演時間以上の連続稼働試験を行う。

## NFR-005 ログ

最低限以下をログへ記録する。

- Server起動
- Admin接続
- Display接続
- Display切断
- Heartbeat timeout
- Cue実行
- Free Speak
- Audio Master変更
- TTS開始 / 終了 / エラー
- Show Reset

---

# 21. テスト要件

## 21.1 自動テスト

最低限以下を自動化する。

- localhostアクセス
- LAN bind設定
- Admin接続
- Display ID登録
- 複数Display同時接続
- Display一覧
- Heartbeat
- Offline判定
- 再接続
- Broadcast
- 個別送信
- Audio Master
- 非Audio MasterでTTSが起動しないこと
- Cue作成
- Cue編集
- Cue並び順
- NEXT
- BACK
- REPLAY
- 任意Cue実行
- Free Speak
- CueとFree Speakの履歴区別
- Show Reset
- State Sync
- 再接続時非自動発話
- Phase 1既存機能の回帰テスト

## 21.2 実ブラウザ試験

最低3つのDisplayブラウザを使用し確認する。

可能なら別PCを使用する。

確認項目:

```text
Admin PC
Display A
Display B
Display C
```

- 全Displayへ同じ字幕
- 個別Displayへの字幕
- 接続一覧
- Heartbeat
- 切断検知
- 再接続
- Audio Masterのみ発話
- Cue NEXT
- Cue BACK
- Cue REPLAY
- Cue直接実行
- Free Speak
- Show Reset

## 21.3 LAN実機試験

最終的に実際のルーターまたはスイッチを使用し、インターネット接続を切断した状態で確認する。

---

# 22. Git運用

Phase 1完成版を変更前にタグとして保存することを推奨する。

例:

```bash
git tag -a v0.1.0 -m "Complete single-display MVP"
```

Phase 2は機能単位でこまめにコミットする。

例:

```text
feat: add LAN access information
feat: introduce display client identities
feat: support multiple display connections
feat: add display heartbeat monitoring
feat: add broadcast and targeted events
feat: add audio master selection
feat: add fixed cue management
feat: add cue playback controls
feat: add show reset
refactor: abstract speech provider boundary
test: add multi-display integration coverage
docs: add LAN show operation guide
```

---

# 23. 移行実装順序

既存MVPを壊しにくい順で以下を推奨する。

## Step 0: 現在版固定

- Phase 1タグ作成
- 全既存テスト再実行
- clean状態確認

## Step 1: LAN正式対応

- LAN IP表示
- localhostハードコード除去
- ws / wss対応
- LAN手順追加

## Step 2: Display Client化

- Display ID
- Display Name
- 複数Display接続
- Display一覧
- Heartbeat

## Step 3: 配信対象

- Broadcast
- Display個別target
- Groupを考慮したtargetモデル

## Step 4: Audio Master

- Audio Master指定
- 非Masterでの音声抑止
- 切断警告

## Step 5: 固定Cue

- Cueデータモデル
- Cue一覧
- Cue編集
- Cue永続化
- NEXT
- BACK
- REPLAY
- 任意実行

## Step 6: Scene / Reset

- Scene
- Sceneジャンプ
- Show Reset

## Step 7: TTS境界整理

- Browser TTSをProviderとして整理
- 将来VOICEVOX / Cached Audioへ交換可能な境界を確定

## Step 8: 総合検証

- 回帰テスト
- 3 Display試験
- 長時間試験
- LAN断インターネット試験
- README更新

---

# 24. Phase 2受け入れ条件

以下をすべて満たした時点でPhase 2完成とする。

1. Phase 1の既存機能が回帰していない。
2. localhostで従来通り利用できる。
3. LAN内の別PCからAdminへ接続できる。
4. LAN内の別PCからDisplayへ接続できる。
5. 3台以上のDisplayを同時接続できる。
6. 各Displayを一意に識別できる。
7. 管理画面でDisplay一覧を確認できる。
8. Display接続・切断をリアルタイムに確認できる。
9. HeartbeatによるOffline判定が機能する。
10. 全DisplayへのBroadcastが機能する。
11. 特定Displayへの個別送信が機能する。
12. Audio Masterのみが通常TTSを再生する。
13. Audio Master切断を管理画面で検知できる。
14. Display再接続後に表示状態を復元できる。
15. 再接続だけで過去音声を勝手に再生しない。
16. 固定Cueを登録できる。
17. 固定Cueを編集・保存できる。
18. Cueを順番に実行できる。
19. NEXTが機能する。
20. BACKが機能する。
21. REPLAYが機能する。
22. 任意Cueを直接実行できる。
23. Scene単位でCueを整理できる。
24. 自由入力発話が従来通り利用できる。
25. Cue実行と自由発話を履歴上で区別できる。
26. Show Resetが安全に実行できる。
27. Browser TTSが引き続き正常動作する。
28. TTS実装が将来別Providerへ交換可能な責務分離になっている。
29. コード内でlocalhost通信先を固定していない。
30. HTTPS環境でWSSへ拡張可能な設計になっている。
31. インターネットを切断しても中核機能がすべて動く。
32. 複数Display状態で30分以上の連続稼働試験に成功する。
33. 自動テストがすべて成功する。
34. 実ブラウザでマルチDisplay動作を確認している。
35. READMEだけでLAN構築・起動・公演操作・復旧方法を理解できる。
36. Git履歴が意味のある単位で残されている。
37. 必須機能に未完了TODOがない。

---

# 25. Phase 2完了後の次フェーズ候補

## Phase 3: 演出強化

- NORMAL / HACKING / HOSTILE / ENDING
- グリッチ
- Blackout
- 画像
- SE
- 動画
- Cue Action複合実行

## Phase 4: 音声強化

- VOICEVOX Provider
- 音声モデル選択
- 固定CueのWAV事前生成
- 音声キャッシュ
- Audio Masterへの音声配信
- TTS Health Check
- TTS障害時フォールバック

## Phase 5: 公演統合

- 謎進捗
- Display Group本実装
- ルート別演出
- 外部音響システム
- OSC / MIDI
- バックアップ公演モード

---

# 26. 本フェーズでの最重要原則

Phase 2で重要なのは、多機能化そのものではない。

**本番中にスタッフが「何を操作すればよいか」を単純化し、複数端末の状態を一か所から把握でき、1台の端末障害で公演全体が止まらないこと**を目的とする。

そのため本番時の基本操作は最終的に以下へ近づける。

```text
現在Cueを見る
      ↓
NEXTを押す
      ↓
必要ならREPLAY / STOP
      ↓
想定外だけFree Speak
```

固定Cueを主系統、自由入力を補助・緊急系統とする。

また音声方式については、Phase 2ではChrome Speech Synthesisを維持し、VOICEVOX等を急いで導入しない。

代わりに、**Cue・Show Control・通信・Display管理とTTS方式を疎結合にしておくこと**を必須とする。

これにより将来、

```text
Browser TTS
      ↓
VOICEVOX
      ↓
固定Cue事前生成WAV
```

と音声構成を変更しても、Show Controlシステム全体を作り直さずに済む状態を目指す。
