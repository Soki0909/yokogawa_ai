# Phase C Script Alignment Audit

Status: PRE-IMPLEMENTATION AUDIT COMPLETE / PATCH VERIFIED  
Authority: 現在のGoogle Docs台本「『7号館からの脱出』上演台本」  
Document ID: `16KxoOjIFLJXikFF_3u3LnnbjnQX8xJvZ-cPPNxkuJVo`  
Revision ID: `ANLCKQkGG6HZFnG3YLRl1e3dLpFXWQRPK07w5vC3080NFOXU5GMaJxPmE8OKDYB2ZkWrOup0WNSlpIyJDK7681oB5bB3b7g-7MvsG-oMUE0`  
Modified: `2026-10-03T15:28:38.878Z`  
Audited against: `shows/production.json`, `shows/production-yokogawa-route.json`, current server/display/audio implementation

この監査はコード変更前に実施した。`MATCH` は変更しない。台本に記載のない問題本文、照明・音響の正式Cue番号、未確定のroute mappingは推測しない。外部部署との同期は `syncMarkers`、`operatorNote`、`triggerNote` の記述に限定する。

| Alignment ID | 台本記述 | 現行Cue ID | 現行挙動 | 期待挙動 | 判定 | 理由 | 最小修正 | 外部依存 |
|---|---|---|---|---|---|---|---|---|
| AL-001 | 開演前、参加者待機。モニター上の横川AIを出演者が起動前に確認する | 初期状態 | Show import/reset後からAvatar表示、通常画面 | ProductionだけUIは表示、Avatarは非表示、BLACKOUTではないSTANDBY | MISMATCH | 起動前から人物が見えている | Production Showの初期Avatarを非表示にし、import/resetがShow固有初期状態へ戻るようにする | 舞台監督の開演判断 |
| AL-002 | 横川教授の起動命令→WAV001→一同反応 | `prod-001` | WAV001時にAvatarは既に表示、boot演出なし | STANDBY→BOOTING→WAV001と同期して滑らかにAvatar reveal→NORMAL。resetはSTANDBYへ | MISMATCH | 起動と出現の因果が見えない | `prod-001`へboot transition/overlayとAvatar revealを付与。Phase Aは変更しない | 横川教授「横川AIを起動してくれ」直後GO |
| AL-003 | WAV002、WAV003、WAV004は通常状態で説明 | `prod-002`〜`prod-004` | NORMAL、固定WAV、手動進行 | 同じ | MATCH | 本文・順序・Preset・音声Assetが一致 | 変更なし | 出演者の台詞受け／舞台監督GO |
| AL-004 | WAV004終了後に映像ノイズ、照明明滅、扉施錠音。出演者が調査 | `prod-v-incident`, `prod-v-hijack` | 別ANOMALY Cueはあるが、次の独立CueでWAV005より前にFULL HIJACKEDへ進める。外部同期記録不足 | WAV004完了まではNORMAL。独立ANOMALYのみ発生し、LX/扉SE/出演者調査を明示。FULL HIJACKEDはまだ開始しない | MISMATCH | P-V02が早期HIJACKEDを許し、台本上の同期点が欠落 | ANOMALY Cueへ記述的sync markerを追加し、早期HIJACKED CueをWAV005位置へ統合 | LX明滅、扉lock SE、出演者調査 |
| AL-005 | 消灯・復灯後、声色が変わりWAV005 | `prod-v-hijack`, `prod-005` | HIJACKEDはWAV005前のCue。WAVはraw再生 | WAV005のGOでFULL HIJACKEDへ移行。同一人物性を保つ微細で決定的なoffline voice差 | MISMATCH | Visual timingとvoice差が台本指示に未対応 | `prod-005`へtakeoverを統合し、005〜009へ共通のsubtle hijacked playback effectを適用 | LX消灯・復灯、舞台監督GO |
| AL-006 | WAV006〜WAV008も乗っ取られたAIとして継続 | `prod-006`〜`prod-008` | HIJACKED visualだがraw WAV。処理範囲の宣言なし | HIJACKEDを維持し、WAV005〜009で同じvoice treatmentを継続 | MISMATCH | 状態は合うがvoice directionが未実装 | 005〜009に同一effect profileを明示。本文・Assetは変更しない | 出演者の台詞受け／舞台監督GO |
| AL-007 | ノイズと画面変化、五つの謎を提示。WAV009で第一の謎が7・201にあると告知 | `prod-008`, `prod-009` | WAV008/009のみ。専用riddle-enter visualなし | 独立riddle-enterで「5問」「第1問」「7・201」を伝え、問題本文は創作しない。その後WAV009 | MISMATCH | 視覚的な問題開始と5問構造が不足 | 専用display Cueを008と009の間に追加し、既存riddle-statusを使用 | 問題本文・現物素材は未提供 |
| AL-008 | Scene 5、全条件達成後の館内放送WAV010。その後のroute接続は未確定 | `prod-010`, `prod-018` | WAV010がmainの通常NEXT列。018は別Show | WAV010は館内放送として独立し、未確定route mappingをmain NEXTに断定しない。018分離を維持 | MISMATCH | WAV010を無条件の本編NEXTに置くとroute進行を誤操作し得る | WAV010を直接実行用としてmain NEXTから無効化し、未確定noteを明示。018は別Showのまま | route mappingは舞台監督確認待ち |
| AL-009 | Scene 6、WAV011で最終問題提示 | `prod-011` | final-challenge transition/visual、5入力枠。問題本文は未記載 | 同じ。台本にない問題本文を作らない | MATCH | 状態・本文・専用visualが一致し、創作なし | 変更なし | 最終問題の実素材は未提供 |
| AL-010 | WAV012認証成功→電子音→複数ゲージが0→100%、到達後保持 | `prod-012`, `prod-v-unlock` | WAV012後に別unlock Cueで0→100%、保持。電子音markerなし。WAV012時点でRECOVERY | WAV012後の電子音を明示し、手動unlock start、100%保持。緊急へ自動進行しない | MISMATCH | core unlockはあるがSE同期と状態意味が不足 | WAV012へ電子音marker、unlock Cueへ明示note。WAV012はHIJACKEDを保持し、unlock表示のみ警告系へ | 電子音SE、虎谷入場 |
| AL-011 | 虎谷の操作後、警告音→WAV013 | `prod-013` | WAV013でemergency transition。事前警告SE記録なし | 警告SEを先行させてからWAV013 | MISMATCH | 音響順序が記録されていない | WAV013のsync marker/trigger noteへ「警告SE完了後」を追加 | 警告SE、虎谷操作 |
| AL-012 | WAV014の後に警告音 | `prod-014` | WAV014のみ。後続SE記録なし | WAV014終了後に警告SE | MISMATCH | 音響順序が記録されていない | WAV014へafter marker/operator noteを追加 | 警告SE |
| AL-013 | 虎谷が端末操作→AIが危険表示、照明明滅・警報→WAV015→轟音 | `prod-015` | WAV015と同時に初めてHOSTILE。前後の外部同期なし | WAV015より前の独立CueでHOSTILE。LX/警報を開始し、WAV015後に轟音 | MISMATCH | 危険表示が一拍遅く、外部同期が欠落 | HOSTILE先行Cueを追加。P015は状態保持、前後markerを記述 | 虎谷端末操作、LX明滅、警報、轟音SE |
| AL-014 | 非常停止の謎・ヒント。問題内容は台本上未確定 | なし | 専用表示なし | 内容を創作せず、非常停止問題のcontainerと未提供表示、operator noteを用意 | MISMATCH | 上演上の表示受け皿がない | HOSTILE区間に専用riddle-status Cueを追加し、`CONTENT PENDING`と依存を明示 | 非常停止問題本文・素材 |
| AL-015 | 停止コード→警報STOP・照明明滅STOP・暴走停止→shutdown transition→WAV016→扉解錠音・出演者確認 | `prod-016` | WAV016と同時にshutdown。停止コードCueと前後同期なし | 独立停止コードCueで外部STOPとshutdown開始、その後WAV016。終了後に扉SE/出演者確認 | MISMATCH | 台本上の順序と停止同期が表現されていない | shutdown先行Cue追加。WAV016はshutdown保持。前後markerを記述 | 停止コード入力、警報/LX STOP、扉unlock SE、出演者確認 |
| AL-016 | WAV016後、長い芝居区間は停止状態。Scene 7後半で明示的に復旧 | `prod-016`, `prod-v-recovery` | SHUTDOWN保持。復旧は独立手動Cueで自動進行なし | 同じ | MATCH | 長時間保持と明示RECOVERYが既に分離されている | 変更なし | Scene 7の舞台進行合図 |
| AL-017 | Scene 7のWAV017はタブ間で記載競合。横Scene 5のWAV018は別route。「画面を消す」は忍野のスマートフォン | `prod-017`, route `prod-018` | WAV017がmain NEXTで有効。018は別Show。AI blackout Cueなし | WAV017 Asset/Cueは削除せず、解決までmain NEXTに入れない。018分離維持。スマホ指示でAIをblackoutしない | UNRESOLVED_SCRIPT | Scene 6内包Scene 7と独立Scene 7でWAV017有無が競合 | `prod-017`を無効化して直接確認用に保持し、競合をnoteへ固定。018とBLACKOUTは変更しない | WAV017採否・接続位置は脚本/舞台監督確認待ち |

## 修正境界

- 変更対象は `MISMATCH` と、未確定事故を防ぐための AL-017 containment（Cue保持のまま通常NEXTから除外）のみ。
- `MATCH` の AL-003、AL-009、AL-016はShowの意味・順序を変更しない。
- WAV001〜018の台詞本文とraw asset provenanceは変更しない。
- HIJACKED音声差は再生成ではなく、005〜009だけに適用するoffline playback effect layerとする。
- 外部部署へ直接信号は送らず、正式Cue番号も付与しない。
- Google Docs台本には書き込まない。

## Post-implementation result

事前分類はMATCH 3、MISMATCH 13、UNRESOLVED_SCRIPT 1。MISMATCHのAL-001、002、004〜008、010〜015を最小修正し、AL-017はWAV017を削除せず通常NEXTから除外して安全にcontainした。AL-003、009、016は変更していない。検証根拠は [`verification.md`](verification.md) を参照。
