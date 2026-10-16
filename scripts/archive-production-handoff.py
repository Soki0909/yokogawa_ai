"""Create independent emergency/portable archives, outside their own input folders."""
import hashlib, json, pathlib, zipfile
root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'artifacts/audio-reliability-20261014/handoff-20261016'
out.mkdir(parents=True, exist_ok=True)
jobs = [('横川AI_音響映像予備一式.zip', [p for p in (root / 'production-backup').rglob('*') if p.is_file()])]
manifest = json.loads((root / 'config/production-portable-files.json').read_text(encoding='utf-8'))
jobs.append(('横川AI_別PC本番一式_Windows-x64.zip', [root / item['path'] for item in manifest['files']] + [root / 'config/production-portable-files.json']))
results = []
for name, files in jobs:
    target = out / name
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for p in sorted(files):
            archive.write(p, ('yokogawa_ai/' if name.startswith('横川AI_別PC') else '') + p.relative_to(root).as_posix())
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None, 'Archive CRC failure'
    results.append({'file': str(target), 'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
(out / 'archives.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(results, ensure_ascii=False))
