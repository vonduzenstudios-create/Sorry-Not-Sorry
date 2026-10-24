/**
 * Frame-driven coroutines. Turn logic is written as async functions that
 * await `sleep`, `tween` or `until`; `update(dt)` advances them from the game
 * loop, so pausing or speeding up the scene affects them too.
 */
interface Waiter {
  done: (dt: number) => boolean;
  resolve: () => void;
}

export class Tasks {
  private waiters: Waiter[] = [];

  update(dt: number): void {
    // Copy first: resolving can schedule new waiters, which start next frame.
    const current = this.waiters;
    this.waiters = [];
    for (const w of current) {
      if (w.done(dt)) w.resolve();
      else this.waiters.push(w);
    }
  }

  clear(): void {
    this.waiters = [];
  }

  until(pred: (dt: number) => boolean): Promise<void> {
    return new Promise((resolve) => this.waiters.push({ done: pred, resolve }));
  }

  sleep(seconds: number): Promise<void> {
    let t = 0;
    return this.until((dt) => (t += dt) >= seconds);
  }

  /** Calls fn with eased progress 0..1 every frame for `seconds`. */
  tween(seconds: number, fn: (k: number) => void, ease: (k: number) => number = easeInOut): Promise<void> {
    let t = 0;
    fn(0);
    return this.until((dt) => {
      t = Math.min(seconds, t + dt);
      fn(ease(t / seconds));
      return t >= seconds;
    });
  }
}

export const easeInOut = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
export const easeOut = (k: number): number => 1 - Math.pow(1 - k, 3);
export const linear = (k: number): number => k;
export const easeOutBack = (k: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
