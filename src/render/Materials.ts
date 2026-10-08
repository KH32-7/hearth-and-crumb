import * as THREE from 'three';
import { TextureLibrary, type TextureKey } from './Textures';

/**
 * Painterly cel material kit. Everything in the world uses MeshToonMaterial with
 * one shared soft 3-band ramp; shadow colour comes from the warm/plum hemisphere
 * fill in LightingRig, so shadows read brown-violet instead of grey.
 *
 * `painted()` adds an optional stylised specular blob + warm rim so glossy
 * roles (ceramic, copper, glass, glaze) still sparkle without leaving the look.
 */
export type PaintedOptions = {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  spec?: number; // 0..1 strength of stylised highlight
  specSize?: number; // 0..1 (larger = bigger blob)
  rim?: number; // warm rim strength
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  vertexColors?: boolean;
};

export const PALETTE = {
  cream: '#f3e3c3',
  butter: '#e9b95c',
  terracotta: '#b5553a',
  olive: '#7c8a4a',
  sage: '#8f9c6a',
  chocolate: '#4a2e22',
  ink: '#3a2219',
  copper: '#c4743f',
  steel: '#b9b3a8',
  ceramic: '#f4ead8',
  glass: '#cfe3df',
  flourSack: '#efe2c6',
};

export class MaterialLibrary {
  private readonly shared = new Map<string, THREE.Material>();

  constructor(readonly textures: TextureLibrary) {}

  /** Shared material per role key (reuse aggressively to keep programs and draw state low). */
  role(key: string, make: () => THREE.Material): THREE.Material {
    let m = this.shared.get(key);
    if (!m) {
      m = make();
      m.name = key;
      this.shared.set(key, m);
    }
    return m;
  }

  painted(opts: PaintedOptions = {}): THREE.MeshToonMaterial {
    const mat = new THREE.MeshToonMaterial({
      color: opts.color ?? '#ffffff',
      map: opts.map ?? null,
      gradientMap: this.textures.toonRamp,
      emissive: opts.emissive ?? '#000000',
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      vertexColors: opts.vertexColors ?? false,
    });
    const spec = opts.spec ?? 0;
    const rim = opts.rim ?? 0;
    if (spec > 0 || rim > 0) addStylisedSpecular(mat, spec, opts.specSize ?? 0.5, rim);
    return mat;
  }

  /** Painted texture role, tiled by `metersPerTile` (UVs are world-scaled by geometry helpers). */
  tex(key: TextureKey, color: THREE.ColorRepresentation = '#ffffff', extra: PaintedOptions = {}): THREE.MeshToonMaterial {
    return this.role(`tex:${key}:${color}:${extra.spec ?? 0}`, () =>
      this.painted({ ...extra, color, map: this.textures.get(key) }),
    ) as THREE.MeshToonMaterial;
  }

  flat(color: THREE.ColorRepresentation, extra: PaintedOptions = {}): THREE.MeshToonMaterial {
    const key = `flat:${new THREE.Color(color).getHexString()}:${extra.spec ?? 0}:${extra.rim ?? 0}:${extra.emissiveIntensity ?? 0}`;
    return this.role(key, () => this.painted({ ...extra, color })) as THREE.MeshToonMaterial;
  }
}

/**
 * Inject a thresholded Blinn highlight and warm fresnel rim into a toon material.
 * The highlight is gated by the toon diffuse term so it vanishes in shadow.
 */
export function addStylisedSpecular(mat: THREE.MeshToonMaterial, strength: number, size: number, rim: number): void {
  mat.userData.specStrength = strength;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSpec = { value: strength };
    shader.uniforms.uSpecSize = { value: size };
    shader.uniforms.uRim = { value: rim };
    mat.userData.shader = shader;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uSpec;
uniform float uSpecSize;
uniform float uRim;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  vec3 V = normalize(vViewPosition);
  vec3 N = normalize(normal);
  float lit = clamp(dot(reflectedLight.directDiffuse, vec3(0.333)) / max(dot(diffuseColor.rgb, vec3(0.333)), 0.001), 0.0, 1.0);
  #if NUM_DIR_LIGHTS > 0
    vec3 L = directionalLights[0].direction;
    vec3 H = normalize(L + V);
    float nh = max(dot(N, H), 0.0);
    float power = mix(220.0, 18.0, uSpecSize);
    float blob = smoothstep(0.45, 0.62, pow(nh, power));
    outgoingLight += directionalLights[0].color * blob * uSpec * smoothstep(0.25, 0.6, lit) * 0.55;
  #endif
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  outgoingLight += vec3(1.0, 0.78, 0.52) * smoothstep(0.35, 0.75, fres) * uRim * 0.35;
}
#include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'stylised-spec';
}

// ---------- geometry helpers with world-scaled UVs ----------

/** Box whose UVs are in meters / metersPerTile, so textures keep a consistent texel density. */
export function worldBox(w: number, h: number, d: number, metersPerTile = 1): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims: Array<[number, number]> = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = dims[face];
    for (let i = 0; i < 4; i++) {
      const idx = face * 4 + i;
      uv.setXY(idx, (uv.getX(idx) * su) / metersPerTile, (uv.getY(idx) * sv) / metersPerTile);
    }
  }
  uv.needsUpdate = true;
  return g;
}

export function worldPlane(w: number, h: number, metersPerTile = 1): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / metersPerTile, (uv.getY(i) * h) / metersPerTile);
  uv.needsUpdate = true;
  return g;
}

export function shadowed<T extends THREE.Object3D>(obj: T, cast = true, receive = true): T {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
  return obj;
}
