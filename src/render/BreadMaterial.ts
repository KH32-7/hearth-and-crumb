import * as THREE from 'three';

/**
 * The hero shader. One continuous "doneness" model drives every bread from raw
 * dough to burnt, using the colour stops sampled from the approved bread
 * concept sheet (artifacts/concepts/bread-sheet.png):
 *
 *   raw #F6E3C6 → proofed #FCE6B3 → half #FCC16A → side-gold #F7AF40
 *   → PERFECT #EB7A33 → dark #A8502A → burnt #4A2618
 *
 * Tops and peaks brown first (topness + crust detail), score cuts stay pale,
 * glaze adds a cel highlight blob, flour dusts the crown, a warm bounce keeps
 * the shadow side looking soft and edible rather than grey.
 */
export type BreadLook = {
  bake: number; // 0 raw … 1 perfect … 1.3 burnt
  glaze: number; // 0..1 egg wash / butter
  flour: number; // 0..1 dusting
  smooth: number; // 0 rough shaggy dough … 1 smooth skin (kneading)
  bloom: number; // 0..1 score cuts burst open in the oven
  seed: number;
  tint: THREE.Color; // per-recipe crust tint multiplier (e.g. croissant amber)
};

const STOPS = [
  // Authored for AgX output: inputs are shifted toward yellow so the displayed
  // crust lands on the concept sheet's golden orange instead of salmon.
  { t: 0.0, c: new THREE.Color('#f6e6c8') },
  { t: 0.3, c: new THREE.Color('#fbe7b0') },
  { t: 0.55, c: new THREE.Color('#f8cf6a') },
  { t: 0.78, c: new THREE.Color('#f0b444') },
  { t: 1.0, c: new THREE.Color('#e09a30') },
  { t: 1.14, c: new THREE.Color('#ad6a2a') },
  { t: 1.3, c: new THREE.Color('#4e2c16') },
];

const shaderStops = STOPS.map((s) => `vec4(${s.c.r.toFixed(4)}, ${s.c.g.toFixed(4)}, ${s.c.b.toFixed(4)}, ${s.t.toFixed(3)})`);

/** Shared look-dev knobs (live-tunable in dev via window.__game.breadTuning). */
export const BREAD_TUNING = {
  uSat: { value: 1.6 },
  uVal: { value: 0.9 },
  uExposure: { value: 0.9 },
  uFlat: { value: 0.55 },
};

export class BreadMaterial extends THREE.MeshToonMaterial {
  readonly look: BreadLook;
  private readonly uniformsRef: Record<string, THREE.IUniform>;

  constructor(gradientMap: THREE.Texture, crust: THREE.Texture, look?: Partial<BreadLook>) {
    super({ color: '#ffffff', gradientMap });
    this.look = {
      bake: 0,
      glaze: 0,
      flour: 0.6,
      smooth: 1,
      bloom: 0,
      seed: Math.random() * 10,
      tint: new THREE.Color('#ffffff'),
      ...look,
    };
    const uniforms: Record<string, THREE.IUniform> = {
      uBake: { value: this.look.bake },
      uGlaze: { value: this.look.glaze },
      uFlour: { value: this.look.flour },
      uSmooth: { value: this.look.smooth },
      uBloom: { value: this.look.bloom },
      uSeed: { value: this.look.seed },
      uTint: { value: this.look.tint },
      uCrust: { value: crust },
      uHighlight: { value: 0 },
    };
    this.uniformsRef = uniforms;
    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms, BREAD_TUNING);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute float aScore;
attribute float aGlaze;
uniform float uBloom;
varying float vGlaze;
varying vec3 vBreadPos;
varying vec3 vBreadNormal;
varying float vScore;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vBreadPos = position;
vBreadNormal = normal;
vScore = aScore;
vGlaze = aGlaze;
// A fresh cut is a shallow groove; in the oven the ridges heave up and open (oven spring).
transformed += normal * aScore * (uBloom * 0.014 - 0.01 * (1.0 - uBloom));
transformed.y += aScore * uBloom * 0.01;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uBake;
uniform float uGlaze;
uniform float uFlour;
uniform float uSmooth;
uniform float uSeed;
uniform vec3 uTint;
uniform float uHighlight;
uniform float uSat;
uniform float uVal;
uniform float uExposure;
uniform float uFlat;
uniform sampler2D uCrust;
varying vec3 vBreadPos;
varying vec3 vBreadNormal;
varying float vScore;
varying float vGlaze;

vec3 breadRamp(float t) {
  vec4 s[${STOPS.length}];
  ${shaderStops.map((v, i) => `s[${i}] = ${v};`).join('\n  ')}
  vec3 c = s[0].rgb;
  for (int i = 1; i < ${STOPS.length}; i++) {
    float k = clamp((t - s[i-1].a) / (s[i].a - s[i-1].a), 0.0, 1.0);
    c = mix(c, s[i].rgb, k);
  }
  return c;
}

float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

vec4 triplanar(sampler2D tex, vec3 p, vec3 n, float scale) {
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z);
  return texture2D(tex, p.yz * scale) * w.x + texture2D(tex, p.xz * scale) * w.y + texture2D(tex, p.xy * scale) * w.z;
}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
{
  vec3 n = normalize(vBreadNormal);
  float topness = smoothstep(-0.35, 0.95, n.y);
  float detail = triplanar(uCrust, vBreadPos + uSeed, n, 7.0).r;
  float coarse = triplanar(uCrust, vBreadPos * 0.35 + uSeed * 0.3, n, 3.0).r;
  // Peaks and the crown brown first, the underside sits on the hot tray.
  float bottom = smoothstep(-0.55, -0.9, n.y);
  float local = uBake * (0.72 + 0.4 * topness) + (detail - 0.5) * 0.22 * smoothstep(0.2, 0.9, uBake) + (coarse - 0.5) * 0.12;
  local += bottom * 0.25 * uBake;
  // Score cuts open into paler crumb.
  local = mix(local, uBake * 0.45, vScore);
  vec3 crust = breadRamp(clamp(local, 0.0, 1.3)) * mix(vec3(1.0), uTint, smoothstep(0.3, 0.9, uBake));
  // Raw dough: shaggy/rough until kneaded smooth.
  float shag = (1.0 - uSmooth) * (detail - 0.5) * 0.35;
  crust += shag * (1.0 - smoothstep(0.0, 0.4, uBake));
  // Flour dusting on the crown, fades as the crust browns.
  float flourMask = smoothstep(0.42, 0.72, triplanar(uCrust, vBreadPos * 1.7 + 3.1, n, 5.0).r + topness * 0.25);
  crust = mix(crust, vec3(0.98, 0.95, 0.88), flourMask * uFlour * (1.0 - smoothstep(0.6, 1.1, uBake) * 0.55) * 0.85);
  // AgX desaturates warm oranges toward pink; pre-compensate so baked crust lands golden.
  float bakedness = smoothstep(0.35, 1.0, uBake);
  float cl = dot(crust, vec3(0.299, 0.587, 0.114));
  crust = mix(vec3(cl), crust, mix(1.0, uSat, bakedness));
  crust *= mix(1.0, uVal, bakedness);

  // A fresh cut in raw dough shows a slightly darker, damp line (opens pale once baked).
  crust *= mix(1.0, 0.72, vScore * (1.0 - smoothstep(0.25, 0.6, uBake)));
  // Wet egg wash on raw dough reads as a glossy butter-yellow film.
  crust = mix(crust, crust * vec3(1.05, 0.95, 0.7), vGlaze * (1.0 - bakedness) * 0.85);
  diffuseColor.rgb *= clamp(crust, 0.0, 1.0);
}`,
        )
        .replace(
          '#include <opaque_fragment>',
          `{
  vec3 V = normalize(vViewPosition);
  vec3 N = normalize(normal);
  float lit = clamp(dot(reflectedLight.directDiffuse, vec3(0.333)) / max(dot(diffuseColor.rgb, vec3(0.333)), 0.001), 0.0, 1.0);
  // The room is lit bright and pastel; bread gets its own exposure so the crust
  // stays rich golden instead of washing to white under AgX.
  float baked = smoothstep(0.3, 1.0, uBake);
  outgoingLight *= mix(1.0, uExposure, baked);
  // Illustration flat-fill: blend toward the pure crust colour so the bread keeps
  // its painted hue regardless of how hot the room lighting is.
  outgoingLight = mix(outgoingLight, diffuseColor.rgb * (0.78 + 0.3 * lit), uFlat * (0.4 + 0.6 * baked));
  // Soft warm bounce: bread never goes grey in shadow (fake subsurface).
  outgoingLight += diffuseColor.rgb * vec3(0.24, 0.16, 0.06) * (1.0 - lit);
  float gl = max(uGlaze, vGlaze);
  // Wet glaze shines even before baking; baked glaze keeps the golden gloss.
  float shine = mix(0.18, 1.0, gl) * mix(0.35 + 0.65 * smoothstep(0.4, 0.95, uBake), 0.45, gl * (1.0 - smoothstep(0.2, 0.6, uBake))) * (1.0 - smoothstep(1.1, 1.3, uBake));
  #if NUM_DIR_LIGHTS > 0
    vec3 L = directionalLights[0].direction;
    vec3 H = normalize(L + V);
    float nh = max(dot(N, H), 0.0);
    float blob = smoothstep(0.5, 0.62, pow(nh, mix(60.0, 26.0, gl)));
    float speck = step(0.86, hash21(floor(vBreadPos.xz * 90.0) + uSeed)) * smoothstep(0.3, 0.9, pow(nh, 8.0));
    outgoingLight += directionalLights[0].color * (blob * 0.75 + speck * 0.35 * gl) * shine * smoothstep(0.2, 0.55, lit);
  #endif
  // Golden rim so the silhouette glows against the room (the "illustration" pop).
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
  outgoingLight += vec3(1.0, 0.72, 0.38) * smoothstep(0.3, 0.8, fres) * 0.22 * (0.4 + 0.6 * smoothstep(0.5, 1.0, uBake));
  // Interaction highlight pulse.
  outgoingLight += vec3(1.0, 0.86, 0.6) * uHighlight * 0.25;
}
#include <opaque_fragment>`,
        );
    };
    this.customProgramCacheKey = () => 'bread-v1';
  }

  /** Push look values to the GPU; cheap, call whenever the bread state changes. */
  sync(): void {
    const u = this.uniformsRef;
    u.uBake.value = this.look.bake;
    u.uGlaze.value = this.look.glaze;
    u.uFlour.value = this.look.flour;
    u.uSmooth.value = this.look.smooth;
    u.uBloom.value = this.look.bloom;
    u.uSeed.value = this.look.seed;
    (u.uTint.value as THREE.Color).copy(this.look.tint);
  }

  setHighlight(v: number): void {
    this.uniformsRef.uHighlight.value = v;
  }
}
