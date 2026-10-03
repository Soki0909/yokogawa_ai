import { randomUUID } from 'node:crypto';

export class RuntimeAudioCache {
  constructor({ maxEntries = 32, maxBytes = 96 * 1024 * 1024, ttlMs = 30 * 60 * 1000, now = () => Date.now() } = {}) {
    Object.assign(this, { maxEntries, maxBytes, ttlMs, now });
    this.entries = new Map();
    this.totalBytes = 0;
  }

  cleanup() {
    const now = this.now();
    for (const [id, entry] of this.entries) if (entry.expiresAt <= now) this.delete(id);
    while (this.entries.size > this.maxEntries || this.totalBytes > this.maxBytes) this.delete(this.entries.keys().next().value);
  }

  put(buffer, metadata = {}) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('RUNTIME_AUDIO_EMPTY');
    if (buffer.length > this.maxBytes) throw new Error('RUNTIME_AUDIO_TOO_LARGE');
    this.cleanup();
    const id = randomUUID();
    const createdAt = this.now();
    this.entries.set(id, { id, buffer, bytes: buffer.length, createdAt, expiresAt: createdAt + this.ttlMs, metadata });
    this.totalBytes += buffer.length;
    this.cleanup();
    return this.metadata(id);
  }

  get(id) {
    this.cleanup();
    return this.entries.get(id) ?? null;
  }

  metadata(id) {
    const entry = this.entries.get(id);
    if (!entry) return null;
    const { buffer, ...safe } = entry;
    return safe;
  }

  delete(id) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.entries.delete(id); this.totalBytes -= entry.bytes; return true;
  }

  clear() { this.entries.clear(); this.totalBytes = 0; }
  stats() { this.cleanup(); return { entries: this.entries.size, totalBytes: this.totalBytes, maxEntries: this.maxEntries, maxBytes: this.maxBytes, ttlMs: this.ttlMs }; }
}
