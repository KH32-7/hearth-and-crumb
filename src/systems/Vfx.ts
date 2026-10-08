import * as THREE from 'three';
import { NO_OUTLINE_LAYER } from '../render/RenderPipeline';

type Particle = {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  color: THREE.Color;
  alpha: number;
  drag: number;
  gravity: number;
  spin: number;
};

const MAX = 600;

/**
 * Pooled billboard particles (one draw call per sprite sheet). Every effect is
 * an event response: steam on fresh bread, flour puffs when working dough,
 * sparkles on a perfect bake, coins at the register.
 */
export class VfxSystem {
  readonly group = new THREE.Group();
  private readonly soft: ParticleLayer;
  private readonly sparkle: ParticleLayer;
  private readonly emitters: Array<{ pos: THREE.Vector3; rate: number; acc: number; until: number; kind: 'steam' | 'heat' }> = [];
  private time = 0;

  constructor(softDot: THREE.Texture) {
    this.soft = new ParticleLayer(softDot, THREE.NormalBlending);
    this.sparkle = new ParticleLayer(createStarTexture(), THREE.AdditiveBlending);
    this.group.add(this.soft.points, this.sparkle.points);
  }

  setScale(pixelsPerUnitAtOneMeter: number): void {
    for (const l of [this.soft, this.sparkle]) (l.points.material as THREE.ShaderMaterial).uniforms.uScale.value = pixelsPerUnitAtOneMeter;
  }

  steam(at: THREE.Vector3, amount = 10, spread = 0.18): void {
    for (let i = 0; i < amount; i++) {
      this.soft.spawn({
        pos: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * 0.05, (Math.random() - 0.5) * spread)),
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.05, 0.18 + Math.random() * 0.18, (Math.random() - 0.5) * 0.05),
        life: 1.6 + Math.random() * 1.2,
        size: 0.06 + Math.random() * 0.05,
        grow: 0.16,
        color: new THREE.Color('#fff7ec'),
        alpha: 0.16,
        drag: 0.4,
        gravity: -0.02,
      });
    }
  }

  flourPuff(at: THREE.Vector3, amount = 16): void {
    for (let i = 0; i < amount; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).normalize();
      this.soft.spawn({
        pos: at.clone(),
        vel: dir.multiplyScalar(0.25 + Math.random() * 0.35),
        life: 0.8 + Math.random() * 0.8,
        size: 0.03 + Math.random() * 0.04,
        grow: 0.12,
        color: new THREE.Color('#fffaf0'),
        alpha: 0.6,
        drag: 2.5,
        gravity: 0.08,
      });
    }
  }

  sparkles(at: THREE.Vector3, amount = 24, color = '#ffd36a', radius = 0.3): void {
    for (let i = 0; i < amount; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
      this.sparkle.spawn({
        pos: at.clone().addScaledVector(dir, Math.random() * radius * 0.4),
        vel: dir.multiplyScalar(0.4 + Math.random() * 0.8),
        life: 0.7 + Math.random() * 0.7,
        size: 0.05 + Math.random() * 0.05,
        grow: -0.03,
        color: new THREE.Color(color),
        alpha: 1,
        drag: 2.2,
        gravity: 0.3,
        spin: (Math.random() - 0.5) * 6,
      });
    }
  }

  coins(at: THREE.Vector3): void {
    this.sparkles(at, 14, '#ffcf4a', 0.2);
  }

  smoke(at: THREE.Vector3, amount = 12): void {
    for (let i = 0; i < amount; i++) {
      this.soft.spawn({
        pos: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)),
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.08),
        life: 2 + Math.random(),
        size: 0.08,
        grow: 0.22,
        color: new THREE.Color('#5a4a44'),
        alpha: 0.45,
        drag: 0.3,
        gravity: -0.03,
      });
    }
  }

  /** Continuous gentle steam from a point (fresh bread cooling). */
  emitSteam(pos: THREE.Vector3, seconds: number, rate = 6): void {
    this.emitters.push({ pos: pos.clone(), rate, acc: 0, until: this.time + seconds, kind: 'steam' });
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      if (this.time > e.until) {
        this.emitters.splice(i, 1);
        continue;
      }
      e.acc += dt * e.rate;
      while (e.acc >= 1) {
        e.acc -= 1;
        this.steam(e.pos, 1, 0.3);
      }
    }
    this.soft.update(dt);
    this.sparkle.update(dt);
  }
}

class ParticleLayer {
  readonly points: THREE.Points;
  private readonly particles: Particle[] = [];
  private readonly positions = new Float32Array(MAX * 3);
  private readonly colors = new Float32Array(MAX * 4);
  private readonly sizes = new Float32Array(MAX);
  private readonly angles = new Float32Array(MAX);
  private cursor = 0;

  constructor(map: THREE.Texture, blending: THREE.Blending) {
    for (let i = 0; i < MAX; i++) {
      this.particles.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 0.1,
        grow: 0,
        color: new THREE.Color(),
        alpha: 1,
        drag: 0,
        gravity: 0,
        spin: 0,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('angle', new THREE.BufferAttribute(this.angles, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending,
      uniforms: { uMap: { value: map }, uScale: { value: 900 } },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float angle;
        attribute vec4 color;
        varying vec4 vColor;
        varying float vAngle;
        uniform float uScale;
        void main() {
          vColor = color;
          vAngle = angle;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(-mv.z, 0.05);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec4 vColor;
        varying float vAngle;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float c = cos(vAngle), s = sin(vAngle);
          p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
          vec4 tex = texture2D(uMap, p);
          gl_FragColor = vec4(vColor.rgb * tex.rgb, tex.a * vColor.a);
          if (gl_FragColor.a < 0.01) discard;
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.layers.set(NO_OUTLINE_LAYER);
    this.points.renderOrder = 20;
  }

  spawn(p: Partial<Particle> & { pos: THREE.Vector3; vel: THREE.Vector3; life: number }): void {
    const slot = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % MAX;
    slot.alive = true;
    slot.pos.copy(p.pos);
    slot.vel.copy(p.vel);
    slot.life = p.life;
    slot.maxLife = p.life;
    slot.size = p.size ?? 0.1;
    slot.grow = p.grow ?? 0;
    slot.color.copy(p.color ?? new THREE.Color('#ffffff'));
    slot.alpha = p.alpha ?? 1;
    slot.drag = p.drag ?? 0;
    slot.gravity = p.gravity ?? 0;
    slot.spin = p.spin ?? 0;
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      const p = this.particles[i];
      if (!p.alive) {
        this.colors[i * 4 + 3] = 0;
        this.sizes[i] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.colors[i * 4 + 3] = 0;
        this.sizes[i] = 0;
        continue;
      }
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.size = Math.max(0.001, p.size + p.grow * dt);
      const t = 1 - p.life / p.maxLife;
      const fade = Math.min(1, t * 6) * (1 - t);
      this.positions.set([p.pos.x, p.pos.y, p.pos.z], i * 3);
      this.colors.set([p.color.r, p.color.g, p.color.b, p.alpha * fade], i * 4);
      this.sizes[i] = p.size;
      this.angles[i] += p.spin * dt;
    }
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.angle as THREE.BufferAttribute).needsUpdate = true;
  }
}

function createStarTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 === 0 ? 30 : 6;
    ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
