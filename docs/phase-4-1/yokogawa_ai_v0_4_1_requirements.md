# 横川AI v0.4.1 要件定義書
## Avatar Asset Integration Patch

## 1. 文書の目的

本書は、`yokogawa_ai` の `v0.4.0` を基準に、画像ベースの横川AIアバター素材を実システムへ組み込むための `v0.4.1` 要件を定義する。

`v0.4.0` までに以下は完成済みである。

- Cue Schema v2
- 6種Cue (`speech-display / speech-only / display-only / clear / blackout / preset-only`)
- Presentation Preset基盤
- Show File Import / Export / Validation
- 稽古ログ・Cue時刻Export
- 本番モードのショートカット
- 軽量ローポリSVG Avatar
- simulated / audio-reactive Lip Sync
- ローカルWAV再生
- CLEAR / BLACKOUT / 復元
- 再接続時の演出同期
- 自動テスト 43/43 PASS
- Admin 1 + Display 3 実ブラウザ検証
- 30分soak成功
- `v0.4.0` tag 作成済み

`v0.4.1` では、これらの機能を壊さずに、実際にデザイン検討を経て作成した横川AIアバター画像を本番用アセットとして統合する。

---

## 2. v0.4.1 のテーマ

> 設計済みのAvatar機構へ、実デザインの横川AI画像素材を安定的に組み込み、口パク・まばたき・状態演出を本番レベルで使えるようにする。

重要なのは、新たな大型機能の追加ではなく、既存の `v0.4.0` アーキテクチャへ **実アートアセットを無理なく載せること** である。

---

## 3. 本パッチで扱う実アセット

本パッチでは、以下4点の画像素材を使用する。

1. `mouth_closed`（基準画像）  
   `/mnt/data/ghostwriter_images/context/a00607ca-26ad-5cd4-b77a-b41114215175.png`
2. `mouth_half`  
   `/mnt/data/ghostwriter_images/context/9bf0b479-364f-5849-b760-84a25c117421.png`
3. `mouth_open`  
   `/mnt/data/ghostwriter_images/context/c9b059bf-569f-5040-9b4c-04781c0712cb.png`
4. `eyes_closed`  
   `/mnt/data/ghostwriter_images/context/df900f77-baec-5dcd-a0c2-12b6b450a448.png`

これらはすべて透過PNGであり、同一キャラクターの差分素材として扱う。

---

## 4. 実装方針の基本原則

### 4.1 全画像切替方式を採用しない

4枚の画像はほぼ同一構図だが、画像生成由来の微細差が残る可能性がある。  
そのため、`closed / half / open / eyes_closed` の**全身画像を丸ごと切り替える実装は採用しない**。

### 4.2 ベース + 局所差分レイヤー方式

以下の構造で実装する。

```text
Base Avatar
├─ base image      : mouth_closed
├─ mouth overlay   : half / open
└─ blink overlay   : eyes_closed
```

- 通常時は `mouth_closed` を常時ベース表示
- `mouth_half` / `mouth_open` は口周辺だけを局所表示
- `eyes_closed` は目周辺だけを局所表示
- 口パクとまばたきを独立制御できること

### 4.3 既存Preset機構を活かす

warning / hijacked / hostile / shutdown / recovery の状態差分は、基本的に **同じBase Avatarに overlay / color transform / filter / glow / glitch を重ねる方式** とする。

新たに6状態分の顔画像を必須化しない。

---

## 5. スコープ

### 5.1 実装対象

- 横川AI画像アセットの統合
- 口差分の局所レイヤー化
- 目閉じ差分の局所レイヤー化
- 既存Lip Sync機構との接続
- まばたき制御の導入
- Preset状態との見た目連動の微調整
- Asset Registry / README / verification への反映
- 回帰テスト・ブラウザ検証・soak再実施
- `v0.4.1` タグ作成

### 5.2 スコープ外

- 新しい全身アバター
- 追加表情（怒り顔・困り顔など）
- 追加口形（音素単位）
- 新規3Dモデル化
- VOICEVOX本導入
- 新Preset追加
- Audio Zone導入
- 劇中Cue内容の大幅編集

---

## 6. 機能要件

## FR-411 Avatar Asset Integration

### FR-411-1
既存の仮SVG Avatarとは別に、**画像ベースの横川AI Avatar v1** を定義できること。

### FR-411-2
Asset Registry または同等構造へ、少なくとも以下の4素材を登録できること。

- base / mouth_closed
- mouth_half
- mouth_open
- eyes_closed

### FR-411-3
これらはローカルファイルとして管理し、外部URLへ依存しないこと。

### FR-411-4
導入後も、将来的に SVG Avatar と画像Avatar を切り替え可能な構造が望ましい。

---

## FR-412 Base Avatar Rendering

### FR-412-1
通常表示では `mouth_closed` 基準画像をBase Avatarとして描画すること。

### FR-412-2
Base Avatarは透明背景のまま扱えること。

### FR-412-3
Display上で適切なサイズ調整・中央配置ができること。

### FR-412-4
Avatar領域は既存Displayレイアウトと整合すること。

### FR-412-5
warning / hijacked / hostile / shutdown / recovery においても、同一Base Avatarを土台として使えること。

---

## FR-413 Mouth Overlay Integration

### FR-413-1
`mouth_half` と `mouth_open` は、画像全体ではなく**口周辺の局所差分**として扱うこと。

### FR-413-2
基準画像との差分表示が可能な構造にすること。

### FR-413-3
実装方式は以下のいずれでもよい。

- 事前に口領域を切り出したoverlay画像を作る
- CSS mask / clip / background-position を使う
- Canvasで局所合成する
- 画像処理スクリプトで build-time に口差分素材を生成する

### FR-413-4
切り替え時に、髪・眼鏡・顔輪郭・服などがちらついて見えないこと。

### FR-413-5
mouth state は既存どおり最低3段階。

- `closed`
- `half`
- `open`

### FR-413-6
`closed` は overlay 無しで実現してよい。

---

## FR-414 Blink Overlay Integration

### FR-414-1
`eyes_closed` は**目周辺だけの局所差分**として扱うこと。

### FR-414-2
まばたき時、口状態とは独立に重ねられること。

### FR-414-3
まばたき時に口の開閉状態を壊さないこと。

### FR-414-4
まばたきoverlayの表示で顔全体がちらつかないこと。

---

## FR-415 Blink Controller

### FR-415-1
通常状態では自動まばたきを行うこと。

### FR-415-2
まばたき間隔は一定固定ではなく、**ランダム幅を持つ自然な間隔**とする。

例:
- 3〜6秒程度のランダム間隔

### FR-415-3
1回のまばたき表示時間は短くすること。

例:
- 100〜180ms程度

### FR-415-4
まばたき中も既存Lip Syncが継続すること。

### FR-415-5
shutdown状態では、まばたきを停止する、または明確な停止表現に切り替えてよい。

### FR-415-6
hostile状態で通常と異なるまばたき頻度にするかどうかは任意とし、必須ではない。

---

## FR-416 Lip Sync Integration

### FR-416-1
既存の `simulated` Lip Sync と `audio-reactive` Lip Sync を維持すること。

### FR-416-2
mouth state 切り替え先を、既存SVG口形ではなく画像mouth overlayへ接続できること。

### FR-416-3
Browser TTS時でも `simulated` で `closed / half / open` が動作すること。

### FR-416-4
local audio時でも `audio-reactive` で `closed / half / open` が動作すること。

### FR-416-5
mouth state 切り替えが高速でも表示崩れしないこと。

---

## FR-417 Avatar Preset Styling

### FR-417-1
normal
- Base Avatarを自然に表示すること

### FR-417-2
warning
- 既存warning演出と矛盾しない範囲で、Base Avatarに警告感を与えること

### FR-417-3
hijacked
- Base Avatar上にマゼンタ系や侵入感のある演出を重ねられること

### FR-417-4
hostile
- Base Avatar上に赤系 / グリッチ / 目の異常表現などを重ねられること

### FR-417-5
shutdown
- グレースケール化、表示停止感などを表現できること

### FR-417-6
recovery
- 正常化に戻る印象を演出できること

### FR-417-7
上記は、**新規顔画像を量産せず overlay / CSS / filter 中心で実現**することを推奨する。

---

## FR-418 Performance

### FR-418-1
`v0.4.0` 比で著しい性能悪化を起こさないこと。

### FR-418-2
画像Avatar導入後も、Admin 1 + Display 3 の構成で実用上安定して動作すること。

### FR-418-3
アニメーションはCSS/軽量描画中心とし、不要な高負荷処理を避けること。

### FR-418-4
mouth / blink overlayは必要時のみ再描画・再表示すること。

---

## FR-419 Asset Packaging

### FR-419-1
実アセットはリポジトリ内の適切なディレクトリに配置すること。

例:
- `public/assets/avatar/yokogawa/v1/`
- `src/assets/avatar/yokogawa/v1/`

### FR-419-2
ファイル名・IDは意味が分かるように整理すること。

例:
- `base.png`
- `mouth-half.png`
- `mouth-open.png`
- `eyes-closed.png`

### FR-419-3
READMEへ、アバター画像アセット構成を記載すること。

---

## FR-420 Backward Compatibility

### FR-420-1
Cue / Show File / Preset / Rehearsal Log の仕様は `v0.4.0` と互換性を保つこと。

### FR-420-2
既存の自動テスト43件を壊さないこと。

### FR-420-3
既存の運用フロー（Admin / Display / Audio Master / Preflight / Show File / 本番モード）を維持すること。

---

## 7. 受入条件

以下をすべて満たしたとき `v0.4.1` 完成とする。

1. `v0.4.0` の主要機能を維持
2. 既存自動テスト43件をすべてPASS
3. 横川AI画像アセット4点をローカルアセットとして組み込み
4. base / mouth_half / mouth_open / eyes_closed を意味あるIDで管理
5. Base Avatarとして `mouth_closed` を描画
6. `mouth_half` を口周辺局所差分として統合
7. `mouth_open` を口周辺局所差分として統合
8. `eyes_closed` を目周辺局所差分として統合
9. 全画像切替方式を避け、局所レイヤー方式を採用
10. mouth closed / half / open の3段階を維持
11. simulated lip sync 維持
12. audio-reactive lip sync 維持
13. Browser TTS時に口パク動作
14. local audio時に口パク動作
15. 口差分切替時に顔全体のちらつきが目立たない
16. 自動まばたき実装
17. まばたき間隔にランダム性あり
18. まばたき表示時間が短時間で自然
19. まばたき中も口パク継続
20. shutdown時のまばたき挙動が定義されている
21. normalで自然に表示
22. warningで破綻なく表示
23. hijackedで破綻なく表示
24. hostileで破綻なく表示
25. shutdownで破綻なく表示
26. recoveryで破綻なく表示
27. Display再接続後も現在のAvatar表示状態が復元
28. BLACKOUT中に不整合を起こさない
29. CLEAR / BLACKOUT 既存挙動を壊さない
30. Show Fileを壊さない
31. Preflightを壊さない
32. Rehearsal Logを壊さない
33. mobile Admin (390×844) を壊さない
34. 横スクロールなし
35. Admin 1 + Display 3 で実ブラウザ検証
36. Chrome desktop 確認
37. local audioを用いた口パク確認
38. Browser TTSを用いた口パク確認
39. まばたき確認
40. hostile等Presetでの表示確認
41. LAN別端末確認
42. 30分soak再実施
43. soak failures = 0
44. abnormal exitなし
45. `npm audit` に重大脆弱性なし
46. README更新
47. verification更新
48. 必要なら phase-4系検証記録へ追記
49. working tree clean
50. remote push済み
51. annotated tag `v0.4.1` 作成
52. `v0.4.0` tag は不変

---

## 8. テスト要件

### 8.1 自動テスト

最低限、以下を追加または検証すること。

- asset registration
- avatar mode selection
- mouth overlay selection logic
- blink scheduling logic
- blink + mouth coexistence
- shutdown blink behavior
- preset rendering compatibility
- reconnect state restore
- blackout compatibility

### 8.2 実ブラウザ確認

最低シナリオ:

1. normal + idle blink
2. simulated lip sync
3. audio-reactive lip sync
4. warning
5. hijacked
6. hostile
7. shutdown
8. recovery
9. CLEAR
10. BLACKOUT
11. reconnect
12. Admin 390×844
13. Admin 1 + Display 3

### 8.3 soak

30分。

以下を混在:
- Cue進行
- lip sync
- blink
- preset切替
- reconnect
- CLEAR
- BLACKOUT
- local audio
- Browser TTS

---

## 9. ドキュメント要件

### README

最低限以下を追記・更新する。

- 横川AI Avatar v1 の実アセット構成
- base / mouth-half / mouth-open / eyes-closed
- 口パクの仕組み
- まばたきの仕組み
- Presetとの関係
- 将来の差し替え方法

### verification

最低限以下を記録する。

- asset integration
- lip sync確認
- blink確認
- reconnect確認
- preset確認
- soak
- audit
- acceptance criteria

---

## 10. Git / Version

- ベースは `v0.4.0`
- 実装は meaningのあるcommitで行う
- 最後に tests / browser / soak / docs / clean / push を確認
- 完成時に `v0.4.1` annotated tag を作成・push
- `v0.4.0` は変更しない

---

## 11. 完了時の状態

`v0.4.1` 完了時には、

> 横川AIの実デザイン画像アセットがシステムへ組み込まれ、Base Avatar・口パク・まばたき・各状態Presetが実際の公演画面で確認できる

状態を目指す。

その後は、必要に応じて

- hostile時の詳細エフェクト調整
- warning / hijacked の演出微調整
- 口閾値の調整
- 実会場投影サイズ調整

などを行う。
