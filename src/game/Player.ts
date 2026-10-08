import * as THREE from 'three';
import type { Input } from '../core/Input';
import { ROOM } from '../world/BakeryWorld';

const EYE = 1.62;
const RADIUS = 0.26;
const SPEED = 3.4;
const SPRINT = 1.45;
const ACCEL = 24;
const DECEL = 30;

/**
 * First-person baker. Circle-vs-AABB push-out against the world's colliders;
 * camera eases between free look and authored "station views" (minigames,
 * beauty shots) so close-ups feel like Cooking Mama cuts, not teleports.
 */
export class Player {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = -0.2;
  private bobTime = 0;
  private stepAccum = 0;
  onStep: (() => void) | null = null;

  // Station view blending.
  private viewBlend = 0;
  private viewTarget: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  private readonly tmpPos = new THREE.Vector3();
  private readonly freeQuat = new THREE.Quaternion();
  private readonly viewQuat = new THREE.Quaternion();

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly colliders: THREE.Box2[],
  ) {}

  spawn(at: THREE.Vector3, yaw: number, pitch = -0.25): void {
    this.position.set(at.x, 0, at.z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = pitch;
    this.viewBlend = 0;
    this.viewTarget = null;
  }

  get inStationView(): boolean {
    return this.viewTarget !== null;
  }

  enterView(pos: THREE.Vector3, look: THREE.Vector3): void {
    this.viewTarget = { pos: pos.clone(), look: look.clone() };
  }

  exitView(): void {
    this.viewTarget = null;
  }

  update(dt: number, input: Input, canMove: boolean): void {
    if (canMove && !this.viewTarget) {
      const sens = input.sensitivity;
      this.yaw -= input.mouseDX * sens;
      this.pitch -= input.mouseDY * sens * (input.invertY ? -1 : 1);
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.35, 1.2);
    }

    const wish = new THREE.Vector3();
    if (canMove && !this.viewTarget) {
      const f = (input.held('KeyW') || input.held('ArrowUp') ? 1 : 0) - (input.held('KeyS') || input.held('ArrowDown') ? 1 : 0);
      const r = (input.held('KeyD') || input.held('ArrowRight') ? 1 : 0) - (input.held('KeyA') || input.held('ArrowLeft') ? 1 : 0);
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      wish.addScaledVector(fwd, f).addScaledVector(right, r);
      if (wish.lengthSq() > 1) wish.normalize();
      wish.multiplyScalar(SPEED * (input.held('ShiftLeft') || input.held('ShiftRight') ? SPRINT : 1));
    }
    // Snappy start, even snappier stop: no ice-skating.
    const k = 1 - Math.exp(-(wish.lengthSq() > 0 ? ACCEL : DECEL) * dt);
    this.velocity.lerp(wish, k);
    this.position.addScaledVector(this.velocity, dt);
    this.collide();

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.bobTime += dt * speed * 3.4;
    this.stepAccum += speed * dt;
    if (this.stepAccum > 0.72) {
      this.stepAccum = 0;
      this.onStep?.();
    }

    // Free-look camera transform.
    const bob = Math.sin(this.bobTime * 2) * 0.008 * Math.min(1, speed / SPEED);
    this.tmpPos.set(this.position.x, EYE + bob, this.position.z);
    this.freeQuat.setFromEuler(new THREE.Euler(this.pitch, this.yaw, Math.sin(this.bobTime) * 0.004, 'YXZ'));

    // Ease into / out of station view.
    const target = this.viewTarget ? 1 : 0;
    this.viewBlend += (target - this.viewBlend) * (1 - Math.exp(-11 * dt));
    if (Math.abs(this.viewBlend - target) < 0.001) this.viewBlend = target;
    if (this.viewTarget) {
      // Camera convention: looks down -Z.
      this.viewQuat.setFromRotationMatrix(new THREE.Matrix4().lookAt(this.viewTarget.pos, this.viewTarget.look, new THREE.Vector3(0, 1, 0)));
      if (!this.lastView || this.viewBlend < 0.02) this.lastView = { pos: this.viewTarget.pos.clone(), quat: this.viewQuat.clone() };
      else {
        // Re-targeting inside a station view glides instead of cutting.
        const k = 1 - Math.exp(-8 * dt);
        this.lastView.pos.lerp(this.viewTarget.pos, k);
        this.lastView.quat.slerp(this.viewQuat, k);
      }
    }
    const e = easeInOut(this.viewBlend);
    if (this.lastView && e > 0) {
      this.camera.position.lerpVectors(this.tmpPos, this.lastView.pos, e);
      this.camera.quaternion.slerpQuaternions(this.freeQuat, this.lastView.quat, e);
    } else {
      this.camera.position.copy(this.tmpPos);
      this.camera.quaternion.copy(this.freeQuat);
    }
  }

  private lastView: { pos: THREE.Vector3; quat: THREE.Quaternion } | null = null;

  /** Look direction for interaction rays. */
  forward(target: THREE.Vector3): THREE.Vector3 {
    return this.camera.getWorldDirection(target);
  }

  private collide(): void {
    const p = this.position;
    p.x = THREE.MathUtils.clamp(p.x, ROOM.minX + RADIUS, ROOM.maxX - RADIUS);
    p.z = THREE.MathUtils.clamp(p.z, ROOM.minZ + RADIUS, ROOM.maxZ - RADIUS);
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.colliders) {
        const cx = THREE.MathUtils.clamp(p.x, b.min.x, b.max.x);
        const cz = THREE.MathUtils.clamp(p.z, b.min.y, b.max.y);
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < RADIUS * RADIUS) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            p.x = cx + (dx / d) * RADIUS;
            p.z = cz + (dz / d) * RADIUS;
          } else {
            // Centre inside the box: push out along the shallowest axis.
            const left = p.x - b.min.x;
            const right = b.max.x - p.x;
            const down = p.z - b.min.y;
            const up = b.max.y - p.z;
            const m = Math.min(left, right, down, up);
            if (m === left) p.x = b.min.x - RADIUS;
            else if (m === right) p.x = b.max.x + RADIUS;
            else if (m === down) p.z = b.min.y - RADIUS;
            else p.z = b.max.y + RADIUS;
          }
        }
      }
    }
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
