import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Ctx } from './Stations';
import type { DisplayBasket } from './Stations';
import { PRICES } from './State';
import { t, won } from '../ui/i18n';
import type { RecipeId } from './Bread';
import { batchStatic } from '../render/StaticBatcher';

type Phase = 'enter' | 'browse' | 'pick' | 'toQueue' | 'queue' | 'paid' | 'leave' | 'gone';

const WALK = 1.05;

const OUTFITS = [
  { coat: '#b5553a', skin: '#f1c9a5', hair: '#4a2e22', hat: '#e9b95c' },
  { coat: '#7c8a4a', skin: '#e8b48c', hair: '#2b1c16', hat: null },
  { coat: '#5f7fa8', skin: '#f6d2b4', hair: '#c47a3a', hat: '#f3e3c3' },
  { coat: '#d9a441', skin: '#c98e66', hair: '#3a2a20', hat: null },
  { coat: '#8a5a7a', skin: '#f1c9a5', hair: '#7a4a2a', hat: '#b5553a' },
  { coat: '#3f6b5c', skin: '#e3b08c', hair: '#e2c27a', hat: null },
];

/**
 * Storybook townsfolk. Procedural chibi figures for now (rounded body, big head,
 * swinging legs/arms); the Customer interface stays the same when generated
 * rigged models replace the visual.
 */
export class Customer {
  readonly group = new THREE.Group();
  phase: Phase = 'enter';
  private path: THREE.Vector3[] = [];
  private walkT = 0;
  wait = 0;
  patience: number;
  want: RecipeId | null = null;
  basket: DisplayBasket | null = null;
  bought: { recipe: RecipeId; quality: number } | null = null;
  queueIndex = -1;
  private readonly legs: THREE.Object3D[] = [];
  private readonly arms: THREE.Object3D[] = [];
  private readonly body: THREE.Object3D;
  private readonly bag: THREE.Object3D;
  private readonly bubble: THREE.Sprite;
  private bubbleKind = '';
  private bob = 0;

  constructor(ctx: Ctx, seed: number, private readonly bubbleTextures: Record<string, THREE.Texture>) {
    const o = OUTFITS[Math.floor(seed * OUTFITS.length) % OUTFITS.length];
    const M = ctx.mats;
    const coat = M.flat(o.coat);
    const skin = M.flat(o.skin, { rim: 0.3 });
    const hair = M.flat(o.hair);
    const dark = M.flat('#3a2a24');
    const scale = 0.92 + seed * 0.16;

    this.body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.32, 6, 14), coat);
    torso.position.y = 0.78;
    torso.scale.set(1, 1, 0.82);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.27, 0.32, 16), coat);
    skirt.position.y = 0.58;
    const apron = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.34, 0.03, 2, 0.01), M.flat('#f3e9d6'));
    apron.position.set(0, 0.7, 0.17);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), skin);
    head.position.y = 1.27;
    head.scale.set(1, 0.95, 0.95);
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    hairCap.position.set(0, 1.29, -0.015);
    hairCap.rotation.x = -0.25;
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), hair);
    bun.position.set(0, 1.36, -0.17);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), dark);
      eye.position.set(s * 0.07, 1.27, 0.18);
      eye.scale.set(1, 1.3, 0.6);
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), M.flat('#f0a08a'));
      cheek.position.set(s * 0.11, 1.22, 0.172);
      cheek.lookAt(cheek.position.clone().multiplyScalar(2).setY(1.22));
      this.body.add(eye, cheek);
    }
    this.body.add(torso, skirt, apron, head, hairCap, bun);
    if (o.hat) {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 20), M.flat(o.hat));
      brim.position.y = 1.41;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.12, 18), M.flat(o.hat));
      crown.position.y = 1.47;
      this.body.add(brim, crown);
    }
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(s * 0.08, 0.44, 0);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.26, 4, 8), dark);
      shin.position.y = -0.2;
      const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), M.flat('#5a3a2a'));
      shoe.scale.set(1, 0.6, 1.4);
      shoe.position.set(0, -0.4, 0.03);
      leg.add(shin, shoe);
      this.legs.push(leg);
      const arm = new THREE.Group();
      arm.position.set(s * 0.24, 0.98, 0);
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.26, 4, 8), coat);
      sleeve.position.y = -0.16;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin);
      hand.position.y = -0.33;
      arm.add(sleeve, hand);
      arm.rotation.z = s * 0.12;
      this.arms.push(arm);
      this.body.add(leg, arm);
    }
    // Paper bag carried after buying.
    this.bag = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.09), ctx.kit.m.kraft);
    this.bag.position.set(0, -0.38, 0.06);
    this.bag.visible = false;
    this.arms[1].add(this.bag);
    // Merge the rigid body into one draw; limbs stay separate for the walk cycle.
    batchStatic(this.body, [...this.legs, ...this.arms]);
    for (const limb of [...this.legs, ...this.arms]) batchStatic(limb, [this.bag]);
    this.body.scale.setScalar(scale);
    this.group.add(this.body);
    this.group.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = true;
    });
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTextures.heart, depthTest: true, transparent: true }));
    this.bubble.scale.set(0.32, 0.32, 1);
    this.bubble.position.y = 1.85 * scale;
    this.bubble.visible = false;
    this.bubble.layers.set(1);
    this.group.add(this.bubble);
    this.patience = 50 + seed * 25;
  }

  walkTo(points: THREE.Vector3[]): void {
    this.path = points.map((p) => p.clone());
  }

  get arrived(): boolean {
    return this.path.length === 0;
  }

  showBubble(kind: string | null): void {
    if (kind === this.bubbleKind) return;
    this.bubbleKind = kind ?? '';
    this.bubble.visible = !!kind;
    if (kind) {
      this.bubble.material.map = this.bubbleTextures[kind];
      this.bubble.material.needsUpdate = true;
    }
  }

  carryBag(): void {
    this.bag.visible = true;
  }

  update(dt: number, faceTarget: THREE.Vector3 | null): void {
    const pos = this.group.position;
    let moving = false;
    if (this.path.length) {
      const target = this.path[0];
      const d = new THREE.Vector3(target.x - pos.x, 0, target.z - pos.z);
      const len = d.length();
      if (len < 0.05) this.path.shift();
      else {
        moving = true;
        d.multiplyScalar(Math.min(len, WALK * dt) / len);
        pos.add(d);
        const yaw = Math.atan2(d.x, d.z);
        this.group.rotation.y = lerpAngle(this.group.rotation.y, yaw, Math.min(1, dt * 8));
      }
    } else if (faceTarget) {
      const yaw = Math.atan2(faceTarget.x - pos.x, faceTarget.z - pos.z);
      this.group.rotation.y = lerpAngle(this.group.rotation.y, yaw, Math.min(1, dt * 4));
    }
    this.walkT += dt * (moving ? 7.5 : 0);
    const swing = moving ? Math.sin(this.walkT) * 0.55 : 0;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing * 0.6;
    this.arms[1].rotation.x = this.bag.visible ? 0.1 : swing * 0.6;
    this.bob += dt;
    this.body.position.y = moving ? Math.abs(Math.sin(this.walkT)) * 0.035 : Math.sin(this.bob * 2) * 0.006;
    this.bubble.position.y = 1.9 + Math.sin(this.bob * 3) * 0.03;
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Spawning, browsing, queueing, paying. */
export class CustomerManager {
  readonly customers: Customer[] = [];
  // The player opens the shop when ready; the first guest follows shortly after.
  private spawnTimer = 8;
  private readonly bubbles: Record<string, THREE.Texture>;

  constructor(
    private readonly ctx: Ctx,
    private readonly baskets: DisplayBasket[],
  ) {
    this.bubbles = {
      heart: bubbleTexture('♥', '#d9534a'),
      think: bubbleTexture('?', '#6b4a3a'),
      bread: bubbleTexture('🥐', '#e9b95c'),
      coin: bubbleTexture('₩', '#c8761a'),
      sad: bubbleTexture('…', '#6b4a3a'),
      hurry: bubbleTexture('!', '#b5553a'),
    };
  }

  get queue(): Customer[] {
    return this.customers.filter((c) => c.phase === 'queue').sort((a, b) => a.queueIndex - b.queueIndex);
  }

  canServe(): boolean {
    const front = this.queue[0];
    return !!front && front.arrived && front.queueIndex === 0;
  }

  serveFront(): void {
    const front = this.queue[0];
    if (!front || !front.bought) return;
    const ctx = this.ctx;
    const price = PRICES[front.bought.recipe];
    const q = front.bought.quality;
    const paid = Math.round((price * (0.6 + 0.4 * q)) / 10) * 10;
    const patienceLeft = Math.max(0, 1 - front.wait / front.patience);
    const tip = q > 0.8 && patienceLeft > 0.4 ? Math.round((price * 0.2 * q * patienceLeft) / 10) * 10 : 0;
    ctx.state.money += paid + tip;
    ctx.state.stats.sold += 1;
    ctx.state.stats.revenue += paid;
    ctx.state.stats.tips += tip;
    ctx.state.stats.qualitySum += q;
    ctx.state.totalSold += 1;
    const happy = q > 0.55 && patienceLeft > 0.15;
    if (happy) ctx.state.stats.happy += 1;
    ctx.state.reputation = THREE.MathUtils.clamp(ctx.state.reputation + (happy ? 0.04 + q * 0.04 : -0.08), 0.5, 5);
    ctx.events.emit('toast', { text: t('toast.sold', { name: t(`recipe.${front.bought.recipe}` as 'recipe.roll'), price: won(paid) }), tone: 'money' });
    if (tip) ctx.events.emit('toast', { text: t('toast.tip', { tip: won(tip) }), tone: 'money' });
    ctx.events.emit('sold', { recipe: front.bought.recipe, price: paid, quality: q });
    ctx.sfx('register');
    ctx.vfx.coins(front.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
    front.carryBag();
    front.showBubble(happy ? 'heart' : 'sad');
    front.phase = 'paid';
    front.wait = 0;
    this.reindexQueue();
    ctx.events.emit('tutorial', { step: 'sold' });
  }

  update(dt: number): void {
    const ctx = this.ctx;
    const a = ctx.world.anchors;
    const state = ctx.state;
    if (state.open) {
      this.spawnTimer -= dt;
      const crowd = this.customers.filter((c) => c.phase !== 'gone').length;
      if (this.spawnTimer <= 0 && crowd < 5) {
        this.spawn();
        const base = 34 - state.reputation * 3.2;
        this.spawnTimer = base * (0.7 + ctx.rng() * 0.6);
      }
    }
    for (const c of this.customers) {
      c.wait += dt;
      let face: THREE.Vector3 | null = null;
      switch (c.phase) {
        case 'enter':
          if (c.arrived) this.chooseBasket(c);
          break;
        case 'browse':
          face = c.basket ? c.basket.position : null;
          c.showBubble('think');
          if (c.arrived && c.wait > 2.2) {
            const got = c.basket?.takeOne();
            if (got) {
              c.bought = { recipe: got.recipe, quality: got.quality };
              c.showBubble('bread');
              ctx.sfx('paper_bag', 0.5);
              c.phase = 'toQueue';
              c.wait = 0;
              c.queueIndex = this.nextQueueIndex();
              c.walkTo(this.queuePath(c));
            } else if (c.wait > 24) {
              this.leaveSad(c);
            } else this.chooseBasket(c);
          }
          break;
        case 'toQueue':
          if (c.arrived) {
            c.phase = 'queue';
            c.showBubble('coin');
          }
          break;
        case 'queue': {
          face = a.register.position;
          const frac = c.wait / c.patience;
          c.showBubble(frac > 0.7 ? 'hurry' : 'coin');
          if (c.wait > c.patience) {
            // Gives up but leaves the bread back? Keep it simple: walks out unhappy without paying.
            this.leaveSad(c);
            this.reindexQueue();
          }
          break;
        }
        case 'paid':
          if (c.wait > 1.2) {
            c.phase = 'leave';
            c.walkTo([new THREE.Vector3(a.shopDoor.x, 0, 3.4), a.shopDoor.clone().add(new THREE.Vector3(0, 0, 1.5))]);
            ctx.sfx('door_bell', 0.5);
          }
          break;
        case 'leave':
          if (c.wait > 2) c.showBubble(null);
          if (c.arrived) {
            c.phase = 'gone';
            c.group.removeFromParent();
          }
          break;
      }
      c.update(dt, face);
    }
    // Queue shuffles forward.
    for (const c of this.customers) {
      if ((c.phase === 'queue' || c.phase === 'toQueue') && c.arrived) {
        const spot = a.queueSpots[Math.min(c.queueIndex, a.queueSpots.length - 1)];
        if (c.group.position.distanceTo(spot) > 0.1) c.walkTo([spot]);
      }
    }
    for (let i = this.customers.length - 1; i >= 0; i--) if (this.customers[i].phase === 'gone') this.customers.splice(i, 1);
  }

  private spawn(): void {
    const ctx = this.ctx;
    const a = ctx.world.anchors;
    const c = new Customer(ctx, ctx.rng(), this.bubbles);
    c.group.position.copy(a.shopDoor).add(new THREE.Vector3(0, 0, 1.6));
    c.walkTo([a.shopDoor.clone().add(new THREE.Vector3(0, 0, -0.2)), new THREE.Vector3(a.shopDoor.x - 0.4, 0, 3.0)]);
    ctx.scene.add(c.group);
    this.customers.push(c);
    ctx.sfx('door_bell', 0.8);
  }

  private chooseBasket(c: Customer): void {
    const stocked = this.baskets.filter((b) => b.items.length > 0);
    const pick = stocked.length ? stocked[Math.floor(this.ctx.rng() * stocked.length)] : this.baskets[Math.floor(this.ctx.rng() * this.baskets.length)];
    if (c.basket !== pick || c.phase !== 'browse') {
      c.basket = pick;
      const spot = new THREE.Vector3(pick.position.x + (this.ctx.rng() - 0.5) * 0.3, 0, 1.35 + this.ctx.rng() * 0.2);
      c.walkTo([spot]);
      c.phase = 'browse';
      if (stocked.length) c.wait = 0;
    }
  }

  private leaveSad(c: Customer): void {
    const ctx = this.ctx;
    c.phase = 'leave';
    c.queueIndex = -1;
    c.wait = 0;
    c.showBubble('sad');
    c.walkTo([new THREE.Vector3(ctx.world.anchors.shopDoor.x, 0, 3.4), ctx.world.anchors.shopDoor.clone().add(new THREE.Vector3(0, 0, 1.5))]);
    ctx.state.stats.sad += 1;
    ctx.state.reputation = Math.max(0.5, ctx.state.reputation - 0.1);
    ctx.events.emit('toast', { text: t('toast.left'), tone: 'bad' });
  }

  private nextQueueIndex(): number {
    const used = this.customers.filter((c) => c.queueIndex >= 0 && (c.phase === 'queue' || c.phase === 'toQueue')).length;
    return used;
  }

  private reindexQueue(): void {
    const q = this.customers.filter((c) => c.phase === 'queue' || c.phase === 'toQueue').sort((a, b) => a.queueIndex - b.queueIndex);
    q.forEach((c, i) => (c.queueIndex = i));
  }

  private queuePath(c: Customer): THREE.Vector3[] {
    const a = this.ctx.world.anchors;
    const spot = a.queueSpots[Math.min(c.queueIndex, a.queueSpots.length - 1)];
    return [new THREE.Vector3(c.group.position.x, 0, 1.9), spot];
  }

  clear(): void {
    for (const c of this.customers) c.group.removeFromParent();
    this.customers.length = 0;
    this.spawnTimer = 8;
  }
}

function bubbleTexture(symbol: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fbf4e4';
  ctx.strokeStyle = '#3a2219';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(64, 56, 50, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(50, 96);
  ctx.lineTo(64, 122);
  ctx.lineTo(74, 94);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fbf4e4';
  ctx.fillRect(48, 86, 30, 12);
  ctx.fillStyle = color;
  ctx.font = '700 60px "Gaegu", "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, 64, 58);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
