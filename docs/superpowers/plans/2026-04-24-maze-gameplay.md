# Maze Gameplay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-arena shooter with an endless maze exploration mode featuring procedural maze generation, door-based room teleportation, three enemy types, treasure chests, and hardcore resource economy.

**Architecture:** The existing `Level.ts` arena generation is replaced by a `Maze.ts` generator that produces grid data consumed by a rewritten `Level.ts` to build Three.js geometry. New `Door.ts`, `Room.ts`, and `Chest.ts` handle room teleportation. `Enemy.ts` gains a `type` discriminator for Standard/Rusher/Tank variants. `Game.ts` state machine changes from `playing|dead|won` to `exploring|in_room|dead` with floor progression tracking.

**Tech Stack:** Three.js, TypeScript, Vite, Web Audio API (all existing)

**Spec:** `docs/superpowers/specs/2026-04-24-maze-gameplay-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/config.ts` | Modify | Add maze, door, room, chest, enemy type, and scaling config sections |
| `src/Maze.ts` | Create | Recursive backtracker maze generation, cell/wall grid data, dead-end detection, door placement |
| `src/Level.ts` | Rewrite | Consume Maze grid data to build Three.js walls/floor/ceiling/lighting. Keep `resolveCircleVsWalls()` interface but feed maze AABB data. Add `dispose()` for floor transitions |
| `src/Door.ts` | Create | Door mesh with dark frame + glow highlight, proximity detection, open/used state, room type assignment |
| `src/Room.ts` | Create | Sealed 12x12 room generation (combat/treasure/exit variants), enemy spawning, cover walls, return door logic |
| `src/Chest.ts` | Create | Chest mesh with gold emissive, open animation, loot roll (ammo/health) |
| `src/Enemy.ts` | Modify | Add `EnemyType` discriminator (`standard`/`rusher`/`tank`), type-specific constructors for mesh/stats, Rusher contact-damage behavior, Tank double-eye variant, per-floor stat scaling |
| `src/Game.ts` | Rewrite | New state machine (`exploring`/`in_room`/`dead`), floor management, door interaction dispatch, room enter/exit teleport, stats tracking (floor/kills/time/doors), restart from floor 1 |
| `src/Hud.ts` | Rewrite | Replace enemy counter with floor/door display, add interaction prompts, floor transition overlay, room combat UI, updated game-over stats screen |
| `src/Input.ts` | Modify | Add E key binding for interact |
| `src/Player.ts` | Modify | Add position save/restore for room teleport, `setPosition()` helper |
| `src/Sfx.ts` | Modify | Add door open, chest open, floor transition sounds |
| `src/main.ts` | Modify | Update pointer-lock-change handler for new game states, add E key control hint |
| `index.html` | Modify | Replace HUD elements (remove enemies, add floor/doors/interact/room-combat), replace victory overlay with floor-transition, update controls list |
| `src/style.css` | Modify | Add styles for new HUD elements (floor, doors, interact prompt, room status, floor transition animation) |

---

## Task 1: Update config.ts with maze configuration

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Add maze, door, room, chest, and enemy type config**

Replace the entire `src/config.ts` with the expanded configuration:

```typescript
/**
 * Global game configuration — tweak these to rebalance.
 */

export const CONFIG = {
  // Player
  player: {
    height: 1.75,
    radius: 0.4,
    moveSpeed: 6.0,
    sprintSpeed: 10.0,
    jumpVelocity: 6.2,
    gravity: 22.0,
    maxHealth: 100,
    maxAmmo: 30,
    damageTakenPerHit: 12,
  },

  // Weapon
  weapon: {
    fireRate: 0.14,
    damage: 34,
    recoilKick: 0.05,
    recoilRecover: 8.0,
    muzzleFlashDuration: 0.05,
    maxRange: 80,
  },

  // Enemy base stats (before type multipliers)
  enemy: {
    radius: 0.6,
    height: 1.9,
    // Type-specific overrides
    types: {
      standard: {
        health: 100,
        moveSpeed: 2.8,
        attackCooldown: 1.2,
        attackChance: 0.7,
        attackDamage: 12,
        engageDistance: 20,
        stopDistance: 6,
        color: 0xf0f0f0,
        scale: 1.0,
      },
      rusher: {
        health: 50,
        moveSpeed: 5.5,
        contactDamage: 15,
        contactCooldown: 1.0,
        engageDistance: 20,
        color: 0xcc3333,
        scale: 0.6,
      },
      tank: {
        health: 250,
        moveSpeed: 1.8,
        attackCooldown: 1.2,
        attackChance: 0.8,
        attackDamage: 20,
        engageDistance: 25,
        stopDistance: 6,
        color: 0x666666,
        scale: 1.5,
      },
    },
    // Per-floor scaling
    scaling: {
      hpPerFloor: 0.1,      // base × (1 + 0.1 × floor)
      damagePerFloor: 0.08,  // base × (1 + 0.08 × floor)
    },
  },

  // Maze generation
  maze: {
    cellSize: 6,           // meters per cell
    wallThickness: 0.5,
    baseGridSize: 8,       // floor 1 = 8×8
    maxGridSize: 14,        // cap
    minDeadEnds: 3,        // regenerate if fewer
  },

  // Doors
  door: {
    baseDoorCount: 5,
    maxDoorCount: 8,
    interactDistance: 2.0,
    // Probabilities (before exit assignment)
    combatChance: 0.765,   // 65 / (65+20) for non-exit doors
    treasureChance: 0.235, // 20 / (65+20)
    width: 1.4,
    height: 3.0,
    frameColor: 0x333333,
    glowColor: 0x88aaff,
    usedColor: 0x999999,
    exitGlowColor: 0x44ff88,
  },

  // Rooms
  room: {
    size: 12,              // 12×12 meters
    wallHeight: 4.5,
    coverCount: { min: 1, max: 2 },  // low walls in combat rooms
    coverHeight: 1.5,
    // Enemy count per floor tier
    enemyCount: {
      tier1: { min: 2, max: 3 },   // floor 1-2
      tier2: { min: 3, max: 4 },   // floor 3-4
      tier3: { min: 3, max: 5 },   // floor 5+
    },
    tankUnlockFloor: 3,
    maxTanksTier2: 1,
    maxTanksTier3: 2,
  },

  // Chest
  chest: {
    ammoChance: 0.7,
    ammoMin: 10,
    ammoMax: 20,
    healthChance: 0.5,
    healthMin: 20,
    healthMax: 40,
    color: 0xdaa520,         // gold
    emissiveColor: 0xdaa520,
    emissiveIntensity: 0.8,
  },

  // World
  world: {
    wallHeight: 4.5,
  },

  // Rendering
  render: {
    fov: 78,
    near: 0.05,
    far: 200,
    fogDensity: 0.004,
  },

  // Transition
  transition: {
    fadeDuration: 0.3,     // seconds
    floorDisplayDuration: 1.5,
  },

  // Colors
  colors: {
    floor: 0xf5f5f5,
    wall: 0xe8e8e8,
    wallAccent: 0xdddddd,
    ceiling: 0xfafafa,
    player: 0x4ade80,
    enemy: 0xf0f0f0,
    enemyDead: 0xcccccc,
    bullet: 0xff6600,
    muzzleFlash: 0xffcc55,
    light1: 0xffffff,
    light2: 0xffffff,
    fog: 0xf0f0f0,
    pickupAmmo: 0xf59e0b,
    pickupHealth: 0x4ade80,
  },
} as const;
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck`

Expected: SUCCESS (config is consumed via property access, so new fields don't break anything; removed `enemy.count/health/moveSpeed/attackRange` etc. will cause errors in Enemy.ts and Game.ts — that's expected and will be fixed in later tasks)

Note: Type errors in `Enemy.ts` and `Game.ts` referencing old `CONFIG.enemy.*` paths are expected at this point. They will be resolved in Tasks 4 and 6.

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: expand config.ts with maze, door, room, chest, and enemy type settings"
```

---

## Task 2: Create Maze.ts — procedural maze generator

**Files:**
- Create: `src/Maze.ts`

- [ ] **Step 1: Create the maze generator**

Create `src/Maze.ts`:

```typescript
import { CONFIG } from './config';

/** Cardinal direction bitmask for cell walls */
export const DIR = {
  N: 1,   // -Z
  S: 2,   // +Z
  E: 4,   // +X
  W: 8,   // -X
} as const;

const OPPOSITE: Record<number, number> = {
  [DIR.N]: DIR.S,
  [DIR.S]: DIR.N,
  [DIR.E]: DIR.W,
  [DIR.W]: DIR.E,
};

const DX: Record<number, number> = { [DIR.N]: 0, [DIR.S]: 0, [DIR.E]: 1, [DIR.W]: -1 };
const DZ: Record<number, number> = { [DIR.N]: -1, [DIR.S]: 1, [DIR.E]: 0, [DIR.W]: 0 };

export type RoomType = 'combat' | 'treasure' | 'exit';

export interface DoorPlacement {
  cellRow: number;
  cellCol: number;
  wallDir: number;       // which wall the door is on (DIR.N/S/E/W)
  roomType: RoomType;
}

export interface MazeData {
  rows: number;
  cols: number;
  /** grid[row][col] = bitmask of OPEN walls (carved passages). If bit DIR.N is set, north wall is open. */
  grid: number[][];
  doors: DoorPlacement[];
}

/**
 * Generate a maze using recursive backtracker (depth-first with random neighbor).
 * Returns cell grid + door placements with assigned room types.
 */
export function generateMaze(floor: number): MazeData {
  const gridSize = Math.min(
    CONFIG.maze.baseGridSize + (floor - 1),
    CONFIG.maze.maxGridSize,
  );
  const rows = gridSize;
  const cols = gridSize;

  let grid: number[][];
  let deadEnds: Array<{ row: number; col: number }>;

  // Generate until we have enough dead ends
  do {
    grid = Array.from({ length: rows }, () => Array(cols).fill(0) as number[]);
    carve(grid, rows, cols);
    deadEnds = findDeadEnds(grid, rows, cols);
  } while (deadEnds.length < CONFIG.maze.minDeadEnds);

  // Determine door count for this floor
  const doorCount = Math.min(
    CONFIG.door.baseDoorCount + (floor - 1),
    CONFIG.door.maxDoorCount,
    deadEnds.length,
  );

  // Shuffle dead ends and pick doorCount
  shuffle(deadEnds);
  const chosenEnds = deadEnds.slice(0, doorCount);

  // Assign room types: first one is exit, rest are combat/treasure
  const doors: DoorPlacement[] = chosenEnds.map((de, i) => {
    const wallDir = getClosedWall(grid, de.row, de.col, rows, cols);
    let roomType: RoomType;
    if (i === 0) {
      roomType = 'exit';
    } else {
      roomType = Math.random() < CONFIG.door.combatChance ? 'combat' : 'treasure';
    }
    return {
      cellRow: de.row,
      cellCol: de.col,
      wallDir,
      roomType,
    };
  });

  // Shuffle doors so exit isn't always first in spatial order
  shuffle(doors);

  return { rows, cols, grid, doors };
}

/** Recursive backtracker maze carving */
function carve(grid: number[][], rows: number, cols: number): void {
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false) as boolean[]);
  const stack: Array<{ r: number; c: number }> = [];

  // Start from random cell
  const startR = Math.floor(Math.random() * rows);
  const startC = Math.floor(Math.random() * cols);
  visited[startR][startC] = true;
  stack.push({ r: startR, c: startC });

  while (stack.length > 0) {
    const curr = stack[stack.length - 1]!;
    const neighbors = getUnvisitedNeighbors(curr.r, curr.c, rows, cols, visited);

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const { r: nr, c: nc, dir } = neighbors[Math.floor(Math.random() * neighbors.length)]!;
    // Carve wall between current and neighbor
    grid[curr.r][curr.c] |= dir;
    grid[nr][nc] |= OPPOSITE[dir]!;
    visited[nr][nc] = true;
    stack.push({ r: nr, c: nc });
  }
}

function getUnvisitedNeighbors(
  r: number, c: number, rows: number, cols: number, visited: boolean[][],
): Array<{ r: number; c: number; dir: number }> {
  const result: Array<{ r: number; c: number; dir: number }> = [];
  for (const dir of [DIR.N, DIR.S, DIR.E, DIR.W]) {
    const nr = r + DZ[dir]!;
    const nc = c + DX[dir]!;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc]) {
      result.push({ r: nr, c: nc, dir });
    }
  }
  return result;
}

function findDeadEnds(grid: number[][], rows: number, cols: number): Array<{ row: number; col: number }> {
  const result: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Dead end = exactly 1 open passage
      const openCount = bitCount(grid[r][c]!);
      if (openCount === 1) {
        result.push({ row: r, col: c });
      }
    }
  }
  return result;
}

/** Get the wall direction that is still closed (for door placement) in a dead-end cell.
 *  A dead end has 3 closed walls. Pick one that faces inside the grid (not an edge). */
function getClosedWall(grid: number[][], r: number, c: number, rows: number, cols: number): number {
  const open = grid[r][c]!;
  // Prefer walls that don't face the edge of the maze
  for (const dir of [DIR.N, DIR.S, DIR.E, DIR.W]) {
    if (open & dir) continue; // this wall is open (passage)
    const nr = r + DZ[dir]!;
    const nc = c + DX[dir]!;
    // Must face inside grid
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
      return dir;
    }
  }
  // Fallback: any closed wall (edge wall)
  for (const dir of [DIR.N, DIR.S, DIR.E, DIR.W]) {
    if (!(open & dir)) return dir;
  }
  return DIR.N; // shouldn't reach here
}

function bitCount(n: number): number {
  let count = 0;
  let v = n;
  while (v) { count += v & 1; v >>= 1; }
  return count;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

/** Convert cell (row, col) to world position (center of cell) */
export function cellToWorld(row: number, col: number, mazeRows: number, mazeCols: number): { x: number; z: number } {
  const cs = CONFIG.maze.cellSize;
  const totalW = mazeCols * cs;
  const totalD = mazeRows * cs;
  return {
    x: -totalW / 2 + col * cs + cs / 2,
    z: -totalD / 2 + row * cs + cs / 2,
  };
}

/** Get door world position (on the wall of the cell) */
export function doorWorldPosition(door: DoorPlacement, mazeRows: number, mazeCols: number): { x: number; z: number } {
  const center = cellToWorld(door.cellRow, door.cellCol, mazeRows, mazeCols);
  const cs = CONFIG.maze.cellSize;
  const half = cs / 2;
  switch (door.wallDir) {
    case DIR.N: return { x: center.x, z: center.z - half };
    case DIR.S: return { x: center.x, z: center.z + half };
    case DIR.E: return { x: center.x + half, z: center.z };
    case DIR.W: return { x: center.x - half, z: center.z };
    default: return center;
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck`

Expected: `Maze.ts` passes. Existing errors in `Enemy.ts`/`Game.ts` from Task 1 config changes are expected.

- [ ] **Step 3: Commit**

```bash
git add src/Maze.ts
git commit -m "feat: add Maze.ts recursive backtracker maze generator"
```

---

## Task 3: Rewrite Level.ts to render mazes

**Files:**
- Rewrite: `src/Level.ts`

- [ ] **Step 1: Rewrite Level.ts to consume MazeData**

Replace the entire `src/Level.ts`:

```typescript
import * as THREE from 'three';
import { CONFIG } from './config';
import type { MazeData } from './Maze';
import { DIR, cellToWorld } from './Maze';

export interface AABB2D {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

/**
 * Level — builds Three.js geometry from MazeData grid.
 * Renders floor, ceiling, walls with black wireframe outlines.
 * Provides wall collision via AABB list.
 */
export class Level {
  readonly group = new THREE.Group();
  readonly walls: AABB2D[] = [];
  private playerSpawn = new THREE.Vector3(0, CONFIG.player.height, 0);

  constructor(scene: THREE.Scene, mazeData: MazeData) {
    this.buildFromMaze(mazeData);
    this.buildLights(mazeData);
    scene.add(this.group);
  }

  getPlayerSpawn(): THREE.Vector3 {
    return this.playerSpawn.clone();
  }

  private buildFromMaze(maze: MazeData): void {
    const cs = CONFIG.maze.cellSize;
    const wt = CONFIG.maze.wallThickness;
    const wh = CONFIG.world.wallHeight;
    const totalW = maze.cols * cs;
    const totalD = maze.rows * cs;
    const halfW = totalW / 2;
    const halfD = totalD / 2;

    // Floor
    const floorGeo = new THREE.PlaneGeometry(totalW + wt * 2, totalD + wt * 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.floor,
      roughness: 0.6,
      metalness: 0.0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Grid lines on floor
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const gridDiv = maze.cols;
    const cellW = totalW / gridDiv;
    for (let i = 0; i <= gridDiv; i++) {
      const z = -halfD + i * cellW;
      const line = new THREE.Mesh(new THREE.PlaneGeometry(totalW, 0.04), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.002, z);
      this.group.add(line);
    }
    for (let i = 0; i <= maze.cols; i++) {
      const x = -halfW + i * cellW;
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.04, totalD), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.002, 0);
      this.group.add(line);
    }

    // Ceiling
    const ceilGeo = new THREE.PlaneGeometry(totalW + wt * 2, totalD + wt * 2);
    const ceilMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.ceiling,
      roughness: 0.5,
      metalness: 0.0,
    });
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = wh;
    this.group.add(ceil);

    // Build walls from maze grid
    // For each cell, check each direction; if wall is NOT carved, add a wall segment
    for (let r = 0; r < maze.rows; r++) {
      for (let c = 0; c < maze.cols; c++) {
        const open = maze.grid[r]![c]!;
        const cx = -halfW + c * cs;
        const cz = -halfD + r * cs;

        // North wall (top of cell, z = cz)
        if (!(open & DIR.N)) {
          this.addWallBox(cx, 0, cz - wt / 2, cs, wh, wt);
        }
        // West wall (left of cell, x = cx)
        if (!(open & DIR.W)) {
          this.addWallBox(cx - wt / 2, 0, cz, wt, wh, cs);
        }
      }
    }

    // Eastern boundary (rightmost column, east walls)
    for (let r = 0; r < maze.rows; r++) {
      const cx = -halfW + maze.cols * cs;
      const cz = -halfD + r * cs;
      this.addWallBox(cx - wt / 2, 0, cz, wt, wh, cs);
    }

    // Southern boundary (bottom row, south walls)
    for (let c = 0; c < maze.cols; c++) {
      const cx = -halfW + c * cs;
      const cz = -halfD + maze.rows * cs;
      this.addWallBox(cx, 0, cz - wt / 2, cs, wh, wt);
    }

    // Player spawn: center of cell (0,0) — top-left of maze
    const spawn = cellToWorld(0, 0, maze.rows, maze.cols);
    this.playerSpawn.set(spawn.x, CONFIG.player.height, spawn.z);
  }

  private addWallBox(x: number, y: number, z: number, w: number, h: number, d: number): void {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.wall,
      roughness: 0.5,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + w / 2, y + h / 2, z + d / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    // Black wireframe outline
    const edges = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x222222 });
    const wireframe = new THREE.LineSegments(edges, edgeMat);
    wireframe.position.copy(mesh.position);
    this.group.add(wireframe);

    this.walls.push({
      minX: x, maxX: x + w,
      minZ: z, maxZ: z + d,
    });
  }

  private buildLights(maze: MazeData): void {
    const cs = CONFIG.maze.cellSize;
    const totalW = maze.cols * cs;
    const totalD = maze.rows * cs;

    // Ambient
    this.group.add(new THREE.AmbientLight(0xffffff, 2.0));

    // Hemisphere
    this.group.add(new THREE.HemisphereLight(0xffffff, 0xe0e0e0, 1.2));

    // Directional sun
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(totalW / 4, 25, totalD / 4);
    sun.castShadow = true;
    const halfExtent = Math.max(totalW, totalD) / 2;
    sun.shadow.camera.left = -halfExtent;
    sun.shadow.camera.right = halfExtent;
    sun.shadow.camera.top = halfExtent;
    sun.shadow.camera.bottom = -halfExtent;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 60;
    sun.shadow.mapSize.set(1024, 1024);
    this.group.add(sun);
    this.group.add(sun.target);

    // Point lights distributed through the maze
    const spacing = 3; // every 3 cells
    for (let r = 0; r < maze.rows; r += spacing) {
      for (let c = 0; c < maze.cols; c += spacing) {
        const pos = cellToWorld(r, c, maze.rows, maze.cols);
        const p = new THREE.PointLight(0xffffff, 2.0, cs * spacing * 1.5, 1.0);
        p.position.set(pos.x, CONFIG.world.wallHeight - 0.5, pos.z);
        this.group.add(p);
      }
    }
  }

  resolveCircleVsWalls(x: number, z: number, radius: number): { x: number; z: number } {
    let rx = x, rz = z;
    for (const w of this.walls) {
      const cx = Math.max(w.minX, Math.min(rx, w.maxX));
      const cz = Math.max(w.minZ, Math.min(rz, w.maxZ));
      const dx = rx - cx;
      const dz = rz - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius && distSq > 0) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        rx += (dx / dist) * push;
        rz += (dz / dist) * push;
      } else if (distSq === 0) {
        const edges = [
          { axis: 'x' as const, sign: -1, dist: rx - w.minX },
          { axis: 'x' as const, sign: 1, dist: w.maxX - rx },
          { axis: 'z' as const, sign: -1, dist: rz - w.minZ },
          { axis: 'z' as const, sign: 1, dist: w.maxZ - rz },
        ];
        edges.sort((a, b) => a.dist - b.dist);
        const e = edges[0]!;
        if (e.axis === 'x') rx += e.sign * (e.dist + radius);
        else rz += e.sign * (e.dist + radius);
      }
    }
    return { x: rx, z: rz };
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
```

- [ ] **Step 2: Verify typecheck (expect errors in Game.ts only)**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck`

Expected: `Level.ts` itself passes. `Game.ts` will fail because `new Level(scene)` now requires a `MazeData` argument. That is fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/Level.ts
git commit -m "feat: rewrite Level.ts to render mazes from MazeData grid"
```

---

## Task 4: Update Enemy.ts with three enemy types

**Files:**
- Modify: `src/Enemy.ts`

- [ ] **Step 1: Rewrite Enemy.ts with type-based construction**

Replace the entire `src/Enemy.ts`:

```typescript
import * as THREE from 'three';
import { CONFIG } from './config';
import type { Player } from './Player';
import type { Level } from './Level';

export type EnemyType = 'standard' | 'rusher' | 'tank';
export type EnemyState = 'idle' | 'chase' | 'attack' | 'dead';

/**
 * Enemy — type-based (standard/rusher/tank). White-scene art style with
 * black wireframe outlines. Each type has unique mesh size, color, stats,
 * and behavior.
 */
export class Enemy {
  readonly group = new THREE.Group();
  readonly hitbox: THREE.Mesh;
  readonly type: EnemyType;

  private body: THREE.Mesh;
  private eyes: THREE.Mesh;
  private eyeMat: THREE.MeshStandardMaterial;
  private bodyMat: THREE.MeshStandardMaterial;
  private eyes2: THREE.Mesh | null = null; // Tank has double eyes

  position = new THREE.Vector3();
  hp: number;
  alive = true;
  state: EnemyState = 'idle';
  private attackTimer = 0;
  private contactTimer = 0; // Rusher contact cooldown
  private deathTimer = 0;

  // Effective stats (after floor scaling)
  private readonly moveSpeed: number;
  private readonly engageDistance: number;
  private readonly stopDistance: number;
  private readonly attackCooldown: number;
  private readonly attackChance: number;
  private readonly attackDamage: number;
  private readonly contactDamage: number;
  private readonly contactCooldown: number;

  constructor(spawn: THREE.Vector3, scene: THREE.Scene, type: EnemyType, floor: number) {
    this.type = type;
    this.position.copy(spawn);
    this.position.y = 0;

    const hpScale = 1 + CONFIG.enemy.scaling.hpPerFloor * floor;
    const dmgScale = 1 + CONFIG.enemy.scaling.damagePerFloor * floor;

    const baseH = CONFIG.enemy.height;
    const baseR = CONFIG.enemy.radius;
    const outlineMat = new THREE.LineBasicMaterial({ color: 0x000000 });

    let bodyColor: number;
    let scale: number;
    let h: number;

    if (type === 'standard') {
      const cfg = CONFIG.enemy.types.standard;
      scale = cfg.scale;
      bodyColor = cfg.color;
      this.hp = Math.round(cfg.health * hpScale);
      this.moveSpeed = cfg.moveSpeed;
      this.engageDistance = cfg.engageDistance;
      this.stopDistance = cfg.stopDistance;
      this.attackCooldown = cfg.attackCooldown;
      this.attackChance = cfg.attackChance;
      this.attackDamage = Math.round(cfg.attackDamage * dmgScale);
      this.contactDamage = 0;
      this.contactCooldown = 0;
    } else if (type === 'rusher') {
      const cfg = CONFIG.enemy.types.rusher;
      scale = cfg.scale;
      bodyColor = cfg.color;
      this.hp = Math.round(cfg.health * hpScale);
      this.moveSpeed = cfg.moveSpeed;
      this.engageDistance = cfg.engageDistance;
      this.stopDistance = 0; // never stops
      this.attackCooldown = 0;
      this.attackChance = 0;
      this.attackDamage = 0;
      this.contactDamage = Math.round(cfg.contactDamage * dmgScale);
      this.contactCooldown = cfg.contactCooldown;
    } else {
      // tank
      const cfg = CONFIG.enemy.types.tank;
      scale = cfg.scale;
      bodyColor = cfg.color;
      this.hp = Math.round(cfg.health * hpScale);
      this.moveSpeed = cfg.moveSpeed;
      this.engageDistance = cfg.engageDistance;
      this.stopDistance = cfg.stopDistance;
      this.attackCooldown = cfg.attackCooldown;
      this.attackChance = cfg.attackChance;
      this.attackDamage = Math.round(cfg.attackDamage * dmgScale);
      this.contactDamage = 0;
      this.contactCooldown = 0;
    }

    h = baseH * scale;
    const r = baseR * scale;

    // Body
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.4,
      metalness: 0.0,
    });
    const bodyGeo = new THREE.BoxGeometry(r * 1.5, h, r * 1.5);
    this.body = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.body.position.y = h / 2;
    this.body.castShadow = true;
    this.group.add(this.body);

    // Wireframe
    const bodyWire = new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeo), outlineMat);
    bodyWire.position.copy(this.body.position);
    this.group.add(bodyWire);

    // Eyes
    this.eyeMat = new THREE.MeshStandardMaterial({
      color: 0x330000,
      emissive: 0xff2222,
      emissiveIntensity: 2.0,
    });
    const eyeGeo = new THREE.BoxGeometry(r * 1.2, 0.08, 0.05);
    this.eyes = new THREE.Mesh(eyeGeo, this.eyeMat);
    this.eyes.position.y = h - 0.3 * scale;
    this.eyes.position.z = r * 0.75;
    this.group.add(this.eyes);

    // Tank gets double eye strip
    if (type === 'tank') {
      this.eyes2 = new THREE.Mesh(eyeGeo.clone(), this.eyeMat);
      this.eyes2.position.y = h - 0.5 * scale;
      this.eyes2.position.z = r * 0.75;
      this.group.add(this.eyes2);
    }

    // Hitbox
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(r * 1.8, h * 1.05, r * 1.8),
      hitMat,
    );
    this.hitbox.position.y = h / 2;
    this.group.add(this.hitbox);

    this.group.position.copy(this.position);
    scene.add(this.group);
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;

    this.bodyMat.color.setHex(0xaaaaaa);
    setTimeout(() => {
      if (this.alive) this.bodyMat.color.setHex(
        this.type === 'standard' ? CONFIG.enemy.types.standard.color :
        this.type === 'rusher' ? CONFIG.enemy.types.rusher.color :
        CONFIG.enemy.types.tank.color,
      );
    }, 80);

    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  private die(): void {
    this.alive = false;
    this.state = 'dead';
    this.deathTimer = 1.5;
    this.bodyMat.color.setHex(CONFIG.colors.enemyDead);
    this.eyeMat.emissiveIntensity = 0;
  }

  /**
   * Returns { shot, contactHit }
   * - shot: true if ranged attack hit this frame (standard/tank)
   * - contactHit: true if rusher made contact damage this frame
   */
  update(dt: number, player: Player, level: Level): { shot: boolean; contactHit: boolean } {
    if (!this.alive) {
      if (this.deathTimer > 0) {
        this.deathTimer -= dt;
        const t = 1 - this.deathTimer / 1.5;
        this.group.rotation.x = Math.min(Math.PI / 2, t * Math.PI / 2 * 1.5);
        this.group.position.y = Math.max(-0.5, -t * 0.5);
      }
      return { shot: false, contactHit: false };
    }

    const toPlayer = new THREE.Vector3(
      player.position.x - this.position.x,
      0,
      player.position.z - this.position.z,
    );
    const dist = toPlayer.length();

    // FSM transitions
    if (this.state === 'idle' && dist < this.engageDistance) {
      this.state = 'chase';
    }
    if (this.type !== 'rusher') {
      if (this.state === 'chase' && dist < this.stopDistance) {
        this.state = 'attack';
      }
      if (this.state === 'attack' && dist > this.stopDistance * 1.3) {
        this.state = 'chase';
      }
    }

    // Face player
    const yaw = Math.atan2(toPlayer.x, toPlayer.z);
    this.group.rotation.y = yaw;

    let shot = false;
    let contactHit = false;

    if (this.state === 'chase') {
      if (dist > 0.01) {
        toPlayer.normalize();
        const nx = this.position.x + toPlayer.x * this.moveSpeed * dt;
        const nz = this.position.z + toPlayer.z * this.moveSpeed * dt;
        const resolved = level.resolveCircleVsWalls(nx, nz, CONFIG.enemy.radius * (this.type === 'rusher' ? CONFIG.enemy.types.rusher.scale : this.type === 'tank' ? CONFIG.enemy.types.tank.scale : 1));
        this.position.x = resolved.x;
        this.position.z = resolved.z;
      }

      // Rusher: contact damage when close
      if (this.type === 'rusher') {
        this.contactTimer = Math.max(0, this.contactTimer - dt);
        const contactRange = CONFIG.enemy.radius * CONFIG.enemy.types.rusher.scale + CONFIG.player.radius + 0.2;
        if (dist < contactRange && this.contactTimer <= 0) {
          contactHit = true;
          this.contactTimer = this.contactCooldown;
        }
      }
    } else if (this.state === 'attack') {
      // Standard / Tank ranged attack
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackTimer = this.attackCooldown;
        if (Math.random() < this.attackChance) {
          shot = true;
        }
        this.eyeMat.emissiveIntensity = 4.5;
        setTimeout(() => {
          if (this.alive) this.eyeMat.emissiveIntensity = 2.0;
        }, 120);
      }
    }

    // Bob
    const bob = Math.sin(performance.now() * 0.004 + this.position.x) * 0.02;
    this.group.position.set(this.position.x, bob, this.position.z);

    return { shot, contactHit };
  }

  /** Get damage amount for ranged shot or contact */
  getDamage(): number {
    if (this.type === 'rusher') return this.contactDamage;
    return this.attackDamage;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.body.geometry.dispose();
    this.bodyMat.dispose();
    this.eyes.geometry.dispose();
    this.eyeMat.dispose();
  }
}
```

- [ ] **Step 2: Verify typecheck on Enemy.ts**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck 2>&1 | grep -c "Enemy.ts"`

Expected: 0 errors in Enemy.ts. Game.ts still has errors (fixed in Task 6).

- [ ] **Step 3: Commit**

```bash
git add src/Enemy.ts
git commit -m "feat: add standard/rusher/tank enemy types with floor scaling"
```

---

## Task 5: Create Door.ts, Chest.ts, Room.ts

**Files:**
- Create: `src/Door.ts`
- Create: `src/Chest.ts`
- Create: `src/Room.ts`

- [ ] **Step 1: Create Door.ts**

Create `src/Door.ts`:

```typescript
import * as THREE from 'three';
import { CONFIG } from './config';
import { DIR, doorWorldPosition, type DoorPlacement, type RoomType } from './Maze';

export type DoorState = 'closed' | 'open' | 'used';

/**
 * Door — dark rectangular frame embedded in a maze wall.
 * Glows when player is within interact distance.
 * Tracks open/used state.
 */
export class Door {
  readonly group = new THREE.Group();
  readonly roomType: RoomType;
  readonly placement: DoorPlacement;
  readonly worldX: number;
  readonly worldZ: number;

  private state: DoorState = 'closed';
  private frameMat: THREE.MeshStandardMaterial;
  private glowMat: THREE.MeshStandardMaterial;
  private glowMesh: THREE.Mesh;

  constructor(placement: DoorPlacement, mazeRows: number, mazeCols: number, scene: THREE.Scene) {
    this.placement = placement;
    this.roomType = placement.roomType;

    const pos = doorWorldPosition(placement, mazeRows, mazeCols);
    this.worldX = pos.x;
    this.worldZ = pos.z;

    const w = CONFIG.door.width;
    const h = CONFIG.door.height;
    const d = 0.15;

    // Determine rotation based on wall direction
    const isNS = placement.wallDir === DIR.N || placement.wallDir === DIR.S;

    // Frame (dark rectangle)
    this.frameMat = new THREE.MeshStandardMaterial({
      color: CONFIG.door.frameColor,
      roughness: 0.3,
      metalness: 0.1,
    });
    const frameGeo = new THREE.BoxGeometry(
      isNS ? w : d,
      h,
      isNS ? d : w,
    );
    const frame = new THREE.Mesh(frameGeo, this.frameMat);
    frame.position.y = h / 2;
    frame.castShadow = true;
    this.group.add(frame);

    // Wireframe
    const edges = new THREE.EdgesGeometry(frameGeo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000 });
    const wireframe = new THREE.LineSegments(edges, edgeMat);
    wireframe.position.copy(frame.position);
    this.group.add(wireframe);

    // Glow indicator (slightly larger, emissive, initially hidden)
    const glowColor = placement.roomType === 'exit' ? CONFIG.door.exitGlowColor : CONFIG.door.glowColor;
    this.glowMat = new THREE.MeshStandardMaterial({
      color: glowColor,
      emissive: glowColor,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0,
    });
    const glowGeo = new THREE.BoxGeometry(
      isNS ? w + 0.1 : d + 0.1,
      h + 0.1,
      isNS ? d + 0.1 : w + 0.1,
    );
    this.glowMesh = new THREE.Mesh(glowGeo, this.glowMat);
    this.glowMesh.position.y = h / 2;
    this.group.add(this.glowMesh);

    this.group.position.set(this.worldX, 0, this.worldZ);
    scene.add(this.group);
  }

  getState(): DoorState {
    return this.state;
  }

  /** Check if player is within interact distance */
  isPlayerNear(px: number, pz: number): boolean {
    if (this.state === 'used') return false;
    const dx = px - this.worldX;
    const dz = pz - this.worldZ;
    return Math.sqrt(dx * dx + dz * dz) < CONFIG.door.interactDistance;
  }

  /** Update glow based on player proximity */
  setHighlight(near: boolean): void {
    if (this.state === 'used') return;
    this.glowMat.emissiveIntensity = near ? 1.5 : 0;
    this.glowMat.opacity = near ? 0.4 : 0;
  }

  /** Mark as opened (player entered) */
  markUsed(): void {
    this.state = 'used';
    this.frameMat.color.setHex(CONFIG.door.usedColor);
    this.glowMat.emissiveIntensity = 0;
    this.glowMat.opacity = 0;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
```

- [ ] **Step 2: Create Chest.ts**

Create `src/Chest.ts`:

```typescript
import * as THREE from 'three';
import { CONFIG } from './config';

export interface LootResult {
  ammo: number;
  health: number;
}

/**
 * Chest — gold emissive box with lid. Opens on interact, rolls loot.
 */
export class Chest {
  readonly group = new THREE.Group();
  private opened = false;
  private lid: THREE.Mesh;
  private openTimer = 0;

  constructor(x: number, z: number, scene: THREE.Scene) {
    const outlineMat = new THREE.LineBasicMaterial({ color: 0x000000 });

    // Base box
    const baseMat = new THREE.MeshStandardMaterial({
      color: CONFIG.chest.color,
      emissive: CONFIG.chest.emissiveColor,
      emissiveIntensity: CONFIG.chest.emissiveIntensity,
      roughness: 0.3,
      metalness: 0.2,
    });
    const baseGeo = new THREE.BoxGeometry(0.8, 0.5, 0.6);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.25;
    base.castShadow = true;
    this.group.add(base);

    // Outline
    const baseWire = new THREE.LineSegments(new THREE.EdgesGeometry(baseGeo), outlineMat);
    baseWire.position.copy(base.position);
    this.group.add(baseWire);

    // Lid
    const lidGeo = new THREE.BoxGeometry(0.8, 0.12, 0.6);
    this.lid = new THREE.Mesh(lidGeo, baseMat.clone());
    this.lid.position.set(0, 0.56, 0);
    this.lid.castShadow = true;
    this.group.add(this.lid);

    const lidWire = new THREE.LineSegments(new THREE.EdgesGeometry(lidGeo), outlineMat);
    lidWire.position.copy(this.lid.position);
    this.group.add(lidWire);

    this.group.position.set(x, 0, z);
    scene.add(this.group);
  }

  isOpened(): boolean {
    return this.opened;
  }

  isPlayerNear(px: number, pz: number): boolean {
    if (this.opened) return false;
    const dx = px - this.group.position.x;
    const dz = pz - this.group.position.z;
    return Math.sqrt(dx * dx + dz * dz) < 2.0;
  }

  /** Open the chest and return loot */
  open(): LootResult {
    this.opened = true;
    this.openTimer = 0.4;

    let ammo = 0;
    let health = 0;

    if (Math.random() < CONFIG.chest.ammoChance) {
      ammo = CONFIG.chest.ammoMin + Math.floor(Math.random() * (CONFIG.chest.ammoMax - CONFIG.chest.ammoMin + 1));
    }
    if (Math.random() < CONFIG.chest.healthChance) {
      health = CONFIG.chest.healthMin + Math.floor(Math.random() * (CONFIG.chest.healthMax - CONFIG.chest.healthMin + 1));
    }

    // If both missed, guarantee at least some ammo
    if (ammo === 0 && health === 0) {
      ammo = CONFIG.chest.ammoMin;
    }

    return { ammo, health };
  }

  update(dt: number): void {
    if (this.openTimer > 0) {
      this.openTimer -= dt;
      // Animate lid opening (rotate backward on pivot)
      const t = Math.min(1, 1 - this.openTimer / 0.4);
      this.lid.rotation.x = -t * Math.PI / 3;
      this.lid.position.y = 0.56 + t * 0.15;
      this.lid.position.z = -t * 0.1;
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
```

- [ ] **Step 3: Create Room.ts**

Create `src/Room.ts`:

```typescript
import * as THREE from 'three';
import { CONFIG } from './config';
import { Enemy, type EnemyType } from './Enemy';
import { Chest } from './Chest';
import type { Player } from './Player';
import type { RoomType } from './Maze';

export interface RoomUpdateResult {
  /** A ranged enemy shot the player this frame */
  shot: boolean;
  /** Damage amount from ranged shot */
  shotDamage: number;
  /** A rusher contacted the player this frame */
  contactHit: boolean;
  /** Damage amount from contact */
  contactDamage: number;
  /** All enemies cleared */
  cleared: boolean;
}

/**
 * Room — a sealed 12×12m room the player is teleported into.
 * Three variants: combat (enemies + cover), treasure (chest), exit (green portal).
 */
export class Room {
  readonly group = new THREE.Group();
  readonly type: RoomType;
  readonly walls: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];

  enemies: Enemy[] = [];
  chest: Chest | null = null;
  private exitPortal: THREE.Mesh | null = null;
  private exitGlowMat: THREE.MeshStandardMaterial | null = null;
  private cleared = false;

  // Return door
  private returnDoorMesh: THREE.Mesh;
  private returnDoorMat: THREE.MeshStandardMaterial;
  private returnDoorUnlocked = false;
  readonly returnDoorX = 0;
  readonly returnDoorZ: number;

  constructor(type: RoomType, scene: THREE.Scene, floor: number) {
    this.type = type;
    const s = CONFIG.room.size;
    const half = s / 2;
    const wh = CONFIG.room.wallHeight;
    const wt = 0.5;

    // Floor
    const floorGeo = new THREE.PlaneGeometry(s, s);
    const floorMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.floor,
      roughness: 0.6,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    this.group.add(floorMesh);

    // Ceiling
    const ceilMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(s, s),
      new THREE.MeshStandardMaterial({ color: CONFIG.colors.ceiling, roughness: 0.5 }),
    );
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.y = wh;
    this.group.add(ceilMesh);

    // Four walls
    this.addRoomWall(-half, 0, -half - wt / 2, s, wh, wt);  // North
    this.addRoomWall(-half, 0, half - wt / 2, s, wh, wt);    // South
    this.addRoomWall(-half - wt / 2, 0, -half, wt, wh, s);   // West
    this.addRoomWall(half - wt / 2, 0, -half, wt, wh, s);    // East

    // Lighting
    this.group.add(new THREE.AmbientLight(0xffffff, 2.0));
    const pointLight = new THREE.PointLight(0xffffff, 3.0, s * 2, 1.0);
    pointLight.position.set(0, wh - 0.5, 0);
    this.group.add(pointLight);

    // Return door (south wall center)
    this.returnDoorZ = half - wt / 2;
    this.returnDoorMat = new THREE.MeshStandardMaterial({
      color: CONFIG.door.frameColor,
      emissive: 0x000000,
      roughness: 0.3,
      metalness: 0.1,
    });
    const doorGeo = new THREE.BoxGeometry(CONFIG.door.width, CONFIG.door.height, 0.15);
    this.returnDoorMesh = new THREE.Mesh(doorGeo, this.returnDoorMat);
    this.returnDoorMesh.position.set(0, CONFIG.door.height / 2, this.returnDoorZ);
    this.group.add(this.returnDoorMesh);
    const doorWire = new THREE.LineSegments(
      new THREE.EdgesGeometry(doorGeo),
      new THREE.LineBasicMaterial({ color: 0x000000 }),
    );
    doorWire.position.copy(this.returnDoorMesh.position);
    this.group.add(doorWire);

    // Type-specific content
    if (type === 'combat') {
      this.setupCombat(scene, floor);
      // Door locked until cleared
      this.returnDoorUnlocked = false;
    } else if (type === 'treasure') {
      this.setupTreasure(scene);
      this.returnDoorUnlocked = true;
      this.cleared = true;
    } else {
      // exit
      this.setupExit();
      this.returnDoorUnlocked = false; // no return from exit
      this.cleared = true;
    }

    // Offset room far away from maze (y=0, but x/z at 500 to avoid overlap)
    this.group.position.set(500, 0, 500);
    scene.add(this.group);
  }

  private addRoomWall(x: number, y: number, z: number, w: number, h: number, d: number): void {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.wall,
      roughness: 0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + w / 2, y + h / 2, z + d / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    const edges = new THREE.EdgesGeometry(geo);
    const wire = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x222222 }));
    wire.position.copy(mesh.position);
    this.group.add(wire);

    // Store AABB in room-local coords (room group is at 500,0,500)
    this.walls.push({
      minX: x + 500,
      maxX: x + w + 500,
      minZ: z + 500,
      maxZ: z + d + 500,
    });
  }

  private setupCombat(scene: THREE.Scene, floor: number): void {
    const half = CONFIG.room.size / 2;

    // Cover walls
    const coverCount = CONFIG.room.coverCount.min +
      Math.floor(Math.random() * (CONFIG.room.coverCount.max - CONFIG.room.coverCount.min + 1));
    const coverPositions = [
      { x: -half / 2, z: 0 },
      { x: half / 2, z: 0 },
    ];
    for (let i = 0; i < coverCount; i++) {
      const cp = coverPositions[i]!;
      this.addRoomWall(
        cp.x - 0.3 + 500, 0, cp.z - 1.5 + 500,
        0.6, CONFIG.room.coverHeight, 3,
      );
    }

    // Spawn enemies
    const tier = floor <= 2 ? 'tier1' : floor <= 4 ? 'tier2' : 'tier3';
    const countCfg = CONFIG.room.enemyCount[tier];
    const enemyCount = countCfg.min + Math.floor(Math.random() * (countCfg.max - countCfg.min + 1));

    const maxTanks = floor < CONFIG.room.tankUnlockFloor ? 0 :
      tier === 'tier2' ? CONFIG.room.maxTanksTier2 : CONFIG.room.maxTanksTier3;

    let tankCount = 0;
    const spawnPositions = [
      new THREE.Vector3(500 - 3, 0, 500 - 3),
      new THREE.Vector3(500 + 3, 0, 500 - 3),
      new THREE.Vector3(500 - 3, 0, 500 + 2),
      new THREE.Vector3(500 + 3, 0, 500 + 2),
      new THREE.Vector3(500, 0, 500 - 4),
    ];

    for (let i = 0; i < enemyCount; i++) {
      let type: EnemyType;
      if (maxTanks > 0 && tankCount < maxTanks && Math.random() < 0.3) {
        type = 'tank';
        tankCount++;
      } else if (Math.random() < 0.4) {
        type = 'rusher';
      } else {
        type = 'standard';
      }
      const sp = spawnPositions[i % spawnPositions.length]!;
      const jitter = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        0,
        (Math.random() - 0.5) * 2,
      );
      this.enemies.push(new Enemy(sp.clone().add(jitter), scene, type, floor));
    }
  }

  private setupTreasure(scene: THREE.Scene): void {
    this.chest = new Chest(500, 500, scene);
  }

  private setupExit(): void {
    // Green glowing portal
    this.exitGlowMat = new THREE.MeshStandardMaterial({
      color: CONFIG.door.exitGlowColor,
      emissive: CONFIG.door.exitGlowColor,
      emissiveIntensity: 2.0,
      transparent: true,
      opacity: 0.8,
    });
    const portalGeo = new THREE.BoxGeometry(1.4, 3.0, 0.15);
    this.exitPortal = new THREE.Mesh(portalGeo, this.exitGlowMat);
    this.exitPortal.position.set(0, 1.5, -CONFIG.room.size / 2 + 0.5);
    this.group.add(this.exitPortal);

    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(portalGeo),
      new THREE.LineBasicMaterial({ color: 0x000000 }),
    );
    wire.position.copy(this.exitPortal.position);
    this.group.add(wire);
  }

  /** Check if player is near the return door */
  isNearReturnDoor(px: number, pz: number): boolean {
    if (!this.returnDoorUnlocked) return false;
    const dx = px - 500; // return door is at room center x = 500
    const dz = pz - (500 + this.returnDoorZ);
    return Math.sqrt(dx * dx + dz * dz) < CONFIG.door.interactDistance;
  }

  /** Check if player is near exit portal (exit room only) */
  isNearExitPortal(px: number, pz: number): boolean {
    if (this.type !== 'exit' || !this.exitPortal) return false;
    const dx = px - (500 + this.exitPortal.position.x);
    const dz = pz - (500 + this.exitPortal.position.z);
    return Math.sqrt(dx * dx + dz * dz) < CONFIG.door.interactDistance;
  }

  /** Update room state, returns combat results */
  update(dt: number, player: Player): RoomUpdateResult {
    let shot = false;
    let shotDamage = 0;
    let contactHit = false;
    let contactDamage = 0;

    // Update enemies in combat rooms
    let aliveCount = 0;
    for (const e of this.enemies) {
      const result = e.update(dt, player, this as unknown as import('./Level').Level);
      if (e.alive) aliveCount++;
      if (result.shot) {
        shot = true;
        shotDamage = e.getDamage();
      }
      if (result.contactHit) {
        contactHit = true;
        contactDamage = e.getDamage();
      }
    }

    // Check if combat cleared
    if (this.type === 'combat' && !this.cleared && aliveCount === 0) {
      this.cleared = true;
      this.returnDoorUnlocked = true;
      // Visual: return door turns green
      this.returnDoorMat.emissive.setHex(0x44ff88);
      this.returnDoorMat.emissiveIntensity = 1.0;
    }

    // Update chest
    if (this.chest) {
      this.chest.update(dt);
    }

    // Pulse exit portal
    if (this.exitGlowMat) {
      this.exitGlowMat.emissiveIntensity = 1.5 + Math.sin(performance.now() * 0.003) * 0.5;
    }

    return { shot, shotDamage, contactHit, contactDamage, cleared: this.cleared };
  }

  getAliveEnemyCount(): number {
    return this.enemies.filter((e) => e.alive).length;
  }

  getTotalEnemyCount(): number {
    return this.enemies.length;
  }

  isCleared(): boolean {
    return this.cleared;
  }

  /** Room needs its own collision resolution for enemies */
  resolveCircleVsWalls(x: number, z: number, radius: number): { x: number; z: number } {
    let rx = x, rz = z;
    for (const w of this.walls) {
      const cx = Math.max(w.minX, Math.min(rx, w.maxX));
      const cz = Math.max(w.minZ, Math.min(rz, w.maxZ));
      const dx = rx - cx;
      const dz = rz - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius && distSq > 0) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        rx += (dx / dist) * push;
        rz += (dz / dist) * push;
      } else if (distSq === 0) {
        const edges = [
          { axis: 'x' as const, sign: -1, dist: rx - w.minX },
          { axis: 'x' as const, sign: 1, dist: w.maxX - rx },
          { axis: 'z' as const, sign: -1, dist: rz - w.minZ },
          { axis: 'z' as const, sign: 1, dist: w.maxZ - rz },
        ];
        edges.sort((a, b) => a.dist - b.dist);
        const e = edges[0]!;
        if (e.axis === 'x') rx += e.sign * (e.dist + radius);
        else rz += e.sign * (e.dist + radius);
      }
    }
    return { x: rx, z: rz };
  }

  dispose(scene: THREE.Scene): void {
    for (const e of this.enemies) e.dispose(scene);
    this.enemies = [];
    if (this.chest) this.chest.dispose(scene);
    scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
```

- [ ] **Step 4: Verify typecheck on new files**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck 2>&1 | grep -E "(Door|Chest|Room)\.ts"`

Expected: Likely a type issue in `Room.ts` where it passes `this` as `Level` to `Enemy.update()`. This will need a shared interface — we'll fix this with a quick workaround. The `as unknown as Level` cast handles it.

- [ ] **Step 5: Commit**

```bash
git add src/Door.ts src/Chest.ts src/Room.ts
git commit -m "feat: add Door, Chest, Room systems for maze room teleportation"
```

---

## Task 6: Add sounds to Sfx.ts and E key to Input.ts

**Files:**
- Modify: `src/Sfx.ts`
- Modify: `src/Input.ts`

- [ ] **Step 1: Add new sound methods to Sfx.ts**

Add after the `enemyDie()` method in `src/Sfx.ts` (before the `// --- primitives` line):

```typescript
  doorOpen(): void {
    if (!this.ready()) return;
    this.sweep(400, 200, 0.2, 'triangle', 0.4);
    this.beep(600, 0.08, 'sine', 0.3);
  }

  chestOpen(): void {
    if (!this.ready()) return;
    this.beep(440, 0.1, 'sine', 0.5);
    this.beep(660, 0.1, 'sine', 0.4);
    this.beep(880, 0.15, 'sine', 0.3);
  }

  floorTransition(): void {
    if (!this.ready()) return;
    this.sweep(200, 800, 0.5, 'sine', 0.5);
    this.beep(440, 0.3, 'triangle', 0.3);
  }
```

- [ ] **Step 2: Add E key interact to Input.ts**

Add an `onInteract` callback array to `Input.ts`. After the `onMouseDown` declaration (line 10), add:

```typescript
  readonly onInteract: Array<() => void> = [];
```

Then in the constructor, after the existing event listeners, register the E key:

Add after line 24 (the pointerlockerror listener):

```typescript
    this.registerKey('e', () => {
      for (const cb of this.onInteract) cb();
    });
```

- [ ] **Step 3: Verify typecheck**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck 2>&1 | grep -E "(Sfx|Input)\.ts"`

Expected: 0 errors in these files.

- [ ] **Step 4: Commit**

```bash
git add src/Sfx.ts src/Input.ts
git commit -m "feat: add door/chest/floor sounds and E key interact binding"
```

---

## Task 7: Add position save/restore to Player.ts

**Files:**
- Modify: `src/Player.ts`

- [ ] **Step 1: Add teleport methods to Player.ts**

Add these methods to the `Player` class, after the `respawn()` method:

```typescript
  private savedPosition = new THREE.Vector3();
  private savedYaw = 0;
  private savedPitch = 0;

  /** Save current position for returning from a room */
  savePosition(): void {
    this.savedPosition.copy(this.position);
    this.savedYaw = this.yaw;
    this.savedPitch = this.pitch;
  }

  /** Restore saved position (returning from a room) */
  restorePosition(): void {
    this.position.copy(this.savedPosition);
    this.yaw = this.savedYaw;
    this.pitch = this.savedPitch;
    this.velocityY.v = 0;
    this.syncCamera();
  }

  /** Teleport to a specific position */
  teleportTo(x: number, z: number): void {
    this.position.set(x, CONFIG.player.height, z);
    this.velocityY.v = 0;
    this.syncCamera();
  }
```

Also need to make the `level` property mutable so Game can swap it when entering rooms. Change the constructor parameter from:

```typescript
    private readonly level: Level,
```

to:

```typescript
    private level: Level,
```

And add a setter:

```typescript
  setLevel(level: Level): void {
    this.level = level;
  }
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck 2>&1 | grep "Player.ts"`

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/Player.ts
git commit -m "feat: add position save/restore and teleport to Player"
```

---

## Task 8: Update index.html and style.css for new HUD

**Files:**
- Modify: `index.html`
- Modify: `src/style.css`

- [ ] **Step 1: Update index.html HUD and overlays**

Replace the entire `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DOOM · MAZE · Three.js</title>
  </head>
  <body>
    <div id="game"></div>

    <!-- Crosshair -->
    <div id="crosshair"></div>

    <!-- HUD -->
    <div id="hud">
      <div class="hud-item hud-left">
        <div class="label">HEALTH</div>
        <div class="value" id="hp">100</div>
      </div>
      <div class="hud-item hud-right">
        <div class="label">AMMO</div>
        <div class="value" id="ammo">30</div>
      </div>
      <div class="hud-item hud-top-left">
        <div class="label">FLOOR</div>
        <div class="value" id="floor">1</div>
      </div>
      <div class="hud-item hud-top-right">
        <div class="label">DOORS</div>
        <div class="value" id="doors">0 / 0</div>
      </div>
      <div class="hud-item hud-center-top" id="room-status" style="display:none;">
        <div class="label">ENEMIES</div>
        <div class="value" id="room-enemies">0</div>
      </div>
    </div>

    <!-- Interact prompt -->
    <div id="interact-prompt" style="display:none;"></div>

    <!-- Floor transition overlay -->
    <div id="floor-transition" style="display:none;">
      <div class="floor-text" id="floor-text">FLOOR 1</div>
    </div>

    <!-- Fade overlay for room transitions -->
    <div id="fade-overlay"></div>

    <!-- Damage flash -->
    <div id="damage"></div>

    <!-- Hit marker -->
    <div id="hitmarker"></div>

    <!-- Start overlay -->
    <div id="overlay">
      <div class="panel">
        <h1>DOOM <span class="sub">· MAZE</span></h1>
        <p class="tag">Three.js · TypeScript · Vite</p>
        <div class="controls">
          <div><kbd>WASD</kbd> move</div>
          <div><kbd>MOUSE</kbd> look</div>
          <div><kbd>LMB</kbd> shoot</div>
          <div><kbd>SPACE</kbd> jump</div>
          <div><kbd>SHIFT</kbd> sprint</div>
          <div><kbd>E</kbd> interact</div>
          <div><kbd>R</kbd> reload</div>
          <div><kbd>ESC</kbd> pause</div>
        </div>
        <button id="start">CLICK TO PLAY</button>
        <p class="hint">Pointer will be locked. Press ESC to release.</p>
      </div>
    </div>

    <!-- GameOver overlay -->
    <div id="gameover" class="end-overlay">
      <div class="panel">
        <h1 class="lose">YOU DIED</h1>
        <p class="sub" id="gameover-sub"></p>
        <div class="stats" id="gameover-stats"></div>
        <button id="gameover-restart">RESTART</button>
      </div>
    </div>

    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Update style.css with new HUD styles**

Replace the entire `src/style.css`:

```css
:root {
  --hp-color: #222222;
  --ammo-color: #222222;
  --accent: #222222;
  --panel-bg: rgba(255, 255, 255, 0.95);
  --border: #222222;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  width: 100%;
  height: 100%;
  background: #f0f0f0;
  color: #222222;
  font-family: 'Courier New', ui-monospace, monospace;
  overflow: hidden;
  user-select: none;
  cursor: default;
}

#game {
  position: fixed;
  inset: 0;
  z-index: 0;
}
#game canvas { display: block; }

/* ============ HUD ============ */

#crosshair {
  position: fixed;
  top: 50%;
  left: 50%;
  width: 22px;
  height: 22px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 10;
  opacity: 0.9;
}
#crosshair::before, #crosshair::after {
  content: '';
  position: absolute;
  background: #222222;
}
#crosshair::before {
  left: 50%; top: 0; width: 2px; height: 100%;
  transform: translateX(-50%);
}
#crosshair::after {
  top: 50%; left: 0; height: 2px; width: 100%;
  transform: translateY(-50%);
}

#hud {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9;
}
.hud-item {
  position: absolute;
  background: rgba(255, 255, 255, 0.8);
  border: 2px solid var(--border);
  padding: 10px 18px;
  backdrop-filter: blur(3px);
  font-weight: bold;
}
.hud-item .label {
  font-size: 11px;
  letter-spacing: 2px;
  opacity: 0.5;
  margin-bottom: 3px;
}
.hud-item .value {
  font-size: 32px;
  line-height: 1;
  letter-spacing: 2px;
}
.hud-left { bottom: 24px; left: 24px; }
.hud-left .value { color: var(--hp-color); }
.hud-right { bottom: 24px; right: 24px; text-align: right; }
.hud-right .value { color: var(--ammo-color); }
.hud-top-left {
  top: 20px; left: 24px;
  padding: 6px 16px;
}
.hud-top-left .value { font-size: 22px; }
.hud-top-right {
  top: 20px; right: 24px;
  padding: 6px 16px;
  text-align: right;
}
.hud-top-right .value { font-size: 18px; }
.hud-center-top {
  top: 20px; left: 50%;
  transform: translateX(-50%);
  text-align: center;
  padding: 6px 16px;
}
.hud-center-top .value { font-size: 18px; }

/* ============ Interact Prompt ============ */

#interact-prompt {
  position: fixed;
  bottom: 30%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 12;
  pointer-events: none;
  font-size: 16px;
  font-weight: bold;
  letter-spacing: 3px;
  padding: 10px 24px;
  background: rgba(255, 255, 255, 0.85);
  border: 2px solid var(--border);
  backdrop-filter: blur(3px);
}

/* ============ Floor Transition ============ */

#floor-transition {
  position: fixed;
  inset: 0;
  z-index: 120;
  background: rgba(240, 240, 240, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.floor-text {
  font-size: 72px;
  font-weight: bold;
  letter-spacing: 12px;
  color: #222222;
  animation: floorFadeIn 1.5s ease-out forwards;
}
@keyframes floorFadeIn {
  0% { opacity: 0; transform: scale(0.8); }
  30% { opacity: 1; transform: scale(1); }
  70% { opacity: 1; }
  100% { opacity: 0; }
}

/* ============ Fade overlay ============ */

#fade-overlay {
  position: fixed;
  inset: 0;
  z-index: 110;
  background: #000000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}
#fade-overlay.active { opacity: 1; }

/* ============ Damage flash ============ */

#damage {
  position: fixed;
  inset: 0;
  z-index: 8;
  pointer-events: none;
  background: radial-gradient(circle, transparent 30%, rgba(34, 34, 34, 0.35) 100%);
  opacity: 0;
  transition: opacity 0.15s ease-out;
}
#damage.flash { opacity: 1; transition: opacity 0.02s; }

/* ============ Hit marker ============ */

#hitmarker {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 11;
  opacity: 0;
  pointer-events: none;
}
#hitmarker::before, #hitmarker::after {
  content: '';
  position: absolute;
  background: #222222;
}
#hitmarker::before {
  top: -14px; left: -1px; width: 3px; height: 28px;
  transform: rotate(45deg);
}
#hitmarker::after {
  top: -14px; left: -1px; width: 3px; height: 28px;
  transform: rotate(-45deg);
}
#hitmarker.hit {
  opacity: 1;
  animation: hitpulse 0.15s ease-out forwards;
}
@keyframes hitpulse {
  from { transform: translate(-50%, -50%) scale(0.6); opacity: 1; }
  to { transform: translate(-50%, -50%) scale(1.3); opacity: 0; }
}

/* ============ Overlays ============ */

#overlay, .end-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(240, 240, 240, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
}
.end-overlay { display: none; }

.panel {
  background: var(--panel-bg);
  border: 3px solid var(--border);
  padding: 48px 64px;
  text-align: center;
  max-width: 560px;
}

h1 {
  font-size: 64px;
  letter-spacing: 8px;
  color: var(--accent);
  margin-bottom: 6px;
}
h1 .sub { font-size: 22px; letter-spacing: 4px; opacity: 0.5; }
h1.lose { color: #222222; }

.tag {
  font-size: 12px;
  opacity: 0.5;
  letter-spacing: 3px;
  margin-bottom: 28px;
}

.controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 24px;
  margin-bottom: 28px;
  font-size: 13px;
  text-align: left;
}
.controls > div {
  padding: 4px 8px;
  border-left: 2px solid var(--border);
  opacity: 0.8;
}
kbd {
  display: inline-block;
  background: #ffffff;
  border: 2px solid var(--border);
  padding: 1px 7px;
  border-radius: 3px;
  margin-right: 8px;
  font-size: 12px;
  min-width: 40px;
  text-align: center;
  color: #222222;
}

button {
  background: #ffffff;
  color: #222222;
  border: 3px solid var(--border);
  padding: 14px 40px;
  font-family: inherit;
  font-size: 16px;
  font-weight: bold;
  letter-spacing: 3px;
  cursor: pointer;
  transition: all 0.15s;
}
button:hover {
  background: #222222;
  color: #ffffff;
  transform: translateY(-1px);
}

.hint {
  margin-top: 16px;
  font-size: 11px;
  opacity: 0.4;
  letter-spacing: 1px;
}

.end-overlay .sub {
  font-size: 14px;
  opacity: 0.6;
  margin: 8px 0 16px;
  letter-spacing: 1px;
}

.stats {
  text-align: left;
  margin: 0 auto 28px;
  max-width: 280px;
  font-size: 14px;
  line-height: 2;
  letter-spacing: 1px;
}
.stats div {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #ddd;
  padding: 2px 0;
}
.stats .stat-value {
  font-weight: bold;
}

/* Damage shake (applied briefly to #game) */
@keyframes shake {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(-4px, 2px); }
  50% { transform: translate(4px, -2px); }
  75% { transform: translate(-2px, -4px); }
}
#game.shake { animation: shake 0.15s; }
```

- [ ] **Step 3: Commit**

```bash
git add index.html src/style.css
git commit -m "feat: update HTML/CSS for maze HUD (floor, doors, interact, fade)"
```

---

## Task 9: Rewrite Hud.ts for maze UI

**Files:**
- Rewrite: `src/Hud.ts`

- [ ] **Step 1: Rewrite Hud.ts**

Replace the entire `src/Hud.ts`:

```typescript
/**
 * Hud — manages DOM HUD elements for maze gameplay.
 * Floor, doors, health, ammo, room enemy count, interact prompts,
 * fade transitions, floor announcement.
 */
export class Hud {
  private readonly hp: HTMLElement;
  private readonly ammo: HTMLElement;
  private readonly floorEl: HTMLElement;
  private readonly doorsEl: HTMLElement;
  private readonly roomStatus: HTMLElement;
  private readonly roomEnemies: HTMLElement;
  private readonly interactPrompt: HTMLElement;
  private readonly floorTransition: HTMLElement;
  private readonly floorText: HTMLElement;
  private readonly fadeOverlay: HTMLElement;
  private readonly damage: HTMLElement;
  private readonly hitmarker: HTMLElement;
  private readonly game: HTMLElement;

  constructor() {
    this.hp = mustGet('hp');
    this.ammo = mustGet('ammo');
    this.floorEl = mustGet('floor');
    this.doorsEl = mustGet('doors');
    this.roomStatus = mustGet('room-status');
    this.roomEnemies = mustGet('room-enemies');
    this.interactPrompt = mustGet('interact-prompt');
    this.floorTransition = mustGet('floor-transition');
    this.floorText = mustGet('floor-text');
    this.fadeOverlay = mustGet('fade-overlay');
    this.damage = mustGet('damage');
    this.hitmarker = mustGet('hitmarker');
    this.game = mustGet('game');
  }

  setHp(v: number): void {
    this.hp.textContent = String(Math.max(0, Math.floor(v)));
  }

  setAmmo(v: number): void {
    this.ammo.textContent = String(Math.max(0, Math.floor(v)));
  }

  setFloor(floor: number): void {
    this.floorEl.textContent = String(floor);
  }

  setDoors(opened: number, total: number): void {
    this.doorsEl.textContent = `${opened} / ${total}`;
  }

  showRoomStatus(alive: number): void {
    this.roomStatus.style.display = '';
    this.roomEnemies.textContent = alive > 0 ? String(alive) : 'CLEARED';
  }

  hideRoomStatus(): void {
    this.roomStatus.style.display = 'none';
  }

  showInteract(text: string): void {
    this.interactPrompt.textContent = text;
    this.interactPrompt.style.display = '';
  }

  hideInteract(): void {
    this.interactPrompt.style.display = 'none';
  }

  /** Show floor number announcement (auto-hides after animation) */
  showFloorTransition(floor: number): void {
    this.floorText.textContent = `FLOOR ${floor}`;
    this.floorTransition.style.display = 'flex';
    // Reset animation
    this.floorText.style.animation = 'none';
    void this.floorText.offsetWidth;
    this.floorText.style.animation = '';
    setTimeout(() => {
      this.floorTransition.style.display = 'none';
    }, 1500);
  }

  /** Black fade in/out for room transitions */
  fadeIn(): Promise<void> {
    return new Promise((resolve) => {
      this.fadeOverlay.classList.add('active');
      setTimeout(resolve, 300);
    });
  }

  fadeOut(): Promise<void> {
    return new Promise((resolve) => {
      this.fadeOverlay.classList.remove('active');
      setTimeout(resolve, 300);
    });
  }

  flashDamage(): void {
    this.damage.classList.add('flash');
    this.game.classList.add('shake');
    setTimeout(() => {
      this.damage.classList.remove('flash');
    }, 120);
    setTimeout(() => {
      this.game.classList.remove('shake');
    }, 160);
  }

  flashHitMarker(): void {
    this.hitmarker.classList.remove('hit');
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('hit');
  }

  showGameOver(stats: { floor: number; kills: number; time: number; doors: number }, onRestart: () => void): void {
    const el = mustGet('gameover');
    const statsEl = mustGet('gameover-stats');
    const minutes = Math.floor(stats.time / 60);
    const seconds = Math.floor(stats.time % 60);
    statsEl.innerHTML = `
      <div><span>FLOOR REACHED</span><span class="stat-value">${stats.floor}</span></div>
      <div><span>KILLS</span><span class="stat-value">${stats.kills}</span></div>
      <div><span>TIME</span><span class="stat-value">${minutes}:${String(seconds).padStart(2, '0')}</span></div>
      <div><span>DOORS OPENED</span><span class="stat-value">${stats.doors}</span></div>
    `;
    mustGet('gameover-sub').textContent = 'The maze claims another.';
    el.style.display = 'flex';
    const btn = mustGet('gameover-restart') as HTMLButtonElement;
    const handler = () => {
      btn.removeEventListener('click', handler);
      el.style.display = 'none';
      onRestart();
    };
    btn.addEventListener('click', handler);
  }

  hideEndScreens(): void {
    mustGet('gameover').style.display = 'none';
  }
}

function mustGet(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck 2>&1 | grep "Hud.ts"`

Expected: 0 errors in Hud.ts.

- [ ] **Step 3: Commit**

```bash
git add src/Hud.ts
git commit -m "feat: rewrite Hud for maze UI (floor, doors, interact, fade, stats)"
```

---

## Task 10: Rewrite Game.ts — the main orchestrator

**Files:**
- Rewrite: `src/Game.ts`

- [ ] **Step 1: Rewrite Game.ts with maze state machine**

Replace the entire `src/Game.ts`:

```typescript
import * as THREE from 'three';
import { CONFIG } from './config';
import { Engine } from './Engine';
import { Input } from './Input';
import { Level } from './Level';
import { Player } from './Player';
import { Enemy } from './Enemy';
import { Weapon } from './Weapon';
import { WeaponModel } from './WeaponModel';
import { Hud } from './Hud';
import { Sfx } from './Sfx';
import { generateMaze, type MazeData } from './Maze';
import { Door } from './Door';
import { Room } from './Room';

type GameState = 'exploring' | 'in_room' | 'dead';

/**
 * Game — top-level orchestrator for maze gameplay.
 * State machine: exploring (maze) → in_room (combat/treasure/exit) → dead
 * Manages floor progression, door interactions, room teleportation.
 */
export class Game {
  readonly engine: Engine;
  readonly input: Input;
  readonly weaponModel: WeaponModel;
  readonly hud: Hud;
  readonly sfx: Sfx;

  private level!: Level;
  private player!: Player;
  private weapon!: Weapon;
  private mazeData!: MazeData;
  private doors: Door[] = [];
  private currentRoom: Room | null = null;

  private state: GameState = 'exploring';
  private floor = 1;
  private doorsOpened = 0;
  private totalKills = 0;
  private elapsedTime = 0;
  private transitioning = false;
  private nearDoor: Door | null = null;

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    this.engine.scene.add(this.engine.camera);

    this.input = new Input(this.engine.renderer.domElement);
    this.weaponModel = new WeaponModel(this.engine.camera);
    this.sfx = new Sfx();
    this.hud = new Hud();

    // Initial maze
    this.initFloor(1);

    this.bindActions();
    this.registerUpdaters();
    this.refreshHud();
  }

  private initFloor(floor: number): void {
    // Clean up old level and doors
    if (this.level) {
      this.level.dispose(this.engine.scene);
    }
    for (const d of this.doors) d.dispose(this.engine.scene);
    this.doors = [];

    // Generate maze
    this.floor = floor;
    this.mazeData = generateMaze(floor);

    // Build level geometry
    this.level = new Level(this.engine.scene, this.mazeData);

    // Create or update player
    if (!this.player) {
      this.player = new Player(this.engine.camera, this.input, this.level);
      this.weapon = new Weapon(this.player, this.weaponModel, this.sfx);
    } else {
      this.player.setLevel(this.level);
    }

    // Place player at spawn
    const spawn = this.level.getPlayerSpawn();
    this.player.teleportTo(spawn.x, spawn.z);

    // Create doors
    for (const dp of this.mazeData.doors) {
      this.doors.push(new Door(dp, this.mazeData.rows, this.mazeData.cols, this.engine.scene));
    }

    this.doorsOpened = 0;
  }

  start(): void {
    this.input.requestPointerLock();
    this.engine.start();
  }

  private bindActions(): void {
    // Click to shoot
    this.input.onMouseDown.push(() => {
      if (this.state !== 'exploring' && this.state !== 'in_room') return;
      const enemies = this.state === 'in_room' && this.currentRoom
        ? this.currentRoom.enemies
        : [];
      const hit = this.weapon.tryFire(enemies);
      if (hit) {
        this.hud.flashHitMarker();
        this.sfx.hit();
        if (!hit.enemy.alive) {
          this.sfx.enemyDie();
          this.totalKills++;
        }
      }
    });

    // E to interact
    this.input.onInteract.push(() => {
      if (this.transitioning) return;
      if (this.state === 'exploring') {
        this.tryOpenDoor();
      } else if (this.state === 'in_room') {
        this.tryRoomInteract();
      }
    });

    // R to reload or restart
    this.input.registerKey('r', () => {
      if (this.state === 'dead') {
        this.restart();
      } else {
        this.player.ammo = Math.min(this.player.ammo + CONFIG.player.maxAmmo, CONFIG.player.maxAmmo);
        this.hud.setAmmo(this.player.ammo);
      }
    });
  }

  private async tryOpenDoor(): Promise<void> {
    if (!this.nearDoor || this.nearDoor.getState() === 'used') return;

    this.transitioning = true;
    this.sfx.doorOpen();
    this.nearDoor.markUsed();
    this.doorsOpened++;
    this.hud.setDoors(this.doorsOpened, this.doors.length);
    this.hud.hideInteract();

    // Save position for return
    this.player.savePosition();

    // Fade to black
    await this.hud.fadeIn();

    // Create room
    const roomType = this.nearDoor.roomType;
    this.currentRoom = new Room(roomType, this.engine.scene, this.floor);

    // Teleport player into room center
    this.player.teleportTo(500, 500 + CONFIG.room.size / 2 - 2);

    // Swap collision to room walls
    // (Player uses level for collision; we need room collision in room)
    // We handle this by having Room provide its own resolveCircleVsWalls

    this.state = 'in_room';

    if (roomType === 'combat') {
      this.hud.showRoomStatus(this.currentRoom.getAliveEnemyCount());
    }

    // Fade from black
    await this.hud.fadeOut();
    this.transitioning = false;
  }

  private async tryRoomInteract(): Promise<void> {
    if (!this.currentRoom) return;

    const px = this.player.position.x;
    const pz = this.player.position.z;

    // Check chest interaction
    if (this.currentRoom.chest && this.currentRoom.chest.isPlayerNear(px, pz) && !this.currentRoom.chest.isOpened()) {
      const loot = this.currentRoom.chest.open();
      this.sfx.chestOpen();
      this.player.ammo = Math.min(this.player.ammo + loot.ammo, CONFIG.player.maxAmmo);
      this.player.hp = Math.min(this.player.hp + loot.health, CONFIG.player.maxHealth);
      this.hud.setAmmo(this.player.ammo);
      this.hud.setHp(this.player.hp);
      this.hud.hideInteract();
      return;
    }

    // Check exit portal
    if (this.currentRoom.type === 'exit' && this.currentRoom.isNearExitPortal(px, pz)) {
      await this.advanceFloor();
      return;
    }

    // Check return door
    if (this.currentRoom.isNearReturnDoor(px, pz)) {
      await this.exitRoom();
      return;
    }
  }

  private async exitRoom(): Promise<void> {
    this.transitioning = true;
    await this.hud.fadeIn();

    // Dispose room
    if (this.currentRoom) {
      this.currentRoom.dispose(this.engine.scene);
      this.currentRoom = null;
    }

    // Restore player to maze position
    this.player.restorePosition();
    this.state = 'exploring';
    this.hud.hideRoomStatus();

    await this.hud.fadeOut();
    this.transitioning = false;
  }

  private async advanceFloor(): Promise<void> {
    this.transitioning = true;
    this.sfx.floorTransition();
    await this.hud.fadeIn();

    // Dispose room
    if (this.currentRoom) {
      this.currentRoom.dispose(this.engine.scene);
      this.currentRoom = null;
    }

    // Generate new floor
    this.initFloor(this.floor + 1);
    this.state = 'exploring';

    this.hud.hideRoomStatus();
    this.refreshHud();

    await this.hud.fadeOut();
    this.hud.showFloorTransition(this.floor);
    this.transitioning = false;
  }

  private registerUpdaters(): void {
    this.engine.addUpdater((dt) => this.update(dt));
  }

  private update(dt: number): void {
    if (this.state === 'dead') {
      this.weaponModel.update(dt);
      return;
    }

    this.elapsedTime += dt;
    this.player.update(dt);
    this.weapon.update(dt);
    this.weaponModel.update(dt);

    if (this.state === 'exploring') {
      this.updateExploring();
    } else if (this.state === 'in_room') {
      this.updateInRoom(dt);
    }

    this.hud.setAmmo(this.player.ammo);
    this.hud.setHp(this.player.hp);
  }

  private updateExploring(): void {
    const px = this.player.position.x;
    const pz = this.player.position.z;

    // Check door proximity
    let foundNear: Door | null = null;
    for (const door of this.doors) {
      if (door.getState() === 'used') {
        door.setHighlight(false);
        continue;
      }
      const near = door.isPlayerNear(px, pz);
      door.setHighlight(near);
      if (near) foundNear = door;
    }

    this.nearDoor = foundNear;
    if (foundNear && !this.transitioning) {
      this.hud.showInteract('[E] OPEN DOOR');
    } else {
      this.hud.hideInteract();
    }

    // Resolve player collision against maze walls
    const resolved = this.level.resolveCircleVsWalls(
      this.player.position.x,
      this.player.position.z,
      CONFIG.player.radius,
    );
    this.player.position.x = resolved.x;
    this.player.position.z = resolved.z;
  }

  private updateInRoom(dt: number): void {
    if (!this.currentRoom) return;

    const px = this.player.position.x;
    const pz = this.player.position.z;

    // Room wall collision
    const resolved = this.currentRoom.resolveCircleVsWalls(px, pz, CONFIG.player.radius);
    this.player.position.x = resolved.x;
    this.player.position.z = resolved.z;

    // Update room (enemies, chest)
    const result = this.currentRoom.update(dt, this.player);

    // Handle damage
    if (result.shot) {
      this.onPlayerHit(result.shotDamage);
    }
    if (result.contactHit) {
      this.onPlayerHit(result.contactDamage);
    }

    // Update room HUD
    if (this.currentRoom.type === 'combat') {
      this.hud.showRoomStatus(this.currentRoom.getAliveEnemyCount());
    }

    // Interact prompts in room
    if (!this.transitioning) {
      if (this.currentRoom.chest && this.currentRoom.chest.isPlayerNear(px, pz) && !this.currentRoom.chest.isOpened()) {
        this.hud.showInteract('[E] OPEN CHEST');
      } else if (this.currentRoom.type === 'exit' && this.currentRoom.isNearExitPortal(px, pz)) {
        this.hud.showInteract('[E] ENTER NEXT FLOOR');
      } else if (this.currentRoom.isNearReturnDoor(px, pz)) {
        this.hud.showInteract('[E] RETURN TO MAZE');
      } else {
        this.hud.hideInteract();
      }
    }
  }

  private onPlayerHit(damage: number): void {
    if (this.state === 'dead') return;
    const died = this.player.takeDamage(damage);
    this.sfx.damage();
    this.hud.flashDamage();
    this.hud.setHp(this.player.hp);
    if (died) {
      this.onDeath();
    }
  }

  private onDeath(): void {
    this.state = 'dead';
    this.sfx.death();
    this.input.exitPointerLock();
    this.hud.showGameOver(
      {
        floor: this.floor,
        kills: this.totalKills,
        time: this.elapsedTime,
        doors: this.doorsOpened,
      },
      () => this.restart(),
    );
  }

  restart(): void {
    // Dispose current room if any
    if (this.currentRoom) {
      this.currentRoom.dispose(this.engine.scene);
      this.currentRoom = null;
    }

    // Reset stats
    this.totalKills = 0;
    this.elapsedTime = 0;

    // Reset player
    this.player.hp = CONFIG.player.maxHealth;
    this.player.ammo = CONFIG.player.maxAmmo;
    this.player.alive = true;

    // Generate floor 1
    this.initFloor(1);
    this.state = 'exploring';

    this.hud.hideEndScreens();
    this.hud.hideRoomStatus();
    this.hud.hideInteract();
    this.refreshHud();
    this.hud.showFloorTransition(1);
    this.input.requestPointerLock();
  }

  private refreshHud(): void {
    this.hud.setHp(this.player.hp);
    this.hud.setAmmo(this.player.ammo);
    this.hud.setFloor(this.floor);
    this.hud.setDoors(this.doorsOpened, this.doors.length);
  }

  dispose(): void {
    if (this.currentRoom) {
      this.currentRoom.dispose(this.engine.scene);
    }
    for (const d of this.doors) d.dispose(this.engine.scene);
    this.level.dispose(this.engine.scene);
    this.input.dispose();
    this.engine.dispose();
  }
}
```

- [ ] **Step 2: Update main.ts for new game states**

Replace the entire `src/main.ts`:

```typescript
import './style.css';
import { Game } from './Game';

const container = document.getElementById('game')!;
const overlay = document.getElementById('overlay')!;
const startBtn = document.getElementById('start') as HTMLButtonElement;

const game = new Game(container);

startBtn.addEventListener('click', () => {
  game.sfx.unlock();
  overlay.style.display = 'none';
  game.start();
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement == null) {
    const dead = (document.getElementById('gameover') as HTMLElement).style.display === 'flex';
    if (!dead) {
      overlay.style.display = 'flex';
      startBtn.textContent = 'CLICK TO RESUME';
    }
  } else {
    overlay.style.display = 'none';
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck`

Expected: PASS — all files should compile. If there are errors, they indicate mismatches between task implementations that need fixing.

- [ ] **Step 4: Run dev server and test**

Run: `cd /Users/lindeng/doom-fps && pnpm dev`

Manual test checklist:
1. Click to play — maze appears with corridors
2. WASD movement through maze corridors works
3. Walls have collision (can't walk through)
4. HUD shows FLOOR 1 and DOORS 0/N
5. Find a door — it glows when near, shows `[E] OPEN DOOR`
6. Press E — fade transition, enter room
7. Combat room: enemies spawn, fight, cleared message, return door unlocks
8. Treasure room: chest is gold, open with E, get ammo/health
9. Exit room: green portal, enter to advance to floor 2
10. Death shows stats screen with floor/kills/time/doors
11. R restarts from floor 1

- [ ] **Step 5: Commit**

```bash
git add src/Game.ts src/main.ts
git commit -m "feat: rewrite Game.ts orchestrator for maze exploration + room teleport"
```

---

## Task 11: Fix type issues and integration testing

**Files:**
- Modify: `src/Room.ts` (if collision interface mismatch)
- Modify: `src/Enemy.ts` (if Level type mismatch)

- [ ] **Step 1: Run full typecheck and fix issues**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck`

The most likely issue is that `Enemy.update()` expects a `Level` but `Room` passes itself. To fix this, extract a collision interface.

If `Room.ts` shows type errors, add this to `src/Level.ts` (export it):

```typescript
export interface CollisionProvider {
  resolveCircleVsWalls(x: number, z: number, radius: number): { x: number; z: number };
}
```

Then update `Enemy.ts` update signature:

```typescript
update(dt: number, player: Player, collider: import('./Level').CollisionProvider): { shot: boolean; contactHit: boolean }
```

And update `Room.ts` to pass `this` (which implements `CollisionProvider`):

```typescript
const result = e.update(dt, player, this);
```

- [ ] **Step 2: Run build**

Run: `cd /Users/lindeng/doom-fps && pnpm build`

Expected: Build succeeds, `dist/` is generated.

- [ ] **Step 3: Run dev and full playtest**

Run: `cd /Users/lindeng/doom-fps && pnpm dev`

Test each scenario:
- Maze generation produces navigable corridors
- All three door types work (combat/treasure/exit)
- Rusher enemies charge and deal contact damage
- Tank enemies are large and durable
- Floor progression works (floors 1 → 2 → 3+)
- Death and restart work cleanly
- No Three.js console warnings about disposed objects

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: resolve type issues and integration cleanup for maze gameplay"
```
