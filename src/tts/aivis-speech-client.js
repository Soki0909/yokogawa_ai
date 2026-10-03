import { PROFILE_PARAMETER_KEYS } from '../voice-profile.js';

function combineAbortSignal(signal, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('AIVIS_TIMEOUT')), timeoutMs);
  timeout.unref?.();
  const abort = () => controller.abort(signal?.reason ?? new Error('AIVIS_ABORTED'));
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  return { signal: controller.signal, cleanup: () => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); } };
}

export class AivisSpeechClient {
  constructor({ baseUrl = process.env.AIVIS_ENGINE_URL ?? 'http://127.0.0.1:10101', timeoutMs = 120_000, fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async request(route, options = {}) {
    const combined = combineAbortSignal(options.signal, options.timeoutMs ?? this.timeoutMs);
    try {
      const response = await this.fetch(`${this.baseUrl}${route}`, { ...options, signal: combined.signal });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`AIVIS_HTTP_${response.status}:${body.slice(0, 300)}`);
      }
      return response;
    } catch (error) {
      if (combined.signal.aborted) {
        if (options.signal?.aborted) throw new Error('AIVIS_ABORTED', { cause: error });
        throw new Error('AIVIS_TIMEOUT', { cause: error });
      }
      if (error?.cause?.code === 'ECONNREFUSED') throw new Error('AIVIS_UNREACHABLE', { cause: error });
      throw error;
    } finally {
      combined.cleanup();
    }
  }

  async version(options = {}) { return (await (await this.request('/version', options)).text()).replace(/^"|"$/g, ''); }
  async speakers(options = {}) { return (await this.request('/speakers', options)).json(); }

  async resolveStyle(profile, options = {}) {
    const speakers = await this.speakers(options);
    const speaker = speakers.find((entry) => entry.speaker_uuid === profile.speaker.uuid);
    if (!speaker) throw new Error('AIVIS_SPEAKER_NOT_FOUND');
    const style = (speaker.styles ?? []).find((entry) => entry.name === profile.style.name);
    if (!style) throw new Error('AIVIS_STYLE_NOT_FOUND');
    if (speaker.name !== profile.speaker.name || (speaker.version && speaker.version !== profile.model.version)) throw new Error('AIVIS_PROFILE_MISMATCH');
    return { id: style.id, name: style.name, speakerName: speaker.name, speakerUuid: speaker.speaker_uuid, modelVersion: speaker.version ?? null };
  }

  async audioQuery(text, styleId, options = {}) {
    const query = new URLSearchParams({ text, speaker: String(styleId) });
    return (await this.request(`/audio_query?${query}`, { ...options, method: 'POST' })).json();
  }

  applyProfile(rawQuery, profile) {
    const finalQuery = structuredClone(rawQuery);
    for (const key of PROFILE_PARAMETER_KEYS) if (profile.parameters[key] !== undefined) finalQuery[key] = profile.parameters[key];
    return finalQuery;
  }

  async synthesis(query, styleId, options = {}) {
    const response = await this.request(`/synthesis?speaker=${encodeURIComponent(styleId)}`, {
      ...options, method: 'POST', headers: { 'content-type': 'application/json', ...(options.headers ?? {}) }, body: JSON.stringify(query),
    });
    return Buffer.from(await response.arrayBuffer());
  }

  async synthesize(text, profile, options = {}) {
    const style = options.style ?? await this.resolveStyle(profile, options);
    const rawQuery = await this.audioQuery(text, style.id, options);
    const finalQuery = this.applyProfile(rawQuery, profile);
    const wav = await this.synthesis(finalQuery, style.id, options);
    return { wav, style, rawQuery, finalQuery };
  }
}
