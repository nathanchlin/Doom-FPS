/**
 * Input — keyboard state + pointer-lock mouse deltas.
 * Single instance owned by main.ts, read by Player / Weapon per frame.
 */
export class Input {
  private keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private mouseDown = false;
  readonly onMouseDown: Array<() => void> = [];
  readonly onKeyDown = new Map<string, Array<() => void>>();

  private locked = false;

  constructor(private readonly canvas: HTMLElement) {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', () => {
      console.warn('Pointer lock failed');
    });
  }

  requestPointerLock(): void {
    this.canvas.requestPointerLock?.();
  }

  exitPointerLock(): void {
    document.exitPointerLock?.();
  }

  isLocked(): boolean {
    return this.locked;
  }

  isDown(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }

  isMouseDown(): boolean {
    return this.mouseDown;
  }

  /** Consume and return accumulated mouse delta, then reset. */
  consumeMouseDelta(): { dx: number; dy: number } {
    const r = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }

  registerKey(key: string, cb: () => void): void {
    const k = key.toLowerCase();
    const list = this.onKeyDown.get(k) ?? [];
    list.push(cb);
    this.onKeyDown.set(k, list);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (!this.keys.has(k)) {
      const list = this.onKeyDown.get(k);
      if (list) for (const cb of list) cb();
    }
    this.keys.add(k);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private handleMouseDown = (): void => {
    if (!this.locked) return;
    this.mouseDown = true;
    for (const cb of this.onMouseDown) cb();
  };

  private handleMouseUp = (): void => {
    this.mouseDown = false;
  };

  private handlePointerLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
  };

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
  }
}
