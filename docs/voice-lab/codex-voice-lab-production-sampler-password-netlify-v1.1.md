# Codex実装指示 — Yokogawa AI Voice Lab Production Sampler + Password-Protected Netlify Deploy v1.1

## 0. このタスクの目的

既存の `experiments/voice-lab` を拡張し、**横川AIの本番セリフを選んで試聴できるWebサイト**を作る。

これは公演実演用のProduction Admin / Displayとは完全に別用途とする。

主用途:

- キャスト・制作・音響が本番用の横川AI音声を確認する
- 18本の本番セリフから任意の台詞を選んで再生する
- 本番と同じHIJACKED音声処理を試聴する
- URLを共有して、特定台詞を指定して確認してもらう
- 公演前のネタバレを含むため、**URLだけでは開けず、必ず共有パスワードを要求する**

最重要:

> **公開URLを知っているだけでは閲覧できないこと。**
> **Production HTMLだけでなくWAV直URLを含むサイト全体をパスワードで保護すること。**

---

# 1. Baseline

Repository:

```text
C:\Users\kumes\Documents\yokokawa_ai
```

開始基準:

```text
branch: codex/phase-c-production-audio
HEAD: e874e6023f59a3ab71ea0efd6624d84aadb6a9e4
```

作業用branch:

```text
codex/voice-lab-production-sampler
```

開始時:

```powershell
git status
git branch --show-current
git rev-parse HEAD
git log --oneline -10
```

working tree cleanを確認する。

既に同名branchが存在する場合は内容を確認し、既存作業を破壊しない。

---

# 2. 最初に読むファイル

```text
experiments/voice-lab/README.md
experiments/voice-lab/review/index.html
experiments/voice-lab/review/app.js
experiments/voice-lab/review/styles.css
experiments/voice-lab/config/selected-profile.json

config/production-speech/yokogawa-ai-v1.json
config/voice-profiles/yokogawa-professor-v1.json

shows/production.json
shows/production-yokogawa-route.json

public/js/display.js
public/js/lip-sync.js
public/js/tts-adapter.js

public/assets/audio/yokogawa-professor-v1_*.wav

docs/phase-C/implementation.md
docs/phase-C/verification.md
```

---

# 3. Source of Truth

本番台詞の正本:

```text
config/production-speech/yokogawa-ai-v1.json
```

本番固定音声:

```text
public/assets/audio/yokogawa-professor-v1_*.wav
```

Voice Profile:

```text
config/voice-profiles/yokogawa-professor-v1.json
```

必要な演出状態:

```text
shows/production.json
shows/production-yokogawa-route.json
```

## 禁止

Voice Lab用に18台詞を手書きで再定義しない。

Production manifestからbuild時に必要情報を抽出する。

---

# 4. 既存Voice Labを壊さない

既存:

```text
ROUND 1
ROUND 2
```

の比較機能はローカル用として維持する。

今回追加:

```text
PRODUCTION
```

デフォルトタブは:

```text
PRODUCTION
```

とする。

Production Samplerの静的deployは、gitignore対象のRound 1 / Round 2生成WAVに依存しない。

---

# 5. Production Sampler UI

## 5.1 Header

表示:

```text
YOKOGAWA AI
VOICE LAB — PRODUCTION SAMPLES
```

Voice Profile情報:

```text
阿井田 茂 / Calm
speed 1.20
pitch 0
intonation 0.45
44.1 kHz mono
```

値は可能な限りJSONから取得し、二重管理しない。

フッター:

```text
横川AI音声：AivisSpeechによる音声合成
使用音声モデル：阿井田 茂（ACML 1.0）
```

---

# 6. 18台詞一覧

001〜018を表示。

各row/card:

```text
#001
Scene
State
Status
台詞本文
Duration
Play
```

State例:

```text
NORMAL
HIJACKED
WARNING
HOSTILE
SHUTDOWN
RECOVERY
ROUTE
```

Status例:

```text
採用
配置未確定
台本採否未確定
横ルート
```

---

# 7. 未確定項目の表示

## 010

WAVは試聴可能。

表示:

```text
配置未確定
```

通常台詞と同じく再生できる。

## 017

表示:

```text
台本採否未確定
```

試聴可能。

## 018

表示:

```text
横ルート
横シーン5
```

教室番号は現在台本内で `7・302` / `7・303` の矛盾があるため、
Sampler上でどちらかを勝手に確定しない。

---

# 8. 検索・Filter

実装:

- 本文検索
- Scene filter
- State filter
- Status filter

18件なのでVanilla JSで十分。

新規UI frameworkを入れない。

---

# 9. Audio Player

必要操作:

```text
Play
Pause
Stop
Previous
Next
```

同時に複数WAVを鳴らさない。

別台詞のPlayを押した場合:

```text
現在再生を停止
→ 新しい台詞へ切替
```

表示:

- 現在再生中
- progress
- current time
- duration

---

# 10. RAW / PRODUCTION

Production Samplerには切替を用意する。

```text
本番再生
RAW
```

Default:

```text
本番再生
```

## RAW

固定WAVを無加工再生。

## 本番再生

Production Showで指定されるplayback effectを再現する。

現在:

```text
005〜009
hijacked-subtle-v1
```

その他は原則RAW相当。

---

# 11. playback effectを共通化する

現在のProduction implementationでは `public/js/lip-sync.js` に
`hijacked-subtle-v1` のWeb Audio graphが存在する。

現行値:

```text
highpass: 115 Hz
lowpass: 5600 Hz
dry gain: 0.94
delay: 11 ms
wet gain: 0.085
```

この値をVoice Labへコピーして二重管理しない。

ProductionとVoice Labが同一moduleを使うよう、
最小限の共通moduleへ抽出する。

例:

```text
public/js/audio-playback-effects.js
```

ただし実際のAPIは既存コードに合わせて設計してよい。

Acceptance:

- Production Displayの音が変わらない
- audio-reactive lip syncが壊れない
- STOP / REPLAYが壊れない
- Voice Labの本番再生とProduction Displayのeffect graphが同一Source of Truth
- RAWは完全にeffect bypass

---

# 12. Deep Link

特定台詞をURLで共有可能にする。

例:

```text
https://<site>/?line=013
```

要件:

- `?line=013`で013を選択状態にする
- 本文までscroll / focusしてよい
- 自動再生しない
- Password認証後もquery stringを失わない

UI:

```text
このセリフのURLをコピー
```

を追加。

---

# 13. Static Site Build

完全静的なSampler assetを生成する。

追加npm script例:

```text
voice:lab:site:build
```

出力:

```text
dist/voice-lab/
```

例:

```text
dist/voice-lab/
├─ index.html
├─ app.js
├─ styles.css
├─ audio-playback-effects.js
├─ data/
│  ├─ production-samples.json
│  └─ voice-profile.json
└─ audio/
   ├─ 001.wav
   ├─ ...
   └─ 018.wav
```

構造は変更可。

---

# 14. Deploy manifestのsanitize

デプロイ用JSONには必要最小限だけ含める。

許可例:

```json
{
  "scriptId": "013",
  "scene": "Scene 6",
  "state": "WARNING",
  "status": "active",
  "text": "...",
  "durationSeconds": 7.07,
  "audio": "audio/013.wav",
  "playbackEffect": "none"
}
```

## 公開buildに含めないもの

- Windows absolute path
- Google Docs URL
- Google Docs revision ID
- local Aivis Engine URL
- speaker runtime internalsで不要なもの
- operatorNote
- triggerNote
- syncMarkers
- Admin endpoint
- WebSocket endpoint
- repository全体
- Production Show JSONそのもの
- server-side implementation details
- secrets

---

# 15. Deployment target — Netlify

## 決定

今回の第一選択は:

```text
Netlify
```

理由:

- 静的サイトと相性がよい
- GitHub連携可能
- Codex向けNetlify MCPが公式提供されている
- CLI deploy可能
- 現行Netlifyには**共有パスワードによるProject visibility**がある
- 公演前のpreview用途に適している

---

# 16. 最重要 — Password必須

本番前の要件:

> URLを知っているだけでは閲覧できない。
> 必ず共有パスワードを入力しなければサイトへアクセスできない。

## 第一選択

**Netlify native Project Visibility = Password**

を使用する。

保護対象:

```text
Production and previews
```

を原則とする。

これにより:

- Production URL
- Deploy Preview
- branch deploy
- WAV直URL

を含めて保護する。

Passwordはrepositoryへ保存しない。

---

# 17. Password値

Codexがパスワードを勝手に生成・commitしない。

パスワードは:

```text
Netlify側のProject visibility設定
```

へ保存する。

Git:

```text
禁止:
.envへのcommit
netlify.tomlへのpassword直書き
JSへのpassword埋め込み
HTMLへのpassword埋め込み
READMEへのpassword記載
```

---

# 18. Netlify MCPを優先使用

Codex自身でNetlify操作をしやすくするため、
Netlify公式MCPを第一手段とする。

必要に応じて:

```powershell
codex mcp add netlify -- npx -y @netlify/mcp
```

接続済みなら再追加しない。

認証を要求された場合:

- browser / OAuth authorizationを完了
- secret tokenをrepositoryへ保存しない

MCP接続後、可能ならtest callで接続を確認する。

---

# 19. Deployフロー

理想:

```text
implementation
→ tests
→ static build
→ local static verification
→ Netlify draft deploy
→ password protection verification
→ production deploy
```

CLI fallback:

```powershell
netlify deploy
```

production:

```powershell
netlify deploy --prod
```

ただしproduction deployはPassword Protection確認後。

---

# 20. Native Password Protectionの自動設定

Netlify MCP/API/CLIでProject visibilityをPasswordへ設定できる場合:

```text
Codex自身で設定
```

を試す。

ただし:

- passwordをログへ平文表示しない
- passwordをgitへ保存しない
- passwordをsource codeへ埋め込まない

もしCodex環境からnative visibility/passwordの設定がサポートされない場合は、
次のFallbackへ進む。

---

# 21. Fallback — Netlify Edge Function password gate

Native Password ProtectionがCodexから設定できない場合のみ使用。

Netlify公式shared password patternに従う。

Environment variable:

```text
PROTECTED_PAGE_PASSWORD
```

Edge Functionが:

1. 全リクエストをintercept
2. session cookie確認
3. 未認証ならpassword form
4. 正しいpasswordならHttpOnly Cookie
5. 元URLへredirect

Cookie要件:

```text
HttpOnly
Secure
SameSite=Strict
reasonable expiry
```

Password比較はplaintextの単純比較にせず、
Web Crypto APIを使用する。

---

# 22. Fallbackもfail closed

最重要。

```text
PROTECTED_PAGE_PASSWORD
```

が未設定の場合:

**絶対にpublic表示しない。**

表示:

```text
This site is not yet configured.
```

などでBLOCK。

禁止:

```text
password未設定
→ とりあえずpublic
```

---

# 23. Password gateはサイト全体

Fallback時も:

```text
/*
```

を保護対象とする。

つまり:

```text
/
index.html
app.js
styles.css
/data/*
/audio/*
```

をすべて保護。

HTMLだけPassword画面にして、
`/audio/013.wav` を直接開けば聞ける状態は禁止。

---

# 24. Logout

Native Netlify password protectionの場合:

Netlify標準挙動に従う。

Fallback Edge Functionの場合:

```text
ログアウト
```

を実装。

Session Cookieを削除してpassword画面へ戻す。

---

# 25. Password UI

Fallback時のpassword画面もVoice Labの見た目に合わせる。

表示例:

```text
YOKOGAWA AI
VOICE LAB

公演関係者向け
パスワードを入力してください
```

誤password:

```text
パスワードが違います
```

ただし:

- password hintを表示しない
- source内へpasswordを入れない

---

# 26. Security Review

必ず確認:

1. URLだけでは閲覧不可
2. `/audio/001.wav`直URLもPassword必須
3. `/data/production-samples.json`直URLもPassword必須
4. deploy previewもPassword必須
5. source codeにpasswordなし
6. git historyにpasswordなし
7. browser localStorageにpasswordを保存しない
8. cookieへpasswordそのものを保存しない
9. password未設定でfail closed
10. client-side JavaScriptだけのpassword gateではない

---

# 27. Responsive

確認viewports:

```text
390×844
1280×720
1920×1080
```

スマホ:

- tableを無理に横scrollさせない
- card/listに自然に変形
- Play buttonを押しやすくする

---

# 28. Accessibility

最低限:

- keyboard操作
- button label
- focus visible
- 現在再生中が視覚的に分かる
- progress
- error message
- `prefers-reduced-motion`
- autoplayなし

---

# 29. Error Handling

manifest失敗:

```text
本番音声一覧を読み込めませんでした
```

audio失敗:

```text
音声ファイルを再生できませんでした
```

effect不明:

**silent RAW fallback禁止。**

表示:

```text
本番音声処理を適用できません
```

consoleにも明示。

---

# 30. Tests

新規test:

1. Production manifest 18件
2. 001〜018重複なし
3. 全audio存在
4. path traversalなし
5. deploy manifestにabsolute pathなし
6. operatorNoteなし
7. triggerNoteなし
8. syncMarkersなし
9. 005〜009 = `hijacked-subtle-v1`
10. その他に意図しないeffectなし
11. 010 unresolved status
12. 017 unresolved status
13. 018 route status
14. 018で302/303を確定していない
15. deep link parser
16. production playback effect regression
17. build outputにprivate/internal filesなし
18. password source code埋め込みなし
19. production static build succeeds

既存:

```powershell
npm run check
npm run voice:profile:verify
npm run voice:production:verify
npm audit --omit=dev
```

もPASS維持。

---

# 31. Browser verification — Sampler

確認:

```text
Production default
18台詞表示
検索
Scene filter
State filter
001 play
005 RAW
005 Production
009 Production
013 deep link
016 play
010 unresolved
017 unresolved
018 route
URL copy
Pause
Stop
Previous
Next
```

Network:

```text
localhost Aivis API requestなし
WebSocketなし
Production Admin APIなし
```

Console:

```text
warning 0
error 0
```

---

# 32. Browser verification — Password

Netlify draft deployで確認。

未認証:

```text
/
→ password required
```

直asset:

```text
/audio/001.wav
→ password required
```

direct JSON:

```text
/data/production-samples.json
→ password required
```

誤password:

```text
access denied
```

正password:

```text
Voice Lab表示
```

deep link:

```text
/?line=013
→ password
→ 認証後013を保持
```

別incognito session:

```text
再度password required
```

---

# 33. Build単体確認

AivisSpeech Engine停止。

repositoryのNode serverも停止。

```powershell
npm run voice:lab:site:build
```

`dist/voice-lab`だけをstatic serverで配信し、
Production Sampler機能が成立することを確認。

---

# 34. Documentation

更新/追加:

```text
experiments/voice-lab/README.md
docs/voice-lab-production-sampler.md
docs/deployment/voice-lab-netlify.md
```

記録:

- Production Sampler目的
- Source of Truth
- RAW / Production
- build方法
- Netlify deploy
- Password Protection
- native protection / fallback境界
- update workflow
- spoiler注意
- credential handling

---

# 35. 更新フロー

今後Production WAVが更新された場合:

```text
Production manifest / WAV更新
→ voice:production:verify
→ voice:lab:site:build
→ tests
→ git push
→ Netlify deploy
```

Sampler側で18台詞を再入力しない。

---

# 36. Codex Self Review

必ず自己批評:

1. 公演操作UIと混ざっていないか
2. Aivis EngineをWeb公開していないか
3. Local TTS endpointを公開していないか
4. Production Show JSONをそのままdeployしていないか
5. 18台詞を二重管理していないか
6. effect parameterを二重管理していないか
7. 005〜009がProduction音と一致するか
8. RAWが本当に無加工か
9. 010/017を確定扱いしていないか
10. 018の302/303を決めていないか
11. URLだけで入れてしまわないか
12. WAV直URLを突破できないか
13. passwordをclient JSへ埋めていないか
14. password未設定でfail openしていないか
15. deploy previewも保護されているか
16. mobileで使用可能か
17. autoplayしていないか
18. creditsが誤認を生まないか
19. build outputへ内部情報が漏れていないか
20. git historyへcredentialが入っていないか

問題があれば修正→再検証。

---

# 37. Git

禁止:

```text
force push
master merge
new release tag
```

feature branch内でcommitする。

実装完了後にpushしてよい場合は、
現在のユーザー指示・repository運用に従う。

---

# 38. Deploymentの判断ルール

優先順位:

```text
1. Netlify native Password Project Visibility
2. Netlify Edge Function shared-password fallback
3. 他hostingへ変更しない
```

Codexの都合だけで:

```text
Vercel
Cloudflare
GitHub Pages
ChatGPT Sites
```

へ変更しない。

今回のSource of Truthは:

```text
「URL漏洩だけでは不安。必ずパスワードを入れさせたい」
```

である。

---

# 39. USER ACTIONが必要な場合

以下のような外部認証だけはユーザー操作が必要になる可能性がある:

```text
Netlify login / OAuth
Netlify MCP authorization
共有passwordの最終値入力
```

その場合Codexは、

```text
何が未完了か
ユーザーが1回だけ何を操作すればよいか
操作後に何を再開するか
```

を具体的に報告する。

コード実装やテストを止める必要がない部分は先に完了させる。

---

# 40. 最終報告

次の順で報告:

```text
1. Baseline
2. Branch / HEAD
3. Voice Lab architecture
4. Production Source of Truth
5. 18 scripts
6. Search / filters
7. RAW / Production
8. shared playback effect
9. deep links
10. unresolved handling
11. static build
12. sanitize result
13. Netlify site
14. Password method
15. direct WAV protection
16. preview protection
17. tests
18. browser verification
19. npm audit
20. git diff
21. deployed URL
22. remaining user action
23. USER REVIEW REQUIRED
```

Passwordは最終報告へ表示しない。

---

# 41. STOP GATE

このタスクでは可能な限り:

```text
実装
→ 自動テスト
→ Static build
→ Browser verification
→ Netlify draft deploy
→ Password verification
→ Production deploy
```

まで行う。

ただし以下は勝手に行わない:

```text
master merge
release tag
passwordをGitへ保存
passwordをchat/logへ露出
公演前にPassword Protectionを解除
```

最終状態:

```text
USER REVIEW REQUIRED
```

で停止する。

---

# 42. 完成条件

このタスクは次がすべて成立して完成。

```text
[ ] 18本を選択試聴できる
[ ] 本番HIJACKED effectを再現できる
[ ] RAW比較できる
[ ] deep linkで特定台詞を共有できる
[ ] AivisSpeech不要
[ ] Production server不要
[ ] Netlifyへdeployされている
[ ] URLだけでは閲覧できない
[ ] 共通passwordが必要
[ ] WAV直URLもpasswordが必要
[ ] deploy previewもpasswordが必要
[ ] passwordはrepositoryに存在しない
[ ] password未設定時fail closed
[ ] 既存Productionへregressionなし
[ ] USER REVIEW REQUIREDで停止
```
