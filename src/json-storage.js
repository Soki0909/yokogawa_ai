import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TRANSIENT_RENAME_ERRORS = new Set(['EPERM', 'EBUSY', 'EACCES']);

export async function renameWithRetry(source, destination, {
  renameImpl = rename,
  waitImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 5,
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await renameImpl(source, destination);
      return;
    } catch (error) {
      if (!TRANSIENT_RENAME_ERRORS.has(error?.code) || attempt === attempts - 1) throw error;
      await waitImpl(25 * (2 ** attempt));
    }
  }
}

export class JsonFileStorage {
  constructor(file, logger = console) {
    this.file = file;
    this.logger = logger;
    this.writeChain = Promise.resolve();
  }

  async load() {
    if (!this.file) return null;
    try {
      return JSON.parse(await readFile(this.file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') this.logger.error('状態ファイルを読み込めません', error);
      return null;
    }
  }

  async save(value) {
    if (!this.file) return;
    const snapshot = JSON.stringify(value, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      try {
        await mkdir(path.dirname(this.file), { recursive: true });
        const temporary = `${this.file}.tmp`;
        await writeFile(temporary, snapshot, 'utf8');
        await renameWithRetry(temporary, this.file);
      } catch (error) {
        this.logger.error('状態を保存できません', error);
      }
    });
    return this.writeChain;
  }
}
