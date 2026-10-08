import * as THREE from 'three';
import { Input } from '../core/Input';
import { Loop } from '../core/Loop';
import { TextureLibrary } from '../render/Textures';
import { MaterialLibrary } from '../render/Materials';
import { LightingRig } from '../render/LightingRig';
import { RenderPipeline, NO_OUTLINE_LAYER } from '../render/RenderPipeline';
import { BakeryWorld } from '../world/BakeryWorld';
import { PropKit } from '../world/props';
import { Player } from './Player';
import { BreadFactory } from './Bread';
import { BREAD_TUNING } from '../render/BreadMaterial';
import { batchStatic } from '../render/StaticBatcher';
import { createSeededRandom } from '../utils/random';
import { EventBus } from './Events';
import { Interaction } from './Interaction';
import { MinigameHost } from './Minigames';
import { Hud } from '../ui/Hud';
import { Menus } from '../ui/Menus';
import { VfxSystem } from '../systems/Vfx';
import { AudioSystem } from '../systems/AudioSystem';
import { GameState, DAY_LENGTH_SECONDS, DEFAULT_SETTINGS, type Settings, type SaveData } from './State';
import { BinStation, DisplayBasket, MixerStation, OvenStation, PantryItem, ProoferStation, WorkbenchStation, type Ctx, type Station } from './Stations';
import { CustomerManager } from './Customers';
import { BenchTools } from './Tactile';
import { setLang, t } from '../ui/i18n';
import { Tray } from './Items';
import { Bread } from './Bread';

const SAVE_KEY = 'hearth-crumb-save';
const SETTINGS_KEY = 'hearth-crumb-settings';
const AUTOSTART_KEY = 'hearth-crumb-autostart';

type Mode = 'title' | 'play' | 'ledger';

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(64, 1, 0.03, 60);
  readonly input: Input;
  readonly textures: TextureLibrary;
  readonly mats: MaterialLibrary;
  readonly lights: LightingRig;
  readonly world: BakeryWorld;
  readonly pipeline: RenderPipeline;
  readonly player: Player;
  readonly breads: BreadFactory;
  readonly kit: PropKit;
  readonly events = new EventBus();
  readonly interaction: Interaction;
  readonly hud: Hud;
  readonly menus: Menus;
  readonly vfx: VfxSystem;
  readonly audio = new AudioSystem();
  readonly minigames: MinigameHost;
  readonly state = new GameState();
  readonly stations: Station[] = [];
  readonly baskets: DisplayBasket[] = [];
  readonly customers: CustomerManager;
  readonly mixer: MixerStation;
  readonly bench: WorkbenchStation;
  readonly proofer: ProoferStation;
  readonly oven: OvenStation;
  readonly breadTuning = BREAD_TUNING;
  batchStats = { before: 0, after: 0 };
  private readonly ctx: Ctx;
  private readonly loop: Loop;
  rng = createSeededRandom(1);
  private settings: Settings;
  private mode: Mode = 'title';
  private frame = 0;
  private elapsed = 0;
  private paused = false;
  private busy = false;
  private reducedMotion = false;
  private testMode = false;
  private closingWarned = false;
  private started = false;
  private musicIndex = 0;
  private timers: Array<{ at: number; fn: () => void }> = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.settings = loadSettings();
    setLang(this.settings.lang);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const tm = new URLSearchParams(location.search).get('tm');
    this.renderer.toneMapping = tm === 'neutral' ? THREE.NeutralToneMapping : THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = tm === 'neutral' ? 0.8 : 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;

    this.camera.layers.enable(NO_OUTLINE_LAYER);
    this.scene.add(this.camera);
    this.scene.background = new THREE.Color('#f2d7a6');

    this.input = new Input(canvas);
    this.textures = new TextureLibrary(this.renderer.capabilities.getMaxAnisotropy());
    this.mats = new MaterialLibrary(this.textures);
    this.lights = new LightingRig(this.textures.softDot);
    this.world = new BakeryWorld(this.mats, this.lights);
    this.scene.add(this.world.group);
    this.kit = new PropKit(this.mats);
    this.breads = new BreadFactory(this.textures.toonRamp, this.textures.get('crust'));
    this.pipeline = new RenderPipeline(this.renderer, this.scene, this.camera, this.textures.paperGrain, this.settings.quality);
    this.player = new Player(this.camera, this.world.colliders);
    this.player.onStep = () => this.audio.play(`footstep_wood_${1 + Math.floor(Math.random() * 4)}`, 0.35);
    this.vfx = new VfxSystem(this.textures.softDot);
    this.scene.add(this.vfx.group);
    this.interaction = new Interaction(this.camera);

    const uiRoot = document.querySelector<HTMLElement>('#ui-root')!;
    this.hud = new Hud(uiRoot);
    this.minigames = new MinigameHost(this.hud, this.input, this.camera, (id, v) => this.sfx(id, v));

    this.ctx = {
      scene: this.scene,
      camera: this.camera,
      player: this.player,
      input: this.input,
      hud: this.hud,
      vfx: this.vfx,
      events: this.events,
      interaction: this.interaction,
      breads: this.breads,
      kit: this.kit,
      mats: this.mats,
      art: this.world.art,
      state: this.state,
      world: this.world,
      minigames: this.minigames,
      rng: () => this.rng(),
      sfx: (id, v) => this.sfx(id, v),
      setBusy: (b) => (this.busy = b),
      schedule: (seconds, fn) => this.timers.push({ at: this.elapsed + seconds, fn }),
      tools: new BenchTools(this.scene, this.mats),
    };

    const a = this.world.anchors;
    this.stations.push(
      new PantryItem(this.ctx, 'flour', a.pantry.flour),
      new PantryItem(this.ctx, 'water', a.pantry.water),
      new PantryItem(this.ctx, 'yeast', a.pantry.yeast),
      new PantryItem(this.ctx, 'butter', a.pantry.butter),
    );
    this.mixer = new MixerStation(this.ctx, a.mixer);
    this.bench = new WorkbenchStation(this.ctx, a.workbench);
    this.proofer = new ProoferStation(this.ctx, a.proofer);
    this.oven = new OvenStation(this.ctx, a.oven);
    this.stations.push(this.mixer, this.bench, this.proofer, this.oven, new BinStation(this.ctx, a.bin));
    a.displaySlots.forEach((s, i) => {
      const b = new DisplayBasket(this.ctx, s, i);
      this.baskets.push(b);
      this.stations.push(b);
    });
    for (const s of this.stations) this.interaction.register(s);
    this.customers = new CustomerManager(this.ctx, this.baskets);
    this.interaction.register({
      id: 'register',
      roots: [a.register],
      prompt: () => (this.customers.canServe() ? t('register.serve') : t('register.idle')),
      interact: () => {
        if (this.customers.canServe()) this.customers.serveFront();
      },
    });

    this.events.on('toast', (e) => this.hud.toast(e.text, e.tone));
    this.interaction.register({
      id: 'open-sign',
      roots: [this.world.openSign],
      prompt: () => (this.state.phase === 'prep' ? t('sign.open') : this.state.phase === 'open' ? t('sign.close') : t('sign.closed')),
      interact: () => {
        if (this.state.phase === 'prep') this.setShopOpen(true);
        else if (this.state.phase === 'open') this.setShopOpen(false);
      },
    });
    // Steam achievements (desktop build only; no-ops on the web).
    const desk = (window as unknown as { hearth?: { steam?: { unlockAchievement: (id: string) => Promise<boolean> } } }).hearth;
    const unlock = (id: string) => void desk?.steam?.unlockAchievement(id);
    this.events.on('stamp', (e) => e.grade === 'perfect' && unlock('FIRST_PERFECT'));
    this.events.on('sold', () => unlock('FIRST_SALE'));
    this.events.on('dayEnd', () => unlock('FIRST_DAY'));

    // Merge static dressing; keep interactive / animated subtrees live.
    const batch = batchStatic(this.world.group, [
      a.mixer,
      a.oven,
      a.proofer,
      a.register,
      a.bin,
      a.doorPivot,
      this.world.openSign,
      a.pantry.flour,
      a.pantry.water,
      a.pantry.yeast,
      a.pantry.butter,
      ...(this.world.clock ? [this.world.clock] : []),
      this.lights.group,
    ]);
    // Station subtrees: merge their static parts in place, keeping moving parts live.
    const sub = (root: THREE.Object3D, keep: Array<THREE.Object3D | undefined | null>) => {
      const r = batchStatic(root, keep.filter((k): k is THREE.Object3D => !!k));
      batch.before += r.before;
      batch.after += r.after;
    };
    sub(a.oven, [a.oven.userData.door as THREE.Object3D, a.oven.userData.fire as THREE.Object3D]);
    sub(a.proofer, [a.proofer.userData.door as THREE.Object3D]);
    sub(a.mixer, [a.mixer.getObjectByName('beater'), a.mixer.getObjectByName('mixer-contents')]);
    sub(a.register, []);
    this.batchStats = batch;

    this.menus = new Menus(
      uiRoot,
      {
        onNew: () => this.newGame(),
        onContinue: () => this.continueGame(),
        onResume: () => this.resume(),
        onToTitle: () => this.toTitle(),
        onQuit: () => this.quit(),
        onSettings: (s) => this.applySettings(s),
        onNextDay: () => this.nextDay(),
        onSound: (id) => this.audio.play(id, 0.6),
      },
      this.settings,
      () => !!localStorage.getItem(SAVE_KEY),
    );
    this.applySettings(this.settings);

    this.player.spawn(a.playerStart, 0.0, -0.3);
    this.lights.setTimeOfDay(0.3);

    canvas.addEventListener('click', () => {
      if (this.mode === 'play' && !this.menus.anyOpen) this.input.requestLock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.mode !== 'play') return;
      if (!document.pointerLockElement && !this.menus.anyOpen && !this.testMode) this.openPause();
      this.menus.showClickToPlay(false);
    });

    this.loop = new Loop(
      (dt) => this.update(dt),
      () => this.render(),
    );
    this.resize();
    this.installTestHooks();

    const auto = sessionStorage.getItem(AUTOSTART_KEY);
    sessionStorage.removeItem(AUTOSTART_KEY);
    if (auto === 'new') this.startPlay(null);
    else {
      this.menus.showTitle(true);
      this.audio.playMusic('music_menu');
    }
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.pipeline.dispose();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- flow

  private newGame(): void {
    localStorage.removeItem(SAVE_KEY);
    if (this.started) {
      sessionStorage.setItem(AUTOSTART_KEY, 'new');
      location.reload();
      return;
    }
    this.startPlay(null);
  }

  private continueGame(): void {
    const raw = localStorage.getItem(SAVE_KEY);
    this.startPlay(raw ? (JSON.parse(raw) as SaveData) : null);
  }

  private startPlay(save: SaveData | null): void {
    this.started = true;
    if (save) this.state.load(save);
    this.mode = 'play';
    this.menus.hideAll();
    this.hud.show(true);
    this.input.requestLock();
    this.audio.startLoop('amb_kitchen', 1);
    this.audio.startLoop('amb_street', 1);
    this.audio.startLoop('oven_loop', 0.3);
    this.nextMusic();
    setTimeout(() => this.hud.fadeControlsHint(), 14000);
  }

  private nextMusic(): void {
    const evening = this.state.dayProgress > 0.75;
    const ids = evening ? ['music_evening'] : ['music_day_1', 'music_day_2'];
    this.audio.playMusic(ids[this.musicIndex++ % ids.length]);
  }

  private openPause(): void {
    this.menus.showPause(true);
    this.paused = true;
    this.hud.setVirtualCursor(null);
  }

  private resume(): void {
    this.menus.showPause(false);
    this.paused = false;
    this.input.requestLock();
  }

  private toTitle(): void {
    this.save();
    sessionStorage.removeItem(AUTOSTART_KEY);
    location.reload();
  }

  private quit(): void {
    this.save();
    const w = window as unknown as { hearth?: { quit?: () => void } };
    if (w.hearth?.quit) w.hearth.quit();
    else window.close();
  }

  private save(): void {
    if (!this.started) return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(this.state.toSave()));
  }

  private setShopOpen(open: boolean): void {
    this.state.phase = open ? 'open' : 'closed';
    this.world.shopSignArt.set(open);
    const board = this.world.openSign.getObjectByName('board');
    if (board) board.userData.flip = 1;
    this.audio.play(open ? 'door_bell' : 'ui_open', 0.8);
    this.events.emit('toast', { text: t(open ? 'toast.opened' : 'toast.closedNow'), tone: 'good' });
  }

  private endDay(): void {
    this.mode = 'ledger';
    this.input.exitLock();
    this.hud.show(false);
    this.minigames.cancel();
    this.player.exitView();
    this.busy = false;
    this.audio.play('day_end');
    this.menus.showLedger(this.state.day, this.state.stats, this.state.reputation);
    this.events.emit('dayEnd', {});
  }

  private nextDay(): void {
    this.state.newDay();
    this.save();
    this.customers.clear();
    for (const b of this.baskets) while (b.takeOne()) void 0;
    this.closingWarned = false;
    this.mode = 'play';
    this.hud.show(true);
    this.input.requestLock();
    this.nextMusic();
  }

  private applySettings(s: Settings): void {
    this.settings = s;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    this.input.sensitivity = 0.003 * s.sensitivity;
    this.input.invertY = s.invertY;
    this.audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
    this.pipeline.applyQuality(s.quality);
    this.lights.applyShadowSize(this.pipeline.shadowMapSize);
    this.canvas.width = 0; // force resize with new DPR cap
  }

  private sfx(id: string, volume = 1): void {
    if (id === 'mixer_loop_start') return this.audio.startLoop('mixer_loop', 1);
    if (id === 'mixer_loop_stop') return this.audio.stopLoop('mixer_loop');
    this.audio.play(id, volume);
  }

  // ---------------------------------------------------------------- loop

  private resize(): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.pipeline.maxDpr);
    const bw = Math.floor(w * dpr);
    const bh = Math.floor(h * dpr);
    if (this.canvas.width === bw && this.canvas.height === bh) return;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pipeline.setSize(w, h, dpr);
    this.vfx.setScale((h * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))));
  }

  private get playing(): boolean {
    return this.mode === 'play' && !this.paused;
  }

  private update(dt: number): void {
    this.frame++;
    this.resize();
    const input = this.input;

    if (this.mode === 'play' && input.pressed('Escape') && this.menus.pauseOpen) this.resume();

    if (this.playing) {
      this.elapsed += dt;
      const s = this.state;
      if (s.phase === 'open') s.dayTime += dt;
      if (s.open && s.dayTime >= DAY_LENGTH_SECONDS) {
        this.setShopOpen(false);
      } else if (s.open && !this.closingWarned && s.dayTime >= DAY_LENGTH_SECONDS * 0.92) {
        this.closingWarned = true;
        this.events.emit('toast', { text: t('toast.closing'), tone: 'info' });
      }
      if (s.phase === 'closed' && this.customers.customers.length === 0) this.endDay();

      const canAct = !this.busy && (input.locked || this.testMode);
      this.player.update(dt, input, canAct);
      this.interaction.update(dt, canAct && !this.minigames.running, input.mouseDX, input.mouseDY);
      const hovered = this.interaction.hovered;
      if (hovered && canAct) {
        const held = this.interaction.held;
        const text = hovered.prompt(held);
        const station = hovered as Partial<Station>;
        const ok = station.actionable ? station.actionable(held) : true;
        this.hud.setPrompt(text, ok);
        const second = hovered.secondaryPrompt?.(held) ?? null;
        this.hud.setSubhint(second ?? '');
        if (input.mousePressed[0] && ok && text) {
          hovered.interact(held);
          this.audio.play('ui_click', 0.25);
        } else if (input.mousePressed[2] && second) {
          hovered.secondary?.(held);
          this.audio.play('oven_open', 0.4);
        }
      } else {
        this.hud.setPrompt(null);
        if (!this.busy) this.hud.setSubhint('');
      }
      this.hud.setCrosshairVisible(!this.minigames.running && !this.busy);
      this.minigames.update(dt);
      this.ctx.tools.aim(this.camera);
      if (this.timers.length) {
        const due = this.timers.filter((tm) => tm.at <= this.elapsed);
        this.timers = this.timers.filter((tm) => tm.at > this.elapsed);
        for (const tm of due) tm.fn();
      }
      for (const st of this.stations) st.update(dt);
      this.customers.update(dt);
      this.lights.setTimeOfDay(0.12 + s.dayProgress * 0.88);
      this.world.setClock(s.clockHours);
      // Oven hum louder when near.
      const d = this.player.position.distanceTo(this.world.anchors.oven.position);
      this.audio.setLoopVolume('oven_loop', THREE.MathUtils.clamp(1.4 - d * 0.28, 0.15, 1));
    } else {
      this.player.update(dt, input, false);
    }

    const animDt = this.reducedMotion ? 0 : this.paused ? 0 : dt;
    this.lights.update(animDt);
    this.world.update(animDt, this.reducedMotion ? 0 : this.elapsed);
    const board = this.world.openSign.getObjectByName('board');
    if (board && board.userData.flip > 0) {
      board.userData.flip = Math.max(0, board.userData.flip - dt * 2.2);
      board.rotation.y = (1 - board.userData.flip) * Math.PI * 2;
    }
    this.vfx.update(animDt);
    if (this.mode === 'play') {
      for (const st of this.stations) st.labels();
      this.hud.endLabels();
      this.hud.setStatus(this.state.day, this.state.clockLabel(), this.state.money, this.state.reputation, this.state.phase, this.state.dayProgress);
      this.hud.setRecipe(t('recipe.roll'), this.recipeStep());
    }
    input.consumeFrame();
    this.publishDiagnostics();
  }

  /** Which recipe-card step the baker is on, derived from world state. */
  private recipeStep(): number {
    const held = this.interaction.held;
    const tray = held?.kind === 'tray' ? held.tray : this.bench.trayOnBench;
    if (held?.kind === 'tray' && held.tray.baked) return 6;
    if (this.oven.tray) return 5;
    if (tray && tray.finished) return 5;
    if (this.bench.phase === 'shaping') return 2;
    if (this.bench.phase === 'finishing' || (tray && tray.proof >= 0.6)) return 4;
    if (this.proofer.tray) return 3;
    if (tray) return 3;
    if (this.bench.phase !== 'empty' || held?.kind === 'dough' || this.mixer.phase === 'ready') return 2;
    if (this.mixer.phase === 'mixing' || this.mixer.missing().length === 0) return 1;
    if (this.mixer.added.size === 0 && this.baskets.some((b) => b.items.length)) return 7;
    return 0;
  }

  private render(): void {
    this.renderer.info.reset();
    // Behind the title painting the scene only needs an occasional refresh.
    if (this.mode === 'title' && this.frame % 15 !== 0) return;
    this.pipeline.render();
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.elapsed,
      score: this.state.money,
      targetScore: 0,
      complete: this.mode === 'ledger',
      player: {
        position: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z },
        speed: this.player.velocity.length(),
      },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: this.renderer.getPixelRatio(),
      },
      game: {
        mode: this.mode,
        day: this.state.day,
        clock: this.state.clockLabel(),
        money: this.state.money,
        reputation: this.state.reputation,
        held: this.interaction.held?.kind ?? null,
        hovered: this.interaction.hovered?.id ?? null,
        mixer: { phase: this.mixer.phase, added: [...this.mixer.added] },
        bench: this.bench.phase,
        proofer: this.proofer.tray ? this.proofer.tray.proof : null,
        oven: this.oven.tray ? this.oven.tray.bake : null,
        baskets: this.baskets.map((b) => b.items.length),
        customers: this.customers.customers.map((c) => c.phase),
        minigame: this.minigames.running,
        stats: this.state.stats,
      },
    };
  }

  // ---------------------------------------------------------------- test hooks

  private installTestHooks(): void {
    const views: Record<string, { pos: [number, number, number]; yaw: number; pitch: number }> = {
      kitchen: { pos: [0.6, 0, -0.3], yaw: 0.35, pitch: -0.12 },
      bench: { pos: [-0.6, 0, -0.75], yaw: 0.0, pitch: -0.55 },
      oven: { pos: [2.3, 0, -1.25], yaw: 0.0, pitch: -0.3 },
      shop: { pos: [0.4, 0, -0.35], yaw: Math.PI, pitch: -0.12 },
      window: { pos: [-2.0, 0, -0.6], yaw: 1.2, pitch: -0.15 },
    };
    const hooks = {
      seed: (value: number) => {
        this.rng = createSeededRandom(value);
      },
      setState: async (name: string) => {
        await this.textures.whenLoaded();
        this.testMode = true;
        if (name === 'title') {
          this.mode = 'title';
          this.hud.show(false);
          this.menus.showTitle(true);
          return { state: name };
        }
        if (this.mode !== 'play') this.startPlay(null);
        this.menus.hideAll();
        this.paused = false;
        if (name === 'active-play' || name === 'kitchen') {
          this.placeView(views.kitchen);
        } else if (name === 'bench' || name === 'oven' || name === 'shop' || name === 'window') {
          this.placeView(views[name]);
        } else if (name === 'baking') {
          this.stageBaking(1.0);
          this.placeView(views.oven);
        } else if (name === 'bread-lineup') {
          const tray = new Tray(this.kit);
          [0, 0.5, 0.8, 1.0, 1.1, 1.25].forEach((bake, i) => {
            const b = new Bread(this.breads, 'roll', i * 0.7 + 0.2);
            b.proof = 1;
            b.glaze = 1;
            b.bake = bake;
            b.apply();
            tray.add(b);
          });
          const at = this.world.anchors.workbench.position;
          tray.group.position.set(at.x + 0.3, at.y, at.z);
          this.scene.add(tray.group);
          this.player.spawn(new THREE.Vector3(at.x + 0.3, 0, at.z + 0.62), 0, -0.9);
          this.player.update(0, this.input, false);
          this.player.enterView(new THREE.Vector3(at.x + 0.3, at.y + 0.42, at.z + 0.42), new THREE.Vector3(at.x + 0.3, at.y + 0.04, at.z));
        } else if (name === 'baking-start') {
          this.stageBaking(0);
          this.placeView(views.oven);
        } else if (name === 'shop-busy') {
          this.stageShop();
          this.placeView(views.shop);
        } else if (name === 'ledger') {
          this.state.stats = { sold: 14, revenue: 21000, tips: 2400, costs: 7200, happy: 12, sad: 2, qualitySum: 11 };
          this.endDay();
        } else throw new Error(`Unknown test state: ${name}`);
        this.update(0);
        this.render();
        return { state: name };
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.paused = paused;
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
      },
      hideDebugUi: () => undefined,
      // Bot-playtest helpers (real gameplay paths, synthetic input).
      lookAt: (x: number, y: number, z: number) => {
        const eye = new THREE.Vector3(this.player.position.x, 1.62, this.player.position.z);
        const d = new THREE.Vector3(x, y, z).sub(eye);
        this.player.yaw = Math.atan2(-d.x, -d.z);
        this.player.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      },
      teleport: (x: number, z: number) => {
        this.player.position.set(x, 0, z);
      },
      click: () => this.input.simulateClick(0),
      rightClick: () => this.input.simulateClick(2),
      cursor: (x: number, y: number) => {
        this.input.cursorX = x;
        this.input.cursorY = y;
      },
      project: (x: number, y: number, z: number) => {
        this.camera.updateMatrixWorld();
        const p = new THREE.Vector3(x, y, z).project(this.camera);
        return [((p.x + 1) / 2) * window.innerWidth, ((1 - p.y) / 2) * window.innerHeight];
      },
      benchTraySlots: () => {
        const tray = (this.bench as unknown as { tray: Tray | null }).tray;
        if (!tray) return [];
        return tray.slots.map((s) => tray.group.localToWorld(s.clone()).toArray());
      },
      hold: (down: boolean) => {
        this.input.mouseDown[0] = down;
        if (down) this.input.mousePressed[0] = true;
        else this.input.mouseReleased[0] = true;
      },
      key: (code: string, down: boolean) => this.input.simulateKey(code, down),
      look: (dx: number, dy: number) => this.input.simulateLook(dx, dy),
      skipTime: (seconds: number) => {
        const step = 1 / 30;
        for (let i = 0; i < seconds / step; i++) this.update(step);
      },
      anchors: () => {
        const w = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3()).toArray();
        const a = this.world.anchors;
        return {
          flour: w(a.pantry.flour),
          water: w(a.pantry.water),
          yeast: w(a.pantry.yeast),
          butter: w(a.pantry.butter),
          mixer: w(a.mixer),
          bench: a.workbench.position.toArray(),
          proofer: w(a.proofer),
          oven: w(a.oven),
          register: w(a.register),
          baskets: a.displaySlots.map((s) => s.position.toArray()),
        };
      },
    };
    window.__THREE_GAME_TEST_HOOKS__ = hooks;
  }

  private placeView(v: { pos: [number, number, number]; yaw: number; pitch: number }): void {
    this.player.spawn(new THREE.Vector3(...v.pos), v.yaw, v.pitch);
    this.player.update(0, this.input, false);
  }

  private stageBaking(bake: number): void {
    if (this.oven.tray) return;
    const tray = new Tray(this.kit);
    for (let i = 0; i < 6; i++) {
      const b = new Bread(this.breads, 'roll', i * 0.7 + 0.2);
      b.proof = 1;
      b.glaze = 1;
      b.bake = bake;
      b.apply();
      tray.add(b);
    }
    this.oven.interact({ kind: 'tray', tray });
  }

  private stageShop(): void {
    for (const [i, basket] of this.baskets.entries()) {
      if (basket.items.length || i > 2) continue;
      const tray = new Tray(this.kit);
      for (let j = 0; j < 6; j++) {
        const b = new Bread(this.breads, 'roll', i * 3 + j * 0.37);
        b.proof = 1;
        b.glaze = 1;
        b.bake = 0.97 + (j % 3) * 0.03;
        b.apply();
        tray.add(b);
      }
      tray.baked = true;
      tray.craft = 0.9;
      basket.interact({ kind: 'tray', tray });
    }
    for (let i = 0; i < 40 && this.customers.customers.length < 4; i++) this.customers.update(4);
    for (let i = 0; i < 300; i++) this.customers.update(1 / 30);
  }
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // ignore corrupted settings
  }
  return { ...DEFAULT_SETTINGS };
}
