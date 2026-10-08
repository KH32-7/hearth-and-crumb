import * as THREE from 'three';
import { NO_OUTLINE_LAYER } from '../render/RenderPipeline';
import { heldObject, type Held } from './Items';

export interface Interactable {
  id: string;
  /** Raycast roots; any descendant hit selects this interactable. */
  roots: THREE.Object3D[];
  /** Meshes that get the cream hover hull (defaults to all meshes under roots, capped). */
  highlight?: THREE.Object3D[];
  prompt(held: Held): string | null;
  interact(held: Held): void;
  /** Optional right-click action. */
  secondaryPrompt?(held: Held): string | null;
  secondary?(held: Held): void;
  /** Disabled interactables are skipped by the ray. */
  enabled?(): boolean;
}

const REACH = 2.3;

/**
 * Centre-screen ray → hovered interactable, hover hull outline, and the
 * held-item socket that rides with the camera.
 */
export class Interaction {
  hovered: Interactable | null = null;
  /** World point the centre ray hit on the hovered interactable. */
  readonly hitPoint = new THREE.Vector3();
  held: Held = null;
  private readonly list: Interactable[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly hullCache = new Map<THREE.Mesh, THREE.Mesh>();
  private readonly hullMaterial: THREE.ShaderMaterial;
  private activeHulls: THREE.Mesh[] = [];
  readonly socket = new THREE.Group();
  private sway = new THREE.Vector2();
  private time = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.raycaster.far = REACH;
    this.raycaster.layers.set(0);
    this.socket.position.set(0.22, -0.26, -0.52);
    camera.add(this.socket);
    this.hullMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uColor: { value: new THREE.Color('#fff6dc') }, uWidth: { value: 0.006 }, uPulse: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uWidth;
        uniform float uPulse;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * normal);
          float w = uWidth * (1.0 + 0.35 * uPulse) * max(1.0, -mv.z * 0.6);
          mv.xyz += n * w;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        void main() { gl_FragColor = vec4(uColor * 1.6, 1.0); }`,
    });
  }

  register(i: Interactable): void {
    this.list.push(i);
  }

  unregister(i: Interactable): void {
    const idx = this.list.indexOf(i);
    if (idx >= 0) this.list.splice(idx, 1);
    if (this.hovered === i) this.setHover(null);
  }

  setHeld(h: Held): void {
    const prev = heldObject(this.held);
    if (prev && prev.parent === this.socket) this.socket.remove(prev);
    this.held = h;
    const obj = heldObject(h);
    if (obj) {
      obj.position.set(0, 0, 0);
      obj.rotation.set(0, 0, 0);
      if (h?.kind === 'tray') {
        obj.position.set(-0.18, -0.02, -0.12);
        obj.rotation.set(0.35, 0.15, 0);
      } else if (h?.kind === 'dough') {
        obj.position.set(-0.05, -0.02, -0.05);
      }
      this.socket.add(obj);
    }
  }

  update(dt: number, enabled: boolean, mouseDX: number, mouseDY: number): void {
    this.time += dt;
    // Held-item lag gives weight to whatever we carry.
    this.sway.x += (-mouseDX * 0.0006 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (mouseDY * 0.0006 - this.sway.y) * Math.min(1, dt * 10);
    this.socket.position.set(0.22 + this.sway.x, -0.26 + this.sway.y + Math.sin(this.time * 1.6) * 0.004, -0.52);
    this.hullMaterial.uniforms.uPulse.value = 0.5 + 0.5 * Math.sin(this.time * 4);

    if (!enabled) {
      this.setHover(null);
      return;
    }
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const roots: THREE.Object3D[] = [];
    const owner = new Map<THREE.Object3D, Interactable>();
    for (const i of this.list) {
      if (i.enabled && !i.enabled()) continue;
      for (const r of i.roots) {
        roots.push(r);
        owner.set(r, i);
      }
    }
    const hits = this.raycaster.intersectObjects(roots, true);
    let found: Interactable | null = null;
    for (const h of hits) {
      if (!h.object.visible || h.object.layers.mask === 1 << NO_OUTLINE_LAYER) continue;
      if (heldObject(this.held) && isDescendant(h.object, this.socket)) continue;
      let o: THREE.Object3D | null = h.object;
      while (o && !owner.has(o)) o = o.parent;
      if (o) {
        found = owner.get(o)!;
        this.hitPoint.copy(h.point);
        break;
      }
      break;
    }
    this.setHover(found);
  }

  private setHover(i: Interactable | null): void {
    if (this.hovered === i) return;
    for (const h of this.activeHulls) h.visible = false;
    this.activeHulls = [];
    this.hovered = i;
    if (!i) return;
    const meshes: THREE.Mesh[] = [];
    for (const r of i.highlight ?? i.roots) {
      r.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && meshes.length < 90 && m.layers.mask !== 1 << NO_OUTLINE_LAYER && (m.material as THREE.Material).visible !== false && !isDescendant(m, this.socket)) meshes.push(m);
      });
    }
    for (const m of meshes) {
      let hull = this.hullCache.get(m);
      if (!hull) {
        hull = new THREE.Mesh(m.geometry, this.hullMaterial);
        hull.layers.set(NO_OUTLINE_LAYER);
        hull.raycast = () => undefined;
        hull.frustumCulled = false;
        this.hullCache.set(m, hull);
        m.add(hull);
      }
      hull.visible = true;
      this.activeHulls.push(hull);
    }
  }

  /** Drop cached hulls for meshes that are being destroyed. */
  forget(root: THREE.Object3D): void {
    root.traverse((o) => {
      const hull = this.hullCache.get(o as THREE.Mesh);
      if (hull) {
        hull.removeFromParent();
        this.hullCache.delete(o as THREE.Mesh);
      }
    });
  }
}

function isDescendant(o: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o;
  while (p) {
    if (p === ancestor) return true;
    p = p.parent;
  }
  return false;
}
