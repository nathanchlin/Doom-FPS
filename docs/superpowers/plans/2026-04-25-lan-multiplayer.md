# LAN Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CS 1.5-style LAN multiplayer (PvPvE Deathmatch) with a Node.js listen server and WebSocket communication.

**Architecture:** Extract shared game logic (collision, maze generation, protocol types) into `src/shared/`. Build a headless Node.js game server in `src/server/` that runs the authoritative simulation at 20Hz. Add networking client code in `src/client/` (NetClient, RemotePlayer, prediction, interpolation). Modify existing client code to branch between singleplayer (unchanged) and multiplayer (networked) modes.

**Tech Stack:** Three.js, TypeScript, Vite, Node.js, `ws` (WebSocket), `tsx` (dev runner)

---

## File Structure

### New Files

```
src/shared/
  protocol.ts       — All message type definitions (C→S and S→C)
  collision.ts       — Pure math: circle-vs-AABB, line-of-sight, ray-vs-AABB3D
  maze.ts            — Seeded maze generation (extracted from src/Maze.ts)
  config.ts          — Game config (moved from src/config.ts)

src/server/
  main.ts            — Entry point: HTTP static server + WebSocket server
  GameServer.ts      — 20Hz authoritative game loop, player/enemy management
  ServerPlayer.ts    — Server-side player state and input processing
  ServerEnemy.ts     — Server-side enemy AI (FSM, no Three.js)
  ServerWeapon.ts    — Server-side hitscan resolution (ray-vs-AABB math)
  Lobby.ts           — Pre-game lobby state management
  Pickup.ts          — Health/ammo pickup spawning and claiming

src/client/
  NetClient.ts       — WebSocket connection, message send/receive
  RemotePlayer.ts    — Third-person player model + snapshot interpolation
  Interpolation.ts   — Generic two-frame lerp buffer
  Prediction.ts      — Client-side input prediction + server reconciliation
  MultiplayerHud.ts  — Kill feed, scoreboard, respawn countdown, match timer
  LobbyUI.ts         — Lobby screen DOM (player list, settings, start)

vite.server.config.ts — Server build config
```

### Modified Files

```
src/config.ts        — Replace contents with re-export from shared/config.ts
src/Maze.ts          — Replace contents with re-export from shared/maze.ts
src/main.ts          — Add mode selection (singleplayer / create / join)
src/Game.ts          — Add multiplayer branch in update loop
src/Player.ts        — Add getYaw()/getPitch() accessors, multiplayer input mode
src/Enemy.ts         — Add setFromSnapshot() for interpolation in multiplayer
src/Weapon.ts        — Add networked fire mode
index.html           — Add lobby UI, multiplayer HUD, mode selection elements
package.json         — Add ws, tsx, @types/ws, new scripts
tsconfig.json        — Include src/server and src/shared in compilation
```

---

## Task 1: Project Setup — Dependencies and Build Config

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `vite.server.config.ts`

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/lindeng/doom-fps
pnpm add ws
pnpm add -D tsx @types/ws
```

- [ ] **Step 2: Update package.json scripts**

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "host": "tsx src/server/main.ts",
    "build:server": "vite build --config vite.server.config.ts",
    "start": "node dist-server/main.mjs"
  }
}
```

- [ ] **Step 3: Update tsconfig.json**

Change `include` to cover all source directories:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM"],
    "types": ["vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

Note: `src` already covers `src/shared/` and `src/server/` — no change needed in tsconfig. But we need a separate tsconfig for the server build that excludes DOM types. Create `tsconfig.server.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/server", "src/shared"]
}
```

- [ ] **Step 4: Create vite.server.config.ts**

```typescript
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    ssr: 'src/server/main.ts',
    outDir: 'dist-server',
    target: 'node22',
    rollupOptions: {
      external: ['ws', 'node:http', 'node:fs', 'node:path', 'node:url'],
    },
  },
});
```

- [ ] **Step 5: Verify setup**

```bash
pnpm typecheck
```

Expected: PASS (no new files imported yet, existing code unchanged)

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json tsconfig.server.json vite.server.config.ts
git commit -m "chore: add multiplayer dependencies and server build config"
```

---

## Task 2: Shared Protocol Types

**Files:**
- Create: `src/shared/protocol.ts`

- [ ] **Step 1: Create src/shared/protocol.ts**

```typescript
// ─── Common types ───

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface MatchConfig {
  killTarget: number;
  timeLimit: number;   // seconds
  respawnDelay: number; // seconds
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  killTarget: 20,
  timeLimit: 600,
  respawnDelay: 3,
};

// ─── Snapshot sub-types ───

export interface PlayerState {
  id: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
  pitch: number;
  hp: number;
  ammo: number;
  alive: boolean;
  kills: number;
  deaths: number;
  name: string;
  invincible: boolean;
}

export interface EnemyState {
  id: number;
  x: number;
  z: number;
  hp: number;
  state: 'idle' | 'chase' | 'attack' | 'dead';
  yaw: number;
  targetPlayerId: number;
}

export interface PickupState {
  id: number;
  x: number;
  z: number;
  kind: 'health' | 'ammo';
  active: boolean;
}

// ─── Client → Server messages ───

export interface JoinMessage {
  type: 'join';
  name: string;
}

export interface InputMessage {
  type: 'input';
  seq: number;
  keys: number;        // bitmask: W=1 A=2 S=4 D=8 SPACE=16 SHIFT=32
  yaw: number;
  pitch: number;
  fire: boolean;
  interact: boolean;
}

export interface ReadyMessage {
  type: 'ready';
}

export interface GameSettingsMessage {
  type: 'game_settings';
  killTarget: number;
  timeLimit: number;
}

export interface StartGameMessage {
  type: 'start_game';
}

export type ClientMessage =
  | JoinMessage
  | InputMessage
  | ReadyMessage
  | GameSettingsMessage
  | StartGameMessage;

// ─── Key bitmask constants ───

export const KEY = {
  W: 1,
  A: 2,
  S: 4,
  D: 8,
  SPACE: 16,
  SHIFT: 32,
} as const;

// ─── Server → Client messages ───

export interface WelcomeMessage {
  type: 'welcome';
  playerId: number;
  config: MatchConfig;
}

export interface LobbyStateMessage {
  type: 'lobby_state';
  players: Array<{ id: number; name: string; ready: boolean; isHost: boolean }>;
  settings: { killTarget: number; timeLimit: number };
}

export interface GameStartMessage {
  type: 'game_start';
  mazeSeed: number;
  floor: number;
  enemySpawns: Array<{ id: number; x: number; z: number; enemyType: string }>;
  pickups: PickupState[];
}

export interface SnapshotMessage {
  type: 'snapshot';
  tick: number;
  timeRemaining: number;
  lastInputSeq: number;
  players: PlayerState[];
  enemies: EnemyState[];
  pickups: PickupState[];
}

export interface HitMessage {
  type: 'hit';
  attackerId: number;
  targetId: number;
  targetType: 'player' | 'enemy';
  damage: number;
  killed: boolean;
}

export interface KillMessage {
  type: 'kill';
  killerId: number;
  killerName: string;
  victimId: number;
  victimName: string;
  weapon: string;
}

export interface RespawnMessage {
  type: 'respawn';
  playerId: number;
  x: number;
  z: number;
}

export interface PlayerJoinedMessage {
  type: 'player_joined';
  id: number;
  name: string;
}

export interface PlayerLeftMessage {
  type: 'player_left';
  id: number;
  name: string;
}

export interface PickupTakenMessage {
  type: 'pickup_taken';
  pickupId: number;
  playerId: number;
}

export interface PickupSpawnedMessage {
  type: 'pickup_spawned';
  pickupId: number;
  x: number;
  z: number;
  kind: 'health' | 'ammo';
}

export interface GameOverMessage {
  type: 'game_over';
  reason: 'kill_target' | 'time_up';
  winnerId: number;
  winnerName: string;
  scoreboard: Array<{ id: number; name: string; kills: number; deaths: number }>;
  duration: number;
}

export type ServerMessage =
  | WelcomeMessage
  | LobbyStateMessage
  | GameStartMessage
  | SnapshotMessage
  | HitMessage
  | KillMessage
  | RespawnMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | PickupTakenMessage
  | PickupSpawnedMessage
  | GameOverMessage;
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/protocol.ts
git commit -m "feat: add shared multiplayer protocol types"
```

---

## Task 3: Shared Collision — Extract Pure Math Functions

**Files:**
- Create: `src/shared/collision.ts`
- Modify: `src/Level.ts` (delegate to shared functions)

- [ ] **Step 1: Create src/shared/collision.ts**

```typescript
export interface AABB2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface AABB3D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface Ray3D {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
}

/**
 * Resolve a circle (XZ plane) against a list of 2D AABBs.
 * Pushes the circle center out of any penetrating walls.
 */
export function resolveCircleVsAABBs(
  x: number,
  z: number,
  radius: number,
  walls: AABB2D[],
): { x: number; z: number } {
  let rx = x, rz = z;
  for (const w of walls) {
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

/**
 * Check if a line segment from (ax,az) to (bx,bz) is blocked by any wall.
 * Returns true if the line is clear (no intersections).
 */
export function hasLineOfSight(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  walls: AABB2D[],
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  for (const w of walls) {
    let tmin = 0, tmax = 1;

    if (Math.abs(dx) > 1e-8) {
      const t1 = (w.minX - ax) / dx;
      const t2 = (w.maxX - ax) / dx;
      const tlo = Math.min(t1, t2);
      const thi = Math.max(t1, t2);
      tmin = Math.max(tmin, tlo);
      tmax = Math.min(tmax, thi);
      if (tmin > tmax) continue;
    } else {
      if (ax < w.minX || ax > w.maxX) continue;
    }

    if (Math.abs(dz) > 1e-8) {
      const t1 = (w.minZ - az) / dz;
      const t2 = (w.maxZ - az) / dz;
      const tlo = Math.min(t1, t2);
      const thi = Math.max(t1, t2);
      tmin = Math.max(tmin, tlo);
      tmax = Math.min(tmax, thi);
      if (tmin > tmax) continue;
    } else {
      if (az < w.minZ || az > w.maxZ) continue;
    }

    return false;
  }
  return true;
}

/**
 * 3D ray-vs-AABB intersection using slab method.
 * Returns the distance to intersection, or null if no hit.
 */
export function rayVsAABB3D(ray: Ray3D, box: AABB3D, maxDist: number): number | null {
  let tmin = 0;
  let tmax = maxDist;

  // X slab
  if (Math.abs(ray.dx) > 1e-8) {
    const t1 = (box.minX - ray.ox) / ray.dx;
    const t2 = (box.maxX - ray.ox) / ray.dx;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmin > tmax) return null;
  } else {
    if (ray.ox < box.minX || ray.ox > box.maxX) return null;
  }

  // Y slab
  if (Math.abs(ray.dy) > 1e-8) {
    const t1 = (box.minY - ray.oy) / ray.dy;
    const t2 = (box.maxY - ray.oy) / ray.dy;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmin > tmax) return null;
  } else {
    if (ray.oy < box.minY || ray.oy > box.maxY) return null;
  }

  // Z slab
  if (Math.abs(ray.dz) > 1e-8) {
    const t1 = (box.minZ - ray.oz) / ray.dz;
    const t2 = (box.maxZ - ray.oz) / ray.dz;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmin > tmax) return null;
  } else {
    if (ray.oz < box.minZ || ray.oz > box.maxZ) return null;
  }

  return tmin;
}

/**
 * Build a look-direction vector from yaw and pitch (no Three.js dependency).
 * Matches Player.getLookDir() behavior: yaw rotates around Y, pitch rotates around X.
 */
export function lookDirection(yaw: number, pitch: number): { dx: number; dy: number; dz: number } {
  const cosPitch = Math.cos(pitch);
  return {
    dx: -Math.sin(yaw) * cosPitch,
    dy: Math.sin(pitch),
    dz: -Math.cos(yaw) * cosPitch,
  };
}
```

- [ ] **Step 2: Modify src/Level.ts to delegate to shared functions**

In `src/Level.ts`, add import at the top:

```typescript
import { resolveCircleVsAABBs, hasLineOfSight as sharedLOS } from './shared/collision';
```

Then replace the `resolveCircleVsWalls` method body (lines 224-251) with:

```typescript
  resolveCircleVsWalls(x: number, z: number, radius: number): { x: number; z: number } {
    return resolveCircleVsAABBs(x, z, radius, this.walls);
  }
```

And replace the `hasLineOfSight` method body (lines 254-289) with:

```typescript
  hasLineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    return sharedLOS(ax, az, bx, bz, this.walls);
  }
```

Also change the `AABB2D` import in Level.ts. Remove the local `AABB2D` interface definition and import from shared:

Replace lines 6-8:
```typescript
export interface AABB2D {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}
```

With:
```typescript
import type { AABB2D } from './shared/collision';
export type { AABB2D };
```

Note: The re-export keeps existing imports of `AABB2D` from `'./Level'` working.

- [ ] **Step 3: Verify**

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/shared/collision.ts src/Level.ts
git commit -m "feat: extract collision math to shared/collision.ts"
```

---

## Task 4: Shared Maze — Seeded Generation

**Files:**
- Create: `src/shared/maze.ts`
- Modify: `src/Maze.ts` (re-export from shared)

- [ ] **Step 1: Create src/shared/maze.ts**

Copy the maze logic from `src/Maze.ts` and add seeded RNG support. The key change: every `Math.random()` call is replaced with `rng()` from a seeded PRNG.

```typescript
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
  wallDir: number;
  roomType: RoomType;
}

export interface MazeData {
  rows: number;
  cols: number;
  grid: number[][];
  doors: DoorPlacement[];
}

// ─── Maze config constants (avoids importing full config on server) ───

export interface MazeConfig {
  cellSize: number;
  wallThickness: number;
  baseGridSize: number;
  maxGridSize: number;
  minDeadEnds: number;
  baseDoorCount: number;
  maxDoorCount: number;
  combatChance: number;
}

export const DEFAULT_MAZE_CONFIG: MazeConfig = {
  cellSize: 6,
  wallThickness: 0.5,
  baseGridSize: 8,
  maxGridSize: 14,
  minDeadEnds: 3,
  baseDoorCount: 5,
  maxDoorCount: 8,
  combatChance: 0.765,
};

// ─── Seeded PRNG (mulberry32) ───

export type RNG = () => number;

export function createRNG(seed: number): RNG {
  let s = seed | 0;
  return () => {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ─── Generation ───

/**
 * Generate a maze. If seed is provided, uses deterministic RNG.
 * If seed is undefined, uses Math.random() (backwards-compatible with singleplayer).
 */
export function generateMaze(
  floor: number,
  seed?: number,
  cfg: MazeConfig = DEFAULT_MAZE_CONFIG,
): MazeData {
  const rng: RNG = seed !== undefined ? createRNG(seed + floor * 997) : Math.random;

  const gridSize = Math.min(cfg.baseGridSize + (floor - 1), cfg.maxGridSize);
  const rows = gridSize;
  const cols = gridSize;

  let grid: number[][];
  let deadEnds: Array<{ row: number; col: number }>;

  do {
    grid = Array.from({ length: rows }, () => Array(cols).fill(0) as number[]);
    carve(grid, rows, cols, rng);
    deadEnds = findDeadEnds(grid, rows, cols);
  } while (deadEnds.length < cfg.minDeadEnds);

  const doorCount = Math.min(cfg.baseDoorCount + (floor - 1), cfg.maxDoorCount, deadEnds.length);

  shuffle(deadEnds, rng);
  const chosenEnds = deadEnds.slice(0, doorCount);

  const doors: DoorPlacement[] = chosenEnds.map((de, i) => {
    const wallDir = getClosedWall(grid, de.row, de.col, rows, cols);
    let roomType: RoomType;
    if (i === 0) {
      roomType = 'exit';
    } else {
      roomType = rng() < cfg.combatChance ? 'combat' : 'treasure';
    }
    return { cellRow: de.row, cellCol: de.col, wallDir, roomType };
  });

  shuffle(doors, rng);

  return { rows, cols, grid, doors };
}

function carve(grid: number[][], rows: number, cols: number, rng: RNG): void {
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false) as boolean[]);
  const stack: Array<{ r: number; c: number }> = [];

  const startR = Math.floor(rng() * rows);
  const startC = Math.floor(rng() * cols);
  visited[startR][startC] = true;
  stack.push({ r: startR, c: startC });

  while (stack.length > 0) {
    const curr = stack[stack.length - 1]!;
    const neighbors = getUnvisitedNeighbors(curr.r, curr.c, rows, cols, visited);

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const { r: nr, c: nc, dir } = neighbors[Math.floor(rng() * neighbors.length)]!;
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

export function findCorridorCells(
  grid: number[][], rows: number, cols: number,
): Array<{ row: number; col: number }> {
  const result: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 && c === 0) continue;
      const openCount = bitCount(grid[r][c]!);
      if (openCount >= 2) {
        result.push({ row: r, col: c });
      }
    }
  }
  return result;
}

function findDeadEnds(grid: number[][], rows: number, cols: number): Array<{ row: number; col: number }> {
  const result: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const openCount = bitCount(grid[r][c]!);
      if (openCount === 1) {
        result.push({ row: r, col: c });
      }
    }
  }
  return result;
}

function getClosedWall(grid: number[][], r: number, c: number, rows: number, cols: number): number {
  const open = grid[r][c]!;
  for (const dir of [DIR.N, DIR.S, DIR.E, DIR.W]) {
    if (open & dir) continue;
    const nr = r + DZ[dir]!;
    const nc = c + DX[dir]!;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
      return dir;
    }
  }
  for (const dir of [DIR.N, DIR.S, DIR.E, DIR.W]) {
    if (!(open & dir)) return dir;
  }
  return DIR.N;
}

function bitCount(n: number): number {
  let count = 0;
  let v = n;
  while (v) { count += v & 1; v >>= 1; }
  return count;
}

function shuffle<T>(arr: T[], rng: RNG): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

/** Convert cell (row, col) to world position (center of cell) */
export function cellToWorld(
  row: number, col: number, mazeRows: number, mazeCols: number,
  cellSize: number = DEFAULT_MAZE_CONFIG.cellSize,
): { x: number; z: number } {
  const totalW = mazeCols * cellSize;
  const totalD = mazeRows * cellSize;
  return {
    x: -totalW / 2 + col * cellSize + cellSize / 2,
    z: -totalD / 2 + row * cellSize + cellSize / 2,
  };
}

/** Get door world position (on the wall of the cell) */
export function doorWorldPosition(
  door: DoorPlacement, mazeRows: number, mazeCols: number,
  cellSize: number = DEFAULT_MAZE_CONFIG.cellSize,
): { x: number; z: number } {
  const center = cellToWorld(door.cellRow, door.cellCol, mazeRows, mazeCols, cellSize);
  const half = cellSize / 2;
  switch (door.wallDir) {
    case DIR.N: return { x: center.x, z: center.z - half };
    case DIR.S: return { x: center.x, z: center.z + half };
    case DIR.E: return { x: center.x + half, z: center.z };
    case DIR.W: return { x: center.x - half, z: center.z };
    default: return center;
  }
}
```

- [ ] **Step 2: Update src/Maze.ts to re-export from shared**

Replace the entire contents of `src/Maze.ts` with:

```typescript
// Re-export from shared for backwards compatibility with existing client imports.
// Singleplayer calls generateMaze(floor) without a seed — uses Math.random().
export {
  DIR,
  generateMaze,
  findCorridorCells,
  cellToWorld,
  doorWorldPosition,
  type RoomType,
  type DoorPlacement,
  type MazeData,
} from './shared/maze';
```

- [ ] **Step 3: Verify existing singleplayer code still compiles**

```bash
pnpm typecheck
```

Expected: PASS (all existing imports from `'./Maze'` still resolve)

- [ ] **Step 4: Commit**

```bash
git add src/shared/maze.ts src/Maze.ts
git commit -m "feat: extract seeded maze generation to shared/maze.ts"
```

---

## Task 5: Server — Main Entry Point (HTTP + WebSocket)

**Files:**
- Create: `src/server/main.ts`

- [ ] **Step 1: Create src/server/main.ts**

```typescript
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { GameServer } from './GameServer';

const HTTP_PORT = 3000;
const WS_PORT = 3001;

// ─── Resolve dist directory ───

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// When running with tsx: src/server/ → need ../../dist/
// When running built: dist-server/ → need ../dist/
const distDir = existsSync(join(__dirname, '../../dist'))
  ? join(__dirname, '../../dist')
  : join(__dirname, '../dist');

// ─── MIME types ───

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.map': 'application/json',
};

// ─── HTTP static file server ───

const httpServer = createServer((req, res) => {
  let url = req.url ?? '/';
  if (url === '/') url = '/index.html';

  const filePath = join(distDir, url);
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = extname(filePath);
  const mime = MIME[ext] ?? 'application/octet-stream';
  const content = readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': mime });
  res.end(content);
});

httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  const nets = getLocalIPs();
  console.log(`\n  🎮 Doom FPS Server`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  HTTP: http://localhost:${HTTP_PORT}`);
  for (const ip of nets) {
    console.log(`  LAN:  http://${ip}:${HTTP_PORT}`);
  }
  console.log(`  WS:   ws://0.0.0.0:${WS_PORT}`);
  console.log(`  ─────────────────────────────────\n`);
});

// ─── WebSocket game server ───

const wss = new WebSocketServer({ port: WS_PORT });
const gameServer = new GameServer();

wss.on('connection', (ws) => {
  gameServer.onConnection(ws);
});

// ─── Utility: get local network IPs ───

function getLocalIPs(): string[] {
  const { networkInterfaces } = require('node:os') as typeof import('node:os');
  const nets = networkInterfaces();
  const results: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
}
```

- [ ] **Step 2: Create stub GameServer.ts for compilation**

Create `src/server/GameServer.ts` as a minimal stub (will be fully implemented in Task 7):

```typescript
import type { WebSocket } from 'ws';

export class GameServer {
  onConnection(ws: WebSocket): void {
    ws.on('message', (_data: Buffer) => {
      // TODO: implement in Task 7
    });
    ws.on('close', () => {
      // TODO: implement in Task 7
    });
  }
}
```

- [ ] **Step 3: Build client first, then test server startup**

```bash
pnpm build
pnpm host
```

Expected: Server starts, prints HTTP and WS URLs. Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add src/server/main.ts src/server/GameServer.ts
git commit -m "feat: add server entry point with HTTP static + WebSocket"
```

---

## Task 6: Server — Lobby System

**Files:**
- Create: `src/server/Lobby.ts`

- [ ] **Step 1: Create src/server/Lobby.ts**

```typescript
import type { WebSocket } from 'ws';
import {
  DEFAULT_MATCH_CONFIG,
  type MatchConfig,
  type LobbyStateMessage,
  type WelcomeMessage,
  type PlayerJoinedMessage,
  type PlayerLeftMessage,
  type GameStartMessage,
  type ClientMessage,
} from '../shared/protocol';

export interface LobbyPlayer {
  id: number;
  name: string;
  ws: WebSocket;
  ready: boolean;
  isHost: boolean;
}

export class Lobby {
  private players: Map<number, LobbyPlayer> = new Map();
  private nextId = 1;
  private hostId = -1;
  settings: MatchConfig = { ...DEFAULT_MATCH_CONFIG };

  /** Called when we want to start the game. Returns null if not allowed. */
  private onStartCallback: ((players: LobbyPlayer[], settings: MatchConfig) => void) | null = null;

  onStart(cb: (players: LobbyPlayer[], settings: MatchConfig) => void): void {
    this.onStartCallback = cb;
  }

  addPlayer(ws: WebSocket, name: string): LobbyPlayer {
    const id = this.nextId++;
    const isHost = this.players.size === 0;
    const player: LobbyPlayer = { id, name, ws, ready: false, isHost };

    if (isHost) this.hostId = id;
    this.players.set(id, player);

    // Send welcome to the new player
    const welcome: WelcomeMessage = {
      type: 'welcome',
      playerId: id,
      config: this.settings,
    };
    this.send(ws, welcome);

    // Notify others
    const joined: PlayerJoinedMessage = { type: 'player_joined', id, name };
    this.broadcastExcept(id, joined);

    // Broadcast updated lobby state
    this.broadcastLobbyState();

    return player;
  }

  removePlayer(id: number): void {
    const player = this.players.get(id);
    if (!player) return;

    this.players.delete(id);

    const left: PlayerLeftMessage = { type: 'player_left', id, name: player.name };
    this.broadcast(left);

    // If host left, assign new host
    if (id === this.hostId && this.players.size > 0) {
      const first = this.players.values().next().value!;
      first.isHost = true;
      this.hostId = first.id;
    }

    this.broadcastLobbyState();
  }

  handleMessage(playerId: number, msg: ClientMessage): void {
    const player = this.players.get(playerId);
    if (!player) return;

    switch (msg.type) {
      case 'ready':
        player.ready = !player.ready;
        this.broadcastLobbyState();
        break;

      case 'game_settings':
        if (player.id !== this.hostId) return; // only host
        this.settings.killTarget = msg.killTarget;
        this.settings.timeLimit = msg.timeLimit;
        this.broadcastLobbyState();
        break;

      case 'start_game':
        if (player.id !== this.hostId) return;
        if (!this.canStart()) return;
        this.onStartCallback?.(
          Array.from(this.players.values()),
          { ...this.settings },
        );
        break;
    }
  }

  canStart(): boolean {
    if (this.players.size < 2) return false;
    for (const p of this.players.values()) {
      if (!p.ready && !p.isHost) return false;
    }
    return true;
  }

  getPlayer(id: number): LobbyPlayer | undefined {
    return this.players.get(id);
  }

  getPlayers(): LobbyPlayer[] {
    return Array.from(this.players.values());
  }

  reset(): void {
    for (const p of this.players.values()) {
      p.ready = false;
    }
    this.broadcastLobbyState();
  }

  private broadcastLobbyState(): void {
    const msg: LobbyStateMessage = {
      type: 'lobby_state',
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        ready: p.ready,
        isHost: p.isHost,
      })),
      settings: {
        killTarget: this.settings.killTarget,
        timeLimit: this.settings.timeLimit,
      },
    };
    this.broadcast(msg);
  }

  private broadcast(msg: object): void {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.ws.readyState === p.ws.OPEN) {
        p.ws.send(data);
      }
    }
  }

  private broadcastExcept(excludeId: number, msg: object): void {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.id !== excludeId && p.ws.readyState === p.ws.OPEN) {
        p.ws.send(data);
      }
    }
  }

  private send(ws: WebSocket, msg: object): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
```

- [ ] **Step 2: Verify**

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/server/Lobby.ts
git commit -m "feat: add server lobby system"
```

---

## Task 7: Server — GameServer Full Implementation

**Files:**
- Modify: `src/server/GameServer.ts` (replace stub)
- Create: `src/server/ServerPlayer.ts`
- Create: `src/server/ServerEnemy.ts`
- Create: `src/server/ServerWeapon.ts`
- Create: `src/server/Pickup.ts`

This is the largest task. The server runs a 20Hz authoritative simulation.

- [ ] **Step 1: Create src/server/ServerPlayer.ts**

```typescript
import { resolveCircleVsAABBs, type AABB2D } from '../shared/collision';
import { type InputMessage, KEY } from '../shared/protocol';

const PLAYER_HEIGHT = 1.75;
const PLAYER_RADIUS = 0.4;
const MOVE_SPEED = 6.0;
const SPRINT_SPEED = 10.0;
const JUMP_VELOCITY = 6.2;
const GRAVITY = 22.0;
const MAX_HP = 100;
const MAX_AMMO = 30;

export class ServerPlayer {
  id: number;
  name: string;
  x = 0;
  z = 0;
  y = PLAYER_HEIGHT;
  vy = 0;
  yaw = 0;
  pitch = 0;
  hp = MAX_HP;
  ammo = MAX_AMMO;
  alive = true;
  kills = 0;
  deaths = 0;
  invincible = false;
  invincibleTimer = 0;
  respawnTimer = -1; // -1 = not respawning

  /** The latest input seq number processed */
  lastInputSeq = 0;

  /** Pending inputs from the client (buffered between ticks) */
  inputQueue: InputMessage[] = [];

  /** Latest processed input state (for fire detection) */
  pendingFire = false;
  pendingInteract = false;

  private onGround = true;

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
  }

  /** Process all queued inputs for this tick */
  processInputs(dt: number, walls: AABB2D[]): void {
    this.pendingFire = false;
    this.pendingInteract = false;

    if (!this.alive) return;

    // Use the latest input for movement direction, but check any for fire/interact
    let latestInput: InputMessage | null = null;
    for (const inp of this.inputQueue) {
      if (inp.fire) this.pendingFire = true;
      if (inp.interact) this.pendingInteract = true;
      latestInput = inp;
      this.lastInputSeq = inp.seq;
    }
    this.inputQueue = [];

    if (!latestInput) return;

    this.yaw = latestInput.yaw;
    this.pitch = latestInput.pitch;

    // Movement
    const keys = latestInput.keys;
    const forward = (keys & KEY.W) ? 1 : (keys & KEY.S) ? -1 : 0;
    const strafe = (keys & KEY.D) ? 1 : (keys & KEY.A) ? -1 : 0;
    const sprint = !!(keys & KEY.SHIFT);
    const speed = sprint ? SPRINT_SPEED : MOVE_SPEED;

    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const fx = -sin, fz = -cos;
    const rx = cos, rz = -sin;

    let vx = (fx * forward + rx * strafe) * speed;
    let vz = (fz * forward + rz * strafe) * speed;

    const mag = Math.hypot(vx, vz);
    if (mag > speed && mag > 0) {
      vx = (vx / mag) * speed;
      vz = (vz / mag) * speed;
    }

    let nx = this.x + vx * dt;
    let nz = this.z + vz * dt;
    const resolved = resolveCircleVsAABBs(nx, nz, PLAYER_RADIUS, walls);
    this.x = resolved.x;
    this.z = resolved.z;

    // Jump + gravity
    if ((keys & KEY.SPACE) && this.onGround) {
      this.vy = JUMP_VELOCITY;
      this.onGround = false;
    }
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;

    if (this.y <= PLAYER_HEIGHT) {
      this.y = PLAYER_HEIGHT;
      this.vy = 0;
      this.onGround = true;
    }
  }

  /** Update timers (invincibility, respawn) */
  updateTimers(dt: number): void {
    if (this.invincible) {
      this.invincibleTimer -= dt;
      if (this.invincibleTimer <= 0) {
        this.invincible = false;
      }
    }
  }

  takeDamage(amount: number): boolean {
    if (!this.alive || this.invincible) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.alive = false;
      this.deaths++;
      return true; // died
    }
    return false;
  }

  respawnAt(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.y = PLAYER_HEIGHT;
    this.vy = 0;
    this.hp = MAX_HP;
    this.ammo = MAX_AMMO;
    this.alive = true;
    this.invincible = true;
    this.invincibleTimer = 2.0;
    this.respawnTimer = -1;
    this.onGround = true;
  }

  teleportTo(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.y = PLAYER_HEIGHT;
    this.vy = 0;
  }
}
```

- [ ] **Step 2: Create src/server/ServerEnemy.ts**

```typescript
import { resolveCircleVsAABBs, hasLineOfSight, type AABB2D } from '../shared/collision';
import type { ServerPlayer } from './ServerPlayer';
import type { RNG } from '../shared/maze';

export type ServerEnemyType = 'standard' | 'rusher' | 'tank' | 'patrol';
export type ServerEnemyState = 'idle' | 'chase' | 'attack' | 'dead';

interface EnemyConfig {
  hp: number;
  moveSpeed: number;
  engageDistance: number;
  stopDistance: number;
  attackCooldown: number;
  attackChance: number;
  attackDamage: number;
  contactDamage: number;
  contactCooldown: number;
  radius: number;
}

const CONFIGS: Record<ServerEnemyType, EnemyConfig> = {
  standard: { hp: 100, moveSpeed: 2.8, engageDistance: 20, stopDistance: 6, attackCooldown: 1.2, attackChance: 0.7, attackDamage: 12, contactDamage: 0, contactCooldown: 0, radius: 0.6 },
  rusher: { hp: 50, moveSpeed: 5.5, engageDistance: 20, stopDistance: 0, attackCooldown: 0, attackChance: 0, attackDamage: 0, contactDamage: 15, contactCooldown: 1.0, radius: 0.36 },
  tank: { hp: 250, moveSpeed: 1.8, engageDistance: 25, stopDistance: 6, attackCooldown: 1.2, attackChance: 0.8, attackDamage: 20, contactDamage: 0, contactCooldown: 0, radius: 0.9 },
  patrol: { hp: 300, moveSpeed: 2.2, engageDistance: 15, stopDistance: 5, attackCooldown: 1.5, attackChance: 0.6, attackDamage: 10, contactDamage: 0, contactCooldown: 0, radius: 0.51 },
};

export class ServerEnemy {
  id: number;
  type: ServerEnemyType;
  x: number;
  z: number;
  yaw = 0;
  hp: number;
  alive = true;
  state: ServerEnemyState = 'idle';
  targetPlayerId = -1;
  respawnTimer = -1; // -1 = alive or permanently dead

  private cfg: EnemyConfig;
  private attackTimer = 0;
  private contactTimer = 0;
  private spawnX: number;
  private spawnZ: number;

  constructor(id: number, type: ServerEnemyType, x: number, z: number) {
    this.id = id;
    this.type = type;
    this.x = x;
    this.z = z;
    this.spawnX = x;
    this.spawnZ = z;
    this.cfg = CONFIGS[type];
    this.hp = this.cfg.hp;
  }

  /**
   * Update AI for one tick.
   * Returns: { shotPlayerId, contactPlayerId } — IDs of players hit this tick, or -1.
   */
  update(
    dt: number,
    players: ServerPlayer[],
    walls: AABB2D[],
    rng: RNG,
  ): { shotPlayerId: number; shotDamage: number; contactPlayerId: number; contactDamage: number } {
    const result = { shotPlayerId: -1, shotDamage: 0, contactPlayerId: -1, contactDamage: 0 };

    if (!this.alive) {
      if (this.respawnTimer > 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) {
          this.respawnAt(this.spawnX, this.spawnZ);
        }
      }
      return result;
    }

    // Find nearest alive player
    let nearest: ServerPlayer | null = null;
    let nearestDist = Infinity;
    for (const p of players) {
      if (!p.alive) continue;
      const dx = p.x - this.x;
      const dz = p.z - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = p;
      }
    }

    if (!nearest) return result;
    this.targetPlayerId = nearest.id;

    const dx = nearest.x - this.x;
    const dz = nearest.z - this.z;
    const dist = nearestDist;

    // FSM transitions
    if (this.state === 'idle' && dist < this.cfg.engageDistance) {
      this.state = 'chase';
    }
    if (this.type !== 'rusher') {
      if (this.state === 'chase' && dist < this.cfg.stopDistance) {
        this.state = 'attack';
      }
      if (this.state === 'attack' && dist > this.cfg.stopDistance * 1.3) {
        this.state = 'chase';
      }
    }

    // Face target
    this.yaw = Math.atan2(dx, dz);

    if (this.state === 'chase') {
      if (dist > 0.01) {
        const nx = this.x + (dx / dist) * this.cfg.moveSpeed * dt;
        const nz = this.z + (dz / dist) * this.cfg.moveSpeed * dt;
        const resolved = resolveCircleVsAABBs(nx, nz, this.cfg.radius, walls);
        this.x = resolved.x;
        this.z = resolved.z;
      }

      // Rusher contact damage
      if (this.type === 'rusher') {
        this.contactTimer = Math.max(0, this.contactTimer - dt);
        const contactRange = this.cfg.radius + 0.4 + 0.2;
        if (dist < contactRange && this.contactTimer <= 0) {
          result.contactPlayerId = nearest.id;
          result.contactDamage = this.cfg.contactDamage;
          this.contactTimer = this.cfg.contactCooldown;
        }
      }
    } else if (this.state === 'attack') {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackTimer = this.cfg.attackCooldown;
        if (rng() < this.cfg.attackChance &&
            hasLineOfSight(this.x, this.z, nearest.x, nearest.z, walls)) {
          result.shotPlayerId = nearest.id;
          result.shotDamage = this.cfg.attackDamage;
        }
      }
    }

    return result;
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.alive = false;
      this.state = 'dead';
      this.respawnTimer = 10; // respawn after 10 seconds
      return true;
    }
    return false;
  }

  private respawnAt(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.hp = this.cfg.hp;
    this.alive = true;
    this.state = 'idle';
    this.attackTimer = 0;
    this.contactTimer = 0;
    this.respawnTimer = -1;
  }
}
```

- [ ] **Step 3: Create src/server/ServerWeapon.ts**

```typescript
import { rayVsAABB3D, lookDirection, type AABB3D, type Ray3D } from '../shared/collision';
import type { ServerPlayer } from './ServerPlayer';
import type { ServerEnemy } from './ServerEnemy';

const PLAYER_HEIGHT = 1.75;
const PLAYER_HITBOX_W = 0.8;
const PLAYER_HITBOX_H = 1.75;
const ENEMY_BASE_RADIUS = 0.6;
const ENEMY_BASE_HEIGHT = 1.9;

const RIFLE_DAMAGE = 34;
const RIFLE_RANGE = 80;
const RIFLE_COOLDOWN = 0.14;

export interface ShotResult {
  hitType: 'player' | 'enemy' | 'none';
  targetId: number;
  damage: number;
  killed: boolean;
}

/** Per-player fire cooldown tracker */
export class WeaponCooldown {
  private cooldown = 0;

  canFire(): boolean {
    return this.cooldown <= 0;
  }

  fire(): void {
    this.cooldown = RIFLE_COOLDOWN;
  }

  update(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
  }
}

/**
 * Process a hitscan shot from a player against all other players and enemies.
 */
export function processShot(
  shooter: ServerPlayer,
  players: ServerPlayer[],
  enemies: ServerEnemy[],
): ShotResult {
  const dir = lookDirection(shooter.yaw, shooter.pitch);
  const ray: Ray3D = {
    ox: shooter.x,
    oy: shooter.y, // eye height
    oz: shooter.z,
    dx: dir.dx,
    dy: dir.dy,
    dz: dir.dz,
  };

  let closestDist = RIFLE_RANGE;
  let closestResult: ShotResult = { hitType: 'none', targetId: -1, damage: 0, killed: false };

  // Test against other players
  for (const p of players) {
    if (p.id === shooter.id || !p.alive) continue;
    const box: AABB3D = {
      minX: p.x - PLAYER_HITBOX_W / 2,
      maxX: p.x + PLAYER_HITBOX_W / 2,
      minY: p.y - PLAYER_HITBOX_H,  // feet
      maxY: p.y,                      // eye level = top
      minZ: p.z - PLAYER_HITBOX_W / 2,
      maxZ: p.z + PLAYER_HITBOX_W / 2,
    };
    const dist = rayVsAABB3D(ray, box, closestDist);
    if (dist !== null && dist < closestDist) {
      closestDist = dist;
      closestResult = { hitType: 'player', targetId: p.id, damage: RIFLE_DAMAGE, killed: false };
    }
  }

  // Test against enemies
  for (const e of enemies) {
    if (!e.alive) continue;
    const scale = e.type === 'rusher' ? 0.6 : e.type === 'tank' ? 1.5 : e.type === 'patrol' ? 0.85 : 1.0;
    const r = ENEMY_BASE_RADIUS * scale * 0.9; // hitbox radius
    const h = ENEMY_BASE_HEIGHT * scale;
    const box: AABB3D = {
      minX: e.x - r,
      maxX: e.x + r,
      minY: 0,
      maxY: h,
      minZ: e.z - r,
      maxZ: e.z + r,
    };
    const dist = rayVsAABB3D(ray, box, closestDist);
    if (dist !== null && dist < closestDist) {
      closestDist = dist;
      closestResult = { hitType: 'enemy', targetId: e.id, damage: RIFLE_DAMAGE, killed: false };
    }
  }

  return closestResult;
}
```

- [ ] **Step 4: Create src/server/Pickup.ts**

```typescript
export interface ServerPickup {
  id: number;
  x: number;
  z: number;
  kind: 'health' | 'ammo';
  active: boolean;
  respawnTimer: number; // seconds until respawn (-1 if active)
}

const PICKUP_RESPAWN_TIME = 30;
const PICKUP_INTERACT_RANGE = 2.0;
const HEALTH_AMOUNT = 25;
const AMMO_AMOUNT = 15;

export function createPickups(
  corridorCells: Array<{ x: number; z: number }>,
): ServerPickup[] {
  const pickups: ServerPickup[] = [];
  // Place 3 health + 3 ammo at spaced intervals
  const step = Math.max(1, Math.floor(corridorCells.length / 6));
  for (let i = 0; i < 6 && i * step < corridorCells.length; i++) {
    const cell = corridorCells[i * step]!;
    pickups.push({
      id: i,
      x: cell.x,
      z: cell.z,
      kind: i < 3 ? 'health' : 'ammo',
      active: true,
      respawnTimer: -1,
    });
  }
  return pickups;
}

export function updatePickups(pickups: ServerPickup[], dt: number): ServerPickup[] {
  const respawned: ServerPickup[] = [];
  for (const p of pickups) {
    if (!p.active && p.respawnTimer > 0) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) {
        p.active = true;
        p.respawnTimer = -1;
        respawned.push(p);
      }
    }
  }
  return respawned;
}

export function tryClaimPickup(
  pickups: ServerPickup[],
  playerX: number,
  playerZ: number,
): ServerPickup | null {
  for (const p of pickups) {
    if (!p.active) continue;
    const dx = playerX - p.x;
    const dz = playerZ - p.z;
    if (dx * dx + dz * dz < PICKUP_INTERACT_RANGE * PICKUP_INTERACT_RANGE) {
      p.active = false;
      p.respawnTimer = PICKUP_RESPAWN_TIME;
      return p;
    }
  }
  return null;
}

export { HEALTH_AMOUNT, AMMO_AMOUNT };
```

- [ ] **Step 5: Implement full src/server/GameServer.ts**

Replace the stub with the full implementation:

```typescript
import type { WebSocket } from 'ws';
import { Lobby, type LobbyPlayer } from './Lobby';
import { ServerPlayer } from './ServerPlayer';
import { ServerEnemy, type ServerEnemyType } from './ServerEnemy';
import { processShot, WeaponCooldown } from './ServerWeapon';
import { createPickups, updatePickups, tryClaimPickup, HEALTH_AMOUNT, AMMO_AMOUNT, type ServerPickup } from './Pickup';
import { generateMaze, findCorridorCells, cellToWorld, createRNG, type RNG } from '../shared/maze';
import { resolveCircleVsAABBs, type AABB2D } from '../shared/collision';
import type {
  ClientMessage,
  InputMessage,
  MatchConfig,
  SnapshotMessage,
  HitMessage,
  KillMessage,
  RespawnMessage,
  GameStartMessage,
  GameOverMessage,
  PickupTakenMessage,
  PickupSpawnedMessage,
} from '../shared/protocol';

const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;
const DT = 1 / TICK_RATE;

type ServerState = 'lobby' | 'playing' | 'result';

export class GameServer {
  private lobby = new Lobby();
  private state: ServerState = 'lobby';

  // ─── Game state ───
  private players: Map<number, ServerPlayer> = new Map();
  private enemies: ServerEnemy[] = [];
  private pickups: ServerPickup[] = [];
  private walls: AABB2D[] = [];
  private weapons: Map<number, WeaponCooldown> = new Map();
  private config: MatchConfig = { killTarget: 20, timeLimit: 600, respawnDelay: 3 };
  private tick = 0;
  private elapsedTime = 0;
  private mazeSeed = 0;
  private rng: RNG = Math.random;
  private corridorCells: Array<{ x: number; z: number }> = [];
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  // ─── Connection mapping ───
  private wsToId: Map<WebSocket, number> = new Map();

  constructor() {
    this.lobby.onStart((lobbyPlayers, settings) => {
      this.startGame(lobbyPlayers, settings);
    });
  }

  onConnection(ws: WebSocket): void {
    ws.on('message', (data: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        return;
      }
      this.handleMessage(ws, msg);
    });

    ws.on('close', () => {
      const id = this.wsToId.get(ws);
      if (id === undefined) return;
      this.wsToId.delete(ws);

      if (this.state === 'lobby') {
        this.lobby.removePlayer(id);
      } else if (this.state === 'playing') {
        this.players.delete(id);
        this.weapons.delete(id);
        // If no players left, reset to lobby
        if (this.players.size === 0) {
          this.stopGame();
        }
      }
    });
  }

  private handleMessage(ws: WebSocket, msg: ClientMessage): void {
    if (msg.type === 'join') {
      const player = this.lobby.addPlayer(ws, msg.name);
      this.wsToId.set(ws, player.id);
      return;
    }

    const id = this.wsToId.get(ws);
    if (id === undefined) return;

    if (this.state === 'lobby') {
      this.lobby.handleMessage(id, msg);
    } else if (this.state === 'playing' && msg.type === 'input') {
      const player = this.players.get(id);
      if (player) {
        player.inputQueue.push(msg as InputMessage);
      }
    }
  }

  private startGame(lobbyPlayers: LobbyPlayer[], settings: MatchConfig): void {
    this.state = 'playing';
    this.config = settings;
    this.tick = 0;
    this.elapsedTime = 0;
    this.mazeSeed = Date.now();
    this.rng = createRNG(this.mazeSeed);

    // Generate maze (floor 1)
    const maze = generateMaze(1, this.mazeSeed);

    // Build wall list (same math as Level.ts but without Three.js)
    this.walls = this.buildWalls(maze.rows, maze.cols, maze.grid);

    // Corridor cells for spawn points
    const cells = findCorridorCells(maze.grid, maze.rows, maze.cols);
    this.corridorCells = cells.map(c => cellToWorld(c.row, c.col, maze.rows, maze.cols));

    // Shuffle corridor cells with seeded RNG for determinism
    for (let i = this.corridorCells.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.corridorCells[i], this.corridorCells[j]] = [this.corridorCells[j]!, this.corridorCells[i]!];
    }

    // Create players
    this.players.clear();
    this.weapons.clear();
    const spawnCell = cellToWorld(0, 0, maze.rows, maze.cols);

    for (let i = 0; i < lobbyPlayers.length; i++) {
      const lp = lobbyPlayers[i]!;
      const sp = new ServerPlayer(lp.id, lp.name);
      // Spread players near spawn
      const spawnOffset = i * 2;
      sp.teleportTo(
        spawnCell.x + (i % 2 === 0 ? spawnOffset : -spawnOffset),
        spawnCell.z + Math.floor(i / 2) * 2,
      );
      this.players.set(sp.id, sp);
      this.weapons.set(sp.id, new WeaponCooldown());
    }

    // Create enemies
    this.enemies = [];
    const enemyCount = 4 + lobbyPlayers.length;
    const enemyTypes: ServerEnemyType[] = ['standard', 'rusher', 'tank', 'patrol'];
    const enemySpawns: Array<{ id: number; x: number; z: number; enemyType: string }> = [];

    for (let i = 0; i < enemyCount && i < this.corridorCells.length; i++) {
      const cell = this.corridorCells[i]!;
      const type = enemyTypes[i % enemyTypes.length]!;
      const enemy = new ServerEnemy(i, type, cell.x, cell.z);
      this.enemies.push(enemy);
      enemySpawns.push({ id: i, x: cell.x, z: cell.z, enemyType: type });
    }

    // Create pickups
    const pickupCells = this.corridorCells.slice(enemyCount);
    this.pickups = createPickups(pickupCells);

    // Broadcast game_start
    const startMsg: GameStartMessage = {
      type: 'game_start',
      mazeSeed: this.mazeSeed,
      floor: 1,
      enemySpawns,
      pickups: this.pickups.map(p => ({ id: p.id, x: p.x, z: p.z, kind: p.kind, active: p.active })),
    };
    this.broadcast(startMsg);

    // Start tick loop
    this.tickInterval = setInterval(() => this.gameTick(), TICK_MS);
  }

  private gameTick(): void {
    this.tick++;
    this.elapsedTime += DT;
    const timeRemaining = this.config.timeLimit - this.elapsedTime;

    const playerArr = Array.from(this.players.values());

    // 1. Process inputs + movement
    for (const p of playerArr) {
      p.processInputs(DT, this.walls);
      p.updateTimers(DT);
    }

    // 2. Process shots
    for (const p of playerArr) {
      if (!p.pendingFire || !p.alive) continue;
      const wc = this.weapons.get(p.id);
      if (!wc || !wc.canFire() || p.ammo <= 0) continue;

      wc.fire();
      p.ammo--;

      const result = processShot(p, playerArr, this.enemies);
      if (result.hitType === 'player') {
        const target = this.players.get(result.targetId);
        if (target) {
          const killed = target.takeDamage(result.damage);
          result.killed = killed;
          const hitMsg: HitMessage = {
            type: 'hit',
            attackerId: p.id,
            targetId: target.id,
            targetType: 'player',
            damage: result.damage,
            killed,
          };
          this.broadcast(hitMsg);
          if (killed) {
            p.kills++;
            target.respawnTimer = this.config.respawnDelay;
            const killMsg: KillMessage = {
              type: 'kill',
              killerId: p.id,
              killerName: p.name,
              victimId: target.id,
              victimName: target.name,
              weapon: 'rifle',
            };
            this.broadcast(killMsg);
          }
        }
      } else if (result.hitType === 'enemy') {
        const enemy = this.enemies.find(e => e.id === result.targetId);
        if (enemy) {
          const killed = enemy.takeDamage(result.damage);
          const hitMsg: HitMessage = {
            type: 'hit',
            attackerId: p.id,
            targetId: enemy.id,
            targetType: 'enemy',
            damage: result.damage,
            killed,
          };
          this.broadcast(hitMsg);
        }
      }
    }

    // 3. Update weapon cooldowns
    for (const wc of this.weapons.values()) {
      wc.update(DT);
    }

    // 4. Update enemies
    for (const e of this.enemies) {
      const result = e.update(DT, playerArr, this.walls, this.rng);
      if (result.shotPlayerId >= 0) {
        const target = this.players.get(result.shotPlayerId);
        if (target) {
          const killed = target.takeDamage(result.shotDamage);
          const hitMsg: HitMessage = {
            type: 'hit', attackerId: -1, targetId: target.id,
            targetType: 'player', damage: result.shotDamage, killed,
          };
          this.broadcast(hitMsg);
          if (killed) {
            target.respawnTimer = this.config.respawnDelay;
          }
        }
      }
      if (result.contactPlayerId >= 0) {
        const target = this.players.get(result.contactPlayerId);
        if (target) {
          const killed = target.takeDamage(result.contactDamage);
          const hitMsg: HitMessage = {
            type: 'hit', attackerId: -1, targetId: target.id,
            targetType: 'player', damage: result.contactDamage, killed,
          };
          this.broadcast(hitMsg);
          if (killed) {
            target.respawnTimer = this.config.respawnDelay;
          }
        }
      }
    }

    // 5. Process pickups (interact)
    for (const p of playerArr) {
      if (!p.alive || !p.pendingInteract) continue;
      const claimed = tryClaimPickup(this.pickups, p.x, p.z);
      if (claimed) {
        if (claimed.kind === 'health') {
          p.hp = Math.min(100, p.hp + HEALTH_AMOUNT);
        } else {
          p.ammo = Math.min(30, p.ammo + AMMO_AMOUNT);
        }
        const msg: PickupTakenMessage = {
          type: 'pickup_taken',
          pickupId: claimed.id,
          playerId: p.id,
        };
        this.broadcast(msg);
      }
    }

    // 6. Update pickup respawns
    const respawned = updatePickups(this.pickups, DT);
    for (const p of respawned) {
      const msg: PickupSpawnedMessage = {
        type: 'pickup_spawned',
        pickupId: p.id,
        x: p.x,
        z: p.z,
        kind: p.kind,
      };
      this.broadcast(msg);
    }

    // 7. Check respawns
    for (const p of playerArr) {
      if (!p.alive && p.respawnTimer > 0) {
        p.respawnTimer -= DT;
        if (p.respawnTimer <= 0) {
          const spawn = this.findRespawnPoint(playerArr);
          p.respawnAt(spawn.x, spawn.z);
          const msg: RespawnMessage = {
            type: 'respawn',
            playerId: p.id,
            x: spawn.x,
            z: spawn.z,
          };
          this.broadcast(msg);
        }
      }
    }

    // 8. Check win condition
    for (const p of playerArr) {
      if (p.kills >= this.config.killTarget) {
        this.endGame('kill_target', p);
        return;
      }
    }
    if (timeRemaining <= 0) {
      let winner = playerArr[0]!;
      for (const p of playerArr) {
        if (p.kills > winner.kills) winner = p;
      }
      this.endGame('time_up', winner);
      return;
    }

    // 9. Broadcast snapshot (per-client lastInputSeq)
    for (const p of playerArr) {
      const snap: SnapshotMessage = {
        type: 'snapshot',
        tick: this.tick,
        timeRemaining: Math.max(0, timeRemaining),
        lastInputSeq: p.lastInputSeq,
        players: playerArr.map(pl => ({
          id: pl.id, x: pl.x, z: pl.z, y: pl.y,
          yaw: pl.yaw, pitch: pl.pitch,
          hp: pl.hp, ammo: pl.ammo, alive: pl.alive,
          kills: pl.kills, deaths: pl.deaths,
          name: pl.name, invincible: pl.invincible,
        })),
        enemies: this.enemies.map(e => ({
          id: e.id, x: e.x, z: e.z,
          hp: e.hp, state: e.state, yaw: e.yaw,
          targetPlayerId: e.targetPlayerId,
        })),
        pickups: this.pickups.map(pk => ({
          id: pk.id, x: pk.x, z: pk.z, kind: pk.kind, active: pk.active,
        })),
      };
      this.sendToPlayer(p.id, snap);
    }
  }

  private findRespawnPoint(players: ServerPlayer[]): { x: number; z: number } {
    const alive = players.filter(p => p.alive);
    const candidates = this.corridorCells.slice(0, Math.min(5, this.corridorCells.length));

    let bestPoint = candidates[0]!;
    let bestMinDist = -1;

    for (const c of candidates) {
      let minDist = Infinity;
      for (const p of alive) {
        const d = Math.hypot(p.x - c.x, p.z - c.z);
        if (d < minDist) minDist = d;
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestPoint = c;
      }
    }

    return bestPoint;
  }

  private endGame(reason: 'kill_target' | 'time_up', winner: ServerPlayer): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    const playerArr = Array.from(this.players.values());
    const scoreboard = playerArr
      .sort((a, b) => b.kills - a.kills)
      .map(p => ({ id: p.id, name: p.name, kills: p.kills, deaths: p.deaths }));

    const msg: GameOverMessage = {
      type: 'game_over',
      reason,
      winnerId: winner.id,
      winnerName: winner.name,
      scoreboard,
      duration: this.elapsedTime,
    };
    this.broadcast(msg);

    this.state = 'result';

    // Return to lobby after 5 seconds
    setTimeout(() => {
      this.state = 'lobby';
      this.lobby.reset();
    }, 5000);
  }

  private stopGame(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.state = 'lobby';
    this.lobby.reset();
  }

  /** Build 2D wall AABBs from maze grid (mirrors Level.ts buildFromMaze logic) */
  private buildWalls(rows: number, cols: number, grid: number[][]): AABB2D[] {
    const cs = 6; // cell size
    const wt = 0.5; // wall thickness
    const totalW = cols * cs;
    const totalD = rows * cs;
    const halfW = totalW / 2;
    const halfD = totalD / 2;
    const walls: AABB2D[] = [];

    const DIR_N = 1, DIR_S = 2, DIR_E = 4, DIR_W = 8;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const open = grid[r]![c]!;
        const cx = -halfW + c * cs;
        const cz = -halfD + r * cs;

        if (!(open & DIR_N)) {
          walls.push({ minX: cx, maxX: cx + cs, minZ: cz - wt / 2, maxZ: cz + wt / 2 });
        }
        if (!(open & DIR_W)) {
          walls.push({ minX: cx - wt / 2, maxX: cx + wt / 2, minZ: cz, maxZ: cz + cs });
        }
      }
    }

    // East boundary
    for (let r = 0; r < rows; r++) {
      const cx = -halfW + cols * cs;
      const cz = -halfD + r * cs;
      walls.push({ minX: cx - wt / 2, maxX: cx + wt / 2, minZ: cz, maxZ: cz + cs });
    }
    // South boundary
    for (let c = 0; c < cols; c++) {
      const cx = -halfW + c * cs;
      const cz = -halfD + rows * cs;
      walls.push({ minX: cx, maxX: cx + cs, minZ: cz - wt / 2, maxZ: cz + wt / 2 });
    }

    return walls;
  }

  private broadcast(msg: object): void {
    const data = JSON.stringify(msg);
    for (const [ws, id] of this.wsToId) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }

  private sendToPlayer(playerId: number, msg: object): void {
    const data = JSON.stringify(msg);
    for (const [ws, id] of this.wsToId) {
      if (id === playerId && ws.readyState === ws.OPEN) {
        ws.send(data);
        return;
      }
    }
  }
}
```

- [ ] **Step 6: Verify server compiles**

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/server/
git commit -m "feat: implement full authoritative game server"
```

---

## Task 8: Client — NetClient (WebSocket Communication Layer)

**Files:**
- Create: `src/client/NetClient.ts`

- [ ] **Step 1: Create src/client/NetClient.ts**

```typescript
import type {
  ClientMessage,
  ServerMessage,
  SnapshotMessage,
  GameStartMessage,
  LobbyStateMessage,
  WelcomeMessage,
  HitMessage,
  KillMessage,
  RespawnMessage,
  GameOverMessage,
  PickupTakenMessage,
  PickupSpawnedMessage,
  InputMessage,
  KEY,
} from '../shared/protocol';

export type NetEventMap = {
  welcome: WelcomeMessage;
  lobby_state: LobbyStateMessage;
  game_start: GameStartMessage;
  snapshot: SnapshotMessage;
  hit: HitMessage;
  kill: KillMessage;
  respawn: RespawnMessage;
  game_over: GameOverMessage;
  player_joined: { id: number; name: string };
  player_left: { id: number; name: string };
  pickup_taken: PickupTakenMessage;
  pickup_spawned: PickupSpawnedMessage;
  disconnected: undefined;
};

type Listener<T> = (data: T) => void;

export class NetClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Array<Listener<unknown>>> = new Map();

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => resolve();

      this.ws.onerror = () => reject(new Error('WebSocket connection failed'));

      this.ws.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data as string) as ServerMessage;
        } catch {
          return;
        }
        this.emit(msg.type, msg);
      };

      this.ws.onclose = () => {
        this.emit('disconnected', undefined);
      };
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on<K extends keyof NetEventMap>(event: K, listener: Listener<NetEventMap[K]>): void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener as Listener<unknown>);
    this.listeners.set(event, list);
  }

  off<K extends keyof NetEventMap>(event: K, listener: Listener<NetEventMap[K]>): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(listener as Listener<unknown>);
    if (idx >= 0) list.splice(idx, 1);
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private emit(event: string, data: unknown): void {
    const list = this.listeners.get(event);
    if (list) {
      for (const cb of list) cb(data);
    }
  }
}
```

- [ ] **Step 2: Verify**

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/client/NetClient.ts
git commit -m "feat: add client WebSocket communication layer"
```

---

## Task 9: Client — RemotePlayer Model and Interpolation

**Files:**
- Create: `src/client/Interpolation.ts`
- Create: `src/client/RemotePlayer.ts`

- [ ] **Step 1: Create src/client/Interpolation.ts**

```typescript
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
```

- [ ] **Step 2: Create src/client/RemotePlayer.ts**

```typescript
import * as THREE from 'three';
import type { PlayerState } from '../shared/protocol';
import { InterpolationBuffer, lerp, lerpAngle } from './Interpolation';

/**
 * Third-person model for other players visible in the scene.
 * Procedural box geometry matching the game's art style.
 */
export class RemotePlayer {
  readonly group = new THREE.Group();
  private body: THREE.Mesh;
  private head: THREE.Mesh;
  private gun: THREE.Mesh;
  private bodyMat: THREE.MeshStandardMaterial;
  private headMat: THREE.MeshStandardMaterial;
  private nameSprite: THREE.Sprite;

  private interp = new InterpolationBuffer<PlayerState>();
  alive = true;
  id: number;

  constructor(id: number, name: string, scene: THREE.Scene) {
    this.id = id;

    // Body
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x4488cc, roughness: 0.4 });
    const bodyGeo = new THREE.BoxGeometry(0.6, 1.5, 0.4);
    this.body = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.body.position.y = 0.75;
    this.body.castShadow = true;
    this.group.add(this.body);

    // Wireframe
    const edges = new THREE.EdgesGeometry(bodyGeo);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x222222 });
    const wire = new THREE.LineSegments(edges, wireMat);
    wire.position.copy(this.body.position);
    this.group.add(wire);

    // Head
    this.headMat = new THREE.MeshStandardMaterial({ color: 0x66aadd, roughness: 0.3 });
    const headGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    this.head = new THREE.Mesh(headGeo, this.headMat);
    this.head.position.y = 1.675;
    this.head.castShadow = true;
    this.group.add(this.head);

    // Gun
    const gunGeo = new THREE.BoxGeometry(0.08, 0.08, 0.5);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    this.gun = new THREE.Mesh(gunGeo, gunMat);
    this.gun.position.set(0.25, 1.2, -0.3);
    this.group.add(this.gun);

    // Name tag (sprite)
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    this.nameSprite = new THREE.Sprite(spriteMat);
    this.nameSprite.scale.set(2, 0.5, 1);
    this.nameSprite.position.y = 2.2;
    this.group.add(this.nameSprite);

    scene.add(this.group);
  }

  pushState(state: PlayerState): void {
    this.interp.push(state);
    this.alive = state.alive;

    // Invincibility glow
    if (state.invincible) {
      this.bodyMat.emissive.setHex(0x44aaff);
      this.bodyMat.emissiveIntensity = 0.5;
    } else {
      this.bodyMat.emissive.setHex(0x000000);
      this.bodyMat.emissiveIntensity = 0;
    }

    this.group.visible = state.alive;
  }

  update(dt: number): void {
    this.interp.advance(dt);
    const frame = this.interp.get();
    if (!frame) return;

    const { prev, next, t } = frame;

    this.group.position.x = lerp(prev.x, next.x, t);
    this.group.position.z = lerp(prev.z, next.z, t);
    // Y: feet on ground, interpolate jump
    this.group.position.y = lerp(prev.y - 1.75, next.y - 1.75, t);

    this.group.rotation.y = lerpAngle(prev.yaw, next.yaw, t);
    this.head.rotation.x = lerp(prev.pitch, next.pitch, t);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.body.geometry.dispose();
    this.bodyMat.dispose();
    this.head.geometry.dispose();
    this.headMat.dispose();
    this.gun.geometry.dispose();
    (this.gun.material as THREE.Material).dispose();
    (this.nameSprite.material as THREE.SpriteMaterial).map?.dispose();
    (this.nameSprite.material as THREE.Material).dispose();
  }
}
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/client/Interpolation.ts src/client/RemotePlayer.ts
git commit -m "feat: add remote player model with snapshot interpolation"
```

---

## Task 10: Client — Multiplayer HUD and Lobby UI

**Files:**
- Create: `src/client/MultiplayerHud.ts`
- Create: `src/client/LobbyUI.ts`
- Modify: `index.html`

- [ ] **Step 1: Add multiplayer UI elements to index.html**

Insert the following blocks before the `<script>` tag at the bottom of `index.html`:

```html
    <!-- Mode selection overlay (replaces intro for MP) -->
    <div id="mode-select" style="display:none;">
      <div class="panel">
        <h1>末日 <span class="sub">· 迷宫</span></h1>
        <button id="btn-singleplayer">单人游戏</button>
        <button id="btn-create-room">创建房间</button>
        <div class="join-row">
          <input id="join-ip" type="text" placeholder="主机 IP (如 192.168.1.100)" />
          <button id="btn-join-room">加入房间</button>
        </div>
        <div class="join-row">
          <input id="player-name" type="text" placeholder="你的昵称" value="Player" />
        </div>
      </div>
    </div>

    <!-- Lobby overlay -->
    <div id="lobby" style="display:none;">
      <div class="panel">
        <h2 id="lobby-title">房间</h2>
        <div id="lobby-players"></div>
        <div id="lobby-settings">
          <label>击杀目标: <select id="lobby-kill-target">
            <option value="10">10</option>
            <option value="20" selected>20</option>
            <option value="30">30</option>
          </select></label>
          <label>时间限制: <select id="lobby-time-limit">
            <option value="300">5 分钟</option>
            <option value="600" selected>10 分钟</option>
            <option value="900">15 分钟</option>
          </select></label>
        </div>
        <button id="lobby-ready">就绪</button>
        <button id="lobby-start" style="display:none;">开始游戏</button>
      </div>
    </div>

    <!-- Multiplayer HUD -->
    <div id="mp-hud" style="display:none;">
      <div id="kill-feed"></div>
      <div id="match-timer"></div>
      <div id="scoreboard" style="display:none;"></div>
      <div id="respawn-countdown" style="display:none;"></div>
    </div>

    <!-- Game over (multiplayer) -->
    <div id="mp-gameover" style="display:none;">
      <div class="panel">
        <h1 id="mp-winner"></h1>
        <div id="mp-scoreboard-final"></div>
        <button id="mp-back-menu">返回菜单</button>
      </div>
    </div>
```

- [ ] **Step 2: Create src/client/MultiplayerHud.ts**

```typescript
import type { KillMessage, PlayerState } from '../shared/protocol';

export class MultiplayerHud {
  private killFeed: HTMLElement;
  private matchTimer: HTMLElement;
  private scoreboard: HTMLElement;
  private respawnCountdown: HTMLElement;
  private mpHud: HTMLElement;

  constructor() {
    this.mpHud = document.getElementById('mp-hud')!;
    this.killFeed = document.getElementById('kill-feed')!;
    this.matchTimer = document.getElementById('match-timer')!;
    this.scoreboard = document.getElementById('scoreboard')!;
    this.respawnCountdown = document.getElementById('respawn-countdown')!;
  }

  show(): void {
    this.mpHud.style.display = 'block';
  }

  hide(): void {
    this.mpHud.style.display = 'none';
  }

  addKillFeedEntry(msg: KillMessage): void {
    const entry = document.createElement('div');
    entry.className = 'kill-entry';
    entry.textContent = `${msg.killerName} 击杀了 ${msg.victimName}`;
    this.killFeed.appendChild(entry);

    // Remove after 5 seconds
    setTimeout(() => entry.remove(), 5000);

    // Keep max 5 entries
    while (this.killFeed.children.length > 5) {
      this.killFeed.firstChild?.remove();
    }
  }

  setTimeRemaining(seconds: number): void {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    this.matchTimer.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
  }

  showScoreboard(players: PlayerState[]): void {
    const sorted = [...players].sort((a, b) => b.kills - a.kills);
    this.scoreboard.innerHTML = sorted.map(p =>
      `<div class="sb-row"><span>${p.name}</span><span>${p.kills} / ${p.deaths}</span></div>`
    ).join('');
    this.scoreboard.style.display = 'block';
  }

  hideScoreboard(): void {
    this.scoreboard.style.display = 'none';
  }

  showRespawnCountdown(seconds: number): void {
    this.respawnCountdown.style.display = 'flex';
    this.respawnCountdown.textContent = `复活中... ${Math.ceil(seconds)}`;
  }

  hideRespawnCountdown(): void {
    this.respawnCountdown.style.display = 'none';
  }
}
```

- [ ] **Step 3: Create src/client/LobbyUI.ts**

```typescript
import type { NetClient } from './NetClient';
import type { LobbyStateMessage } from '../shared/protocol';

export class LobbyUI {
  private lobbyEl: HTMLElement;
  private playersEl: HTMLElement;
  private readyBtn: HTMLButtonElement;
  private startBtn: HTMLButtonElement;
  private killTargetEl: HTMLSelectElement;
  private timeLimitEl: HTMLSelectElement;
  private titleEl: HTMLElement;

  private isHost = false;
  private myId = -1;

  constructor(private net: NetClient) {
    this.lobbyEl = document.getElementById('lobby')!;
    this.playersEl = document.getElementById('lobby-players')!;
    this.readyBtn = document.getElementById('lobby-ready') as HTMLButtonElement;
    this.startBtn = document.getElementById('lobby-start') as HTMLButtonElement;
    this.killTargetEl = document.getElementById('lobby-kill-target') as HTMLSelectElement;
    this.timeLimitEl = document.getElementById('lobby-time-limit') as HTMLSelectElement;
    this.titleEl = document.getElementById('lobby-title')!;

    this.readyBtn.addEventListener('click', () => {
      this.net.send({ type: 'ready' });
    });

    this.startBtn.addEventListener('click', () => {
      this.net.send({ type: 'start_game' });
    });

    this.killTargetEl.addEventListener('change', () => {
      this.net.send({
        type: 'game_settings',
        killTarget: parseInt(this.killTargetEl.value),
        timeLimit: parseInt(this.timeLimitEl.value),
      });
    });

    this.timeLimitEl.addEventListener('change', () => {
      this.net.send({
        type: 'game_settings',
        killTarget: parseInt(this.killTargetEl.value),
        timeLimit: parseInt(this.timeLimitEl.value),
      });
    });
  }

  show(myId: number): void {
    this.myId = myId;
    this.lobbyEl.style.display = 'flex';
  }

  hide(): void {
    this.lobbyEl.style.display = 'none';
  }

  update(state: LobbyStateMessage): void {
    // Determine if I'm host
    const me = state.players.find(p => p.id === this.myId);
    this.isHost = me?.isHost ?? false;

    // Show/hide host controls
    this.startBtn.style.display = this.isHost ? 'inline-block' : 'none';
    this.killTargetEl.disabled = !this.isHost;
    this.timeLimitEl.disabled = !this.isHost;

    // Update settings
    this.killTargetEl.value = String(state.settings.killTarget);
    this.timeLimitEl.value = String(state.settings.timeLimit);

    // Render player list
    this.playersEl.innerHTML = state.players.map(p => {
      const hostBadge = p.isHost ? ' (主机)' : '';
      const readyBadge = p.ready ? ' ✓ 就绪' : ' ○ 未就绪';
      return `<div class="lobby-player">${p.name}${hostBadge}${readyBadge}</div>`;
    }).join('');

    this.titleEl.textContent = `房间 (${state.players.length}/8)`;
  }
}
```

- [ ] **Step 4: Verify**

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/MultiplayerHud.ts src/client/LobbyUI.ts index.html
git commit -m "feat: add multiplayer HUD, lobby UI, and HTML elements"
```

---

## Task 11: Client — Integrate Multiplayer into Game.ts and main.ts

This is the core integration task. We modify `Game.ts` to support a multiplayer mode and `main.ts` to add mode selection flow.

**Files:**
- Modify: `src/Game.ts`
- Modify: `src/main.ts`
- Modify: `src/Player.ts`

- [ ] **Step 1: Add accessors to Player.ts**

Add these methods to the `Player` class in `src/Player.ts`, right after the `getLookDir()` method:

```typescript
  getYaw(): number {
    return this.yaw;
  }

  getPitch(): number {
    return this.pitch;
  }
```

- [ ] **Step 2: Add multiplayer mode to Game.ts**

Add imports at the top of `src/Game.ts`:

```typescript
import { NetClient } from './client/NetClient';
import { RemotePlayer } from './client/RemotePlayer';
import { MultiplayerHud } from './client/MultiplayerHud';
import { LobbyUI } from './client/LobbyUI';
import { lerp, lerpAngle } from './client/Interpolation';
import { generateMaze as generateMazeSeeded } from './shared/maze';
import { KEY, type SnapshotMessage, type PlayerState, type EnemyState } from './shared/protocol';
```

Add multiplayer fields to the `Game` class after the existing fields:

```typescript
  // ─── Multiplayer ───
  private mode: 'singleplayer' | 'multiplayer' = 'singleplayer';
  private net: NetClient | null = null;
  private myId = -1;
  private remotePlayers: Map<number, RemotePlayer> = new Map();
  private mpHud: MultiplayerHud | null = null;
  private lobbyUI: LobbyUI | null = null;
  private inputSeq = 0;
  private lastSnapshot: SnapshotMessage | null = null;
  private respawnTimer = -1;
```

Add the `startMultiplayer` method:

```typescript
  async startMultiplayer(wsUrl: string, playerName: string): Promise<void> {
    this.mode = 'multiplayer';
    this.net = new NetClient();
    this.mpHud = new MultiplayerHud();
    this.lobbyUI = new LobbyUI(this.net);

    await this.net.connect(wsUrl);
    this.net.send({ type: 'join', name: playerName });

    this.net.on('welcome', (msg) => {
      this.myId = msg.playerId;
      this.lobbyUI!.show(this.myId);
    });

    this.net.on('lobby_state', (msg) => {
      this.lobbyUI!.update(msg);
    });

    this.net.on('game_start', (msg) => {
      this.lobbyUI!.hide();
      // Generate maze from seed
      const mazeData = generateMazeSeeded(msg.floor, msg.mazeSeed);
      if (this.level) this.level.dispose(this.engine.scene);
      this.level = new Level(this.engine.scene, mazeData);
      this.mazeData = mazeData;

      if (!this.player) {
        this.player = new Player(this.engine.camera, this.input, this.level);
        this.weapon = new Weapon(this.player, this.weaponModel, this.sfx);
      } else {
        this.player.setLevel(this.level);
      }

      // Spawn enemies (visual only — AI runs on server)
      for (const e of this.corridorEnemies) e.dispose(this.engine.scene);
      this.corridorEnemies = [];
      for (const es of msg.enemySpawns) {
        const spawn = new THREE.Vector3(es.x, 0, es.z);
        this.corridorEnemies.push(new Enemy(spawn, this.engine.scene, es.enemyType as import('./Enemy').EnemyType, 1));
      }

      this.state = 'exploring';
      this.mpHud!.show();
      this.engine.start();
      this.input.requestPointerLock();
    });

    this.net.on('snapshot', (msg) => {
      this.lastSnapshot = msg;
    });

    this.net.on('hit', (msg) => {
      if (msg.targetType === 'player' && msg.targetId === this.myId) {
        this.sfx.damage();
        this.hud.flashDamage();
      }
      if (msg.attackerId === this.myId && msg.targetType === 'player') {
        this.hud.flashHitMarker();
        this.sfx.hit();
      }
      if (msg.attackerId === this.myId && msg.targetType === 'enemy') {
        this.hud.flashHitMarker();
        this.sfx.hit();
      }
    });

    this.net.on('kill', (msg) => {
      this.mpHud!.addKillFeedEntry(msg);
      if (msg.victimId === this.myId) {
        this.respawnTimer = 3;
        this.player.alive = false;
      }
      if (msg.killerId === this.myId) {
        this.sfx.enemyDie();
      }
    });

    this.net.on('respawn', (msg) => {
      if (msg.playerId === this.myId) {
        this.player.alive = true;
        this.player.hp = 100;
        this.player.ammo = 30;
        this.player.teleportTo(msg.x, msg.z);
        this.respawnTimer = -1;
        this.mpHud!.hideRespawnCountdown();
      }
    });

    this.net.on('game_over', (msg) => {
      const el = document.getElementById('mp-gameover')!;
      const winner = document.getElementById('mp-winner')!;
      const sb = document.getElementById('mp-scoreboard-final')!;
      winner.textContent = `🏆 ${msg.winnerName} 获胜！`;
      sb.innerHTML = msg.scoreboard.map((p, i) =>
        `<div>#${i + 1} ${p.name} — ${p.kills} 击杀 / ${p.deaths} 死亡</div>`
      ).join('');
      el.style.display = 'flex';
      this.input.exitPointerLock();
    });

    this.net.on('disconnected', () => {
      alert('与主机断开连接');
      window.location.reload();
    });
  }
```

Modify the existing `update` method to branch on mode. Replace the current `update` method:

```typescript
  private update(dt: number): void {
    if (this.mode === 'singleplayer') {
      this.updateSingleplayer(dt);
    } else {
      this.updateMultiplayer(dt);
    }
  }

  private updateSingleplayer(dt: number): void {
    // ─── Original update logic, unchanged ───
    if (this.state === 'dead') {
      this.weaponModel.update(dt);
      return;
    }

    this.elapsedTime += dt;
    this.player.update(dt);
    this.weapon.update(dt);
    this.weaponModel.update(dt);

    if (this.state === 'exploring') {
      this.updateExploring(dt);
    } else if (this.state === 'in_room') {
      this.updateInRoom(dt);
    }

    this.hud.setAmmo(this.player.ammo);
    this.hud.setHp(this.player.hp);
  }

  private updateMultiplayer(dt: number): void {
    if (!this.net || !this.player) return;

    // 1. Local player update (prediction)
    this.player.update(dt);
    this.weaponModel.update(dt);

    // 2. Send input to server
    this.inputSeq++;
    const keys =
      (this.input.isDown('w') ? KEY.W : 0) |
      (this.input.isDown('a') ? KEY.A : 0) |
      (this.input.isDown('s') ? KEY.S : 0) |
      (this.input.isDown('d') ? KEY.D : 0) |
      (this.input.isDown(' ') ? KEY.SPACE : 0) |
      (this.input.isDown('shift') ? KEY.SHIFT : 0);

    this.net.send({
      type: 'input',
      seq: this.inputSeq,
      keys,
      yaw: this.player.getYaw(),
      pitch: this.player.getPitch(),
      fire: this.input.isMouseDown(),
      interact: false, // interact handled by E key event
    });

    // 3. Process latest snapshot
    if (this.lastSnapshot) {
      const snap = this.lastSnapshot;
      this.lastSnapshot = null;

      // Update local player from server state
      const me = snap.players.find(p => p.id === this.myId);
      if (me) {
        // Simple reconciliation: snap if too far
        const dx = me.x - this.player.position.x;
        const dz = me.z - this.player.position.z;
        if (dx * dx + dz * dz > 0.5 * 0.5) {
          this.player.position.x = me.x;
          this.player.position.z = me.z;
        }
        this.player.hp = me.hp;
        this.player.ammo = me.ammo;
        this.player.alive = me.alive;
        this.hud.setHp(me.hp);
        this.hud.setAmmo(me.ammo);
      }

      // Update remote players
      for (const ps of snap.players) {
        if (ps.id === this.myId) continue;
        let rp = this.remotePlayers.get(ps.id);
        if (!rp) {
          rp = new RemotePlayer(ps.id, ps.name, this.engine.scene);
          this.remotePlayers.set(ps.id, rp);
        }
        rp.pushState(ps);
      }

      // Remove disconnected remote players
      for (const [id, rp] of this.remotePlayers) {
        if (!snap.players.find(p => p.id === id)) {
          rp.dispose(this.engine.scene);
          this.remotePlayers.delete(id);
        }
      }

      // Update enemies from snapshot (position only, no local AI)
      for (const es of snap.enemies) {
        const enemy = this.corridorEnemies.find(e => e.type === es.id.toString() || true);
        // Match by index (enemies ordered by ID)
        if (es.id < this.corridorEnemies.length) {
          const e = this.corridorEnemies[es.id]!;
          e.position.x = es.x;
          e.position.z = es.z;
          e.group.position.set(es.x, 0, es.z);
          e.group.rotation.y = es.yaw;
          if (es.state === 'dead' && e.alive) {
            e.alive = false;
            e.state = 'dead';
          } else if (es.state !== 'dead' && !e.alive) {
            // Enemy respawned — recreate would be complex, just re-show
            e.alive = true;
            e.state = es.state;
            e.hp = es.hp;
            e.group.rotation.x = 0;
            e.group.position.y = 0;
          }
        }
      }

      // Timer
      this.mpHud?.setTimeRemaining(snap.timeRemaining);
    }

    // 4. Interpolate remote players
    for (const rp of this.remotePlayers.values()) {
      rp.update(dt);
    }

    // 5. Respawn countdown
    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      this.mpHud?.showRespawnCountdown(this.respawnTimer);
    }

    // 6. Scoreboard (Tab key)
    if (this.input.isDown('tab')) {
      const allPlayers: PlayerState[] = [];
      const snap = this.lastSnapshot;
      // Use latest known state
      for (const rp of this.remotePlayers.values()) {
        const latest = (rp as unknown as { interp: { getLatest(): PlayerState | null } }).interp?.getLatest?.();
        if (latest) allPlayers.push(latest);
      }
      this.mpHud?.showScoreboard(allPlayers);
    } else {
      this.mpHud?.hideScoreboard();
    }

    // 7. Wall collision for local player
    if (this.level && this.player.alive) {
      const resolved = this.level.resolveCircleVsWalls(
        this.player.position.x,
        this.player.position.z,
        0.4,
      );
      this.player.position.x = resolved.x;
      this.player.position.z = resolved.z;
    }
  }
```

- [ ] **Step 3: Update main.ts for mode selection**

Replace the entire contents of `src/main.ts`:

```typescript
import './style.css';
import { Game } from './Game';

const container = document.getElementById('game')!;
const intro = document.getElementById('intro')!;
const overlay = document.getElementById('overlay')!;
const startBtn = document.getElementById('start') as HTMLButtonElement;
const introStartBtn = document.getElementById('intro-start') as HTMLButtonElement;
const modeSelect = document.getElementById('mode-select')!;

const game = new Game(container);

// ─── Intro → Mode Select ───
introStartBtn.addEventListener('click', () => {
  intro.style.display = 'none';
  modeSelect.style.display = 'flex';
});

// ─── Singleplayer ───
document.getElementById('btn-singleplayer')!.addEventListener('click', () => {
  modeSelect.style.display = 'none';
  overlay.style.display = 'flex';
});

startBtn.addEventListener('click', () => {
  game.sfx.unlock();
  overlay.style.display = 'none';
  game.start();
});

// ─── Create Room (host connects to localhost) ───
document.getElementById('btn-create-room')!.addEventListener('click', async () => {
  const name = (document.getElementById('player-name') as HTMLInputElement).value || 'Player';
  modeSelect.style.display = 'none';
  try {
    await game.startMultiplayer('ws://localhost:3001', name);
  } catch {
    alert('无法连接到服务器。请确保已运行 pnpm host');
    modeSelect.style.display = 'flex';
  }
});

// ─── Join Room ───
document.getElementById('btn-join-room')!.addEventListener('click', async () => {
  const ip = (document.getElementById('join-ip') as HTMLInputElement).value.trim();
  const name = (document.getElementById('player-name') as HTMLInputElement).value || 'Player';
  if (!ip) {
    alert('请输入主机 IP');
    return;
  }
  modeSelect.style.display = 'none';
  try {
    await game.startMultiplayer(`ws://${ip}:3001`, name);
  } catch {
    alert(`无法连接到 ${ip}:3001`);
    modeSelect.style.display = 'flex';
  }
});

// ─── Back to menu (MP game over) ───
document.getElementById('mp-back-menu')!.addEventListener('click', () => {
  window.location.reload();
});

// ─── Pointer lock ───
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement == null) {
    const dead = (document.getElementById('gameover') as HTMLElement).style.display === 'flex';
    if (!dead) {
      overlay.style.display = 'flex';
      startBtn.textContent = '点击继续';
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

- [ ] **Step 4: Wire interact (E key) to network in multiplayer**

In `Game.ts`, modify the `bindActions` method. In the interact handler, add a multiplayer branch. Find the `this.input.onInteract.push(() => {` block and wrap the existing logic:

```typescript
    this.input.onInteract.push(() => {
      if (this.transitioning) return;
      if (this.mode === 'multiplayer') {
        // In multiplayer, interact is sent as part of next input tick
        // For pickups, we send a one-shot interact flag
        if (this.net) {
          this.inputSeq++;
          const keys =
            (this.input.isDown('w') ? KEY.W : 0) |
            (this.input.isDown('a') ? KEY.A : 0) |
            (this.input.isDown('s') ? KEY.S : 0) |
            (this.input.isDown('d') ? KEY.D : 0) |
            (this.input.isDown(' ') ? KEY.SPACE : 0) |
            (this.input.isDown('shift') ? KEY.SHIFT : 0);
          this.net.send({
            type: 'input',
            seq: this.inputSeq,
            keys,
            yaw: this.player.getYaw(),
            pitch: this.player.getPitch(),
            fire: false,
            interact: true,
          });
        }
        return;
      }
      if (this.state === 'exploring') {
        this.tryOpenDoor().catch((e) => console.error('tryOpenDoor error:', e));
      } else if (this.state === 'in_room') {
        this.tryRoomInteract().catch((e) => console.error('tryRoomInteract error:', e));
      }
    });
```

- [ ] **Step 5: Verify everything compiles**

```bash
pnpm typecheck
```

Expected: PASS (or minor type errors to fix)

- [ ] **Step 6: Build and test**

```bash
pnpm build
```

Expected: PASS — builds to `dist/`

- [ ] **Step 7: Commit**

```bash
git add src/Game.ts src/main.ts src/Player.ts
git commit -m "feat: integrate multiplayer mode into Game.ts and main.ts"
```

---

## Task 12: Add Multiplayer CSS Styles

**Files:**
- Modify: `src/style.css` (or wherever styles live)

- [ ] **Step 1: Find and update style file**

Find the CSS file:
```bash
ls src/*.css
```

Add these styles:

```css
/* ─── Mode Selection ─── */
#mode-select {
  position: fixed; inset: 0; display: flex;
  align-items: center; justify-content: center;
  background: rgba(0,0,0,0.85); z-index: 100;
}
#mode-select button {
  display: block; width: 100%; margin: 8px 0;
  padding: 12px 24px; font-size: 16px;
  cursor: pointer; border: 1px solid #555;
  background: #222; color: #fff;
}
#mode-select button:hover { background: #444; }
.join-row {
  display: flex; gap: 8px; margin: 8px 0;
}
.join-row input {
  flex: 1; padding: 10px; font-size: 14px;
  border: 1px solid #555; background: #111; color: #fff;
}

/* ─── Lobby ─── */
#lobby {
  position: fixed; inset: 0; display: flex;
  align-items: center; justify-content: center;
  background: rgba(0,0,0,0.85); z-index: 100;
}
.lobby-player {
  padding: 6px 0; border-bottom: 1px solid #333;
  font-size: 14px; color: #ccc;
}
#lobby-settings {
  margin: 12px 0; display: flex; gap: 16px;
}
#lobby-settings label { color: #aaa; font-size: 13px; }
#lobby-settings select {
  background: #222; color: #fff; border: 1px solid #555;
  padding: 4px 8px;
}

/* ─── Multiplayer HUD ─── */
#mp-hud { position: fixed; inset: 0; pointer-events: none; z-index: 50; }
#kill-feed {
  position: absolute; top: 10px; right: 10px;
  text-align: right; font-size: 13px;
}
.kill-entry {
  color: #ff6644; background: rgba(0,0,0,0.5);
  padding: 4px 10px; margin: 2px 0; border-radius: 3px;
  animation: fadeIn 0.2s;
}
#match-timer {
  position: absolute; top: 10px; left: 50%;
  transform: translateX(-50%);
  font-size: 20px; color: #fff;
  text-shadow: 0 0 4px rgba(0,0,0,0.8);
}
#scoreboard {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0,0,0,0.8); padding: 20px;
  border: 1px solid #555; min-width: 300px;
}
.sb-row {
  display: flex; justify-content: space-between;
  padding: 4px 0; color: #ccc; font-size: 14px;
}
#respawn-countdown {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  font-size: 32px; color: #ff4444;
  text-shadow: 0 0 10px rgba(255,0,0,0.5);
}

/* ─── MP Game Over ─── */
#mp-gameover {
  position: fixed; inset: 0; display: flex;
  align-items: center; justify-content: center;
  background: rgba(0,0,0,0.85); z-index: 100;
}
#mp-winner { font-size: 28px; color: #ffd700; margin-bottom: 16px; }
#mp-scoreboard-final { color: #ccc; margin-bottom: 16px; }
#mp-scoreboard-final div { padding: 4px 0; }
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/style.css
git commit -m "feat: add multiplayer CSS styles"
```

---

## Task 13: End-to-End Integration Test

**Files:** None new — this is a manual verification task.

- [ ] **Step 1: Build client**

```bash
pnpm build
```

Expected: PASS, outputs to `dist/`

- [ ] **Step 2: Start server**

```bash
pnpm host
```

Expected: Server starts, prints HTTP + WS URLs.

- [ ] **Step 3: Test singleplayer still works**

Open `http://localhost:3000` in browser.
Click "单人游戏" → existing game should work exactly as before.

- [ ] **Step 4: Test multiplayer lobby**

Open two browser tabs to `http://localhost:3000`.
Tab 1: Enter name "Host", click "创建房间"
Tab 2: Enter name "Guest", enter IP `localhost`, click "加入房间"

Expected: Both see lobby with player list.

- [ ] **Step 5: Test game start**

Tab 1: Click "就绪", then "开始游戏"

Expected: Both tabs load the same maze, see each other as blue box models, can move and shoot.

- [ ] **Step 6: Test combat**

Player 1 shoots Player 2.

Expected: Player 2 sees damage flash, HP decreases. Kill feed shows on both screens when a kill occurs.

- [ ] **Step 7: Fix any issues found**

Address any compilation errors, runtime errors, or visual bugs found during testing.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: LAN multiplayer mode complete — PvPvE Deathmatch"
```
