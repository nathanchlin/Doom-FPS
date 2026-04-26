import { CONFIG } from './config';
import type { Input } from './Input';
import type { TouchUIElements } from './touch-ui';

interface Point {
  x: number;
  y: number;
}

/**
 * TouchControls — multi-touch handler for mobile FPS controls.
 * Left half: dynamic movement joystick → virtual WASD
 * Right half: slide to aim + hold auto-fire + swipe up to jump
 * Buttons: reload, interact, weapon switch
 */
export class TouchControls {
  private leftTouchId: number | null = null;
  private leftOrigin: Point | null = null;
  private rightTouchId: number | null = null;
  private rightOrigin: Point | null = null;
  private rightStartY = 0;
  private activeWeaponIndex = 0;
  private weaponButtons: HTMLDivElement[];

  constructor(
    private readonly input: Input,
    private readonly ui: TouchUIElements,
    private readonly onWeaponSwitch: (index: number) => void,
  ) {
    this.weaponButtons = [ui.btnWeapon1, ui.btnWeapon2, ui.btnWeapon3];

    this.bindLeftZone();
    this.bindRightZone();
    this.bindButtons();
  }

  // ─── Left Zone: Dynamic Movement Joystick ───

  private bindLeftZone(): void {
    const el = this.ui.leftZone;

    el.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      if (this.leftTouchId !== null) return;
      const t = e.changedTouches[0]!;
      this.leftTouchId = t.identifier;
      this.leftOrigin = { x: t.clientX, y: t.clientY };
      this.showJoystick(t.clientX, t.clientY);
    }, { passive: false });

    el.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault();
      const t = this.findTouch(e, this.leftTouchId);
      if (!t || !this.leftOrigin) return;
      this.updateJoystick(t.clientX, t.clientY);
      this.mapJoystickToKeys(t.clientX, t.clientY);
    }, { passive: false });

    el.addEventListener('touchend', (e: TouchEvent) => {
      const t = this.findTouch(e, this.leftTouchId);
      if (!t) return;
      this.leftTouchId = null;
      this.leftOrigin = null;
      this.clearMovementKeys();
      this.hideJoystick();
    });

    el.addEventListener('touchcancel', () => {
      this.leftTouchId = null;
      this.leftOrigin = null;
      this.clearMovementKeys();
      this.hideJoystick();
    });
  }

  private mapJoystickToKeys(tx: number, ty: number): void {
    if (!this.leftOrigin) return;
    const dx = tx - this.leftOrigin.x;
    const dy = ty - this.leftOrigin.y;
    const deadzone = CONFIG.touch.moveDeadzone;
    const dist = Math.hypot(dx, dy);

    this.clearMovementKeys();

    if (dist < deadzone) return;

    // Angle: 0 = up, PI/2 = right, PI = down, -PI/2 = left
    const angle = Math.atan2(dx, -dy);

    // Forward (W): angle within ±45° of up
    const w = angle > -Math.PI / 4 && angle < Math.PI / 4;
    // Backward (S): angle within ±45° of down
    const s = angle > (3 * Math.PI / 4) || angle < -(3 * Math.PI / 4);
    // Left (A): angle in left quadrant
    const a = angle < -Math.PI / 4 && angle > -(3 * Math.PI / 4);
    // Right (D): angle in right quadrant
    const d = angle > Math.PI / 4 && angle < (3 * Math.PI / 4);

    if (w) this.input.setVirtualKey('w', true);
    if (s) this.input.setVirtualKey('s', true);
    if (a) this.input.setVirtualKey('a', true);
    if (d) this.input.setVirtualKey('d', true);
  }

  private clearMovementKeys(): void {
    this.input.setVirtualKey('w', false);
    this.input.setVirtualKey('a', false);
    this.input.setVirtualKey('s', false);
    this.input.setVirtualKey('d', false);
  }

  // ─── Joystick Visual ───

  private showJoystick(x: number, y: number): void {
    const base = this.ui.joystickBase;
    const radius = CONFIG.touch.joystickRadius;
    base.style.display = 'block';
    base.style.left = `${x - radius}px`;
    base.style.top = `${y - radius}px`;
    // Reset thumb to center
    this.ui.joystickThumb.style.transform = 'translate(-50%, -50%)';
  }

  private updateJoystick(tx: number, ty: number): void {
    if (!this.leftOrigin) return;
    const dx = tx - this.leftOrigin.x;
    const dy = ty - this.leftOrigin.y;
    const maxR = CONFIG.touch.joystickRadius;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, maxR);
    const angle = Math.atan2(dy, dx);

    const cx = Math.cos(angle) * clamped;
    const cy = Math.sin(angle) * clamped;
    this.ui.joystickThumb.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;
  }

  private hideJoystick(): void {
    this.ui.joystickBase.style.display = 'none';
  }

  // ─── Right Zone: Aim + Fire + Jump ───

  private bindRightZone(): void {
    const el = this.ui.rightZone;

    el.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      if (this.rightTouchId !== null) return;
      const t = e.changedTouches[0]!;
      this.rightTouchId = t.identifier;
      this.rightOrigin = { x: t.clientX, y: t.clientY };
      this.rightStartY = t.clientY;

      // Start firing
      this.input.setTouchFiring(true);
      this.input.fireOnce();
    }, { passive: false });

    el.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault();
      const t = this.findTouch(e, this.rightTouchId);
      if (!t || !this.rightOrigin) return;

      const dx = t.clientX - this.rightOrigin.x;
      const dy = t.clientY - this.rightOrigin.y;
      this.rightOrigin = { x: t.clientX, y: t.clientY };

      // Inject look delta
      const sens = CONFIG.touch.lookSensitivity;
      this.input.injectMouseDelta(dx * sens, dy * sens);
    }, { passive: false });

    el.addEventListener('touchend', (e: TouchEvent) => {
      const t = this.findTouch(e, this.rightTouchId);
      if (!t) return;

      // Stop firing
      this.input.setTouchFiring(false);

      // Check for jump swipe (finger moved up significantly)
      const totalDy = this.rightStartY - t.clientY;
      if (totalDy > CONFIG.touch.jumpSwipeThreshold) {
        // Simulate spacebar press and release
        this.input.setVirtualKey(' ', true);
        setTimeout(() => this.input.setVirtualKey(' ', false), 50);
      }

      this.rightTouchId = null;
      this.rightOrigin = null;
    });

    el.addEventListener('touchcancel', () => {
      this.input.setTouchFiring(false);
      this.rightTouchId = null;
      this.rightOrigin = null;
    });
  }

  // ─── Buttons ───

  private bindButtons(): void {
    // Reload — triggers the onKeyDown callback for 'r'
    this.bindButton(this.ui.btnReload, () => {
      const cbs = (this.input as any).onKeyDown.get('r');
      if (cbs) for (const cb of cbs) cb();
    });

    // Interact — triggers onInteract callbacks
    this.bindButton(this.ui.btnInteract, () => {
      const cbs = (this.input as any).onInteract;
      if (cbs) for (const cb of cbs) cb();
    });

    // Weapon switch
    this.bindButton(this.ui.btnWeapon1, () => this.switchWeapon(0));
    this.bindButton(this.ui.btnWeapon2, () => this.switchWeapon(1));
    this.bindButton(this.ui.btnWeapon3, () => this.switchWeapon(2));
  }

  private bindButton(el: HTMLDivElement, action: () => void): void {
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      action();
    }, { passive: false });
  }

  private switchWeapon(index: number): void {
    if (index === this.activeWeaponIndex) return;
    this.activeWeaponIndex = index;
    this.weaponButtons.forEach((btn, i) => {
      btn.classList.toggle('weapon-active', i === index);
    });
    this.onWeaponSwitch(index);
  }

  /** Update active weapon highlight (called when weapon changes via cards). */
  setActiveWeapon(index: number): void {
    this.activeWeaponIndex = index;
    this.weaponButtons.forEach((btn, i) => {
      btn.classList.toggle('weapon-active', i === index);
    });
  }

  // ─── Helpers ───

  private findTouch(e: TouchEvent, id: number | null): Touch | null {
    if (id === null) return null;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i]!.identifier === id) return e.changedTouches[i]!;
    }
    return null;
  }

  dispose(): void {
    // Touch event listeners are on DOM elements that get removed with the UI.
    // Clear any active virtual keys.
    this.clearMovementKeys();
    this.input.setTouchFiring(false);
    this.input.setVirtualKey(' ', false);
  }
}
