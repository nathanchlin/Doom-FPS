# Mobile Touch Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mobile touch controls (dual joystick + buttons) so the Doom FPS game is playable on phones/tablets, with zero impact on desktop gameplay.

**Architecture:** Extend the existing `Input.ts` class with virtual key/mouse injection methods. Build a `TouchControls.ts` class that handles multi-touch events and maps them to virtual inputs. Create a `touch-ui.ts` module to generate touch overlay DOM. Wire everything together in `main.ts`.

**Tech Stack:** TypeScript, browser Touch Events API, DOM manipulation

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/config.ts` | Modify | Add `touch` config section |
| `src/Input.ts` | Modify | Add virtual input methods + touch device detection |
| `src/touch-ui.ts` | Create | Generate touch overlay DOM elements |
| `src/TouchControls.ts` | Create | Multi-touch tracking, joystick logic, button handling |
| `src/main.ts` | Modify | Initialize touch controls on mobile, adjust start flow |
| `index.html` | Modify | Update viewport meta tag |
| `src/style.css` | Modify | Add touch UI styles + mobile HUD media query |

---

### Task 1: Add touch config to config.ts

**Files:**
- Modify: `src/config.ts:201` (end of CONFIG object, before `as const`)

- [ ] **Step 1: Add `touch` config section**

Add the following block inside the `CONFIG` object, after the `colors` section (before the closing `} as const` on line 201):

```typescript
  // Touch controls (mobile)
  touch: {
    moveDeadzone: 15,        // Movement joystick deadzone (px)
    lookSensitivity: 0.4,    // Look sensitivity (lower than mouse 0.0022)
    jumpSwipeThreshold: 80,  // Swipe-up jump threshold (px)
    joystickRadius: 50,      // Joystick visual radius (px)
    buttonSize: 48,          // Action button size (px)
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: add touch controls configuration parameters"
```

---

### Task 2: Extend Input.ts with virtual input support

**Files:**
- Modify: `src/Input.ts`

This task adds virtual key/mouse injection so TouchControls can feed inputs through the same API that Player/Game already reads.

- [ ] **Step 1: Add new private properties after `private locked = false;` (line 14)**

```typescript
  // Virtual input (for touch controls)
  private virtualKeys = new Map<string, boolean>();
  private virtualMouseDX = 0;
  private virtualMouseDY = 0;
  private lockedOverride = false;
  private touchFiring = false;
  private touchControls: import('./TouchControls').TouchControls | null = null;
```

- [ ] **Step 2: Add static `isTouchDevice()` method after constructor (after line 29)**

```typescript
  static isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }
```

- [ ] **Step 3: Add virtual input public methods after `registerKey()` (after line 64)**

```typescript
  /** Inject a virtual key state (used by TouchControls). */
  setVirtualKey(key: string, pressed: boolean): void {
    if (pressed) {
      this.virtualKeys.set(key.toLowerCase(), true);
    } else {
      this.virtualKeys.delete(key.toLowerCase());
    }
  }

  /** Inject virtual mouse delta (used by TouchControls). */
  injectMouseDelta(dx: number, dy: number): void {
    this.virtualMouseDX += dx;
    this.virtualMouseDY += dy;
  }

  /** Bypass pointer-lock check for mobile (no pointer lock available). */
  setLockedOverride(value: boolean): void {
    this.lockedOverride = value;
  }

  /** Set touch firing state. */
  setTouchFiring(value: boolean): void {
    this.touchFiring = value;
  }

  /** Register TouchControls for cleanup. */
  setTouchControls(tc: import('./TouchControls').TouchControls): void {
    this.touchControls = tc;
  }
```

- [ ] **Step 4: Modify `isDown()` to check virtual keys (line 43-45)**

Change:
```typescript
  isDown(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }
```
To:
```typescript
  isDown(key: string): boolean {
    const k = key.toLowerCase();
    return this.keys.has(k) || (this.virtualKeys.get(k) ?? false);
  }
```

- [ ] **Step 5: Modify `consumeMouseDelta()` to merge virtual deltas (line 52-57)**

Change:
```typescript
  consumeMouseDelta(): { dx: number; dy: number } {
    const r = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }
```
To:
```typescript
  consumeMouseDelta(): { dx: number; dy: number } {
    const r = { dx: this.mouseDX + this.virtualMouseDX, dy: this.mouseDY + this.virtualMouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.virtualMouseDX = 0;
    this.virtualMouseDY = 0;
    return r;
  }
```

- [ ] **Step 6: Modify `isLocked()` to check override (line 39-41)**

Change:
```typescript
  isLocked(): boolean {
    return this.locked;
  }
```
To:
```typescript
  isLocked(): boolean {
    return this.locked || this.lockedOverride;
  }
```

- [ ] **Step 7: Modify `isMouseDown()` to check touch firing (line 47-49)**

Change:
```typescript
  isMouseDown(): boolean {
    return this.mouseDown;
  }
```
To:
```typescript
  isMouseDown(): boolean {
    return this.mouseDown || this.touchFiring;
  }
```

- [ ] **Step 8: Add `fireOnce()` method for single fire trigger from touch**

After the `setTouchControls` method:

```typescript
  /** Trigger a single fire event (used by touch fire start). */
  fireOnce(): void {
    for (const cb of this.onMouseDown) cb();
  }
```

- [ ] **Step 9: Update `dispose()` to clean up touch controls (line 99-106)**

Add at the end of the `dispose()` method, before the closing brace:

```typescript
    if (this.touchControls) {
      this.touchControls.dispose();
      this.touchControls = null;
    }
```

- [ ] **Step 10: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Errors about `TouchControls` import — that's fine, will resolve when we create `TouchControls.ts` in Task 4. For now, temporarily replace the import type with `any`:

Actually, since we're using `import('./TouchControls').TouchControls` as a type-only inline import, TypeScript will error because the file doesn't exist yet. Let's create a minimal stub first.

Create `src/TouchControls.ts` with just:
```typescript
export class TouchControls {
  dispose(): void {}
}
```

Then run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 11: Commit**

```bash
git add src/Input.ts src/TouchControls.ts
git commit -m "feat: extend Input with virtual key/mouse injection for touch controls"
```

---

### Task 3: Update index.html viewport meta

**Files:**
- Modify: `index.html:7`

- [ ] **Step 1: Update viewport meta tag**

Change line 7:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```
To:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: update viewport meta for mobile touch controls"
```

---

### Task 4: Implement touch-ui.ts (DOM overlay)

**Files:**
- Create: `src/touch-ui.ts`

- [ ] **Step 1: Create touch-ui.ts**

```typescript
import { CONFIG } from './config';

export interface TouchUIElements {
  container: HTMLDivElement;
  leftZone: HTMLDivElement;
  rightZone: HTMLDivElement;
  joystickBase: HTMLDivElement;
  joystickThumb: HTMLDivElement;
  btnReload: HTMLDivElement;
  btnInteract: HTMLDivElement;
  btnWeapon1: HTMLDivElement;
  btnWeapon2: HTMLDivElement;
  btnWeapon3: HTMLDivElement;
}

export function createTouchUI(): TouchUIElements {
  const bs = CONFIG.touch.buttonSize;

  // Main container
  const container = document.createElement('div');
  container.id = 'touch-ui';

  // Left zone (movement)
  const leftZone = document.createElement('div');
  leftZone.id = 'touch-left';

  // Right zone (aim + fire)
  const rightZone = document.createElement('div');
  rightZone.id = 'touch-right';

  // Dynamic joystick elements (hidden until touch)
  const joystickBase = document.createElement('div');
  joystickBase.id = 'joystick-base';
  joystickBase.style.display = 'none';

  const joystickThumb = document.createElement('div');
  joystickThumb.id = 'joystick-thumb';
  joystickBase.appendChild(joystickThumb);

  // Button container
  const buttonsRow = document.createElement('div');
  buttonsRow.id = 'touch-buttons';

  // Reload button
  const btnReload = createButton('R', 'reload', bs);
  btnReload.style.position = 'absolute';
  btnReload.style.bottom = '155px';
  btnReload.style.left = '20px';

  // Interact button
  const btnInteract = createButton('E', 'interact', bs);
  btnInteract.style.position = 'absolute';
  btnInteract.style.bottom = '215px';
  btnInteract.style.left = '30px';

  // Weapon switch buttons (bottom center row)
  const weaponRow = document.createElement('div');
  weaponRow.id = 'touch-weapon-row';

  const btnWeapon1 = createButton('1', 'weapon-1', 38);
  btnWeapon1.classList.add('weapon-active');
  const btnWeapon2 = createButton('2', 'weapon-2', 38);
  const btnWeapon3 = createButton('3', 'weapon-3', 38);

  weaponRow.appendChild(btnWeapon1);
  weaponRow.appendChild(btnWeapon2);
  weaponRow.appendChild(btnWeapon3);

  // Assemble
  container.appendChild(leftZone);
  container.appendChild(rightZone);
  container.appendChild(joystickBase);
  container.appendChild(btnReload);
  container.appendChild(btnInteract);
  container.appendChild(weaponRow);
  document.body.appendChild(container);

  return {
    container,
    leftZone,
    rightZone,
    joystickBase,
    joystickThumb,
    btnReload,
    btnInteract,
    btnWeapon1,
    btnWeapon2,
    btnWeapon3,
  };
}

function createButton(label: string, action: string, size: number): HTMLDivElement {
  const btn = document.createElement('div');
  btn.className = 'touch-btn';
  btn.dataset.action = action;
  btn.textContent = label;
  btn.style.width = `${size}px`;
  btn.style.height = `${size}px`;
  return btn;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/touch-ui.ts
git commit -m "feat: create touch UI DOM overlay module"
```

---

### Task 5: Add touch UI styles to style.css

**Files:**
- Modify: `src/style.css`

- [ ] **Step 1: Append touch UI styles at end of style.css**

```css
/* ============ TOUCH CONTROLS ============ */

#touch-ui {
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
  touch-action: none;
}

#touch-left {
  position: absolute;
  left: 0;
  top: 0;
  width: 50%;
  height: 100%;
  pointer-events: auto;
  touch-action: none;
}

#touch-right {
  position: absolute;
  right: 0;
  top: 0;
  width: 50%;
  height: 100%;
  pointer-events: auto;
  touch-action: none;
}

/* Dynamic joystick */
#joystick-base {
  position: absolute;
  width: 100px;
  height: 100px;
  border: 2.5px solid rgba(255, 255, 255, 0.35);
  border-radius: 50%;
  pointer-events: none;
  z-index: 101;
}

#joystick-thumb {
  position: absolute;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 50%;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

/* Action buttons */
.touch-btn {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(100, 100, 255, 0.35);
  border: 2px solid rgba(100, 100, 255, 0.6);
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.8);
  font-weight: bold;
  font-size: 14px;
  font-family: 'Courier New', monospace;
  pointer-events: auto;
  touch-action: none;
  z-index: 102;
  user-select: none;
  -webkit-user-select: none;
}

.touch-btn[data-action="interact"] {
  background: rgba(100, 200, 100, 0.35);
  border-color: rgba(100, 200, 100, 0.6);
}

/* Weapon row */
#touch-weapon-row {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  pointer-events: auto;
  touch-action: none;
  z-index: 102;
}

#touch-weapon-row .touch-btn {
  position: relative;
  background: rgba(255, 200, 50, 0.3);
  border-color: rgba(255, 200, 50, 0.5);
}

#touch-weapon-row .touch-btn.weapon-active {
  background: rgba(255, 200, 50, 0.55);
  border-color: rgba(255, 200, 50, 0.8);
}

/* Hide touch UI on desktop */
@media (hover: hover) and (pointer: fine) {
  #touch-ui { display: none; }
}

/* Mobile: smaller HUD */
@media (hover: none) and (pointer: coarse) {
  .hud-item { padding: 6px 10px; }
  .hud-item .value { font-size: 22px; }
  .hud-item .label { font-size: 9px; }
  .hud-top-left .value { font-size: 16px; }
  .hud-top-right .value { font-size: 14px; }
  #crosshair { width: 16px; height: 16px; }
}
```

- [ ] **Step 2: Verify dev server loads without errors**

Run: `npx vite --host` (already running)
Expected: No console errors on page load

- [ ] **Step 3: Commit**

```bash
git add src/style.css
git commit -m "feat: add touch UI styles and mobile HUD media queries"
```

---

### Task 6: Implement TouchControls.ts (core touch logic)

**Files:**
- Modify: `src/TouchControls.ts` (replace stub from Task 2)

This is the core task. The class handles all touch events and translates them into virtual inputs on the `Input` instance.

- [ ] **Step 1: Replace TouchControls.ts with full implementation**

```typescript
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
  private isFiring = false;
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

    el.addEventListener('touchcancel', (e: TouchEvent) => {
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
      this.isFiring = true;
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
      if (!t || !this.rightOrigin) return;

      // Stop firing
      this.isFiring = false;
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
      this.isFiring = false;
      this.input.setTouchFiring(false);
      this.rightTouchId = null;
      this.rightOrigin = null;
    });
  }

  // ─── Buttons ───

  private bindButtons(): void {
    // Reload
    this.bindButton(this.ui.btnReload, () => {
      // Trigger the same callback chain as pressing 'r'
      const list = (this.input as any).onKeyDown as Map<string, Array<() => void>>;
      const callbacks = list.get('r');
      if (callbacks) for (const cb of callbacks) cb();
    });

    // Interact
    this.bindButton(this.ui.btnInteract, () => {
      const list = (this.input as any).onInteract as Array<() => void>;
      for (const cb of list) cb();
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
    // Update visual active state
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/TouchControls.ts
git commit -m "feat: implement TouchControls with dual joystick and button handling"
```

---

### Task 7: Wire touch controls in main.ts

**Files:**
- Modify: `src/main.ts`

This task initializes the touch controls system on mobile devices and adjusts the start flow (skip pointer lock on mobile).

- [ ] **Step 1: Add imports at top of main.ts**

Add after the existing `import { Game } from './Game';` line:

```typescript
import { Input } from './Input';
import { createTouchUI } from './touch-ui';
import { TouchControls } from './TouchControls';
```

- [ ] **Step 2: Add touch controls initialization after game creation (after line 11)**

After `const game = new Game(container);`, add:

```typescript
// ─── Mobile touch controls ───
let touchControls: TouchControls | null = null;
const WEAPON_NAMES = ['rifle', 'shotgun', 'sniper'] as const;

if (Input.isTouchDevice()) {
  const touchUI = createTouchUI();
  touchControls = new TouchControls(
    game.input,
    touchUI,
    (index: number) => {
      game.switchWeapon(WEAPON_NAMES[index]);
    },
  );
  game.input.setTouchControls(touchControls);
  game.input.setLockedOverride(true);
}
```

- [ ] **Step 3: Modify start button click handler to skip pointer lock on mobile (around line 25-34)**

Change:
```typescript
startBtn.addEventListener('click', () => {
  game.sfx.unlock();
  overlay.style.display = 'none';
  if (game.isMultiplayer()) {
    // Engine already started by game_start handler, just lock pointer
    game.input.requestPointerLock();
  } else {
    game.start();
  }
});
```
To:
```typescript
startBtn.addEventListener('click', () => {
  game.sfx.unlock();
  overlay.style.display = 'none';
  if (game.isMultiplayer()) {
    if (Input.isTouchDevice()) {
      // No pointer lock on mobile — engine already started by game_start handler
    } else {
      game.input.requestPointerLock();
    }
  } else {
    game.start();
  }
});
```

- [ ] **Step 4: Modify pointer lock change listener to not show overlay on mobile (around line 71-82)**

Change:
```typescript
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement == null) {
    const dead = (document.getElementById('gameover') as HTMLElement).style.display === 'flex';
    const mpOver = (document.getElementById('mp-gameover') as HTMLElement).style.display === 'flex';
    if (!dead && !mpOver) {
      overlay.style.display = 'flex';
      startBtn.textContent = '点击继续';
    }
  } else {
    overlay.style.display = 'none';
  }
});
```
To:
```typescript
document.addEventListener('pointerlockchange', () => {
  if (Input.isTouchDevice()) return; // No pointer lock management on mobile
  if (document.pointerLockElement == null) {
    const dead = (document.getElementById('gameover') as HTMLElement).style.display === 'flex';
    const mpOver = (document.getElementById('mp-gameover') as HTMLElement).style.display === 'flex';
    if (!dead && !mpOver) {
      overlay.style.display = 'flex';
      startBtn.textContent = '点击继续';
    }
  } else {
    overlay.style.display = 'none';
  }
});
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Errors about `game.switchWeapon` not existing — we'll fix that in Task 8.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire touch controls initialization in main.ts"
```

---

### Task 8: Add switchWeapon method to Game.ts

**Files:**
- Modify: `src/Game.ts`

The touch UI's weapon switch button needs to call a public method on Game to switch weapons.

- [ ] **Step 1: Add `switchWeapon` public method to Game class**

Add after the `isMultiplayer()` method (after line 366):

```typescript
  /** Switch weapon by type name (used by touch controls and card picker). */
  switchWeapon(type: WeaponType): void {
    if (!this.weapon || !this.player) return;
    const newMax = this.weapon.switchWeapon(type, this.playerBuffs.maxAmmoBonus);
    this.player.ammo = newMax;
    this.weapon.setDamageMultiplier(this.playerBuffs.damageMultiplier);
    const weaponNames: Record<WeaponType, string> = { rifle: '步枪', shotgun: '霰弹枪', sniper: '狙击枪' };
    this.hud.setWeapon(weaponNames[type]);
    this.hud.setAmmo(this.player.ammo);
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/Game.ts
git commit -m "feat: add public switchWeapon method for touch UI"
```

---

### Task 9: Handle mobile start flow — skip overlay controls text

**Files:**
- Modify: `src/main.ts`

On mobile, the start overlay shows keyboard/mouse controls that aren't relevant. We should show touch-friendly instructions instead.

- [ ] **Step 1: After the touch controls init block (from Task 7 Step 2), add mobile overlay adaptation**

```typescript
if (Input.isTouchDevice()) {
  // ... (existing touch init code) ...

  // Adapt start overlay for mobile
  const controlsDiv = overlay.querySelector('.controls');
  if (controlsDiv) {
    controlsDiv.innerHTML = `
      <div>左侧滑动 → 移动</div>
      <div>右侧滑动 → 视角</div>
      <div>右侧按住 → 射击</div>
      <div>右侧上滑 → 跳跃</div>
      <div>[R] → 换弹</div>
      <div>[E] → 交互</div>
      <div>[1][2][3] → 切换武器</div>
    `;
  }
  // Hide pointer lock hint
  const hint = overlay.querySelector('.hint');
  if (hint) (hint as HTMLElement).style.display = 'none';
}
```

- [ ] **Step 2: Verify dev server compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: adapt start overlay for mobile touch instructions"
```

---

### Task 10: Final integration test

**Files:**
- None (testing only)

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Verify dev server runs**

Run: `npx vite --host`
Expected: Server starts without errors

- [ ] **Step 3: Test on desktop — verify nothing changed**

Open http://localhost:5173 in a desktop browser. Verify:
- No touch UI visible
- Keyboard + mouse controls work normally
- Pointer lock works
- Game plays as before

- [ ] **Step 4: Test on mobile device**

Open the same URL on a phone (same network). Verify:
- Touch UI (joystick zones + buttons) is visible
- Left side touch produces movement joystick
- Right side touch slides view and auto-fires
- Swipe up on right side triggers jump
- R/E/1/2/3 buttons work
- Start overlay shows touch instructions
- No pointer lock required

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete mobile touch controls implementation"
```
