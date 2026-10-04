# Voice Lab Production Sampler

公演関係者が横川AIの本番固定音声18本を確認するための静的Sampler。Production Admin / Displayとは独立し、AivisSpeech Engine、WebSocket、Production serverへ接続しない。

## Source of Truth

- 台詞・WAV対応: `config/production-speech/yokogawa-ai-v1.json`
- Voice Profile: `config/voice-profiles/yokogawa-professor-v1.json`
- State / playback effect: `shows/production.json`、`shows/production-yokogawa-route.json`
- 固定WAV: `public/assets/audio/yokogawa-professor-v1_*.wav`
- effect graph: `public/js/audio-playback-effects.js`

build時に必要最小限の公開manifestを生成する。Google Docs情報、ローカルEngine URL、UUID、operator/trigger note、sync marker、Production Show本体は配布しない。

## 使用方法

```powershell
npm run voice:lab:site:build
npm run voice:lab:review
```

`http://127.0.0.1:4174/`を開く。本文検索、Scene／State／Status絞り込み、前後移動、一時停止、停止、URLコピーに対応する。`?line=013`は013を選択するが自動再生しない。

「RAW」はWAVを無加工再生する。「本番再生」はProduction Showの`playbackEffect`を適用し、現在は005〜009だけが`hijacked-subtle-v1`となる。不明なeffectはRAWへ黙ってfallbackせず、エラー表示して再生を止める。

010は「配置未確定」、017は「台本採否未確定」、018は「横ルート / 横シーン5」と表示する。018の教室番号は台本上の矛盾が解決するまでSamplerで確定しない。

## 更新フロー

```text
Production manifest / WAV更新
→ npm run voice:production:verify
→ npm run voice:lab:site:build
→ npm run check
→ Netlify deploy
```

`dist/voice-lab`は生成物であり、台詞を直接編集しない。公演前のネタバレを含むため、パスワード保護なしで公開しない。
