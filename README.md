# Hearth & Crumb · 골목 끝 작은 빵집

A cozy first-person storybook bakery simulator built with Three.js.
Knead, shape, proof and bake golden rolls in a little old-town bakery, then sell them to the neighbours.

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
1. Put flour, water, yeast and butter into the mixer, then mix until the needle is in the green zone.
2. On the workbench, by hand: push-and-fold to knead, pinch off six 60 g pieces and drop them on the tray, circle to round them.
3. Proof the tray, bring it back to the bench, draw your own score with the knife and brush on egg wash.
4. Bake in the brick oven — watch the bread rise and pull it out at the *ding*.
5. Fill a display basket, flip the OPEN sign when you're ready, and ring up customers. Flip it to CLOSED to end the day.

## Development
```bash
npm install
npm run dev        # http://127.0.0.1:5188
npm run build      # static site in dist/
npm run desktop    # Electron desktop build of the same game
npm run dist:win   # Windows installer + portable exe
```

Built with Three.js, Vite and TypeScript. Asset credits are in [ASSET_LICENSES.md](ASSET_LICENSES.md).
