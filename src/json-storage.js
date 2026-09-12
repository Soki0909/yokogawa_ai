import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
        await rename(temporary, this.file);
      } catch (error) {
        this.logger.error('状態を保存できません', error);
      }
    });
    return this.writeChain;
  }
}
