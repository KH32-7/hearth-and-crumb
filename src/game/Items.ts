import * as THREE from 'three';
import { Bread, type RecipeId } from './Bread';
import type { PropKit } from '../world/props';

export type IngredientId = 'flour' | 'water' | 'yeast' | 'butter';

/** A sheet tray carrying up to six pieces through proof → bake → display. */
export class Tray {
  readonly group: THREE.Group;
  readonly breads: Bread[] = [];
  readonly slots: THREE.Vector3[];
  recipe: RecipeId = 'roll';
  /** Quality accumulated from minigames (0..1), multiplied with bake quality at sale. */
  craft = 0.8;
  baked = false;

  constructor(kit: PropKit) {
    this.group = kit.sheetTray();
    this.slots = this.group.userData.slots as THREE.Vector3[];
    this.group.userData.tray = this;
  }

  add(bread: Bread): void {
    const slot = this.slots[this.breads.length];
    if (!slot) return;
    this.breads.push(bread);
    bread.mesh.position.copy(slot);
    bread.mesh.rotation.y = this.breads.length * 1.3;
    this.group.add(bread.mesh);
  }

  get proof(): number {
    if (!this.breads.length) return 0;
    return this.breads.reduce((s, b) => s + b.proof, 0) / this.breads.length;
  }

  get bake(): number {
    if (!this.breads.length) return 0;
    return this.breads.reduce((s, b) => s + b.bake, 0) / this.breads.length;
  }

  forEach(fn: (b: Bread) => void): void {
    for (const b of this.breads) {
      fn(b);
      b.apply();
    }
  }

  takeAll(): Bread[] {
    const out = this.breads.splice(0);
    for (const b of out) this.group.remove(b.mesh);
    return out;
  }

  dispose(): void {
    for (const b of this.breads) b.dispose();
    this.group.removeFromParent();
  }
}

export type Held =
  | { kind: 'ingredient'; id: IngredientId; object: THREE.Object3D }
  | { kind: 'dough'; bread: Bread; quality: number }
  | { kind: 'tray'; tray: Tray }
  | null;

export function heldObject(h: Held): THREE.Object3D | null {
  if (!h) return null;
  if (h.kind === 'ingredient') return h.object;
  if (h.kind === 'dough') return h.bread.mesh;
  return h.tray.group;
}

/** Small hand-held ingredient props. */
export function ingredientProp(kit: PropKit, id: IngredientId): THREE.Object3D {
  const m = kit.m;
  const g = new THREE.Group();
  if (id === 'flour') {
    const scoop = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.08, 14, 1, true), m.steel);
    (scoop.material as THREE.Material).side = THREE.DoubleSide;
    const pile = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.flour);
    pile.position.y = 0.035;
    pile.scale.y = 0.6;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), m.walnut);
    handle.rotation.z = Math.PI / 2;
    handle.position.x = 0.11;
    g.add(scoop, pile, handle);
  } else if (id === 'water') {
    const p = kit.pitcher(true);
    p.scale.setScalar(0.9);
    g.add(p);
  } else if (id === 'yeast') {
    g.add(kit.jar('#d8b878', 0.6));
  } else {
    const dish = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.06), kit.mats.flat('#f7dc7a', { spec: 0.6 }));
    g.add(dish);
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false;
  });
  return g;
}
