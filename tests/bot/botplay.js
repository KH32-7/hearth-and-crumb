// Scripted bot that plays one full morning-roll loop through the real
// interaction paths (raycast hover → click), using test hooks for input.
// Dev usage (browser console / automation):
//   const m = await import('/tests/bot/botplay.js'); await m.run({ until: 'sold' })
export async function run(opts = {}) {
  const H = window.__THREE_GAME_TEST_HOOKS__;
  const D = () => window.__THREE_GAME_DIAGNOSTICS__.game;
  const log = [];
  const step = (s = 0.1) => H.skipTime(s);
  const until = opts.until ?? 'sold';
  const mixRelease = opts.mixRelease ?? 1.75;
  const bakeSeconds = opts.bakeSeconds ?? 22.5;
  if (!opts.noReset) await H.setState('kitchen');
  const A = H.anchors();
  const use = (pos, target, label) => {
    H.teleport(pos[0], pos[1]);
    H.lookAt(...target);
    step(0.1);
    const hov = D().hovered;
    H.click();
    step(0.1);
    log.push(`${label}: hov=${hov} held=${D().held}`);
    return hov;
  };
  const mixer = A.mixer;
  const mixAim = [mixer[0], mixer[1] + 0.15, mixer[2] + 0.08];
  for (const k of ['flour', 'water', 'yeast', 'butter']) {
    const p = A[k];
    use([p[0], -2.9], [p[0], p[1] + 0.08, p[2]], `take ${k}`);
    use([mixer[0] + 0.3, -2.9], mixAim, `add ${k}`);
  }
  use([mixer[0] + 0.3, -2.9], mixAim, 'start mix');
  H.hold(true);
  step(mixRelease);
  H.hold(false);
  step(1.2);
  log.push(`mix done phase=${D().mixer.phase}`);
  if (until === 'mix') return log;
  use([mixer[0] + 0.3, -2.9], mixAim, 'take dough');
  const b = A.bench;
  use([b[0] + 0.1, -0.8], [b[0], b[1], b[2]], 'place dough');
  use([b[0] + 0.1, -0.8], [b[0], b[1], b[2]], 'start shaping');
  step(0.8); // camera settles
  // Divide: six 60 g pulls.
  for (let i = 0; i < 6; i++) {
    H.hold(true);
    step(1.03);
    H.hold(false);
    step(0.15);
  }
  step(1.0);
  if (until === 'divide') return log;
  // Round: circle the cursor around each piece.
  const slots = H.benchTraySlots();
  for (const s of slots) {
    const [cx, cy] = H.project(s[0], s[1] + 0.05, s[2]);
    for (let a = 0; a <= Math.PI * 4.6; a += 0.35) {
      H.cursor(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60);
      step(1 / 30);
    }
    step(0.1);
  }
  step(1.0);
  if (until === 'round') return log;
  // Glaze: brush across every piece.
  H.hold(true);
  for (let pass = 0; pass < 3; pass++) {
    for (const s of slots) {
      const [cx, cy] = H.project(s[0], s[1] + 0.07, s[2]);
      for (let k = 0; k < 8; k++) {
        H.cursor(cx + (k - 4) * 6, cy);
        step(1 / 30);
      }
    }
  }
  H.hold(false);
  step(1.5);
  log.push(`shaped bench=${D().bench}`);
  if (until === 'shape') return log;
  use([b[0] + 0.1, -0.8], [b[0], b[1], b[2]], 'take tray');
  const pr = A.proofer;
  use([pr[0] + 0.9, -2.7], [pr[0], 1.1, pr[2] + 0.2], 'proofer in');
  step(17);
  log.push(`proof=${D().proofer?.toFixed(2)}`);
  use([pr[0] + 0.9, -2.7], [pr[0], 1.1, pr[2] + 0.2], 'proofer out');
  if (until === 'proof') return log;
  const ov = A.oven;
  use([ov[0], -1.4], [ov[0], 1.0, ov[2] + 0.6], 'oven in');
  step(bakeSeconds);
  log.push(`bake=${D().oven?.toFixed(3)}`);
  if (until === 'bake') return log;
  use([ov[0], -1.4], [ov[0], 1.0, ov[2] + 0.6], 'oven out');
  step(2.6);
  log.push(`after beauty held=${D().held}`);
  const bk = A.baskets[1];
  use([bk[0], -0.35], [bk[0], bk[1] + 0.05, bk[2]], 'display');
  log.push(`baskets=${JSON.stringify(D().baskets)}`);
  if (until === 'display') return log;
  // Let customers arrive, then serve whoever is at the register.
  const reg = A.register;
  for (let tries = 0; tries < 40 && D().stats.sold < 2; tries++) {
    step(3);
    use([reg[0], -0.35], [reg[0], reg[1] + 0.25, reg[2]], 'serve');
  }
  log.push(`sold=${D().stats.sold} money=${D().money} rep=${D().reputation.toFixed(2)}`);
  return log;
}
