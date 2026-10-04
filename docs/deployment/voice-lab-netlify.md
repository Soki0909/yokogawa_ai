# Voice Lab Netlify deployment

## Build

- Build command: `npm run voice:lab:site:build`
- Publish directory: `dist/voice-lab`
- Netlify設定: `netlify.toml`

## Password protection

第一選択はNetlify native Project VisibilityのPasswordで、Production and previewsの両方を保護する。設定できない場合のみ、repository同梱のEdge Function `password-gate`を使用する。

FallbackではNetlify環境変数`PROTECTED_PAGE_PASSWORD`へ共有パスワードを保存する。値を`.env`、Git、HTML、JavaScript、README、チャット、ログへ記録しない。未設定時はEdge Functionが503でfail closedし、静的assetを公開しない。

Edge Functionは`/*`をinterceptするため、HTMLだけでなく`/audio/001.wav`と`/data/production-samples.json`も認証必須になる。認証後はパスワードそのものではなく、HMAC署名付き・8時間有効のHttpOnly / Secure / SameSite=Strict Cookieを保存する。`/?logout=1`でCookieを削除する。

## Deploy checklist

1. Netlifyへloginしsiteをlinkする。
2. native Password visibilityをProduction and previewsへ設定する。利用不可なら`PROTECTED_PAGE_PASSWORD`をNetlify UIで設定する。
3. draft deployする。
4. 未認証の`/`、`/audio/001.wav`、`/data/production-samples.json`がすべてPassword画面または認証拒否になることを確認する。
5. 誤password拒否、正password表示、`/?line=013`保持、logout、別incognito sessionを確認する。
6. 保護を確認してからproduction deployする。

Password保護が確認できないdeployをProductionへ昇格しない。Deploy Previewとbranch deployも同じEdge Function対象だが、native visibility利用時はNetlify側でpreviewを含む設定を必ず確認する。
