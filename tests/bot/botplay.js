// Scripted bot that plays one full morning-roll day through the real
// interaction paths (raycast hover → click) and drives the hand / knife /
// brush tools with a synthetic cursor. Dev only (uses window.__game).
//   const m = await import('/tests/bot/botplay.js'); await m.run({ until: 'sold' })
export async function run(opts = {}) {
  const H = window.__THREE_GAME_TEST_HOOKS__;
  const G = window.__game;
  const D = () => window.__THREE_GAME_DIAGNOSTICS__.game;
  const log = [];
  const step = (s = 0.1) => H.skipTime(s);
  const frames = (n) => {
    for (let i = 0; i < n; i++) H.skipTime(1 / 30);
  };
  const until = opts.until ?? 'sold';
  if (!opts.noReset) await H.setState('kitchen');
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

  // Ingredients + mixer
  const mixer = A.mixer;
  const mixAim = [mixer[0], mixer[1] + 0.15, mixer[2] + 0.08];
  for (const k of ['flour', 'water', 'yeast', 'butter']) {
    const p = A[k];
    use([p[0], -2.9], [p[0], p[1] + 0.08, p[2]], `take ${k}`);
    use([mixer[0] + 0.3, -2.9], mixAim, `add ${k}`);
  }
  use([mixer[0] + 0.3, -2.9], mixAim, 'start mix');
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
    for (let i = 1; i <= 8; i++) {
      H.cursor(near[0] + (far[0] - near[0]) * (i / 8), near[1] + (far[1] - near[1]) * (i / 8));
      frames(1);
    }
    for (let i = 7; i >= 0; i--) {
      H.cursor(near[0] + (far[0] - near[0]) * (i / 8), near[1] + (far[1] - near[1]) * (i / 8));
      frames(1);
    }
    H.hold(false);
    frames(2);
  }
  log.push(`knead done; panel=${document.querySelector('.mg h2')?.textContent}`);
  frames(30);
  if (until === 'knead') return log;

  // 2) Pull: pinch ~1 s for 60 g, drag toward the tray to tear, drop.
  const trayPos = G.bench.tray.group.position.clone();
  for (let piece = 0; piece < 6; piece++) {
    const dpos = G.bench.dough ? G.bench.dough.mesh.position : dough;
    const toward = { x: dpos.x + 0.12, y: dpos.y, z: dpos.z };
    const start = scr(toward);
    H.cursor(start[0], start[1]);
    frames(1);
    H.hold(true);
    frames(28); // ~0.93 s pinch
    const end = scr({ x: trayPos.x, y: trayPos.y, z: trayPos.z });
    for (let i = 1; i <= 10; i++) {
      H.cursor(start[0] + (end[0] - start[0]) * (i / 10), start[1] + (end[1] - start[1]) * (i / 10));
      frames(1);
    }
    H.hold(false);
    frames(14);
  }
  log.push(`pull done; tray=${G.bench.tray?.breads.length}`);
  frames(30);
  if (until === 'pull') return log;

  // 3) Round: circle each piece.
  for (const s of H.benchTraySlots()) {
    const [cx, cy] = H.project(s[0], s[1] + 0.03, s[2]);
    for (let a = 0; a <= Math.PI * 4.8; a += 0.35) {
      H.cursor(cx + Math.cos(a) * 55, cy + Math.sin(a) * 55);
      frames(1);
    }
    frames(3);
  }
  frames(40);
  log.push(`shaped bench=${D().bench}`);
  if (until === 'shape') return log;

  use([b[0] + 0.1, -0.8], [b[0], b[1], b[2]], 'take tray');
  const pr = A.proofer;
  use([pr[0] + 0.9, -2.7], [pr[0], 1.1, pr[2] + 0.2], 'proofer in');
  step(17);
  log.push(`proof=${D().proofer?.toFixed(2)}`);
  use([pr[0] + 0.9, -2.7], [pr[0], 1.1, pr[2] + 0.2], 'proofer out');
  use([b[0] + 0.1, -0.8], [b[0], b[1], b[2]], 'tray on bench');
  use([b[0] + 0.1, -0.8], [b[0], b[1], b[2]], 'start finishing');
  frames(25);
  if (until === 'finish-start') return log;

  // 4) Score: one swipe across each bun, then a second crossing swipe.
  const slots = H.benchTraySlots();
  for (const dir of [0, 1]) {
    for (const s of slots) {
      const a = dir ? H.project(s[0], s[1] + 0.05, s[2] - 0.045) : H.project(s[0] - 0.045, s[1] + 0.05, s[2]);
      const c = dir ? H.project(s[0], s[1] + 0.05, s[2] + 0.045) : H.project(s[0] + 0.045, s[1] + 0.05, s[2]);
      H.cursor(a[0], a[1]);
      frames(1);
      H.hold(true);
      for (let i = 1; i <= 8; i++) {
        H.cursor(a[0] + (c[0] - a[0]) * (i / 8), a[1] + (c[1] - a[1]) * (i / 8));
        frames(1);
      }
      H.hold(false);
      frames(2);
      if (!panelIs('칼집')) break;
    }
    if (!panelIs('칼집')) break;
  }
  if (panelIs('칼집')) {
    H.key('Space', true);
    frames(1);
    H.key('Space', false);
  }
  frames(35);
  log.push(`scored; panel=${document.querySelector('.mg h2')?.textContent}`);

  // 5) Glaze: scrub small circles over every bun.
  H.hold(true);
  for (let pass = 0; pass < 3 && panelIs('달걀물'); pass++) {
    for (const s of slots) {
      const [cx, cy] = H.project(s[0], s[1] + 0.05, s[2]);
      for (let a = 0; a < Math.PI * 4; a += 0.5) {
        H.cursor(cx + Math.cos(a) * 18, cy + Math.sin(a) * 12);
        frames(1);
      }
    }
  }
  H.hold(false);
  if (panelIs('달걀물')) {
    H.key('Space', true);
    frames(1);
    H.key('Space', false);
  }
  frames(40);
  log.push(`finished bench=${D().bench}`);
  if (until === 'finish') return log;

  use([b[0] + 0.1, -0.8], [b[0], b[1], b[2]], 'take finished tray');
  const ov = A.oven;
  use([ov[0], -1.4], [ov[0], 1.0, ov[2] + 0.6], 'oven in');
  step(opts.bakeSeconds ?? 22.5);
  log.push(`bake=${D().oven?.toFixed(3)}`);
  if (until === 'bake') return log;
  use([ov[0], -1.4], [ov[0], 1.0, ov[2] + 0.6], 'oven out');
  step(2.6);
  const bk = A.baskets[1];
  use([bk[0], -0.35], [bk[0], bk[1] + 0.05, bk[2]], 'display');
  if (until === 'display') return log;
  // Open the shop by flipping the sign, then serve.
  const sign = G.world.openSign.position;
  use([sign.x, -0.35], [sign.x, sign.y + 0.29, sign.z], 'flip sign open');
  const reg = A.register;
  for (let tries = 0; tries < 40 && D().stats.sold < 2; tries++) {
    step(3);
    use([reg[0], -0.35], [reg[0], reg[1] + 0.25, reg[2]], 'serve');
  }
  log.push(`sold=${D().stats.sold} money=${D().money} rep=${D().reputation.toFixed(2)}`);
  return log;
}

function panelIs(word) {
  return (document.querySelector('.mg h2')?.textContent ?? '').includes(word);
}
