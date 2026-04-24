# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A browser-based 3D Doom-like FPS built with **Three.js + TypeScript + Vite**. Zero external assets — all geometry is procedural, all audio is synthesized via Web Audio API. Single production dependency: `three`.

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Dev server at http://localhost:5173 (auto-increments if busy)
pnpm build            # TypeScript type-check + Vite production build → dist/
pnpm preview          # Serve production build locally
pnpm typecheck        # Type-check only (tsc --noEmit)
```

No test framework, linter, or CI pipeline is configured. TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters`) is the only static check.

## Architecture

**Game** (`Game.ts`) is the top-level orchestrator. It owns all subsystems and manages the game state machine (`playing | dead | won`).

### Subsystem ownership

```
Game
 ├── Engine      — Three.js scene/camera/renderer, requestAnimationFrame loop
 ├── Input       — Keyboard state + Pointer Lock mouse deltas + event callbacks
 ├── Level       — Procedural arena geometry, lights, wall AABB collision list
 ├── Player      — First-person controller (movement, look, jump, gravity, collision)
 ├── Weapon      — Fire rate cooldown, ammo tracking, hitscan raycast
 ├── WeaponModel — First-person gun mesh + muzzle flash + recoil animation
 ├── Enemy[]     — FSM per enemy: idle → chase → attack → dead
 ├── Hud         — DOM-based HUD (HP/ammo/enemy count/damage flash)
 └── Sfx         — Web Audio procedural sound synthesis
```

### Frame update order (matters for correctness)

```
Player.update → Weapon.update → WeaponModel.update → Enemy.update ×N → HUD refresh → renderer.render
```

### Key patterns

- **Hitscan weapons**: Raycast from camera origin along `Player.getLookDir()` using `THREE.Raycaster.intersectObjects` against enemy hitbox meshes. No projectile physics.
- **Circle-vs-AABB collision**: `Level.resolveCircleVsWalls(x, z, radius)` handles XZ plane collision for both player and enemies. Y-axis (gravity/jump) is independent.
- **Enemy AI FSM**: Distance-based state transitions. `attack` state uses probability-based hitscan (`attackChance`) with cooldown — no actual bullet travel.
- **HMR cleanup**: `main.ts` uses `import.meta.hot.dispose()` to tear down WebGL context on hot reload, preventing canvas stacking.
- **Audio unlock**: `Sfx.unlock()` called on first user click to satisfy browser autoplay policy.

### Configuration

All tunable game parameters live in `src/config.ts` (player speed, weapon damage, enemy count, colors, fog density, etc.). Changes hot-reload instantly via Vite HMR.

### Build config

- **Vite**: Base URL `./` (relative paths), path alias `@/` → `src/`, sourcemaps enabled, target ES2022
- **TypeScript**: Strict mode, bundler module resolution, ES2022 target
- **Package manager**: pnpm
