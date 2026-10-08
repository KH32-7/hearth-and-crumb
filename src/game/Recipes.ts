export type RecipeId = 'roll' | 'baguette' | 'croissant' | 'pretzel';

/** How the pieces are shaped by hand on the bench after kneading + dividing. */
export type ShapeStyle = 'round' | 'log' | 'croissant' | 'pretzel';

export type RecipeDef = {
  id: RecipeId;
  icon: string;
  pieces: number;
  /** Target weight per piece (g). */
  grams: number;
  shape: ShapeStyle;
  /** Finishing steps after proofing. */
  score: boolean;
  glaze: boolean;
  /** Fraction of top surface the knife must touch for a full-marks score. */
  scoreNeed: number;
  price: number;
  cost: number;
  /** Seconds in the oven to reach a perfect bake (story mode speed). */
  bakeSeconds: number;
  /** Crust tint multiplier once baked. */
  tint: string;
  flour: number;
  /** Sheet-tray placements: x, z, yaw (tray local). */
  layout: Array<[number, number, number]>;
};

const GRID6: Array<[number, number, number]> = [];
for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) GRID6.push([(c - 1) * 0.17, (r - 0.5) * 0.18, (r * 3 + c + 1) * 1.3]);
const GRID4: Array<[number, number, number]> = [
  [-0.13, -0.095, 0.08],
  [0.13, -0.095, -0.06],
  [-0.13, 0.095, -0.05],
  [0.13, 0.095, 0.07],
];

export const RECIPES: Record<RecipeId, RecipeDef> = {
  roll: { id: 'roll', icon: '🍞', pieces: 6, grams: 60, shape: 'round', score: true, glaze: true, scoreNeed: 0.12, price: 1500, cost: 2400, bakeSeconds: 22, tint: '#ffffff', flour: 1, layout: GRID6 },
  baguette: {
    id: 'baguette',
    icon: '🥖',
    pieces: 3,
    grams: 120,
    shape: 'log',
    score: true,
    glaze: false,
    scoreNeed: 0.07,
    price: 3800,
    cost: 3000,
    bakeSeconds: 26,
    tint: '#fff4e6',
    flour: 1.25,
    layout: [
      [0, -0.12, 0.03],
      [0, 0, -0.02],
      [0, 0.12, 0.02],
    ],
  },
  croissant: { id: 'croissant', icon: '🥐', pieces: 4, grams: 70, shape: 'croissant', score: false, glaze: true, scoreNeed: 0.1, price: 3200, cost: 4200, bakeSeconds: 20, tint: '#fff2dc', flour: 0.4, layout: GRID4 },
  pretzel: { id: 'pretzel', icon: '🥨', pieces: 4, grams: 70, shape: 'pretzel', score: false, glaze: true, scoreNeed: 0.1, price: 2600, cost: 2800, bakeSeconds: 20, tint: '#a07c60', flour: 0.25, layout: GRID4 },
};

export const RECIPE_ORDER: RecipeId[] = ['roll', 'baguette', 'croissant', 'pretzel'];
