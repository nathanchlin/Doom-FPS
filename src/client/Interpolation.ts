/**
 * Generic two-frame interpolation buffer.
 * Stores snapshots and linearly interpolates between them.
 */
export class InterpolationBuffer<T> {
  private prev: T | null = null;
  private next: T | null = null;
  private t = 0;
  private readonly duration: number;

  constructor(tickMs: number = 50) {
    this.duration = tickMs / 1000;
  }

  push(state: T): void {
    this.prev = this.next;
    this.next = state;
    this.t = 0;
  }

  advance(dt: number): void {
    this.t = Math.min(1, this.t + dt / this.duration);
  }

  get(): { prev: T; next: T; t: number } | null {
    if (!this.prev || !this.next) return null;
    return { prev: this.prev, next: this.next, t: this.t };
  }

  getLatest(): T | null {
    return this.next ?? this.prev;
  }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}
