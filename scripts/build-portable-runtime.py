"""Package lock-installed dependencies with their licenses, without npm credentials."""
import hashlib, json, pathlib, zipfile
root = pathlib.Path(__file__).resolve().parents[1]
vendor = root / 'vendor'
node_zip = vendor / 'node-v22.15.0-win-x64.zip'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
expected = next(line.split()[0] for line in (vendor / 'node-SHASUMS256-v22.15.0.txt').read_text().splitlines() if line.endswith('  node-v22.15.0-win-x64.zip'))
assert sha(node_zip) == expected, 'Official Node distribution SHA256 mismatch'
modules = root / '.tmp-portable-deps' / 'node_modules'
assert (modules / 'express/package.json').is_file()
with zipfile.ZipFile(vendor / 'production-node-modules.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in sorted(modules.rglob('*')):
        if file.is_file():
            assert file.name not in ('.npmrc', '.env'), 'Do not package credentials'
            archive.write(file, file.relative_to(modules.parent).as_posix())
lock_sha = hashlib.sha256((root / 'package-lock.json').read_text(encoding='utf-8-sig').replace('\r\n', '\n').encode('utf-8')).hexdigest()
manifest = {'nodeVersion': '22.15.0', 'platform': 'Windows x64', 'nodeSource': 'https://nodejs.org/dist/v22.15.0/', 'packageLockHashMode': 'utf8-lf', 'packageLockSha256': lock_sha, 'archives': [{'file': 'vendor/' + name, 'sha256': sha(vendor / name)} for name in ('node-v22.15.0-win-x64.zip', 'production-node-modules.zip')]}
(vendor / 'runtime-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps(manifest))
