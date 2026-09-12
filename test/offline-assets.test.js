import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  }));
  return files.flat();
}

test('ブラウザ配信物が外部CDN・クラウドAPIを参照しない', async () => {
  for (const file of await filesUnder(path.resolve('public'))) {
    const content = await readFile(file, 'utf8');
    assert.doesNotMatch(content, /(?:src|href)=["']https?:\/\//i, `${file} has a remote asset`);
    assert.doesNotMatch(content, /url\(\s*["']?https?:\/\//i, `${file} has a remote CSS asset`);
  }
});

