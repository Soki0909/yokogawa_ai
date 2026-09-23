# Codex 実装プロンプト
## yokogawa_ai v0.4.1 — Avatar Asset Integration Patch

あなたは `yokogawa_ai` リポジトリに対して、`v0.4.0` の上に `v0.4.1` を実装してください。

今回の目的は、新機能を大きく増やすことではなく、**既に完成しているAvatar機構へ、実際に作成した横川AI画像アセットを安定統合すること**です。

最終的に、横川AIの画像アバターが Display 上で実際に表示され、

- `mouth_closed`
- `mouth_half`
- `mouth_open`
- `eyes_closed`

を使って、口パクとまばたきが自然に動作する状態まで仕上げてください。

---

# 0. 最初に読むもの

必ず以下を確認してください。

1. `yokogawa_ai_v0_4_1_requirements.md`
2. `README.md`
3. `docs/README.md`
4. `docs/phase-4/verification.md`（名称差異があれば相当文書）
5. `VERIFICATION.md` または同等の検証文書
6. `package.json`
7. Avatar関連実装
8. Lip Sync実装
9. Preset実装
10. Display描画実装
11. Asset Registry / static assets 実装
12. tests
13. soak test
14. git status / log / tag / remote

必要ならリポジトリ全体を調査して実装箇所を特定してください。

---

# 1. Goal

利用可能なら `set_goal` を使ってください。

Goal例:

> v0.4.0を壊さず、横川AI画像アセット4点を統合し、局所口差分によるlip syncと自動まばたきを実装し、Admin 1 + Display 3、390x844、LAN、30分soak、tests、docs、push、v0.4.1 tagまで完了する。

ユーザーへの途中確認は原則不要です。

---

# 2. Git確認

最初に以下を確認してください。

```bash
git status
git log --oneline --decorate -n 15
git tag
git remote -v
```

前提:
- `v0.4.0` が存在すること
- ユーザー報告では `origin/master` は `44c2857`
- `v0.4.0` は annotated tag

実際の履歴が異なる場合でも、履歴を書き換えず現状をsource of truthとしてください。

`v0.4.0` tagは変更しないでください。

---

# 3. 使用する画像アセット

今回の実装では、以下の4画像を統合対象とします。

1. base / mouth_closed  
   `/mnt/data/ghostwriter_images/context/a00607ca-26ad-5cd4-b77a-b41114215175.png`
2. mouth_half  
   `/mnt/data/ghostwriter_images/context/9bf0b479-364f-5849-b760-84a25c117421.png`
3. mouth_open  
   `/mnt/data/ghostwriter_images/context/c9b059bf-569f-5040-9b4c-04781c0712cb.png`
4. eyes_closed  
   `/mnt/data/ghostwriter_images/context/df900f77-baec-5dcd-a0c2-12b6b450a448.png`

これらをリポジトリ内の適切な場所へ取り込み、実運用アセットとして配置してください。

例:
- `public/assets/avatar/yokogawa/v1/base.png`
- `public/assets/avatar/yokogawa/v1/mouth-half.png`
- `public/assets/avatar/yokogawa/v1/mouth-open.png`
- `public/assets/avatar/yokogawa/v1/eyes-closed.png`

---

# 4. 重要な実装方針

## 4.1 全画像の丸ごと切り替えは禁止

4枚の画像はほぼ同一ですが、生成由来の微細差分があります。

そのため、

```text
closed image 全体表示
→ half image 全体表示
→ open image 全体表示
```

のような実装は避けてください。

理由:
- 顔全体がわずかに揺れる可能性がある
- 髪や服の微差が口パク時に見えてしまう

## 4.2 ベース + 局所overlay方式

推奨構造:

```text
AvatarRoot
├─ BaseImage       (base.png)
├─ MouthOverlay    (mouth-half / mouth-open)
└─ BlinkOverlay    (eyes-closed)
```

- BaseImageは常時表示
- MouthOverlayは state に応じて切替
- BlinkOverlayはまばたき時のみ表示

局所差分を実現する手法は自由ですが、例えば以下でよいです。

- 事前切り出しPNGを生成
- build-time scriptで差分用素材を生成
- CSS clip / overflow / mask
- Canvasで局所描画

最終的に口と目だけが切り替わって見えることを優先してください。

---

# 5. 実装タスク

## Stage A — 現行Avatar機構の理解

確認すること:
- `v0.4.0` のSVG/仮Avatarがどこで描画されるか
- Lip Sync state (`closed / half / open`) の分岐箇所
- simulated / audio-reactive の切替箇所
- Preset state の適用箇所
- shutdown / blackout / reconnect 時の描画更新

## Stage B — Asset導入

- 4画像をリポジトリへ配置
- Asset Registry または同等設定へ登録
- Avatar mode に「image-based Yokogawa v1」を追加

将来的にSVG Avatarに戻せるよう、可能なら mode / provider の概念を残してください。

## Stage C — Base Avatar描画

- Base image をDisplayへ描画
- レイアウト崩れなく表示
- 既存Display UIと整合
- 本番Presetでも破綻しない

## Stage D — Mouth Overlay

- `closed` → overlayなし
- `half` → mouth-half を表示
- `open` → mouth-open を表示

**閉じた画像からの相対表示として見えることを優先してください。**

口以外が動いて見える実装は避けてください。

## Stage E — Blink Overlay

- `eyes_closed` を目周辺差分として表示
- まばたきは mouth state と独立
- blink中にも mouth が切り替わる設計で問題ない

## Stage F — Blink Controller

実装要件:
- idle時に自動まばたき
- 3〜6秒程度のランダム間隔
- 100〜180ms程度の短い目閉じ
- shutdown時は停止または明示的停止表現

過剰に複雑な状態機械は不要です。

## Stage G — Preset統合

normal / warning / hijacked / hostile / shutdown / recovery で、画像Avatarが破綻なく表示されるよう調整してください。

特に:
- warning
- hijacked
- hostile
- shutdown

で Avatar が見えなくなったり、過剰に潰れたりしないこと。

**新しい顔画像を増やすのではなく、既存Preset演出で見せる**方針で進めてください。

## Stage H — README / Docs

READMEへ以下を追記してください。
- Yokogawa Avatar v1 実アセット
- ファイル構成
- 口パクの仕組み
- まばたきの仕組み
- 将来差し替え方法

verificationへ以下を追記してください。
- asset integration
- blink
- lip sync
- preset compatibility
- reconnect
- soak

---

# 6. 実装上の補助指針

## 6.1 mouth / eyes 差分の扱い

必要なら、build-time で補助素材を生成してよいです。

例:
- mouth-half のうち口周辺だけを切り出したPNG
- mouth-open のうち口周辺だけを切り出したPNG
- eyes-closed のうち目周辺だけを切り出したPNG

ただしユーザー向け最終成果物は、システムへ組み込まれた状態です。  
補助スクリプトは導入してよいですが、過剰に複雑にしないでください。

## 6.2 もし差分生成の自動化を行うなら

- 元画像との差分 bounding box を求める
- 適切に margin を足して切り出す
- 背景透明を維持
- 元baseと同一座標系へ載せる

といった方針で構いません。

## 6.3 実装の優先順位

最優先:
1. 既存v0.4.0を壊さない
2. 口パクが自然に動く
3. まばたきが動く
4. Preset表示が破綻しない
5. 30分soakで安定

---

# 7. テスト要件

## 7.1 自動テスト

最低限確認:
- 既存43テストすべてPASS
- Avatar asset registration
- image avatar mode selection
- mouth state mapping
- blink timing logic
- blink + mouth coexistence
- shutdown blink behavior
- preset compatibility
- reconnect state restore
- blackout compatibility

テスト数は43以上になってよいです。

## 7.2 実ブラウザ検証

必須シナリオ:
1. normal + idle blink
2. Browser TTS + simulated lip sync
3. local audio + audio-reactive lip sync
4. warning
5. hijacked
6. hostile
7. shutdown
8. recovery
9. reconnect
10. CLEAR
11. BLACKOUT
12. Admin 390×844
13. Admin 1 + Display 3

自己批評ポイント:
- 顔全体がチラつかないか
- 口だけが変化して見えるか
- まばたきが不自然でないか
- hostileでも見え方が破綻しないか
- 小さめ表示でも口形差が分かるか

問題があれば自分で修正してください。

## 7.3 LAN

- Admin / Display を別端末想定で確認
- 既存LAN構成を壊していないこと

## 7.4 soak

30分。

含める:
- Browser TTS
- local audio
- lip sync
- blink
- preset changes
- reconnect
- CLEAR
- BLACKOUT

記録:
- duration
- events
- failures
- reconnects
- abnormal exit
- memory 可能なら記録

---

# 8. セキュリティ・品質

確認:
- `npm audit`
- asset pathの不正参照が増えていないこと
- docsとの整合

今回追加する画像統合で、既存のDisplay向けstateから不要情報を漏らさないこと。

---

# 9. Git方針

意味のあるcommitで進めてください。

例:
1. add yokogawa image avatar assets
2. integrate image avatar rendering
3. add blink controller
4. connect image avatar to lip sync
5. tests and docs

完成条件を満たしたら:

```bash
git status
# clean を確認
```

その後、remote push し、annotated tag `v0.4.1` を作成・pushしてください。

`v0.4.0` は変更しないでください。

---

# 10. 完了報告

最後に以下をまとめてください。

1. `v0.4.1` の実装概要
2. 画像アセット配置先
3. image avatar 構造
4. lip sync 接続方法
5. blink 実装方法
6. preset対応
7. 追加・更新テスト
8. browser結果
9. mobile結果
10. Admin 1 + Display 3
11. LAN確認
12. soak結果
13. `npm audit`
14. README / verification更新
15. 受入条件 52項目の達成状況
16. commit / push / tag
17. working tree
18. 残る微調整ポイント

---

# 11. 完成定義

`yokogawa_ai_v0_4_1_requirements.md` にある受入条件を満たし、

> 横川AIの実デザイン画像アセットが、既存v0.4.0システムへ組み込まれ、口パク・まばたき・Preset表示を伴って安定動作する状態

になっていることをもって完成とします。

最後まで自律的に進めてください。
