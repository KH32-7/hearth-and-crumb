import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export type QualitySettings = {
  maxDpr: number;
  shadowMap: number;
  outlines: boolean;
  bloom: boolean;
  fxaa: boolean;
  msaa: number;
};

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  low: { maxDpr: 1, shadowMap: 1024, outlines: true, bloom: false, fxaa: true, msaa: 0 },
  medium: { maxDpr: 1.25, shadowMap: 1024, outlines: true, bloom: true, fxaa: true, msaa: 0 },
  high: { maxDpr: 1.5, shadowMap: 2048, outlines: true, bloom: true, fxaa: true, msaa: 4 },
  ultra: { maxDpr: 2, shadowMap: 2048, outlines: true, bloom: true, fxaa: true, msaa: 4 },
};

/**
 * Storybook look, applied after the cel-lit scene render:
 *  - warm-brown ink lines from depth + normal discontinuities (normal prepass)
 *  - paper grain modulating value, like gouache on cold-press paper
 *  - gentle warm grade, plum-lifted shadows, soft vignette
 */
const PainterlyShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tNormal: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    tPaper: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.05 },
    uFar: { value: 60 },
    uLineColor: { value: new THREE.Color('#3a2014') },
    uLineStrength: { value: 0.85 },
    uLineWidth: { value: 1.0 },
    uGrain: { value: 0.11 },
    uVignette: { value: 0.32 },
    uSaturation: { value: 1.06 },
    uShadowTint: { value: new THREE.Color('#5a3a52') },
    uWarmth: { value: 0.05 },
    uOutlines: { value: 1 },
    uFlash: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tNormal;
    uniform sampler2D tDepth;
    uniform sampler2D tPaper;
    uniform vec2 uResolution;
    uniform float uNear, uFar;
    uniform vec3 uLineColor;
    uniform float uLineStrength, uLineWidth, uGrain, uVignette, uSaturation, uWarmth, uOutlines, uFlash;
    uniform vec3 uShadowTint;
    varying vec2 vUv;

    float linDepth(vec2 uv) {
      float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
      return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
    }
    vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 col = base.rgb;

      float edge = 0.0;
      if (uOutlines > 0.5) {
        vec2 px = uLineWidth / uResolution;
        float d0 = linDepth(vUv);
        vec3 n0 = nrm(vUv);
        float dl = linDepth(vUv - vec2(px.x, 0.0));
        float dr = linDepth(vUv + vec2(px.x, 0.0));
        float dd = linDepth(vUv - vec2(0.0, px.y));
        float du = linDepth(vUv + vec2(0.0, px.y));
        // Second-derivative depth test ignores smooth slopes (floors at grazing angles).
        float lap = abs(dl + dr - 2.0 * d0) + abs(dd + du - 2.0 * d0);
        float depthEdge = smoothstep(0.012, 0.03, lap / max(d0, 0.1));
        vec3 nl = nrm(vUv - vec2(px.x, 0.0));
        vec3 nr = nrm(vUv + vec2(px.x, 0.0));
        vec3 nd = nrm(vUv - vec2(0.0, px.y));
        vec3 nu = nrm(vUv + vec2(0.0, px.y));
        float nd2 = (1.0 - dot(n0, nl)) + (1.0 - dot(n0, nr)) + (1.0 - dot(n0, nd)) + (1.0 - dot(n0, nu));
        float normalEdge = smoothstep(0.35, 0.75, nd2);
        edge = max(depthEdge, normalEdge);
        // Lines thin out with distance so far detail doesn't become noise.
        edge *= 1.0 - smoothstep(9.0, 22.0, d0);
        // Skip sky / background.
        edge *= step(d0, uFar * 0.95);
      }

      // Ink: multiply toward warm brown, keeping hue of the underlying paint.
      vec3 inked = col * mix(vec3(1.0), uLineColor * 1.6, 0.85);
      col = mix(col, inked, edge * uLineStrength);

      // Grade (linear HDR, before tone mapping).
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, uSaturation);
      col += uShadowTint * (1.0 - smoothstep(0.0, 0.35, lum)) * 0.035;
      col *= vec3(1.0 + uWarmth, 1.0, 1.0 - uWarmth);

      // Paper grain: value modulation, stronger in mid tones like real gouache.
      float paper = texture2D(tPaper, vUv * uResolution / 512.0).r;
      float midW = 1.0 - abs(lum * 1.4 - 0.6);
      col *= 1.0 + (paper - 0.5) * uGrain * (0.6 + 0.6 * midW);

      // Vignette.
      float v = distance(vUv, vec2(0.5));
      col *= mix(1.0, smoothstep(0.85, 0.35, v), uVignette);

      col += vec3(1.0, 0.85, 0.6) * uFlash;
      gl_FragColor = vec4(col, base.a);
    }
  `,
};

export class RenderPipeline {
  readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloom: UnrealBloomPass;
  private readonly painterly: ShaderPass;
  private readonly fxaa: FXAAPass;
  private readonly normalTarget: THREE.WebGLRenderTarget;
  private readonly normalMaterial = new THREE.MeshNormalMaterial();
  private settings: QualitySettings;
  private width = 1;
  private height = 1;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    paper: THREE.Texture,
    level: QualityLevel,
  ) {
    this.settings = QUALITY[level];
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: this.settings.msaa,
    });
    this.composer = new EffectComposer(renderer, target);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.18, 0.45, 0.95);
    this.composer.addPass(this.bloom);

    this.normalTarget = new THREE.WebGLRenderTarget(1, 1, {
      depthTexture: new THREE.DepthTexture(1, 1),
      depthBuffer: true,
    });
    this.normalTarget.depthTexture!.type = THREE.UnsignedIntType;

    this.painterly = new ShaderPass(PainterlyShader);
    this.painterly.uniforms.tNormal.value = this.normalTarget.texture;
    this.painterly.uniforms.tDepth.value = this.normalTarget.depthTexture;
    this.painterly.uniforms.tPaper.value = paper;
    this.composer.addPass(this.painterly);

    this.composer.addPass(new OutputPass());
    this.fxaa = new FXAAPass();
    this.composer.addPass(this.fxaa);
    this.applyQuality(level);
  }

  get uniforms() {
    return this.painterly.uniforms;
  }

  applyQuality(level: QualityLevel): void {
    this.settings = QUALITY[level];
    this.bloom.enabled = this.settings.bloom;
    this.fxaa.enabled = this.settings.fxaa;
    this.painterly.uniforms.uOutlines.value = this.settings.outlines ? 1 : 0;
    this.renderer.shadowMap.needsUpdate = true;
  }

  get maxDpr(): number {
    return this.settings.maxDpr;
  }

  get shadowMapSize(): number {
    return this.settings.shadowMap;
  }

  setSize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    const w = Math.floor(width * dpr);
    const h = Math.floor(height * dpr);
    this.normalTarget.setSize(w, h);
    this.painterly.uniforms.uResolution.value.set(w, h);
    this.painterly.uniforms.uLineWidth.value = Math.max(1, dpr * 0.9);
    this.bloom.resolution.set(w / 2, h / 2);
  }

  render(): void {
    const u = this.painterly.uniforms;
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    if (this.settings.outlines) {
      // Normal + depth prepass for ink lines. Transparent/vfx objects opt out via layer 1.
      const bg = this.scene.background;
      const prevMask = this.camera.layers.mask;
      this.scene.background = null;
      this.scene.overrideMaterial = this.normalMaterial;
      this.camera.layers.set(0);
      this.renderer.setRenderTarget(this.normalTarget);
      this.renderer.setClearColor(0x8080ff, 1);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(0x000000, 1);
      this.scene.overrideMaterial = null;
      this.scene.background = bg;
      this.camera.layers.mask = prevMask;
    }
    this.composer.render();
  }

  /** Brief warm screen flash for "PERFECT" moments. */
  setFlash(v: number): void {
    this.painterly.uniforms.uFlash.value = v;
  }

  dispose(): void {
    this.normalTarget.dispose();
    this.composer.dispose();
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}

/** Layer for objects excluded from outlines (glow cards, particles, light shafts, transparent glass). */
export const NO_OUTLINE_LAYER = 1;
