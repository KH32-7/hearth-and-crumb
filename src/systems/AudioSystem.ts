type Entry = { file: string; volume: number; loop: boolean };
type Manifest = { sfx: Record<string, Entry>; ambience: Record<string, Entry>; music: Record<string, Entry> };

/**
 * Manifest-driven Web Audio. Missing files are tolerated (silent) so gameplay
 * never depends on audio. Buses: master → music / sfx (ambience rides sfx).
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private manifest: Manifest = { sfx: {}, ambience: {}, music: {} };
  private readonly buffers = new Map<string, AudioBuffer | null>();
  private readonly loops = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();
  private musicTrack: { id: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private volumes = { master: 0.8, music: 0.55, sfx: 0.85 };
  private pendingMusic: string | null = null;
  private pendingLoops: Array<{ id: string; volume: number }> = [];
  ready = false;

  constructor() {
    const unlock = () => {
      void this.unlock();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    void fetch(`${import.meta.env.BASE_URL}audio/manifest.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m: Manifest | null) => {
        if (m) this.manifest = { sfx: m.sfx ?? {}, ambience: m.ambience ?? {}, music: m.music ?? {} };
      })
      .catch(() => undefined);
  }

  async unlock(): Promise<void> {
    if (this.ctx) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.applyVolumes();
    await this.ctx.resume();
    this.ready = true;
    if (this.pendingMusic) this.playMusic(this.pendingMusic);
    for (const l of this.pendingLoops) this.startLoop(l.id, l.volume);
    this.pendingLoops = [];
  }

  setVolumes(v: { master: number; music: number; sfx: number }): void {
    this.volumes = { ...v };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  private entry(id: string): Entry | undefined {
    return this.manifest.sfx[id] ?? this.manifest.ambience[id] ?? this.manifest.music[id];
  }

  private async load(id: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(id)) return this.buffers.get(id) ?? null;
    const e = this.entry(id);
    if (!e || !this.ctx) {
      return null;
    }
    this.buffers.set(id, null);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}${e.file}`);
      const data = await res.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(data);
      this.buffers.set(id, buf);
      return buf;
    } catch {
      return null;
    }
  }

  play(id: string, volume = 1, rate = 1): void {
    if (!this.ctx || !this.ready) return;
    const e = this.entry(id);
    if (!e) return;
    const buf = this.buffers.get(id);
    const start = (b: AudioBuffer) => {
      const src = this.ctx!.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
      const g = this.ctx!.createGain();
      g.gain.value = e.volume * volume;
      src.connect(g).connect(this.sfxBus);
      src.start();
    };
    if (buf) start(buf);
    else void this.load(id).then((b) => b && start(b));
  }

  startLoop(id: string, volume = 1): void {
    if (!this.ctx || !this.ready) {
      this.pendingLoops.push({ id, volume });
      return;
    }
    if (this.loops.has(id)) {
      this.setLoopVolume(id, volume);
      return;
    }
    const e = this.entry(id);
    if (!e) return;
    const placeholder = { src: this.ctx.createBufferSource(), gain: this.ctx.createGain() };
    this.loops.set(id, placeholder);
    void this.load(id).then((b) => {
      if (!b || !this.ctx || this.loops.get(id) !== placeholder) return;
      placeholder.src.buffer = b;
      placeholder.src.loop = true;
      placeholder.gain.gain.value = 0;
      placeholder.gain.gain.setTargetAtTime(e.volume * volume, this.ctx.currentTime, 0.4);
      placeholder.src.connect(placeholder.gain).connect(this.sfxBus);
      placeholder.src.start();
    });
  }

  setLoopVolume(id: string, volume: number): void {
    const l = this.loops.get(id);
    const e = this.entry(id);
    if (!l || !e || !this.ctx) return;
    l.gain.gain.setTargetAtTime(e.volume * volume, this.ctx.currentTime, 0.15);
  }

  stopLoop(id: string): void {
    const l = this.loops.get(id);
    if (!l || !this.ctx) return;
    this.loops.delete(id);
    l.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    try {
      l.src.stop(this.ctx.currentTime + 1);
    } catch {
      // not started yet
    }
  }

  playMusic(id: string): void {
    if (!this.ctx || !this.ready) {
      this.pendingMusic = id;
      return;
    }
    if (this.musicTrack?.id === id) return;
    const e = this.entry(id);
    if (!e) return;
    const old = this.musicTrack;
    if (old) {
      old.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.8);
      try {
        old.src.stop(this.ctx.currentTime + 4);
      } catch {
        // ignore
      }
    }
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    this.musicTrack = { id, src, gain };
    void this.load(id).then((b) => {
      if (!b || !this.ctx || this.musicTrack?.src !== src) return;
      src.buffer = b;
      src.loop = true;
      src.connect(gain).connect(this.musicBus);
      src.start();
      gain.gain.setTargetAtTime(e.volume, this.ctx.currentTime, 1.2);
    });
  }

  musicIds(): string[] {
    return Object.keys(this.manifest.music);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
