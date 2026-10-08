import * as THREE from 'three';
import { RECIPES, RECIPE_ORDER, type RecipeId } from '../game/Recipes';
import { MaterialLibrary, worldBox, worldPlane, shadowed } from '../render/Materials';
import { NO_OUTLINE_LAYER } from '../render/RenderPipeline';
import { LightingRig } from '../render/LightingRig';
import { CanvasArt } from '../render/CanvasArt';
import { PropKit, scaleUV } from './props';

const RECIPE_NAMES: Record<RecipeId, string> = { roll: '모닝롤', baguette: '바게트', croissant: '크루아상', pretzel: '프레첼' };

/**
 * The bakery: one cozy room split by the display counter.
 *   kitchen  z ∈ [-4, 0]  (player)      shop  z ∈ [0.9, 4]  (customers)
 * Layout mirrors artifacts/concepts/kitchen.png: window + sun on the west wall,
 * shelving/mixer on the back wall, brick dome oven back-right, butcher-block
 * island in the foreground.
 */
export const ROOM = { minX: -4.5, maxX: 4.5, minZ: -4, maxZ: 4, height: 3.1 };
export const KITCHEN_LIMIT_Z = 0.02;
export const COUNTER_TOP = 0.95;

export type WorldAnchors = {
  playerStart: THREE.Vector3;
  workbench: THREE.Object3D;
  mixer: THREE.Group;
  oven: THREE.Group;
  proofer: THREE.Group;
  trayRack: THREE.Object3D;
  register: THREE.Group;
  displaySlots: THREE.Object3D[];
  pantry: { flour: THREE.Object3D; water: THREE.Object3D; yeast: THREE.Object3D; butter: THREE.Object3D };
  bin: THREE.Object3D;
  shopDoor: THREE.Vector3;
  queueSpots: THREE.Vector3[];
  browseSpots: THREE.Vector3[];
  doorPivot: THREE.Group;
  cat: THREE.Vector3;
};

export class BakeryWorld {
  readonly group = new THREE.Group();
  readonly colliders: THREE.Box2[] = [];
  readonly anchors: WorldAnchors;
  readonly art = new CanvasArt();
  private readonly kit: PropKit;
  private readonly flames: THREE.Mesh[] = [];
  readonly shopSignArt = this.art.shopSign();
  openSign!: THREE.Group;
  clock: THREE.Group | null = null;

  constructor(
    private readonly mats: MaterialLibrary,
    readonly lights: LightingRig,
  ) {
    this.kit = new PropKit(mats);
    this.buildShell();
    this.buildOutside();
    this.anchors = this.buildKitchen();
    this.buildShop();
    this.group.add(lights.group);
    void this.art.refreshWhenFontsReady();
  }

  /** Clock hands follow the in-game time (hours as float). */
  setClock(hours: number): void {
    if (!this.clock) return;
    const h = this.clock.getObjectByName('hour');
    const m = this.clock.getObjectByName('minute');
    if (h) h.rotation.z = -((hours % 12) / 12) * Math.PI * 2;
    if (m) m.rotation.z = -((hours % 1) * Math.PI * 2);
  }

  update(dt: number, time: number): void {
    for (const f of this.flames) {
      const ph = f.userData.phase as number;
      const s = 0.85 + 0.25 * Math.sin(time * 9 + ph) + 0.1 * Math.sin(time * 17 + ph * 2);
      f.scale.set(1 - 0.1 * Math.sin(time * 11 + ph), s, 1);
    }
    void dt;
  }

  private add<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number, ry = 0): T {
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    this.group.add(obj);
    return obj;
  }

  private block(minX: number, minZ: number, maxX: number, maxZ: number): void {
    this.colliders.push(new THREE.Box2(new THREE.Vector2(minX, minZ), new THREE.Vector2(maxX, maxZ)));
  }

  // ---------------------------------------------------------------- shell
  private buildShell(): void {
    const m = this.kit.m;
    const { minX, maxX, minZ, maxZ, height } = ROOM;
    const W = maxX - minX;
    const D = maxZ - minZ;

    const floor = new THREE.Mesh(worldPlane(W, D, 2.0), m.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Ceiling planks + beams.
    const ceiling = new THREE.Mesh(worldPlane(W, D, 1.6), this.mats.tex('walnut', '#d9b89a'));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = height;
    this.group.add(ceiling);
    for (let x = minX + 0.9; x < maxX; x += 1.8) {
      const beam = new THREE.Mesh(worldBox(0.2, 0.22, D, 1.2), m.walnut);
      beam.position.set(x, height - 0.11, 0);
      this.group.add(shadowed(beam, false, true));
    }

    // Walls (extruded with openings). Openings are [u0, v0, u1, v1, archRadius?] in wall-local meters.
    const north = this.wall(W, height, []);
    north.position.set(minX, 0, minZ);
    const south = this.wall(W, height, [
      [4.6, 0.55, 7.4, 2.25, 1.4], // arched display window (u runs east → west)
      [1.6, 0, 2.6, 2.3, 0], // door
    ]);
    south.rotation.y = Math.PI;
    south.position.set(maxX, 0, maxZ);
    const west = this.wall(D, height, [[5.0, 0.95, 6.6, 2.35, 0]]); // kitchen window z ∈ [-2.6,-1.0]
    west.rotation.y = Math.PI / 2;
    west.position.set(minX, 0, maxZ);
    const east = this.wall(D, height, []);
    east.rotation.y = -Math.PI / 2;
    east.position.set(maxX, 0, minZ);
    this.group.add(north, south, west, east);

    // Wainscot + chair rail + baseboard on every wall (skips openings).
    this.wainscot(new THREE.Vector3(minX, 0, minZ + 0.001), new THREE.Vector3(1, 0, 0), W, []);
    this.wainscot(new THREE.Vector3(maxX, 0, maxZ - 0.001), new THREE.Vector3(-1, 0, 0), W, [[1.6, 2.6], [4.6, 7.4]]);
    this.wainscot(new THREE.Vector3(minX + 0.001, 0, maxZ), new THREE.Vector3(0, 0, -1), D, []);
    this.wainscot(new THREE.Vector3(maxX - 0.001, 0, minZ), new THREE.Vector3(0, 0, 1), D, []);

    this.frontWindowAndDoor();
  }

  private wall(length: number, height: number, openings: Array<[number, number, number, number, number]>): THREE.Group {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(length, 0);
    shape.lineTo(length, height);
    shape.lineTo(0, height);
    shape.lineTo(0, 0);
    for (const [u0, v0, u1, v1, arch] of openings) {
      const hole = new THREE.Path();
      hole.moveTo(u0, v0);
      hole.lineTo(u1, v0);
      if (arch > 0) {
        const cx = (u0 + u1) / 2;
        const r = (u1 - u0) / 2;
        hole.lineTo(u1, v1 - r * 0.5);
        hole.absellipse(cx, v1 - r * 0.5, r, r * 0.5, 0, Math.PI, false);
      } else {
        hole.lineTo(u1, v1);
        hole.lineTo(u0, v1);
      }
      hole.lineTo(u0, v0);
      shape.holes.push(hole);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false, curveSegments: 18 });
    geo.translate(0, 0, -0.2);
    scaleUV(geo, 1 / 2.2);
    const mesh = new THREE.Mesh(geo, this.kit.m.plaster);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    // Wall local: x along length, y up, inner face at z=0 facing +z (into the room).
    const holder = new THREE.Group();
    holder.add(mesh);
    return holder;
  }

  private wainscot(origin: THREE.Vector3, along: THREE.Vector3, length: number, gaps: Array<[number, number]>): void {
    const m = this.kit.m;
    const inward = new THREE.Vector3().crossVectors(along, new THREE.Vector3(0, 1, 0)).normalize();
    const segs: Array<[number, number]> = [];
    let start = 0;
    for (const [a, b] of gaps) {
      segs.push([start, a]);
      start = b;
    }
    segs.push([start, length]);
    const angle = Math.atan2(-along.z, along.x);
    for (const [a, b] of segs) {
      const len = b - a;
      if (len <= 0.05) continue;
      const mid = origin.clone().addScaledVector(along, (a + b) / 2);
      const panel = new THREE.Mesh(worldBox(len, 0.95, 0.04, 1.2), m.sage);
      panel.position.copy(mid).addScaledVector(inward, 0.02).setY(0.475);
      panel.rotation.y = angle;
      const rail = new THREE.Mesh(worldBox(len, 0.06, 0.07, 1), m.walnut);
      rail.position.copy(mid).addScaledVector(inward, 0.035).setY(0.97);
      rail.rotation.y = angle;
      const base = new THREE.Mesh(worldBox(len, 0.12, 0.06, 1), m.walnut);
      base.position.copy(mid).addScaledVector(inward, 0.03).setY(0.06);
      base.rotation.y = angle;
      this.group.add(shadowed(panel, false, true), shadowed(rail, false, true), shadowed(base, false, true));
      // Vertical batten strips every ~0.45 m for panel rhythm.
      for (let u = a + 0.3; u < b - 0.15; u += 0.45) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.85, 0.02), m.sage);
        strip.position.copy(origin).addScaledVector(along, u).addScaledVector(inward, 0.045).setY(0.48);
        strip.rotation.y = angle;
        this.group.add(strip);
      }
    }
  }

  private frontWindowAndDoor(): void {
    // Front (south) wall: u measured from east edge going west (rotated wall).
    const m = this.kit.m;
    const toWorldX = (u: number) => ROOM.maxX - u;
    // Arched window frame.
    const u0 = 4.6;
    const u1 = 7.4;
    const v0 = 0.55;
    const v1 = 2.25;
    const cx = toWorldX((u0 + u1) / 2);
    const w = u1 - u0;
    const r = w / 2;
    const frameShape = new THREE.Shape();
    const outer = (s: THREE.Path | THREE.Shape, inset: number) => {
      s.moveTo(-w / 2 + inset, v0 + inset);
      s.lineTo(w / 2 - inset, v0 + inset);
      s.lineTo(w / 2 - inset, v1 - r * 0.5);
      s.absellipse(0, v1 - r * 0.5, r - inset, r * 0.5 - inset, 0, Math.PI, false);
      s.lineTo(-w / 2 + inset, v0 + inset);
    };
    outer(frameShape, 0);
    const hole = new THREE.Path();
    outer(hole, 0.09);
    frameShape.holes.push(hole);
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 0.12, bevelEnabled: false, curveSegments: 20 }), m.sage);
    scaleUV(frame.geometry, 1);
    frame.position.set(cx, 0, ROOM.maxZ - 0.16);
    this.group.add(shadowed(frame));
    // Mullions.
    for (const dx of [-w / 6, w / 6]) {
      const bar = new THREE.Mesh(worldBox(0.06, v1 - v0 - 0.1, 0.08, 1), m.sage);
      bar.position.set(cx + dx, (v0 + v1) / 2 - 0.05, ROOM.maxZ - 0.1);
      this.group.add(shadowed(bar));
    }
    const transom = new THREE.Mesh(worldBox(w - 0.1, 0.06, 0.08, 1), m.sage);
    transom.position.set(cx, v1 - r * 0.5, ROOM.maxZ - 0.1);
    this.group.add(shadowed(transom));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, v1 - v0), m.glass);
    glass.position.set(cx, (v0 + v1) / 2, ROOM.maxZ - 0.1);
    glass.layers.set(NO_OUTLINE_LAYER);
    this.group.add(glass);
    const sill = new THREE.Mesh(worldBox(w + 0.25, 0.06, 0.32, 1), m.walnut);
    sill.position.set(cx, v0 - 0.03, ROOM.maxZ - 0.2);
    this.group.add(shadowed(sill));
    // Window-box plants on the sill.
    for (let i = 0; i < 3; i++) {
      const p = this.kit.plant(0.8 + (i % 2) * 0.3);
      p.position.set(cx - 0.8 + i * 0.8, v0, ROOM.maxZ - 0.22);
      this.group.add(p);
    }

    // Door.
    const d0 = toWorldX(2.6);
    const d1 = toWorldX(1.6);
    const dw = d1 - d0;
    const doorPivot = new THREE.Group();
    doorPivot.position.set(d0, 0, ROOM.maxZ - 0.1);
    const door = new THREE.Group();
    const panelLow = new THREE.Mesh(worldBox(dw - 0.04, 1.0, 0.06, 1.2), m.sage);
    panelLow.position.set(dw / 2, 0.52, 0);
    const stileL = new THREE.Mesh(worldBox(0.1, 2.26, 0.065, 1.2), m.sage);
    stileL.position.set(0.07, 1.13, 0);
    const stileR = stileL.clone();
    stileR.position.x = dw - 0.07;
    const rail = new THREE.Mesh(worldBox(dw - 0.04, 0.1, 0.065, 1), m.sage);
    rail.position.set(dw / 2, 2.22, 0);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(dw - 0.2, 1.1), m.glass);
    pane.position.set(dw / 2, 1.62, 0);
    pane.layers.set(NO_OUTLINE_LAYER);
    const muntin = new THREE.Mesh(worldBox(0.04, 1.1, 0.05, 1), m.sage);
    muntin.position.set(dw / 2, 1.62, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), m.brass);
    knob.position.set(dw - 0.12, 1.0, -0.06);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), this.mats.painted({ map: this.shopSignArt.texture }));
    sign.position.set(dw / 2, 1.5, -0.04);
    sign.rotation.y = Math.PI;
    door.add(panelLow, stileL, stileR, rail, pane, muntin, knob, sign);
    doorPivot.add(shadowed(door));
    this.group.add(doorPivot);
    // Door bell bracket.
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.brass);
    bell.position.set(d0 + dw * 0.75, 2.33, ROOM.maxZ - 0.25);
    this.group.add(shadowed(bell));
    this._doorPivot = doorPivot;
    this._doorCenter = new THREE.Vector3((d0 + d1) / 2, 0, ROOM.maxZ + 0.5);
  }

  private _doorPivot!: THREE.Group;
  private _doorCenter!: THREE.Vector3;

  // ---------------------------------------------------------------- outside
  private buildOutside(): void {
    const plateTex = this.mats.textures.get('streetPlate');
    const plateMat = new THREE.MeshBasicMaterial({ map: plateTex, color: new THREE.Color(1.15, 1.08, 1.0) });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(16, 16 / 2.333), plateMat);
    front.position.set(-0.5, 2.6, ROOM.maxZ + 6);
    front.rotation.y = Math.PI;
    front.layers.set(NO_OUTLINE_LAYER);
    this.group.add(front);
    const westPlate = new THREE.Mesh(new THREE.PlaneGeometry(14, 14 / 2.333), plateMat);
    westPlate.position.set(ROOM.minX - 6, 2.4, -1.8);
    westPlate.rotation.y = Math.PI / 2;
    westPlate.layers.set(NO_OUTLINE_LAYER);
    this.group.add(westPlate);
    // Street ground visible through the door/window.
    const street = new THREE.Mesh(worldPlane(18, 6, 2.2), this.kit.m.cobble);
    street.rotation.x = -Math.PI / 2;
    street.position.set(0, -0.02, ROOM.maxZ + 3.1);
    street.receiveShadow = true;
    this.group.add(street);
    const westGround = new THREE.Mesh(worldPlane(6, 10, 2.2), this.kit.m.cobble);
    westGround.rotation.x = -Math.PI / 2;
    westGround.position.set(ROOM.minX - 3.1, -0.02, -1.5);
    this.group.add(westGround);
  }

  // ---------------------------------------------------------------- kitchen
  private buildKitchen(): WorldAnchors {
    const k = this.kit;
    const m = k.m;

    // --- West kitchen window (z ∈ [-2.6, -1.0]) cut as a separate wall patch.
    this.kitchenWindow();

    // --- Back counter (sage cabinets + butcher-block top) under the shelving.
    const bcX0 = -3.3;
    const bcX1 = -0.35;
    const bcW = bcX1 - bcX0;
    const bcCx = (bcX0 + bcX1) / 2;
    const bcZ = ROOM.minZ + 0.33;
    const cab = new THREE.Mesh(worldBox(bcW, 0.86, 0.62, 1.2), m.sage);
    cab.position.set(bcCx, 0.43, bcZ);
    this.group.add(shadowed(cab));
    const top = new THREE.Mesh(worldBox(bcW + 0.06, 0.07, 0.68, 1.4), m.butcher);
    top.position.set(bcCx, 0.895, bcZ + 0.01);
    this.group.add(shadowed(top));
    for (let i = 0; i < 4; i++) {
      const x = bcX0 + 0.37 + i * (bcW / 4);
      const drawer = new THREE.Mesh(worldBox(bcW / 4 - 0.08, 0.2, 0.03, 1), m.sage);
      drawer.position.set(x, 0.7, bcZ + 0.325);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), m.brass);
      knob.position.set(x, 0.7, bcZ + 0.35);
      const door = new THREE.Mesh(worldBox(bcW / 4 - 0.08, 0.42, 0.03, 1), m.sage);
      door.position.set(x, 0.3, bcZ + 0.325);
      this.group.add(shadowed(drawer), knob, shadowed(door));
    }
    this.block(bcX0, ROOM.minZ, bcX1, bcZ + 0.36);
    const towel = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.42, 2, 6), m.linen);
    towel.position.set(bcX0 + 1.2, 0.68, bcZ + 0.35);
    this.group.add(shadowed(towel));

    // Shelving above.
    const shelfZ = ROOM.minZ + 0.18;
    for (const [i, y] of [1.42, 1.86, 2.3].entries()) {
      const plank = new THREE.Mesh(worldBox(bcW, 0.045, 0.32, 1.2), m.walnut);
      plank.position.set(bcCx, y, shelfZ);
      this.group.add(shadowed(plank));
      // Brackets.
      for (const bx of [bcX0 + 0.1, bcCx, bcX1 - 0.1]) {
        const br = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.25), m.walnut);
        br.position.set(bx, y - 0.1, shelfZ - 0.02);
        this.group.add(br);
      }
      // Dress each shelf.
      let x = bcX0 + 0.2;
      let n = 0;
      while (x < bcX1 - 0.2) {
        const pick = (i * 7 + n) % 6;
        let item: THREE.Object3D;
        let wdt = 0.16;
        if (pick === 0 || pick === 3) {
          item = k.wickerBasket(0.36, 0.24, 0.17, true);
          wdt = 0.42;
        } else if (pick === 1) {
          item = k.jar(['#efe6d2', '#c48a4a', '#7a4a2a', '#d9b45a'][n % 4], 1.1);
          wdt = 0.15;
        } else if (pick === 2) {
          item = k.plant(0.7, i === 2);
          wdt = 0.3;
        } else if (pick === 4) {
          item = k.pitcher(n % 2 === 0);
          wdt = 0.18;
        } else {
          item = k.jar(['#f4efe3', '#e2c27a', '#9a5b38'][n % 3], 0.85);
          wdt = 0.13;
        }
        item.position.set(x + wdt / 2, y + 0.022, shelfZ + 0.01);
        this.group.add(item);
        x += wdt + 0.04;
        n++;
      }
    }
    // Ivy trailing from the top shelf.
    for (let i = 0; i < 2; i++) {
      const ivy = k.plant(0.9, true);
      ivy.position.set(bcX0 + 0.25 + i * 2.3, 2.32, shelfZ + 0.05);
      this.group.add(ivy);
    }

    // Mixer + pantry ingredients on the back counter.
    const mixer = k.standMixer();
    this.add(mixer, -2.75, 0.93, bcZ - 0.03);
    const flourSack = k.flourSack(0.85);
    const flourOpen = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), m.flour);
    flourOpen.rotation.x = -Math.PI / 2;
    flourOpen.position.y = 0.36;
    flourSack.add(flourOpen);
    const flour = this.add(flourSack, -2.15, 0.93, bcZ);
    const water = this.add(k.pitcher(true), -1.7, 0.93, bcZ + 0.05);
    water.scale.setScalar(1.25);
    const yeast = this.add(k.jar('#d8b878', 0.8), -1.35, 0.93, bcZ + 0.06);
    yeast.scale.setScalar(1.15);
    const butterDish = new THREE.Group();
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.025, 18), m.ceramic);
    const butterBlock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.06), this.mats.flat('#f7dc7a', { spec: 0.6 }));
    butterBlock.position.y = 0.035;
    butterDish.add(shadowed(dish), shadowed(butterBlock));
    const butter = this.add(butterDish, -0.95, 0.94, bcZ + 0.06);
    // Floor sacks.
    for (let i = 0; i < 3; i++) this.add(k.flourSack(1 + (i % 2) * 0.15), -3.15 + i * 0.32, 0, bcZ + 0.48 + (i % 2) * 0.12, i);
    this.block(-3.4, bcZ + 0.3, -2.3, bcZ + 0.75);

    // --- Proofing cabinet in the NW corner.
    const proofer = k.proofer();
    this.add(proofer, -3.98, 0, ROOM.minZ + 0.36);
    this.block(-4.5, ROOM.minZ, -3.55, ROOM.minZ + 0.7);

    // --- Brick oven back-right + chimney, log pile, hanging pans.
    const oven = k.brickOven();
    this.add(oven, 2.35, 0, ROOM.minZ + 0.72);
    this.block(1.45, ROOM.minZ, 3.25, ROOM.minZ + 1.45);
    this.lights.setFire(oven.localToWorld((oven.userData.firePos as THREE.Vector3).clone()), 0.8);
    (oven.userData.fire as THREE.Group).traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData.phase !== undefined) this.flames.push(o as THREE.Mesh);
    });
    this.add(k.logPile(), 3.7, 0, ROOM.minZ + 0.35, Math.PI / 2);
    // Bread peel leaning on the oven plinth + a terracotta trim band.
    const trim = new THREE.Mesh(worldBox(1.72, 0.06, 1.37, 0.5), this.mats.tex('sageWood', '#c9d0a8'));
    trim.position.set(2.35, 0.62, ROOM.minZ + 0.72);
    this.group.add(shadowed(trim, false, true));
    const clock = k.wallClock();
    clock.position.set(0.7, 2.6, ROOM.minZ + 0.04);
    this.group.add(clock);
    this.clock = clock;
    const painting = k.framedArt('painting-bread.webp', 0.48, 0.64);
    painting.position.set(ROOM.minX + 0.03, 1.8, -0.35);
    painting.rotation.y = Math.PI / 2;
    this.group.add(painting);
    this.block(3.4, ROOM.minZ, 4.0, ROOM.minZ + 0.7);

    const railY = 2.15;
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 8), m.iron);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0.55, railY, ROOM.minZ + 0.12);
    this.group.add(rail);
    [0.13, 0.11, 0.15, 0.1].forEach((r, i) => {
      const pan = k.copperPan(r);
      pan.position.set(0.05 + i * 0.32, railY, ROOM.minZ + 0.12);
      this.group.add(pan);
    });
    for (let i = 0; i < 3; i++) {
      const herb = k.herbBundle();
      herb.position.set(-0.1 + i * 0.55, railY + 0.02, ROOM.minZ + 0.1);
      this.group.add(herb);
    }
    const menu = k.chalkboard(
      0.7,
      0.88,
      this.art.chalkboard('오늘의 빵', RECIPE_ORDER.map((r) => `${RECIPE_NAMES[r]}|₩${RECIPES[r].price.toLocaleString('ko-KR')}`)),
    );
    this.add(menu, 3.95, 1.95, ROOM.minZ + 0.03);

    // --- Butcher-block island (main work surface).
    const wbX = -0.85;
    const wbZ = -1.75;
    const wbW = 2.0;
    const wbD = 0.95;
    const island = new THREE.Group();
    const wbTop = new THREE.Mesh(worldBox(wbW, 0.1, wbD, 1.3), m.butcher);
    wbTop.position.y = 0.87;
    island.add(wbTop);
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const leg = new THREE.Mesh(worldBox(0.09, 0.82, 0.09, 1), m.walnut);
      leg.position.set(sx * (wbW / 2 - 0.08), 0.41, sz * (wbD / 2 - 0.08));
      island.add(leg);
    }
    const lower = new THREE.Mesh(worldBox(wbW - 0.1, 0.04, wbD - 0.1, 1.2), m.walnut);
    lower.position.y = 0.22;
    island.add(lower);
    const apron = new THREE.Mesh(worldBox(wbW - 0.12, 0.12, wbD - 0.12, 1.2), m.walnut);
    apron.position.y = 0.76;
    island.add(apron);
    this.add(shadowed(island), wbX, 0, wbZ);
    // Under-shelf dressing.
    this.add(k.wickerBasket(0.45, 0.32, 0.18, false), wbX - 0.5, 0.24, wbZ);
    this.add(k.flourSack(0.8), wbX + 0.45, 0.24, wbZ + 0.05);
    this.add(k.woodenSpoonCrock(), wbX - 0.25, 0.24, wbZ + 0.25);
    // Work surface dressing (non-interactive set pieces at the back edge).
    this.add(k.rollingPin(), wbX + 0.62, 0.92, wbZ - 0.33, 0.3);
    this.add(k.flourBowl(), wbX - 0.78, 0.92, wbZ - 0.28);
    this.add(k.benchScraper(), wbX + 0.75, 0.92, wbZ + 0.12, -0.4);
    const dustMat = new THREE.MeshBasicMaterial({ map: this.mats.textures.flourSplat, transparent: true, depthWrite: false, color: new THREE.Color(1.15, 1.12, 1.05) });
    for (const [dx, dz, sc, rot] of [
      [-0.35, 0.05, 0.62, 0.3],
      [0.05, -0.18, 0.4, 1.4],
      [0.62, 0.22, 0.3, 2.2],
    ]) {
      const dust = new THREE.Mesh(new THREE.PlaneGeometry(sc, sc), dustMat);
      dust.rotation.set(-Math.PI / 2, 0, rot);
      dust.position.set(wbX + dx, 0.9215, wbZ + dz);
      dust.layers.set(NO_OUTLINE_LAYER);
      this.group.add(dust);
    }
    const workbench = new THREE.Object3D();
    workbench.position.set(wbX - 0.15, 0.92, wbZ + 0.05);
    this.group.add(workbench);
    this.block(wbX - wbW / 2 - 0.05, wbZ - wbD / 2 - 0.05, wbX + wbW / 2 + 0.05, wbZ + wbD / 2 + 0.05);

    // --- East kitchen: tray rack + sink cabinet + bin.
    const rackX = 4.12;
    const rackZ = -1.9;
    const rack = new THREE.Group();
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 6), m.steel);
        post.position.set(sx * 0.2, 0.75, sz * 0.3);
        rack.add(post);
      }
    }
    const trayStack: THREE.Object3D[] = [];
    for (let i = 0; i < 5; i++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.012, 0.64), m.steel);
      shelf.position.y = 0.25 + i * 0.28;
      rack.add(shelf);
      const tray = k.sheetTray();
      tray.rotation.y = Math.PI / 2;
      tray.position.y = 0.26 + i * 0.28;
      rack.add(tray);
      trayStack.push(tray);
    }
    this.add(shadowed(rack), rackX, 0, rackZ);
    const trayRack = new THREE.Object3D();
    trayRack.position.set(rackX, 1.0, rackZ);
    trayRack.userData.stack = trayStack;
    this.group.add(trayRack);
    this.block(rackX - 0.28, rackZ - 0.38, ROOM.maxX, rackZ + 0.38);

    const sinkCab = new THREE.Mesh(worldBox(0.62, 0.86, 1.0, 1.2), m.sage);
    // Sink sits against the log pile, clear of the tray rack in front of it.
    const sinkZ = -2.82;
    sinkCab.position.set(4.17, 0.43, sinkZ);
    const sinkTop = new THREE.Mesh(worldBox(0.68, 0.07, 1.06, 1.4), m.butcher);
    sinkTop.position.set(4.17, 0.895, sinkZ);
    const basin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.5), m.ceramic);
    basin.position.set(4.17, 0.94, sinkZ);
    const tap = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 14, Math.PI), m.copper);
    tap.position.set(4.38, 1.02, sinkZ);
    tap.rotation.y = Math.PI / 2;
    this.group.add(shadowed(sinkCab), shadowed(sinkTop), basin, shadowed(tap));
    this.block(3.85, sinkZ - 0.53, ROOM.maxX, sinkZ + 0.53);

    const binGroup = new THREE.Group();
    const binBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.5, 18), m.walnut);
    binBody.position.y = 0.25;
    const binRim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 18), m.iron);
    binRim.rotation.x = Math.PI / 2;
    binRim.position.y = 0.5;
    binGroup.add(shadowed(binBody), binRim);
    const bin = this.add(binGroup, 3.95, 0, -0.75);
    this.block(3.7, -1.0, 4.2, -0.5);

    // --- Pendant lamps over the kitchen.
    for (const [x, z] of [
      [-0.85, -1.75],
      [2.2, -1.5],
    ]) {
      const lamp = k.pendantLamp(0.95);
      lamp.position.set(x, ROOM.height, z);
      this.group.add(lamp);
      this.lights.addLamp(new THREE.Vector3(x, ROOM.height - 1.15, z), 1.6);
    }

    // --- Display counter (divides kitchen / shop).
    const ctrZ = 0.48;
    const ctrX0 = -2.85;
    const ctrX1 = 3.55;
    const ctrW = ctrX1 - ctrX0;
    const ctrCx = (ctrX0 + ctrX1) / 2;
    const counter = new THREE.Group();
    const body = new THREE.Mesh(worldBox(ctrW, 0.88, 0.7, 1.2), m.walnut);
    body.position.y = 0.44;
    const front = new THREE.Mesh(worldBox(ctrW - 0.1, 0.62, 0.03, 1.2), m.sage);
    front.position.set(0, 0.47, 0.36);
    const ctrTop = new THREE.Mesh(worldBox(ctrW + 0.08, 0.07, 0.8, 1.4), m.butcher);
    ctrTop.position.y = 0.915;
    counter.add(body, front, ctrTop);
    for (let x = -ctrW / 2 + 0.4; x < ctrW / 2 - 0.2; x += 0.8) {
      const panel = new THREE.Mesh(worldBox(0.6, 0.46, 0.02, 1), m.sage);
      panel.position.set(x, 0.47, 0.385);
      const trim = new THREE.Mesh(worldBox(0.64, 0.5, 0.012, 1), m.walnut);
      trim.position.set(x, 0.47, 0.378);
      counter.add(panel, trim);
    }
    this.add(shadowed(counter), ctrCx, 0, ctrZ);
    this.colliders.push(new THREE.Box2(new THREE.Vector2(ctrX0, ctrZ - 0.4), new THREE.Vector2(ctrX1, ctrZ + 0.4)));
    // Gates at both ends keep the baker in the kitchen.
    const westGate = new THREE.Mesh(worldBox(ctrX0 - ROOM.minX, 0.95, 0.08, 1.2), m.sage);
    westGate.position.set((ROOM.minX + ctrX0) / 2, 0.475, ctrZ);
    this.group.add(shadowed(westGate));
    this.block(ROOM.minX, ctrZ - 0.15, ctrX0, ctrZ + 0.15);
    const eastCab = new THREE.Mesh(worldBox(ROOM.maxX - ctrX1, 0.95, 0.7, 1.2), m.walnut);
    eastCab.position.set((ROOM.maxX + ctrX1) / 2, 0.475, ctrZ);
    this.group.add(shadowed(eastCab));
    this.block(ctrX1, ctrZ - 0.4, ROOM.maxX, ctrZ + 0.4);
    const bigPlant = k.plant(2.2);
    bigPlant.scale.setScalar(1.3);
    this.add(bigPlant, (ROOM.minX + ctrX0) / 2, 0.95, ctrZ);

    const displaySlots: THREE.Object3D[] = [];
    [-2.1, -0.95, 0.2, 1.35].forEach((x) => {
      const basket = k.wickerBasket(0.62, 0.42, 0.12, true);
      basket.position.set(x, COUNTER_TOP, ctrZ - 0.02);
      this.group.add(basket);
      const slot = new THREE.Object3D();
      slot.position.set(x, COUNTER_TOP + 0.03, ctrZ - 0.02);
      this.group.add(slot);
      displaySlots.push(slot);
    });
    const register = k.cashRegister();
    this.add(register, 2.75, COUNTER_TOP, ctrZ - 0.05, Math.PI);
    this.add(k.shopBell(), 2.15, COUNTER_TOP, ctrZ + 0.22);
    // OPEN / CLOSED board on a little stand: the player flips it to start / end trading.
    const stand = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8), k.m.walnut);
    post.position.y = 0.21;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.025, 14), k.m.walnut);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6), k.m.iron);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(0, 0.41, 0);
    const board = new THREE.Group();
    board.name = 'board';
    board.position.set(0, 0.29, 0);
    const boardMat = this.mats.painted({ map: this.shopSignArt.texture, side: THREE.DoubleSide });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), boardMat);
    const frame = new THREE.Mesh(worldBox(0.36, 0.19, 0.012, 1), k.m.walnut);
    frame.position.z = -0.008;
    const back = face.clone();
    back.rotation.y = Math.PI;
    back.position.z = -0.016;
    board.add(frame, face, back);
    stand.add(shadowed(post), base, arm, shadowed(board));
    stand.position.set(1.7, COUNTER_TOP, ctrZ - 0.12);
    stand.rotation.y = Math.PI;
    this.group.add(stand);
    this.openSign = stand;
    this.add(k.paperBagStack(), 3.25, COUNTER_TOP, ctrZ - 0.05, 0.2);

    return {
      playerStart: new THREE.Vector3(-0.6, 0, -0.55),
      workbench,
      mixer,
      oven,
      proofer,
      trayRack,
      register,
      displaySlots,
      pantry: { flour, water, yeast, butter },
      bin,
      shopDoor: this._doorCenter.clone(),
      queueSpots: [new THREE.Vector3(2.75, 0, 1.45), new THREE.Vector3(2.75, 0, 2.2), new THREE.Vector3(2.55, 0, 2.95), new THREE.Vector3(1.8, 0, 3.3)],
      browseSpots: displaySlots.map((s) => new THREE.Vector3(s.position.x, 0, 1.4)),
      doorPivot: this._doorPivot,
      cat: new THREE.Vector3(-2.0, 0, 2.0),
    };
  }

  private kitchenWindow(): void {
    // The generic west wall above was built solid in the kitchen; we rebuild the
    // kitchen half of the west wall here with a window opening at z ∈ [-2.6, -1.0].
    const m = this.kit.m;
    const z0 = -2.6;
    const z1 = -1.0;
    const sill = 0.95;
    const top = 2.35;
    const cz = (z0 + z1) / 2;
    const w = z1 - z0;
    // Frame + mullions + sill (the opening itself is cut in buildShell via westOpenings).
    for (const [y, h] of [
      [sill + 0.03, 0.06],
      [top - 0.03, 0.06],
      [(sill + top) / 2, 0.05],
    ]) {
      const bar = new THREE.Mesh(worldBox(0.1, h, w, 1), m.sage);
      bar.position.set(ROOM.minX + 0.05, y, cz);
      this.group.add(shadowed(bar));
    }
    for (const dz of [-w / 2 + 0.03, 0, w / 2 - 0.03]) {
      const bar = new THREE.Mesh(worldBox(0.1, top - sill, 0.06, 1), m.sage);
      bar.position.set(ROOM.minX + 0.05, (sill + top) / 2, cz + dz);
      this.group.add(shadowed(bar));
    }
    const ledge = new THREE.Mesh(worldBox(0.34, 0.06, w + 0.24, 1), m.walnut);
    ledge.position.set(ROOM.minX + 0.12, sill - 0.03, cz);
    this.group.add(shadowed(ledge));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, top - sill), m.glass);
    glass.rotation.y = Math.PI / 2;
    glass.position.set(ROOM.minX + 0.04, (sill + top) / 2, cz);
    glass.layers.set(NO_OUTLINE_LAYER);
    this.group.add(glass);
    // Sill dressing like the concept: plant + spoon crock.
    this.add(this.kit.plant(1.1), ROOM.minX + 0.16, sill, cz - 0.45);
    this.add(this.kit.plant(0.7), ROOM.minX + 0.16, sill, cz + 0.5);
    this.add(this.kit.woodenSpoonCrock(), ROOM.minX + 0.18, sill, cz + 0.05);
    // Curtain tie-backs.
    for (const s of [-1, 1]) {
      const curtain = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.13, top - sill + 0.3, 10, 1, true), m.linen);
      curtain.position.set(ROOM.minX + 0.12, (sill + top) / 2 + 0.1, cz + s * (w / 2 + 0.12));
      this.group.add(shadowed(curtain));
    }
    this.lights.addWindowShaft(new THREE.Vector3(ROOM.minX + 0.02, (sill + top) / 2, cz), w * 0.95, top - sill, new THREE.Vector3(1, 0, 0), 6.5);
  }

  // ---------------------------------------------------------------- shop
  private buildShop(): void {
    const k = this.kit;
    this.add(k.roundTable(), -2.7, 0, 2.7);
    this.add(k.chair(), -3.25, 0, 2.45, Math.PI / 2 + 0.4);
    this.add(k.chair(), -2.15, 0, 3.05, -Math.PI / 2 - 0.6);
    const vase = k.pitcher(true);
    vase.add(k.plant(0.5));
    this.add(vase, -2.7, 0.76, 2.7);
    // East wall display shelves with decor loaves & jars.
    for (const [i, y] of [0.9, 1.4, 1.9].entries()) {
      const plank = new THREE.Mesh(worldBox(0.34, 0.045, 2.2, 1.2), k.m.walnut);
      plank.position.set(ROOM.maxX - 0.18, y, 2.4);
      this.group.add(shadowed(plank));
      for (let j = 0; j < 4; j++) {
        const item = (i + j) % 3 === 0 ? k.jar(['#e2a85a', '#c46a4a', '#efe3c8'][j % 3], 1) : (i + j) % 3 === 1 ? k.wickerBasket(0.28, 0.2, 0.1, true) : k.pitcher(j % 2 === 0);
        item.position.set(ROOM.maxX - 0.18, y + 0.022, 1.55 + j * 0.55);
        item.rotation.y = Math.PI / 2;
        this.group.add(item);
      }
    }
    const wheat = k.framedArt('painting-wheat.webp', 0.8, 0.6);
    wheat.position.set(ROOM.maxX - 0.03, 2.4, 2.4);
    wheat.rotation.y = -Math.PI / 2;
    this.group.add(wheat);
    const tree = k.plant(3);
    tree.scale.setScalar(1.6);
    this.add(tree, 3.95, 0, 3.55);
    this.add(k.aFrameSign(this.art.chalkboard('Calico', ['갓 구운 빵|', '매일 아침|'], 384, 600)), 1.0, 0, ROOM.maxZ + 0.9, 0.2);
    const lamp = k.pendantLamp(0.85);
    lamp.position.set(-2.7, ROOM.height, 2.7);
    this.group.add(lamp);
    this.lights.addLamp(new THREE.Vector3(-2.7, ROOM.height - 1.05, 2.7), 1.4);
    const lamp2 = k.pendantLamp(0.85);
    lamp2.position.set(1.4, ROOM.height, 2.0);
    this.group.add(lamp2);
    this.lights.addLamp(new THREE.Vector3(1.4, ROOM.height - 1.05, 2.0), 1.4);
  }
}
