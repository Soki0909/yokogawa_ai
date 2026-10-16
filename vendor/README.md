# オフライン起動の前提パッケージ

- `node-v22.15.0-win-x64.zip`：このPCと同じNode版の公式配布物。`node-SHASUMS256-v22.15.0.txt`の公式SHA256と一致を検証。Node／第三者ライセンスは配布ZIPに含まれる。
- `production-node-modules.zip`：ルートpackage-lock.jsonから隔離環境へ`npm ci --omit=dev --ignore-scripts`で取得したproduction依存のみ。各依存のLICENSEを含む。npm設定・認証情報・ブラウザprofileを含めない。
- `runtime-manifest.json`：両ZIPとルートpackage-lockのSHA256。

これらはWindows x64用。展開は`setup-production-offline.cmd`。依存を更新した場合は、package-lockだけを更新してこのZIPを流用せず、`scripts/build-portable-runtime.py`で作り直し、その後portable manifestも更新する。
