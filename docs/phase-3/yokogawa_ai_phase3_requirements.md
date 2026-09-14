# 横川AI Phase 3 要件定義書
## v0.3.0 — 本番オペレーション強化版

## 1. 文書の目的

本書は、`yokogawa_ai` の Phase 3 / v0.3.0 における要件を定義する。

Phase 2 / v0.2.0 では、以下の基盤が完成している。

- LAN上での管理者画面と複数投影画面の分離
- 複数Display Clientの接続・監視
- Broadcast / 個別送信
- Audio Master
- 固定Cue
- NEXT / BACK / REPLAY / 任意Cue実行
- Scene管理
- Free Speak
- Show Reset
- 再接続・状態同期
- TTS Provider境界
- Render互換を意識した構成
- 複数Displayを含むテスト・長時間試験

また、KIT-WLAP2上で実際に端末間通信が可能であることを確認済みである。
そのため、学生所有PC・スマートフォンを利用すれば、現行のLAN構成のまま学内運用できる見込みが立っている。

Phase 3では、演出を先回りして作り込むのではなく、**既存のPhase 2基盤を「本番で他のスタッフに安心して任せられるShow Control」にすること**を主目的とする。

---

# 2. Phase 3の基本方針

## 2.1 テーマ

> できることを増やすのではなく、  
> 本番で迷わず・間違えにくく・状態を確認しやすくする。

## 2.2 想定する本番運用

横川AIは、201を拠点として進行する可能性が高い。

想定例:

- 201にメインの横川AI表示
- 館内の必要箇所にも投影画面を配置
- 1つの管理者画面からCueを進行
- Cueごとに事前設定された送信先へ表示・発話
- 本番中は原則として `NEXT` を中心に操作
- 必要時のみ `BACK` / `REPLAY` / `STOP` / 任意Cue / Free Speakを利用

個別送信などPhase 2の高度な機能は残すが、通常の本番オペレーションでは前面に出しすぎない。

---

# 3. Phase 3で実装するもの

Phase 3の必須要素は以下の4領域とする。

1. 本番モード
2. 本番前チェック
3. 配信先セット
4. 設営・接続支援

これに加えて、本番運用上必要な安全性・状態表示・テストを強化する。

---

# 4. スコープ外

以下はPhase 3では原則実装しない。

- 横川AIアバターの本制作
- リップシンク
- 通常時 / 暴走時の具体的なビジュアル演出
- グリッチ、警告画面等の本番演出
- VOICEVOXの本導入
- 演者録音音声の本実装
- 音声生成パイプラインの大幅変更
- 本番脚本に依存する大量のCue登録
- 特定シーン専用のハードコード
- AIによる自律応答
- クラウド前提への変更
- 認証システムの本格導入
- KIT-GUEST前提のネットワーク構成

これらは脚本・演出確定後のPhase 4以降で検討する。

---

# 5. 前提条件

- Phase 2 / v0.2.0 の機能を壊さない。
- 既存のデータ形式は、必要なマイグレーションを行いつつ後方互換を最大限維持する。
- 本番ネットワークはローカルLANを第一候補とする。
- KIT-WLAP2上で端末間通信できることは実機確認済み。
- 投影端末は学生PCを利用可能。
- 管理者画面はPCまたはスマートフォンから利用する。
- インターネット接続は本番動作の必須条件にしない。
- Display数を固定値にしない。
- Display Clientが途中で切断されても、他Displayの進行を止めない。
- Cueは本番進行のsource of truthとして扱う。
- Phase 2で実装済みの高度機能は削除しない。

---

# 6. 機能要件

## FR-301 本番モード

### FR-301-1
管理者画面に「本番モード」を追加する。

### FR-301-2
本番モードでは、本番中に必要な情報を優先して表示する。

最低限表示するもの:

- 現在のScene
- 現在のCue番号 / Cue名
- 現在Cueの本文
- 次のCue番号 / Cue名
- 次Cueの本文または要約
- 現在Cueの配信先
- 接続中Displayの概要
- Audio Masterの状態
- システム上の警告

### FR-301-3
本番モードの主要操作は以下とする。

- NEXT
- BACK
- REPLAY
- STOP

### FR-301-4
`NEXT` を最も押しやすい主要操作として扱う。

### FR-301-5
誤操作しやすい高度機能は、本番モードでは常時前面に出さない。

例:

- Cue編集
- Display登録変更
- Audio Master変更
- Free Speak
- 任意Cue実行
- 配信先設定編集
- Show Reset

これらは「詳細操作」「緊急操作」等からアクセスできればよい。

### FR-301-6
本番モードと従来の管理画面を切り替えられること。

### FR-301-7
本番モードへの切り替えによってCue位置やDisplay状態を変更しない。

### FR-301-8
スマートフォン画面でも主要操作が無理なく行えること。

### FR-301-9
誤ってブラウザ更新しても、サーバー側の現在Cue位置・接続状態を復元表示できること。

---

## FR-302 本番前チェック

### FR-302-1
管理者画面に「本番前チェック」を追加する。

### FR-302-2
最低限、以下を一覧で確認できること。

- サーバーが正常稼働している
- Cueデータが存在する
- 現在のCue位置
- 接続中Display数
- 登録済みDisplayと接続状態
- 各Displayの名称
- Audio Masterが設定されている
- Audio Masterが現在オンライン
- Audio Masterが音声再生可能状態か
- 重大な警告の有無

### FR-302-3
各チェック項目は少なくとも以下の状態を視覚的に区別する。

- OK
- WARNING
- ERROR

### FR-302-4
「本番開始可能」の総合判定を表示する。

### FR-302-5
総合判定は、単純な見た目だけでなくルールに基づく。

例:

ERROR候補:
- Cueが0件
- Audio Master未設定
- Audio Master Offline
- 必須DisplayがOffline

WARNING候補:
- 任意DisplayがOffline
- 現在Cueが途中位置
- 音声未有効
- 登録Displayと現在接続数が不一致

### FR-302-6
必須Display / 任意Displayを区別できる構造を用意する。

Phase 3時点では、Display登録に `required` 相当の属性を追加してよい。

### FR-302-7
Audio Master側のBrowser TTSが「音声有効化済み」であるかを、DisplayからServerへ状態通知できるようにする。

### FR-302-8
Audio Masterが「接続中だが音声未有効」の場合、管理者画面に明確なWARNINGを出す。

### FR-302-9
本番前チェックは、Cueを実行しなくても状態確認できること。

### FR-302-10
必要であれば簡易的な「音声テスト」を実行できる。

音声テストは本番Cue位置を変更してはならない。

---

## FR-303 配信先セット

### FR-303-1
複数Displayの組み合わせを「配信先セット」として保存できるようにする。

例:

- 201のみ
- 201 + 2階
- 館内主要箇所
- 全Display

### FR-303-2
配信先セットは以下を持つ。

- 一意ID
- 表示名
- 対象Display ID群
- 有効 / 無効
- 任意のメモ

### FR-303-3
Cueの送信先として以下を選択できる。

- ALL
- 特定Display
- 配信先セット

### FR-303-4
既存のPhase 2 Cueデータとの互換性を維持する。

### FR-303-5
本番中はCueに設定済みの送信先を自動使用し、原則としてオペレーターが毎回送信先を選択しなくてよい。

### FR-303-6
配信先セット内の一部DisplayがOfflineでも、Onlineの対象DisplayにはCueを送れる。

### FR-303-7
配信先セットに含まれる必須DisplayがOfflineの場合、管理者画面に警告する。

### FR-303-8
配信先セットの編集は、本番モードの主要画面からは隠す。

### FR-303-9
Display名が変更されても、Display IDに基づいて配信先セットを維持する。

### FR-303-10
Display削除時に、該当Displayを参照している配信先セットを壊れた状態で放置しない。

最低限:
- 警告を出す
- 安全に参照を除去する
- または削除をブロックする

のいずれかを実装する。

---

## FR-304 設営・接続支援

### FR-304-1
サーバー起動時に、ローカルアクセスURLとLANアクセスURLを分かりやすく表示する。

最低限:

- Admin URL
- Display URL

### FR-304-2
可能なLAN IPv4アドレスを列挙する。

### FR-304-3
ループバック、仮想NIC、明らかに利用不適なアドレスを可能な範囲で除外または区別する。

### FR-304-4
管理者画面から接続情報を確認できるようにする。

### FR-304-5
Admin URL / Display URLをQRコードとして表示できるようにする。

### FR-304-6
QRコード生成はインターネット接続に依存しない。

### FR-304-7
Display登録用URLには、必要であれば `id` / `name` 等の初期値を付けられる設計を許容する。

### FR-304-8
設営時に「どのDisplayがどの端末か」を識別しやすくする。

例:
- Display画面に端末名を一時表示
- 管理者から識別表示を送る
- 接続確認用表示

具体方式は実装時に合理的なものを選んでよい。

---

# 7. 本番安全性要件

## FR-305-1
`Show Reset` は本番モードで誤操作しにくくする。

最低限、確認ダイアログを維持する。

### FR-305-2
Cue編集や配信先編集など、本番中に通常不要な操作は主要操作と視覚的に分離する。

### FR-305-3
Audio MasterがOfflineになった場合、管理者画面に目立つ警告を出す。

### FR-305-4
Audio Masterを自動で別Displayへ切り替えないというPhase 2方針を維持する。

### FR-305-5
Display OfflineによりCue実行全体を失敗扱いにしない。

Online対象へは処理を継続する。

### FR-305-6
Cue実行時に送信先が0台の場合、管理者へ明確な警告を返す。

### FR-305-7
本番モードで現在Cueと次Cueを取り違えにくい視覚設計にする。

### FR-305-8
同一操作の二重送信による意図しない連続Cue進行を可能な範囲で防止する。

例:
- 実行中の短時間ボタンdisable
- server側event idempotency
- sequence guard

具体方式は実装判断に任せる。

---

# 8. データモデル要件

Phase 3で追加が想定されるデータ:

## Display
既存項目に加え、必要に応じて:

- required: boolean
- audioReady / ttsReady等のランタイム状態

`audioReady` は永続化対象ではなくランタイム状態でもよい。

## Target Group
例:

```json
{
  "id": "main-and-floor2",
  "name": "201 + 2階",
  "displayIds": ["display-201", "display-floor2"],
  "enabled": true,
  "notes": ""
}
```

## Cue Target
既存互換性を維持しつつ、以下を表現できること。

- all
- display
- group

特定のJSON形状は、既存実装との整合を見て決定する。

---

# 9. UI / UX要件

## 管理者画面

本番モードでは、情報密度よりも誤操作防止と視認性を優先する。

優先順位:

1. 現在Cue
2. NEXT
3. 次Cue
4. 接続・音声警告
5. BACK / REPLAY / STOP
6. 詳細操作

### スマートフォン
- 縦画面でも主要操作可能
- 横スクロールを原則発生させない
- NEXTは十分大きくする
- 重要警告が画面外に埋もれない

### PC
- 201等のオペレーション卓から一目で状態把握できる
- 現在Cue / 次Cue / Display状態を同時に確認しやすい

## 投影画面

Phase 3では演出デザインを大きく変更しない。

ただし以下の内部状態通知は追加してよい。

- Audio Ready
- Display identity
- 接続確認

観客に内部情報が常時見える状態にはしない。

---

# 10. ネットワーク要件

- デフォルトHOSTはPhase 2同様、LAN利用可能な設定を維持する。
- URLを `localhost` にハードコードしない。
- Browser側は `location.host` を基準にする。
- ws / wssの切り替えを維持する。
- インターネットアクセスを必須にしない。
- QRコード生成もローカル完結する。
- KIT-WLAP2上での利用を想定しても、大学固有ネットワークへコードを依存させない。
- IPアドレスが変化しても、再起動時に正しい接続情報を案内できるようにする。

---

# 11. 互換性要件

- v0.2.0のCueを読み込める。
- v0.2.0のDisplay登録を可能な限り維持する。
- v0.2.0で可能だったBroadcast / individual targetingを失わない。
- Free Speakを失わない。
- Audio Master機能を失わない。
- Show Resetを失わない。
- Historyを失わない。
- Browser TTS Providerを維持する。
- JSON storage boundaryを維持する。
- Phase 2の既存テストを全て通すこと。

---

# 12. テスト要件

## 12.1 自動テスト

既存16テストを全て維持し、新規機能のテストを追加する。

最低限以下を含む。

### T301 本番モード
- 状態取得
- NEXT
- BACK
- REPLAY
- STOP
- モード切替でCue位置不変

### T302 本番前チェック
- 全OK
- Audio Masterなし
- Audio Master Offline
- Audio Ready false
- required Display Offline
- optional Display Offline
- Cueなし

### T303 配信先セット
- 作成
- 編集
- 削除
- Cueへの設定
- group宛送信
- group内一部Offline
- Display名変更
- Display削除時の整合性

### T304 接続支援
- LAN URL生成
- 複数NIC
- QR用URL
- localhostハードコードなし

### T305 後方互換
- Phase 2 state.json相当の読み込み
- Phase 2 Cue target
- legacy Display registration

---

# 13. ブラウザ実機テスト

最低でも以下の構成を再現する。

- Admin 1
- Display 3
- Display A = 201
- Display B = Location B
- Display C = Location C

確認項目:

1. 本番モード表示
2. NEXTでCue進行
3. BACK
4. REPLAY
5. STOP
6. target group送信
7. ALL送信
8. individual送信
9. Audio Masterのみ発話
10. non-masterは字幕のみ
11. Audio Ready警告
12. required Display切断
13. optional Display切断
14. 再接続
15. Adminリロード
16. Displayリロード
17. 本番前チェック
18. QRコード経由相当のURL
19. スマートフォン幅で管理者画面確認
20. Show Reset

ブラウザ上でUIを目視し、必要であれば自己批評して修正すること。

---

# 14. LAN実機テスト

可能な環境で以下を確認する。

- Server PCと別端末からAdminにアクセス
- Server PCと別端末からDisplayにアクセス
- スマートフォンからAdmin操作
- CueがDisplayへ到達
- Audio Master制御
- 複数Display同時接続

KIT-WLAP2での実機通信自体は既に確認済みであるため、Phase 3ではコード変更後に回帰確認を行う位置づけとする。

---

# 15. 長時間試験

Phase 2同様、複数Displayを用いた長時間試験を実施する。

推奨:
- 30分
- Admin 1
- Display 3

試験中に以下を混在させる。

- NEXT
- BACK
- REPLAY
- STOP
- ALL
- individual
- target group
- Free Speak
- required Display disconnect / reconnect
- optional Display disconnect / reconnect
- Audio Master disconnect / reconnect
- Admin reconnect
- 本番前チェック取得

確認:
- abnormal exitなし
- event failureなし
- Cue位置破損なし
- target group破損なし
- reconnect後state整合
- メモリ増加が異常でない

---

# 16. ドキュメント要件

READMEをv0.3.0へ更新する。

最低限記載:

- Phase 3の目的
- 本番モード
- 本番前チェック
- required / optional Display
- Audio Ready
- 配信先セット
- LAN URL / QR接続
- 設営手順
- 本番前チェック手順
- 本番中の基本操作
- トラブル時の対応
- Phase 3では未実装の演出機能
- KIT-WLAP2で端末間通信確認済みであること
- ただし大学ネットワーク固有仕様へ依存しないこと

VERIFICATIONを更新し、実行した検証結果を事実ベースで記録する。

---

# 17. Git / バージョン要件

- Phase 2の `v0.2.0` を変更しない。
- Phase 3実装前にworking treeを確認する。
- 機能単位で意味のあるcommitを行う。
- 実装完了後に全テストを実行する。
- README / VERIFICATIONを更新する。
- working tree cleanを確認する。
- remoteへpushする。
- 完成条件を満たした場合のみ `v0.3.0` tagを作成してpushする。

---

# 18. Phase 3 受入条件

以下をすべて満たしたとき、v0.3.0完成とする。

1. Phase 2既存機能が維持されている
2. 既存テストが全PASS
3. 本番モードが存在する
4. 本番モードで現在Sceneを確認できる
5. 本番モードで現在Cueを確認できる
6. 本番モードで次Cueを確認できる
7. NEXTが本番モードから実行できる
8. BACKが実行できる
9. REPLAYが実行できる
10. STOPが実行できる
11. 高度機能が主要操作から視覚的に分離されている
12. スマートフォン幅でも本番モードを操作できる
13. 本番前チェック画面が存在する
14. Server状態を確認できる
15. Cue存在を確認できる
16. Display接続状態を確認できる
17. required / optional Displayを区別できる
18. Audio Master状態を確認できる
19. Audio Ready状態を確認できる
20. Audio Ready falseを警告できる
21. required Display OfflineをERRORまたは同等の重大警告にできる
22. optional Display OfflineをWARNINGとして扱える
23. 本番開始可能 / 不可の総合判定がある
24. Cue位置を変えずに音声テスト可能、または同等の安全な確認方法がある
25. 配信先セットを作成できる
26. 配信先セットを編集できる
27. 配信先セットを削除できる
28. Cueに配信先セットを指定できる
29. 配信先セット宛にCueを送信できる
30. group内一部Offlineでも残りに送信できる
31. Display名変更でgroup参照が壊れない
32. Display削除時にgroup参照の整合性が保たれる
33. LAN Admin URLを表示できる
34. LAN Display URLを表示できる
35. 接続用QRコードをローカル生成できる
36. QRコード生成にインターネット不要
37. 複数NIC環境を合理的に扱える
38. AdminリロードでCue位置を失わない
39. Displayリロードで過去音声を勝手に再生しない
40. Audio Master disconnectを管理者へ警告できる
41. Audio Masterを勝手に自動変更しない
42. 1 Display切断で他Displayが止まらない
43. 送信先0台時に明確な警告がある
44. Phase 2 state相当を読み込める
45. Free Speakが維持されている
46. Historyが維持されている
47. Show Resetが維持されている
48. Browser TTS Provider境界が維持されている
49. Browser実機相当テストを実施している
50. Admin 1 + Display 3構成を検証している
51. スマートフォンからAdminを確認している
52. LAN別端末アクセスを回帰確認している
53. 長時間試験を完了している
54. abnormal exitがない
55. READMEが更新されている
56. VERIFICATIONが更新されている
57. working treeがclean
58. remoteへpush済み
59. `v0.3.0` tagが完成コミットを指している
60. Phase 3スコープ外の演出を不用意に作り込んでいない

---

# 19. Phase 3完了後の想定

Phase 3完了時点では、

> 「横川AIをどう演出するか」はまだ確定していなくても、  
> 「決まった演出を安全に本番運用するためのShow Control基盤」は完成している

状態を目指す。

その後、脚本ミーティング等で以下を確定する。

- 横川AI登場シーン
- 各Cueの送信先
- 通常時 / 暴走時の演出
- アバターの有無
- 音声方式
- オペレーター
- 実際の201および館内Display配置

これらを受けてPhase 4で本番演出を反映する。
