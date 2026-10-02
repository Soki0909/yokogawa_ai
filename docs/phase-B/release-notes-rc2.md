# v0.6.0-rc.2 Release Candidate Notes

`v0.6.0-rc.1`を保護基準に、Phase B Visual candidateのAvatar表現を追加調整した候補です。最終`v0.6.0`ではありません。

## Changes

- NORMAL / WARNING / HIJACKED / HOSTILE / SHUTDOWN / RECOVERYごとに、Avatarの目元発光、顔面色光、眼鏡反射、輪郭二重像、blink profileを追加。
- Avatar前面、字幕・Scene Visual・Overlay・Transition・BLACKOUT背面にForeground Interference layerを追加。
- HIJACKEDを細いmagenta/cyan jamming・位相ずれ・data corruption、HOSTILEを太い赤警告帯・rupture・高圧pulseとして構造的に分離。
- SHUTDOWNで閉眼・発光消失・interference/animation停止、RECOVERYで4.8秒の段階的再点灯・正常化。
- HOSTILEの眉変形を無効化し、感情変化ではなく無表情の危険なsystem stateを維持。
- 6状態の実ブラウザ画像とcontact sheetを`artifacts/phase-b-review/rc2/`へ追加。

## Verification

- `npm run check`: 83 pass / 0 fail
- Browser console: warning 0 / error 0
- Browser layout: 1440×825、horizontal/vertical overflow 0
- Short state/reconnect soak: 0.25分、93 event、failure 0、abnormal exit false
- Production dependency: 追加なし

ユーザーVisual Reviewでは、特にHOSTILE警告帯の強度とRECOVERYの再点灯の間を確認してください。
