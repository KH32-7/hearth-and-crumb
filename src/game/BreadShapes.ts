import * as THREE from 'three';

/**
 * Deformable bread geometries the player shapes by hand. Each keeps a fixed
 * vertex layout and is rebuilt in place every frame while being worked, so the
 * dough visibly lengthens / rolls up / twists under the hands.
 */

function breadAttrs(g: THREE.BufferGeometry, count: number): void {
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aScore', new THREE.BufferAttribute(new Float32Array(count), 1));
  g.setAttribute('aGlaze', new THREE.BufferAttribute(new Float32Array(count), 1));
}

function finish(g: THREE.BufferGeometry): void {
  (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

// ---------------------------------------------------------------- rope (logs, pretzels)

const UP = new THREE.Vector3(0, 1, 0);

/** A closed tube along a centreline with a radius profile, sitting on y = 0. */
export class RopeShape {
  readonly geometry = new THREE.BufferGeometry();
  private readonly c0 = new THREE.Vector3();
  private readonly c1 = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly tan = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(
    private readonly n = 72,
    private readonly m = 16,
  ) {
    const count = (n + 1) * m + 2;
    breadAttrs(this.geometry, count);
    const idx: number[] = [];
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++) {
        const a = i * m + j;
        const b = i * m + ((j + 1) % m);
        const cc = (i + 1) * m + j;
        const d = (i + 1) * m + ((j + 1) % m);
        idx.push(a, cc, b, b, cc, d);
      }
    const S = (n + 1) * m;
    const E = S + 1;
    for (let j = 0; j < m; j++) {
      idx.push(S, j, (j + 1) % m);
      idx.push(E, n * m + ((j + 1) % m), n * m + j);
    }
    this.geometry.setIndex(idx);
  }

  /**
   * center(t) gives the centreline at the *base* (y is an extra lift, e.g. a
   * strand crossing over another); radius(t) the thickness. `flat` squashes the
   * underside so the dough sits on the bench.
   */
  build(center: (t: number, out: THREE.Vector3) => THREE.Vector3, radius: (t: number) => number, flat = 0.55): void {
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const { n, m } = this;
    const h = 1 / n;
    let firstR = 0;
    let lastR = 0;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      center(Math.max(0, t - h * 0.5), this.c0);
      center(Math.min(1, t + h * 0.5), this.c1);
      this.tan.subVectors(this.c1, this.c0);
      if (this.tan.lengthSq() < 1e-12) this.tan.set(1, 0, 0);
      this.tan.normalize();
      this.side.crossVectors(this.tan, UP);
      if (this.side.lengthSq() < 1e-8) this.side.set(0, 0, 1);
      this.side.normalize();
      this.up.crossVectors(this.side, this.tan).normalize();
      center(t, this.c);
      const r = Math.max(0.0008, radius(t));
      if (i === 0) firstR = r;
      if (i === n) lastR = r;
      const baseY = this.c.y + r * flat;
      for (let j = 0; j < m; j++) {
        const phi = (j / m) * Math.PI * 2;
        const cs = Math.cos(phi);
        const sn = Math.sin(phi);
        const dx = this.side.x * cs + this.up.x * sn;
        let dy = this.side.y * cs + this.up.y * sn;
        const dz = this.side.z * cs + this.up.z * sn;
        if (dy < 0) dy *= flat;
        pos.setXYZ(i * m + j, this.c.x + dx * r, baseY + dy * r, this.c.z + dz * r);
      }
    }
    // End caps poke slightly past the last ring so the tips stay rounded.
    center(0, this.c0);
    center(h, this.c1);
    this.tan.subVectors(this.c0, this.c1).normalize();
    pos.setXYZ((n + 1) * m, this.c0.x + this.tan.x * firstR * 0.6, this.c0.y + firstR * flat * 0.9, this.c0.z + this.tan.z * firstR * 0.6);
    center(1, this.c0);
    center(1 - h, this.c1);
    this.tan.subVectors(this.c0, this.c1).normalize();
    pos.setXYZ((n + 1) * m + 1, this.c0.x + this.tan.x * lastR * 0.6, this.c0.y + lastR * flat * 0.9, this.c0.z + this.tan.z * lastR * 0.6);
    finish(this.geometry);
  }
}

/** Capsule-like profile along a straight rope: full radius in the core, rounded ends. */
export function capsuleProfile(t: number, length: number, r: number, capStretch = 1): number {
  const x = Math.abs(t - 0.5) * length;
  const core = Math.max(0, length / 2 - r * capStretch);
  if (x <= core) return r;
  const q = Math.min(1, (x - core) / (r * capStretch));
  return r * Math.sqrt(Math.max(0, 1 - q * q));
}

// ---------------------------------------------------------------- pretzel

/** Classic pretzel: fat belly at the bottom, arms crossing twice, ends resting on the loop. */
const PRETZEL_POINTS: Array<[number, number, number]> = [
  [-0.056, 0.012, 0.03],
  [-0.026, 0.016, 0.006],
  [0.0, 0.017, -0.012],
  [0.03, 0.006, -0.036],
  [0.062, 0.0, -0.036],
  [0.078, 0.0, 0.006],
  [0.062, 0.0, 0.05],
  [0.024, 0.0, 0.07],
  [-0.024, 0.0, 0.07],
  [-0.062, 0.0, 0.05],
  [-0.078, 0.0, 0.006],
  [-0.062, 0.0, -0.036],
  [-0.03, 0.0, -0.036],
  [0.0, 0.0, -0.012],
  [0.026, 0.004, 0.006],
  [0.056, 0.012, 0.03],
];
const PRETZEL_SCALE = 1.2;
export const pretzelCurve = new THREE.CatmullRomCurve3(
  PRETZEL_POINTS.map(([x, y, z]) => new THREE.Vector3(x * PRETZEL_SCALE, y, (z - 0.017) * PRETZEL_SCALE)),
  false,
  'centripetal',
);
/** Straight rope length before twisting. */
export const PRETZEL_ROPE = 0.26;

export function pretzelRadius(t: number): number {
  const belly = Math.exp(-(((t - 0.5) / 0.17) ** 2));
  const tip = THREE.MathUtils.smoothstep(t, 0, 0.05) * THREE.MathUtils.smoothstep(1 - t, 0, 0.05);
  return (0.0105 + 0.0075 * belly) * (0.45 + 0.55 * tip);
}

const tmpA = new THREE.Vector3();
/** Rope → pretzel morph, k 0 straight … 1 knotted. */
export function pretzelCenter(t: number, k: number, out: THREE.Vector3): THREE.Vector3 {
  pretzelCurve.getPointAt(THREE.MathUtils.clamp(t, 0, 1), tmpA);
  const e = k * k * (3 - 2 * k);
  out.set((t - 0.5) * PRETZEL_ROPE, 0, 0).lerp(tmpA, e);
  return out;
}

// ---------------------------------------------------------------- croissant

/** Strip length across the triangle (0 centre … 1 corner), as a fraction of its height. */
function croissantStrip(edge: number): number {
  return Math.max(0.12, 1 - edge) ** 0.9;
}

/**
 * A triangle of laminated dough rolled up from its wide base. The sheet is a
 * thin slab; rolling wraps the first `curl` fraction of every strip into an
 * Archimedean spiral that sits on the bench, so the layers show at the ends.
 */
export class CroissantShape {
  readonly geometry = new THREE.BufferGeometry();
  /** World-ish (local) z of the roll's crown, for placing the hand. */
  rollZ = 0;
  rollTop = 0;
  private readonly W = 0.21;
  private readonly L = 0.2;
  private readonly h = 0.013;
  private readonly spacing = 0.021;

  constructor(
    private readonly nx = 26,
    private readonly nk = 46,
  ) {
    const per = (nx + 1) * (nk + 1);
    breadAttrs(this.geometry, per * 2);
    const T = (i: number, k: number) => i * (nk + 1) + k;
    const B = (i: number, k: number) => per + i * (nk + 1) + k;
    const idx: number[] = [];
    for (let i = 0; i < nx; i++)
      for (let k = 0; k < nk; k++) {
        const a = T(i, k), b = T(i + 1, k), c = T(i, k + 1), d = T(i + 1, k + 1);
        idx.push(a, b, c, b, d, c);
        const a2 = B(i, k), b2 = B(i + 1, k), c2 = B(i, k + 1), d2 = B(i + 1, k + 1);
        idx.push(a2, c2, b2, b2, c2, d2);
      }
    for (let i = 0; i < nx; i++) {
      idx.push(T(i, 0), B(i, 0), T(i + 1, 0), T(i + 1, 0), B(i, 0), B(i + 1, 0));
      idx.push(T(i, nk), T(i + 1, nk), B(i, nk), T(i + 1, nk), B(i + 1, nk), B(i, nk));
    }
    for (let k = 0; k < nk; k++) {
      idx.push(T(0, k), T(0, k + 1), B(0, k), T(0, k + 1), B(0, k + 1), B(0, k));
      idx.push(T(nx, k), B(nx, k), T(nx, k + 1), T(nx, k + 1), B(nx, k), B(nx, k + 1));
    }
    this.geometry.setIndex(idx);
  }

  /** curl 0 flat sheet … 1 fully rolled; bend 0..1 curves the horns in. */
  build(curl: number, bend = 0): void {
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const { nx, nk, W, L, h } = this;
    const per = (nx + 1) * (nk + 1);
    const cSp = Math.sqrt(this.spacing / Math.PI);
    const z0 = L / 2;
    const v = new THREE.Vector3();
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let midZ = 0;
    let midTop = 0;
    for (let i = 0; i <= nx; i++) {
      const xn = i / nx;
      const edge = Math.abs(2 * xn - 1);
      const len = L * croissantStrip(edge);
      const sigma = curl * len;
      const rho = cSp * Math.sqrt(sigma);
      // Side strips are shorter; slide them forward as they roll so every roll
      // centre lines up behind the middle one (a straight log, then bent).
      const lag = -curl * (L - len);
      const zc = z0 - sigma;
      const x = (xn - 0.5) * W * (1 - bend * 0.16);
      const horn = bend * edge * edge * 0.06 + lag;
      for (let k = 0; k <= nk; k++) {
        const a = (k / nk) * len;
        let my: number, mz: number, ny: number, nz: number;
        if (a >= sigma) {
          my = 0;
          mz = z0 - a;
          ny = 1;
          nz = 0;
        } else {
          const r = Math.max(h * 0.5 + 0.0006, cSp * Math.sqrt(a));
          const psi = (2 / cSp) * (Math.sqrt(sigma) - Math.sqrt(a));
          const er_y = -Math.cos(psi);
          const er_z = Math.sin(psi);
          my = rho + r * er_y;
          mz = zc + r * er_z;
          // Top face of the sheet faces into the roll.
          ny = -er_y;
          nz = -er_z;
        }
        const zz = mz + horn;
        pos.setXYZ(i * (nk + 1) + k, x, my + ny * h * 0.5 + h * 0.5, zz + nz * h * 0.5);
        pos.setXYZ(per + i * (nk + 1) + k, x, my - ny * h * 0.5 + h * 0.5, zz - nz * h * 0.5);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, zz);
        maxZ = Math.max(maxZ, zz);
      }
      if (i === nx >> 1) {
        midZ = zc + horn;
        midTop = rho * 2 + h;
      }
    }
    // Drift the roll back toward the slot centre as it forms.
    const cx = ((minX + maxX) / 2) * curl;
    const cz = ((minZ + maxZ) / 2) * curl;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      pos.setXYZ(i, v.x - cx, v.y, v.z - cz);
    }
    this.rollZ = midZ - cz;
    this.rollTop = midTop;
    finish(this.geometry);
  }
}

// ---------------------------------------------------------------- finished shapes (staging / display)

export function baguetteRope(shape: RopeShape, p: number): void {
  const length = THREE.MathUtils.lerp(0.15, 0.44, p);
  const r = THREE.MathUtils.lerp(0.072, 0.041, p);
  const stretch = THREE.MathUtils.lerp(1, 1.9, p);
  shape.build(
    (t, out) => out.set((t - 0.5) * length, 0, Math.sin(t * Math.PI * 2) * 0.004 * p),
    (t) => capsuleProfile(t, length, r, stretch),
    THREE.MathUtils.lerp(0.55, 0.62, p),
  );
}

export function pretzelRope(shape: RopeShape, p: number): void {
  const length = THREE.MathUtils.lerp(0.11, PRETZEL_ROPE, p);
  const e = p * p;
  shape.build(
    (t, out) => out.set((t - 0.5) * length, 0, 0),
    (t) => THREE.MathUtils.lerp(capsuleProfile(t, length, 0.052), pretzelRadius(t), e),
    0.6,
  );
}

export function pretzelTwist(shape: RopeShape, k: number): void {
  shape.build((t, out) => pretzelCenter(t, k, out), pretzelRadius, 0.6);
}

/**
 * The rolled-up croissant as a banded log (matches the spiral roll's size so the
 * swap is invisible), then bent into a crescent with the horns curling in.
 */
export function croissantRope(shape: RopeShape, bend: number): void {
  const W = 0.21 * (1 - bend * 0.14);
  const cSp = Math.sqrt(0.021 / Math.PI);
  shape.build(
    (t, out) => out.set((t - 0.5) * W, 0, bend * 0.025 - bend * 0.075 * (2 * t - 1) ** 2),
    (t) => {
      const edge = Math.abs(2 * t - 1);
      const base = cSp * Math.sqrt(0.2 * croissantStrip(edge));
      // The wrapped layers read as fat stepped bands across the crescent.
      const bands = 0.86 + 0.2 * Math.abs(Math.cos(Math.PI * (t - 0.5) * 5)) ** 0.7;
      return base * (1.05 + 0.12 * bend) * bands;
    },
    0.8,
  );
}

/** Pre-cut diagonal "ears" on a finished baguette (display / staging). */
function slashBaguette(g: THREE.BufferGeometry): void {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const score = g.attributes.aScore as THREE.BufferAttribute;
  g.computeBoundingBox();
  const top = g.boundingBox!.max.y;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const u = (x / 0.18 + 1) * 2.5 + z * 9;
    const slash = Math.abs(((u + 0.5) % 1) - 0.5);
    const s =
      0.7 *
      (1 - THREE.MathUtils.smoothstep(slash, 0.04, 0.16)) *
      THREE.MathUtils.smoothstep(y / top, 0.7, 0.95) *
      (1 - THREE.MathUtils.smoothstep(Math.abs(x), 0.14, 0.18)) *
      (1 - THREE.MathUtils.smoothstep(Math.abs(z), 0.012, 0.03));
    score.setX(i, s);
  }
}

export function finishedGeometry(kind: 'croissant' | 'pretzel' | 'log'): THREE.BufferGeometry {
  const r = kind === 'pretzel' ? new RopeShape(110, 16) : kind === 'croissant' ? new RopeShape(72, 18) : new RopeShape(80, 30);
  if (kind === 'croissant') croissantRope(r, 1);
  else if (kind === 'pretzel') pretzelTwist(r, 1);
  else {
    baguetteRope(r, 1);
    slashBaguette(r.geometry);
  }
  return r.geometry;
}
