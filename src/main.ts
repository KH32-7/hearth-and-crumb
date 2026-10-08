import '@fontsource/gaegu/400.css';
import '@fontsource/gaegu/700.css';
import '@fontsource/gowun-dodum/400.css';
import '@fontsource/jua/400.css';
import './styles.css';
import { Game } from './game/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas element.');

const game = new Game(canvas);
game.start();
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;

if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
