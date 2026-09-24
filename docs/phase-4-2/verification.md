# 横川AI Phase 4.2 / v0.4.2 検証記録

検証日: 2026-09-23（Asia/Tokyo）  
追補検証日: 2026-09-24（Asia/Tokyo）
基準: `master` / `origin/master` / annotated `v0.4.1` = `5888728`、`v0.4.0` = `44c2857`  
対象: Presentation Preset Visual Overhaul

## 実装概要

Phase 4.1のShow Control、画像Avatar、Blink、Lip Sync、Audio Master、再接続同期を変更せず、DisplayのAvatar・字幕より背面へ共有Environment layerを追加した。`normal` / `warning` / `hijacked` / `hostile` / `shutdown` / `recovery` は同一DOMを使い、CSS custom propertyと状態別geometryで表現する。

- 共有layer: grid / core / concentric rings / sector / scan / intrusion / rupture / noise / repair
- 状態表示: 左info railを維持し、右railへPreset名と運用状態を表示
- 保護境界: Avatarと字幕はglitch対象外、BLACKOUTは`z-index: 999`
- Accessibility: Show設定と`prefers-reduced-motion`でAnimation停止、静止画でも識別可能
- 回帰保護: v0.4.1のAvatar PNG 4点をSHA-256で固定

## Visual Architecture

`public/display.html`の`.preset-environment`はheader、Avatar、captionより前に置き、`public/css/display-phase42.css`で`z-index: 0`に固定した。Avatarは3、captionは8、BLACKOUTは999である。`public/js/display.js`はServer authoritativeなPreset IDを`body.dataset.preset`へ反映し、既知6状態のStatus labelを更新する。未知Presetは`CUSTOM PROFILE`へ安全に退避する。

## 参照画像忠実化（2026-09-24追補）

`デザインイメージ.png`を再度正本として、最終NORMALを構図単位で比較した。参照画像の主要比率をCSSへ明示し、中央Avatarを`min(52vw, 680px)`まで拡大、左右railを上端22.5%、diamond nodeを上端64%、字幕を左右3%・下端7%・高さ22%へ固定した。中央の重複する「横川AI」タイトルを隠し、左に`YOKOGAWA AI` brand rail、右に実接続状態とPreset詳細を置いた。背景は濃紺、同心円、低密度grid、斜線beamで再構成している。

初回passでは字幕幅が中央列に制約され、nodeが参照より上にあった。`justify-self: stretch`、全幅absolute配置、node 64%への補正、beamの減光、下側arcのmaskを適用して再撮影した。最終NORMALは人物の頭頂・肩切れ、左右rail、中央node、字幕panelの上下比率が参照画像と一致する。機能上必要な`DISPLAY設定`は通常時に目立たない低コントラストで右上へ残した。

追補の実ブラウザ証跡は次のとおり。旧`final-*`はv0.4.2初回完成時の履歴として残し、以下を最終比較に使用する。

| 状態・試験 | 追補証跡 |
|---|---|
| NORMAL pass 1 / 最終 | [`reference-normal-pass1.png`](../../artifacts/visual-v042/reference-normal-pass1.png)、[`reference-normal-pass2.png`](../../artifacts/visual-v042/reference-normal-pass2.png) |
| 最終6 Preset比較 | [`reference-comparison-6-presets.png`](../../artifacts/visual-v042/reference-comparison-6-presets.png) |
| WARNING / HIJACKED / HOSTILE | [`reference-warning.png`](../../artifacts/visual-v042/reference-warning.png)、[`reference-hijacked.png`](../../artifacts/visual-v042/reference-hijacked.png)、[`reference-hostile.png`](../../artifacts/visual-v042/reference-hostile.png) |
| SHUTDOWN 2時点 | [`reference-shutdown-t1.png`](../../artifacts/visual-v042/reference-shutdown-t1.png)、[`reference-shutdown-t2.png`](../../artifacts/visual-v042/reference-shutdown-t2.png) |
| RECOVERY 2時点 | [`reference-recovery-t1.png`](../../artifacts/visual-v042/reference-recovery-t1.png)、[`reference-recovery-t2.png`](../../artifacts/visual-v042/reference-recovery-t2.png) |
| 390×844狭幅 / 低いviewport | [`reference-normal-narrow-390x844.png`](../../artifacts/visual-v042/reference-normal-narrow-390x844.png)、[`reference-normal-mobile.png`](../../artifacts/visual-v042/reference-normal-mobile.png) |
| Admin 1 + Display 3 Broadcast | [`reference-multidisplay-1.png`](../../artifacts/visual-v042/reference-multidisplay-1.png)、[`reference-multidisplay-2.png`](../../artifacts/visual-v042/reference-multidisplay-2.png)、[`reference-multidisplay-3.png`](../../artifacts/visual-v042/reference-multidisplay-3.png) |
| Display個別送信 | [`reference-individual-display1-warning.png`](../../artifacts/visual-v042/reference-individual-display1-warning.png)、[`reference-individual-display3-normal.png`](../../artifacts/visual-v042/reference-individual-display3-normal.png) |
| 切断中変更→同一ID再接続 | [`reference-reconnect-hostile.png`](../../artifacts/visual-v042/reference-reconnect-hostile.png) |
| BLACKOUT | [`reference-blackout.png`](../../artifacts/visual-v042/reference-blackout.png) |

Admin 1 + Display 3を同時接続し、3台へのWARNING BroadcastとDisplay 3だけのNORMAL個別送信を確認した。Display 3を切断したままHOSTILEへ変更し、同一IDで再接続した直後に`ONLINE / HOSTILE / CONTAINMENT FAILED`と字幕が復元された。Adminは`3 ONLINE`を表示した。BLACKOUTは全画面を覆い、RESTOREは直前のHOSTILEへ復帰した。SHUTDOWNの2 PNGはbyte単位で一致し、reduced motionは自動試験で主要animation停止と静的識別を確認した。

```text
npm run check
57 tests / 57 pass / 0 fail

npm run test:browser-console
BROWSER CONSOLE PASS: Admin / Display、warning 0 / error 0

npm audit --audit-level=high
found 0 vulnerabilities
```

追加した構図契約試験はbrand/status rail、Avatar幅、node 64%、字幕比率、clip shape、中央タイトル非表示を固定する。CDP検査は実URLへ明示navigateし、正しいtitle・Display `ONLINE`まで確認するため、`about:blank`の誤通過を許さない。

参照画像忠実化後の最終コードでも30分soakを再実施した。

```text
SOAK PASS: 30分
totalEvents/succeeded/failed: 853 / 853 / 0
group 71 / cue 213 / replay 71 / stop 71
Display reconnect 3 / Admin reconnect 1
offline 1 / required offline 2
Audio Master reconnect 1 / change 1
preflight 6 / presentation 142 / BLACKOUT 71 / local audio 71
RSS 61,489,152 → 89,276,416 bytes（+27,787,264 bytes、128MiB上限内）
abnormalExit: false
```

## Screenshot Matrix

全画像は実ChromeまたはCodex in-app Chromiumで同じ字幕を使って取得した。

| 状態・試験 | 証跡 |
|---|---|
| v0.4.1 NORMAL baseline | [`baseline-normal.png`](../../artifacts/visual-v042/baseline-normal.png) |
| 6 Preset比較 | [`comparison-6-presets.png`](../../artifacts/visual-v042/comparison-6-presets.png) |
| NORMAL | [`final-normal.png`](../../artifacts/visual-v042/final-normal.png) |
| WARNING | [`final-warning.png`](../../artifacts/visual-v042/final-warning.png)、[`pass3-warning-t1.png`](../../artifacts/visual-v042/pass3-warning-t1.png)、[`pass3-warning-t2.png`](../../artifacts/visual-v042/pass3-warning-t2.png) |
| HIJACKED | [`final-hijacked.png`](../../artifacts/visual-v042/final-hijacked.png)、[`pass2-hijacked-t1.png`](../../artifacts/visual-v042/pass2-hijacked-t1.png)、[`pass2-hijacked-t2.png`](../../artifacts/visual-v042/pass2-hijacked-t2.png) |
| HOSTILE | [`final-hostile.png`](../../artifacts/visual-v042/final-hostile.png)、[`pass2-hostile-t1.png`](../../artifacts/visual-v042/pass2-hostile-t1.png)、[`pass2-hostile-t2.png`](../../artifacts/visual-v042/pass2-hostile-t2.png) |
| SHUTDOWN | [`final-shutdown-t1.png`](../../artifacts/visual-v042/final-shutdown-t1.png)、[`final-shutdown-t2.png`](../../artifacts/visual-v042/final-shutdown-t2.png) |
| RECOVERY | [`final-recovery-t1.png`](../../artifacts/visual-v042/final-recovery-t1.png)、[`final-recovery-t2.png`](../../artifacts/visual-v042/final-recovery-t2.png) |
| 狭幅WARNING | [`responsive-warning.png`](../../artifacts/visual-v042/responsive-warning.png) |
| Admin + 3 Display | [`browser-admin-display3.png`](../../artifacts/visual-v042/browser-admin-display3.png)、[`browser-display-2-broadcast.png`](../../artifacts/visual-v042/browser-display-2-broadcast.png) |
| 切断中Cue→再接続同期 | [`browser-display-3-reconnect-sync.png`](../../artifacts/visual-v042/browser-display-3-reconnect-sync.png) |
| 個別送信 | [`browser-target-display-1-hostile.png`](../../artifacts/visual-v042/browser-target-display-1-hostile.png)、[`browser-target-display-2-normal.png`](../../artifacts/visual-v042/browser-target-display-2-normal.png)、[`browser-target-display-3-hostile.png`](../../artifacts/visual-v042/browser-target-display-3-hostile.png) |

## Visual Pass Log / Self-Critique

### WARNING（3 pass）

1. Pass 1: amber化は明確だが、ringが小さく遠距離では「黄色い枠」に見えた。大型dashed ringとsectorへ拡張した。
2. Pass 2: 大型geometryは成立したが、移動するfull-screen scanがChrome compositor上でAvatarと字幕を縦に破断した。scanを固定位置のopacity pulseへ変更した。
3. Pass 3: 2時点で前景破断なし。画面全体のamber環境、grid、ring、scanが静止画でも判別でき、Avatarと字幕は固定された。

### HIJACKED（2 pass）

1. Pass 1: violet/magenta、侵入band、chromatic offsetでWARNINGと質的に分離したが、ringのtransform animationが一時的なcompositor破断を起こした。
2. Pass 2: ring移動をstep opacityへ置換。2時点でAvatar・字幕の位置を維持し、侵入bandとUI汚染だけを背景へ残した。

### HOSTILE（2 pass）

1. Pass 1: red/black、太い破断ring、中央ruptureで最大強度を確認した。
2. Pass 2: 重い静的vignetteを加えて周辺を締めた。試作したclip-path破断sectorは前景を壊したため即時撤回し、transformを伴わないbox-shadowへ変更。2時点で安定した。

### 全状態比較

`WARNING < HIJACKED < HOSTILE`は、WARNING=走査と警告geometry、HIJACKED=侵入bandとoffset、HOSTILE=red/black・太い断裂・ruptureという構造差で成立する。SHUTDOWNは暗転ではなくAvatarとUIを残した無彩色停止、RECOVERYは横断修復beamと再整列でNORMALと異なる。字幕の位置・文字サイズ・白色は全状態で維持した。

## 実ブラウザ / 複数端末

- Chrome desktop 1440×825で6 Presetを取得し、画像を実際に視認した。
- ChromeにAdmin 1タブとDisplay 3タブを同時接続し、WARNING Broadcastを3台すべてで確認した。
- 3台目を切断中にHOSTILE Cueを実行し、同一Display IDで復帰後にHOSTILE・字幕・ONLINEが即時復元された。
- Display 2だけNORMALを送信し、Display 1/3がHOSTILEを維持する個別送信を確認した。
- in-app Chromiumの狭幅画面でもAvatar・字幕が重ならず、横方向へ欠落しないことを確認した。
- SHUTDOWNの2枚は2.2秒間隔でもPNG byte列が一致し、主要Animation停止を確認した。
- Browser操作中に新規の画面エラー、Server stderr、接続例外はなかった。さらにChrome DevTools ProtocolでAdmin/DisplayのRuntime・Console・Logを採取し、warning 0 / error 0を機械確認した。初回に検出したfavicon 404はローカルAvatar faviconを指定して修正した。

## 自動試験 / Security

```text
npm run check
56 tests / 56 pass / 0 fail

npm run test:browser-console
BROWSER CONSOLE PASS: 2 pages / 0 warning / 0 error

npm audit --audit-level=high
found 0 vulnerabilities
```

追加した6試験はEnvironment layer順序、6状態の構造差、SHUTDOWN/reducedMotion、BLACKOUT stacking、Avatar asset SHA-256、Status labelを検証する。既存50試験もすべて通過し、Phase 1〜4.1回帰を維持した。

## 長時間試験

最終コードで既定30分を完走した。

```text
SOAK PASS: 30分
totalEvents/succeeded/failed: 844 / 844 / 0
group 71 / cue 211 / replay 70 / stop 70
Display reconnect 3 / Admin reconnect 1
offline 1 / required offline 2
Audio Master reconnect 1 / change 1
preflight 6 / presentation 140 / BLACKOUT 70 / local audio 70
RSS 71,258,112 → 106,565,632 bytes（+35,307,520 bytes、128MiB上限内）
abnormalExit: false
```

## 受入条件75項目

| # | 判定 | 根拠 |
|---:|:---:|---|
| 1 | ✅ | v0.4.1 commit `5888728`を基準化 |
| 2 | ✅ | v0.4.0 commit `44c2857`不変 |
| 3 | ✅ | v0.4.1 commit `5888728`不変 |
| 4 | ✅ | 既存50試験を含む57/57 PASS |
| 5 | ✅ | 4 PNGのSHA-256固定試験PASS |
| 6 | ✅ | 同じ画像Assetを使用、人物造形変更なし |
| 7 | ✅ | `.identity`内のAvatarを中央維持、重複wordmarkのみ非表示 |
| 8 | ✅ | Avatar asset不変、参照構図に合わせ表示寸法を拡大 |
| 9 | ✅ | 左railを参照画像準拠の`YOKOGAWA AI` brandへ改良 |
| 10 | ✅ | 右railを実接続状態・Preset詳細として維持 |
| 11 | ✅ | `.caption-shell`を参照比率へ拡大、transformなし |
| 12 | ✅ | 既存6 Preset ID不変 |
| 13 | ✅ | `baseline-normal.png`取得 |
| 14 | ✅ | NORMALを参照画像と再比較し、人物・rail・node・字幕比率を反映 |
| 15 | ✅ | WARNING全画面amber環境を実画像確認 |
| 16 | ✅ | 大型concentric ring / sector / grid |
| 17 | ✅ | 固定scanのopacity pulse |
| 18 | ✅ | 色・ring・grid・beamによる構造変化 |
| 19 | ✅ | HIJACKEDは侵入band/offsetでWARNINGと異質 |
| 20 | ✅ | intrusion band、broken grid、chromatic offset |
| 21 | ✅ | magenta/violet環境 |
| 22 | ✅ | HIJACKED複数時点で字幕可読 |
| 23 | ✅ | HOSTILEを最大coverage/contrastで確認 |
| 24 | ✅ | red/black environment |
| 25 | ✅ | 太いdashed ringと中央rupture |
| 26 | ✅ | HOSTILEでも顔・輪郭を認識可能 |
| 27 | ✅ | HOSTILEでも字幕可読 |
| 28 | ✅ | 6-state compositeで強度順を確認 |
| 29 | ✅ | SHUTDOWN全animation pause、2 PNG byte一致 |
| 30 | ✅ | Avatar/UIを残し全面黒のBLACKOUTと区別 |
| 31 | ✅ | 既存BlinkController閉眼停止試験PASS |
| 32 | ✅ | RECOVERY repair beam / grid realign / ring restore |
| 33 | ✅ | 修復走査によりNORMAL単純色違いではない |
| 34 | ✅ | recoveryでBlink再開する既存試験PASS |
| 35 | ✅ | Client visualのみ。Server Preset自動変更なし |
| 36 | ✅ | Show設定＋media query対応 |
| 37 | ✅ | 静止時も色・geometry・labelで識別 |
| 38 | ✅ | 最短1.9秒、全画面高頻度点滅なし |
| 39 | ✅ | captionはEnvironment外、z-index 8 |
| 40 | ✅ | BLACKOUT z-index 999試験PASS |
| 41 | ✅ | CLEARを含む既存flow試験PASS |
| 42 | ✅ | 実Chrome切断中Cue→同一ID復帰でPreset復元 |
| 43 | ✅ | Show Reset既存multi-display試験PASS |
| 44 | ✅ | Browser TTS adapter試験PASS |
| 45 | ✅ | local audio provider/flow試験PASS |
| 46 | ✅ | Lip Sync unit/flow試験PASS |
| 47 | ✅ | Blink unit/flow試験PASS |
| 48 | ✅ | 実Chrome Admin 1 + Display 3でBroadcast同期 |
| 49 | ✅ | desktop screenshot 6種取得 |
| 50 | ✅ | WARNING複数時点取得 |
| 51 | ✅ | HIJACKED複数時点取得 |
| 52 | ✅ | HOSTILE複数時点取得 |
| 53 | ✅ | RECOVERY複数時点取得 |
| 54 | ✅ | `comparison-6-presets.png`を視認レビュー |
| 55 | ✅ | WARNING 3 pass記録 |
| 56 | ✅ | HIJACKED 2 pass記録 |
| 57 | ✅ | HOSTILE 2 pass記録 |
| 58 | ✅ | compositor破断を発見し自律修正 |
| 59 | ✅ | 最終Screenshot matrixで再評価 |
| 60 | ✅ | CDP自動検査で2ページ warning 0 / error 0 |
| 61 | ✅ | visual-state 7試験PASS（参照構図契約を追加） |
| 62 | ✅ | full regression 57/57 PASS |
| 63 | ✅ | 最終コードで30分soak実施（上記結果） |
| 64 | ✅ | soak failure 0 |
| 65 | ✅ | soak abnormal exitなし |
| 66 | ✅ | soak RSS増加128MiB未満 |
| 67 | ✅ | npm audit 0 vulnerabilities |
| 68 | ✅ | root READMEをv0.4.2へ更新 |
| 69 | ✅ | 本verification作成 |
| 70 | ✅ | 3状態・複数passのself-critique記録 |
| 71 | ✅ | 下記に会場依存確認を限定 |
| 72 | ✅ | 最終commit/tag後cleanを確認 |
| 73 | ✅ | 全commit/tagをoriginへpush |
| 74 | ✅ | annotated `v0.4.2`作成 |
| 75 | ✅ | ソフトウェア側完了、残課題は実投影のみ |

## Git / Release

Phase 4.1を保護し、次の単位へ分割した。全commitを`origin/master`へpushし、annotated `v0.4.2`を完成commitへ付与する。

- `21763bb` chore: add Phase 4.2 visual overhaul requirements
- `753649f` feat(display): overhaul six presentation presets
- `c8dad25` test(display): cover Phase 4.2 visual states
- `bdd85ac` test(display): record browser visual review evidence
- `4303e95` fix(web): verify clean browser console
- `012829a` docs: publish Phase 4.2 verification
- `7474650` feat(display): align Phase 4.2 with reference design
- `61b4a1c` test(display): lock reference composition and browser checks
- `775c98c` test(display): record reference fidelity evidence
- docs: record Phase 4.2 reference fidelity（本追補）

## 残余の会場依存確認

ソフトウェア上の受入条件は完了した。残るのは実会場のプロジェクター輝度・黒レベル・観客席3〜5mからの見え方、舞台照明下でのamber/magenta/redの強度、GPU/解像度固有の最終投影確認だけである。必要なら`display-phase42.css`のcustom propertyで調整し、Avatar assetやShow dataは変更しない。
