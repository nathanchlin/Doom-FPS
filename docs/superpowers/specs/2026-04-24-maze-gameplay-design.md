# Maze Gameplay Design Spec

## Overview

Replace the existing single-arena shooter with an endless maze exploration mode. Players navigate procedurally generated corridor mazes, finding doors that teleport them to isolated rooms containing combat encounters, treasure chests, or the exit to the next floor. Art style remains unchanged: white geometry + black wireframe outlines.

## Core Loop

```
Generate maze → Explore corridors → Find door → Enter room →
  ├─ Combat room (65%): Kill enemies → Return to maze
  ├─ Treasure room (20%): Open chest → Return to maze
  └─ Exit room (1 per floor): Advance to next floor → Generate new maze
```

Resources (HP, ammo) carry across floors. Death ends the run; no victory condition.

## 1. Maze Generation

**Algorithm**: Recursive Backtracker — produces long winding corridors with few dead ends, strong exploration feel.

**Grid**: NxN cells, each cell is 6m × 6m open space with walls between cells.

| Floor | Grid Size | Total Area | Door Count |
|-------|-----------|------------|------------|
| 1     | 8×8       | 48m × 48m | 5          |
| 2     | 9×9       | 54m × 54m | 6          |
| 3     | 10×10     | 60m × 60m | 7          |
| 4+    | +1/floor  | up to 84m | 8 (cap)    |
| 7+    | 14×14 cap | 84m × 84m | 8          |

**Door placement**: Select 5–8 dead-end cells (cells with exactly one opening). Place a door at each dead end's wall. Dead ends guarantee the player must walk in to discover the door — natural fit. If the maze has fewer dead ends than needed, use all available dead ends (minimum 3 required — regenerate maze if fewer).

**Door content assignment**:
1. Randomly designate exactly 1 door as the exit.
2. Remaining doors: 76.5% combat room, 23.5% treasure room (preserves overall 65/20/15 ratio).

**Visual style**: White walls (`MeshStandardMaterial`), black `EdgesGeometry` outlines, 4.5m ceiling, grid-lined floor. Doors rendered as dark rectangular frames embedded in walls; glow highlight when player is within 2m.

## 2. Door & Room System

### Door Interaction

- Player within 2m of a door → HUD shows `[E] OPEN DOOR`
- Press E → 0.3s black fade transition → teleport to room
- Opened doors turn gray and cannot be re-entered

### Room Structure

All three room types share the same base: a 12m × 12m sealed rectangular room with one "return door."

### Combat Room (65%)

- Door locks on entry.
- 2–4 enemies spawn (count scales with floor).
- 1–2 low cover walls inside the room for tactical play.
- All enemies killed → return door unlocks → HUD shows "CLEARED."

### Treasure Room (20%)

- Room center: a procedural chest mesh (rectangular box with lid, gold emissive material).
- Approach chest + press E to open. Loot rolls:
  - Ammo +10–20 rounds (70% chance), capped at 30.
  - Health +20–40 HP (50% chance), capped at 100.
  - Both can proc simultaneously.
- Return door available immediately.

### Exit Room (1 per floor)

- Contains a distinctive green-glow portal/door.
- Approach + press E → 0.3s fade → generate next floor maze.
- HP and ammo carry over. HUD displays "FLOOR N" for 1.5s.

### Return to Maze

After leaving a combat/treasure room, the player appears at their pre-door position. The opened door visually changes (gray/open state).

## 3. Enemy Types

### Standard (existing enemy, reworked)

- **Appearance**: White cube + red emissive eye strip (unchanged).
- **HP**: 100 | **Speed**: 2.8 m/s | **Attack**: Ranged hitscan, 70% accuracy, 12 dmg/hit.
- **Behavior**: Current FSM (idle → chase → attack → dead). Engage at 20m, stop at 6m.
- **Available from**: Floor 1.

### Rusher (new)

- **Appearance**: Smaller cube (0.6× volume), **red material**, black wireframe outlines.
- **HP**: 50 | **Speed**: 5.5 m/s | **Attack**: Melee contact damage, 15 HP per hit, 1s cooldown.
- **Behavior**: No attack-stop state — always chasing. Contact damage has a 1s cooldown (keeps chasing during cooldown, just doesn't deal damage).
- **Available from**: Floor 1.

### Tank (new)

- **Appearance**: Larger cube (1.5× volume), **dark gray material**, black wireframe outlines, **double red eye strips**.
- **HP**: 250 | **Speed**: 1.8 m/s | **Attack**: Ranged hitscan, 80% accuracy, 20 dmg/hit.
- **Behavior**: Same FSM as Standard, but engageDistance = 25m (earlier aggro).
- **Available from**: Floor 3.

### Combat Room Enemy Composition

| Floor | Enemy Count | Pool |
|-------|-------------|------|
| 1–2   | 2–3         | Standard + Rusher |
| 3–4   | 3–4         | Standard + Rusher + Tank (max 1 Tank) |
| 5+    | 3–5         | All types (max 2 Tanks) |

### Stat Scaling Per Floor

- **HP**: `base × (1 + 0.1 × floor)` → Floor 5 = 1.5×, Floor 10 = 2×
- **Damage**: `base × (1 + 0.08 × floor)` → Floor 5 = 1.4×, Floor 10 = 1.8×
- **Speed**: No scaling (keeps gameplay reactive and fair).

## 4. Resource Economy

### Starting Resources

- Ammo: 30 rounds (full magazine)
- Health: 100 HP

### Treasure Chest Output

Each chest rolls independently:
- **Ammo**: 70% chance → +10–20 rounds (capped at 30)
- **Health**: 50% chance → +20–40 HP (capped at 100)

### Economy Pressure Analysis

- Standard enemy: 3 shots to kill (100 HP ÷ 34 dmg)
- Rusher: 2 shots to kill (50 HP ÷ 34 dmg)
- Tank: 8 shots to kill (250 HP ÷ 34 dmg)
- Average combat room costs 10–15 rounds
- Treasure room appears every ~3.3 doors on average
- **Conclusion**: Ammo is tight. Accuracy matters. Fits hardcore positioning.

### No Reload Between Floors

HP and ammo carry over unchanged. This is the core survival pressure of endless mode.

## 5. Game State Machine

### States

```
exploring  — Player navigating maze corridors
in_room    — Player inside a teleported room (combat/treasure/exit)
dead       — Game over
```

The existing `won` state is removed (endless mode has no victory).

### Transitions

```
exploring → in_room    (press E at door)
in_room   → exploring  (use return door after room cleared)
in_room   → exploring  (exit room: generates new floor, resets to exploring)
exploring → dead       (HP ≤ 0, though enemies only exist in rooms)
in_room   → dead       (HP ≤ 0 during combat)
dead      → exploring  (press R: full restart from Floor 1)
```

## 6. HUD Changes

### Modified Elements

| Element | Position | Content |
|---------|----------|---------|
| Health | Bottom-left (unchanged) | `HP: 78` |
| Ammo | Bottom-right (unchanged) | `AMMO: 24/30` |
| ~~Enemy count~~ | Removed | No longer relevant in maze |
| **Floor** (new) | Top-left | `FLOOR 3` |
| **Door count** (new) | Top-right | `DOORS: 2/6` (opened/total) |
| **Interact prompt** (new) | Center-bottom | `[E] OPEN DOOR` / `[E] OPEN CHEST` |
| **Floor transition** (new) | Center | `FLOOR 3` large text, fades out over 1.5s |
| **Room combat** (new) | Top-center | `ENEMIES: 3` → `CLEARED` when done |

### Game Over Screen

Replaces current death screen. Shows:
- **Floor reached** (primary score)
- Total kills
- Survival time
- Doors opened

Press R or click button to restart from Floor 1.

## 7. Architecture Changes

### New Files

| File | Responsibility |
|------|---------------|
| `src/Maze.ts` | Maze grid generation (recursive backtracker), cell/wall data, door placement |
| `src/Room.ts` | Room generation (combat/treasure/exit), enemy spawning, chest logic |
| `src/Door.ts` | Door mesh, interaction detection, state (locked/open/used) |
| `src/Chest.ts` | Chest mesh, open animation, loot roll logic |

### Modified Files

| File | Changes |
|------|---------|
| `src/Level.ts` | Replace arena generation with maze rendering. Consume `Maze` grid data → build Three.js walls/floor/ceiling. Keep `resolveCircleVsWalls()` but fed maze AABB data instead. |
| `src/Game.ts` | New state machine (`exploring`/`in_room`/`dead`). Manage floor transitions, room teleport, door interactions. Track floor number and stats. |
| `src/Enemy.ts` | Add `type` field (`standard`/`rusher`/`tank`). Rusher: no attack state, contact damage. Tank: larger mesh, double eyes, higher stats. Scale stats by floor. |
| `src/Hud.ts` | Replace enemy counter with floor/door display. Add interaction prompts, floor transition overlay, room combat UI, updated game-over stats. |
| `src/Input.ts` | Add E key binding for interact action. |
| `src/config.ts` | Add maze config section (grid sizes, door counts, room probabilities, enemy type stats, scaling factors, chest loot tables). |
| `src/Player.ts` | Add position save/restore for room teleport. |
| `src/main.ts` | Update HMR cleanup for new systems. |

### Unchanged Files

| File | Why |
|------|-----|
| `src/Engine.ts` | Render loop unchanged. |
| `src/Weapon.ts` | Hitscan logic unchanged. |
| `src/WeaponModel.ts` | Gun mesh/animation unchanged. |
| `src/Sfx.ts` | Existing sounds unchanged. Add new sounds: door open, chest open, floor transition chime. |

### Frame Update Order

```
Engine.loop(dt)
  ├─ Player.update(dt)
  ├─ Weapon.update(dt)
  ├─ WeaponModel.update(dt)
  ├─ [if in_room] Enemy.update(dt) × N
  ├─ [if exploring] Door.checkProximity(playerPos) × N
  ├─ Hud.update()
  └─ renderer.render()
```

Enemies only update in rooms. Doors only check proximity during exploration.
