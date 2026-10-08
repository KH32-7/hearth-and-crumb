import * as THREE from 'three';
import './hud.css';
import { t, won, type StringKey } from './i18n';

export const RECIPE_STEPS: StringKey[] = ['step.ingredients', 'step.mix', 'step.shape', 'step.proof', 'step.finish', 'step.bake', 'step.display', 'step.sell'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

export class Hud {
  readonly root: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly promptText: HTMLSpanElement;
  private readonly subhint: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly recipe: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  readonly vcursor: HTMLDivElement;
  private readonly controlsHint: HTMLDivElement;
  private readonly labels = new Map<string, HTMLDivElement>();
  private readonly labelUsed = new Set<string>();
  private lastStatus = '';
  private lastRecipe = '';

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud hidden', parent);
    this.crosshair = el('div', 'crosshair', this.root);
    this.prompt = el('div', 'prompt paper', this.root);
    const key = el('span', 'key', this.prompt);
    key.textContent = '클릭';
    this.promptText = el('span', '', this.prompt);
    this.subhint = el('div', 'subhint', this.root);
    this.status = el('div', 'status paper', this.root);
    this.recipe = el('div', 'recipe paper', this.root);
    this.toasts = el('div', 'toasts', this.root);
    this.vcursor = el('div', 'vcursor', this.root);
    this.controlsHint = el('div', 'controls-hint', this.root);
    this.controlsHint.textContent = t('controls.move');
  }

  show(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  setPrompt(text: string | null, enabled = true): void {
    this.crosshair.classList.toggle('active', !!text && enabled);
    this.prompt.classList.toggle('show', !!text);
    this.prompt.classList.toggle('disabled', !enabled);
    if (text) this.promptText.textContent = text;
  }

  setSubhint(text: string): void {
    this.subhint.textContent = text;
  }

  setCrosshairVisible(v: boolean): void {
    this.crosshair.style.display = v ? '' : 'none';
    this.controlsHint.style.visibility = v ? '' : 'hidden';
    if (!v) this.prompt.classList.remove('show');
  }

  fadeControlsHint(): void {
    this.controlsHint.style.opacity = '0';
  }

  setStatus(day: number, clock: string, money: number, reputation: number, phase: 'prep' | 'open' | 'closed', dayProgress: number): void {
    const key = `${day}|${clock}|${money}|${reputation.toFixed(1)}|${phase}`;
    if (key === this.lastStatus) return;
    this.lastStatus = key;
    const full = Math.round(reputation * 2) / 2;
    const stars = '★'.repeat(Math.floor(full)) + (full % 1 ? '½' : '') + '☆'.repeat(5 - Math.ceil(full));
    const hue = dayProgress < 0.75 ? '' : `background: radial-gradient(circle at 40% 40%, #ffd0a0, #c8562a)`;
    this.status.innerHTML = `
      <div class="day">${t('hud.day', { n: day })}</div>
      <div class="clock"><span class="sun" style="${hue}"></span>${clock}</div>
      <div class="money">₩${won(money)}</div>
      <div class="stars">${stars}</div>
      <div class="open ${phase === 'open' ? '' : 'closed'}">● ${phase === 'open' ? t('hud.open') : phase === 'prep' ? t('hud.prep') : t('hud.closed')}</div>`;
  }

  setRecipe(title: string, current: number): void {
    const key = `${title}|${current}`;
    if (key === this.lastRecipe) return;
    this.lastRecipe = key;
    const items = RECIPE_STEPS.map((s, i) => `<li class="${i < current ? 'done' : i === current ? 'now' : ''}">${t(s)}</li>`).join('');
    this.recipe.innerHTML = `<h3>${t('hud.recipe')} · ${title}</h3><ol>${items}</ol>`;
  }

  toast(text: string, tone: 'good' | 'bad' | 'info' | 'money' = 'info'): void {
    const tEl = el('div', `toast paper ${tone}`, this.toasts);
    tEl.textContent = text;
    setTimeout(() => tEl.remove(), 3200);
    while (this.toasts.children.length > 5) this.toasts.firstChild?.remove();
  }

  stamp(grade: string, label: string, stars: number): void {
    const s = el('div', `stamp ${grade}`, this.root);
    s.innerHTML = `${label}<span class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
    setTimeout(() => s.remove(), 2800);
  }

  /** World-anchored label; call every frame for each visible label, then `endLabels()`. */
  label(id: string, world: THREE.Vector3, camera: THREE.Camera, html: string): void {
    const p = world.clone().project(camera);
    let e = this.labels.get(id);
    if (!e) {
      e = el('div', 'wlabel paper', this.root);
      this.labels.set(id, e);
    }
    this.labelUsed.add(id);
    const visible = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
    e.style.display = visible ? '' : 'none';
    if (!visible) return;
    e.style.left = `${THREE.MathUtils.clamp(((p.x + 1) / 2) * 100, 8, 92)}%`;
    e.style.top = `${THREE.MathUtils.clamp(((1 - p.y) / 2) * 100, 14, 90)}%`;
    if (e.dataset.html !== html) {
      e.innerHTML = html;
      e.dataset.html = html;
    }
  }

  endLabels(): void {
    for (const [id, e] of this.labels) {
      if (!this.labelUsed.has(id)) e.style.display = 'none';
    }
    this.labelUsed.clear();
  }

  /** Cooking-Mama style floating praise text. */
  pop(text: string, x: number, y: number, tone: 'good' | 'great' | 'meh' = 'good'): void {
    const p = el('div', `pop ${tone}`, this.root);
    p.textContent = text;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    setTimeout(() => p.remove(), 1100);
  }

  setVirtualCursor(x: number | null, y = 0, down = false): void {
    if (x === null) {
      this.vcursor.classList.remove('show');
      return;
    }
    this.vcursor.classList.add('show');
    this.vcursor.classList.toggle('down', down);
    this.vcursor.style.left = `${x}px`;
    this.vcursor.style.top = `${y}px`;
  }
}
