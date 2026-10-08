import type { QualityLevel } from '../render/RenderPipeline';
import type { Lang } from '../ui/i18n';

export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 18;
/** Real seconds for one in-game day (08:00 → 18:00). */
export const DAY_LENGTH_SECONDS = 9 * 60;

export const PRICES = { roll: 1500, baguette: 3800, croissant: 3200 } as const;
export const BATCH_COST = { roll: 2400, baguette: 3000, croissant: 4200 } as const;

export type DayStats = {
  sold: number;
  revenue: number;
  tips: number;
  costs: number;
  happy: number;
  sad: number;
  qualitySum: number;
};

export type Settings = {
  quality: QualityLevel;
  sensitivity: number;
  master: number;
  music: number;
  sfx: number;
  lang: Lang;
  invertY: boolean;
};

export type SaveData = {
  version: 1;
  day: number;
  money: number;
  reputation: number; // 0..5 stars
  totalSold: number;
  unlocked: string[];
};

export class GameState {
  day = 1;
  money = 20000;
  reputation = 2.5;
  totalSold = 0;
  unlocked: string[] = ['roll'];
  /** Seconds elapsed in the current day. */
  dayTime = 0;
  /** prep: clock paused, no customers · open: trading · closed: no new guests, day ends when empty. */
  phase: 'prep' | 'open' | 'closed' = 'prep';
  get open(): boolean {
    return this.phase === 'open';
  }
  stats: DayStats = emptyStats();

  get clockHours(): number {
    return DAY_START_HOUR + (this.dayTime / DAY_LENGTH_SECONDS) * (DAY_END_HOUR - DAY_START_HOUR);
  }

  /** 0 morning … 1 evening for lighting. */
  get dayProgress(): number {
    return Math.min(1, this.dayTime / DAY_LENGTH_SECONDS);
  }

  clockLabel(): string {
    const h = this.clockHours;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60 / 10) * 10;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  newDay(): void {
    this.day += 1;
    this.dayTime = 0;
    this.phase = 'prep';
    this.stats = emptyStats();
  }

  toSave(): SaveData {
    return { version: 1, day: this.day, money: this.money, reputation: this.reputation, totalSold: this.totalSold, unlocked: [...this.unlocked] };
  }

  load(s: SaveData): void {
    this.day = s.day;
    this.money = s.money;
    this.reputation = s.reputation;
    this.totalSold = s.totalSold;
    this.unlocked = [...s.unlocked];
    this.dayTime = 0;
    this.phase = 'prep';
    this.stats = emptyStats();
  }
}

export function emptyStats(): DayStats {
  return { sold: 0, revenue: 0, tips: 0, costs: 0, happy: 0, sad: 0, qualitySum: 0 };
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  sensitivity: 1,
  master: 0.8,
  music: 0.55,
  sfx: 0.85,
  lang: 'ko',
  invertY: false,
};
