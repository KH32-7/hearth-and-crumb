import * as THREE from 'three';
import { BreadMaterial } from '../render/BreadMaterial';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry } from '../render/Textures';
import { RECIPES, type RecipeId } from './Recipes';
import { finishedGeometry } from './BreadShapes';

export type { RecipeId };
/** roll = pre-scored cross (display/staging) · bun = plain piece the player scores · dough = big batch. */
export type BreadKind = 'roll' | 'bun' | 'dough' | 'baguette' | 'croissant' | 'pretzel';

/** Shared state shaders + geometries for every bread entity. */
export class BreadFactory {
  private readonly geoCache = new Map<string, THREE.BufferGeometry>();
  constructor(
    private readonly gradientMap: THREE.Texture,
    private readonly crust: THREE.Texture,
  ) {}

  geometry(kind: BreadKind, variant: number): THREE.BufferGeometry {
    const key = `${kind}:${variant}`;
    let g = this.geoCache.get(key);
    if (!g) {
      g =
        kind === 'baguette' ? finishedGeometry('log') : kind === 'croissant' || kind === 'pretzel' ? finishedGeometry(kind) : roundGeometry(kind === 'roll', variant, kind === 'dough');
      this.geoCache.set(key, g);
    }
    return g;
  }

  material(seed: number): BreadMaterial {
    return new BreadMaterial(this.gradientMap, this.crust, { seed });
  }
}

/**
 * One bread (or dough piece). Visual state is derived from gameplay values:
 *  proof 0..1.2 (rise), bake 0..1.3 (colour + oven spring), glaze, flour, smooth.
 */
export class Bread {
  readonly mesh: THREE.Mesh;
  readonly material: BreadMaterial;
  proof = 0;
  bake = 0;
  glaze = 0;
  shaped = 1; // 0 lumpy offcut … 1 perfectly rounded
  scored = 0; // 0 no cut … 1 neatly scored by the player
  recipe: RecipeId;
  baseScale = new THREE.Vector3(1, 1, 1);

  constructor(factory: BreadFactory, recipe: RecipeId, seed: number, kind: BreadKind = 'roll') {
    this.recipe = recipe;
    this.material = factory.material(seed);
    this.material.look.tint.set(RECIPES[recipe].tint);
    this.mesh = new THREE.Mesh(factory.geometry(kind, Math.floor(seed * 7) % 4), this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.bread = this;
    this.apply();
  }

  apply(): void {
    const p = THREE.MathUtils.clamp(this.proof, 0, 1.25);
    // Oven spring: most of the rise happens early in the bake, then the crust sets.
    const springT = THREE.MathUtils.smoothstep(this.bake, 0.05, 0.6);
    const spring = springT * 0.3 * THREE.MathUtils.clamp(0.6 + p * 0.4, 0, 1);
    const over = Math.max(0, this.proof - 1) * 0.6; // over-proofed slumps sideways
    const sx = (0.82 + 0.25 * p + over * 0.3 + springT * 0.07) * (0.9 + 0.1 * this.shaped);
    const sy = (0.7 + 0.32 * p - over * 0.25 + spring) * (0.85 + 0.15 * this.shaped);
    this.mesh.scale.set(sx * this.baseScale.x, sy * this.baseScale.y, sx * this.baseScale.z);
    const look = this.material.look;
    look.bake = this.bake;
    look.glaze = this.glaze;
    look.smooth = 0.4 + 0.6 * this.shaped;
    look.bloom = springT;
    look.flour = Math.min(1, THREE.MathUtils.lerp(0.75, 0.3, this.shaped) * RECIPES[this.recipe].flour);
    this.material.sync();
  }

  private ownsGeometry = false;

  /** Give this bread its own geometry so score / glaze can be painted per vertex. */
  makePaintable(): void {
    if (this.ownsGeometry) return;
    this.mesh.geometry = this.mesh.geometry.clone();
    this.ownsGeometry = true;
  }

  /** Swap in a hand-shaped geometry this bread owns (rope, croissant sheet…). */
  setGeometry(g: THREE.BufferGeometry): void {
    if (this.ownsGeometry) this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    this.ownsGeometry = true;
  }

  get scoreAttr(): THREE.BufferAttribute {
    return this.mesh.geometry.attributes.aScore as THREE.BufferAttribute;
  }

  get glazeAttr(): THREE.BufferAttribute {
    return this.mesh.geometry.attributes.aGlaze as THREE.BufferAttribute;
  }

  dispose(): void {
    this.material.dispose();
    if (this.ownsGeometry) this.mesh.geometry.dispose();
  }
}

/** Score quality → 0 raw … 1 perfect … 0 burnt (peak around bake 1.0). */
export function bakeQuality(bake: number): number {
  if (bake < 1) return THREE.MathUtils.clamp((bake - 0.55) / 0.42, 0, 1) ** 1.2;
  return THREE.MathUtils.clamp(1 - (bake - 1.04) / 0.2, 0, 1);
}

export function bakeLabel(bake: number): 'raw' | 'pale' | 'golden' | 'perfect' | 'dark' | 'burnt' {
  if (bake < 0.45) return 'raw';
  if (bake < 0.82) return 'pale';
  if (bake < 0.94) return 'golden';
  if (bake <= 1.08) return 'perfect';
  if (bake <= 1.18) return 'dark';
  return 'burnt';
}

// ---------------- geometry ----------------

function roundGeometry(scored: boolean, variant: number, big: boolean): THREE.BufferGeometry {
  const rand = mulberry(100 + variant * 17 + (big ? 999 : 0));
  const g = welded(new THREE.SphereGeometry(1, 44, 30));
  const pos = g.attributes.position as THREE.BufferAttribute;
  const score = new Float32Array(pos.count);
  const phases = Array.from({ length: 6 }, () => rand() * Math.PI * 2);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    // Lumpy organic surface.
    const lump =
      Math.sin(n.x * 3.1 + phases[0]) * Math.sin(n.z * 2.7 + phases[1]) * 0.035 +
      Math.sin(n.y * 4.3 + n.x * 2.0 + phases[2]) * 0.02 +
      Math.sin(n.z * 7.0 + n.y * 5.0 + phases[3]) * (big ? 0.02 : 0.008);
    v.multiplyScalar(1 + lump);
    // Dome top, flat-ish bottom that "sits" on the tray.
    if (v.y > 0) v.y *= big ? 0.74 : 0.82;
    else v.y = v.y * 0.24;
    v.x *= 1 + Math.max(0, -n.y) * 0.08;
    v.z *= 1 + Math.max(0, -n.y) * 0.08;
    let s = 0;
    if (scored) {
      const top = THREE.MathUtils.smoothstep(n.y, 0.45, 0.75);
      // Cross cut, slightly rotated per variant.
      const a = phases[4] * 0.1;
      const cx = Math.abs(n.x * Math.cos(a) - n.z * Math.sin(a));
      const cz = Math.abs(n.x * Math.sin(a) + n.z * Math.cos(a));
      const d = Math.min(cx, cz);
      s = (1 - THREE.MathUtils.smoothstep(d, 0.025, 0.1)) * top * (1 - THREE.MathUtils.smoothstep(Math.max(cx, cz), 0.45, 0.6));
    }
    score[i] = s;
    pos.setXYZ(i, v.x, v.y + 0.24, v.z);
  }
  g.setAttribute('aScore', new THREE.BufferAttribute(score, 1));
  g.setAttribute('aGlaze', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
  g.computeVertexNormals();
  const r = big ? 0.16 : 0.062;
  g.scale(r, r, r);
  return g;
}

/** Drop UVs/normals and weld the seam so lighting and ink lines have no crease. */
function welded(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  return mergeVertices(geo, 1e-4);
}
