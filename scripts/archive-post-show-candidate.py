"""Candidate archives only; never replace the published Production handoff."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
out = root / 'artifacts/post-show-20261017/staging'
out.mkdir(parents=True, exist_ok=True)
manifest = json.loads((root / 'config/production-portable-files.json').read_text(encoding='utf-8'))
kit = out / 'emergency'
validation = json.loads((kit / 'validation.json').read_text(encoding='utf-8'))
assert validation['status'] == 'FILE VALIDATION PASS' and validation['cues'] == 24
jobs = [
    ('横川AI_24Cue候補_別PC一式_Node導入済み.zip', [(root / f['path'], 'yokokawa_ai_candidate/' + f['path']) for f in manifest['files']] + [(root / 'config/production-portable-files.json', 'yokokawa_ai_candidate/config/production-portable-files.json')]),
    ('横川AI_24Cue候補_音響映像予備.zip', [(p, 'candidate-backup/' + p.relative_to(kit).as_posix()) for p in kit.rglob('*') if p.is_file()]),
]
reports = []
for name, files in jobs:
    target = out / name
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for file, arcname in sorted(files):
            assert file.resolve().is_relative_to(root)
            z.write(file, arcname)
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None
        assert len(z.namelist()) == len(files)
        for file, arcname in files:
            assert hashlib.sha256(z.read(arcname)).digest() == hashlib.sha256(file.read_bytes()).digest()
    reports.append({'path': str(target), 'bytes': target.stat().st_size, 'files': len(files), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'crcAndEveryFileHash': 'PASS', 'adoption': 'CANDIDATE ONLY'})
(out / 'archives.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(reports, ensure_ascii=False))
