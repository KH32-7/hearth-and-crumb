import * as THREE from 'three';
import type { Minigame, MinigameIO } from './Minigames';
import { Bread, BreadFactory } from './Bread';
import type { Tray } from './Items';
import type { VfxSystem } from '../systems/Vfx';
import type { Hud } from '../ui/Hud';
import type { MaterialLibrary } from '../render/Materials';
import { t } from '../ui/i18n';

/**
 * Cooking-Mama style direct manipulation on the workbench. The mouse drives a
 * pair of cartoon hands / a scraper / a knife / a pastry brush that live in the
 * 3D scene and physically act on the dough: pushing stretches it, pulling tears
 * a piece off, circling rolls it round, the knife leaves a cut exactly where it
 * was dragged and the brush only glazes what it touched.
 */
export type TactileDeps = {
  scene: THREE.Scene;
  planeY: number;
  tools: BenchTools;
  vfx: VfxSystem;
  hud: Hud;
  breads: BreadFactory;
  rng: () => number;
  sfx: (id: string, volume?: number) => void;
  /** Re-aim the station camera (glides). */
  view: (pos: THREE.Vector3, look: THREE.Vector3) => void;
};

const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const tmp = new THREE.Vector3();

/** Virtual cursor (CSS px) → point on the bench-top plane. */
export function benchPoint(io: MinigameIO, planeY: number, out = new THREE.Vector3()): THREE.Vector3 | null {
  const ndc = new THREE.Vector2((io.cursor.x / io.width) * 2 - 1, -(io.cursor.y / io.height) * 2 + 1);
  raycaster.setFromCamera(ndc, io.camera);
  plane.constant = -planeY;
  return raycaster.ray.intersectPlane(plane, out);
}

/** Cursor → first hit on the given meshes (bun tops), else the bench plane. */
export function toolPoint(io: MinigameIO, meshes: THREE.Object3D[], planeY: number, out = new THREE.Vector3()): { point: THREE.Vector3; onBread: boolean } | null {
  for (const m of meshes) m.updateWorldMatrix(true, false);
  const ndc = new THREE.Vector2((io.cursor.x / io.width) * 2 - 1, -(io.cursor.y / io.height) * 2 + 1);
  raycaster.setFromCamera(ndc, io.camera);
  const hit = raycaster.intersectObjects(meshes, false)[0];
  if (hit) return { point: out.copy(hit.point), onBread: true };
  plane.constant = -planeY;
  const p = raycaster.ray.intersectPlane(plane, out);
  return p ? { point: p, onBread: false } : null;
}

function toScreen(p: THREE.Vector3, io: MinigameIO): THREE.Vector2 {
  tmp.copy(p).project(io.camera);
  return new THREE.Vector2(((tmp.x + 1) / 2) * io.width, ((1 - tmp.y) / 2) * io.height);
}

/** Height of a bread's top surface under a world xz point (ray from above). */
function surfaceY(mesh: THREE.Object3D, x: number, z: number, fallback: number): number {
  mesh.updateWorldMatrix(true, false);
  raycaster.set(new THREE.Vector3(x, fallback + 1, z), new THREE.Vector3(0, -1, 0));
  const hit = raycaster.intersectObject(mesh, false)[0];
  return hit ? hit.point.y : fallback;
}

// ---------------------------------------------------------------- tools

type HandRig = { root: THREE.Group; palm: THREE.Object3D; fingers: THREE.Object3D[]; thumb: THREE.Object3D; arm: THREE.Object3D; sleeve: THREE.Object3D; cuff: THREE.Object3D };

export class BenchTools {
  readonly left: HandRig;
  readonly right: HandRig;
  readonly knife: THREE.Group;
  readonly brush: THREE.Group;
  readonly bristles: THREE.Object3D;
  private active: THREE.Object3D[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    mats: MaterialLibrary,
  ) {
    const skin = mats.painted({ color: '#f3cba8', rim: 0.35 });
    const sleeve = mats.painted({ color: '#a9bccf' });
    const cuff = mats.painted({ color: '#b5553a' });
    this.left = makeHand(skin, sleeve, cuff, -1);
    this.right = makeHand(skin, sleeve, cuff, 1);

    // Pastry knife (lame): walnut handle + steel blade, edge pointing down.
    this.knife = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.11, 10), mats.painted({ color: '#7a4a2c' }));
    handle.rotation.x = Math.PI / 2 - 0.5;
    handle.position.set(0, 0.07, 0.05);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.05, 0.035), mats.painted({ color: '#d8d3cb', spec: 1, specSize: 0.3, rim: 0.4 }));
    blade.position.set(0, 0.022, 0.0);
    blade.rotation.x = -0.5;
    this.knife.add(handle, blade);

    // Pastry brush: handle, ferrule, splayable bristles.
    this.brush = new THREE.Group();
    const bh = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.16, 10), mats.painted({ color: '#c99a5b' }));
    bh.rotation.x = Math.PI / 2 - 0.7;
    bh.position.set(0, 0.11, 0.07);
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 12), mats.painted({ color: '#c99a45', spec: 0.9, specSize: 0.35 }));
    ferrule.rotation.x = Math.PI / 2 - 0.7;
    ferrule.position.set(0, 0.045, 0.02);
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.01, 0.04, 12), mats.painted({ color: '#f2d68a', spec: 0.7, specSize: 0.5 }));
    br.rotation.x = Math.PI / 2 - 0.7;
    br.position.set(0, 0.018, 0.0);
    this.bristles = br;
    this.brush.add(bh, ferrule, br);
    for (const o of [this.left.root, this.right.root, this.knife, this.brush]) {
      o.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.raycast = () => undefined;
        }
      });
    }
  }

  use(...objs: THREE.Object3D[]): void {
    for (const o of this.active) o.removeFromParent();
    this.active = objs;
    for (const o of objs) this.scene.add(o);
  }

  clear(): void {
    this.use();
  }

  /** Hands float freely (no arms to aim); kept for API stability. */
  aim(_camera: THREE.Camera): void {}

  /** Pose a hand: press 0..1 lowers & flattens, grip 0..1 curls fingers. */
  static pose(h: HandRig, press: number, grip: number): void {
    h.palm.scale.set(1, 0.45 * (1 - press * 0.25), 1.12);
    h.fingers.forEach((f, i) => {
      f.rotation.x = -0.15 - grip * 1.25 - press * 0.15 + (i % 2) * 0.05;
    });
    h.thumb.rotation.z = (h.root.userData.side as number) * (0.6 - grip * 0.5);
  }
}

function makeHand(skin: THREE.Material, sleeveMat: THREE.Material, cuffMat: THREE.Material, side: number): HandRig {
  const root = new THREE.Group();
  root.userData.side = side;
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.048, 16, 12), skin);
  palm.scale.set(1, 0.45, 1.12);
  root.add(palm);
  const fingers: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.position.set((i - 1.5) * 0.022, 0.006, -0.045);
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.034 + (i === 1 || i === 2 ? 0.008 : 0), 4, 8), skin);
    f.rotation.x = Math.PI / 2;
    f.position.z = -0.024;
    pivot.add(f);
    root.add(pivot);
    fingers.push(pivot);
  }
  const thumb = new THREE.Group();
  thumb.position.set(-side * 0.044, 0.004, -0.006);
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.03, 4, 8), skin);
  th.rotation.z = Math.PI / 2;
  th.position.x = -side * 0.016;
  thumb.add(th);
  root.add(thumb);
  // Forearm reaching back toward the camera, rolled-up sleeve.
  // Cooking-Mama style hands: a short wrist and a stubby rolled sleeve lying back
  // toward the viewer (seen from above it reads as cloth, never as a ring).
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.029, 0.06, 12).translate(0, 0.03, 0), skin);
  arm.rotation.x = Math.PI / 2 - 0.25;
  arm.position.set(0, 0.006, 0.03);
  const sleeveGeo = new THREE.CylinderGeometry(0.036, 0.041, 0.075, 14).translate(0, 0.0375, 0);
  const sl = new THREE.Mesh(sleeveGeo, sleeveMat);
  sl.rotation.copy(arm.rotation);
  sl.position.set(0, 0.006 + Math.sin(0.25) * 0.055, 0.03 + Math.cos(0.25) * 0.055);
  // Rolled hem: a slightly fatter band at the sleeve's leading edge.
  const cf = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.016, 14), cuffMat);
  cf.rotation.copy(arm.rotation);
  cf.position.set(0, 0.006 + Math.sin(0.25) * 0.058, 0.03 + Math.cos(0.25) * 0.058);
  root.add(arm, sl, cf);
  return { root, palm, fingers, thumb, arm, sleeve: sl, cuff: cf };
}

// ---------------------------------------------------------------- shared helpers

function pop(deps: TactileDeps, io: MinigameIO, at: THREE.Vector3, text: string, tone: 'good' | 'great' | 'meh' = 'good'): void {
  const s = toScreen(at, io);
  deps.hud.pop(text, s.x, s.y - 40, tone);
}

/** Per-vertex world positions + top-facing mask, cached for painting. */
type PaintCache = { bread: Bread; world: Float32Array; top: Uint8Array; topCount: number };

function paintCache(b: Bread): PaintCache {
  b.makePaintable();
  // Parents may have moved this frame (tray just set down): refresh the whole chain.
  b.mesh.updateWorldMatrix(true, false);
  const pos = b.mesh.geometry.attributes.position as THREE.BufferAttribute;
  const nor = b.mesh.geometry.attributes.normal as THREE.BufferAttribute;
  const world = new Float32Array(pos.count * 3);
  const top = new Uint8Array(pos.count);
  const nm = new THREE.Matrix3().getNormalMatrix(b.mesh.matrixWorld);
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  let topCount = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(b.mesh.matrixWorld);
    world.set([v.x, v.y, v.z], i * 3);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    if (n.y > 0.25) {
      top[i] = 1;
      topCount++;
    }
  }
  return { bread: b, world, top, topCount };
}

function distToSegment2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let tt = l2 > 1e-10 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  tt = Math.max(0, Math.min(1, tt));
  const cx = ax + dx * tt;
  const cz = az + dz * tt;
  return (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
}

// ---------------------------------------------------------------- 1. Knead

export class KneadGame implements Minigame {
  readonly title = t('mg.knead.title');
  readonly hideCursor = true;
  score = 0;
  private kneads = 0;
  private readonly target = 8;
  private grabbing = false;
  private startZ = 0;
  private stretch = 0;
  private stretchV = 0;
  private pushed = false;
  private strokeStart = 0;
  private time = 0;
  private turn = 0;
  private squash = 0;
  private readonly ratings: number[] = [];
  private readonly p = new THREE.Vector3();
  private readonly home: THREE.Vector3;
  /** World-aligned pivot: pushes always stretch away from you, whatever the dough's turn. */
  private readonly pivot = new THREE.Group();

  constructor(
    private readonly deps: TactileDeps,
    private readonly dough: Bread,
  ) {
    this.home = dough.mesh.position.clone();
  }

  enter(): void {
    const d = this.deps;
    this.pivot.position.copy(this.home);
    d.scene.add(this.pivot);
    this.dough.mesh.position.set(0, 0, 0);
    this.pivot.add(this.dough.mesh);
    d.tools.use(d.tools.left.root, d.tools.right.root);
    d.view(this.home.clone().add(new THREE.Vector3(0.0, 0.52, 0.5)), this.home.clone().add(new THREE.Vector3(0, 0.03, -0.1)));
  }

  help(): string {
    return t('mg.knead.help', { n: this.kneads, total: this.target });
  }

  update(dt: number, io: MinigameIO): boolean {
    const d = this.deps;
    this.time += dt;
    const p = benchPoint(io, d.planeY, this.p);
    const dough = this.dough;
    if (p) {
      const near = Math.hypot(p.x - this.home.x, p.z - this.home.z) < 0.24;
      if (io.pressed && near) {
        this.grabbing = true;
        this.startZ = p.z;
        this.strokeStart = this.time;
        d.sfx('knead_3', 0.5);
      }
      if (this.grabbing && io.down) {
        // Pushing away from you (screen-up = -z) stretches the dough.
        const s = THREE.MathUtils.clamp((this.startZ - p.z) / 0.15, -0.25, 1);
        this.stretch += (s - this.stretch) * Math.min(1, dt * 18);
        if (!this.pushed && this.stretch > 0.7) {
          this.pushed = true;
          d.sfx('knead_1');
          d.vfx.flourPuff(this.home.clone().add(new THREE.Vector3(0, 0.06, -0.08)), 10);
        } else if (this.pushed && this.stretch < 0.2) this.fold(io);
      }
      if (this.grabbing && io.released) {
        this.grabbing = false;
        if (this.pushed) this.fold(io);
      }
    }
    if (!this.grabbing) {
      // Elastic spring back.
      this.stretchV += (-this.stretch * 120 - this.stretchV * 12) * dt;
      this.stretch += this.stretchV * dt;
    }
    this.squash = Math.max(0, this.squash - dt * 3);
    // Apply dough shape.
    dough.shaped = 0.12 + 0.88 * (this.kneads / this.target);
    dough.apply();
    const st = Math.max(0, this.stretch);
    const bounce = Math.sin(this.squash * Math.PI * 2) * this.squash;
    this.pivot.scale.set(1 - 0.08 * st + 0.08 * bounce, 1 - 0.3 * st - 0.12 * bounce, 1 + 0.55 * st);
    this.pivot.position.set(this.home.x, this.home.y, this.home.z - 0.06 * st);
    dough.mesh.position.set(0, 0, 0);
    dough.mesh.rotation.y += (this.turn - dough.mesh.rotation.y) * Math.min(1, dt * 10);
    // Hands ride on the dough surface, heels pressing in.
    const hx = p ? THREE.MathUtils.clamp(p.x, this.home.x - 0.2, this.home.x + 0.2) : this.home.x;
    const hz = p ? THREE.MathUtils.clamp(p.z, this.home.z - 0.28, this.home.z + 0.25) : this.home.z + 0.1;
    const press = this.grabbing ? 1 : 0;
    for (const [hand, off] of [
      [d.tools.left, -0.1],
      [d.tools.right, 0.1],
    ] as const) {
      const x = hx + off;
      const top = surfaceY(dough.mesh, x, hz, d.planeY);
      const y = top + (this.grabbing ? -0.012 : 0.04);
      hand.root.position.lerp(new THREE.Vector3(x, y, hz), Math.min(1, dt * 20));
      hand.root.rotation.set(0.2 * press, -off * 1.2, 0);
      BenchTools.pose(hand, press, 0.15);
    }
    if (this.kneads >= this.target) {
      this.score = this.ratings.reduce((a, b) => a + b, 0) / Math.max(1, this.ratings.length);
      return true;
    }
    return false;
  }

  private fold(io: MinigameIO): void {
    const d = this.deps;
    this.pushed = false;
    this.kneads++;
    this.turn += Math.PI / 2 * (this.kneads % 2 ? 1 : 0.6);
    this.squash = 1;
    const dur = this.time - this.strokeStart;
    this.strokeStart = this.time;
    const rating = dur > 0.25 && dur < 1.1 ? 1 : dur <= 0.25 ? 0.75 : 0.65;
    this.ratings.push(rating);
    d.sfx(this.kneads % 2 ? 'knead_2' : 'knead_3');
    d.vfx.flourPuff(this.home.clone().add(new THREE.Vector3(0, 0.08, 0)), 8);
    pop(d, io, this.home.clone().add(new THREE.Vector3(0, 0.18, 0)), rating === 1 ? t('pop.squish') : t('pop.ok'), rating === 1 ? 'great' : 'good');
  }

  dispose(): void {
    // Hand the dough back to the scene at its bench spot.
    this.deps.scene.add(this.dough.mesh);
    this.dough.mesh.position.copy(this.home);
    this.pivot.removeFromParent();
    this.deps.tools.clear();
  }
}

// ---------------------------------------------------------------- 2. Pull & place

export class PullGame implements Minigame {
  readonly title = t('mg.pull.title');
  readonly hideCursor = true;
  score = 0;
  private state: 'idle' | 'grab' | 'carry' | 'fly' = 'idle';
  private piece: Bread | null = null;
  private weight = 0;
  private taken = 0;
  private placed = 0;
  private grabPoint = new THREE.Vector3();
  private flyFrom = new THREE.Vector3();
  private flyTo = new THREE.Vector3();
  private flyT = 0;
  private flySlot = -1;
  private readonly scores: number[] = [];
  private readonly neck: THREE.Mesh;
  private readonly p = new THREE.Vector3();
  private readonly home: THREE.Vector3;
  readonly pieces: Bread[] = [];

  constructor(
    private readonly deps: TactileDeps,
    private readonly dough: Bread,
    private readonly tray: Tray,
    private readonly count = 6,
  ) {
    this.home = dough.mesh.position.clone();
    this.neck = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), dough.material);
    this.neck.visible = false;
    this.neck.raycast = () => undefined;
  }

  enter(): void {
    const d = this.deps;
    d.tools.use(d.tools.right.root, this.neck);
    const mid = this.home.clone().lerp(this.tray.group.position, 0.5);
    d.view(mid.clone().add(new THREE.Vector3(0, 0.6, 0.6)), mid.clone().add(new THREE.Vector3(0, 0, -0.05)));
  }

  help(): string {
    return t('mg.pull.help', { n: this.placed, total: this.count });
  }

  private doughRadius(): number {
    return 0.16 * this.dough.mesh.scale.x;
  }

  update(dt: number, io: MinigameIO): boolean {
    const d = this.deps;
    const p = benchPoint(io, d.planeY, this.p);
    const hand = d.tools.right;
    let handY = d.planeY + 0.05;
    let grip = 0.1;
    const press = 0;
    // Fingertips sit at the pinch, so the hand rides just behind (toward the viewer).
    let handTarget: THREE.Vector3 | null = null;
    if (p) {
      const dist = Math.hypot(p.x - this.home.x, p.z - this.home.z);
      if (this.state === 'idle' && io.pressed && dist < this.doughRadius() + 0.04 && this.pieces.length < this.count) {
        this.state = 'grab';
        this.weight = 0;
        // Grab point on the dough rim facing the hand.
        const dir = new THREE.Vector3(p.x - this.home.x, 0, p.z - this.home.z);
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
        dir.normalize();
        this.grabPoint.copy(this.home).addScaledVector(dir, this.doughRadius() * 0.8);
        const piece = new Bread(d.breads, 'roll', d.rng() * 10 + this.taken, 'bun');
        piece.shaped = 0.1;
        piece.baseScale.setScalar(0.01);
        piece.apply();
        d.scene.add(piece.mesh);
        this.piece = piece;
        d.sfx('knead_3', 0.6);
      }
      if (this.state === 'grab' && this.piece) {
        if (io.down) {
          // The longer you hold, the bigger the handful you pinch off.
          this.weight = Math.min(115, this.weight + dt * (38 + this.weight * 0.55));
          const s = Math.cbrt(Math.max(this.weight, 6) / 60);
          this.piece.baseScale.setScalar(s);
          this.piece.apply();
          this.piece.mesh.scale.y *= 0.8;
          const pull = new THREE.Vector3(p.x, d.planeY, p.z);
          this.piece.mesh.position.copy(this.grabPoint).lerp(pull, 0.85);
          const remain = Math.max(0.3, 1 - (this.taken + this.weight) / 420);
          this.dough.baseScale.setScalar(Math.cbrt(remain));
          this.dough.apply();
          // Taffy neck between dough and the pinched piece.
          const a = this.grabPoint.clone().setY(d.planeY + 0.04);
          const b = this.piece.mesh.position.clone().setY(d.planeY + 0.035);
          const len = a.distanceTo(b);
          this.neck.visible = len > 0.03;
          this.neck.position.copy(a).lerp(b, 0.5);
          this.neck.scale.set(0.022 * s * (1 - Math.min(0.7, len * 4)), len, 0.022 * s * (1 - Math.min(0.7, len * 4)));
          this.neck.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
          grip = 0.8;
          handY = d.planeY + 0.05 * s + 0.02;
          handTarget = this.piece.mesh.position.clone().setY(handY).add(new THREE.Vector3(0, 0, 0.1));
          d.hud.label('weight', b.clone().add(new THREE.Vector3(0.06, 0.2, 0.08)), io.camera, `${Math.round(this.weight)}g`);
          if (len > 0.13) this.tear(io);
        } else {
          // Let go before tearing: the piece melts back into the dough.
          this.piece.mesh.removeFromParent();
          this.piece.dispose();
          this.piece = null;
          this.neck.visible = false;
          this.state = 'idle';
          this.dough.baseScale.setScalar(Math.cbrt(Math.max(0.3, 1 - this.taken / 420)));
          this.dough.apply();
        }
      } else if (this.state === 'carry' && this.piece) {
        this.piece.mesh.position.set(p.x, d.planeY + 0.02, p.z - 0.05);
        grip = 0.75;
        handY = d.planeY + 0.07;
        handTarget = new THREE.Vector3(p.x, handY, p.z + 0.06);
        d.hud.label('weight', this.piece.mesh.position.clone().add(new THREE.Vector3(0.06, 0.2, 0.1)), io.camera, `${Math.round(this.weight)}g`);
        if (io.released || !io.down) this.drop();
      }
      hand.root.position.lerp(handTarget ?? new THREE.Vector3(p.x, handY, p.z + 0.05), Math.min(1, dt * 22));
    }
    if (this.state === 'fly' && this.piece) {
      this.flyT = Math.min(1, this.flyT + dt / 0.3);
      const e = this.flyT;
      this.piece.mesh.position.lerpVectors(this.flyFrom, this.flyTo, e);
      this.piece.mesh.position.y += Math.sin(e * Math.PI) * 0.06;
      if (this.flyT >= 1) this.land(io);
    }
    hand.root.rotation.set(0.2, -0.15, 0);
    BenchTools.pose(hand, press, grip);
    if (this.placed >= this.count && this.state === 'idle') {
      this.score = this.scores.reduce((a, b) => a + b, 0) / this.scores.length;
      return true;
    }
    return false;
  }

  private tear(io: MinigameIO): void {
    const d = this.deps;
    this.state = 'carry';
    this.neck.visible = false;
    this.taken += this.weight;
    d.sfx('scraper_cut', 0.7);
    d.vfx.flourPuff(this.grabPoint.clone().setY(d.planeY + 0.05), 10);
    const s = Math.max(0, 1 - Math.abs(this.weight - 60) / 30);
    this.scores.push(s);
    pop(d, io, this.piece!.mesh.position.clone().add(new THREE.Vector3(-0.08, 0.22, 0)), `${Math.round(this.weight)}g ${s > 0.85 ? t('pop.perfect') : s > 0.5 ? t('pop.ok') : t('pop.oops')}`, s > 0.85 ? 'great' : s > 0.5 ? 'good' : 'meh');
  }

  private drop(): void {
    // Lands in the nearest free slot on the tray.
    const used = new Set(this.pieces.map((_, i) => i));
    let best = -1;
    let bestD = Infinity;
    this.tray.slots.forEach((s, i) => {
      if (used.has(i)) return;
      const w = this.tray.group.localToWorld(s.clone());
      const dd = w.distanceTo(this.piece!.mesh.position);
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    });
    this.flySlot = best;
    this.flyFrom.copy(this.piece!.mesh.position);
    this.flyTo.copy(this.tray.group.localToWorld(this.tray.slots[this.pieces.length].clone()));
    this.flyT = 0;
    this.state = 'fly';
  }

  private land(io: MinigameIO): void {
    const d = this.deps;
    const piece = this.piece!;
    this.piece = null;
    piece.mesh.removeFromParent();
    this.tray.add(piece);
    piece.apply();
    this.pieces.push(piece);
    this.placed++;
    this.state = 'idle';
    d.sfx('dough_plop', 0.8);
    d.vfx.flourPuff(this.flyTo.clone().add(new THREE.Vector3(0, 0.03, 0)), 5);
    void io;
    void this.flySlot;
  }

  dispose(): void {
    this.neck.removeFromParent();
    this.deps.tools.clear();
  }
}

// ---------------------------------------------------------------- 3. Round

export class RoundTactileGame implements Minigame {
  readonly title = t('mg.round.title');
  readonly hideCursor = true;
  score = 0;
  private index = 0;
  private angle = 0;
  private lastA: number | null = null;
  private timer = 0;
  private readonly times: number[] = [];
  private readonly p = new THREE.Vector3();

  constructor(
    private readonly deps: TactileDeps,
    private readonly tray: Tray,
  ) {}

  enter(): void {
    const d = this.deps;
    d.tools.use(d.tools.right.root);
    const c = this.tray.group.position;
    d.view(c.clone().add(new THREE.Vector3(0, 0.48, 0.46)), c.clone().add(new THREE.Vector3(0, 0, -0.04)));
  }

  help(): string {
    return t('mg.round.help', { n: this.index });
  }

  update(dt: number, io: MinigameIO): boolean {
    const d = this.deps;
    const piece = this.tray.breads[this.index];
    if (!piece) return true;
    this.timer += dt;
    const slot = this.tray.group.localToWorld(this.tray.slots[this.index].clone());
    const center = toScreen(slot.clone().setY(slot.y + 0.03), io);
    const dx = io.cursor.x - center.x;
    const dy = io.cursor.y - center.y;
    const dist = Math.hypot(dx, dy);
    let dA = 0;
    if (dist > 10 && dist < 240) {
      const a = Math.atan2(dy, dx);
      if (this.lastA !== null) {
        dA = a - this.lastA;
        if (dA > Math.PI) dA -= Math.PI * 2;
        if (dA < -Math.PI) dA += Math.PI * 2;
        this.angle += Math.abs(dA);
        if (Math.floor((this.angle - Math.abs(dA)) / Math.PI) !== Math.floor(this.angle / Math.PI)) d.sfx('roll_shape', 0.5);
      }
      this.lastA = a;
    } else this.lastA = null;
    const progress = Math.min(1, this.angle / (Math.PI * 4));
    // Cupped hand follows the cursor in a small circle over the piece; the piece rolls under it.
    const p = benchPoint(io, d.planeY, this.p);
    const offset = new THREE.Vector3();
    if (p) offset.set(p.x - slot.x, 0, p.z - slot.z).clampLength(0, 0.035);
    piece.shaped = 0.15 + 0.85 * progress;
    piece.apply();
    const wob = Math.sin(progress * Math.PI * 10) * 0.08 * (1 - progress);
    piece.mesh.scale.x *= 1 + wob;
    piece.mesh.scale.z *= 1 - wob;
    piece.mesh.rotation.y += dA * 0.9;
    piece.mesh.position.copy(this.tray.slots[this.index]).add(new THREE.Vector3(offset.x * 0.45, 0, offset.z * 0.45));
    const hand = d.tools.right;
    const top = surfaceY(piece.mesh, slot.x + offset.x * 0.45, slot.z + offset.z * 0.45, d.planeY + 0.05);
    hand.root.position.lerp(new THREE.Vector3(slot.x + offset.x, top + 0.012, slot.z + offset.z + 0.01), Math.min(1, dt * 24));
    hand.root.rotation.set(0.1, Math.atan2(offset.x, offset.z) * 0.3, 0);
    BenchTools.pose(hand, 0.5, 0.55);
    if (progress >= 1) {
      this.times.push(this.timer);
      d.sfx('dough_plop', 0.5);
      pop(d, io, slot.clone().add(new THREE.Vector3(0, 0.12, 0)), t('pop.round'), this.timer < 3.5 ? 'great' : 'good');
      piece.mesh.position.copy(this.tray.slots[this.index]);
      this.index++;
      this.angle = 0;
      this.lastA = null;
      this.timer = 0;
      if (this.index >= this.tray.breads.length) {
        const avg = this.times.reduce((a, b) => a + b, 0) / this.times.length;
        this.score = THREE.MathUtils.clamp(1.12 - avg * 0.07, 0.55, 1);
        return true;
      }
    }
    return false;
  }

  dispose(): void {
    this.deps.tools.clear();
  }
}

// ---------------------------------------------------------------- 4. Score (knife)

export class ScoreGame implements Minigame {
  readonly title = t('mg.score.title');
  readonly hideCursor = true;
  score = 0;
  private caches: PaintCache[] = [];
  private readonly cut: number[];
  private cutting = false;
  private last: THREE.Vector3 | null = null;
  private strokeHits = new Set<number>();
  private readonly p = new THREE.Vector3();

  constructor(
    private readonly deps: TactileDeps,
    private readonly tray: Tray,
  ) {
    this.cut = tray.breads.map(() => 0);
  }

  enter(): void {
    const d = this.deps;
    d.tools.use(d.tools.knife);
    const c = this.tray.group.position;
    d.view(c.clone().add(new THREE.Vector3(0, 0.5, 0.42)), c.clone().add(new THREE.Vector3(0, 0, -0.04)));
    this.caches = this.tray.breads.map((b) => paintCache(b));
  }

  help(): string {
    return t('mg.score.help', { n: this.cut.filter((c) => c > 0.25).length, total: this.cut.length });
  }

  update(dt: number, io: MinigameIO): boolean {
    const d = this.deps;
    if (io.input.pressed('Space') || io.input.pressed('Enter')) return this.finish();
    const tp = toolPoint(io, this.caches.map((c) => c.bread.mesh), d.planeY, this.p);
    if (!tp) return false;
    const p = tp.point;
    // Knife rides the bun surface under the cursor so the blade visibly bites in.
    const topY = tp.onBread ? p.y : d.planeY + 0.01;
    const knife = d.tools.knife;
    knife.position.lerp(new THREE.Vector3(p.x, topY + (io.down ? -0.008 : 0.03), p.z), Math.min(1, dt * 30));
    if (io.pressed) {
      this.cutting = true;
      this.last = p.clone();
      this.strokeHits.clear();
    }
    if (this.cutting && io.down && this.last) {
      const a = this.last;
      if (a.distanceTo(p) > 0.002) {
        this.caches.forEach((c, bi) => {
          const attr = c.bread.scoreAttr;
          let hit = 0;
          for (let i = 0; i < attr.count; i++) {
            if (!c.top[i]) continue;
            const d2 = distToSegment2(c.world[i * 3], c.world[i * 3 + 2], a.x, a.z, p.x, p.z);
            if (d2 < 0.0075 * 0.0075) {
              const v = 1 - Math.sqrt(d2) / 0.0075;
              if (v > attr.getX(i)) {
                attr.setX(i, Math.max(attr.getX(i), v));
                hit++;
              }
            }
          }
          if (hit) {
            attr.needsUpdate = true;
            this.cut[bi] = Math.min(1, this.cut[bi] + hit / (c.topCount * 0.12));
            if (!this.strokeHits.has(bi)) {
              this.strokeHits.add(bi);
              d.sfx('scraper_cut', 0.45);
            }
          }
        });
        this.last.copy(p);
      }
    }
    if (io.released) {
      this.cutting = false;
      if (this.strokeHits.size) pop(d, io, p.clone().add(new THREE.Vector3(0, 0.1, 0)), t('pop.slash'), 'good');
    }
    if (this.cut.every((c) => c > 0.6)) return this.finish();
    return false;
  }

  private finish(): boolean {
    this.score = this.cut.reduce((a, c) => a + Math.min(1, c / 0.6), 0) / this.cut.length;
    for (const b of this.tray.breads) b.scored = this.score;
    return true;
  }

  dispose(): void {
    this.deps.tools.clear();
  }
}

// ---------------------------------------------------------------- 5. Egg wash (brush)

export class GlazePaintGame implements Minigame {
  readonly title = t('mg.glaze.title');
  readonly hideCursor = true;
  score = 0;
  private caches: PaintCache[] = [];
  private coverage: number[] = [];
  private brushTimer = 0;
  private readonly p = new THREE.Vector3();

  constructor(
    private readonly deps: TactileDeps,
    private readonly tray: Tray,
  ) {}

  enter(): void {
    const d = this.deps;
    d.tools.use(d.tools.brush);
    const c = this.tray.group.position;
    d.view(c.clone().add(new THREE.Vector3(0, 0.5, 0.42)), c.clone().add(new THREE.Vector3(0, 0, -0.04)));
    this.caches = this.tray.breads.map((b) => paintCache(b));
    this.coverage = this.caches.map(() => 0);
  }

  help(): string {
    const avg = this.coverage.reduce((a, b) => a + b, 0) / Math.max(1, this.coverage.length);
    return t('mg.glaze.help2', { pct: Math.round(avg * 100) });
  }

  update(dt: number, io: MinigameIO): boolean {
    const d = this.deps;
    if (io.input.pressed('Space') || io.input.pressed('Enter')) return this.finish();
    const tp = toolPoint(io, this.caches.map((c) => c.bread.mesh), d.planeY, this.p);
    if (!tp) return false;
    const p = tp.point;
    const topY = tp.onBread ? p.y : d.planeY + 0.005;
    const brush = d.tools.brush;
    brush.position.lerp(new THREE.Vector3(p.x, topY + (io.down ? -0.004 : 0.03), p.z), Math.min(1, dt * 26));
    // Bristles splay when pressed and drag behind the stroke.
    const splay = io.down ? 1.45 : 1;
    d.tools.bristles.scale.set(splay, 1 / Math.sqrt(splay), splay);
    if (io.down) {
      const moving = Math.abs(io.input.mouseDX) + Math.abs(io.input.mouseDY) > 0.3 || !io.input.locked;
      const rate = (moving ? 5 : 1.2) * dt;
      const r2 = 0.032 * 0.032;
      this.caches.forEach((c, bi) => {
        const attr = c.bread.glazeAttr;
        let changed = false;
        let covered = 0;
        for (let i = 0; i < attr.count; i++) {
          const dx = c.world[i * 3] - p.x;
          const dz = c.world[i * 3 + 2] - p.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < r2 && c.world[i * 3 + 1] > d.planeY + 0.012) {
            const g = Math.min(1, attr.getX(i) + rate * (1 - d2 / r2));
            if (g !== attr.getX(i)) {
              attr.setX(i, g);
              changed = true;
            }
          }
          if (c.top[i] && attr.getX(i) > 0.5) covered++;
        }
        if (changed) {
          attr.needsUpdate = true;
          this.coverage[bi] = covered / c.topCount;
        }
      });
      this.brushTimer -= dt;
      if (moving && this.brushTimer <= 0) {
        d.sfx('brush_glaze', 0.35);
        this.brushTimer = 0.22;
      }
    }
    const avg = this.coverage.reduce((a, b) => a + b, 0) / this.coverage.length;
    if (avg > 0.9) return this.finish();
    return false;
  }

  private finish(): boolean {
    this.score = Math.min(1, this.coverage.reduce((a, b) => a + b, 0) / this.coverage.length / 0.85);
    return true;
  }

  dispose(): void {
    this.deps.tools.clear();
  }
}
