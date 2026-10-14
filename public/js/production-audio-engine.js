import { connectPlaybackEffect } from './audio-playback-effects.js';
export function outputLeadMs(context){return Math.min(300,Math.max(0,((context?.baseLatency||0)+(context?.outputLatency||0))*1000));}

// The production transport owns decoded PCM and the complete graph BEFORE start().
// No HTMLMediaElement, HTTP request, decoder, or asynchronous resume on the GO path.
export class ProductionAudioEngine {
  constructor({ Context = globalThis.AudioContext || globalThis.webkitAudioContext, fetchImpl = globalThis.fetch, onStatus = () => {}, maxBytes = 256 * 1024 * 1024 } = {}) {
    Object.assign(this, { Context, fetchImpl, onStatus, maxBytes });
    this.buffers = new Map(); this.active = new Set(); this.events = []; this.generation = 0;
    this.ready = false; this.context = null; this.loading = null; this.resuming = null; this.unlocked = false;
  }
  log(type, detail = {}) {
    this.events.push({ type, at: Date.now(), contextTime: this.context?.currentTime, state: this.context?.state, ...detail });
    if (this.events.length > 500) this.events.splice(0, this.events.length - 500);
  }
  status(ready, reason = '') {
    if (this.ready === ready && this.reason === reason) return;
    this.ready = ready; this.reason = reason; this.log(ready ? 'ready' : 'not-ready', { reason }); this.onStatus({ ready, reason });
  }
  getContext() {
    if (!this.context || this.context.state === 'closed') {
      if (!this.Context) throw Error('Web Audioを利用できません');
      const context = new this.Context({ latencyHint: 'playback' }); this.context = context;
      context.addEventListener?.('statechange', () => {
        if (this.context !== context) return;
        this.log('statechange');
        if (context.state !== 'running' && this.ready) this.fail(`AudioContext ${context.state}。音声を再準備してREPLAYしてください。`);
      });
    }
    return this.context;
  }
  async load(assets, onProgress = () => {}) {
    const signature = JSON.stringify(assets.map(a => [a.id, a.sha256, a.url]));
    if (this.signature === signature && assets.every(a => this.buffers.has(a.id))) return this.stats();
    if (this.loading) { await this.loading; return this.load(assets, onProgress); }
    const generation = this.generation;
    this.loading = (async () => {
      this.status(false, 'WAVをデコードしています'); const context = this.getContext();
      const decoded = new Map(); let bytes = 0;
      for (const asset of assets) {
        const prior = this.buffers.get(asset.id);
        let buffer = prior?.version === (asset.sha256 || asset.url) ? prior.buffer : null;
        if (!buffer) {
          const response = await this.fetchImpl.call(globalThis,asset.url + (asset.sha256 ? `?v=${asset.sha256}` : ''), { cache: 'no-cache' });
          if (!response.ok) throw Error(`${asset.id}: HTTP ${response.status}`);
          buffer = await context.decodeAudioData(await response.arrayBuffer());
        }
        if (generation !== this.generation) throw Error('音声準備を取り消しました');
        if (!(buffer.duration > 0) || !buffer.length) throw Error(`${asset.id}: デコード結果が空です`);
        bytes += buffer.length * buffer.numberOfChannels * 4;
        if (bytes > this.maxBytes) throw Error('音声PCMのメモリ上限を超えました');
        decoded.set(asset.id, { buffer, version: asset.sha256 || asset.url });
        onProgress({ ready: decoded.size, total: assets.length, assetId: asset.id });
      }
      this.buffers = decoded; this.signature = signature; this.log('decoded', { count: decoded.size, bytes }); return this.stats();
    })().catch(error => { this.status(false, error.message); throw error; }).finally(() => { this.loading = null; });
    return this.loading;
  }
  stats() { return { ready: this.buffers.size, total: this.buffers.size, decodedBytes: [...this.buffers.values()].reduce((n,b) => n+b.buffer.length*b.buffer.numberOfChannels*4,0) }; }
  async verify(ids = [...this.buffers.keys()]) {
    if (this.resuming) await this.resuming;
    const generation = this.generation;
    const context = this.getContext();
    const preparationStarted = performance.now();
    if (!ids.length || ids.some(id => !this.buffers.has(id))) throw Error('必要な音声が未デコードです');
    this.resuming = (async () => {
      let timer;
      try {
        await Promise.race([context.resume(), new Promise((_,reject) => { timer = setTimeout(() => reject(Error('音声出力の再開がタイムアウトしました')), 3000); })]);
        if (generation !== this.generation || context !== this.context) throw Error('音声準備を取り消しました');
        if (context.state !== 'running') throw Error(`音声出力 ${context.state}`);
        if(((context.baseLatency||0)+(context.outputLatency||0))>.3)throw Error('音声出力の報告遅延が300msを超えています。出力設定を確認してください。');
        // An exactly-zero, connected clock keeps the render device alive without a tone.
        // This is NOT evidence that an external HDMI receiver is acoustically awake.
        if (this.clockContext !== context) {
          this.clock?.stop(); this.clock?.disconnect(); this.clockGain?.disconnect();
          this.clock = context.createConstantSource(); this.clock.offset.value = 0;
          this.clockGain = context.createGain(); this.clockGain.gain.value = 0;
          this.clockGain.__silentPreparation = true;
          this.clock.connect(this.clockGain); this.clockGain.connect(context.destination); this.clock.start(); this.clockContext = context;
        }
        const start = context.currentTime,clockProbeStarted=performance.now();
        await new Promise((resolve,reject) => {
          const deadline = performance.now()+1000;
          // Hidden/silent Chrome can batch a 16ms timer at one-second intervals.
          // Yield tasks only for this bounded render-clock probe; never schedule a Cue here.
          const channel = new MessageChannel();
          const finish = (callback,value) => { channel.port1.close();channel.port2.close();callback(value); };
          const poll = () => {
            if (generation !== this.generation || context.state !== 'running') return finish(reject,Error('準備中に音声出力を失いました'));
            if (context.currentTime > start) return finish(resolve);
            if (performance.now() > deadline) return finish(reject,Error('音声レンダー時計が停止しています'));
            channel.port2.postMessage(null);
          };channel.port1.onmessage=poll;poll();
        });
        this.unlocked = true; this.status(true); this.log('verified', { outputTimestamp: context.getOutputTimestamp?.(),preparationMs:performance.now()-preparationStarted,clockProbeMs:performance.now()-clockProbeStarted });
      } finally { clearTimeout(timer); }
    })().catch(error => {
      // STOP/Reset may invalidate this in-flight probe. Its cancellation is not
      // a device failure and must not downgrade the current healthy output.
      if(generation===this.generation && context===this.context)this.status(false,error.message);
      throw error;
    }).finally(() => { this.resuming = null; });
    return this.resuming;
  }
  assertReady(id) {
    if (!this.ready || this.context?.state !== 'running' || (id && !this.buffers.has(id))) throw Error(`音声 NOT READY: ${this.reason || this.context?.state || '未準備'}`);
  }
  play(id, { volume = 1, effect = 'none', onStart, onEnd, onError } = {}) {
    this.assertReady(id); const context = this.context;
    const source = context.createBufferSource(); source.buffer = this.buffers.get(id).buffer;
    source.__yokogawaAssetId=id;
    const analyser = context.createAnalyser(); analyser.fftSize = 512;
    const gain = context.createGain(); gain.gain.value = Math.min(1,Math.max(0,volume));
    gain.__yokogawaAssetId=id;
    source.__yokogawaVolume=gain.gain.value;
    const effects = connectPlaybackEffect(context,source,analyser,effect); analyser.connect(gain); gain.connect(context.destination);
    const item = { id, source, nodes: [source,...effects,analyser,gain], context, generation: this.generation };
    this.active.add(item);
    const cleanup = () => { this.active.delete(item); for (const node of item.nodes) node.disconnect(); };
    item.stop = () => { if (!this.active.has(item)) return; cleanup(); source.onended = null; source.stop(); this.log('cancelled',{id}); };
    const ended = () => {
      if (!this.active.has(item) || item.generation !== this.generation) return;
      cleanup(); this.log('ended',{id}); onEnd?.();
    };
    source.onended = () => {const tail=outputLeadMs(context)+(effect==='hijacked-subtle-v1'?40:0);return tail?setTimeout(ended,tail):ended();};
    try { source.start(); this.log('started',{id,duration:source.buffer.duration,volume:gain.gain.value}); onStart?.(analyser,context); }
    catch(error) { cleanup(); onError?.(error); throw error; }
    return item;
  }
  stopAll() { this.generation++; for (const item of [...this.active]) item.stop(); }
  fail(reason) { const playing = this.active.size; this.stopAll(); this.status(false, reason); this.log('failure',{playing,reason}); }
  async close() { this.stopAll(); this.status(false,'音声出力を閉じました');const context=this.context;this.context=null;this.clockContext=null;this.clock=null;this.clockGain=null;await context?.close(); }
}

export class BufferedSpeechProvider {
  constructor(engine, callbacks = {}) { this.engine=engine;this.callbacks=callbacks;this.active=null; }
  getVoices() { return []; }
  speak(message, settings = {}) {
    this.stop(false); const token=Symbol();this.active={token,id:message.id};
    const item=this.engine.play(message.audio.assetId,{volume:settings.volume ?? 1,effect:message.audio.playbackEffect,
      onStart:(analyser,context)=>this.callbacks.onStart?.(message.id,analyser,context,message),
      onEnd:()=>{if(this.active?.token!==token)return;this.active=null;this.callbacks.onEnd?.(message.id);},
    });
    if(this.active?.token===token)this.active.item=item;return item;
  }
  stop(notify=true) { if(!this.active)return;const active=this.active;this.active=null;active.item?.stop();if(notify)this.callbacks.onStop?.(active.id); }
}

export class BufferedSfxPlayer {
  constructor(engine, report=()=>{}) {this.engine=engine;this.report=report;this.active=new Set();this.completions=new Map();}
  async play(effect, volume=1, runId=null) {
    let settle;const done=new Promise(resolve=>{settle=resolve;});this.completions.set(effect.assetId,done);
    const entry={};this.active.add(entry);
    const finish=completed=>{if(!this.active.delete(entry))return;settle(completed);this.report(effect,runId,completed?'completed':'stopped');};
    try {entry.item=this.engine.play(effect.assetId,{volume:volume*effect.volume,onEnd:()=>finish(true)});entry.stop=()=>{entry.item.stop();finish(false);};}
    catch(error){finish(false);this.report(effect,runId,'error',error.message);throw error;}
  }
  whenIdle(id){return this.completions.get(id)??Promise.resolve(false);}
  stop(){for(const entry of [...this.active])entry.stop();this.completions.clear();}
}
