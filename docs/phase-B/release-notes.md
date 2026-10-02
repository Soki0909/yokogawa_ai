# v0.6.0 Release Notes

Phase BのVisual Reviewと正式版検証を完了した安定版です。`v0.6.0-rc.2`の承認済みVisualを変更せず採用しています。

## Phase B completion

- NORMAL / WARNING / HIJACKED / HOSTILE / SHUTDOWN / RECOVERYの6状態を正式採用。
- Avatar自身の目元発光、顔面色光、眼鏡反射、輪郭二重像、状態別blinkを正式採用。
- Avatar前面かつ字幕・Scene Visual・Overlay・Transition・BLACKOUTを阻害しないForeground Interferenceを正式採用。
- HIJACKEDのjamming / hacking、HOSTILEの高圧干渉、SHUTDOWNの閉眼・停止、RECOVERYの段階復旧を承認。
- Phase AまでのCue、複数Display、Audio Master、Free Speak、Show File、再接続、ローカルLAN動作を維持。

## Final verification

- `npm run check`: 83 pass / 0 fail
- `npm audit --omit=dev`: 0 vulnerabilities
- Admin 1 + Display 3で指定シーケンス、STOP / REPLAY / BLACKOUT / RESTORE、Admin / Display / Audio Master再接続を確認
- 1280×720 / 1920×1080でoverflow 0、clipping・字幕阻害なし
- Browser console warning 0 / error 0
- 30分soakを0分から完走、failure 0、abnormal exitなし

Phase CのVoice / Production Integrationは本releaseに含みません。
