// Prepare cold browser/device work before GO; never play a test tone or Cue.
export async function warmAudioOutput({ Context = globalThis.AudioContext || globalThis.webkitAudioContext, timeoutMs = 3000, retain = false } = {}) {
  if (!Context) return;
  const context = new Context();
  let timer;
  let ready = false;
  try {
    await Promise.race([
      context.resume(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('音声出力の準備がタイムアウトしました')), timeoutMs); }),
    ]);
    ready = true;
    return retain ? context : undefined;
  } finally {
    clearTimeout(timer);
    if (!retain || !ready) await context.close();
  }
}

export async function prepareDisplayImages(urls, { ImageClass = globalThis.Image } = {}) {
  if (!ImageClass) return [];
  return Promise.all([...new Set(urls)].map(async url => {
    const image = new ImageClass();
    image.src = url;
    // Decode hidden mouth/eye layers and puzzle images before their first frame.
    await image.decode();
    return image; // Retain decoded resources while this Show is in use.
  }));
}

export class PresentationRenderCache {
  constructor() { this.signatures = new Map(); }
  changed(channel, value) {
    const signature = JSON.stringify(value);
    if (this.signatures.get(channel) === signature) return false;
    this.signatures.set(channel, signature);
    return true;
  }
  clear() { this.signatures.clear(); }
}
