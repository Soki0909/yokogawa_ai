export async function loadProductionAudioManifest(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');
  const response = await fetchImpl('/api/audio-assets', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Production audio manifest request failed: ${response.status ?? 'unknown'}`);
  const payload = await response.json();
  if (!Array.isArray(payload?.assets)) throw new Error('Production audio manifest is invalid');
  const seen = new Set();
  for (const asset of payload.assets) {
    if (typeof asset?.id !== 'string' || !/^(prod-voice-\d{3}-[a-z0-9-]+|prod-sfx-[a-z0-9-]+)$/.test(asset.id)) {
      throw new Error('Production audio manifest contains an invalid asset ID');
    }
    if (asset.url !== `/api/assets/${encodeURIComponent(asset.id)}`) {
      throw new Error(`Production audio manifest contains an unsafe URL: ${asset.id}`);
    }
    if (seen.has(asset.id)) throw new Error(`Production audio manifest contains a duplicate asset: ${asset.id}`);
    seen.add(asset.id);
  }
  Object.defineProperty(payload.assets, 'expectedCount', { value: payload.expectedCount ?? payload.assets.length });
  return payload.assets;
}

export async function preloadProductionAudioAssets(assets, {
  fetchImpl = globalThis.fetch,
  concurrency = 4,
  onProgress = () => {},
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');
  const list = Array.isArray(assets) ? assets : [];
  if (!list.length) return { ready: 0, total: 0 };
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, list.length));
  let cursor = 0;
  let ready = 0;

  const worker = async () => {
    while (cursor < list.length) {
      const index = cursor++;
      const asset = list[index];
      const response = await fetchImpl(asset.url, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`${asset.id}: preload failed (${response.status ?? 'unknown'})`);
      const buffer = await response.arrayBuffer();
      if (!buffer?.byteLength) throw new Error(`${asset.id}: preload returned empty audio`);
      ready += 1;
      onProgress({ ready, total: list.length, assetId: asset.id });
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return { ready, total: list.length };
}

export async function prepareProductionAudio(options = {}) {
  const assets = options.assets ?? await loadProductionAudioManifest(options.fetchImpl);
  const expectedCount = Number.isInteger(options.expectedCount) ? options.expectedCount : assets.expectedCount ?? 18;
  if (assets.length !== expectedCount) {
    throw new Error(`Production WAV count mismatch: expected ${expectedCount}, got ${assets.length}`);
  }
  return preloadProductionAudioAssets(assets, options);
}
