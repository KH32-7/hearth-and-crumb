import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { Hud } from '../ui/Hud';
import { t } from '../ui/i18n';

/**
 * Cooking-Mama style minigames. While one runs the camera sits in a station
 * view and the mouse drives a virtual cursor (pointer stays locked, so no
 * re-click is needed afterwards).
 */
export interface Minigame {
  readonly title: string;
  help(): string;
  /** Return true when finished. */
  update(dt: number, io: MinigameIO): boolean;
  readonly score: number;
  readonly panelExtra?: HTMLElement;
  dispose?(): void;
}

export type MinigameIO = {
  input: Input;
  cursor: THREE.Vector2; // CSS px
  down: boolean;
  pressed: boolean;
  released: boolean;
  camera: THREE.Camera;
  width: number;
  height: number;
  emit: (sfx: string, volume?: number) => void;
};

export class MinigameHost {
  private active: Minigame | null = null;
  private queue: Minigame[] = [];
  private panel: HTMLDivElement | null = null;
  private helpEl: HTMLParagraphElement | null = null;
  private resultEl: HTMLDivElement | null = null;
  private onFinish: ((scores: number[]) => void) | null = null;
  private scores: number[] = [];
  private readonly cursor = new THREE.Vector2();
  private betweenTimer = 0;

  constructor(
    private readonly hud: Hud,
    private readonly input: Input,
    private readonly camera: THREE.Camera,
    private readonly emit: (sfx: string, volume?: number) => void,
  ) {}

  get running(): boolean {
    return this.active !== null || this.queue.length > 0;
  }

  run(games: Minigame[], onFinish: (scores: number[]) => void): void {
    this.queue = games.slice();
    this.scores = [];
    this.onFinish = onFinish;
    this.cursor.set(window.innerWidth / 2, window.innerHeight * 0.45);
    this.next();
  }

  private next(): void {
    this.panel?.remove();
    this.active = this.queue.shift() ?? null;
    if (!this.active) {
      this.hud.setVirtualCursor(null);
      const cb = this.onFinish;
      this.onFinish = null;
      cb?.(this.scores);
      return;
    }
    const p = document.createElement('div');
    p.className = 'mg paper';
    const h = document.createElement('h2');
    h.textContent = this.active.title;
    this.helpEl = document.createElement('p');
    this.helpEl.textContent = this.active.help();
    p.append(h, this.helpEl);
    if (this.active.panelExtra) p.append(this.active.panelExtra);
    this.resultEl = document.createElement('div');
    this.resultEl.className = 'result';
    p.append(this.resultEl);
    this.hud.root.append(p);
    this.panel = p;
  }

  setResult(text: string): void {
    if (this.resultEl) this.resultEl.textContent = text;
  }

  update(dt: number): void {
    if (!this.active) return;
    if (this.betweenTimer > 0) {
      this.betweenTimer -= dt;
      if (this.betweenTimer <= 0) this.next();
      return;
    }
    const inp = this.input;
    if (inp.locked) {
      this.cursor.x = THREE.MathUtils.clamp(this.cursor.x + inp.mouseDX, 0, window.innerWidth);
      this.cursor.y = THREE.MathUtils.clamp(this.cursor.y + inp.mouseDY, 0, window.innerHeight);
    } else {
      this.cursor.set(inp.cursorX, inp.cursorY);
    }
    const io: MinigameIO = {
      input: inp,
      cursor: this.cursor,
      down: inp.mouseDown[0],
      pressed: inp.mousePressed[0],
      released: inp.mouseReleased[0],
      camera: this.camera,
      width: window.innerWidth,
      height: window.innerHeight,
      emit: this.emit,
    };
    this.hud.setVirtualCursor(this.cursor.x, this.cursor.y, io.down);
    const done = this.active.update(dt, io);
    if (this.helpEl) this.helpEl.textContent = this.active.help();
    if (done) {
      this.scores.push(this.active.score);
      this.active.dispose?.();
      this.setResult(gradeText(this.active.score));
      this.betweenTimer = 0.9;
    }
  }

  cancel(): void {
    this.queue = [];
    this.active = null;
    this.panel?.remove();
    this.hud.setVirtualCursor(null);
    this.onFinish = null;
  }
}

export function gradeText(score: number): string {
  if (score >= 0.92) return `✦ ${t('grade.perfect')} ✦`;
  if (score >= 0.75) return t('grade.great');
  if (score >= 0.5) return t('grade.good');
  return '…';
}

function gauge(zone: [number, number]): { root: HTMLDivElement; needle: HTMLDivElement; fill: HTMLDivElement } {
  const root = document.createElement('div');
  root.className = 'gauge';
  const fill = document.createElement('div');
  fill.className = 'fill';
  fill.style.width = '0%';
  const z = document.createElement('div');
  z.className = 'zone';
  z.style.left = `${zone[0] * 100}%`;
  z.style.width = `${(zone[1] - zone[0]) * 100}%`;
  const needle = document.createElement('div');
  needle.className = 'needle';
  root.append(fill, z, needle);
  return { root, needle, fill };
}

// ---------------------------------------------------------------- Mix

export class MixGame implements Minigame {
  readonly title = t('mg.mix.title');
  score = 0;
  readonly panelExtra: HTMLElement;
  private value = 0;
  private speed = 0;
  private holding = false;
  private readonly zone: [number, number] = [0.62, 0.8];
  private readonly g = gauge(this.zone);

  constructor(private readonly onProgress: (value: number, running: boolean) => void) {
    this.panelExtra = this.g.root;
  }

  help(): string {
    return t('mg.mix.help');
  }

  update(dt: number, io: MinigameIO): boolean {
    if (io.down) {
      if (!this.holding) io.emit('mixer_loop_start');
      this.holding = true;
      this.speed = Math.min(0.42, this.speed + dt * 0.5);
      this.value += this.speed * dt;
    } else if (this.holding) {
      this.holding = false;
      io.emit('mixer_loop_stop');
      if (this.value > 0.08) return this.finish();
      this.speed = 0;
    }
    if (this.value >= 1) {
      this.value = 1;
      io.emit('mixer_loop_stop');
      return this.finish();
    }
    this.g.needle.style.left = `${this.value * 100}%`;
    this.g.fill.style.width = `${this.value * 100}%`;
    this.onProgress(this.value, this.holding);
    return false;
  }

  private finish(): boolean {
    const center = (this.zone[0] + this.zone[1]) / 2;
    const half = (this.zone[1] - this.zone[0]) / 2;
    const d = Math.abs(this.value - center);
    this.score = d <= half ? 1 - (d / half) * 0.12 : Math.max(0.2, 0.88 - (d - half) * 2.4);
    this.onProgress(this.value, false);
    return true;
  }
}

// ---------------------------------------------------------------- Divide

export class DivideGame implements Minigame {
  readonly title = t('mg.divide.title');
  score = 0;
  readonly panelExtra: HTMLElement;
  private pieces = 0;
  private weight = 0;
  private holding = false;
  private readonly scores: number[] = [];
  private readonly g = gauge([0.53, 0.67]);
  private readonly label = document.createElement('div');

  constructor(private readonly onPiece: (index: number, grams: number, pulling: number) => void, private readonly count = 6) {
    this.label.className = 'result';
    this.panelExtra = document.createElement('div');
    this.panelExtra.append(this.g.root, this.label);
  }

  help(): string {
    return t('mg.divide.help', { n: this.pieces });
  }

  update(dt: number, io: MinigameIO): boolean {
    if (io.down) {
      if (!this.holding) io.emit('scraper_cut', 0.6);
      this.holding = true;
      // Eases in so fine control near the target is possible.
      this.weight += dt * (35 + this.weight * 0.9);
      this.weight = Math.min(this.weight, 110);
      this.onPiece(this.pieces, this.weight, this.weight / 110);
    } else if (this.holding) {
      this.holding = false;
      const s = Math.max(0, 1 - Math.abs(this.weight - 60) / 30);
      this.scores.push(s);
      this.onPiece(this.pieces, this.weight, -1);
      io.emit('dough_plop', 0.8);
      this.label.textContent = `${Math.round(this.weight)}g · ${gradeText(s)}`;
      this.pieces++;
      this.weight = 0;
      if (this.pieces >= this.count) {
        this.score = this.scores.reduce((a, b) => a + b, 0) / this.scores.length;
        return true;
      }
    }
    const frac = this.weight / 110;
    this.g.needle.style.left = `${frac * 100}%`;
    this.g.fill.style.width = `${frac * 100}%`;
    if (this.holding) this.label.textContent = `${Math.round(this.weight)}g`;
    return false;
  }
}

// ---------------------------------------------------------------- Round

export class RoundGame implements Minigame {
  readonly title = t('mg.round.title');
  score = 0;
  private index = 0;
  private angle = 0;
  private lastA: number | null = null;
  private timer = 0;
  private readonly times: number[] = [];
  private readonly screen = new THREE.Vector2();

  constructor(
    private readonly targets: THREE.Object3D[],
    private readonly onProgress: (index: number, progress: number) => void,
  ) {}

  help(): string {
    return t('mg.round.help', { n: this.index });
  }

  update(dt: number, io: MinigameIO): boolean {
    const target = this.targets[this.index];
    if (!target) return true;
    this.timer += dt;
    const wp = new THREE.Vector3();
    target.getWorldPosition(wp);
    wp.project(io.camera);
    this.screen.set(((wp.x + 1) / 2) * io.width, ((1 - wp.y) / 2) * io.height);
    const dx = io.cursor.x - this.screen.x;
    const dy = io.cursor.y - this.screen.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 14 && dist < 190) {
      const a = Math.atan2(dy, dx);
      if (this.lastA !== null) {
        let d = a - this.lastA;
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        this.angle += Math.abs(d);
        if (Math.floor((this.angle - Math.abs(d)) / Math.PI) !== Math.floor(this.angle / Math.PI)) io.emit('roll_shape', 0.5);
      }
      this.lastA = a;
    } else {
      this.lastA = null;
    }
    const progress = Math.min(1, this.angle / (Math.PI * 4));
    this.onProgress(this.index, progress);
    if (progress >= 1) {
      this.times.push(this.timer);
      io.emit('dough_plop', 0.5);
      this.index++;
      this.angle = 0;
      this.lastA = null;
      this.timer = 0;
      if (this.index >= this.targets.length) {
        const avg = this.times.reduce((a, b) => a + b, 0) / this.times.length;
        this.score = THREE.MathUtils.clamp(1.12 - avg * 0.08, 0.55, 1);
        return true;
      }
    }
    return false;
  }
}

// ---------------------------------------------------------------- Glaze

export class GlazeGame implements Minigame {
  readonly title = t('mg.glaze.title');
  score = 0;
  private readonly amounts: number[];
  private brushTimer = 0;

  constructor(
    private readonly targets: THREE.Object3D[],
    private readonly onGlaze: (index: number, amount: number) => void,
  ) {
    this.amounts = targets.map(() => 0);
  }

  help(): string {
    return t('mg.glaze.help');
  }

  update(dt: number, io: MinigameIO): boolean {
    if (io.input.pressed('Space') || io.input.pressed('Enter')) return this.finish();
    if (io.down) {
      this.brushTimer -= dt;
      const wp = new THREE.Vector3();
      this.targets.forEach((tg, i) => {
        tg.getWorldPosition(wp);
        wp.project(io.camera);
        const sx = ((wp.x + 1) / 2) * io.width;
        const sy = ((1 - wp.y) / 2) * io.height;
        if (Math.hypot(io.cursor.x - sx, io.cursor.y - sy) < 70 && this.amounts[i] < 1) {
          const moving = Math.abs(io.input.mouseDX) + Math.abs(io.input.mouseDY) > 0.5 || !io.input.locked;
          this.amounts[i] = Math.min(1, this.amounts[i] + dt * (moving ? 1.6 : 0.4));
          this.onGlaze(i, this.amounts[i]);
          if (this.brushTimer <= 0) {
            io.emit('brush_glaze', 0.4);
            this.brushTimer = 0.25;
          }
        }
      });
    }
    if (this.amounts.every((a) => a >= 1)) return this.finish();
    return false;
  }

  private finish(): boolean {
    this.score = this.amounts.reduce((a, b) => a + b, 0) / this.amounts.length;
    return true;
  }
}
