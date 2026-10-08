import * as THREE from 'three';
import { NO_OUTLINE_LAYER } from './RenderPipeline';

/**
 * Late-afternoon storybook lighting:
 *  key   – low golden sun through the west window (only shadow caster)
 *  fill  – hemisphere cream sky / plum ground → shadows tint warm violet
 *  prac. – brick-oven fire (flicker), pendant lamps (warm pools)
 *  air   – additive light shafts + floating flour motes in the beam
 *
 * `setTimeOfDay(t)` (0 morning … 1 night) rebalances everything for the day cycle.
 */
export class LightingRig {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;
  readonly fire: THREE.PointLight;
  readonly lamps: THREE.PointLight[] = [];
  private readonly shafts: THREE.Mesh[] = [];
  private readonly shaftMaterial: THREE.ShaderMaterial;
  private readonly motes: THREE.Points;
  private readonly moteBase: Float32Array;
  private fireBase = 6;
  private time = 0;

  constructor(softDot: THREE.Texture) {
    this.hemi = new THREE.HemisphereLight('#ffe9c8', '#6b4a5e', 1.0);
    this.group.add(this.hemi);
    this.ambient = new THREE.AmbientLight('#8a6a78', 0.28);
    this.group.add(this.ambient);

    this.sun = new THREE.DirectionalLight('#ffd08a', 2.7);
    this.sun.position.set(-11, 6.2, -3.2);
    this.sun.target.position.set(0, 0.6, -1.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.near = 2;
    sc.far = 26;
    sc.left = -7;
    sc.right = 7;
    sc.top = 6;
    sc.bottom = -6;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    this.group.add(this.sun, this.sun.target);

    this.fire = new THREE.PointLight('#ff7a30', this.fireBase, 4.5, 1.2);
    this.group.add(this.fire);

    this.shaftMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color('#ffc97a') },
        uStrength: { value: 0.14 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uStrength;
        varying vec2 vUv;
        varying vec3 vWorld;
        float hash(float n) { return fract(sin(n) * 43758.5453); }
        float noise(float x) { float i = floor(x); float f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
        void main() {
          // uv.x across the beam, uv.y along it (0 at the window).
          float across = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
          float along = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
          float streak = 0.65 + 0.35 * noise(vUv.x * 9.0 + uTime * 0.15) * noise(vUv.x * 23.0 - uTime * 0.07);
          float a = across * along * streak * uStrength;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
    });

    const moteCount = 260;
    this.moteBase = new Float32Array(moteCount * 3);
    const positions = new Float32Array(moteCount * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.motes = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: softDot,
        color: '#ffe2a8',
        size: 0.035,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.motes.frustumCulled = false;
    this.motes.layers.set(NO_OUTLINE_LAYER);
    this.group.add(this.motes);
  }

  /** Beam from a window rectangle along the sun direction. */
  addWindowShaft(center: THREE.Vector3, width: number, height: number, normal: THREE.Vector3, length = 6.5): void {
    const dir = this.sun.target.position.clone().sub(this.sun.position).normalize();
    // Cross-beam basis: horizontal along the window plane, vertical up.
    const tangent = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
    const geo = new THREE.BufferGeometry();
    const corners = [
      center.clone().addScaledVector(tangent, -width / 2).addScaledVector(new THREE.Vector3(0, 1, 0), -height / 2),
      center.clone().addScaledVector(tangent, width / 2).addScaledVector(new THREE.Vector3(0, 1, 0), -height / 2),
      center.clone().addScaledVector(tangent, width / 2).addScaledVector(new THREE.Vector3(0, 1, 0), height / 2),
      center.clone().addScaledVector(tangent, -width / 2).addScaledVector(new THREE.Vector3(0, 1, 0), height / 2),
    ];
    // Two crossed ribbons (horizontal + vertical slabs) read as a volume from most angles.
    const verts: number[] = [];
    const uvs: number[] = [];
    const quad = (a: THREE.Vector3, b: THREE.Vector3) => {
      const a2 = a.clone().addScaledVector(dir, length);
      const b2 = b.clone().addScaledVector(dir, length);
      verts.push(...a.toArray(), ...b.toArray(), ...b2.toArray(), ...a.toArray(), ...b2.toArray(), ...a2.toArray());
      uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    };
    const midL = corners[0].clone().lerp(corners[3], 0.5);
    const midR = corners[1].clone().lerp(corners[2], 0.5);
    const midB = corners[0].clone().lerp(corners[1], 0.5);
    const midT = corners[3].clone().lerp(corners[2], 0.5);
    quad(midL, midR);
    quad(midB, midT);
    quad(corners[0].clone().lerp(corners[3], 0.2), corners[1].clone().lerp(corners[2], 0.2));
    quad(corners[0].clone().lerp(corners[3], 0.8), corners[1].clone().lerp(corners[2], 0.8));
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    const mesh = new THREE.Mesh(geo, this.shaftMaterial);
    mesh.layers.set(NO_OUTLINE_LAYER);
    mesh.renderOrder = 10;
    this.shafts.push(mesh);
    this.group.add(mesh);

    // Seed motes inside this beam.
    const pos = this.motes.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const s = Math.random();
      const p = center
        .clone()
        .addScaledVector(tangent, (Math.random() - 0.5) * width)
        .addScaledVector(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * height)
        .addScaledVector(dir, 0.3 + s * length * 0.7);
      this.moteBase.set(p.toArray(), i * 3);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    pos.needsUpdate = true;
  }

  addLamp(position: THREE.Vector3, intensity = 2.2): THREE.PointLight {
    const lamp = new THREE.PointLight('#ffb766', intensity, 6, 1.8);
    lamp.position.copy(position);
    this.lamps.push(lamp);
    this.group.add(lamp);
    return lamp;
  }

  setFire(position: THREE.Vector3, base: number): void {
    this.fire.position.copy(position);
    this.fireBase = base;
  }

  /** 0 = morning, 0.5 = golden afternoon, 0.8 = sunset, 1 = evening lamps. */
  setTimeOfDay(t: number): void {
    const sunColor = new THREE.Color().lerpColors(new THREE.Color('#fff0cf'), new THREE.Color('#ffb46a'), THREE.MathUtils.smoothstep(t, 0.3, 0.85));
    this.sun.color.copy(sunColor);
    this.sun.intensity = THREE.MathUtils.lerp(2.6, 2.9, t) * (1 - THREE.MathUtils.smoothstep(t, 0.82, 1.0));
    // Sun lowers through the day: steeper morning, near-horizontal sunset.
    const elev = THREE.MathUtils.lerp(8.5, 3.0, t);
    this.sun.position.set(-11, elev, THREE.MathUtils.lerp(-5.5, -1.5, t));
    this.hemi.intensity = THREE.MathUtils.lerp(1.05, 0.6, THREE.MathUtils.smoothstep(t, 0.7, 1));
    this.hemi.color.lerpColors(new THREE.Color('#fff1d6'), new THREE.Color('#e7b48c'), t);
    for (const l of this.lamps) l.intensity = THREE.MathUtils.lerp(0.7, 2.6, THREE.MathUtils.smoothstep(t, 0.55, 1));
    (this.shaftMaterial.uniforms.uStrength.value as number) = 0.14 * (1 - THREE.MathUtils.smoothstep(t, 0.8, 0.98));
    this.shaftMaterial.uniforms.uColor.value.copy(sunColor);
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    this.shaftMaterial.uniforms.uTime.value = t;
    // Layered-sine flicker reads as wood fire, not strobe.
    this.fire.intensity = this.fireBase * (0.86 + 0.08 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 13.1 + 1.3) + 0.03 * Math.sin(t * 29.7));
    const pos = this.motes.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const bx = this.moteBase[i * 3];
      const by = this.moteBase[i * 3 + 1];
      const bz = this.moteBase[i * 3 + 2];
      const ph = i * 1.7;
      pos.setXYZ(i, bx + Math.sin(t * 0.21 + ph) * 0.12, by + Math.sin(t * 0.13 + ph * 0.5) * 0.15, bz + Math.cos(t * 0.17 + ph) * 0.12);
    }
    pos.needsUpdate = true;
  }

  applyShadowSize(size: number): void {
    if (this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }
}
