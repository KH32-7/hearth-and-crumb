import * as THREE from 'three';

/**
 * Texture registry. Painted textures live in /public/textures and are loaded
 * asynchronously; every slot has a procedural canvas fallback so the scene is
 * never blank while (or if) a file fails to load.
 */
export type TextureKey =
  | 'plaster'
  | 'floorTiles'
  | 'butcherBlock'
  | 'walnut'
  | 'brick'
  | 'wicker'
  | 'kraft'
  | 'gingham'
  | 'sageWood'
  | 'cobble'
  | 'streetPlate'
  | 'crust';

const FILES: Record<TextureKey, { file: string; color: boolean; fallback: string }> = {
  plaster: { file: 'plaster.webp', color: true, fallback: '#f1dfbf' },
  floorTiles: { file: 'floor-tiles.webp', color: true, fallback: '#d9b48c' },
  butcherBlock: { file: 'butcher-block.webp', color: true, fallback: '#d9a96a' },
  walnut: { file: 'walnut.webp', color: true, fallback: '#7a4a2c' },
  brick: { file: 'brick.webp', color: true, fallback: '#b5603e' },
  wicker: { file: 'wicker.webp', color: true, fallback: '#c99a5b' },
  kraft: { file: 'kraft.webp', color: true, fallback: '#e3c99c' },
  gingham: { file: 'gingham.webp', color: true, fallback: '#c86a5a' },
  sageWood: { file: 'sage-wood.webp', color: true, fallback: '#7c8a5a' },
  cobble: { file: 'cobble.webp', color: true, fallback: '#a99a86' },
  streetPlate: { file: 'street-plate.webp', color: true, fallback: '#f0c98a' },
  crust: { file: 'crust.webp', color: false, fallback: '#808080' },
};

export class TextureLibrary {
  private readonly loader = new THREE.TextureLoader();
  private readonly cache = new Map<TextureKey, THREE.Texture>();
  private readonly clones = new Map<TextureKey, THREE.Texture[]>();
  private readonly pending: Promise<void>[] = [];
  readonly paperGrain: THREE.Texture;
  readonly toonRamp: THREE.Texture;
  readonly softDot: THREE.Texture;
  readonly radialShadow: THREE.Texture;
  readonly flourSplat: THREE.Texture;

  constructor(private readonly anisotropy = 8) {
    this.paperGrain = createPaperGrain();
    this.toonRamp = createToonRamp();
    this.softDot = createSoftDot();
    this.radialShadow = createRadialShadow();
    this.flourSplat = createFlourSplat();
  }

  /** Returns a texture immediately (fallback image), swapping in the painted file once loaded. */
  get(key: TextureKey): THREE.Texture {
    const cached = this.cache.get(key);
    if (cached) return cached;
    const def = FILES[key];
    const texture = new THREE.Texture<TexImageSource>(solidCanvas(def.fallback));
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = this.anisotropy;
    texture.colorSpace = def.color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    this.cache.set(key, texture);
    this.pending.push(
      new Promise<void>((resolve) => {
        this.loader.load(
          `${import.meta.env.BASE_URL}textures/${def.file}`,
          (loaded) => {
            // Size changes (4×4 fallback → full image): free the immutable GPU
            // storage first, otherwise ANGLE rejects the sub-image upload.
            texture.dispose();
            texture.image = loaded.image;
            texture.needsUpdate = true;
            for (const clone of this.clones.get(key) ?? []) {
              clone.dispose();
              clone.image = loaded.image;
              clone.needsUpdate = true;
            }
            resolve();
          },
          undefined,
          () => resolve(),
        );
      }),
    );
    return texture;
  }

  /** Clone with its own repeat; shares the image so GPU upload happens once per source. */
  tiled(key: TextureKey, repeatX: number, repeatY: number): THREE.Texture {
    const base = this.get(key);
    const tex = base.clone();
    tex.repeat.set(repeatX, repeatY);
    tex.needsUpdate = true;
    const list = this.clones.get(key) ?? [];
    list.push(tex);
    this.clones.set(key, list);
    return tex;
  }

  /** One-off painted art from /public/art (framed pictures, clock faces). */
  art(file: string): THREE.Texture {
    const tex = this.loader.load(`${import.meta.env.BASE_URL}art/${file}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.anisotropy;
    this.pending.push(new Promise<void>((resolve) => {
      const check = () => (tex.image ? resolve() : setTimeout(check, 50));
      check();
    }));
    return tex;
  }

  whenLoaded(): Promise<void> {
    return Promise.all(this.pending).then(() => undefined);
  }
}

function solidCanvas(color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 4;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 4, 4);
  return c;
}

/** Soft multi-band ramp: 3 painterly tone steps with feathered transitions. */
function createToonRamp(): THREE.DataTexture {
  const width = 256;
  const data = new Uint8Array(width * 4);
  const bands: Array<[number, number]> = [
    [0.0, 0.42],
    [0.47, 0.72],
    [0.62, 1.0],
  ];
  for (let i = 0; i < width; i++) {
    const t = i / (width - 1);
    let v = bands[0][1];
    // Feathered steps (~0.05 wide) keep the cel look but avoid aliasing stairs.
    const s1 = smooth(0.44, 0.5, t);
    const s2 = smooth(0.6, 0.66, t);
    v = lerp(bands[0][1], bands[1][1], s1);
    v = lerp(v, bands[2][1], s2);
    const b = Math.round(v * 255);
    data.set([b, b, b, 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function createPaperGrain(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  // Value noise layers + fibre streaks, centred on mid-grey.
  const rand = mulberry(7);
  const grid = (cell: number) => {
    const n = Math.ceil(size / cell) + 1;
    const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = rand();
    return { n, g, cell };
  };
  const layers = [grid(64), grid(16), grid(4), grid(2)];
  const weights = [0.35, 0.3, 0.22, 0.13];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      layers.forEach((L, li) => {
        const fx = x / L.cell;
        const fy = y / L.cell;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = smooth(0, 1, fx - ix);
        const ty = smooth(0, 1, fy - iy);
        const wrap = (i: number) => ((i % (L.n - 1)) + (L.n - 1)) % (L.n - 1);
        const a = L.g[wrap(iy) * L.n + wrap(ix)];
        const b = L.g[wrap(iy) * L.n + wrap(ix + 1)];
        const c2 = L.g[wrap(iy + 1) * L.n + wrap(ix)];
        const d = L.g[wrap(iy + 1) * L.n + wrap(ix + 1)];
        v += lerp(lerp(a, b, tx), lerp(c2, d, tx), ty) * weights[li];
      });
      const o = (y * size + x) * 4;
      const val = Math.round(lerp(96, 160, v));
      img.data[o] = img.data[o + 1] = img.data[o + 2] = val;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#000';
  for (let i = 0; i < 260; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * Math.PI;
    const l = 4 + rand() * 18;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function createSoftDot(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createFlourSplat(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const rand = mulberry(11);
  // Soft cloud of dusted flour: many faint dabs, denser near the centre.
  for (let i = 0; i < 900; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.pow(rand(), 0.7) * size * 0.46;
    const x = size / 2 + Math.cos(a) * r * (1 + 0.25 * Math.sin(a * 3));
    const y = size / 2 + Math.sin(a) * r * 0.8;
    const rad = 1 + rand() * (r < size * 0.25 ? 9 : 4);
    ctx.fillStyle = `rgba(255,252,244,${0.04 + rand() * 0.12})`;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRadialShadow(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(60,30,30,0.55)');
  g.addColorStop(0.6, 'rgba(60,30,30,0.2)');
  g.addColorStop(1, 'rgba(60,30,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
