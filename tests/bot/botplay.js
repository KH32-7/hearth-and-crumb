// Scripted bot that plays one full batch through the real interaction paths
// (raycast hover → click) and drives the hand / knife / brush tools with a
// synthetic cursor. Dev only (uses window.__game).
//   const m = await import('/tests/bot/botplay.js');
//   await m.run({ recipe: 'croissant', until: 'sold' })
//   await m.run({ state: 'rush', recipe: 'pretzel', until: 'sold' })
const ORDER = ['roll', 'baguette', 'croissant', 'pretzel'];
const DEF = {
  roll: { pieces: 6, grams: 60, shape: 'round', score: true, glaze: true, bake: 22 },
  baguette: { pieces: 3, grams: 120, shape: 'log', score: true, glaze: false, bake: 26 },
  croissant: { pieces: 4, grams: 70, shape: 'croissant', score: false, glaze: true, bake: 20 },
  pretzel: { pieces: 4, grams: 70, shape: 'pretzel', score: false, glaze: true, bake: 20 },
};

export async function run(opts = {}) {
  const H = window.__THREE_GAME_TEST_HOOKS__;
  const G = window.__game;
  const D = () => window.__THREE_GAME_DIAGNOSTICS__.game;
  const log = [];
  const recipe = opts.recipe ?? 'roll';
  const def = DEF[recipe];
  const rush = opts.state === 'rush';
  const step = (s = 0.1) => H.skipTime(s);
  const frames = (n) => {
    for (let i = 0; i < n; i++) H.skipTime(1 / 30);
  };
  const act = () => G.minigames.active;
  const until = opts.until ?? 'sold';
  if (!opts.noReset) await H.setState(opts.state ?? 'kitchen');
  const A = H.anchors();
  const use = (pos, target, label, right = false) => {
    H.teleport(pos[0], pos[1]);
    H.lookAt(...target);
    step(0.1);
    const hov = D().hovered;
    if (right) H.rightClick();
    else H.click();
    step(0.1);
    log.push(`${label}: hov=${hov} held=${D().held}`);
    return hov;
  };
  const scr = (v) => H.project(v.x ?? v[0], v.y ?? v[1], v.z ?? v[2]);
  const mg = () => D().minigame;
  const lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const drag = (a, b, n) => {
    for (let i = 1; i <= n; i++) {
      H.cursor(...lerp2(a, b, i / n));
      frames(1);
    }
  };
  const key = (code) => {
    H.key(code, true);
    frames(1);
    H.key(code, false);
    frames(1);
  };

  // Ingredients + recipe pick + mixer
  const mixer = A.mixer;
  const mixAim = [mixer[0], mixer[1] + 0.15, mixer[2] + 0.08];
  for (const k of ['flour', 'water', 'yeast', 'butter']) {
    const p = A[k];
    use([p[0], -2.9], [p[0], p[1] + 0.08, p[2]], `take ${k}`);
    use([mixer[0] + 0.3, -2.9], mixAim, `add ${k}`);
  }
  use([mixer[0] + 0.3, -2.9], mixAim, 'start mix');
  frames(4);
  log.push(`picker=${document.querySelector('.mg h2')?.textContent}`);
  key(`Digit${ORDER.indexOf(recipe) + 1}`);
  frames(6);
  H.hold(true);
  step(1.75);
  H.hold(false);
  step(1.2);
  use([mixer[0] + 0.3, -2.9], mixAim, 'take dough');
  const b = A.bench;
  use([b[0] + 0.1, -0.8], [b[0], b[1], b[2]], 'place dough');
  use([b[0] + 0.1, -0.8], [b[0], b[1], b[2]], 'start shaping');
  frames(25);
  if (until === 'bench') return log;

  // 1) Knead: press on the dough, push away (screen up), pull back, ×8.
  const dough = G.bench.dough.mesh.getWorldPosition(G.bench.dough.mesh.position.clone());
  const near = scr(dough);
  const far = scr({ x: dough.x, y: dough.y, z: dough.z - 0.16 });
  for (let k = 0; k < 9 && mg(); k++) {
    H.cursor(near[0], near[1]);
    frames(1);
    H.hold(true);
    drag(near, far, 8);
    drag(far, near, 8);
    H.hold(false);
    frames(2);
  }
  log.push(`knead done; panel=${document.querySelector('.mg h2')?.textContent}`);
  frames(30);
  if (until === 'knead') return log;

  // 2) Pull: pinch long enough for the target weight, drag toward the tray to tear, drop.
  const trayPos = G.bench.tray.group.position.clone();
  const pinch = Math.max(8, Math.round((Math.log(def.grams / 69 + 1) / 0.55) * 30) - 9);
  for (let piece = 0; piece < def.pieces; piece++) {
    const dpos = G.bench.dough ? G.bench.dough.mesh.position : dough;
    const start = scr({ x: dpos.x + 0.12, y: dpos.y, z: dpos.z });
    H.cursor(start[0], start[1]);
    frames(1);
    H.hold(true);
    frames(pinch);
    drag(start, scr({ x: trayPos.x, y: trayPos.y, z: trayPos.z }), 10);
    H.hold(false);
    frames(14);
  }
  log.push(`pull done; tray=${G.bench.tray?.breads.length}`);
  frames(30);
  if (until === 'pull') return log;

  // 3) Shape each piece by hand.
  const slots = H.benchTraySlots();
  if (def.shape === 'round') {
    for (const s of slots) {
      const [cx, cy] = H.project(s[0], s[1] + 0.03, s[2]);
      for (let a = 0; a <= Math.PI * 4.8; a += 0.35) {
        H.cursor(cx + Math.cos(a) * 55, cy + Math.sin(a) * 55);
        frames(1);
      }
      frames(3);
    }
  } else if (def.shape === 'log' || def.shape === 'pretzel') {
    for (let i = 0; i < slots.length; i++) {
      frames(12); // camera glides to the piece
      const s = slots[i];
      const a = H.project(s[0], s[1] + 0.03, s[2] - 0.06);
      const c = H.project(s[0], s[1] + 0.03, s[2] + 0.06);
      H.cursor(a[0], a[1]);
      frames(1);
      H.hold(true);
      for (let k = 0; k < 40 && act()?.index === i && act()?.stage === 'roll'; k++) {
        drag(a, c, 4);
        drag(c, a, 4);
      }
      H.hold(false);
      frames(3);
      if (def.shape === 'pretzel') {
        const [cx, cy] = H.project(s[0], s[1] + 0.02, s[2]);
        for (let a2 = 0; a2 <= Math.PI * 8 && act()?.index === i; a2 += 0.3) {
          H.cursor(cx + Math.cos(a2) * 70, cy + Math.sin(a2) * 70);
          frames(1);
        }
      }
      log.push(`piece ${i} -> index=${act()?.index}`);
    }
  } else {
    for (let i = 0; i < slots.length; i++) {
      frames(12);
      const s = slots[i];
      const at = H.project(s[0], s[1] + 0.02, s[2]);
      H.cursor(at[0], at[1]);
      for (let k = 0; k < 2; k++) {
        frames(2);
        H.hold(true);
        frames(2);
        H.hold(false);
        frames(4);
      }
      const back = H.project(s[0], s[1] + 0.02, s[2] + 0.07);
      const front = H.project(s[0], s[1] + 0.02, s[2] - 0.08);
      for (let k = 0; k < 12 && act()?.index === i && act()?.stage === 'roll'; k++) {
        H.cursor(back[0], back[1]);
        frames(1);
        H.hold(true);
        drag(back, front, 8);
        H.hold(false);
        frames(1);
      }
      frames(18);
      log.push(`croissant ${i} -> index=${act()?.index}`);
    }
  }
  frames(40);
  log.push(`shaped bench=${D().bench}`);
  if (until === 'shape') return log;

  use([b[0] + 0.1, -0.8], [b[0], b[1], b[2]], 'take tray');
  const pr = A.proofer;
  use([pr[0] + 0.9, -2.7], [pr[0], 1.1, pr[2] + 0.2], 'proofer in');
  step(rush ? 11 : 17);
  log.push(`proof=${D().proofer?.toFixed(2)}`);
  use([pr[0] + 0.9, -2.7], [pr[0], 1.1, pr[2] + 0.2], 'proofer out');
  use([b[0] + 0.1, -0.8], [b[0], b[1], b[2]], 'tray on bench');
  use([b[0] + 0.1, -0.8], [b[0], b[1], b[2]], 'start finishing');
  frames(25);
  if (until === 'finish-start') return log;

  const fslots = H.benchTraySlots();
  if (def.score && recipe === 'baguette') {
    // Four diagonal slashes down each loaf.
    for (const s of fslots) {
      for (const xo of [-0.14, -0.05, 0.04, 0.13]) {
        const a = H.project(s[0] + xo - 0.035, s[1] + 0.05, s[2] - 0.028);
        const c = H.project(s[0] + xo + 0.035, s[1] + 0.05, s[2] + 0.028);
        H.cursor(a[0], a[1]);
        frames(1);
        H.hold(true);
        drag(a, c, 8);
        H.hold(false);
        frames(2);
        if (!panelIs('칼집')) break;
      }
      if (!panelIs('칼집')) break;
    }
    if (panelIs('칼집')) key('Space');
    frames(35);
  } else if (def.score) {
    // Diagonal slashes along each piece, then crossing ones for buns.
    for (const dir of [0, 1]) {
      for (const s of fslots) {
        const len = recipe === 'baguette' ? 0.17 : 0.045;
        const a = dir ? H.project(s[0], s[1] + 0.05, s[2] - 0.045) : H.project(s[0] - len, s[1] + 0.05, s[2] - 0.012);
        const c = dir ? H.project(s[0], s[1] + 0.05, s[2] + 0.045) : H.project(s[0] + len, s[1] + 0.05, s[2] + 0.012);
        H.cursor(a[0], a[1]);
        frames(1);
        H.hold(true);
        drag(a, c, 10);
        H.hold(false);
        frames(2);
        if (!panelIs('칼집')) break;
      }
      if (!panelIs('칼집')) break;
    }
    if (panelIs('칼집')) key('Space');
    frames(35);
    log.push(`scored; panel=${document.querySelector('.mg h2')?.textContent}`);
  }
  if (def.glaze) {
    H.hold(true);
    for (let pass = 0; pass < 3 && panelIs('달걀물'); pass++) {
      for (const s of fslots) {
        const [cx, cy] = H.project(s[0], s[1] + 0.05, s[2]);
        for (let a = 0; a < Math.PI * 4; a += 0.5) {
          H.cursor(cx + Math.cos(a) * 22, cy + Math.sin(a) * 14);
          frames(1);
        }
      }
    }
    H.hold(false);
    if (panelIs('달걀물')) key('Space');
    frames(40);
  }
  log.push(`finished bench=${D().bench}`);
  if (until === 'finish') return log;

  use([b[0] + 0.1, -0.8], [b[0], b[1], b[2]], 'take finished tray');
  const ov = A.oven;
  use([ov[0], -1.4], [ov[0], 1.0, ov[2] + 0.6], 'oven in');
  step(opts.bakeSeconds ?? def.bake / (rush ? 1.3 : 1));
  log.push(`bake=${D().oven?.toFixed(3)}`);
  if (until === 'bake') return log;
  use([ov[0], -1.4], [ov[0], 1.0, ov[2] + 0.6], 'oven out');
  step(2.6);
  const bk = A.baskets[ORDER.indexOf(recipe)];
  use([bk[0], -0.35], [bk[0], bk[1] + 0.05, bk[2]], 'display');
  if (until === 'display') return log;
  if (!rush) {
    const sign = G.world.openSign.position;
    use([sign.x, -0.35], [sign.x, sign.y + 0.29, sign.z], 'flip sign open');
  }
  const reg = A.register;
  const target = D().stats.sold + (opts.sell ?? 2);
  for (let tries = 0; tries < 60 && D().stats.sold < target && D().mode === 'play'; tries++) {
    step(3);
    use([reg[0], -0.35], [reg[0], reg[1] + 0.25, reg[2]], 'serve');
  }
  log.push(`sold=${D().stats.sold} money=${D().money} rep=${D().reputation.toFixed(2)}`);
  if (rush) log.push(`rush score=${G.customers.rushScore} combo=${G.customers.bestCombo} served=${G.customers.served} missed=${G.customers.missed}`);
  return log;
}

function panelIs(word) {
  return (document.querySelector('.mg h2')?.textContent ?? '').includes(word);
}
