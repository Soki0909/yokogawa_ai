# Phase 4 / v0.4.0 検証記録

検証日: 2026-09-22（Asia/Tokyo）  
基準: `v0.3.0` = commit `34c2529`（tag object `f57e429`）

## 実装と自動試験

- `npm test`: 41/41 PASS（Phase 1〜3の29件を含む）
- `npm run check`: syntax check + 41/41 PASS
- Phase 4専用: `phase4-schema/state/client/flow.test.js` 12件
- 実通信: Admin 1 + Display 3、6 Cue kind、Audio Master境界、local WAV、BLACKOUT/reconnect、Show File、Rehearsal CSV/JSON
- Security: Display snapshotから履歴・他Display・operatorNote・triggerNoteを除外。asset pathとMIME/拡張子をallowlist検証
- `npm audit --omit=dev`: 0 vulnerabilities

## 実ブラウザ

Chromeで `127.0.0.1:3104` を使用し、Admin 1タブ + Display 3タブ（Main / Side / Mobile）を接続した。

- Preflight: 3 ONLINE / 3 REGISTERED、Audio Master Main ONLINE / READY
- NEXT: MainはBrowser TTS、Side/Mobileは無音、3台とも字幕同期
- Space: NEXTが001→002へ1回だけ進行
- BLACKOUT: 全面黒＋中央ラベルを確認。RESTOREで直前字幕を復元
- Avatar: 教授型の胸上ローポリSVG、眼鏡・眉・3段階口形を目視
- 390×844相当: Mobile DisplayでAvatar・字幕・ヘッダーが収まり横スクロールなし
- Chrome console: Admin/Displayとも warning/error 0件
- operatorNote / triggerNote: Display DOM/stateに存在しないことを実通信試験でも確認

## LAN / offline

Serverは `0.0.0.0`、同一host由来のHTTP/WS、LAN IPv4 URLを生成する。Phase 2でKIT-WLAP2別端末接続済み。Phase 4では同じnetwork/socket層を回帰試験し、LAN IPv4 endpoint、外部CDNなし、Admin 1 + Display 3を確認した。中核動作にインターネットは不要。

## 長時間試験

`SOAK_MINUTES=30`, `SOAK_INTERVAL_MS=2000` で実行。Phase 3のbroadcast/individual/group/Cue/BACK/NEXT/REPLAY/STOP/Audio Master・Admin/Display再接続に、display-only、Preset/Avatar、local audio、CLEAR、BLACKOUT/RESTOREを追加した。

最終結果は試験完了後の同コミットで記録する。

## 受入条件100項目

| # | 判定 | 根拠 |
|---:|:---:|---|
| 1 | ✅ | Phase 3 UI/APIを保持し既存29試験PASS |
| 2 | ✅ | `npm test` 41/41、既存29/29 PASS |
| 3 | ✅ | `src/show-schema.js` schemaVersion 2 |
| 4 | ✅ | `normalizeCue.speechText`、Cue editor |
| 5 | ✅ | `normalizeCue.displayText`、Display描画 |
| 6 | ✅ | 実通信でspeech `fallback` / display `音声字幕`を分離 |
| 7 | ✅ | Schema/UI/Admin表示にoperatorNote |
| 8 | ✅ | Schema/UI/Admin表示にtriggerNote |
| 9 | ✅ | Cue `route`保持、Admin metadata/log |
| 10 | ✅ | Cue `scene`/legacy `sceneId`保持 |
| 11 | ✅ | Cue `location`保持、Admin metadata/log |
| 12 | ✅ | 旧text→speechText/displayText自動移行試験 |
| 13 | ✅ | speech-display状態・実通信試験 |
| 14 | ✅ | speech-only状態試験 |
| 15 | ✅ | display-only 3 Display実通信試験 |
| 16 | ✅ | clear状態/UI/soak試験 |
| 17 | ✅ | blackout状態/UI/実ブラウザ/soak試験 |
| 18 | ✅ | preset-only状態試験 |
| 19 | ✅ | data-driven Preset registry/CRUD |
| 20 | ✅ | normal標準Preset |
| 21 | ✅ | warning標準Preset |
| 22 | ✅ | hijacked標準Preset |
| 23 | ✅ | hostile標準Preset |
| 24 | ✅ | shutdown標準Preset |
| 25 | ✅ | recovery標準Preset |
| 26 | ✅ | StateStore `currentPresetId`が正本 |
| 27 | ✅ | `displaySnapshot`とreconnect flow |
| 28 | ✅ | media query + Show setting `reducedMotion` |
| 29 | ✅ | Display inline SVG avatar |
| 30 | ✅ | 特定個人素材・画像を不使用 |
| 31 | ✅ | faceted SVG path構成を目視確認 |
| 32 | ✅ | SVG/CSSのみ、WebGLなし |
| 33 | ✅ | normal avatar state |
| 34 | ✅ | warning/hijacked state/CSS |
| 35 | ✅ | hostile state/CSS |
| 36 | ✅ | shutdown state、visible=false |
| 37 | ✅ | recovery state/Preset |
| 38 | ✅ | `data-mouth=closed` |
| 39 | ✅ | `data-mouth=half` |
| 40 | ✅ | `data-mouth=open` |
| 41 | ✅ | 190ms simulated controller |
| 42 | ✅ | Web Audio RMS analyser controller |
| 43 | ✅ | silence閾値とreset試験 |
| 44 | ✅ | attack/release、hysteresis、100ms hold試験 |
| 45 | ✅ | hidden時`lipSync.stop()`、CSS hidden |
| 46 | ✅ | BrowserSpeechProvider既存試験PASS |
| 47 | ✅ | LocalAudioProvider |
| 48 | ✅ | `/api/assets/test-tone` WAV実取得 |
| 49 | ✅ | 3 client結果 `[true,false,false]` |
| 50 | ✅ | LocalAudioProvider.stop試験 |
| 51 | ✅ | `replayCue`がCue audio設定を再利用 |
| 52 | ✅ | validation/preflight missing asset検知 |
| 53 | ✅ | Show `assets` registry |
| 54 | ✅ | `isSafeAssetPath` + root containment試験 |
| 55 | ✅ | Export `schemaVersion:2` |
| 56 | ✅ | `GET /api/show-file` |
| 57 | ✅ | validate後`POST /api/show-file/import` |
| 58 | ✅ | version/array/reference/kind/target/avatar検証 |
| 59 | ✅ | invalid import後Cue不変試験 |
| 60 | ✅ | Cue/Preset/Asset duplicate ID検出 |
| 61 | ✅ | missing preset試験 |
| 62 | ✅ | missing asset検証 |
| 63 | ✅ | validate endpointとUI Dry Run確認 |
| 64 | ✅ | rehearsal start/stop |
| 65 | ✅ | elapsedMsをserver clockから記録 |
| 66 | ✅ | ISO timestamp + Cue metadata |
| 67 | ✅ | `/api/rehearsal.csv`実通信試験 |
| 68 | ✅ | `/api/rehearsal.json`実通信試験 |
| 69 | ✅ | Space NEXT、実ブラウザ001→002 |
| 70 | ✅ | R→cue:replay mapping |
| 71 | ✅ | Esc→stop mapping |
| 72 | ✅ | input/textarea/select/contenteditable guard |
| 73 | ✅ | `event.repeat` guard + action ID |
| 74 | ✅ | settings.shortcutsEnabled + UI checkbox |
| 75 | ✅ | 本番モードCLEARをNEXTと分離 |
| 76 | ✅ | 本番モードBLACKOUTをNEXTと分離 |
| 77 | ✅ | reconnect初期state blackout=true実通信試験 |
| 78 | ✅ | sanitized Display snapshot試験 |
| 79 | ✅ | sanitized Display snapshot試験 |
| 80 | ✅ | schema/preset/avatar/audio項目を追加 |
| 81 | ✅ | scene/group/asset reference validation |
| 82 | ✅ | preset reference validation |
| 83 | ✅ | audio CueとAsset registry照合 |
| 84 | ✅ | Chrome Admin 1 + Display 3 |
| 85 | ✅ | Chrome desktopスクリーンショット目視 |
| 86 | ✅ | Chrome viewport 390×844 Display目視 |
| 87 | ✅ | 390px幅で横スクロールなし |
| 88 | ✅ | Phase 2 KIT-WLAP2実績 + Phase 4 LAN endpoint回帰 |
| 89 | ⏳ | 30分soak実行中 |
| 90 | ⏳ | 30分soak実行中 |
| 91 | ⏳ | 30分soak実行中 |
| 92 | ✅ | npm audit 0 vulnerabilities |
| 93 | ✅ | READMEをv0.4.0へ更新 |
| 94 | ✅ | root VERIFICATIONを更新 |
| 95 | ✅ | 本ファイル |
| 96 | ⏳ | 最終commit後確認 |
| 97 | ⏳ | 最終push後確認 |
| 98 | ⏳ | 完了時annotated tag作成 |
| 99 | ✅ | v0.3.0 tag object `f57e429` / commit `34c2529`維持 |
| 100 | ✅ | LLM/VOICEVOX/WebGL/Audio Zone等はoptional境界のみ |

## 残余リスク

音質・台詞・最終Preset値は作品制作側の調整対象。Browser TTS音声は端末実装差があり、会場本番前にAudio Masterで音声テストを行う。Audio Zone、VOICEVOX本体、LLM、3D AvatarはPhase 4範囲外。
