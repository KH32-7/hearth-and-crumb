import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MaterialLibrary, PALETTE, worldBox, shadowed } from '../render/Materials';
import { NO_OUTLINE_LAYER } from '../render/RenderPipeline';
import { mulberry } from '../render/Textures';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Authored prop kit. Each factory returns a Group positioned at its local origin
 * (floor contact at y=0 unless noted). Forms follow the approved kitchen concept
 * (artifacts/concepts/kitchen.png): chunky, slightly rounded, hand-made.
 */
export class PropKit {
  private readonly rand = mulberry(42);
  readonly geo = {
    jar: lathe([[0, 0], [0.06, 0], [0.065, 0.01], [0.065, 0.16], [0.05, 0.175], [0.045, 0.19], [0, 0.19]]),
    jarLid: new THREE.CylinderGeometry(0.05, 0.05, 0.025, 16),
    leaf: new THREE.IcosahedronGeometry(1, 0),
    potTerracotta: lathe([[0, 0], [0.09, 0], [0.12, 0.17], [0.13, 0.17], [0.13, 0.2], [0.115, 0.2], [0.1, 0.03], [0, 0.03]]),
    bowl: lathe([[0, 0], [0.1, 0], [0.16, 0.05], [0.2, 0.12], [0.19, 0.125], [0.15, 0.06], [0.09, 0.02], [0, 0.02]]),
  };

  constructor(readonly mats: MaterialLibrary) {}

  private rnd(a: number, b: number): number {
    return a + (b - a) * this.rand();
  }

  // ---------------- materials (shared roles) ----------------
  get m() {
    const M = this.mats;
    return {
      plaster: M.tex('plaster', '#fff6e6'),
      floor: M.tex('floorTiles'),
      butcher: M.tex('butcherBlock'),
      walnut: M.tex('walnut'),
      walnutDark: M.tex('walnut', '#b89a88'),
      brick: M.tex('brick'),
      wicker: M.tex('wicker'),
      kraft: M.tex('kraft'),
      gingham: M.tex('gingham'),
      sage: M.tex('sageWood'),
      cobble: M.tex('cobble'),
      iron: M.flat('#3b3330', { spec: 0.35, specSize: 0.45 }),
      copper: M.flat(PALETTE.copper, { spec: 0.9, specSize: 0.35, rim: 0.6 }),
      brass: M.flat('#c99a45', { spec: 0.9, specSize: 0.35, rim: 0.5 }),
      steel: M.flat(PALETTE.steel, { spec: 0.9, specSize: 0.3, rim: 0.3 }),
      ceramic: M.flat(PALETTE.ceramic, { spec: 0.7, specSize: 0.35 }),
      ceramicBlue: M.flat('#5f7fa8', { spec: 0.6, specSize: 0.35 }),
      cream: M.flat('#efe0bf', { spec: 0.5, specSize: 0.5 }),
      sack: M.flat(PALETTE.flourSack),
      sackTie: M.flat('#a7814f'),
      terracotta: M.flat('#c0673f'),
      leaf: M.flat('#7d8f45'),
      leafLight: M.flat('#a2ae58'),
      leafDark: M.flat('#5c6e38'),
      soil: M.flat('#4a3226'),
      glass: M.role('glass', () =>
        M.painted({ color: '#e8f1ea', transparent: true, opacity: 0.28, spec: 1, specSize: 0.3, rim: 0.8 }),
      ),
      chalk: M.flat('#2f3a33'),
      linen: M.flat('#f2ead8'),
      flour: M.flat('#fbf6ec'),
      emberGlow: M.role('ember', () =>
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a2a').multiplyScalar(3.2), toneMapped: true }),
      ),
      fireCore: M.role('fireCore', () =>
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffa040').multiplyScalar(2.2), transparent: true, opacity: 0.9, depthWrite: false }),
      ),
      bulb: M.role('bulb', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd79a').multiplyScalar(2.2) })),
      shadowBlob: M.role('shadowBlob', () =>
        new THREE.MeshBasicMaterial({ map: M.textures.radialShadow, transparent: true, depthWrite: false }),
      ),
    };
  }

  // ---------------- small dressing ----------------
  jar(fill: THREE.ColorRepresentation, h = 1): THREE.Group {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(this.geo.jar, this.m.glass);
    glass.scale.y = h;
    glass.layers.set(NO_OUTLINE_LAYER);
    const content = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.12 * h * this.rnd(0.6, 1), 14), this.mats.flat(fill));
    content.position.y = content.geometry.parameters.height / 2 + 0.008;
    const lid = new THREE.Mesh(this.geo.jarLid, this.rand() > 0.5 ? this.m.walnut : this.m.brass);
    lid.position.y = 0.19 * h + 0.012;
    g.add(content, glass, lid);
    return shadowed(g);
  }

  /**
   * Potted plant with real leaf shapes: curved teardrop blades on stems, merged
   * into one mesh per material (2 draw calls per plant).
   */
  plant(size = 1, hanging = false): THREE.Group {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(this.geo.potTerracotta, this.m.terracotta);
    g.add(pot);
    const soil = new THREE.Mesh(new THREE.CircleGeometry(0.115, 14), this.m.soil);
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.185;
    g.add(soil);
    const buckets: THREE.BufferGeometry[][] = [[], []];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const addLeaf = (pos: THREE.Vector3, dir: THREE.Vector3, len: number, roll: number, bucket: number) => {
      // Orient leaf +Y along dir, roll around it.
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      const rollQ = new THREE.Quaternion().setFromAxisAngle(dir.clone().normalize(), roll);
      q.premultiply(rollQ);
      m4.compose(pos, q, new THREE.Vector3(len, len, len));
      buckets[bucket].push(this.leafGeometry().clone().applyMatrix4(m4));
    };
    if (hanging) {
      const strands = Math.round(4 + size * 3);
      for (let s = 0; s < strands; s++) {
        const a = (s / strands) * Math.PI * 2 + this.rnd(-0.3, 0.3);
        const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const p = new THREE.Vector3(out.x * 0.11, 0.2, out.z * 0.11);
        const steps = Math.round(this.rnd(4, 8) * size);
        for (let k = 0; k < steps; k++) {
          p.addScaledVector(out, 0.025).add(new THREE.Vector3(0, -0.05, 0));
          const side = k % 2 ? 1 : -1;
          const dir = out.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, -0.2, 0)).applyAxisAngle(new THREE.Vector3(0, 1, 0), side * 0.9);
          addLeaf(p.clone(), dir, this.rnd(0.045, 0.065) * size, this.rnd(-0.5, 0.5), k % 3 === 0 ? 1 : 0);
        }
      }
      // A crown of leaves on top of the pot.
      for (let i = 0; i < 7; i++) {
        const a = this.rnd(0, Math.PI * 2);
        addLeaf(new THREE.Vector3(Math.cos(a) * 0.05, 0.2, Math.sin(a) * 0.05), new THREE.Vector3(Math.cos(a), 0.9, Math.sin(a)), this.rnd(0.06, 0.08) * size, this.rnd(-1, 1), i % 2);
      }
    } else {
      const stems = Math.round(6 + size * 6);
      for (let s = 0; s < stems; s++) {
        const a = this.rnd(0, Math.PI * 2);
        const tilt = this.rnd(0.15, 0.75);
        const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
        const len = this.rnd(0.18, 0.34) * size;
        const base = new THREE.Vector3(Math.cos(a) * 0.03, 0.19, Math.sin(a) * 0.03);
        // Leaves along the upper half of each stem + one big terminal leaf.
        for (let k = 0; k < 3; k++) {
          const t = 0.45 + k * 0.25;
          const p = base.clone().addScaledVector(dir, len * t);
          const side = k % 2 ? 1 : -1;
          const ld = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), side * 1.4).add(new THREE.Vector3(0, 0.3, 0));
          addLeaf(p, ld, this.rnd(0.06, 0.09) * size, this.rnd(-0.6, 0.6), (s + k) % 3 === 0 ? 1 : 0);
        }
        addLeaf(base.clone().addScaledVector(dir, len), dir, this.rnd(0.08, 0.12) * size, this.rnd(-0.5, 0.5), s % 2);
      }
    }
    const mats = [this.leafMaterial('#7d8f45'), this.leafMaterial('#a3b25a')];
    buckets.forEach((list, i) => {
      if (!list.length) return;
      const merged = mergeGeometries(list, false);
      list.forEach((gg) => gg.dispose());
      if (merged) g.add(new THREE.Mesh(merged, mats[i]));
    });
    return shadowed(g);
  }

  private _leafGeo: THREE.BufferGeometry | null = null;
  private leafGeometry(): THREE.BufferGeometry {
    if (this._leafGeo) return this._leafGeo;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.42, 0.35, 0, 1);
    shape.quadraticCurveTo(-0.42, 0.35, 0, 0);
    const geo = new THREE.ShapeGeometry(shape, 5);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // Arch along the length + fold at the midrib.
      pos.setZ(i, -0.28 * y * y + Math.abs(x) * 0.35);
    }
    geo.computeVertexNormals();
    this._leafGeo = geo;
    return geo;
  }

  private leafMaterial(color: string): THREE.Material {
    return this.mats.role(`leafDS:${color}`, () => this.mats.painted({ color, side: THREE.DoubleSide, rim: 0.25 }));
  }

  flourSack(scale = 1): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      lathe([[0, 0], [0.17, 0], [0.21, 0.06], [0.22, 0.2], [0.19, 0.34], [0.12, 0.42], [0.07, 0.45], [0, 0.45]], 18),
      this.m.sack,
    );
    body.scale.set(1, this.rnd(0.85, 1.05), this.rnd(0.85, 1));
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14), this.m.sackTie);
    tie.rotation.x = Math.PI / 2;
    tie.position.y = 0.42 * body.scale.y;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.1, 8), this.m.sack);
    top.position.y = 0.48 * body.scale.y;
    top.rotation.z = this.rnd(-0.3, 0.3);
    g.add(body, tie, top);
    g.scale.setScalar(scale);
    return shadowed(g);
  }

  wickerBasket(w: number, d: number, h: number, liner = true): THREE.Group {
    const g = new THREE.Group();
    const shape = roundedRectShape(w, d, Math.min(w, d) * 0.3);
    const inset = roundedRectShape(w - 0.04, d - 0.04, Math.min(w, d) * 0.3 - 0.02);
    shape.holes.push(new THREE.Path(inset.getPoints(8).reverse()));
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(inset), this.m.wicker);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    g.add(floor);
    const outer = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 8 }),
      this.m.wicker,
    );
    scaleUV(outer.geometry, 4);
    outer.rotation.x = -Math.PI / 2;
    g.add(outer);
    const rim = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(roundedRectPoints(w + 0.01, d + 0.01, Math.min(w, d) * 0.3, 6), true), 48, 0.018, 6, true),
      this.mats.flat('#b07a44'),
    );
    rim.position.y = h;
    g.add(rim);
    if (liner) {
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.2, d * 1.2, 8, 8), this.rand() > 0.4 ? this.m.gingham : this.m.linen);
      sagPlane(cloth.geometry as THREE.PlaneGeometry, 0.04);
      scaleUV(cloth.geometry, 1.2);
      cloth.rotation.x = -Math.PI / 2;
      cloth.position.y = h * 0.72;
      g.add(cloth);
    }
    return shadowed(g);
  }

  copperPan(radius = 0.13): THREE.Group {
    const g = new THREE.Group();
    const pan = new THREE.Mesh(
      lathe([[0, 0], [radius * 0.85, 0], [radius, radius * 0.45], [radius * 0.96, radius * 0.47], [radius * 0.8, radius * 0.06], [0, radius * 0.06]], 22),
      this.m.copper,
    );
    pan.rotation.x = Math.PI / 2;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.025, radius * 1.5, 0.012), this.m.iron);
    handle.position.y = radius + radius * 0.7;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 12), this.m.iron);
    ring.position.y = radius * 2.5;
    g.add(pan, handle, ring);
    g.position.y = -radius * 2.5;
    const holder = new THREE.Group();
    holder.add(g);
    return shadowed(holder);
  }

  herbBundle(): THREE.Group {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const stem = new THREE.Mesh(this.geo.leaf, i % 2 ? this.m.leafDark : this.m.leaf);
      stem.scale.set(0.02, 0.1, 0.02);
      stem.position.set(this.rnd(-0.03, 0.03), -0.12 - this.rnd(0, 0.08), this.rnd(-0.03, 0.03));
      stem.rotation.z = this.rnd(-0.3, 0.3);
      g.add(stem);
    }
    const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 8), this.m.sackTie);
    tie.position.y = -0.03;
    g.add(tie);
    return shadowed(g);
  }

  pitcher(blue = false): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      lathe([[0, 0], [0.06, 0], [0.075, 0.05], [0.07, 0.12], [0.055, 0.16], [0.06, 0.2], [0.055, 0.2], [0, 0.19]], 18),
      this.m.ceramic,
    );
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0745, 0.0755, 0.025, 18, 1, true), blue ? this.m.ceramicBlue : this.m.terracotta);
    band.position.y = 0.075;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.009, 6, 12, Math.PI), this.m.ceramic);
    handle.rotation.z = -Math.PI / 2;
    handle.position.set(0.07, 0.12, 0);
    g.add(body, band, handle);
    return shadowed(g);
  }

  woodenSpoonCrock(): THREE.Group {
    const g = this.pitcher(true);
    for (let i = 0; i < 4; i++) {
      const spoon = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.3, 6), this.m.butcher);
      handle.position.y = 0.15;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), this.m.butcher);
      head.scale.set(1, 1.5, 0.45);
      head.position.y = 0.32;
      spoon.add(handle, head);
      spoon.position.set(this.rnd(-0.02, 0.02), 0.06, this.rnd(-0.02, 0.02));
      spoon.rotation.set(this.rnd(-0.25, 0.25), this.rnd(0, 6), this.rnd(-0.25, 0.25));
      g.add(spoon);
    }
    return shadowed(g);
  }

  rollingPin(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 16), this.m.butcher);
    body.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.1, 10), this.m.walnut);
      h.rotation.z = Math.PI / 2;
      h.position.x = s * 0.2;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), this.m.walnut);
      knob.position.x = s * 0.255;
      g.add(h, knob);
    }
    g.add(body);
    g.position.y = 0.035;
    const holder = new THREE.Group();
    holder.add(g);
    return shadowed(holder);
  }

  benchScraper(): THREE.Group {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.003, 0.11), this.m.steel);
    blade.position.y = 0.002;
    const handle = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.03, 0.03, 2, 0.01), this.m.walnut);
    handle.position.set(0, 0.02, -0.06);
    g.add(blade, handle);
    return shadowed(g);
  }

  flourBowl(): THREE.Group {
    const g = new THREE.Group();
    const bowl = new THREE.Mesh(this.geo.bowl, this.m.walnut);
    const flour = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.m.flour);
    flour.scale.y = 0.35;
    flour.position.y = 0.08;
    g.add(bowl, flour);
    return shadowed(g);
  }

  /** Steel sheet pan with parchment; slots for 6 rolls returned in userData.slots (local). */
  sheetTray(): THREE.Group {
    const g = new THREE.Group();
    const w = 0.56;
    const d = 0.4;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.008, d), this.m.iron);
    base.position.y = 0.004;
    g.add(base);
    const rimMat = this.m.iron;
    for (const [x, z, sx, sz] of [
      [0, d / 2, w, 0.012],
      [0, -d / 2, w, 0.012],
      [w / 2, 0, 0.012, d],
      [-w / 2, 0, 0.012, d],
    ] as const) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.012, 0.03, sz + 0.012), rimMat);
      rim.position.set(x, 0.016, z);
      g.add(rim);
    }
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, d * 0.95, 6, 6), this.mats.flat('#d9bf93'));
    sagPlane(paper.geometry as THREE.PlaneGeometry, -0.004);
    paper.rotation.x = -Math.PI / 2;
    paper.position.y = 0.0105;
    g.add(paper);
    const slots: THREE.Vector3[] = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) slots.push(new THREE.Vector3((c - 1) * 0.17, 0.012, (r - 0.5) * 0.18));
    g.userData.slots = slots;
    return shadowed(g);
  }

  pendantLamp(cord = 0.9): THREE.Group {
    const g = new THREE.Group();
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, cord, 6), this.m.iron);
    wire.position.y = -cord / 2;
    const shade = new THREE.Mesh(
      lathe([[0.02, 0], [0.04, -0.02], [0.08, -0.08], [0.17, -0.16], [0.172, -0.17], [0.16, -0.165], [0.075, -0.085], [0.03, -0.022]], 22),
      this.m.copper,
    );
    shade.position.y = -cord;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.165, 0.15, 22, 1, true), this.mats.flat('#ffe2b0', { emissive: '#ffcf8a', emissiveIntensity: 0.35 }));
    inner.material.side = THREE.BackSide;
    inner.position.y = -cord - 0.09;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), this.m.bulb);
    bulb.position.y = -cord - 0.13;
    bulb.layers.set(NO_OUTLINE_LAYER);
    g.add(wire, shade, inner, bulb);
    shadowed(g, false, false);
    return g;
  }

  /** Classic cream stand mixer with steel bowl (bowl anchor in userData.bowl). */
  standMixer(): THREE.Group {
    const g = new THREE.Group();
    const cream = this.m.cream;
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.05, 0.36, 3, 0.02), cream);
    base.position.set(0, 0.025, 0.02);
    const column = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.34, 0.13, 3, 0.05), cream);
    column.position.set(0, 0.2, -0.11);
    const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.24, 6, 16), cream);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 0.42, 0.0);
    head.scale.set(1, 1, 0.95);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.008, 6, 20), this.m.brass);
    band.position.set(0, 0.42, 0.08);
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.05, 12), this.m.steel);
    nose.position.set(0, 0.33, 0.08);
    const beater = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 6, 16), this.m.steel);
    beater.position.set(0, 0.25, 0.08);
    beater.rotation.y = Math.PI / 2;
    beater.name = 'beater';
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10), this.m.brass);
    knob.rotation.z = Math.PI / 2;
    knob.position.set(0.065, 0.3, -0.1);
    const bowl = new THREE.Mesh(
      lathe([[0, 0], [0.06, 0], [0.11, 0.05], [0.125, 0.13], [0.13, 0.15], [0.122, 0.15], [0.115, 0.13], [0.1, 0.055], [0.055, 0.008], [0, 0.008]], 24),
      this.m.steel,
    );
    bowl.position.set(0, 0.05, 0.08);
    g.add(base, column, head, band, nose, beater, knob, bowl);
    g.userData.bowlAnchor = new THREE.Vector3(0, 0.06, 0.08);
    return shadowed(g);
  }

  /** Brick dome oven (the hero kitchen appliance). userData.mouth = local mouth center, userData.door = door group. */
  brickOven(): THREE.Group {
    const g = new THREE.Group();
    const plinthW = 1.7;
    const plinthD = 1.35;
    const plinthH = 0.85;
    const plinth = new THREE.Mesh(worldBox(plinthW, plinthH, plinthD, 1.4), this.m.plaster);
    plinth.position.y = plinthH / 2;
    g.add(plinth);
    // Log niche in the plinth.
    const niche = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.05), this.mats.flat('#3a2620'));
    niche.position.set(0, 0.32, plinthD / 2 + 0.001);
    g.add(niche);
    for (let i = 0; i < 7; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.4, 9), this.mats.flat(i % 2 ? '#8a5a3a' : '#a06a44'));
      log.rotation.x = Math.PI / 2;
      const row = i < 4 ? 0 : 1;
      log.position.set(-0.24 + (i % 4) * 0.16 + row * 0.08, 0.17 + row * 0.11, plinthD / 2 - 0.15);
      g.add(log);
    }
    // Brick hearth ledge.
    const ledge = new THREE.Mesh(worldBox(plinthW + 0.08, 0.12, plinthD + 0.06, 0.6), this.m.brick);
    ledge.position.y = plinthH + 0.06;
    g.add(ledge);
    // Dome.
    // Dome = closed cap + lower band with a front gap for the mouth (the arch covers the edges).
    const capT = 0.75;
    const gap = 0.5;
    for (const geo of [
      new THREE.SphereGeometry(0.72, 32, 8, 0, Math.PI * 2, 0, capT),
      new THREE.SphereGeometry(0.72, 32, 8, Math.PI / 2 + gap, Math.PI * 2 - gap * 2, capT, Math.PI / 2 - capT),
    ]) {
      const dome = new THREE.Mesh(geo, this.m.brick);
      dome.scale.set(1.08, 0.95, 0.85);
      dome.position.set(0, plinthH + 0.12, -0.05);
      scaleUV(dome.geometry, 3);
      g.add(dome);
    }
    // Plaster skirt over the dome base (like the concept).
    // Arched brick mouth surround.
    const archShape = new THREE.Shape();
    archShape.moveTo(-0.38, 0);
    archShape.lineTo(-0.38, 0.22);
    archShape.absarc(0, 0.22, 0.38, Math.PI, 0, true);
    archShape.lineTo(0.38, 0);
    archShape.lineTo(-0.38, 0);
    const hole = new THREE.Path();
    hole.moveTo(-0.26, 0);
    hole.lineTo(-0.26, 0.2);
    hole.absarc(0, 0.2, 0.26, Math.PI, 0, true);
    hole.lineTo(0.26, 0);
    hole.lineTo(-0.26, 0);
    archShape.holes.push(hole);
    const arch = new THREE.Mesh(new THREE.ExtrudeGeometry(archShape, { depth: 0.22, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 }), this.m.brick);
    scaleUV(arch.geometry, 1 / 0.6);
    arch.position.set(0, plinthH + 0.12, 0.5);
    g.add(arch);
    // Dark interior + glowing fire bed.
    const cavity = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.mats.flat('#2a1610', { emissive: '#ff6a20', emissiveIntensity: 0.1 }));
    cavity.material.side = THREE.BackSide;
    cavity.scale.set(1, 0.85, 0.85);
    cavity.position.set(0, plinthH + 0.12, 0.05);
    g.add(cavity);
    const floorGlow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), this.mats.flat('#3a1d12', { emissive: '#ff8a3a', emissiveIntensity: 0.15 }));
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.set(0, plinthH + 0.125, 0.05);
    g.add(floorGlow);
    const fire = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.26, 7), this.m.emberGlow);
      ember.rotation.set(Math.PI / 2, 0, this.rnd(-0.6, 0.6));
      ember.position.set(this.rnd(-0.42, -0.24), 0.03, this.rnd(-0.3, 0.0));
      fire.add(ember);
    }
    for (let i = 0; i < 6; i++) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 7), this.m.fireCore);
      flame.position.set(this.rnd(-0.42, -0.26), 0.11, this.rnd(-0.32, -0.02));
      flame.scale.setScalar(this.rnd(0.6, 0.9));
      flame.userData.phase = this.rnd(0, 6);
      flame.layers.set(NO_OUTLINE_LAYER);
      fire.add(flame);
    }
    fire.position.set(0, plinthH + 0.12, 0);
    fire.name = 'fire';
    g.add(fire);
    // Iron door (swings open around the left hinge).
    const doorPivot = new THREE.Group();
    doorPivot.position.set(-0.27, plinthH + 0.12, 0.74);
    const doorShape = new THREE.Shape();
    doorShape.moveTo(0, 0);
    doorShape.lineTo(0, 0.2);
    doorShape.absarc(0.27, 0.2, 0.27, Math.PI, 0, true);
    doorShape.lineTo(0.54, 0);
    doorShape.lineTo(0, 0);
    // Iron frame around a big arched glass window, so the bread can be watched rising.
    const pane = new THREE.Path();
    pane.moveTo(0.06, 0.025);
    pane.lineTo(0.06, 0.2);
    pane.absarc(0.27, 0.2, 0.21, Math.PI, 0, true);
    pane.lineTo(0.48, 0.025);
    pane.lineTo(0.06, 0.025);
    doorShape.holes.push(pane);
    const door = new THREE.Mesh(new THREE.ExtrudeGeometry(doorShape, { depth: 0.03, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1 }), this.m.iron);
    const glassShape = new THREE.Shape(pane.getPoints(24));
    const glassPane = new THREE.Mesh(
      new THREE.ShapeGeometry(glassShape),
      this.mats.role('ovenGlass', () => this.mats.painted({ color: '#ffd9a8', transparent: true, opacity: 0.16, spec: 1, specSize: 0.25, rim: 0.6 })),
    );
    glassPane.position.z = 0.016;
    glassPane.layers.set(NO_OUTLINE_LAYER);
    const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.014, 0.02), this.m.iron);
    crossBar.position.set(0.27, 0.33, 0.02);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 12), this.m.brass);
    handle.position.set(0.5, 0.12, 0.045);
    for (const hy of [0.06, 0.34]) {
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 8), this.m.brass);
      hinge.position.set(0.0, hy, 0.02);
      doorPivot.add(hinge);
    }
    doorPivot.add(door, glassPane, crossBar, handle);
    g.add(doorPivot);
    // Chimney pipe.
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.6, 16), this.m.iron);
    pipe.position.set(0, plinthH + 1.55, -0.3);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.12, 16), this.m.iron);
    collar.position.set(0, plinthH + 0.82, -0.3);
    g.add(pipe, collar);
    g.userData.mouth = new THREE.Vector3(0.06, plinthH + 0.13, 0.3);
    // Soft warm key inside the dome so baking bread reads golden, not fire-pink.
    const ovenLamp = new THREE.PointLight('#fff0d0', 1.1, 1.2, 1.5);
    ovenLamp.position.set(0.1, plinthH + 0.5, 0.42);
    g.add(ovenLamp);
    g.userData.door = doorPivot;
    g.userData.fire = fire;
    g.userData.firePos = new THREE.Vector3(-0.3, plinthH + 0.32, -0.1);
    shadowed(g);
    fire.traverse((o) => ((o as THREE.Mesh).castShadow = false));
    return g;
  }

  /** Tall glass-front proofing cabinet. userData.shelf = local tray anchor; userData.door = pivot. */
  proofer(): THREE.Group {
    const g = new THREE.Group();
    const w = 0.8;
    const d = 0.62;
    const h = 1.85;
    const sage = this.m.sage;
    const back = new THREE.Mesh(worldBox(w, h, 0.04, 1), sage);
    back.position.set(0, h / 2, -d / 2 + 0.02);
    const left = new THREE.Mesh(worldBox(0.05, h, d, 1), sage);
    left.position.set(-w / 2 + 0.025, h / 2, 0);
    const right = left.clone();
    right.position.x = w / 2 - 0.025;
    const top = new THREE.Mesh(worldBox(w + 0.06, 0.06, d + 0.06, 1), this.m.walnut);
    top.position.y = h + 0.03;
    const bottom = new THREE.Mesh(worldBox(w, 0.12, d, 1), sage);
    bottom.position.y = 0.06;
    g.add(back, left, right, top, bottom);
    const inner = this.mats.flat('#f7e7c4', { emissive: '#ffcf8a', emissiveIntensity: 0.25 });
    for (let i = 0; i < 4; i++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.015, d - 0.08), this.m.steel);
      shelf.position.set(0, 0.35 + i * 0.38, 0);
      g.add(shelf);
    }
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, h - 0.2), inner);
    glow.position.set(0, h / 2, -d / 2 + 0.045);
    g.add(glow);
    const doorPivot = new THREE.Group();
    doorPivot.position.set(-w / 2, 0, d / 2);
    const frame = new THREE.Group();
    const fm = this.m.sage;
    for (const [x, y, sx, sy] of [
      [w / 2, 0.08, w, 0.12],
      [w / 2, h - 0.06, w, 0.1],
      [0.04, h / 2, 0.08, h],
      [w - 0.04, h / 2, 0.08, h],
      [w / 2, 0.73, w, 0.05],
      [w / 2, 1.11, w, 0.05],
      [w / 2, 1.49, w, 0.05],
    ] as const) {
      const bar = new THREE.Mesh(worldBox(sx, sy, 0.04, 1), fm);
      bar.position.set(x, y, 0.02);
      frame.add(bar);
    }
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.14, h - 0.2), this.m.glass);
    pane.position.set(w / 2, h / 2, 0.02);
    pane.layers.set(NO_OUTLINE_LAYER);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), this.m.brass);
    knob.position.set(w - 0.09, 1.0, 0.06);
    doorPivot.add(frame, pane, knob);
    g.add(doorPivot);
    // Little thermometer dial.
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 18), this.m.brass);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0, h + 0.15, 0.1);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.04, 18), this.m.ceramic);
    face.position.set(0, h + 0.15, 0.111);
    g.add(dial, face);
    g.userData.door = doorPivot;
    g.userData.shelf = new THREE.Vector3(0, 0.35 + 0.38 * 1 + 0.01, 0);
    return shadowed(g);
  }

  framedArt(file: string, w: number, h: number): THREE.Group {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(worldBox(w + 0.1, h + 0.1, 0.035, 1), this.m.walnut);
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.03, h + 0.03), this.mats.flat('#f3e6cc'));
    mat.position.z = 0.018;
    const art = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.03, h - 0.03), this.mats.painted({ map: this.mats.textures.art(file) }));
    art.position.z = 0.019;
    g.add(frame, mat, art);
    return shadowed(g, false, true);
  }

  wallClock(): THREE.Group {
    const g = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 32), this.m.brass);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), this.mats.painted({ map: this.mats.textures.art('clock-face.webp') }));
    face.position.z = 0.005;
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.04, 24), this.m.walnut);
    back.rotation.x = Math.PI / 2;
    back.position.z = -0.02;
    const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.11, 0.006), this.m.iron);
    hourHand.geometry.translate(0, 0.045, 0);
    hourHand.position.z = 0.012;
    hourHand.name = 'hour';
    const minuteHand = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.16, 0.006), this.m.iron);
    minuteHand.geometry.translate(0, 0.07, 0);
    minuteHand.position.z = 0.016;
    minuteHand.name = 'minute';
    g.add(back, rim, face, hourHand, minuteHand);
    return shadowed(g, false, true);
  }

  breadPeel(): THREE.Group {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.012, 0.36, 2, 0.006), this.m.butcher);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 1.0, 8), this.m.butcher);
    handle.rotation.x = Math.PI / 2;
    handle.position.z = -0.68;
    g.add(blade, handle);
    return shadowed(g);
  }

  stool(): THREE.Group {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 18), this.m.walnut);
    seat.position.y = 0.62;
    g.add(seat);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.62, 8), this.m.walnut);
      leg.position.set(Math.cos(a) * 0.12, 0.31, Math.sin(a) * 0.12);
      leg.rotation.set(Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08);
      g.add(leg);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 18), this.m.walnut);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.25;
    g.add(ring);
    return shadowed(g);
  }

  chair(): THREE.Group {
    const g = this.stool();
    g.children[0].scale.set(1.15, 1, 1.15);
    (g.children[0] as THREE.Mesh).position.y = 0.46;
    g.children.slice(1, 5).forEach((leg) => {
      leg.scale.y = 0.74;
      leg.position.y = 0.23;
    });
    g.children[5].position.y = 0.18;
    const back = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 6, 18, Math.PI), this.m.walnut);
    back.position.set(0, 0.68, -0.15);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), this.m.walnut);
    post.position.set(0, 0.58, -0.17);
    g.add(back, post);
    return shadowed(g);
  }

  roundTable(): THREE.Group {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 28), this.m.walnut);
    top.position.y = 0.74;
    const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.47, 0.18, 28, 1, true), this.m.gingham);
    cloth.position.y = 0.67;
    const clothTop = new THREE.Mesh(new THREE.CircleGeometry(0.44, 28), this.m.gingham);
    clothTop.rotation.x = -Math.PI / 2;
    clothTop.position.y = 0.761;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 10), this.m.iron);
    stem.position.y = 0.37;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.04, 18), this.m.iron);
    foot.position.y = 0.02;
    g.add(top, cloth, clothTop, stem, foot);
    return shadowed(g);
  }

  chalkboard(w: number, h: number, art: THREE.Texture): THREE.Group {
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mats.painted({ color: '#ffffff', map: art }));
    board.position.z = 0.021;
    const frame = new THREE.Mesh(worldBox(w + 0.1, h + 0.1, 0.04, 1), this.m.walnut);
    g.add(frame, board);
    return shadowed(g, false, true);
  }

  cashRegister(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.2, 0.36, 3, 0.03), this.m.brass);
    body.position.y = 0.1;
    const top = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.18, 0.18, 3, 0.04), this.m.brass);
    top.position.set(0, 0.27, -0.06);
    top.rotation.x = -0.35;
    const sign = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.09, 0.03, 2, 0.01), this.m.cream);
    sign.position.set(0, 0.42, -0.1);
    const drawer = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.07, 0.38, 2, 0.015), this.m.walnut);
    drawer.position.y = 0.035;
    drawer.name = 'drawer';
    g.add(body, top, sign, drawer);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        const key = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10), this.m.ceramic);
        key.position.set(-0.11 + c * 0.075, 0.21 + r * 0.005, 0.1 - r * 0.05);
        key.rotation.x = -0.3;
        g.add(key);
      }
    }
    const crank = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 12, Math.PI), this.m.brass);
    crank.position.set(0.23, 0.15, 0);
    crank.rotation.y = Math.PI / 2;
    g.add(crank);
    return shadowed(g);
  }

  shopBell(): THREE.Group {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.015, 14), this.m.walnut);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.m.brass);
    dome.position.y = 0.01;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), this.m.brass);
    knob.position.y = 0.055;
    g.add(base, dome, knob);
    return shadowed(g);
  }

  paperBagStack(): THREE.Group {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.01, 0.32), this.m.kraft);
      bag.position.set(this.rnd(-0.01, 0.01), 0.006 + i * 0.011, this.rnd(-0.01, 0.01));
      bag.rotation.y = this.rnd(-0.06, 0.06);
      g.add(bag);
    }
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.1), this.m.kraft);
    upright.position.set(0.24, 0.13, 0);
    const fold = new THREE.Mesh(new THREE.BoxGeometry(0.162, 0.03, 0.102), this.mats.flat('#c9a46f'));
    fold.position.set(0.24, 0.245, 0);
    g.add(upright, fold);
    return shadowed(g);
  }

  logPile(): THREE.Group {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const row = i < 4 ? 0 : i < 7 ? 1 : 2;
      const idx = row === 0 ? i : row === 1 ? i - 4 : i - 7;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.5, 9), this.mats.flat(i % 3 ? '#8a5a3a' : '#a46c46'));
      log.rotation.x = Math.PI / 2;
      log.position.set(-0.22 + idx * 0.15 + row * 0.075, 0.07 + row * 0.125, 0);
      g.add(log);
    }
    return shadowed(g);
  }

  aFrameSign(art: THREE.Texture): THREE.Group {
    const g = new THREE.Group();
    const boardMat = this.mats.painted({ map: art });
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      const frame = new THREE.Mesh(worldBox(0.5, 0.8, 0.03, 1), this.m.walnut);
      frame.position.y = 0.4;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.66), boardMat);
      face.position.set(0, 0.42, 0.016);
      leg.add(frame, face);
      leg.rotation.x = s * 0.18;
      leg.rotation.y = s > 0 ? 0 : Math.PI;
      leg.position.z = s * 0.07;
      g.add(leg);
    }
    return shadowed(g);
  }
}

// ---------------- geometry utilities ----------------

export function lathe(points: Array<[number, number]>, segments = 20): THREE.LatheGeometry {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}

export function scaleUV(geo: THREE.BufferGeometry, s: number): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  uv.needsUpdate = true;
}

export function sagPlane(geo: THREE.PlaneGeometry, depth: number): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const w = geo.parameters.width / 2;
  const h = geo.parameters.height / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / w;
    const y = pos.getY(i) / h;
    const edge = Math.max(Math.abs(x), Math.abs(y));
    pos.setZ(i, -depth * (1 - edge * edge) + Math.sin(x * 7 + y * 3) * Math.abs(depth) * 0.25);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

export function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function roundedRectPoints(w: number, d: number, r: number, perCorner: number): THREE.Vector3[] {
  const pts = roundedRectShape(w, d, r).getSpacedPoints(perCorner * 8);
  pts.pop();
  return pts.map((p) => new THREE.Vector3(p.x, 0, -p.y));
}
