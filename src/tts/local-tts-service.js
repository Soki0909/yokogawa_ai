export class LocalTtsService {
  constructor({ client, profile, cache, now = () => new Date() }) {
    Object.assign(this, { client, profile, cache, now });
    this.active = null;
    this.health = { status: 'unknown', checkedAt: null, engineVersion: null, runtimeStyleId: null, error: null };
  }

  async preflight() {
    try {
      const [engineVersion, style] = await Promise.all([this.client.version({ timeoutMs: 5000 }), this.client.resolveStyle(this.profile, { timeoutMs: 5000 })]);
      this.health = { status: 'ready', checkedAt: this.now().toISOString(), engineVersion, runtimeStyleId: style.id, style, error: null };
    } catch (error) {
      this.health = { status: 'error', checkedAt: this.now().toISOString(), engineVersion: null, runtimeStyleId: null, error: error.message };
    }
    return this.status();
  }

  status() {
    return { ...this.health, profileId: this.profile.profileId, speakerUuid: this.profile.speaker.uuid, styleName: this.profile.style.name,
      output: this.profile.output, cache: this.cache.stats() };
  }

  cancelCurrent(reason = 'cancelled') {
    if (!this.active) return false;
    this.active.controller.abort(new Error(reason)); this.active = null; return true;
  }

  async synthesize(text, metadata = {}) {
    this.cancelCurrent('superseded');
    const controller = new AbortController();
    const token = Symbol('local-tts');
    this.active = { controller, token };
    try {
      const result = await this.client.synthesize(text, this.profile, { signal: controller.signal });
      if (this.active?.token !== token || controller.signal.aborted) throw new Error('LOCAL_TTS_CANCELLED');
      const entry = this.cache.put(result.wav, { ...metadata, profileId: this.profile.profileId, runtimeStyleId: result.style.id, createdAt: this.now().toISOString() });
      this.health = { status: 'ready', checkedAt: this.now().toISOString(), engineVersion: this.health.engineVersion, runtimeStyleId: result.style.id, style: result.style, error: null };
      return { ...entry, runtimeUrl: `/api/runtime-audio/${entry.id}`, style: result.style };
    } catch (error) {
      if (controller.signal.aborted || error.message === 'AIVIS_ABORTED') throw new Error('LOCAL_TTS_CANCELLED', { cause: error });
      this.health = { ...this.health, status: 'error', checkedAt: this.now().toISOString(), error: error.message };
      throw error;
    } finally {
      if (this.active?.token === token) this.active = null;
    }
  }
}
