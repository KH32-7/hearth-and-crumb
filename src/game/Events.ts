/** Tiny typed event bus: gameplay emits, audio / vfx / ui listen. */
export type GameEvents = {
  sfx: { id: string; volume?: number; rate?: number };
  toast: { text: string; tone?: 'good' | 'bad' | 'info' | 'money' };
  stamp: { grade: 'perfect' | 'great' | 'good' | 'raw' | 'burnt'; label: string };
  money: { amount: number };
  sold: { recipe: string; price: number; quality: number };
  served: { tip: number; happy: boolean };
  customerLeft: { happy: boolean };
  baked: { quality: number; count: number };
  dayEnd: Record<string, never>;
  tutorial: { step: string };
  rushServe: { gain: number; combo: number };
};

type Handler<T> = (payload: T) => void;

export class EventBus {
  private readonly handlers = new Map<keyof GameEvents, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) (fn as Handler<GameEvents[K]>)(payload);
  }
}
