import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { Hud } from '../ui/Hud';
import type { VfxSystem } from '../systems/Vfx';
import type { EventBus } from './Events';
import type { Interaction, Interactable } from './Interaction';
import type { PropKit } from '../world/props';
import type { BakeryWorld } from '../world/BakeryWorld';
import type { Player } from './Player';
import type { CanvasArt } from '../render/CanvasArt';
import type { MaterialLibrary } from '../render/Materials';
import { GameState } from './State';
import { RECIPES } from './Recipes';
import { RecipePickGame } from './RecipePick';
import { Bread, BreadFactory, bakeQuality, bakeLabel, type RecipeId } from './Bread';
import { Tray, ingredientProp, type Held, type IngredientId } from './Items';
import { MinigameHost, MixGame, type Minigame } from './Minigames';
import { BenchTools, CroissantRollGame, GlazePaintGame, KneadGame, PullGame, RopeRollGame, RoundTactileGame, ScoreGame, type TactileDeps } from './Tactile';
import { t, won } from '../ui/i18n';

export interface Ctx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  player: Player;
  input: Input;
  hud: Hud;
  vfx: VfxSystem;
  events: EventBus;
  interaction: Interaction;
  breads: BreadFactory;
  kit: PropKit;
  mats: MaterialLibrary;
  art: CanvasArt;
  state: GameState;
  world: BakeryWorld;
  minigames: MinigameHost;
  rng: () => number;
  sfx: (id: string, volume?: number) => void;
  /** Locks player control (station views, beauty shots). */
  setBusy: (busy: boolean) => void;
  tools: BenchTools;
  /** Run `fn` after `seconds` of unpaused game time. */
  schedule: (seconds: number, fn: () => void) => void;
}

export abstract class Station implements Interactable {
  abstract id: string;
  abstract roots: THREE.Object3D[];
  highlight?: THREE.Object3D[];
  constructor(protected readonly ctx: Ctx) {}
  abstract prompt(held: Held): string | null;
  abstract interact(held: Held): void;
  update(_dt: number): void {}
  labels(): void {}
  /** Whether the current prompt is an actionable one (vs informational). */
  actionable(held: Held): boolean {
    void held;
    return true;
  }
  protected world(o: THREE.Object3D, local = new THREE.Vector3()): THREE.Vector3 {
    return o.localToWorld(local.clone());
  }
}

const INGREDIENTS: IngredientId[] = ['flour', 'water', 'yeast', 'butter'];

// ---------------------------------------------------------------- Pantry

export class PantryItem extends Station {
  id: string;
  roots: THREE.Object3D[];
  constructor(ctx: Ctx, private readonly item: IngredientId, obj: THREE.Object3D) {
    super(ctx);
    this.id = `pantry:${item}`;
    this.roots = [obj];
    this.highlight = [obj];
    // Generous invisible hit volume so small items are easy to target.
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.1;
    obj.add(hit);
  }
  prompt(held: Held): string | null {
    return held ? null : t(`take.${this.item}` as 'take.flour');
  }
  interact(held: Held): void {
    if (held) return;
    this.ctx.interaction.setHeld({ kind: 'ingredient', id: this.item, object: ingredientProp(this.ctx.kit, this.item) });
    this.ctx.sfx(this.item === 'flour' ? 'flour_pour' : 'pickup', 0.6);
    if (this.item === 'flour') this.ctx.vfx.flourPuff(this.world(this.roots[0], new THREE.Vector3(0, 0.4, 0)), 10);
  }
}

// ---------------------------------------------------------------- Mixer

export class MixerStation extends Station {
  id = 'mixer';
  roots: THREE.Object3D[];
  readonly added = new Set<IngredientId>();
  phase: 'idle' | 'mixing' | 'ready' = 'idle';
  /** Recipe picked for the batch in the bowl (or the last one made). */
  recipe: RecipeId = 'roll';
  private dough: Bread | null = null;
  private mixQuality = 0.8;
  private readonly contents = new THREE.Group();
  private readonly beater: THREE.Object3D | undefined;
  private spin = 0;

  constructor(ctx: Ctx, private readonly mixer: THREE.Group) {
    super(ctx);
    this.roots = [mixer];
    this.beater = mixer.getObjectByName('beater');
    this.contents.position.copy(mixer.userData.bowlAnchor as THREE.Vector3);
    this.contents.name = 'mixer-contents';
    mixer.add(this.contents);
  }

  missing(): IngredientId[] {
    return INGREDIENTS.filter((i) => !this.added.has(i));
  }

  actionable(held: Held): boolean {
    if (this.phase === 'mixing') return false;
    if (held?.kind === 'ingredient') return !this.added.has(held.id);
    if (held) return false;
    return this.phase === 'ready' || this.missing().length === 0;
  }

  prompt(held: Held): string | null {
    if (this.phase === 'mixing') return null;
    if (this.phase === 'ready') return held ? t('mixer.busy') : t('mixer.take');
    if (held?.kind === 'ingredient') {
      const name = t(`item.${held.id}` as 'item.flour');
      return this.added.has(held.id) ? t('mixer.already', { item: name }) : t('mixer.add', { item: name });
    }
    if (held) return null;
    const miss = this.missing();
    if (miss.length) return t('mixer.need', { list: miss.map((m) => t(`item.${m}` as 'item.flour')).join(', ') });
    return t('mixer.start');
  }

  interact(held: Held): void {
    if (this.phase === 'ready' && !held && this.dough) {
      const d = this.dough;
      this.dough = null;
      this.contents.remove(d.mesh);
      d.mesh.scale.multiplyScalar(1);
      this.ctx.interaction.setHeld({ kind: 'dough', bread: d, quality: this.mixQuality });
      this.phase = 'idle';
      this.added.clear();
      this.ctx.sfx('dough_plop');
      this.ctx.events.emit('tutorial', { step: 'dough-taken' });
      return;
    }
    if (held?.kind === 'ingredient' && !this.added.has(held.id)) {
      this.added.add(held.id);
      this.ctx.interaction.setHeld(null);
      this.addContentBlob(held.id);
      const at = this.world(this.contents, new THREE.Vector3(0, 0.1, 0));
      if (held.id === 'flour') {
        this.ctx.vfx.flourPuff(at, 22);
        this.ctx.sfx('flour_pour');
      } else if (held.id === 'water') this.ctx.sfx('water_pour');
      else this.ctx.sfx('place_metal', 0.5);
      return;
    }
    if (!held && this.phase === 'idle' && this.missing().length === 0) this.startMixing();
  }

  private addContentBlob(id: IngredientId): void {
    const colors: Record<IngredientId, string> = { flour: '#fbf6ec', water: '#cfe3e6', yeast: '#d8b878', butter: '#f7dc7a' };
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.ctx.mats.flat(colors[id], { spec: id === 'water' ? 1 : 0.2 }));
    blob.scale.set(1, 0.5, 1);
    blob.position.set((this.contents.children.length % 2) * 0.03 - 0.015, 0.0 + this.contents.children.length * 0.012, 0);
    this.contents.add(blob);
  }

  private startMixing(): void {
    const ctx = this.ctx;
    this.phase = 'mixing';
    const bowl = this.world(this.contents);
    const view = this.world(this.mixer, new THREE.Vector3(0.05, 0.62, 0.62));
    ctx.player.enterView(view, bowl.clone().add(new THREE.Vector3(0, 0.05, 0)));
    ctx.setBusy(true);
    const pick = (recipe: RecipeId) => {
      this.recipe = recipe;
      const cost = ctx.state.rush ? 0 : RECIPES[recipe].cost;
      if (cost) {
        ctx.state.money -= cost;
        ctx.state.stats.costs += cost;
        ctx.events.emit('toast', { text: t('toast.cost', { cost: won(cost) }), tone: 'info' });
      }
      // Swap the ingredient blobs for a shaggy dough that smooths as it mixes.
      this.contents.clear();
      const dough = new Bread(ctx.breads, recipe, ctx.rng() * 10, 'dough');
      dough.baseScale.setScalar(0.55);
      dough.shaped = 0;
      dough.proof = 0.3;
      dough.apply();
      this.contents.add(dough.mesh);
      this.dough = dough;
    };
    ctx.minigames.run(
      [
        new RecipePickGame(pick, ctx.state.rush, this.recipe),
        new MixGame((v, running) => {
          const dough = this.dough;
          if (!dough) return;
          dough.shaped = Math.min(1, v * 1.25);
          dough.proof = 0.3 + v * 0.4;
          dough.apply();
          if (running) {
            this.spin += 0.6;
            dough.mesh.rotation.y += 0.25;
          }
        }),
      ],
      (scores) => {
        this.mixQuality = scores[1] ?? 0.7;
        this.phase = 'ready';
        ctx.player.exitView();
        ctx.setBusy(false);
        ctx.vfx.flourPuff(this.world(this.contents, new THREE.Vector3(0, 0.08, 0)), 12);
        ctx.events.emit('tutorial', { step: 'mixed' });
      },
    );
  }

  update(dt: number): void {
    if (this.beater) {
      this.beater.rotation.y += this.spin * dt * 20;
      this.spin *= Math.exp(-dt * 6);
    }
  }
}

// ---------------------------------------------------------------- Workbench

export class WorkbenchStation extends Station {
  id = 'bench';
  roots: THREE.Object3D[];
  phase: 'empty' | 'dough' | 'shaping' | 'tray' | 'finishing' = 'empty';
  private dough: Bread | null = null;
  private doughQuality = 0.8;
  private tray: Tray | null = null;
  private readonly anchor: THREE.Vector3;
  private readonly hitbox: THREE.Mesh;

  constructor(ctx: Ctx, anchor: THREE.Object3D) {
    super(ctx);
    this.anchor = anchor.position.clone();
    // Invisible bench-top hit volume (the island itself is static dressing).
    this.hitbox = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
    this.hitbox.position.copy(this.anchor).add(new THREE.Vector3(0.15, -0.03, -0.05));
    ctx.scene.add(this.hitbox);
    this.roots = [this.hitbox];
    this.highlight = [];
  }

  get trayOnBench(): Tray | null {
    return this.tray;
  }

  get doughOnBench(): Bread | null {
    return this.dough;
  }

  private canFinish(tray: Tray | null): boolean {
    return !!tray && !tray.baked && !tray.finished && tray.proof >= 0.6;
  }

  actionable(held: Held): boolean {
    if (this.phase === 'empty') return held?.kind === 'dough' || (held?.kind === 'tray' && !held.tray.baked);
    if (this.phase === 'dough') return !held;
    if (this.phase === 'tray') return !held;
    return false;
  }

  prompt(held: Held): string | null {
    switch (this.phase) {
      case 'empty':
        if (held?.kind === 'dough') return t('bench.place');
        if (held?.kind === 'tray' && !held.tray.baked) return this.canFinish(held.tray) ? t('bench.placeFinish') : t('bench.placeTray');
        return held ? null : t('bench.empty');
      case 'dough':
        return held ? null : t('bench.shape');
      case 'tray':
        if (held) return null;
        return this.canFinish(this.tray) ? t(`finish.${this.tray!.recipe}` as 'finish.roll') : t('bench.take');
      default:
        return null;
    }
  }

  secondaryPrompt(held: Held): string | null {
    return !held && this.phase === 'tray' && this.canFinish(this.tray) ? t('bench.takeAlt') : null;
  }

  secondary(held: Held): void {
    if (!held && this.phase === 'tray') this.takeTray();
  }

  interact(held: Held): void {
    const ctx = this.ctx;
    if (this.phase === 'empty' && held?.kind === 'dough') {
      ctx.interaction.setHeld(null);
      this.dough = held.bread;
      this.doughQuality = held.quality;
      this.dough.baseScale.setScalar(1);
      this.dough.mesh.position.copy(this.anchor).add(new THREE.Vector3(-0.32, 0, 0));
      this.dough.mesh.rotation.set(0, 0, 0);
      ctx.scene.add(this.dough.mesh);
      ctx.vfx.flourPuff(this.dough.mesh.position.clone().add(new THREE.Vector3(0, 0.05, 0)), 16);
      ctx.sfx('dough_plop');
      this.phase = 'dough';
      return;
    }
    if (this.phase === 'empty' && held?.kind === 'tray' && !held.tray.baked) {
      ctx.interaction.setHeld(null);
      this.tray = held.tray;
      this.placeTray();
      this.phase = 'tray';
      ctx.sfx('place_metal');
      return;
    }
    if (this.phase === 'dough' && !held) {
      this.startShaping();
      return;
    }
    if (this.phase === 'tray' && !held && this.tray) {
      if (this.canFinish(this.tray)) this.startFinishing();
      else this.takeTray();
    }
  }

  private takeTray(): void {
    const ctx = this.ctx;
    if (!this.tray) return;
    const tray = this.tray;
    this.tray = null;
    ctx.interaction.setHeld({ kind: 'tray', tray });
    this.phase = 'empty';
    ctx.sfx('place_metal', 0.5);
    ctx.events.emit('tutorial', { step: 'tray-taken' });
  }

  private placeTray(): void {
    if (!this.tray) return;
    this.tray.group.position.copy(this.anchor).add(new THREE.Vector3(0.3, 0, 0));
    this.tray.group.rotation.set(0, 0, 0);
    this.tray.group.scale.setScalar(1);
    this.ctx.scene.add(this.tray.group);
  }

  private deps(): TactileDeps {
    const ctx = this.ctx;
    return {
      scene: ctx.scene,
      planeY: this.anchor.y,
      tools: ctx.tools,
      vfx: ctx.vfx,
      hud: ctx.hud,
      breads: ctx.breads,
      rng: ctx.rng,
      sfx: ctx.sfx,
      view: (pos, look) => ctx.player.enterView(pos, look),
    };
  }

  /** Knead → pull pieces onto the tray → round them, all by hand. */
  private startShaping(): void {
    const ctx = this.ctx;
    const dough = this.dough!;
    this.phase = 'shaping';
    this.tray = new Tray(ctx.kit);
    const def = RECIPES[dough.recipe];
    this.tray.setRecipe(def.id);
    this.placeTray();
    ctx.setBusy(true);
    const deps = this.deps();
    const tray = this.tray;
    const shape: Minigame =
      def.shape === 'round'
        ? new RoundTactileGame(deps, tray)
        : def.shape === 'croissant'
          ? new CroissantRollGame(deps, tray)
          : new RopeRollGame(deps, tray, def.shape === 'pretzel');
    ctx.minigames.run([new KneadGame(deps, dough), new PullGame(deps, dough, tray, def.pieces, def.grams), shape], (scores) => {
      const [kn = 0.7, pl = 0.7, rd = 0.8] = scores;
      // Shaping is worth 80% of craft; scoring + egg wash on the bench adds the last 20%.
      tray.craft = THREE.MathUtils.clamp(this.doughQuality * 0.2 + kn * 0.2 + pl * 0.25 + rd * 0.15, 0, 0.8);
      this.ctx.interaction.forget(dough.mesh);
      dough.mesh.removeFromParent();
      dough.dispose();
      this.dough = null;
      this.phase = 'tray';
      ctx.player.exitView();
      ctx.setBusy(false);
      ctx.events.emit('tutorial', { step: 'shaped' });
    });
  }

  /** After proofing: draw the score with a knife, brush on egg wash. */
  private startFinishing(): void {
    const ctx = this.ctx;
    const tray = this.tray!;
    this.phase = 'finishing';
    ctx.setBusy(true);
    const deps = this.deps();
    const def = RECIPES[tray.recipe];
    const games: Minigame[] = [];
    if (def.score) games.push(new ScoreGame(deps, tray, def.scoreNeed, def.shape === 'log' ? 0.01 : 0.0075));
    if (def.glaze) games.push(new GlazePaintGame(deps, tray));
    ctx.minigames.run(games, (scores) => {
      const avg = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
      tray.craft = THREE.MathUtils.clamp(tray.craft + avg * 0.2, 0, 1);
      tray.finished = true;
      this.phase = 'tray';
      ctx.player.exitView();
      ctx.setBusy(false);
      ctx.events.emit('tutorial', { step: 'finished' });
    });
  }
}

// ---------------------------------------------------------------- Proofer

const PROOF_RATE = 1 / 16;

export class ProoferStation extends Station {
  id = 'proofer';
  roots: THREE.Object3D[];
  tray: Tray | null = null;
  private doorOpen = 0;
  private doorTarget = 0;
  private readonly door: THREE.Group;
  private dinged = false;

  constructor(ctx: Ctx, private readonly cabinet: THREE.Group) {
    super(ctx);
    this.roots = [cabinet];
    this.door = cabinet.userData.door as THREE.Group;
  }

  actionable(held: Held): boolean {
    return (held?.kind === 'tray' && !this.tray && !held.tray.baked) || (!held && !!this.tray);
  }

  prompt(held: Held): string | null {
    if (held?.kind === 'tray' && !this.tray) return held.tray.baked ? null : t('proofer.place');
    if (!held && this.tray) {
      const p = Math.round(Math.min(1, this.tray.proof) * 100);
      return p >= 100 ? t('proofer.take') : `${t('proofer.wait', { pct: p })} · ${t('proofer.take')}`;
    }
    return null;
  }

  interact(held: Held): void {
    const ctx = this.ctx;
    if (held?.kind === 'tray' && !this.tray && !held.tray.baked) {
      ctx.interaction.setHeld(null);
      this.tray = held.tray;
      const shelf = this.cabinet.localToWorld((this.cabinet.userData.shelf as THREE.Vector3).clone());
      this.tray.group.position.copy(shelf);
      this.tray.group.rotation.set(0, 0, 0);
      this.tray.group.scale.setScalar(1.15);
      ctx.scene.add(this.tray.group);
      this.flapDoor();
      this.dinged = false;
      ctx.sfx('place_metal');
      ctx.events.emit('tutorial', { step: 'proofing' });
      return;
    }
    if (!held && this.tray) {
      const tray = this.tray;
      this.tray = null;
      tray.group.scale.setScalar(1);
      ctx.interaction.setHeld({ kind: 'tray', tray });
      this.flapDoor();
      ctx.sfx('pickup');
    }
  }

  private flapDoor(): void {
    this.doorTarget = 1;
    this.ctx.schedule(0.7, () => (this.doorTarget = 0));
  }

  update(dt: number): void {
    this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, dt * 8);
    this.door.rotation.y = -this.doorOpen * 1.6;
    if (this.tray) {
      this.tray.forEach((b) => {
        const rate = (b.proof < 1 ? PROOF_RATE : PROOF_RATE * 0.25) * (this.ctx.state.rush ? 1.6 : 1);
        b.proof = Math.min(1.25, b.proof + rate * dt);
      });
      if (!this.dinged && this.tray.proof >= 1) {
        this.dinged = true;
        this.ctx.sfx('good_chime', 0.6);
      }
    }
  }

  labels(): void {
    if (!this.tray) return;
    const p = Math.min(1.25, this.tray.proof);
    const pos = this.cabinet.localToWorld(new THREE.Vector3(0, 1.55, 0.35));
    this.ctx.hud.label('proofer', pos, this.ctx.camera, `발효 ${Math.round(Math.min(1, p) * 100)}%<div class="meter proof"><i style="width:${(p / 1.25) * 100}%"></i><span class="zone" style="left:${(1 / 1.25) * 100 - 2}%;width:${(0.12 / 1.25) * 100}%"></span></div>`);
  }
}

// ---------------------------------------------------------------- Oven


export class OvenStation extends Station {
  id = 'oven';
  roots: THREE.Object3D[];
  tray: Tray | null = null;
  private doorOpen = 1;
  private readonly door: THREE.Group;
  private dingStage = 0;
  private presenting = false;
  peeking = false;
  private peekGrace = 0;

  constructor(ctx: Ctx, private readonly oven: THREE.Group) {
    super(ctx);
    this.roots = [oven];
    this.door = oven.userData.door as THREE.Group;
  }

  actionable(held: Held): boolean {
    if (this.presenting) return false;
    return (held?.kind === 'tray' && !this.tray && !held.tray.baked) || (!held && !!this.tray);
  }

  prompt(held: Held): string | null {
    if (this.presenting) return null;
    if (held?.kind === 'tray') {
      if (this.tray) return t('oven.busy');
      if (held.tray.baked) return null;
      if (held.tray.proof < 0.85) return t('oven.unproofed');
      return held.tray.finished ? t('oven.place') : t('oven.unfinished');
    }
    if (!held && this.tray) return t('oven.take');
    return null;
  }

  interact(held: Held): void {
    const ctx = this.ctx;
    if (this.presenting) return;
    if (held?.kind === 'tray' && !this.tray && !held.tray.baked) {
      ctx.interaction.setHeld(null);
      this.tray = held.tray;
      const mouth = this.oven.localToWorld((this.oven.userData.mouth as THREE.Vector3).clone());
      this.tray.group.position.copy(mouth);
      this.tray.group.rotation.set(0, 0, 0);
      this.tray.group.scale.setScalar(0.9);
      ctx.scene.add(this.tray.group);
      this.dingStage = 0;
      ctx.sfx('oven_close');
      ctx.events.emit('tutorial', { step: 'baking' });
      return;
    }
    if (!held && this.tray) this.takeOut();
  }

  secondaryPrompt(held: Held): string | null {
    return !held && this.tray && !this.presenting ? t('oven.peek') : null;
  }

  secondary(held: Held): void {
    if (held || !this.tray || this.presenting) return;
    this.peeking = true;
    this.peekGrace = 0.2;
    const ctx = this.ctx;
    const eye = this.oven.localToWorld(new THREE.Vector3(0.06, 1.27, 0.98));
    const look = this.oven.localToWorld(new THREE.Vector3(0.06, 0.99, 0.3));
    ctx.player.enterView(eye, look);
    ctx.setBusy(true);
    ctx.hud.setSubhint(t('oven.peekHelp'));
  }

  private endPeek(): void {
    this.peeking = false;
    this.ctx.player.exitView();
    this.ctx.setBusy(false);
    this.ctx.hud.setSubhint('');
  }

  private takeOut(): void {
    const ctx = this.ctx;
    if (this.peeking) {
      this.peeking = false;
      ctx.hud.setSubhint('');
    }
    const tray = this.tray!;
    this.tray = null;
    this.presenting = true;
    tray.baked = true;
    ctx.sfx('oven_open');
    const bake = tray.bake;
    const q = bakeQuality(bake);
    const label = bakeLabel(bake);
    // Beauty shot: tray slides onto the hearth ledge, camera swoops in.
    const ledge = this.oven.localToWorld(new THREE.Vector3(0, 0.98, 0.78));
    tray.group.position.copy(ledge);
    tray.group.scale.setScalar(1);
    const camPos = ledge.clone().add(new THREE.Vector3(0.0, 0.38, 0.42));
    ctx.player.enterView(camPos, ledge.clone().add(new THREE.Vector3(0, 0.02, 0)));
    ctx.setBusy(true);
    ctx.vfx.steam(ledge.clone().add(new THREE.Vector3(0, 0.12, -0.1)), 14, 0.4);
    ctx.vfx.emitSteam(ledge.clone().add(new THREE.Vector3(0, 0.06, 0)), 6, 5);
    const total = THREE.MathUtils.clamp(q * 0.65 + tray.craft * 0.35, 0, 1);
    const grade = label === 'burnt' ? 'burnt' : label === 'raw' || label === 'pale' ? 'raw' : total >= 0.9 ? 'perfect' : total >= 0.72 ? 'great' : 'good';
    ctx.schedule(0.65, () => {
      const stars = grade === 'perfect' ? 3 : grade === 'great' ? 2 : grade === 'good' ? 1 : 0;
      ctx.events.emit('stamp', { grade, label: t(`grade.${grade}` as 'grade.perfect') });
      ctx.hud.stamp(grade, t(`grade.${grade}` as 'grade.perfect'), stars);
      if (grade === 'perfect' || grade === 'great') {
        ctx.vfx.sparkles(ledge.clone().add(new THREE.Vector3(0, 0.1, 0)), grade === 'perfect' ? 40 : 20);
        ctx.sfx(grade === 'perfect' ? 'perfect_chime' : 'good_chime');
      } else if (grade === 'burnt') {
        ctx.vfx.smoke(ledge.clone().add(new THREE.Vector3(0, 0.08, 0)), 18);
        ctx.sfx('burnt_hiss');
      } else ctx.sfx('fail_soft');
    });
    tray.craft = total;
    ctx.events.emit('baked', { quality: total, count: tray.breads.length });
    ctx.schedule(2.3, () => {
      this.presenting = false;
      ctx.player.exitView();
      ctx.setBusy(false);
      ctx.interaction.setHeld({ kind: 'tray', tray });
    });
  }

  update(dt: number): void {
    this.peekGrace -= dt;
    if (this.peeking && this.peekGrace <= 0) {
      const inp = this.ctx.input;
      if (inp.mousePressed[0] && this.tray) this.takeOut();
      else if (inp.mousePressed[2] || inp.pressed('KeyS') || !this.tray) this.endPeek();
    }
    const target = this.tray ? 0 : 1;
    this.doorOpen += (target - this.doorOpen) * Math.min(1, dt * 6);
    this.door.rotation.y = -this.doorOpen * 1.75;
    if (this.tray) {
      const rate = (1 / RECIPES[this.tray.recipe].bakeSeconds) * (this.ctx.state.rush ? 1.3 : 1);
      this.tray.forEach((b) => {
        b.bake = Math.min(1.35, b.bake + rate * dt * (0.92 + 0.16 * ((b.material.look.seed * 7) % 1)));
        // Under-proofed bread browns but stays dense.
      });
      const bake = this.tray.bake;
      if (this.dingStage === 0 && bake >= 0.94) {
        this.dingStage = 1;
        this.ctx.sfx('timer_ding');
      } else if (this.dingStage === 1 && bake >= 1.12) {
        this.dingStage = 2;
        this.ctx.sfx('burnt_hiss', 0.4);
        this.ctx.vfx.smoke(this.oven.localToWorld(new THREE.Vector3(0, 1.3, 0.75)), 6);
      }
    }
  }

  labels(): void {
    if (!this.tray) return;
    const b = this.tray.bake;
    const pos = this.oven.localToWorld(new THREE.Vector3(0, 1.42, 0.9));
    const name = { raw: '반죽', pale: '연한 색', golden: '노릇노릇', perfect: '✦ 지금! ✦', dark: '진한 색', burnt: '탔어요!' }[bakeLabel(b)];
    this.ctx.hud.label('oven', pos, this.ctx.camera, `${name}<div class="meter"><i style="width:${(Math.min(b, 1.3) / 1.3) * 100}%"></i><span class="zone" style="left:${(0.94 / 1.3) * 100}%;width:${(0.14 / 1.3) * 100}%"></span></div>`);
  }
}

// ---------------------------------------------------------------- Display baskets

export type BasketItem = { bread: Bread; quality: number };

export class DisplayBasket extends Station {
  id: string;
  roots: THREE.Object3D[];
  recipe: RecipeId | null = null;
  readonly items: BasketItem[] = [];
  private readonly hit: THREE.Mesh;
  private tag: THREE.Mesh | null = null;
  static readonly CAP = 12;

  constructor(ctx: Ctx, readonly slot: THREE.Object3D, index: number) {
    super(ctx);
    this.id = `basket:${index}`;
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.22, 0.46), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.copy(slot.position).add(new THREE.Vector3(0, 0.06, 0));
    ctx.scene.add(this.hit);
    this.roots = [this.hit];
    this.highlight = [];
  }

  get position(): THREE.Vector3 {
    return this.slot.position;
  }

  actionable(held: Held): boolean {
    return held?.kind === 'tray' && held.tray.baked && held.tray.breads.length > 0 && (this.recipe === null || this.recipe === held.tray.recipe) && this.items.length < DisplayBasket.CAP;
  }

  prompt(held: Held): string | null {
    if (held?.kind !== 'tray' || !held.tray.baked) {
      if (!this.items.length) return null;
      return `${t(`recipe.${this.recipe}` as 'recipe.roll')} × ${this.items.length}`;
    }
    if (this.recipe && this.recipe !== held.tray.recipe) return t('display.other');
    if (this.items.length >= DisplayBasket.CAP) return t('display.full');
    return t('display.place');
  }

  interact(held: Held): void {
    if (!this.actionable(held) || held?.kind !== 'tray') return;
    const ctx = this.ctx;
    const tray = held.tray;
    this.recipe = tray.recipe;
    const quality = tray.craft;
    for (const b of tray.takeAll()) {
      if (this.items.length >= DisplayBasket.CAP) {
        b.dispose();
        continue;
      }
      this.items.push({ bread: b, quality });
      ctx.scene.add(b.mesh);
    }
    this.layout();
    ctx.interaction.setHeld(null);
    tray.dispose();
    this.ensureTag();
    ctx.vfx.sparkles(this.slot.position.clone().add(new THREE.Vector3(0, 0.12, 0)), 10, '#fff1c4', 0.2);
    ctx.vfx.emitSteam(this.slot.position.clone().add(new THREE.Vector3(0, 0.1, 0)), 8, 3);
    ctx.sfx('place_wood');
    ctx.events.emit('tutorial', { step: 'displayed' });
  }

  private layout(): void {
    const kind = this.recipe ? RECIPES[this.recipe].shape : 'round';
    if (kind === 'log') {
      // Baguettes lie in lanes, stacked crosswise.
      this.items.forEach((it, i) => {
        const lane = i % 3;
        const layer = Math.floor(i / 3);
        const p = this.slot.position;
        it.bread.mesh.position.set(p.x + (layer % 2) * 0.02, p.y + layer * 0.07, p.z - 0.12 + lane * 0.12);
        it.bread.mesh.rotation.set(0, (lane - 1) * 0.06 + layer * 0.05, 0);
      });
      return;
    }
    if (kind !== 'round') {
      this.items.forEach((it, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3) % 2;
        const layer = Math.floor(i / 6);
        const p = this.slot.position;
        const lift = kind === 'pretzel' ? 0.024 : 0.008;
        it.bread.mesh.position.set(p.x - 0.2 + col * 0.2 + layer * 0.05, p.y + lift + layer * 0.05, p.z - 0.09 + row * 0.18 + layer * 0.03);
        it.bread.mesh.rotation.set(0, i * 2.1, 0);
      });
      return;
    }
    this.items.forEach((it, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4) % 3;
      const layer = Math.floor(i / 12);
      const p = this.slot.position;
      it.bread.mesh.position.set(p.x - 0.21 + col * 0.14 + (row % 2) * 0.03, p.y + 0.0 + layer * 0.06, p.z - 0.12 + row * 0.12);
      it.bread.mesh.rotation.set((col - 1.5) * 0.04, i * 1.7, (row - 1) * 0.05);
      it.bread.mesh.scale.multiplyScalar(1);
    });
  }

  private ensureTag(): void {
    if (this.tag || !this.recipe) return;
    const price = RECIPES[this.recipe].price;
    const tex = this.ctx.art.priceTag(t(`recipe.${this.recipe}` as 'recipe.roll'), `₩${won(price)}`);
    void this.ctx.art.refreshWhenFontsReady();
    const mat = this.ctx.mats.painted({ map: tex, side: THREE.DoubleSide });
    this.tag = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.106), mat);
    this.tag.position.copy(this.slot.position).add(new THREE.Vector3(0.22, 0.13, 0.2));
    this.tag.rotation.set(-0.25, Math.PI, 0);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6), this.ctx.kit.m.walnut);
    stick.position.set(0, -0.09, -0.005);
    this.tag.add(stick);
    this.ctx.scene.add(this.tag);
    // Second face for the kitchen side.
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.106), mat);
    back.rotation.y = Math.PI;
    back.position.z = -0.002;
    this.tag.add(back);
  }

  /** Customer picks one bread; returns its quality or null if empty. */
  takeOne(): { recipe: RecipeId; quality: number; bake: number } | null {
    const it = this.items.pop();
    if (!it || !this.recipe) return null;
    const recipe = this.recipe;
    this.ctx.interaction.forget(it.bread.mesh);
    it.bread.mesh.removeFromParent();
    const bake = it.bread.bake;
    it.bread.dispose();
    if (!this.items.length) {
      this.recipe = null;
      this.tag?.removeFromParent();
      this.tag = null;
    }
    return { recipe, quality: it.quality * (0.4 + 0.6 * bakeQuality(bake)), bake };
  }
}

// ---------------------------------------------------------------- Bin

export class BinStation extends Station {
  id = 'bin';
  roots: THREE.Object3D[];
  constructor(ctx: Ctx, bin: THREE.Object3D) {
    super(ctx);
    this.roots = [bin];
  }
  actionable(held: Held): boolean {
    return !!held;
  }
  prompt(held: Held): string | null {
    return held ? t('bin.toss') : null;
  }
  interact(held: Held): void {
    if (!held) return;
    const ctx = this.ctx;
    if (held.kind === 'tray') held.tray.dispose();
    if (held.kind === 'dough') held.bread.dispose();
    ctx.interaction.setHeld(null);
    ctx.sfx('dough_plop', 0.6);
    ctx.events.emit('toast', { text: t('toast.binned'), tone: 'bad' });
  }
}
