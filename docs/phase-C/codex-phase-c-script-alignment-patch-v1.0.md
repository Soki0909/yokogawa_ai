# Codex修正指示 — Phase C 最新台本演出Alignment Patch v1.0

Repository:

```text
C:\Users\kumes\Documents\yokokawa_ai
```

Target branch:

```text
codex/phase-c-production-audio
```

このタスクは新規大規模開発ではない。

**最新版台本を1行単位で基準にし、現在完成しているPhase C Production Audio Integrationと照合し、不一致だけを修正する。**

---

# 0. Source of Truth

Google Docs:

```text
『7号館からの脱出』上演台本
https://docs.google.com/document/d/16KxoOjIFLJXikFF_3u3LnnbjnQX8xJvZ-cPPNxkuJVo/edit?tab=t.0
```

この指示作成時revision:

```text
ANLCKQkGG6HZFnG3YLRl1e3dLpFXWQRPK07w5vC3080NFOXU5GMaJxPmE8OKDYB2ZkWrOup0WNSlpIyJDK7681oB5bB3b7g-7MvsG-oMUE0
```

優先順位:

1. Google Docs最新版台本
2. この指示書
3. ローカルの現在のProduction実装
4. Phase B承認済みVisual

作業開始時にrevisionを再確認できる場合は確認する。
変わっている場合、横川AI台詞・舞台指示の差分を先に確認する。

---

# 1. 既存完成部分を壊さない

Phase Cで既に完成済み:

- Candidate 2A / `yokogawa-professor-v1`
- 18 Production WAV
- Scripted Speech = fixed WAV
- Free Speak = Server-side AivisSpeech
- Browser fallbackなし
- STOP / REPLAY / reconnect
- Audio Master
- Preflight
- 97/97 tests
- 30分soak
- Phase B承認Visual

これらはMATCHしている限り変更しない。

---

# 2. 最初にAudit Matrixを作成

コード変更前に、以下AL-001〜AL-017を現行実装と照合し、

```text
MATCH
MISMATCH
EXTERNAL_SYNC
UNRESOLVED_SCRIPT
NOT_APPLICABLE
```

で分類する。

保存:

```text
docs/phase-C/script-alignment-audit.md
```

各rowに:

```text
Alignment ID
台本記述
現行Cue ID
現行挙動
期待挙動
判定
理由
最小修正
外部依存
```

を記録。

**MATCHは修正禁止。**

---

# 3. 台本演出 → Production Cue → 横川AI → 照明/音響/役者 対応表

## AL-001 PRE-SHOW / STANDBY

### 台本

- 「横川AIによる特別講義の開始を待つ参加者たち」
- 白山「横川AIの起動も確認します」
- 「虎谷は…横川AIが映るモニターへ目を向ける」
- 光「ママ、見て！ あれが横川AIかな？」

### ユーザー確定要件

**公演開始時点では人物アバターを表示しない。**

ただし真っ黒画面にはしない。

### Production Cue

`PRE-SHOW / STANDBY`

### 横川AI

```text
YOKOGAWA AI UIは表示
Avatar visible = false
状態 = STANDBY
```

「あれが横川AIかな？」が成立する程度に横川AIの画面であることは分かる。

### 照明/音響/役者

特別Cue不要。

### 判定

**MISMATCH確定。修正対象。**

---

## AL-002 BOOT / Avatar reveal

### 台本

- 横川がモニターへ向き直る
- 横川「横川AI、起動してくれ」
- AI「承知しました。横川教授。横川AIを起動します」
- 全員リアクション

### Production Cue

Actor lineをtriggerにBOOT Cue。

### 横川AI

推奨:

```text
STANDBY
→ BOOTING
→ WAV 001
→ Avatar reveal
→ NORMAL
```

既存`boot` transitionを優先。

AvatarはWAV 001の途中で自然に出現し、終了時には完全表示。

突然1frameで顔を出さない。

### 役者

全員リアクションはAvatar出現・音声終了を見て入れる。

### Reset要件

Production ShowでSHOW RESETした場合も:

```text
STANDBY
Avatar hidden
```

へ戻る。

Phase A demoには波及させない。

---

## AL-003 NORMAL講義

### 台本

WAV 002〜004の通常会話・プリンキピア説明。

### Production Cue

NORMALを維持。

### 横川AI

2A Voice / NORMAL / audio-reactive lip sync。

### 判定

要照合。MATCHなら変更禁止。

---

## AL-004 プリンキピア説明終了後の最初の異常

### 台本順

```text
WAV 004終了
↓
突然モニター映像が乱れる
↓
照明明滅
↓
複数扉の施錠音
↓
役者が状況確認
```

### Production Cue

WAV 004中はNORMALのまま完走。

終了後に別ANOMALY Cue。

### 横川AI

最初は「異常発生」。
この時点でFULL HIJACKEDへ先走らない。

### 外部連携

- Lighting flicker marker
- Door lock SE marker
- Cast investigation timing

### 判定

要照合。
WAV004途中または終了直後にFULL HIJACKEDまで進むならMISMATCH。

---

## AL-005 FULL HIJACKEDへの切替点

### 台本

- 「その瞬間、照明が一度消え、再び点灯する」
- 「横川AIの声が、先ほどとは異なる調子で響く」
- AI「外部への通信は許可されていません」

### Production Cue

この瞬間をFULL HIJACKEDへの明確な切替点とする。

WAV 005。

### 横川AI

HIJACKED Visual。

Voiceは同一人物のままNORMALとの差を認識できること。

```text
same speaker
same Candidate 2A
same personality
```

を維持し、

- 軽い通信異常
- band-limit
- subtle double
- jamming

等の最小限の処理を検討。

怒鳴る・悪役化は禁止。
聞き取りやすさ最優先。

### 判定

**MISMATCH確定。**

Phase C完了時点では全18音声が同じraw 2Aで、台本の「異なる調子」は未達。

---

## AL-006 拒否 / 認証不可 / 謎提示

### 台本

WAV 006〜008。

### Production Cue

HIJACKEDを維持。

### 横川AI

AL-005と同じHIJACKED音声処理を適用する範囲を明示。

状態を無意味に切り替えない。

---

## AL-007 5つの謎を出題

### 台本

- 「ノイズとともに画面が変わり、横川AIが5つの謎を出題する」
- AI「第一の謎は、この7・201にあります」

### Production Cue

dedicated riddle-enter Cue + WAV 009。

### 横川AI

少なくとも観客から:

```text
5問ある
第1問
7・201
```

が認識できるVisual。

実問題内容が未確定ならCodexは創作禁止。

### 判定

要照合。
「5つの謎を出題する」視覚表現が無ければMISMATCH。

---

## AL-008 5問目終了後の館内アナウンス

### 台本

- 答え⑤獲得
- 「その瞬間、館内に無機質な横川AIのアナウンス」
- WAV 010
- 終了後、静寂→扇が踏み出す

### Production Cue

WAV 010は館内アナウンス扱い。

main NEXTへ無条件に混ぜない。

### 音響/役者

- 実際に館内で聞こえるPA coverageが必要
- アナウンス終了が扇の次台詞trigger

### 判定

**UNRESOLVED / route mapping。**

既存分離を勝手に戻さない。

---

## AL-009 Final Challenge

### 台本

- WAV 011
- 「最終問題を提示する」
- 観客が最終暗号を解く

### Production Cue

`final-challenge-enter`

### 横川AI

最終問題Visualを提示。

問題本文が未確定なら創作禁止。

### 判定

要照合。

---

## AL-010 認証成功 → Unlock 100%

### 台本

- WAV 012
- 電子音
- Avatar周囲に複数Gauge
- 0→100%
- 100%直後、虎谷登場

### Production Cue

```text
auth success
→ electronic SE marker
→ unlock-start
→ 100%
→ hold
```

### 横川AI

既存Phase B Gaugeを再利用。
100%後も保持。
Emergencyへ自動進行禁止。

### 役者

100%表示を虎谷登場triggerにする。

### 判定

VisualはMATCH可能性が高い。
SE・triggerは要照合。

---

## AL-011 Emergency 1

### 台本順

```text
虎谷が持ち出し指示
↓
警告音
↓
WAV 013
```

### Production Cue

Warning SEがAI台詞より先。

### 横川AI

WARNING / Emergency Protection。
Unlock中断。

### 判定

要照合。
SEが同時/後ならMISMATCH。

---

## AL-012 Emergency 2

### 台本順

```text
虎谷が拘束指示
↓
WAV 014
↓
またしても警告音
```

### Production Cue

WAV014後にWarning SE marker。

### 判定

要照合。

---

## AL-013 HOSTILE切替

### 台本

- 虎谷が端末操作
- **その時点で横川AIの様子が変化**
- 危険な画面配色
- 館内照明明滅
- アラーム
- その後虎谷が暴走命令
- WAV 015

### Production Cue

HOSTILEへの切替はWAV015開始ではなく、

**虎谷の端末操作をtriggerにした先行Cue。**

### 横川AI

HOSTILE Visualを先に見せる。

### 外部連携

- lighting flicker marker
- alarm marker

WAV015後に轟音marker。

### 判定

要照合。
WAV015と同時に初めてHOSTILEになるならMISMATCH。

---

## AL-014 非常停止コードの謎

### 台本

- 横川が隠しコードのヒント
- 白山が暗号を読む
- 「提示された非常停止コードの謎へ挑む」

### Production Cue

観客へ非常停止謎を提示するDisplay Cueが必須。

### 横川AI

HOSTILE状態のまま。
数m離れても読める。

問題本文・答えが未確定なら創作禁止。

既存確定asset/textがなければ:

```text
visual container
operator note
asset dependency
```

まで。

### 判定

要照合。

---

## AL-015 停止コード成功 → SHUTDOWN

### 台本順

```text
扇「横川AI！ 〇〇！」
↓
激しい警告音と明滅がピタリと止まる
↓
静寂
↓
WAV 016
```

### Production Cue

Stop code Cue開始時に:

- alarm STOP marker
- lighting flicker STOP marker
- HOSTILE motion停止
- SHUTDOWN transition

その後WAV016。

### 横川AI

SHUTDOWNへ。

WAV016終了後:

- door unlock SE marker
- 馬場/窪の確認動作marker

### 判定

要照合。
WAV016終了後までalarmが残るならMISMATCH。

---

## AL-016 SHUTDOWNを終盤まで保持

### 台本

Shutdown後、虎谷・横川・扇らの長い芝居が続く。

復旧はかなり後:

> 「そのとき、正面のモニターに表示された横川AIが温かな光を取り戻し、正常に復旧する。」

### Production Cue

```text
SHUTDOWN
→ long hold
→ explicit RECOVERY Cue
→ NORMAL
```

自動Recovery禁止。

### 横川AI

和解芝居中はSHUTDOWN。

台本の復旧行でのみRECOVERY。

### 判定

**最重要要照合。**

Phase A demoの「Shutdown直後Recovery」をProductionへ持ち込んでいたらMISMATCH。

---

## AL-017 Scene 7 / 横シーン5の未確定事項

### Scene 7 conflict

Google Docs内に `シーン7〔7・201／5分〕` が2系統存在。

一方には:

```text
横川AI『全五問、完全正解を確認しました。』
```

があり、もう一方には確認できない。

WAV017は削除禁止。
Production NEXTへ入れるかは勝手に決めない。

```text
UNRESOLVED_SCRIPT
```

として記録。

### 横シーン5

WAV018:

```text
「謎の回答者は、7・201へ集合してください」
```

は横シーン5専用。

既存:

```text
shows/production-yokogawa-route.json
```

分離を基本維持。

main NEXTへ混ぜない。

### Endingの「画面を消す」

別Scene 7の文脈では押野のスマートフォンを指す。
横川AI Display BLACKOUTの根拠にしない。

---

# 4. External Syncの扱い

台本にある:

- 照明明滅
- 照明OFF→ON
- 扉施錠SE
- 電子音
- 警告音
- アラーム
- 轟音
- 扉解錠SE
- 役者リアクション

を、横川AI Appが勝手に直接制御する仕様にはしない。

原則:

```text
syncMarkers
operatorNote
triggerNote
```

で接続点を明確にする。

既存の照明/音響Cue IDがrepositoryにあれば再利用。
公式Cue番号を創作しない。

---

# 5. HIJACKED Voiceの実装境界

台本完全準拠のため、NORMALとの差は必要。

ただしVoice Profileは変更しない。

元Production WAVのprovenanceを保持。

候補:

- Web Audio processing
- 派生processed WAV
- playback effect layer

のうち最小変更を選択。

必須:

- offline
- deterministic
- STOP/REPLAY対応
- audio-reactive lip sync維持
- intelligibility維持
- same-person identity

005〜009に適用するか、実台本上必要な範囲をauditで決定する。

HOSTILEを過剰にvillain化しない。

---

# 6. Production Show初期状態

特に重要。

Production Show import後およびSHOW RESET後:

```text
PRE-SHOW / STANDBY
Avatar hidden
```

を保証。

Phase A demoやdevelopment showには影響させない。

必要ならProduction固有initial stateを実装するが、
大規模schema変更より既存構造の再利用を優先する。

---

# 7. 修正禁止

MATCHしている部分をついでに作り直さない。

特に:

```text
Phase B Visual composition
Avatar artwork
Candidate 2A
18 raw WAV
Local TTS architecture
Free Speak
Runtime cache
Audio Master
Preflight
Reconnect logic
phase-a-demo
```

を不要に変更しない。

---

# 8. Verification

修正後:

```powershell
npm run check
npm audit --omit=dev
```

既存97/97以上。

実ブラウザ:

```text
Admin 1
Display 3
```

で確認:

1. Production開始時Avatar hidden
2. SHOW RESET後Avatar hidden
3. BootでAvatar reveal
4. NORMAL speech
5. WAV004終了後ANOMALY
6. 役者芝居を挟んでHIJACKED
7. HIJACKED voice difference
8. 5-riddle Visual
9. Final Challenge
10. Unlock 0→100→hold
11. Emergency warning ordering
12. HOSTILE先行Visual
13. Emergency-stop riddle
14. Stop codeでalarm/flicker stop
15. WAV016
16. Shutdown long hold
17. explicit Recovery
18. STOP/REPLAY
19. reconnect
20. BLACKOUT/RESTORE regression

1280×720 / 1920×1080。

console:

```text
warning 0
error 0
```

---

# 9. Self Review

必ず確認:

1. 起動前にAvatarが見えていないか
2. 待機画面が真っ黒で「あれが横川AIかな？」が成立しなくなっていないか
3. WAV004中に異常へ先走っていないか
4. ANOMALYとHIJACKEDを同一瞬間にしていないか
5. HIJACKED voiceが聞き取りにくくないか
6. 外部照明/音響を勝手にApp直制御へしていないか
7. Warning SE順序が台本通りか
8. HOSTILEが虎谷端末操作より遅れていないか
9. 非常停止謎を創作していないか
10. Stop code後にalarmが残っていないか
11. Shutdown直後にRecoveryしていないか
12. Scene7 conflictを勝手に解決していないか
13. 横シーン5をmain NEXTへ混ぜていないか
14. Phase B Visualを作り直していないか
15. 2A raw WAV/provenanceを壊していないか

問題があれば修正→再検証。

---

# 10. 最終成果物

最低限:

```text
docs/phase-C/script-alignment-audit.md
docs/phase-C/verification.md
shows/production.json
必要なProduction code/tests
```

横シーン側がMATCHなら触らない。

---

# 11. 最終報告

```text
1. Baseline / HEAD
2. Script revision
3. Alignment matrix counts
4. MISMATCHだったAlignment ID
5. 実際に修正したAlignment ID
6. PRE-SHOW / STANDBY
7. Boot Avatar reveal
8. ANOMALY→HIJACKED timing
9. HIJACKED voice
10. Riddle / Final Challenge
11. Auth / Unlock
12. Emergency warning ordering
13. HOSTILE trigger
14. Emergency-stop riddle
15. Stop→Shutdown→unlock
16. Shutdown hold→Recovery
17. Scene7 conflict
18. 横シーン5
19. Tests / Browser / Console
20. git diff
21. USER REVIEW REQUIRED
```

---

# 12. STOP GATE

このpatchでは:

```text
script alignment
→ mismatch correction
→ browser verification
→ USER REVIEW REQUIRED
```

まで。

禁止:

```text
push
master merge
tag
formal v0.7.0 release
```
