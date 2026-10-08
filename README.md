# Hearth & Crumb · 골목 끝 작은 빵집

A cozy first-person storybook bakery simulator built with Three.js.
Knead, shape, proof and bake morning rolls, baguettes, croissants and pretzels in a little old-town bakery, then sell them to the neighbours.

**Play in the browser:** https://kh32-7.github.io/hearth-and-crumb/

## Controls
| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look (click the screen to capture the mouse) |
| Shift | Walk faster |
| Left click | Interact / minigames |
| Right click | Peek inside the oven while baking |
| Esc | Pause menu |

## A day at the bakery
1. Put flour, water, yeast and butter into the mixer, pick a recipe from the recipe book (click a card or press 1–4), then mix until the needle is in the green zone.
2. On the workbench, by hand: push-and-fold to knead, pinch off pieces and drop them on the tray, then shape them:
   - **Morning roll** (6 × 60 g): circle to round each bun.
   - **Baguette** (3 × 120 g): roll back and forth under your palms to stretch a long loaf.
   - **Croissant** (4 × 70 g): slap the dough flat twice, then push forward to roll the triangle up into a crescent.
   - **Pretzel** (4 × 70 g): roll a rope, then circle around it to twist the knot.
3. Proof the tray, bring it back to the bench and finish it: knife slashes (roll, baguette) and/or an egg-wash brush (roll, croissant, pretzel).
4. Bake in the brick oven — watch the bread rise and pull it out at the *ding*.
5. Fill a display basket, flip the OPEN sign when you're ready, and ring up customers. Flip it to CLOSED to end the day.

## Time attack
Pick **⏱ 타임 어택** on the title screen: five minutes, the shop is open from the first second and every customer orders one specific bread (shown in their bubble and on the order tickets). Fill orders before their patience runs out to build a combo; proofing and baking run faster, ingredients are free, and your best score is kept.

## Development
```bash
npm install
npm run dev        # http://127.0.0.1:5188
npm run build      # static site in dist/
npm run desktop    # Electron desktop build of the same game
npm run dist:win   # Windows installer + portable exe
```

Built with Three.js, Vite and TypeScript. Asset credits are in [ASSET_LICENSES.md](ASSET_LICENSES.md).
