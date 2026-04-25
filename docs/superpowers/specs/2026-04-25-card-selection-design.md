# Card Selection System Design Spec

## Overview

Add a Roguelike card selection screen between floors. When the player finds the exit, instead of immediately entering the next maze, a full-screen card picker appears with 3 cards (one per category). Effects are permanent and stackable across the run. Picking a card dismisses the screen and generates the next floor.

## Trigger

Player presses E at exit portal in exit room → fade to black → card selection screen appears (game paused) → player picks one card → card effect applied → generate next floor → fade in → resume play.

## Card Categories

### Weapon Cards (pick replaces current weapon, ammo resets to new weapon's max)

| Weapon | Damage | Fire Rate | Magazine | Range | Mechanic |
|--------|--------|-----------|----------|-------|----------|
| Rifle (default) | 34 | 0.14s | 30 | 80m | Balanced single hitscan |
| Shotgun | 8×6 pellets | 0.8s | 8 | 20m | 6 spread rays, close range |
| Sniper | 120 | 1.2s | 5 | 150m | High damage single shot |

Selecting a weapon card replaces the current weapon entirely. Magazine resets to the new weapon's max. Weapon damage buff (from stat cards) applies multiplicatively on top of the base damage.

### Stat Cards (permanent additive stacking)

| Card | Effect |
|------|--------|
| Health Boost | Max HP +25, current HP +25 |
| Ammo Expand | Max magazine +10, current ammo +10 |
| Speed Up | Move speed +1.0 m/s, sprint speed +1.5 m/s |
| Damage Up | Weapon damage ×1.15 (multiplicative stacking) |

One stat card is randomly selected from the 4 options each time.

### Special Cards (one-time powerful effects)

| Card | Effect |
|------|--------|
| Full Heal | Restore HP to max |
| Ammo Resupply | Restore ammo to max |
| Shield | Next floor: first 3 hits deal half damage |
| Scout | Next floor: all door types visible (combat/treasure/exit labels) |

One special card is randomly selected from the 4 options each time.

## UI Layout

Full-screen semi-transparent overlay (same style as existing panels — white bg, black borders, monospace font).

Three cards side by side, horizontally centered:
- Category label at top: `WEAPON` / `STAT` / `SPECIAL`
- Card title (bold, large)
- Description text (1-2 lines)
- Hover: border highlight + slight scale up
- Click: card selected → brief flash → overlay dismissed

Mouse cursor unlocked during card selection (exit pointer lock, re-lock after pick).

## Player Buffs Data

```typescript
interface PlayerBuffs {
  currentWeapon: 'rifle' | 'shotgun' | 'sniper';
  damageMultiplier: number;   // starts 1.0, ×1.15 per Damage Up
  maxHealthBonus: number;     // added to CONFIG.player.maxHealth
  maxAmmoBonus: number;       // added to current weapon's base magazine
  speedBonus: number;         // added to CONFIG.player.moveSpeed
  sprintBonus: number;        // added to CONFIG.player.sprintSpeed
  shieldHits: number;         // remaining half-damage hits (0 = inactive)
  scoutActive: boolean;       // show door types on current floor
}
```

Stored in `Game`. Applied when calculating effective stats. Reset on death/restart (new run = fresh buffs).

## Architecture Changes

### New Files

| File | Responsibility |
|------|---------------|
| `src/CardPicker.ts` | Card data definitions, random selection logic, UI rendering (DOM overlay), click handling, returns selected card |
| `src/weapons.ts` | Weapon type definitions and stats (rifle/shotgun/sniper base configs) |

### Modified Files

| File | Changes |
|------|---------|
| `src/Game.ts` | Add `playerBuffs` state. Intercept exit room → show CardPicker → apply card → then advance floor. Apply buffs to effective player stats. Reset buffs on restart. |
| `src/Weapon.ts` | Support weapon type switching (different fire rates, damage, magazine, range). Shotgun: fire multiple spread rays. Sniper: single high-damage ray. |
| `src/Player.ts` | Effective speed = base + bonus. Effective maxHealth = base + bonus. Shield damage reduction. |
| `src/config.ts` | Add weapon type configs (shotgun, sniper base stats). Add card definitions. |
| `src/Hud.ts` | Show current weapon name. Show shield indicator if active. |
| `src/Door.ts` | Support scout mode: show room type label above door when scoutActive. |
| `index.html` | Add card picker overlay HTML structure. |
| `src/style.css` | Card picker styles (3-column card layout, hover effects, category labels). |

### Unchanged Files

| File | Why |
|------|-----|
| `src/Maze.ts` | Generation unchanged |
| `src/Level.ts` | Rendering unchanged |
| `src/Enemy.ts` | Enemy behavior unchanged |
| `src/Room.ts` | Room logic unchanged |
| `src/Chest.ts` | Chest logic unchanged |
| `src/Engine.ts` | Render loop unchanged |
| `src/Sfx.ts` | May add card select sound (minor) |

## Game Flow Update

```
Exit room portal → press E →
  fade to black →
  pause game loop →
  show card picker (unlock mouse) →
  player clicks a card →
  apply effect to playerBuffs →
  hide card picker →
  generate next floor →
  fade in (re-lock mouse) →
  resume game loop →
  show "FLOOR N"
```

## Weapon Switching Details

When a weapon card is selected:
1. Set `playerBuffs.currentWeapon` to new type
2. Update `Weapon` instance with new stats (fireRate, damage, magazine, range, spread)
3. Reset ammo to new weapon's effective max (base + maxAmmoBonus)
4. WeaponModel visual could stay the same (same white rifle mesh — visual distinction is optional/future)

Shotgun fire mechanic: instead of 1 raycast, fire 6 rays with random spread (±5° cone). Each ray does base damage independently. Short range limit.

Sniper fire mechanic: single raycast, high damage, long range, slow fire rate. Small recoil kick (larger visual feedback).

## Scout Card Details

When scout is active for a floor:
- Each Door renders a small text label above it: "COMBAT" (red), "TREASURE" (gold), "EXIT" (green)
- Uses simple Three.js sprite or CSS2DRenderer text
- Simpler approach: add a colored point light above each door matching its type — red/gold/green glow visible from distance
- Scout resets to false when entering the next floor after the scouted one

## Shield Card Details

`shieldHits` starts at 3 when selected. Each time `onPlayerHit` is called and shieldHits > 0, damage is halved and shieldHits decremented. When it reaches 0, normal damage resumes. Persists across floors until used up.
