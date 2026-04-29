# Mobile Touch Controls Design

**Date:** 2026-04-26
**Status:** Approved
**Approach:** Extend Input class (方案 1)

## Overview

Add mobile touch controls to the Doom FPS game so it is playable on phones and tablets. The design uses a "shoot-as-joystick" layout: left side for a dynamic movement joystick, right side for aim + auto-fire + jump gesture, with dedicated buttons for reload, interact, and weapon switching.

Desktop gameplay is completely unaffected — all touch code only activates on touch-capable devices.

## Layout

```
┌─────────────────────────────────┐
│  HP 100    [crosshair]   30/30  │  ← HUD (pointer-events: none)
│                                 │
│  [E]                            │
│  [R]      Right half screen:    │
│           slide → aim           │
│  ○ ← dyn  hold → auto-fire     │
│  move     swipe up → jump       │
│  joystick                       │
│         [1] [2] [3]             │  ← Weapon switch
└─────────────────────────────────┘
```

**Controls summary:**
- Left side any position press → movement joystick appears (dynamic position)
- Right side any position press + slide → aim control
- Right side hold → auto-fire
- Right side swipe up → jump
- R button → reload
- E button → interact (open doors, etc.)
- 1/2/3 buttons → switch weapon (rifle/shotgun/sniper)

## Architecture

### New files
- `src/TouchControls.ts` — Touch event handling, multi-touch tracking, joystick logic
- `src/touch-ui.ts` — DOM generation for touch overlay elements

### Modified files
- `src/Input.ts` — Add virtual input methods + locked override
- `src/main.ts` — Initialize touch controls on mobile devices
- `src/config.ts` — Add touch-specific configuration parameters
- `index.html` — Add viewport meta tag

### Input.ts Extensions

```typescript
// New private properties
private virtualKeys: Map<string, boolean> = new Map();
private virtualMouseDX = 0;
private virtualMouseDY = 0;
private lockedOverride = false;

// New public methods
setVirtualKey(key: string, pressed: boolean): void
injectMouseDelta(dx: number, dy: number): void
setLockedOverride(value: boolean): void

// Static detection
static isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
```

**Existing method changes (backward-compatible):**
- `isDown(key)` — also checks `virtualKeys`
- `consumeMouseDelta()` — merges real + virtual deltas
- `isLocked()` — returns true if locked OR `lockedOverride`
- `isMouseDown()` — returns true if mouse down OR touch firing
- `dispose()` — also cleans up TouchControls

### TouchControls.ts

Multi-touch tracking with separate left/right touch IDs.

**Left half — Dynamic movement joystick:**
1. `touchstart` on left half → record origin, create joystick DOM circle
2. `touchmove` → compute offset, map to WASD based on angle and deadzone
3. Diagonal movement supported (e.g., WA = forward-left)
4. `touchend` → clear all virtual keys, destroy joystick DOM

**Right half — Aim + fire + jump:**
1. `touchstart` on right half → record origin, set fire = true
2. `touchmove` → compute delta, call `injectMouseDelta(dx * sens, dy * sens)`
3. `touchend` → set fire = false, check Y offset for jump swipe

**Buttons (R / E / 1 / 2 / 3):**
- `touchstart` with `stopPropagation` to prevent joystick/aim triggers
- R: triggers reload callback
- E: triggers interact callbacks
- 1/2/3: calls `game.switchWeapon(index)`

### touch-ui.ts

Generates touch overlay DOM only on mobile devices. Structure:
```
#touch-ui (position:fixed, inset:0, z-index:100, pointer-events:none)
  ├── #touch-left   (left 50%, pointer-events:auto)
  ├── #touch-right  (right 50%, pointer-events:auto)
  └── #touch-buttons (pointer-events:auto)
       ├── .touch-btn[data-action="reload"]
       ├── .touch-btn[data-action="interact"]
       ├── .touch-btn[data-action="weapon-1"]
       ├── .touch-btn[data-action="weapon-2"]
       └── .touch-btn[data-action="weapon-3"]
```

Button styles: semi-transparent circles with border highlights. Active weapon button highlighted. Fire zone has no visible elements (optional border flash feedback).

### config.ts Additions

```typescript
touch: {
  moveDeadzone: 15,        // Movement joystick deadzone (px)
  lookSensitivity: 0.4,    // Look sensitivity (lower than mouse)
  jumpSwipeThreshold: 80,  // Swipe-up jump threshold (px)
  joystickRadius: 50,      // Joystick visual radius (px)
  buttonSize: 48,          // Action button size (px)
}
```

### index.html Changes

Add viewport meta for proper mobile scaling:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
```

### main.ts Changes

After game initialization, before start:
```typescript
if (Input.isTouchDevice()) {
  const touchUI = createTouchUI(game);
  const touchControls = new TouchControls(game.input, touchUI);
  game.input.setLockedOverride(true);
}
```

### Hud.ts Adaptation

- Scale down HUD font sizes and element sizes on mobile
- Keep `pointer-events: none` on HUD container

## Key Design Decisions

1. **Extend Input, don't replace** — Minimal change to existing code, zero impact on desktop
2. **Virtual key injection** — Touch controls set virtual keys that `isDown()` checks alongside real keys
3. **Pointer lock bypass** — Mobile sets `lockedOverride = true` since Pointer Lock API is unavailable
4. **Dynamic joystick** — Appears at finger position on touch, disappears on release
5. **Right zone = aim + fire combined** — Hold to auto-fire while sliding to aim, reducing thumb movement
6. **Swipe-up jump** — Natural gesture, no extra button needed
7. **Separate sensitivity config** — Touch look sensitivity is independent of mouse sensitivity
