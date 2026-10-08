import type { Minigame, MinigameIO } from './Minigames';
import { RECIPES, RECIPE_ORDER, type RecipeId } from './Recipes';
import { t, won } from '../ui/i18n';

/** Recipe book at the mixer: point at a card and click (or press 1-4). */
export class RecipePickGame implements Minigame {
  readonly title = t('mg.pick.title');
  readonly panelClass = 'pick';
  readonly quiet = true;
  readonly score = 1;
  readonly panelExtra: HTMLElement;
  private readonly cards: HTMLDivElement[] = [];
  private hover = -1;

  constructor(
    private readonly onPick: (recipe: RecipeId) => void,
    rush: boolean,
    last: RecipeId,
  ) {
    this.panelExtra = document.createElement('div');
    this.panelExtra.className = 'pick-grid';
    RECIPE_ORDER.forEach((id, i) => {
      const r = RECIPES[id];
      const c = document.createElement('div');
      c.className = `pick-card${id === last ? ' last' : ''}`;
      c.innerHTML = `<div class="num">${i + 1}</div><div class="ico">${r.icon}</div><h3>${t(`recipe.${id}` as 'recipe.roll')}</h3>
        <p class="steps">${t(`pick.${id}` as 'pick.roll')}</p>
        <p class="price">₩${won(r.price)} × ${r.pieces}</p>${rush ? '' : `<p class="cost">${t('pick.cost', { cost: won(r.cost) })}</p>`}`;
      this.panelExtra.appendChild(c);
      this.cards.push(c);
    });
  }

  help(): string {
    return t('mg.pick.help');
  }

  update(_dt: number, io: MinigameIO): boolean {
    for (let i = 0; i < this.cards.length; i++) {
      if (io.input.pressed(`Digit${i + 1}`) || io.input.pressed(`Numpad${i + 1}`)) return this.pick(i);
    }
    this.hover = -1;
    this.cards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const inside = io.cursor.x >= r.left && io.cursor.x <= r.right && io.cursor.y >= r.top && io.cursor.y <= r.bottom;
      if (inside) this.hover = i;
      c.classList.toggle('hover', inside);
    });
    if (io.pressed && this.hover >= 0) return this.pick(this.hover);
    return false;
  }

  private pick(i: number): boolean {
    this.cards[i].classList.add('chosen');
    this.onPick(RECIPE_ORDER[i]);
    return true;
  }
}
